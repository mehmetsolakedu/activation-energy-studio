import assert from 'node:assert/strict';
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildReviewPackagePlan,
  generateReviewPackage,
  PACKAGE_MANIFEST_NAME,
  PACKAGE_MANIFEST_SIDECAR_NAME,
  REVIEW_ARTIFACTS,
  REVIEW_PACKAGE_SCHEMA,
  REVIEW_STATE,
  SCI_CHECKLIST_ITEMS,
  sha256File,
  STRUCTURED_INPUT_TEMPLATE_NAME,
  VAL_CHECKLIST_ITEMS,
  VERDICT_TEMPLATE_NAME,
  verifyReviewPackage,
} from '../scripts/generate-scientific-review-package.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, '..');
const GENERATOR = path.resolve(
  PROJECT_ROOT,
  'scripts/generate-scientific-review-package.mjs',
);

function temporaryDirectory(t, prefix = 'ae-scientific-review-') {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function projectPath(root, portablePath) {
  return path.resolve(root, ...portablePath.split('/'));
}

function copyReviewInputs(sourceRoot, destinationRoot) {
  for (const descriptor of REVIEW_ARTIFACTS) {
    const source = projectPath(sourceRoot, descriptor.sourcePath);
    const destination = projectPath(destinationRoot, descriptor.sourcePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
}

test('review plan is deterministic, hash-locked, and explicitly unsigned', () => {
  const first = buildReviewPackagePlan(PROJECT_ROOT);
  const second = buildReviewPackagePlan(PROJECT_ROOT);

  assert.equal(first.serializedManifest, second.serializedManifest);
  assert.equal(first.manifestSha256, second.manifestSha256);
  assert.equal(first.manifest.schema, REVIEW_PACKAGE_SCHEMA);
  assert.equal(first.manifest.reviewState, REVIEW_STATE);
  assert.deepEqual(first.manifest.acceptanceGates, {
    'AC-SCI-03': 'PARTIAL_AWAITING_INDEPENDENT_REVIEW',
    'AC-VAL-05': 'PARTIAL_AWAITING_INDEPENDENT_REVIEW',
  });
  assert.equal(first.manifest.checklist.acSci03.requiredDecisions, 28);
  assert.equal(first.manifest.checklist.acVal05.requiredDecisions, 7);
  assert.equal(first.manifest.checklist.totalRequiredDecisions, 35);
  assert.equal(first.manifest.reviewerEligibility.aiAgentMaySign, false);
  assert.equal(
    first.manifest.reviewerEligibility.noFinancialOrIntellectualPropertyInterest,
    true,
  );
  assert.deepEqual(first.manifest.checklist.allowedGateDispositions, [
    'PASS',
    'FAIL',
    'REVISION_REQUIRED',
  ]);
  assert.equal(first.manifest.generation.deterministic, true);
  assert.equal(first.manifest.generation.generatedAtOmitted, true);
  assert.equal(Object.hasOwn(first.manifest, 'generatedAt'), false);

  assert.equal(first.artifacts.length, 116);
  assert.equal(
    new Set(first.artifacts.map(({ role }) => role)).size,
    first.artifacts.length,
  );
  for (const artifact of first.artifacts) {
    assert.match(artifact.sha256, /^[0-9a-f]{64}$/u, artifact.sourcePath);
    assert.equal(
      artifact.sha256,
      sha256File(projectPath(PROJECT_ROOT, artifact.sourcePath)),
      artifact.sourcePath,
    );
  }
  assert.deepEqual(
    first.artifacts
      .filter(({ role }) => role.startsWith('official_publication_'))
      .map(({ role }) => role)
      .sort(),
    [
      'official_publication_result_source',
      'official_publication_transform_source',
    ],
  );
  assert.deepEqual(
    first.artifacts
      .filter(({ role }) =>
        [
          'second_raw_dataset_acquisition_audit',
          'severity_tagged_known_issues_ledger',
        ].includes(role),
      )
      .map(({ role, sourcePath }) => ({ role, sourcePath })),
    [
      {
        role: 'second_raw_dataset_acquisition_audit',
        sourcePath: 'SECOND_RAW_DATASET_SEARCH.md',
      },
      {
        role: 'severity_tagged_known_issues_ledger',
        sourcePath: 'governance/KNOWN_ISSUES.json',
      },
    ],
  );

  const notReviewedRows = first.verdictTemplate.match(
    /\| `NOT_REVIEWED` \| \[REQUIRED\] \| \[REQUIRED\] \|/gu,
  );
  assert.equal(notReviewedRows?.length, 35);
  assert.match(first.verdictTemplate, /UNSIGNED TEMPLATE/u);
  assert.match(first.verdictTemplate, /UNSIGNED_NOT_REVIEWED/u);
  assert.match(first.verdictTemplate, /Signature \| \[REQUIRED — absent in template\]/u);
  assert.doesNotMatch(first.verdictTemplate, /\| Overall verdict \| `PASS`/u);
  assert.match(first.verdictTemplate, new RegExp(first.source.releaseHash, 'u'));
  assert.match(
    first.verdictTemplate,
    new RegExp(first.source.releaseManifestSha256, 'u'),
  );
  const structuredTemplate = JSON.parse(first.structuredInputTemplate);
  assert.equal(
    structuredTemplate.schema,
    'activation-energy-studio/scientific-review-input/v1',
  );
  assert.equal(structuredTemplate.decisions.length, 35);
  assert.equal(
    structuredTemplate.decisions.filter(
      ({ decision }) => decision === 'NOT_REVIEWED',
    ).length,
    35,
  );
  assert.equal(
    structuredTemplate.locks.releaseSha256,
    first.source.releaseHash,
  );
  assert.equal(
    structuredTemplate.locks.packageManifestSha256,
    '[COPY_FROM_PACKAGE_MANIFEST_SHA256]',
  );
  assert.equal(SCI_CHECKLIST_ITEMS.length, 7);
  assert.equal(VAL_CHECKLIST_ITEMS.length, 7);
});

test('generator creates a byte-current immutable package and checker accepts it', (t) => {
  const temporaryRoot = temporaryDirectory(t);
  const outputPath = path.join(temporaryRoot, 'review-package');
  const generated = generateReviewPackage(PROJECT_ROOT, outputPath);
  const verified = verifyReviewPackage(PROJECT_ROOT, outputPath);

  assert.equal(verified.manifestSha256, generated.manifestSha256);
  assert.equal(
    readFileSync(path.join(outputPath, PACKAGE_MANIFEST_NAME), 'utf8'),
    generated.serializedManifest,
  );
  assert.equal(
    readFileSync(path.join(outputPath, PACKAGE_MANIFEST_SIDECAR_NAME), 'utf8'),
    `${generated.manifestSha256}  ${PACKAGE_MANIFEST_NAME}\n`,
  );
  for (const artifact of generated.artifacts) {
    assert.equal(
      sha256File(projectPath(outputPath, artifact.packagePath)),
      artifact.sha256,
      artifact.packagePath,
    );
  }
});

test('checker rejects copied-artifact, unsigned-template, and file-set tampering', async (t) => {
  await t.test('copied artifact hash change', () => {
    const temporaryRoot = temporaryDirectory(t, 'ae-review-artifact-');
    const outputPath = path.join(temporaryRoot, 'review-package');
    generateReviewPackage(PROJECT_ROOT, outputPath);
    appendFileSync(
      projectPath(outputPath, 'evidence/01_SCIENTIFIC_SPEC_V1.md'),
      '\n<!-- reviewer-package tamper -->\n',
    );
    assert.throws(
      () => verifyReviewPackage(PROJECT_ROOT, outputPath),
      /REVIEW_PACKAGE_ARTIFACT_HASH_MISMATCH/u,
    );
  });

  await t.test('unsigned template changed into an apparent decision', () => {
    const temporaryRoot = temporaryDirectory(t, 'ae-review-template-');
    const outputPath = path.join(temporaryRoot, 'review-package');
    generateReviewPackage(PROJECT_ROOT, outputPath);
    const templatePath = path.join(outputPath, VERDICT_TEMPLATE_NAME);
    const changed = readFileSync(templatePath, 'utf8').replace(
      '`UNSIGNED_NOT_REVIEWED`',
      '`PASS`',
    );
    writeFileSync(templatePath, changed, 'utf8');
    assert.throws(
      () => verifyReviewPackage(PROJECT_ROOT, outputPath),
      /REVIEW_PACKAGE_GENERATED_FILE_MISMATCH/u,
    );
  });

  await t.test('structured input template changed into an apparent decision', () => {
    const temporaryRoot = temporaryDirectory(t, 'ae-review-structured-template-');
    const outputPath = path.join(temporaryRoot, 'review-package');
    generateReviewPackage(PROJECT_ROOT, outputPath);
    const templatePath = path.join(outputPath, STRUCTURED_INPUT_TEMPLATE_NAME);
    const changed = readFileSync(templatePath, 'utf8').replace(
      '"decision": "NOT_REVIEWED"',
      '"decision": "PASS"',
    );
    writeFileSync(templatePath, changed, 'utf8');
    assert.throws(
      () => verifyReviewPackage(PROJECT_ROOT, outputPath),
      /REVIEW_PACKAGE_GENERATED_FILE_MISMATCH/u,
    );
  });

  await t.test('unexpected file added to the immutable package', () => {
    const temporaryRoot = temporaryDirectory(t, 'ae-review-fileset-');
    const outputPath = path.join(temporaryRoot, 'review-package');
    generateReviewPackage(PROJECT_ROOT, outputPath);
    writeFileSync(path.join(outputPath, 'UNLOCKED_NOTE.txt'), 'not locked\n', 'utf8');
    assert.throws(
      () => verifyReviewPackage(PROJECT_ROOT, outputPath),
      /REVIEW_PACKAGE_FILE_SET_MISMATCH/u,
    );
  });
});

test('source release and nested real-data locks fail closed after source drift', async (t) => {
  await t.test('release-manifest evidence drift', () => {
    const fixtureRoot = temporaryDirectory(t, 'ae-review-source-');
    copyReviewInputs(PROJECT_ROOT, fixtureRoot);
    const outputPath = path.join(fixtureRoot, 'review-package');
    generateReviewPackage(fixtureRoot, outputPath);
    appendFileSync(
      projectPath(fixtureRoot, '01_SCIENTIFIC_SPEC_V1.md'),
      '\n<!-- source drift -->\n',
    );
    assert.throws(
      () => verifyReviewPackage(fixtureRoot, outputPath),
      /REVIEW_PACKAGE_RELEASE_MANIFEST_HASH_MISMATCH/u,
    );
  });

  await t.test('nested real-data fixture drift', () => {
    const fixtureRoot = temporaryDirectory(t, 'ae-review-real-source-');
    copyReviewInputs(PROJECT_ROOT, fixtureRoot);
    const outputPath = path.join(fixtureRoot, 'review-package');
    generateReviewPackage(fixtureRoot, outputPath);
    appendFileSync(
      projectPath(fixtureRoot, 'tests/fixtures/real/paper010_rh_reference.json'),
      '\n',
    );
    assert.throws(
      () => verifyReviewPackage(fixtureRoot, outputPath),
      /REVIEW_PACKAGE_REAL_MANIFEST_HASH_MISMATCH/u,
    );
  });
});

test('generator refuses destructive or unowned output directories', async (t) => {
  await t.test('output directory that contains a locked source', () => {
    assert.throws(
      () => generateReviewPackage(PROJECT_ROOT, path.join(PROJECT_ROOT, 'output')),
      /REVIEW_PACKAGE_OUTPUT_CONTAINS_SOURCE/u,
    );
  });

  await t.test('pre-existing directory without a package ownership marker', () => {
    const temporaryRoot = temporaryDirectory(t, 'ae-review-unowned-');
    const outputPath = path.join(temporaryRoot, 'existing-directory');
    mkdirSync(outputPath, { recursive: true });
    const sentinel = path.join(outputPath, 'DO_NOT_DELETE.txt');
    writeFileSync(sentinel, 'preserve me\n', 'utf8');
    assert.throws(
      () => generateReviewPackage(PROJECT_ROOT, outputPath),
      /REVIEW_PACKAGE_OUTPUT_NOT_OWNED/u,
    );
    assert.equal(readFileSync(sentinel, 'utf8'), 'preserve me\n');
  });
});

test('CLI generation and --check report integrity without claiming gate completion', (t) => {
  const temporaryRoot = temporaryDirectory(t, 'ae-review-cli-');
  const outputPath = path.join(temporaryRoot, 'review-package');
  const generated = spawnSync(
    process.execPath,
    [GENERATOR, '--project-root', PROJECT_ROOT, '--output', outputPath],
    { encoding: 'utf8' },
  );
  assert.equal(generated.status, 0, generated.stdout + generated.stderr);
  assert.match(
    generated.stdout,
    /TECHNICAL_OK SCIENTIFIC_REVIEW_PACKAGE_GENERATED/u,
  );
  assert.match(generated.stdout, /reviewState=UNSIGNED_AWAITING_INDEPENDENT_REVIEW/u);
  assert.match(generated.stdout, /gates=PARTIAL/u);

  const checked = spawnSync(
    process.execPath,
    [GENERATOR, '--project-root', PROJECT_ROOT, '--output', outputPath, '--check'],
    { encoding: 'utf8' },
  );
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  assert.match(
    checked.stdout,
    /TECHNICAL_OK SCIENTIFIC_REVIEW_PACKAGE_CURRENT/u,
  );
  assert.doesNotMatch(checked.stdout, /gates=PASS/u);

  const portableChecked = spawnSync(
    process.execPath,
    [
      'evidence/scripts/generate-scientific-review-package.mjs',
      '--project-root',
      'evidence',
      '--output',
      '..',
      '--check',
    ],
    { cwd: outputPath, encoding: 'utf8' },
  );
  assert.equal(
    portableChecked.status,
    0,
    portableChecked.stdout + portableChecked.stderr,
  );
  assert.match(
    portableChecked.stdout,
    /TECHNICAL_OK SCIENTIFIC_REVIEW_PACKAGE_CURRENT/u,
  );

  writeFileSync(
    path.join(outputPath, PACKAGE_MANIFEST_SIDECAR_NAME),
    `${'0'.repeat(64)}  ${PACKAGE_MANIFEST_NAME}\n`,
    'utf8',
  );
  const stale = spawnSync(
    process.execPath,
    [GENERATOR, '--project-root', PROJECT_ROOT, '--output', outputPath, '--check'],
    { encoding: 'utf8' },
  );
  assert.equal(stale.status, 1, stale.stdout + stale.stderr);
  assert.match(stale.stderr, /REVIEW_PACKAGE_MANIFEST_SIDECAR_MISMATCH/u);
});
