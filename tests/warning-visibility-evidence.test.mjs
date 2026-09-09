import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_WARNING_EVIDENCE_DIRECTORY,
  WARNING_EVIDENCE_MANIFEST,
  WARNING_EVIDENCE_SIDECAR,
  WARNING_EVIDENCE_STATUS,
  WARNING_CASES,
  WarningVisibilityEvidenceError,
  verifyWarningVisibilityEvidence,
} from '../scripts/capture-warning-visibility-evidence.mjs';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '..');
const CURRENT_EVIDENCE = path.resolve(
  PROJECT_ROOT,
  DEFAULT_WARNING_EVIDENCE_DIRECTORY,
);
const CAPTURE_SCRIPT = readFileSync(
  path.resolve(PROJECT_ROOT, 'scripts/capture-warning-visibility-evidence.mjs'),
  'utf8',
);
const temporaryDirectories = [];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function cloneEvidence() {
  const temporaryRoot = mkdtempSync(
    path.join(tmpdir(), 'ae-warning-visibility-'),
  );
  temporaryDirectories.push(temporaryRoot);
  const outputDirectory = path.resolve(temporaryRoot, 'evidence');
  cpSync(CURRENT_EVIDENCE, outputDirectory, { recursive: true });
  return outputDirectory;
}

function rewriteManifest(outputDirectory, mutate) {
  const manifestPath = path.resolve(
    outputDirectory,
    WARNING_EVIDENCE_MANIFEST,
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  mutate(manifest);
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeFileSync(manifestPath, bytes);
  writeFileSync(
    path.resolve(outputDirectory, WARNING_EVIDENCE_SIDECAR),
    `${sha256(bytes)}  ${WARNING_EVIDENCE_MANIFEST}\n`,
    'utf8',
  );
}

function expectCode(code, callback) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof WarningVisibilityEvidenceError);
    assert.equal(error.code, code);
    return true;
  });
}

test.after(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('active capture defaults exclusively to the v0.3.1 English release and warning fixtures', () => {
  assert.equal(
    DEFAULT_WARNING_EVIDENCE_DIRECTORY,
    'evidence/usability/v0.3.1/warning-visibility-current',
  );
  assert.deepEqual(
    WARNING_CASES.map(({ id, fixturePath }) => ({ id, fixturePath })),
    [
      { id: 'W1', fixturePath: 'evidence/usability/v0.3.1/study_bundle/W1_three_rates.csv' },
      { id: 'W2', fixturePath: 'evidence/usability/v0.3.1/study_bundle/W2_synthetic_kas_150.csv' },
      { id: 'W3', fixturePath: 'evidence/usability/v0.3.1/study_bundle/W3_low_r2.csv' },
      { id: 'W4', fixturePath: 'evidence/usability/v0.3.1/study_bundle/W4_multistep.csv' },
    ],
  );
  assert.match(
    CAPTURE_SCRIPT,
    /release\/v0\.3\.1\/Activation-Energy-Studio-v0\.3\.1\.html/u,
  );
  assert.match(
    CAPTURE_SCRIPT,
    /evidence\/usability\/v0\.3\.1\/UX_FIXTURE_MANIFEST\.json/u,
  );
  assert.doesNotMatch(CAPTURE_SCRIPT, /v0\.2\.0/u);
});

test('controlled input automation bypasses the React value tracker and waits for the render commit', () => {
  const helper = CAPTURE_SCRIPT.match(
    /async function setInputValue[\s\S]*?\n}\n\nasync function waitForStableFile/,
  )?.[0];
  assert.ok(helper, 'setInputValue helper must remain present');
  assert.match(
    helper,
    /Object\.getOwnPropertyDescriptor\(\s*HTMLInputElement\.prototype,\s*'value'/,
  );
  assert.match(helper, /setter\.call\(element, nextValue\)/);
  assert.doesNotMatch(helper, /element\.value\s*=\s*nextValue/);
  assert.match(
    helper,
    /requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)/,
  );
});

