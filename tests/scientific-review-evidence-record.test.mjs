import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createScientificReviewEvidenceRecord,
  EXPECTED_DECISION_IDS,
  HUMAN_AUTHENTICITY_BOUNDARY,
  REVIEW_EVIDENCE_SCHEMA,
  REVIEW_INPUT_SCHEMA,
  REVIEW_RECORD_STATE,
  serializeScientificReviewEvidenceRecord,
  writeScientificReviewEvidenceRecord,
} from '../scripts/record-scientific-review.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, '..');
const SCRIPT_PATH = path.resolve(
  PROJECT_ROOT,
  'scripts/record-scientific-review.mjs',
);

let suiteRoot;
let packageRoot;
let packagePlan;

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function write(relativeRoot, relativePath, value) {
  const filePath = path.resolve(relativeRoot, ...relativePath.split('/'));
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value);
  return filePath;
}

function fixtureDirectory() {
  return mkdtempSync(path.join(tmpdir(), 'ae-scientific-review-record-'));
}

function evidenceDescriptor(root, portablePath) {
  return {
    path: portablePath,
    sha256: sha256(path.resolve(root, ...portablePath.split('/'))),
  };
}

function makeValidInput(root) {
  write(root, 'evidence/ui.txt', 'UI screenshot evidence\n');
  write(root, 'evidence/report.pdf', 'PDF evidence bytes\n');
  write(root, 'evidence/results.csv', 'method,alpha,Ea\nKAS,0.5,150\n');
  write(root, 'evidence/results.json', '{"method":"KAS","alpha":0.5,"Ea":150}\n');
  write(root, 'signed/signed-verdict.pdf', 'independently signed verdict\n');

  const evidenceBySurface = {
    UI: evidenceDescriptor(root, 'evidence/ui.txt'),
    PDF: evidenceDescriptor(root, 'evidence/report.pdf'),
    CSV: evidenceDescriptor(root, 'evidence/results.csv'),
    JSON: evidenceDescriptor(root, 'evidence/results.json'),
    VAL: evidenceDescriptor(root, 'evidence/results.json'),
  };
  const decisions = EXPECTED_DECISION_IDS.map((id) => {
    const surface = id.startsWith('AC-SCI-03-')
      ? id.split('-')[3]
      : 'VAL';
    const item = Number(id.slice(-2));
    return {
      id,
      decision: 'PASS',
      caseId:
        id.startsWith('AC-VAL-05-')
          ? 'W2_PAPER010'
          : item === 7
            ? 'R1'
            : surface === 'PDF'
              ? 'W4'
              : 'W2',
      evidence: [evidenceBySurface[surface]],
      comment: `Observed and retained evidence for ${id}.`,
    };
  });

  return {
    schema: REVIEW_INPUT_SCHEMA,
    reviewId: 'SCI-REVIEW-v0.2.0-001',
    locks: {
      releaseSha256: packagePlan.source.releaseHash,
      releaseManifestSha256: packagePlan.source.releaseManifestSha256,
      packageManifestSha256: packagePlan.manifestSha256,
    },
    reviewer: {
      name: 'Independent Thermal Reviewer',
      affiliation: 'Independent Thermal Analysis Laboratory',
      professionalProfile: 'ORCID 0000-0002-0000-0001',
      relevantExpertise: 'Thermal analysis and solid-state reaction kinetics',
      expertiseEvidence: 'Peer-reviewed kinetic-analysis publications and current laboratory role',
      independenceStatement:
        'I did not own, author, implement, supervise, or validate this software or its fixtures.',
      conflictOfInterestStatement:
        'No financial, intellectual-property, employment, supervisory, coauthorship, or undisclosed consulting conflict.',
      declarations: {
        isHumanReviewer: true,
        hasCurrentThermalAnalysisOrSolidStateKineticsExperience: true,
        isAiAgent: false,
        implementedCalculationCore: false,
        authoredValidationFixtures: false,
        isProductOwnerOrManuscriptAuthor: false,
        hasProjectEmploymentOrSupervisoryDependency: false,
        hasRecentCoauthorshipWithProjectTeam: false,
        hasFinancialOrIntellectualPropertyInterest: false,
        hasUndisclosedPaidConsultingOrReviewInfluence: false,
        hasOtherUndisclosedConflictOfInterest: false,
      },
    },
    review: {
      startedAtUtc: '2026-07-27T08:00:00Z',
      endedAtUtc: '2026-07-27T12:00:00Z',
      environment: {
        operatingSystem: 'Ubuntu 24.04',
        browser: 'Firefox 140',
        locale: 'en-US',
      },
    },
    decisions,
    verdict: {
      gateDispositions: {
        'AC-SCI-03': 'PASS',
        'AC-VAL-05': 'PASS',
      },
      overallVerdict: 'PASS',
      signedArtifact: evidenceDescriptor(root, 'signed/signed-verdict.pdf'),
      signatureMethod: 'INSTITUTIONAL_EMAIL_ATTESTATION',
      signatureVerificationReference:
        'Institutional message retained by the human evidence custodian.',
      signatureUtc: '2026-07-27T12:15:00Z',
    },
  };
}

