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
  symlinkSync,
  writeFileSync,
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
import { verifyProductionSbom } from '../scripts/verify-production-sbom.mjs';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '..');
const VERIFIER = path.resolve(
  PROJECT_ROOT,
  'scripts/verify-release-package.mjs',
);
const CURRENT_RELEASE = Object.freeze({
  manifestPath: 'release/v0.4.0/MANIFEST.v0.4.0.json',
  checksumPath: 'release/v0.4.0/SHA256SUMS.v0.4.0.txt',
  expectedVersion: '0.4.0',
});
const HISTORICAL_V032_RELEASE = Object.freeze({
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
    'd7a12f61b7642780d851a234f1c5b5f76e1e6a243a6ef16f4bac3df8ae630e09',
  checksum:
    '2f85346dcfa6543bdb45374194063a7f04ac4b86264e462bc0093bb514b8ed5a',
  artifact:
    '5835a87ce4c8526158b15ed3350428cc17455455ebcc9993e6d6cf8b3cc6157e',
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
  v032Manifest:
    '418d1f6e4d8693e112d65861526ef54432d625a2f6e9022ef040ff4acb7f760c',
  v032Checksum:
    '69d3b8dbf5e187959858611e95e786c2ae4a8155626abad756ba711a6cf9e4f0',
  v032Artifact:
    '4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8',
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

test('checked-in v0.4.0 candidate manifest and checksum bind the complete package', () => {
  const result = verifyReleasePackage({
    projectRoot: PROJECT_ROOT,
    ...CURRENT_RELEASE,
  });
  assert.equal(result.version, '0.4.0');
  assert.equal(result.manifestFileCount, 52);
  assert.equal(result.checksumEntryCount, 53);
  assert.equal(
    result.artifactPath,
    'release/v0.4.0/Activation-Energy-Studio-v0.4.0.html',
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
  assert.match(cli.stdout, /PASS RELEASE_PACKAGE_CURRENT v0\.4\.0/u);
  assert.match(cli.stdout, /MANIFEST_FILES 52/u);
  assert.match(cli.stdout, /CHECKSUM_ENTRIES 53/u);
});

test('read-only verifier rejects a tampered v0.4.0 artifact without rewriting locks', () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'ae-release-check-'));
  temporaryDirectories.push(temporaryRoot);
  const sourceReleaseDirectory = path.resolve(
    PROJECT_ROOT,
    'release/v0.4.0',
  );
  const temporaryReleaseDirectory = path.resolve(
    temporaryRoot,
    'release/v0.4.0',
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
      'Activation-Energy-Studio-v0.4.0.html',
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

test('read-only verifier rejects a package file omitted from manifest and checksums', () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'ae-release-extra-'));
  temporaryDirectories.push(temporaryRoot);
  const temporaryReleaseDirectory = path.resolve(
    temporaryRoot,
    'release/v0.4.0',
  );
  mkdirSync(path.dirname(temporaryReleaseDirectory), { recursive: true });
  cpSync(
    path.resolve(PROJECT_ROOT, 'release/v0.4.0'),
    temporaryReleaseDirectory,
    { recursive: true },
  );
  writeFileSync(
    path.resolve(temporaryReleaseDirectory, 'UNLISTED.txt'),
    'payload not bound by the release manifest\n',
    'utf8',
  );

  assert.throws(
    () => verifyReleasePackage({
      projectRoot: temporaryRoot,
      ...CURRENT_RELEASE,
    }),
    /Release package path set mismatch.*UNLISTED\.txt/u,
  );
  const cli = runVerifier(temporaryRoot, CURRENT_RELEASE);
  assert.equal(cli.status, 1, cli.stdout + cli.stderr);
  assert.match(cli.stderr, /FAIL RELEASE_PACKAGE_INTEGRITY/u);
  assert.match(cli.stderr, /UNLISTED\.txt/u);
});

test('read-only verifier rejects symbolic links anywhere in the package tree', () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'ae-release-link-'));
  temporaryDirectories.push(temporaryRoot);
  const temporaryReleaseDirectory = path.resolve(
    temporaryRoot,
    'release/v0.4.0',
  );
  mkdirSync(path.dirname(temporaryReleaseDirectory), { recursive: true });
  cpSync(
    path.resolve(PROJECT_ROOT, 'release/v0.4.0'),
    temporaryReleaseDirectory,
    { recursive: true },
  );
  symlinkSync(
    'README.md',
    path.resolve(temporaryReleaseDirectory, 'UNLISTED-LINK.txt'),
  );

  assert.throws(
    () => verifyReleasePackage({
      projectRoot: temporaryRoot,
      ...CURRENT_RELEASE,
    }),
    /Release package contains a symbolic link: UNLISTED-LINK\.txt/u,
  );
});