test('checked-in real-Chrome warning evidence is current and technically complete at 8/8', () => {
  const verified = verifyWarningVisibilityEvidence({
    projectRoot: PROJECT_ROOT,
    outputDirectory: CURRENT_EVIDENCE,
  });
  assert.equal(verified.manifest.claimStatus, WARNING_EVIDENCE_STATUS);
  assert.equal(verified.manifest.studyVersion, 'UX-v0.3.1');
  assert.equal(verified.manifest.interfaceLanguage, 'en');
  assert.deepEqual(
    verified.manifest.sourceFiles.map(({ role, path: sourcePath }) => ({
      role,
      path: sourcePath,
    })),
    [
      {
        role: 'release-html',
        path: 'release/v0.3.1/Activation-Energy-Studio-v0.3.1.html',
      },
      {
        role: 'ux-fixture-manifest',
        path: 'evidence/usability/v0.3.1/UX_FIXTURE_MANIFEST.json',
      },
      ...WARNING_CASES.map(({ id, fixturePath }) => ({
        role: `fixture-${id}`,
        path: fixturePath,
      })),
    ],
  );
  assert.deepEqual(verified.manifest.matrixSummary, {
    expectedCells: 8,
    technicallyObservedCells: 8,
  });
  assert.equal(verified.artifactCount, verified.manifest.artifacts.length);
  assert.ok(verified.artifactCount >= 16);
  assert.equal(verified.manifest.humanVisualReview.status, 'NOT_PERFORMED');
  assert.equal(
    verified.manifest.humanVisualReview.platformOrUsabilityGateClosed,
    false,
  );
});

test('artifact byte tampering fails closed', () => {
  const outputDirectory = cloneEvidence();
  const screenshotPath = path.resolve(outputDirectory, 'W1/warning-card.png');
  const bytes = readFileSync(screenshotPath);
  bytes[bytes.length - 1] ^= 1;
  writeFileSync(screenshotPath, bytes);
  expectCode('ARTIFACT_HASH_MISMATCH', () =>
    verifyWarningVisibilityEvidence({
      projectRoot: PROJECT_ROOT,
      outputDirectory,
    }),
  );
});

test('a missing rendered page fails with an explicit artifact error', () => {
  const outputDirectory = cloneEvidence();
  unlinkSync(path.resolve(outputDirectory, 'W2/render/page-1.png'));
  expectCode('ARTIFACT_MISSING', () =>
    verifyWarningVisibilityEvidence({
      projectRoot: PROJECT_ROOT,
      outputDirectory,
    }),
  );
});

test('automation cannot be relabeled as human-reviewed or gate-closing evidence', () => {
  const outputDirectory = cloneEvidence();
  rewriteManifest(outputDirectory, (manifest) => {
    manifest.humanVisualReview.status = 'PASS';
    manifest.humanVisualReview.platformOrUsabilityGateClosed = true;
  });
  expectCode('HUMAN_REVIEW_BOUNDARY_INVALID', () =>
    verifyWarningVisibilityEvidence({
      projectRoot: PROJECT_ROOT,
      outputDirectory,
    }),
  );
});

test('source-descriptor tampering is detected even with a recomputed sidecar', () => {
  const outputDirectory = cloneEvidence();
  rewriteManifest(outputDirectory, (manifest) => {
    manifest.sourceFiles[0].sha256 = '0'.repeat(64);
  });
  expectCode('SOURCE_DRIFT', () =>
    verifyWarningVisibilityEvidence({
      projectRoot: PROJECT_ROOT,
      outputDirectory,
    }),
  );
});

test('matrix links cannot be redirected away from retained case artifacts', () => {
  const outputDirectory = cloneEvidence();
  rewriteManifest(outputDirectory, (manifest) => {
    manifest.matrix[0].ui.artifactPath = manifest.matrix[1].ui.artifactPath;
  });
  expectCode('WARNING_MATRIX_ARTIFACT_LINK_INVALID', () =>
    verifyWarningVisibilityEvidence({
      projectRoot: PROJECT_ROOT,
      outputDirectory,
    }),
  );
});
