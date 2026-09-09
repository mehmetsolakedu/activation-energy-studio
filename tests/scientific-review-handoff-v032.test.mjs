import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import {
  ACCEPTANCE_CRITERIA_SHA256,
  CANDIDATE_FREEZE_SHA256,
  createPlan,
  expectedDecisionIds,
  RELEASE_MANIFEST_SHA256,
  RELEASE_SHA256,
  renderStatus,
  REVIEW_STATE,
  verifyOutput,
  writePackage,
} from '../scripts/build-scientific-review-handoff-v0.3.2.mjs';
import { verifyPackage } from '../scripts/verify-scientific-review-handoff-v0.3.2.mjs';
import {
  createScientificReviewEvidenceRecord,
  verifyReviewPackageForRecord,
} from '../scripts/record-scientific-review.mjs';

const PROJECT_ROOT = path.resolve('.');
const RELEASE_HTML = path.join(
  PROJECT_ROOT,
  'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html',
);
const RELEASE_MANIFEST = path.join(
  PROJECT_ROOT,
  'release/v0.3.2/MANIFEST.v0.3.2.json',
);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(file) {
  return sha256(readFileSync(file));
}

const temporaryRoot = mkdtempSync(
  path.join(tmpdir(), 'ae-scientific-review-v032-'),
);
const packageRoot = path.join(temporaryRoot, 'handoff');
const secondPackageRoot = path.join(temporaryRoot, 'handoff-second');
let plan;
let releaseHashBefore;
let releaseManifestHashBefore;

before(() => {
  releaseHashBefore = sha256File(RELEASE_HTML);
  releaseManifestHashBefore = sha256File(RELEASE_MANIFEST);
  plan = createPlan();
  writePackage(packageRoot, plan);
});

after(() => {
  assert.equal(sha256File(RELEASE_HTML), releaseHashBefore);
  assert.equal(sha256File(RELEASE_MANIFEST), releaseManifestHashBefore);
  rmSync(temporaryRoot, { recursive: true, force: true });
});

test('plan binds the exact v0.3.2 candidate freeze and keeps both gates external-open', () => {
  assert.equal(releaseHashBefore, RELEASE_SHA256);
  assert.equal(releaseManifestHashBefore, RELEASE_MANIFEST_SHA256);
  assert.equal(plan.manifest.packageVersion, '0.3.2');
  assert.equal(plan.manifest.reviewState, REVIEW_STATE);
  assert.equal(plan.manifest.externalEvidenceComplete, false);
  assert.equal(
    plan.manifest.lockedRelease.candidateFreezeSha256,
    CANDIDATE_FREEZE_SHA256,
  );
  assert.equal(
    plan.manifest.lockedRelease.acceptanceCriteriaSha256,
    ACCEPTANCE_CRITERIA_SHA256,
  );
  assert.deepEqual(plan.manifest.checklist.gateIds, [
    'AC-SCI-03',
    'AC-VAL-05',
  ]);
  assert.deepEqual(Object.values(plan.manifest.acceptanceGates), [
    'EXTERNAL_OPEN_AWAITING_INDEPENDENT_REVIEW',
    'EXTERNAL_OPEN_AWAITING_INDEPENDENT_REVIEW',
  ]);
});

test('portable verifier and structural recorder accept the unsigned package', () => {
  const verified = verifyPackage(packageRoot);
  assert.equal(verified.reviewState, REVIEW_STATE);
  assert.equal(verified.externalEvidenceComplete, false);
  assert.equal(verified.manifestSha256, plan.manifestSha256);

  const recorderView = verifyReviewPackageForRecord(packageRoot);
  assert.equal(recorderView.packageProfile, 'V032_HARD_LOCKED');
  assert.equal(recorderView.releaseSha256, RELEASE_SHA256);
  assert.equal(
    recorderView.releaseManifestSha256,
    RELEASE_MANIFEST_SHA256,
  );
  assert.equal(recorderView.manifestSha256, plan.manifestSha256);
});

test('unsigned input contains exactly 35 NOT_REVIEWED decisions', () => {
  const template = JSON.parse(
    readFileSync(
      path.join(packageRoot, 'SCIENTIFIC_REVIEW_INPUT_TEMPLATE.json'),
      'utf8',
    ),
  );
  assert.deepEqual(
    template.decisions.map(({ id }) => id),
    expectedDecisionIds(),
  );
  assert.ok(
    template.decisions.every(({ decision }) => decision === 'NOT_REVIEWED'),
  );
  assert.equal(template.verdict.overallVerdict, 'NOT_REVIEWED');
  assert.equal(
    template.locks.packageManifestSha256,
    '[COPY_FROM_PACKAGE_MANIFEST_SHA256]',
  );
  assert.ok(
    Object.values(template.reviewer.declarations).every(
      (value) => value === null,
    ),
  );

  const copiedInput = path.join(temporaryRoot, 'unsigned-review-input.json');
  copyFileSync(
    path.join(packageRoot, 'SCIENTIFIC_REVIEW_INPUT_TEMPLATE.json'),
    copiedInput,
  );
  assert.throws(
    () =>
      createScientificReviewEvidenceRecord({
        packageRoot,
        inputPath: copiedInput,
      }),
    /SCIENTIFIC_REVIEW_PLACEHOLDER/u,
  );
});