function writeInput(root, input, name = 'review-input.json') {
  const inputPath = path.join(root, name);
  writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`, 'utf8');
  return inputPath;
}

function createValidFixture() {
  const root = fixtureDirectory();
  const input = makeValidInput(root);
  const inputPath = writeInput(root, input);
  return { root, input, inputPath };
}

beforeAll(() => {
  suiteRoot = fixtureDirectory();
  // This recorder contract belongs to the immutable v0.2 review package.
  // Do not regenerate it from the active v0.3 source tree.
  packageRoot = path.resolve(
    PROJECT_ROOT,
    'output/independent-scientific-review-v0.2.0',
  );
  const manifestPath = path.resolve(packageRoot, 'PACKAGE_MANIFEST.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  packagePlan = {
    source: {
      releaseHash: manifest.lockedRelease.sha256,
      releaseManifestSha256: manifest.lockedRelease.releaseManifestSha256,
    },
    manifestSha256: sha256(manifestPath),
  };
});

afterAll(() => {
  rmSync(suiteRoot, { recursive: true, force: true });
});

describe('scientific review evidence recorder', () => {
  it('validates exact 35 decisions and derives the two gate dispositions separately', () => {
    const fixture = createValidFixture();
    const first = createScientificReviewEvidenceRecord({
      packageRoot,
      inputPath: fixture.inputPath,
    });
    const second = createScientificReviewEvidenceRecord({
      packageRoot,
      inputPath: fixture.inputPath,
    });

    expect(first).toEqual(second);
    expect(first.schema).toBe(REVIEW_EVIDENCE_SCHEMA);
    expect(first.recordState).toBe(REVIEW_RECORD_STATE);
    expect(first.decisions.map(({ id }) => id)).toEqual(EXPECTED_DECISION_IDS);
    expect(first.gateDispositions['AC-SCI-03']).toMatchObject({
      requiredDecisions: 28,
      passCount: 28,
      failCount: 0,
      binaryDisposition: 'PASS',
      reviewerDisposition: 'PASS',
    });
    expect(first.gateDispositions['AC-VAL-05']).toMatchObject({
      requiredDecisions: 7,
      passCount: 7,
      failCount: 0,
      binaryDisposition: 'PASS',
      reviewerDisposition: 'PASS',
    });
    expect(first.signedVerdict.authenticityStatus).toBe(
      'NOT_VERIFIED_BY_SOFTWARE',
    );
    expect(first.acceptanceGateClosure).toBe('NOT_AUTOMATICALLY_APPLIED');
    expect(first.humanAuthenticityBoundary).toBe(HUMAN_AUTHENTICITY_BOUNDARY);
    expect(serializeScientificReviewEvidenceRecord(first)).toBe(
      serializeScientificReviewEvidenceRecord(second),
    );
  });

  it('retains different non-PASS dispositions for the two gates', () => {
    const fixture = createValidFixture();
    fixture.input.decisions[0].decision = 'FAIL';
    fixture.input.decisions.at(-1).decision = 'FAIL';
    fixture.input.verdict.gateDispositions['AC-SCI-03'] = 'REVISION_REQUIRED';
    fixture.input.verdict.gateDispositions['AC-VAL-05'] = 'FAIL';
    fixture.input.verdict.overallVerdict = 'REVISION_REQUIRED';
    writeInput(fixture.root, fixture.input);

    const record = createScientificReviewEvidenceRecord({
      packageRoot,
      inputPath: fixture.inputPath,
    });
    expect(record.gateDispositions['AC-SCI-03']).toMatchObject({
      binaryDisposition: 'FAIL',
      reviewerDisposition: 'REVISION_REQUIRED',
    });
    expect(record.gateDispositions['AC-VAL-05']).toMatchObject({
      binaryDisposition: 'FAIL',
      reviewerDisposition: 'FAIL',
    });
    expect(record.overallVerdict).toBe('REVISION_REQUIRED');
  });

  it('writes a deterministic evidence record through the CLI without claiming authenticity', () => {
    const fixture = createValidFixture();
    const outputPath = path.join(fixture.root, 'out', 'evidence-record.json');
    const direct = writeScientificReviewEvidenceRecord({
      packageRoot,
      inputPath: fixture.inputPath,
      outputPath,
    });
    expect(sha256(outputPath)).toBe(direct.sha256);

    const cliOutputPath = path.join(
      fixture.root,
      'out',
      'cli-evidence-record.json',
    );
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        '--package',
        packageRoot,
        '--input',
        fixture.inputPath,
        '--output',
        cliOutputPath,
      ],
      { encoding: 'utf8' },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      'TECHNICAL_OK SCIENTIFIC_REVIEW_RECORD_STRUCTURALLY_VALID',
    );
    expect(result.stdout).toContain('authenticity=NOT_VERIFIED_BY_SOFTWARE');
    expect(readFileSync(cliOutputPath, 'utf8')).toBe(
      readFileSync(outputPath, 'utf8'),
    );
  });

  it.each([
    [
      'missing decision',
      (input) => input.decisions.pop(),
      /SCIENTIFIC_REVIEW_DECISION_COUNT_MISMATCH/u,
    ],
    [
      'duplicate decision ID',
      (input) => {
        input.decisions.at(-1).id = input.decisions[0].id;
      },
      /SCIENTIFIC_REVIEW_DUPLICATE_DECISION/u,
    ],
    [
      'unknown decision ID',
      (input) => {
        input.decisions.at(-1).id = 'AC-VAL-05-99';
      },
      /SCIENTIFIC_REVIEW_UNKNOWN_DECISION/u,
    ],
    [
      'NOT_REVIEWED item',
      (input) => {
        input.decisions[0].decision = 'NOT_REVIEWED';
      },
      /SCIENTIFIC_REVIEW_INVALID_DECISION/u,
    ],
    [
      'empty evidence list',
      (input) => {
        input.decisions[0].evidence = [];
      },
      /SCIENTIFIC_REVIEW_EMPTY_EVIDENCE/u,
    ],
    [
      'path traversal',
      (input) => {
        input.decisions[0].evidence[0].path = '../outside.txt';
      },
      /SCIENTIFIC_REVIEW_PATH_TRAVERSAL/u,
    ],
    [
      'evidence hash mismatch',
      (input) => {
        input.decisions[0].evidence[0].sha256 = '0'.repeat(64);
      },
      /SCIENTIFIC_REVIEW_HASH_MISMATCH/u,
    ],
    [
      'empty reviewer comment',
      (input) => {
        input.decisions[0].comment = ' ';
      },
      /SCIENTIFIC_REVIEW_EMPTY_FIELD/u,
    ],
    [
      'wrong package-manifest lock',
      (input) => {
        input.locks.packageManifestSha256 = '0'.repeat(64);
      },
      /SCIENTIFIC_REVIEW_LOCK_MISMATCH/u,
    ],
    [
      'wrong release lock',
      (input) => {
        input.locks.releaseSha256 = '0'.repeat(64);
      },
      /SCIENTIFIC_REVIEW_LOCK_MISMATCH/u,
    ],
    [
      'wrong release-manifest lock',
      (input) => {
        input.locks.releaseManifestSha256 = '0'.repeat(64);
      },
      /SCIENTIFIC_REVIEW_LOCK_MISMATCH/u,
    ],
    [
      'review end before start',
      (input) => {
        input.review.endedAtUtc = '2026-07-27T07:59:59Z';
      },
      /SCIENTIFIC_REVIEW_TIME_ORDER_INVALID/u,
    ],
    [
      'AI reviewer contradiction',
      (input) => {
        input.reviewer.declarations.isAiAgent = true;
      },
      /SCIENTIFIC_REVIEW_REVIEWER_INELIGIBLE/u,
    ],
    [
      'financial conflict contradiction',
      (input) => {
        input.reviewer.declarations.hasFinancialOrIntellectualPropertyInterest =
          true;
      },
      /SCIENTIFIC_REVIEW_REVIEWER_INELIGIBLE/u,
    ],
    [
      'signed verdict hash mismatch',
      (input) => {
        input.verdict.signedArtifact.sha256 = '0'.repeat(64);
      },
      /SCIENTIFIC_REVIEW_HASH_MISMATCH/u,
    ],
    [
      'unsupported signature method',
      (input) => {
        input.verdict.signatureMethod = 'UNVERIFIED';
      },
      /SCIENTIFIC_REVIEW_SIGNATURE_METHOD_UNSUPPORTED/u,
    ],
    [
      'signature precedes review completion',
      (input) => {
        input.verdict.signatureUtc = '2026-07-27T11:59:59Z';
      },
      /SCIENTIFIC_REVIEW_SIGNATURE_TIME_INVALID/u,
    ],
    [
      'gate PASS contradicts a failed item',
      (input) => {
        input.decisions[0].decision = 'FAIL';
      },
      /SCIENTIFIC_REVIEW_GATE_PASS_CONTRADICTION/u,
    ],
    [
      'overall PASS contradicts a revision gate',
      (input) => {
        input.decisions[0].decision = 'FAIL';
        input.verdict.gateDispositions['AC-SCI-03'] = 'REVISION_REQUIRED';
      },
      /SCIENTIFIC_REVIEW_OVERALL_PASS_CONTRADICTION/u,
    ],
  ])('fails closed on %s', (_label, mutate, expectedError) => {
    const fixture = createValidFixture();
    mutate(fixture.input);
    writeInput(fixture.root, fixture.input);
    expect(() =>
      createScientificReviewEvidenceRecord({
        packageRoot,
        inputPath: fixture.inputPath,
      }),
    ).toThrow(expectedError);
  });

  it('refuses to write a record inside the immutable package', () => {
    const fixture = createValidFixture();
    expect(() =>
      writeScientificReviewEvidenceRecord({
        packageRoot,
        inputPath: fixture.inputPath,
        outputPath: path.join(packageRoot, 'SIGNED-RECORD.json'),
      }),
    ).toThrow(/SCIENTIFIC_REVIEW_IMMUTABLE_PACKAGE_WRITE/u);
  });

  it.runIf(process.platform !== 'win32')(
    'rejects evidence symlinks that resolve outside the evidence root',
    () => {
      const fixture = createValidFixture();
      const outsideRoot = fixtureDirectory();
      const outsidePath = write(
        outsideRoot,
        'outside.txt',
        'evidence outside the retained review directory\n',
      );
      const symlinkPath = path.join(fixture.root, 'evidence', 'escape.txt');
      symlinkSync(outsidePath, symlinkPath);
      fixture.input.decisions[0].evidence = [
        {
          path: 'evidence/escape.txt',
          sha256: sha256(outsidePath),
        },
      ];
      writeInput(fixture.root, fixture.input);

      expect(() =>
        createScientificReviewEvidenceRecord({
          packageRoot,
          inputPath: fixture.inputPath,
        }),
      ).toThrow(/SCIENTIFIC_REVIEW_PATH_TRAVERSAL/u);
      rmSync(outsideRoot, { recursive: true, force: true });
    },
  );

  it.runIf(process.platform !== 'win32')(
    'rejects an outside output symlink that resolves into the immutable package',
    () => {
      const fixture = createValidFixture();
      const outsideLink = path.join(fixture.root, 'outside-looking-output');
      symlinkSync(packageRoot, outsideLink, 'dir');

      expect(() =>
        writeScientificReviewEvidenceRecord({
          packageRoot,
          inputPath: fixture.inputPath,
          outputPath: path.join(outsideLink, 'SIGNED-RECORD.json'),
        }),
      ).toThrow(/SCIENTIFIC_REVIEW_IMMUTABLE_PACKAGE_WRITE/u);
    },
  );
});
