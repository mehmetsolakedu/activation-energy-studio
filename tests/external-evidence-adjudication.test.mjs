import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';

import {
  EXTERNAL_EVIDENCE_ADJUDICATION_INPUT_SCHEMA,
  EXTERNAL_EVIDENCE_ADJUDICATION_RECORD_SCHEMA,
  EXTERNAL_GATE_IDS,
  createExternalEvidenceAdjudicationRecord,
  sha256File,
  writeExternalEvidenceAdjudicationRecord,
} from '../scripts/adjudicate-external-evidence.mjs';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '..');
const SCRIPT_PATH = path.resolve(
  PROJECT_ROOT,
  'scripts/adjudicate-external-evidence.mjs',
);
const temporaryDirectories = [];

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function lock(root, relativePath) {
  return {
    path: relativePath,
    sha256: sha256File(path.resolve(root, relativePath)),
  };
}

function gateDecision(gateId) {
  return {
    gateId,
    contentDecision: 'PASS',
    authenticityDecision: 'VERIFIED',
    evidenceReference: `AUDIT-REFERENCE-${gateId}`,
    rationale: `Independent retained-evidence audit supports ${gateId}.`,
  };
}

function laneAdjudicator(lane) {
  return {
    name: `Independent ${lane} adjudicator`,
    organization: `${lane} external assurance laboratory`,
    professionalReference: `https://example.invalid/${lane}-profile`,
    isHumanAdjudicator: true,
    independentFromProject: true,
    notProjectContributor: true,
    noConflictOfInterest: true,
  };
}

function laneReview(lane) {
  return {
    startedAtUtc: '2026-07-27T10:00:00Z',
    endedAtUtc: '2026-07-27T11:00:00Z',
    signatureUtc: '2026-07-27T11:05:00Z',
    reviewReference: `${lane.toUpperCase()}-AUDIT-20260727`,
    signatureMethod: 'PGP_DETACHED_SIGNATURE',
    signatureVerificationReference:
      `Independent verification receipt for ${lane}.`,
  };
}

