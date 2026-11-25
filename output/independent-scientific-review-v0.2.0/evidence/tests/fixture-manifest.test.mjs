import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildFixtureManifest,
  FIXTURE_MANIFEST_RELATIVE_PATH,
  FIXTURE_MANIFEST_SCHEMA,
  FIXTURE_ROOT_RELATIVE_PATH,
  serializeFixtureManifest,
} from '../scripts/generate-fixture-manifest.mjs';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '..');
const GENERATOR = path.resolve(
  PROJECT_ROOT,
  'scripts/generate-fixture-manifest.mjs',
);
const CHECKED_IN_MANIFEST = path.resolve(
  PROJECT_ROOT,
  FIXTURE_MANIFEST_RELATIVE_PATH,
);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const temporaryDirectories = [];

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function recursivelyListRegularFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...recursivelyListRegularFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function cloneFixtureProject() {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'aes-fixture-manifest-'));
  temporaryDirectories.push(projectRoot);
  const fixtureRoot = path.resolve(projectRoot, FIXTURE_ROOT_RELATIVE_PATH);
  mkdirSync(path.dirname(fixtureRoot), { recursive: true });
  cpSync(path.resolve(PROJECT_ROOT, FIXTURE_ROOT_RELATIVE_PATH), fixtureRoot, {
    recursive: true,
  });
  return projectRoot;
}

function runGenerator(projectRoot, ...arguments_) {
  return spawnSync(
    process.execPath,
    [GENERATOR, '--project-root', projectRoot, ...arguments_],
    { encoding: 'utf8' },
  );
}

function generateTemporaryManifest(projectRoot) {
  const generated = runGenerator(projectRoot);
  assert.equal(generated.status, 0, generated.stderr);
  return path.resolve(projectRoot, FIXTURE_MANIFEST_RELATIVE_PATH);
}

test.after(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('checked-in fixture manifest is byte-current and locks every recursive fixture', () => {
  assert.equal(
    existsSync(CHECKED_IN_MANIFEST),
    true,
    `Missing ${FIXTURE_MANIFEST_RELATIVE_PATH}`,
  );

  const expected = buildFixtureManifest(PROJECT_ROOT);
  const retainedBytes = readFileSync(CHECKED_IN_MANIFEST, 'utf8');
  assert.equal(retainedBytes, serializeFixtureManifest(expected));

  const retained = JSON.parse(retainedBytes);
  assert.equal(retained.schema, FIXTURE_MANIFEST_SCHEMA);
  assert.equal(retained.fixtureRoot, FIXTURE_ROOT_RELATIVE_PATH);
  assert.equal(retained.hashAlgorithm, 'sha256');
  assert.equal(retained.generation.deterministic, true);
  assert.equal(retained.generation.generatedAtOmitted, true);
  assert.equal(retained.generation.recursive, true);
  assert.equal(retained.generation.manifestSelfExcluded, true);

  const fixtureFiles = recursivelyListRegularFiles(
    path.resolve(PROJECT_ROOT, FIXTURE_ROOT_RELATIVE_PATH),
  );
  assert.equal(retained.summary.fixtureCount, fixtureFiles.length);
  assert.equal(retained.fixtures.length, fixtureFiles.length);
  assert.equal(
    retained.summary.totalBytes,
    fixtureFiles.reduce((sum, filePath) => sum + statSync(filePath).size, 0),
  );

  const paths = retained.fixtures.map((fixture) => fixture.path);
  assert.deepEqual(paths, [...paths].sort());
  assert.equal(new Set(paths).size, paths.length);
  for (const fixture of retained.fixtures) {
    assert.match(fixture.path, /^tests\/fixtures\//);
    assert.equal(fixture.path.includes('\\'), false);
    assert.match(fixture.sha256, SHA256_PATTERN);
    const fixturePath = path.resolve(PROJECT_ROOT, fixture.path);
    assert.equal(fixture.bytes, statSync(fixturePath).size, fixture.path);
    assert.equal(fixture.sha256, sha256(fixturePath), fixture.path);
  }
});

test('generator is deterministic and --check accepts only exact current bytes', () => {
  const projectRoot = cloneFixtureProject();
  const outputPath = generateTemporaryManifest(projectRoot);
  const first = readFileSync(outputPath, 'utf8');

  const regenerated = runGenerator(projectRoot);
  assert.equal(regenerated.status, 0, regenerated.stderr);
  const second = readFileSync(outputPath, 'utf8');
  assert.equal(second, first);

  const current = runGenerator(projectRoot, '--check');
  assert.equal(current.status, 0, current.stderr);
  assert.match(current.stdout, /PASS FIXTURE_MANIFEST_CURRENT/);

  writeFileSync(outputPath, `${first}\n`);
  const reformatted = runGenerator(projectRoot, '--check');
  assert.equal(reformatted.status, 1);
  assert.match(reformatted.stderr, /metadata or byte formatting differs/);
});

test('--check fails closed when a retained fixture is tampered', () => {
  const projectRoot = cloneFixtureProject();
  generateTemporaryManifest(projectRoot);
  appendFileSync(
    path.resolve(projectRoot, 'tests/fixtures/bare_ambiguous.csv'),
    '\nfixture-tamper',
  );

  const result = runGenerator(projectRoot, '--check');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /changed fixture\(s\): tests\/fixtures\/bare_ambiguous\.csv/);
});

test('--check fails closed when an untracked fixture is added', () => {
  const projectRoot = cloneFixtureProject();
  generateTemporaryManifest(projectRoot);
  writeFileSync(
    path.resolve(projectRoot, 'tests/fixtures/new-untracked-input.csv'),
    'temperature,alpha\n300,0.1\n',
  );

  const result = runGenerator(projectRoot, '--check');
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /untracked fixture\(s\): tests\/fixtures\/new-untracked-input\.csv/,
  );
});

test('--check fails closed when a retained fixture is missing', () => {
  const projectRoot = cloneFixtureProject();
  generateTemporaryManifest(projectRoot);
  unlinkSync(path.resolve(projectRoot, 'tests/fixtures/peak_table.tsv'));

  const result = runGenerator(projectRoot, '--check');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing fixture\(s\): tests\/fixtures\/peak_table\.tsv/);
});

test('the selected manifest output is excluded if it is placed inside tests/fixtures', () => {
  const projectRoot = cloneFixtureProject();
  const outputPath = path.resolve(
    projectRoot,
    'tests/fixtures/FIXTURE_MANIFEST.json',
  );
  const generated = runGenerator(projectRoot, '--output', outputPath);
  assert.equal(generated.status, 0, generated.stderr);

  const retained = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.equal(
    retained.fixtures.some(
      (fixture) => fixture.path === 'tests/fixtures/FIXTURE_MANIFEST.json',
    ),
    false,
  );

  const current = runGenerator(
    projectRoot,
    '--check',
    '--output',
    outputPath,
  );
  assert.equal(current.status, 0, current.stderr);
});

test('a manifest copied into the fixture tree is locked unless it is the selected output', () => {
  const projectRoot = cloneFixtureProject();
  const unrelatedManifest = path.resolve(
    projectRoot,
    'tests/fixtures/copied-manifest.json',
  );
  copyFileSync(
    path.resolve(PROJECT_ROOT, 'tests/fixtures/real/manifest.json'),
    unrelatedManifest,
  );

  const outputPath = generateTemporaryManifest(projectRoot);
  const retained = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.equal(
    retained.fixtures.some(
      (fixture) => fixture.path === 'tests/fixtures/copied-manifest.json',
    ),
    true,
  );
});
