import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  RELEASE_PACKAGE_SCHEMA,
  verifyReleasePackage,
} from '../scripts/verify-release-package.mjs';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '..');
const VERIFIER = path.resolve(
  PROJECT_ROOT,
  'scripts/verify-release-package.mjs',
);
const CURRENT_RELEASE = Object.freeze({
  manifestPath: 'release/v0.3.2/MANIFEST.v0.3.2.json',
  checksumPath: 'release/v0.3.2/SHA256SUMS.v0.3.2.txt',
  expectedVersion: '0.3.2',
});
const HISTORICAL_V031_RELEASE = Object.freeze({
  manifestPath: 'release/v0.3.1/MANIFEST.v0.3.1.json',
  checksumPath: 'release/v0.3.1/SHA256SUMS.v0.3.1.txt',
  expectedVersion: '0.3.1',
});
const HISTORICAL_V030_RELEASE = Object.freeze({
  manifestPath: 'release/MANIFEST.v0.3.0.json',
  checksumPath: 'release/SHA256SUMS.v0.3.0.txt',
  expectedVersion: '0.3.0',
});
const CURRENT_LOCKS = Object.freeze({
  manifest:
    '418d1f6e4d8693e112d65861526ef54432d625a2f6e9022ef040ff4acb7f760c',
  checksum:
    '69d3b8dbf5e187959858611e95e786c2ae4a8155626abad756ba711a6cf9e4f0',
  artifact:
    '4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8',
});
const HISTORICAL_LOCKS = Object.freeze({
  v020Manifest:
    'c5af42f4d9acc6aaca507cc3037cd1a1b5be76892da78211493e5e178cac843a',
  v020Artifact:
    'ce716471586b098806007853992bed6601dfa359d53e59fe1b50c849d911dbb7',
  v030Manifest:
    '70d805e089b24ded25c16b1ab3be29d3aafa87d63c50b042f9aab96c4ed4a534',
  v030Checksum:
    'f4de21756d7682464f5b2217d25138c2688078ac640fc82b3b8e495f6e443e5e',
  v030Artifact:
    '2263d9862e9e753458ae56ce89ef73a71edef3d74b9acc625c335096d8bc840c',
  v031Manifest:
    '72056e404fc0de538c1979f847a42245ecd9046c705b5610812dad70ffd9f20c',
  v031Checksum:
    'a4c4ce64817aa35b21b27fdf960d40f81b11059e2835a12d930e4921af9c9de3',
  v031Artifact:
    'e9750c6a7cae1aafe970094567736c042512daddcd35d67e4b17ffea3bc72587',
});
const temporaryDirectories = [];

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function runVerifier(projectRoot, release) {
  return spawnSync(
    process.execPath,
    [
      VERIFIER,
      '--project-root',
      projectRoot,
      '--manifest',
      release.manifestPath,
      '--checksum',
      release.checksumPath,
      '--version',
      release.expectedVersion,
    ],
    { encoding: 'utf8' },
  );
}

test.after(() => {
  for (const temporaryDirectory of temporaryDirectories) {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test('checked-in v0.3.2 release manifest and checksum bind the complete package', () => {
  const result = verifyReleasePackage({
    projectRoot: PROJECT_ROOT,
    ...CURRENT_RELEASE,
  });
  assert.equal(result.version, '0.3.2');
  assert.equal(result.manifestFileCount, 14);
  assert.equal(result.checksumEntryCount, 15);
  assert.equal(
    result.artifactPath,
    'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html',
  );
  assert.equal(result.artifactSha256, CURRENT_LOCKS.artifact);
  assert.equal(
    sha256(path.resolve(PROJECT_ROOT, CURRENT_RELEASE.manifestPath)),
    CURRENT_LOCKS.manifest,
  );
  assert.equal(
    sha256(path.resolve(PROJECT_ROOT, CURRENT_RELEASE.checksumPath)),
    CURRENT_LOCKS.checksum,
  );

  const manifest = JSON.parse(
    readFileSync(path.resolve(PROJECT_ROOT, CURRENT_RELEASE.manifestPath), 'utf8'),
  );
  assert.equal(manifest.schema, RELEASE_PACKAGE_SCHEMA);
  assert.equal(manifest.release.bytes, result.artifactBytes);
  assert.equal(manifest.release.sha256, result.artifactSha256);

  const cli = runVerifier(PROJECT_ROOT, CURRENT_RELEASE);
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /PASS RELEASE_PACKAGE_CURRENT v0\.3\.2/u);
  assert.match(cli.stdout, /MANIFEST_FILES 14/u);
  assert.match(cli.stdout, /CHECKSUM_ENTRIES 15/u);
});

test('read-only verifier rejects a tampered v0.3.2 artifact without rewriting locks', () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'ae-release-check-'));
  temporaryDirectories.push(temporaryRoot);
  const sourceReleaseDirectory = path.resolve(
    PROJECT_ROOT,
    'release/v0.3.2',
  );
  const temporaryReleaseDirectory = path.resolve(
    temporaryRoot,
    'release/v0.3.2',
  );
  mkdirSync(path.dirname(temporaryReleaseDirectory), { recursive: true });
  cpSync(sourceReleaseDirectory, temporaryReleaseDirectory, { recursive: true });

  const temporaryManifestPath = path.resolve(
    temporaryRoot,
    CURRENT_RELEASE.manifestPath,
  );
  const temporaryChecksumPath = path.resolve(
    temporaryRoot,
    CURRENT_RELEASE.checksumPath,
  );
  const manifestBefore = readFileSync(temporaryManifestPath);
  const checksumBefore = readFileSync(temporaryChecksumPath);
  appendFileSync(
    path.resolve(
      temporaryReleaseDirectory,
      'Activation-Energy-Studio-v0.3.2.html',
    ),
    '\n<!-- integrity-test tamper -->\n',
  );

  assert.throws(
    () => verifyReleasePackage({
      projectRoot: temporaryRoot,
      ...CURRENT_RELEASE,
    }),
    /Byte-count mismatch|SHA-256 mismatch/u,
  );
  const cli = runVerifier(temporaryRoot, CURRENT_RELEASE);
  assert.equal(cli.status, 1, cli.stdout + cli.stderr);
  assert.match(cli.stderr, /FAIL RELEASE_PACKAGE_INTEGRITY/u);
  assert.deepEqual(readFileSync(temporaryManifestPath), manifestBefore);
  assert.deepEqual(readFileSync(temporaryChecksumPath), checksumBefore);
});