function makeFixture({
  openGate = null,
  failedTechnicalGate = null,
  failedContentGate = null,
} = {}) {
  const root = mkdtempSync(
    path.join(tmpdir(), 'activation-energy-closeout-'),
  );
  temporaryDirectories.push(root);
  writeFileSync(
    path.resolve(root, 'release.html'),
    '<!doctype html><title>locked release</title>',
    'utf8',
  );
  writeFileSync(
    path.resolve(root, 'acceptance.md'),
    '# Locked acceptance criteria\n',
    'utf8',
  );
  const releaseSha256 = sha256File(path.resolve(root, 'release.html'));

  const scientificRecord = {
    schema:
      'activation-energy-studio/scientific-review-evidence-record/v1',
    recordState:
      'STRUCTURALLY_VALIDATED_AWAITING_HUMAN_IDENTITY_AND_SIGNATURE_AUTHENTICITY_AUDIT',
    locks: { releaseSha256 },
    gateDispositions: {
      'AC-SCI-03': {
        reviewerDisposition:
          failedTechnicalGate === 'AC-SCI-03' ? 'FAIL' : 'PASS',
      },
      'AC-VAL-05': {
        reviewerDisposition:
          failedTechnicalGate === 'AC-VAL-05' ? 'FAIL' : 'PASS',
      },
    },
    signedVerdict: {
      authenticityStatus: 'NOT_VERIFIED_BY_SOFTWARE',
    },
    acceptanceGateClosure: 'NOT_AUTOMATICALLY_APPLIED',
  };
  writeJson(path.resolve(root, 'scientific-record.json'), scientificRecord);

  const platformSourceLocks = [];
  for (const family of ['macos', 'windows11', 'ubuntu']) {
    const relativePath = `platform-source-${family}.json`;
    writeJson(path.resolve(root, relativePath), {
      schemaVersion:
        'activation-energy-studio/platform-evidence-record/v1',
      artifacts: {
        release: {
          path: 'release.html',
          sha256: releaseSha256,
        },
      },
    });
    platformSourceLocks.push({
      ...lock(root, relativePath),
      fileName: path.basename(relativePath),
      sizeBytes: readFileSync(path.resolve(root, relativePath)).length,
    });
  }
  const platformFailed =
    failedTechnicalGate === 'AC-PLAT-01'
    || failedTechnicalGate === 'AC-PLAT-02';
  writeJson(path.resolve(root, 'platform-record.json'), {
    schemaVersion:
      'activation-energy-studio/platform-human-review-record/v1',
    recordState:
      'STRUCTURALLY_VALIDATED_REQUIRES_INDEPENDENT_AUTHENTICITY_AUDIT',
    matrixIntegrity: {
      status: 'TECHNICALLY_VERIFIED',
      sourceRecords: platformSourceLocks,
    },
    platforms: ['macos', 'windows11', 'ubuntu'].map((osFamily) => ({
      osFamily,
    })),
    reviewerMatrixDisposition: platformFailed ? 'FAIL' : 'PASS',
    eligibleForHumanGateDisposition: !platformFailed,
    acceptanceGateStatus: 'NOT_AUTOMATICALLY_APPLIED',
    authenticityStatus: 'NOT_VERIFIED_BY_SOFTWARE',
  });

  const usabilityThresholds = Object.fromEntries(
    ['AC-UX-01', 'AC-UX-02', 'AC-UX-03', 'AC-UX-04'].map((gateId) => [
      gateId,
      failedTechnicalGate === gateId ? 'FAIL' : 'PASS',
    ]),
  );
  writeJson(path.resolve(root, 'usability-record.json'), {
    schemaVersion:
      'activation-energy-studio/usability-study-evidence-record/v1',
    evidenceState:
      'AUTOMATED_THRESHOLDS_RECORDED_AWAITING_HUMAN_EVIDENCE_AUDIT',
    build: {
      path: 'release.html',
      sha256: releaseSha256,
    },
    automatedThresholds: usabilityThresholds,
    acceptanceGateStatus: 'NOT_AUTOMATICALLY_APPLIED',
    authenticityStatus: 'NOT_VERIFIED_BY_SOFTWARE',
  });

  for (const lane of ['scientific', 'platform', 'usability']) {
    writeFileSync(
      path.resolve(root, `${lane}-human-audit.txt`),
      `Completed independent ${lane} content and authenticity audit.\n`,
      'utf8',
    );
    writeFileSync(
      path.resolve(root, `${lane}-human-audit.sig`),
      `Detached signature for independent ${lane} audit.\n`,
      'utf8',
    );
  }

  const laneRecordPaths = {
    scientific: 'scientific-record.json',
    platform: 'platform-record.json',
    usability: 'usability-record.json',
  };
  const laneInput = {};
  for (const [lane, gateIds] of Object.entries({
    scientific: ['AC-SCI-03', 'AC-VAL-05'],
    platform: ['AC-PLAT-01', 'AC-PLAT-02'],
    usability: ['AC-UX-01', 'AC-UX-02', 'AC-UX-03', 'AC-UX-04'],
  })) {
    laneInput[lane] = {
      evidenceRecord: lock(root, laneRecordPaths[lane]),
      humanAudit: lock(root, `${lane}-human-audit.txt`),
      signedAudit: lock(root, `${lane}-human-audit.sig`),
      adjudicator: laneAdjudicator(lane),
      review: laneReview(lane),
      gateDecisions: gateIds.map((gateId) => {
        const decision = gateDecision(gateId);
        if (gateId === openGate) {
          decision.contentDecision = 'NOT_VERIFIED';
          decision.authenticityDecision = 'NOT_VERIFIED';
          decision.rationale =
            `Independent audit has not yet completed ${gateId}.`;
        }
        if (gateId === failedContentGate) {
          decision.contentDecision = 'FAIL';
          decision.rationale =
            `Independent audit retained a negative ${gateId} finding.`;
        }
        return decision;
      }),
    };
  }
  const input = {
    schemaVersion: EXTERNAL_EVIDENCE_ADJUDICATION_INPUT_SCHEMA,
    adjudicationId: 'external-closeout-20260727',
    release: lock(root, 'release.html'),
    acceptanceCriteria: lock(root, 'acceptance.md'),
    lanes: laneInput,
  };
  const inputPath = path.resolve(root, 'adjudication-input.json');
  writeJson(inputPath, input);
  return {
    root,
    input,
    inputPath,
    outputPath: path.resolve(root, 'adjudication-record.json'),
  };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe('external evidence adjudication recorder', () => {
  it('keeps the checked-in schema strict and the template deliberately incomplete', () => {
    const schema = JSON.parse(
      readFileSync(
        path.resolve(
          PROJECT_ROOT,
          'governance/EXTERNAL_EVIDENCE_ADJUDICATION_INPUT.schema.json',
        ),
        'utf8',
      ),
    );
    const template = JSON.parse(
      readFileSync(
        path.resolve(
          PROJECT_ROOT,
          'governance/EXTERNAL_EVIDENCE_ADJUDICATION_INPUT_TEMPLATE.json',
        ),
        'utf8',
      ),
    );
    const ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      validateFormats: false,
    });
    const validate = ajv.compile(schema);
    assert.equal(validate(template), false);
    assert.ok(validate.errors.length > 0);

    const fixture = makeFixture();
    assert.equal(validate(fixture.input), true, JSON.stringify(validate.errors));
  });

  it('records exactly eight human-adjudicated pass candidates without applying gates', () => {
    const fixture = makeFixture();
    const record = createExternalEvidenceAdjudicationRecord({
      inputPath: fixture.inputPath,
    });
    assert.equal(
      record.schemaVersion,
      EXTERNAL_EVIDENCE_ADJUDICATION_RECORD_SCHEMA,
    );
    assert.deepEqual(
      record.gateDispositions.map((item) => item.gateId),
      EXTERNAL_GATE_IDS,
    );
    assert.equal(record.summary.gateCount, 8);
    assert.equal(
      record.summary.dispositionCounts.HUMAN_ADJUDICATED_PASS,
      8,
    );
    assert.equal(record.summary.dispositionCounts.FAIL, 0);
    assert.equal(record.summary.dispositionCounts.REMAINS_OPEN, 0);
    assert.equal(record.summary.allEightHumanAdjudicatedPass, true);
    assert.equal(record.softwareAuthenticatedIdentity, false);
    assert.equal(record.acceptanceGatesAutomaticallyApplied, false);
    assert.equal(record.validatedMvp, false);
  });

  it('retains an unverified gate as REMAINS_OPEN', () => {
    const fixture = makeFixture({ openGate: 'AC-UX-04' });
    const record = createExternalEvidenceAdjudicationRecord({
      inputPath: fixture.inputPath,
    });
    assert.equal(
      record.gateDispositions.find(
        (item) => item.gateId === 'AC-UX-04',
      ).closureDisposition,
      'REMAINS_OPEN',
    );
    assert.equal(record.summary.dispositionCounts.REMAINS_OPEN, 1);
    assert.equal(record.summary.allEightHumanAdjudicatedPass, false);
  });

  it('retains negative technical or human evidence as FAIL', () => {
    const technical = makeFixture({
      failedTechnicalGate: 'AC-SCI-03',
    });
    const technicalRecord = createExternalEvidenceAdjudicationRecord({
      inputPath: technical.inputPath,
    });
    assert.equal(
      technicalRecord.gateDispositions.find(
        (item) => item.gateId === 'AC-SCI-03',
      ).closureDisposition,
      'FAIL',
    );

    const content = makeFixture({
      failedContentGate: 'AC-PLAT-02',
    });
    const contentRecord = createExternalEvidenceAdjudicationRecord({
      inputPath: content.inputPath,
    });
    assert.equal(
      contentRecord.gateDispositions.find(
        (item) => item.gateId === 'AC-PLAT-02',
      ).closureDisposition,
      'FAIL',
    );
  });

  it('rejects a hash-tampered audit artifact before writing output', () => {
    const fixture = makeFixture();
    writeFileSync(
      path.resolve(fixture.root, 'scientific-human-audit.txt'),
      'tampered\n',
      'utf8',
    );
    assert.throws(
      () =>
        writeExternalEvidenceAdjudicationRecord({
          inputPath: fixture.inputPath,
          outputPath: fixture.outputPath,
        }),
      /CLOSEOUT_HASH_MISMATCH/u,
    );
    assert.equal(
      (() => {
        try {
          readFileSync(fixture.outputPath);
          return true;
        } catch {
          return false;
        }
      })(),
      false,
    );
  });

  it('rejects path traversal and a wrong lane schema', () => {
    const traversal = makeFixture();
    traversal.input.lanes.platform.humanAudit.path = '../escape.txt';
    writeJson(traversal.inputPath, traversal.input);
    assert.throws(
      () =>
        createExternalEvidenceAdjudicationRecord({
          inputPath: traversal.inputPath,
        }),
      /CLOSEOUT_PATH_TRAVERSAL/u,
    );

    const wrongSchema = makeFixture();
    const recordPath = path.resolve(
      wrongSchema.root,
      'usability-record.json',
    );
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    record.schemaVersion = 'wrong/schema';
    writeJson(recordPath, record);
    wrongSchema.input.lanes.usability.evidenceRecord =
      lock(wrongSchema.root, 'usability-record.json');
    writeJson(wrongSchema.inputPath, wrongSchema.input);
    assert.throws(
      () =>
        createExternalEvidenceAdjudicationRecord({
          inputPath: wrongSchema.inputPath,
        }),
      /CLOSEOUT_LANE_CONTRACT_MISMATCH/u,
    );
  });

  it('rejects duplicate, missing, or unknown gate IDs', () => {
    const fixture = makeFixture();
    fixture.input.lanes.scientific.gateDecisions[1].gateId =
      'AC-SCI-03';
    writeJson(fixture.inputPath, fixture.input);
    assert.throws(
      () =>
        createExternalEvidenceAdjudicationRecord({
          inputPath: fixture.inputPath,
        }),
      /CLOSEOUT_GATE_SET_INVALID/u,
    );
  });

  it('rejects reused audit bytes across independent lanes', () => {
    const fixture = makeFixture();
    const duplicatedBytes = readFileSync(
      path.resolve(fixture.root, 'scientific-human-audit.txt'),
    );
    writeFileSync(
      path.resolve(fixture.root, 'platform-human-audit.txt'),
      duplicatedBytes,
    );
    fixture.input.lanes.platform.humanAudit =
      lock(fixture.root, 'platform-human-audit.txt');
    writeJson(fixture.inputPath, fixture.input);
    assert.throws(
      () =>
        createExternalEvidenceAdjudicationRecord({
          inputPath: fixture.inputPath,
        }),
      /CLOSEOUT_DUPLICATE_ARTIFACT/u,
    );
  });

  it('rejects a cross-lane release mismatch and an ineligible adjudicator', () => {
    const mismatch = makeFixture();
    const sourcePath = path.resolve(
      mismatch.root,
      'platform-source-macos.json',
    );
    const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
    source.artifacts.release.sha256 = '0'.repeat(64);
    writeJson(sourcePath, source);
    const platformPath = path.resolve(
      mismatch.root,
      'platform-record.json',
    );
    const platform = JSON.parse(readFileSync(platformPath, 'utf8'));
    platform.matrixIntegrity.sourceRecords[0] = {
      ...lock(mismatch.root, 'platform-source-macos.json'),
      fileName: 'platform-source-macos.json',
      sizeBytes: readFileSync(sourcePath).length,
    };
    writeJson(platformPath, platform);
    mismatch.input.lanes.platform.evidenceRecord =
      lock(mismatch.root, 'platform-record.json');
    writeJson(mismatch.inputPath, mismatch.input);
    assert.throws(
      () =>
        createExternalEvidenceAdjudicationRecord({
          inputPath: mismatch.inputPath,
        }),
      /CLOSEOUT_RELEASE_MISMATCH/u,
    );

    const ineligible = makeFixture();
    ineligible.input.lanes.scientific.adjudicator.noConflictOfInterest =
      false;
    writeJson(ineligible.inputPath, ineligible.input);
    assert.throws(
      () =>
        createExternalEvidenceAdjudicationRecord({
          inputPath: ineligible.inputPath,
        }),
      /CLOSEOUT_ADJUDICATOR_INELIGIBLE/u,
    );
  });

  it('makes --assert-all-pass fail closed and writes only a complete pass candidate', () => {
    const open = makeFixture({ openGate: 'AC-UX-01' });
    const rejectedOutput = path.resolve(open.root, 'rejected.json');
    const rejected = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        '--input',
        open.inputPath,
        '--output',
        rejectedOutput,
        '--assert-all-pass',
      ],
      { encoding: 'utf8' },
    );
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /CLOSEOUT_ASSERT_ALL_PASS_FAILED/u);

    const complete = makeFixture();
    const accepted = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        '--input',
        complete.inputPath,
        '--output',
        complete.outputPath,
        '--assert-all-pass',
      ],
      { encoding: 'utf8' },
    );
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(
      accepted.stdout,
      /TECHNICAL_OK EXTERNAL_EVIDENCE_ADJUDICATION_RECORDED/u,
    );
    assert.match(
      accepted.stdout,
      /acceptanceGatesAutomaticallyApplied=false validatedMvp=false/u,
    );
    const output = JSON.parse(readFileSync(complete.outputPath, 'utf8'));
    assert.equal(output.summary.allEightHumanAdjudicatedPass, true);
    assert.equal(output.validatedMvp, false);
  });
});
