import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  ALLOWED_SIGNATURE_METHODS,
  assertReleaseSignoffReadyForValidatedMvp,
  buildReleaseSignoffInputTemplate,
  createReleaseSignoffRecord,
  HUMAN_AUTHENTICITY_BOUNDARY,
  RELEASE_SIGNOFF_INPUT_SCHEMA,
  RELEASE_SIGNOFF_RECORD_SCHEMA,
  RELEASE_SIGNOFF_RECORD_STATE,
  REQUIRED_RELEASE_SIGNOFF_ROLES,
  serializeReleaseSignoffRecord,
  verifyReleaseSignoffInputTemplate,
  writeReleaseSignoffRecord,
} from '../scripts/record-release-signoff.mjs';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '..');
const SCRIPT_PATH = path.resolve(
  PROJECT_ROOT,
  'scripts/record-release-signoff.mjs',
);
const TEMPLATE_PATH = path.resolve(
  PROJECT_ROOT,
  'governance/RELEASE_SIGNOFF_INPUT_TEMPLATE.json',
);
const temporaryRoots = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function makeCase() {
  const root = mkdtempSync(path.join(tmpdir(), 'ae-release-signoff-'));
  temporaryRoots.push(root);
  const input = buildReleaseSignoffInputTemplate(PROJECT_ROOT);
  input.timeline = {
    preparedAtUtc: '2026-07-27T08:00:00Z',
    reviewStartedAtUtc: '2026-07-27T09:00:00Z',
    reviewCompletedAtUtc: '2026-07-27T12:00:00Z',
    recordedAtUtc: '2026-07-27T14:00:00Z',
  };
  mkdirSync(path.resolve(root, 'signatures'), { recursive: true });
  input.roles.forEach((roleRecord, index) => {
    const ordinal = index + 1;
    roleRecord.identity = {
      identityId: `PERSON-${ordinal}`,
      name: `Human Signer ${ordinal}`,
      affiliation: `Independent Institution ${ordinal}`,
      professionalProfile: `ORCID 0000-0002-0000-000${ordinal}`,
    };
    for (const key of Object.keys(roleRecord.declarations)) {
      roleRecord.declarations[key] = true;
    }
    roleRecord.decisions = [
      {
        id: 'SCOPE_EVIDENCE',
        decision: 'PASS',
        comment: `Reviewed the exact ${roleRecord.role} scope evidence and found it structurally complete.`,
      },
      {
        id: 'KNOWN_ISSUES',
        decision: 'ACKNOWLEDGED',
        comment: `Reviewed the locked known-issues ledger for ${roleRecord.role} without closing external gates.`,
      },
      {
        id: 'VALIDATED_MVP_RELEASE',
        decision: 'BLOCKED',
        comment: `Validated-MVP release remains blocked by the locked P0 external evidence issues.`,
      },
    ];
    const portablePath = `signatures/${roleRecord.role}.txt`;
    const absolutePath = path.resolve(root, ...portablePath.split('/'));
    writeFileSync(
      absolutePath,
      `Unique human signature artifact ${ordinal} for ${roleRecord.role}\n`,
      { encoding: 'utf8', flag: 'wx' },
    );
    roleRecord.signature = {
      artifact: {
        path: portablePath,
        sha256: sha256(absolutePath),
      },
      method: ALLOWED_SIGNATURE_METHODS[index],
      verificationReference: `Independent custodian record SIGN-${ordinal}`,
      signedAtUtc: `2026-07-27T12:${String(ordinal).padStart(2, '0')}:00Z`,
    };
  });
  const inputPath = path.resolve(root, 'release-signoff-input.json');
  writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`, 'utf8');
  return { root, input, inputPath };
}

function writeMutatedCase(mutator) {
  const fixture = makeCase();
  mutator(fixture.input, fixture);
  writeFileSync(
    fixture.inputPath,
    `${JSON.stringify(fixture.input, null, 2)}\n`,
    'utf8',
  );
  return fixture;
}

test.after(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checked-in input template is deterministic, current, and intentionally incomplete', () => {
  const verified = verifyReleaseSignoffInputTemplate({
    projectRoot: PROJECT_ROOT,
  });
  assert.equal(verified.schema, RELEASE_SIGNOFF_INPUT_SCHEMA);
  assert.deepEqual(
    verified,
    buildReleaseSignoffInputTemplate(PROJECT_ROOT),
  );
  assert.equal(
    verified.locks.p0Ledger.path,
    'evidence/governance/P0_EVIDENCE_LEDGER.v0.2.0.json',
  );
  assert.throws(
    () =>
      createReleaseSignoffRecord({
        projectRoot: PROJECT_ROOT,
        inputPath: TEMPLATE_PATH,
      }),
    /RELEASE_SIGNOFF_PLACEHOLDER/u,
  );
});

test('valid blocked five-role input produces only the structural authenticity-audit state', () => {
  const fixture = makeCase();
  const record = createReleaseSignoffRecord({
    projectRoot: PROJECT_ROOT,
    inputPath: fixture.inputPath,
  });
  assert.equal(record.schema, RELEASE_SIGNOFF_RECORD_SCHEMA);
  assert.equal(record.recordState, RELEASE_SIGNOFF_RECORD_STATE);
  assert.equal(
    record.recordState,
    'STRUCTURALLY_VALIDATED_AWAITING_HUMAN_IDENTITY_AND_SIGNATURE_AUTHENTICITY_AUDIT',
  );
  assert.equal(record.validatedMvp, false);
  assert.equal(record.validatedMvpEligible, false);
  assert.equal(record.releaseReadiness, 'BLOCKED_BY_LOCKED_KNOWN_ISSUES');
  assert.deepEqual(record.blockingKnownIssueIds, [
    'KI-PLAT-001',
    'KI-REV-001',
    'KI-UX-001',
  ]);
  assert.deepEqual(
    record.roles.map((role) => role.role),
    REQUIRED_RELEASE_SIGNOFF_ROLES,
  );
  assert.equal(record.humanAuthenticityBoundary, HUMAN_AUTHENTICITY_BOUNDARY);
  assert.match(record.humanAuthenticityBoundary, /never by itself marks a validated MVP/iu);
  assert.equal(
    serializeReleaseSignoffRecord(record),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  assert.throws(
    () => assertReleaseSignoffReadyForValidatedMvp(record),
    /RELEASE_SIGNOFF_UNRESOLVED_BLOCKING_ISSUE.*KI-PLAT-001/u,
  );
  const illegalSelfPass = clone(record);
  illegalSelfPass.validatedMvp = true;
  illegalSelfPass.validatedMvpEligible = true;
  illegalSelfPass.blockingKnownIssueIds = [];
  assert.throws(
    () => assertReleaseSignoffReadyForValidatedMvp(illegalSelfPass),
    /RELEASE_SIGNOFF_ILLEGAL_SELF_VALIDATION/u,
  );
});

test('writer records blocked structural evidence but validated-MVP assertion writes nothing', () => {
  const fixture = makeCase();
  const structuralOutput = path.resolve(fixture.root, 'record.json');
  const record = writeReleaseSignoffRecord({
    projectRoot: PROJECT_ROOT,
    inputPath: fixture.inputPath,
    outputPath: structuralOutput,
  });
  assert.equal(record.validatedMvp, false);
  assert.equal(
    readFileSync(structuralOutput, 'utf8'),
    serializeReleaseSignoffRecord(record),
  );

  const forbiddenOutput = path.resolve(fixture.root, 'validated-mvp.json');
  assert.throws(
    () =>
      writeReleaseSignoffRecord({
        projectRoot: PROJECT_ROOT,
        inputPath: fixture.inputPath,
        outputPath: forbiddenOutput,
        requireValidatedMvpRelease: true,
      }),
    /RELEASE_SIGNOFF_UNRESOLVED_BLOCKING_ISSUE/u,
  );
  assert.equal(existsSync(forbiddenOutput), false);
});

test('five exact roles and unique human identities are mandatory', () => {
  for (const [label, mutate, expected] of [
    [
      'missing role',
      (input) => input.roles.pop(),
      /RELEASE_SIGNOFF_SCHEMA_INVALID/u,
    ],
    [
      'duplicate role',
      (input) => {
        input.roles[1].role = input.roles[0].role;
      },
      /RELEASE_SIGNOFF_ROLE_SET_MISMATCH/u,
    ],
    [
      'role order',
      (input) => {
        [input.roles[0], input.roles[1]] = [input.roles[1], input.roles[0]];
      },
      /RELEASE_SIGNOFF_ROLE_SET_MISMATCH/u,
    ],
    [
      'duplicate identity ID',
      (input) => {
        input.roles[1].identity.identityId = input.roles[0].identity.identityId;
      },
      /RELEASE_SIGNOFF_DUPLICATE_IDENTITY/u,
    ],
    [
      'duplicate human name',
      (input) => {
        input.roles[1].identity.name = input.roles[0].identity.name.toUpperCase();
      },
      /RELEASE_SIGNOFF_DUPLICATE_IDENTITY/u,
    ],
    [
      'identity placeholder',
      (input) => {
        input.roles[0].identity.affiliation = '[REQUIRED_AFFILIATION]';
      },
      /RELEASE_SIGNOFF_PLACEHOLDER/u,
    ],
  ]) {
    const fixture = writeMutatedCase(mutate);
    assert.throws(
      () =>
        createReleaseSignoffRecord({
          projectRoot: PROJECT_ROOT,
          inputPath: fixture.inputPath,
        }),
      expected,
      label,
    );
  }
});

test('role-scoped declarations and exact decisions fail closed', () => {
  for (const [label, mutate, expected] of [
    [
      'false declaration',
      (input) => {
        input.roles[0].declarations.reviewedRoleScope = false;
      },
      /RELEASE_SIGNOFF_DECLARATION_FALSE/u,
    ],
    [
      'foreign declaration',
      (input) => {
        input.roles[0].declarations.reviewedIngestionMappingUnitsProvenanceAndExports =
          true;
      },
      /RELEASE_SIGNOFF_EXACT_KEYS_MISMATCH/u,
    ],
    [
      'missing decision',
      (input) => input.roles[0].decisions.pop(),
      /RELEASE_SIGNOFF_SCHEMA_INVALID/u,
    ],
    [
      'duplicate decision',
      (input) => {
        input.roles[0].decisions[1].id = 'SCOPE_EVIDENCE';
      },
      /RELEASE_SIGNOFF_DECISION_SET_MISMATCH/u,
    ],
    [
      'scope failure',
      (input) => {
        input.roles[0].decisions[0].decision = 'FAIL';
      },
      /RELEASE_SIGNOFF_SCOPE_NOT_PASSED/u,
    ],
    [
      'known issues not acknowledged',
      (input) => {
        input.roles[0].decisions[1].decision = 'FAIL';
      },
      /RELEASE_SIGNOFF_KNOWN_ISSUES_NOT_ACKNOWLEDGED/u,
    ],
    [
      'false validated-MVP PASS',
      (input) => {
        input.roles[0].decisions[2].decision = 'PASS';
      },
      /RELEASE_SIGNOFF_FALSE_PASS/u,
    ],
    [
      'placeholder comment',
      (input) => {
        input.roles[0].decisions[0].comment = '[REQUIRED_ROLE_SCOPED_COMMENT]';
      },
      /RELEASE_SIGNOFF_PLACEHOLDER/u,
    ],
  ]) {
    const fixture = writeMutatedCase(mutate);
    assert.throws(
      () =>
        createReleaseSignoffRecord({
          projectRoot: PROJECT_ROOT,
          inputPath: fixture.inputPath,
        }),
      expected,
      label,
    );
  }
});

test('all five exact authoritative locks reject stale or tampered hashes and paths', () => {
  for (const lockKey of [
    'releaseArtifact',
    'releaseManifest',
    'acceptanceCriteria',
    'p0Ledger',
    'knownIssues',
  ]) {
    const stale = writeMutatedCase((input) => {
      input.locks[lockKey].sha256 = '0'.repeat(64);
    });
    assert.throws(
      () =>
        createReleaseSignoffRecord({
          projectRoot: PROJECT_ROOT,
          inputPath: stale.inputPath,
        }),
      /RELEASE_SIGNOFF_LOCK_MISMATCH/u,
      lockKey,
    );
  }

  const wrongPath = writeMutatedCase((input) => {
    input.locks.p0Ledger.path = 'REAL_DATA_VALIDATION_STATUS.md';
  });
  assert.throws(
    () =>
      createReleaseSignoffRecord({
        projectRoot: PROJECT_ROOT,
        inputPath: wrongPath.inputPath,
      }),
    /RELEASE_SIGNOFF_LOCK_MISMATCH/u,
  );
});

test('UTC timeline and signature ordering are strict', () => {
  for (const [label, mutate, expected] of [
    [
      'placeholder timeline',
      (input) => {
        input.timeline.preparedAtUtc = '[REQUIRED_ISO_UTC]';
      },
      /RELEASE_SIGNOFF_PLACEHOLDER/u,
    ],
    [
      'non-UTC timestamp',
      (input) => {
        input.timeline.preparedAtUtc = '2026-07-27T08:00:00+03:00';
      },
      /RELEASE_SIGNOFF_TIME_INVALID/u,
    ],
    [
      'start before prepared',
      (input) => {
        input.timeline.reviewStartedAtUtc = '2026-07-27T07:59:59Z';
      },
      /RELEASE_SIGNOFF_TIME_ORDER_INVALID/u,
    ],
    [
      'completion equals start',
      (input) => {
        input.timeline.reviewCompletedAtUtc = input.timeline.reviewStartedAtUtc;
      },
      /RELEASE_SIGNOFF_TIME_ORDER_INVALID/u,
    ],
    [
      'record before completion',
      (input) => {
        input.timeline.recordedAtUtc = '2026-07-27T11:59:59Z';
      },
      /RELEASE_SIGNOFF_TIME_ORDER_INVALID/u,
    ],
    [
      'signature before completion',
      (input) => {
        input.roles[0].signature.signedAtUtc = '2026-07-27T11:59:59Z';
      },
      /RELEASE_SIGNOFF_SIGNATURE_TIME_INVALID/u,
    ],
    [
      'signature after record',
      (input) => {
        input.roles[0].signature.signedAtUtc = '2026-07-27T14:00:01Z';
      },
      /RELEASE_SIGNOFF_SIGNATURE_TIME_INVALID/u,
    ],
  ]) {
    const fixture = writeMutatedCase(mutate);
    assert.throws(
      () =>
        createReleaseSignoffRecord({
          projectRoot: PROJECT_ROOT,
          inputPath: fixture.inputPath,
        }),
      expected,
      label,
    );
  }
});

test('signature artifact, hash, method, reference, and uniqueness are enforced', () => {
  for (const [label, mutate, expected] of [
    [
      'hash mismatch',
      (input) => {
        input.roles[0].signature.artifact.sha256 = '0'.repeat(64);
      },
      /RELEASE_SIGNOFF_SIGNATURE_HASH_MISMATCH/u,
    ],
    [
      'missing artifact',
      (input) => {
        input.roles[0].signature.artifact.path = 'signatures/missing.txt';
      },
      /RELEASE_SIGNOFF_ARTIFACT_MISSING/u,
    ],
    [
      'path traversal',
      (input) => {
        input.roles[0].signature.artifact.path = '../outside.txt';
      },
      /RELEASE_SIGNOFF_PATH_TRAVERSAL/u,
    ],
    [
      'unsupported method',
      (input) => {
        input.roles[0].signature.method = 'UNVERIFIED';
      },
      /RELEASE_SIGNOFF_SCHEMA_INVALID/u,
    ],
    [
      'placeholder reference',
      (input) => {
        input.roles[0].signature.verificationReference = '[REQUIRED_REFERENCE]';
      },
      /RELEASE_SIGNOFF_PLACEHOLDER/u,
    ],
    [
      'duplicate artifact',
      (input) => {
        input.roles[1].signature.artifact = clone(
          input.roles[0].signature.artifact,
        );
      },
      /RELEASE_SIGNOFF_DUPLICATE_SIGNATURE/u,
    ],
  ]) {
    const fixture = writeMutatedCase(mutate);
    assert.throws(
      () =>
        createReleaseSignoffRecord({
          projectRoot: PROJECT_ROOT,
          inputPath: fixture.inputPath,
        }),
      expected,
      label,
    );
  }

  const symlinkFixture = makeCase();
  const outsideRoot = mkdtempSync(path.join(tmpdir(), 'ae-signature-outside-'));
  temporaryRoots.push(outsideRoot);
  const outside = path.resolve(outsideRoot, 'outside.txt');
  writeFileSync(outside, 'outside signature\n', 'utf8');
  const link = path.resolve(symlinkFixture.root, 'signatures/escape.txt');
  symlinkSync(outside, link);
  symlinkFixture.input.roles[0].signature.artifact = {
    path: 'signatures/escape.txt',
    sha256: sha256(outside),
  };
  writeFileSync(
    symlinkFixture.inputPath,
    `${JSON.stringify(symlinkFixture.input, null, 2)}\n`,
    'utf8',
  );
  assert.throws(
    () =>
      createReleaseSignoffRecord({
        projectRoot: PROJECT_ROOT,
        inputPath: symlinkFixture.inputPath,
      }),
    /RELEASE_SIGNOFF_SYMLINK_ESCAPE/u,
  );
});

test('CLI checks the template, writes only blocked structural output, and rejects validated-MVP assertion', () => {
  const checked = spawnSync(process.execPath, [SCRIPT_PATH, '--check-template'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(checked.status, 0, checked.stderr);

  const fixture = makeCase();
  const outputPath = path.resolve(fixture.root, 'cli-record.json');
  const recorded = spawnSync(
    process.execPath,
    [
      SCRIPT_PATH,
      '--input',
      fixture.inputPath,
      '--output',
      outputPath,
    ],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
  );
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.match(recorded.stdout, new RegExp(RELEASE_SIGNOFF_RECORD_STATE, 'u'));
  assert.equal(JSON.parse(readFileSync(outputPath, 'utf8')).validatedMvp, false);

  const forbiddenPath = path.resolve(fixture.root, 'cli-validated.json');
  const rejected = spawnSync(
    process.execPath,
    [
      SCRIPT_PATH,
      '--input',
      fixture.inputPath,
      '--output',
      forbiddenPath,
      '--assert-validated-mvp',
    ],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
  );
  assert.equal(rejected.status, 1);
  assert.match(
    rejected.stderr,
    /RELEASE_SIGNOFF_UNRESOLVED_BLOCKING_ISSUE/u,
  );
  assert.equal(existsSync(forbiddenPath), false);
});