test('package generation is byte-deterministic for the same source locks', () => {
  const secondPlan = createPlan();
  assert.equal(secondPlan.serializedManifest, plan.serializedManifest);
  assert.equal(secondPlan.manifestSidecar, plan.manifestSidecar);
  writePackage(secondPackageRoot, secondPlan);
  assert.deepEqual(
    readFileSync(path.join(secondPackageRoot, 'PACKAGE_MANIFEST.json')),
    readFileSync(path.join(packageRoot, 'PACKAGE_MANIFEST.json')),
  );
  assert.deepEqual(
    readFileSync(path.join(secondPackageRoot, 'PACKAGE_MANIFEST.sha256')),
    readFileSync(path.join(packageRoot, 'PACKAGE_MANIFEST.sha256')),
  );
  verifyOutput(secondPackageRoot, plan);
});

test('portable verifier fails closed after package tampering', () => {
  const target = path.join(packageRoot, 'REVIEW_CASES.json');
  const original = readFileSync(target);
  writeFileSync(target, Buffer.concat([original, Buffer.from('\n')]));
  assert.throws(
    () => verifyPackage(packageRoot),
    /SCIENTIFIC_REVIEW_ENTRY_INTEGRITY_MISMATCH/u,
  );
  writeFileSync(target, original);
  verifyPackage(packageRoot);
});

test('recorder rejects a self-consistent rehashed candidate substitution', () => {
  const releasePath = path.join(
    packageRoot,
    'evidence/project/release/v0.3.2/Activation-Energy-Studio-v0.3.2.html',
  );
  const manifestPath = path.join(packageRoot, 'PACKAGE_MANIFEST.json');
  const sidecarPath = path.join(packageRoot, 'PACKAGE_MANIFEST.sha256');
  const originalRelease = readFileSync(releasePath);
  const originalManifest = readFileSync(manifestPath);
  const originalSidecar = readFileSync(sidecarPath);

  try {
    const substitutedRelease = Buffer.concat([
      originalRelease,
      Buffer.from('\n<!-- adversarial candidate substitution -->\n'),
    ]);
    writeFileSync(releasePath, substitutedRelease);
    const substitutedReleaseHash = sha256(substitutedRelease);

    const manifest = JSON.parse(originalManifest);
    const releaseEntry = manifest.artifacts.find(
      ({ role }) => role === 'release_html',
    );
    releaseEntry.bytes = substitutedRelease.byteLength;
    releaseEntry.sha256 = substitutedReleaseHash;
    manifest.lockedRelease.sha256 = substitutedReleaseHash;
    const substitutedManifest = Buffer.from(
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    writeFileSync(manifestPath, substitutedManifest);
    writeFileSync(
      sidecarPath,
      `${sha256(substitutedManifest)}  PACKAGE_MANIFEST.json\n`,
    );

    assert.throws(
      () => verifyReviewPackageForRecord(packageRoot),
      /SCIENTIFIC_REVIEW_V032_LOCK_MISMATCH/u,
    );
    assert.throws(
      () => verifyPackage(packageRoot),
      /SCIENTIFIC_REVIEW_RELEASE_LOCK_MISMATCH/u,
    );

    manifest.packageVersion = '0.2.0';
    const downgradedManifest = Buffer.from(
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    writeFileSync(manifestPath, downgradedManifest);
    writeFileSync(
      sidecarPath,
      `${sha256(downgradedManifest)}  PACKAGE_MANIFEST.json\n`,
    );
    assert.throws(
      () => verifyReviewPackageForRecord(packageRoot),
      /SCIENTIFIC_REVIEW_UNSUPPORTED_PACKAGE_PROFILE/u,
    );
  } finally {
    writeFileSync(releasePath, originalRelease);
    writeFileSync(manifestPath, originalManifest);
    writeFileSync(sidecarPath, originalSidecar);
  }

  verifyReviewPackageForRecord(packageRoot);
  verifyPackage(packageRoot);
});

test('machine-readable lane status is concise and cannot imply external completion', () => {
  const status = JSON.parse(renderStatus(packageRoot, plan));
  assert.equal(
    status.schemaVersion,
    'activation-energy-studio/independent-scientific-review-lane-status/v1',
  );
  assert.deepEqual(status.gateIds, ['AC-SCI-03', 'AC-VAL-05']);
  assert.equal(status.candidateSha256, RELEASE_SHA256);
  assert.equal(status.packageArtifacts.packageManifest.sha256, plan.manifestSha256);
  assert.equal(status.technicalReadiness.packageIntegrityVerified, true);
  assert.equal(status.externalEvidenceComplete, false);
  assert.deepEqual(status.gateStatus, {
    'AC-SCI-03': 'EXTERNAL_OPEN',
    'AC-VAL-05': 'EXTERNAL_OPEN',
  });
});