test('immutable v0.3.1 package still passes and remains hash-locked', () => {
  const result = verifyReleasePackage({
    projectRoot: PROJECT_ROOT,
    ...HISTORICAL_V031_RELEASE,
  });
  assert.equal(result.version, '0.3.1');
  assert.equal(result.manifestFileCount, 13);
  assert.equal(result.checksumEntryCount, 14);
  assert.equal(
    result.artifactPath,
    'release/v0.3.1/Activation-Energy-Studio-v0.3.1.html',
  );
  assert.equal(result.artifactSha256, HISTORICAL_LOCKS.v031Artifact);
  assert.equal(
    sha256(path.resolve(PROJECT_ROOT, HISTORICAL_V031_RELEASE.manifestPath)),
    HISTORICAL_LOCKS.v031Manifest,
  );
  assert.equal(
    sha256(path.resolve(PROJECT_ROOT, HISTORICAL_V031_RELEASE.checksumPath)),
    HISTORICAL_LOCKS.v031Checksum,
  );

  const cli = runVerifier(PROJECT_ROOT, HISTORICAL_V031_RELEASE);
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /PASS RELEASE_PACKAGE_CURRENT v0\.3\.1/u);
});

test('immutable v0.3.0 package still passes its original manifest and checksum', () => {
  const result = verifyReleasePackage({
    projectRoot: PROJECT_ROOT,
    ...HISTORICAL_V030_RELEASE,
  });
  assert.equal(result.version, '0.3.0');
  assert.equal(result.manifestFileCount, 14);
  assert.equal(result.checksumEntryCount, 15);
  assert.equal(
    result.artifactPath,
    'release/Activation-Energy-Studio-v0.3.0.html',
  );
  assert.equal(result.artifactSha256, HISTORICAL_LOCKS.v030Artifact);

  const cli = runVerifier(PROJECT_ROOT, HISTORICAL_V030_RELEASE);
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /PASS RELEASE_PACKAGE_CURRENT v0\.3\.0/u);
});

test('v0.2.0 and v0.3.0 historical release bytes remain hash-locked', () => {
  const v020ManifestPath = path.resolve(
    PROJECT_ROOT,
    'release/MANIFEST.v0.2.0.json',
  );
  const v020ArtifactPath = path.resolve(
    PROJECT_ROOT,
    'release/Activation-Energy-Studio-v0.2.0.html',
  );
  const v020Manifest = JSON.parse(readFileSync(v020ManifestPath, 'utf8'));
  assert.equal(sha256(v020ManifestPath), HISTORICAL_LOCKS.v020Manifest);
  assert.equal(sha256(v020ArtifactPath), HISTORICAL_LOCKS.v020Artifact);
  assert.equal(v020Manifest.release.version, '0.2.0');
  assert.equal(v020Manifest.release.sha256, HISTORICAL_LOCKS.v020Artifact);
  assert.equal(v020Manifest.release.bytes, statSync(v020ArtifactPath).size);

  assert.equal(
    sha256(path.resolve(PROJECT_ROOT, HISTORICAL_V030_RELEASE.manifestPath)),
    HISTORICAL_LOCKS.v030Manifest,
  );
  assert.equal(
    sha256(path.resolve(PROJECT_ROOT, HISTORICAL_V030_RELEASE.checksumPath)),
    HISTORICAL_LOCKS.v030Checksum,
  );
  assert.equal(
    sha256(path.resolve(
      PROJECT_ROOT,
      'release/Activation-Energy-Studio-v0.3.0.html',
    )),
    HISTORICAL_LOCKS.v030Artifact,
  );
});