test('packager SBOM gate rejects stale lockfile provenance', () => {
  const current = verifyProductionSbom({ projectRoot: PROJECT_ROOT });
  assert.equal(current.version, '0.4.0');
  assert.ok(current.componentCount > 0);

  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'ae-sbom-stale-'));
  temporaryDirectories.push(temporaryRoot);
  mkdirSync(path.resolve(temporaryRoot, 'release/v0.4.0'), { recursive: true });
  cpSync(
    path.resolve(PROJECT_ROOT, 'package.json'),
    path.resolve(temporaryRoot, 'package.json'),
  );
  cpSync(
    path.resolve(PROJECT_ROOT, 'package-lock.json'),
    path.resolve(temporaryRoot, 'package-lock.json'),
  );
  const sbom = JSON.parse(readFileSync(
    path.resolve(PROJECT_ROOT, 'release/v0.4.0/SBOM.production.cdx.json'),
    'utf8',
  ));
  const lockHash = sbom.metadata.component.properties.find(
    (property) =>
      property.name === 'activation-energy-studio:package-lock-sha256',
  );
  lockHash.value = '0'.repeat(64);
  writeFileSync(
    path.resolve(temporaryRoot, 'release/v0.4.0/SBOM.production.cdx.json'),
    `${JSON.stringify(sbom, null, 2)}\n`,
    'utf8',
  );

  assert.throws(
    () => verifyProductionSbom({ projectRoot: temporaryRoot }),
    /SBOM package-lock SHA-256 mismatch/u,
  );
});

test('candidate manifest, schema, runtime, and normative equations share canonical identities and units', () => {
  const manifest = JSON.parse(readFileSync(
    path.resolve(PROJECT_ROOT, CURRENT_RELEASE.manifestPath),
    'utf8',
  ));
  const schema = JSON.parse(readFileSync(
    path.resolve(PROJECT_ROOT, 'src/report/project-report.schema.json'),
    'utf8',
  ));
  const auditSource = readFileSync(
    path.resolve(PROJECT_ROOT, 'src/report/audit.ts'),
    'utf8',
  );
  const coreMatch = auditSource.match(
    /CORE_MATH_VERSION\s*=\s*'([^']+)'/u,
  );
  assert.ok(coreMatch);
  const canonicalCore = coreMatch[1];
  assert.equal(canonicalCore, 'activation-energy-core/v3');
  assert.equal(
    schema.$defs.reproducibility.properties.coreMathVersion.const,
    canonicalCore,
  );
  assert.equal(manifest.scientificMethods.scientificCore, canonicalCore);

  const rootAddendum = readFileSync(
    path.resolve(PROJECT_ROOT, '01_SCIENTIFIC_SPEC_V1_1_ADDENDUM.md'),
    'utf8',
  );
  const packagedAddendum = readFileSync(
    path.resolve(
      PROJECT_ROOT,
      'release/v0.4.0/SCIENTIFIC_SPEC_V1_1_ADDENDUM.md',
    ),
    'utf8',
  );
  assert.equal(packagedAddendum, rootAddendum);
  assert.match(rootAddendum, /`activation-energy-core\/v3`/u);
  assert.match(
    rootAddendum,
    /FWO:[\s\S]*-R\*slope\/\(1\.052\*1000\)/u,
  );
  assert.match(
    rootAddendum,
    /Starink:[\s\S]*-R\*slope\/\(1\.0008\*1000\)/u,
  );
  assert.match(rootAddendum, /R = 8\.31446261815324 J mol\^-1 K\^-1/u);
  assert.doesNotMatch(rootAddendum, /1\.0518/u);
});

test('immutable v0.3.2 package still passes and remains hash-locked', () => {
  const result = verifyReleasePackage({
    projectRoot: PROJECT_ROOT,
    ...HISTORICAL_V032_RELEASE,
  });
  assert.equal(result.version, '0.3.2');
  assert.equal(result.manifestFileCount, 14);
  assert.equal(result.checksumEntryCount, 15);
  assert.equal(result.artifactSha256, HISTORICAL_LOCKS.v032Artifact);
  assert.equal(
    sha256(path.resolve(PROJECT_ROOT, HISTORICAL_V032_RELEASE.manifestPath)),
    HISTORICAL_LOCKS.v032Manifest,
  );
  assert.equal(
    sha256(path.resolve(PROJECT_ROOT, HISTORICAL_V032_RELEASE.checksumPath)),
    HISTORICAL_LOCKS.v032Checksum,
  );

  const cli = runVerifier(PROJECT_ROOT, HISTORICAL_V032_RELEASE);
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /PASS RELEASE_PACKAGE_CURRENT v0\.3\.2/u);
});

test('retired historical v0.3.2 packager fails closed without changing bytes', () => {
  const manifestPath = path.resolve(
    PROJECT_ROOT,
    HISTORICAL_V032_RELEASE.manifestPath,
  );
  const checksumPath = path.resolve(
    PROJECT_ROOT,
    HISTORICAL_V032_RELEASE.checksumPath,
  );
  const artifactPath = path.resolve(
    PROJECT_ROOT,
    'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html',
  );
  const before = [manifestPath, checksumPath, artifactPath]
    .map((filePath) => readFileSync(filePath));
  const result = spawnSync(
    process.execPath,
    [path.resolve(PROJECT_ROOT, 'scripts/package-v0.3.2-release.mjs')],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
  );
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Historical v0\.3\.2 packaging is retired and immutable/u);
  assert.deepEqual(
    [manifestPath, checksumPath, artifactPath]
      .map((filePath) => readFileSync(filePath)),
    before,
  );
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

test('immutable v0.3.0 verifier exposes historical shared-template drift', () => {
  assert.throws(
    () => verifyReleasePackage({
      projectRoot: PROJECT_ROOT,
      ...HISTORICAL_V030_RELEASE,
    }),
    /Byte-count mismatch for release\/templates\/beta-tp\.csv/u,
  );
  const cli = runVerifier(PROJECT_ROOT, HISTORICAL_V030_RELEASE);
  assert.equal(cli.status, 1, cli.stdout + cli.stderr);
  assert.match(cli.stderr, /FAIL RELEASE_PACKAGE_INTEGRITY/u);
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
