#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const RELEASE_PACKAGE_SCHEMA =
  'activation-energy-studio/release-package-manifest/v1';

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const CHECKSUM_LINE_PATTERN = /^([0-9a-f]{64})  (.+)$/u;

function fail(message) {
  throw new Error(`[verify-release-package] ${message}`);
}

function portablePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function relativeWithin(baseDirectory, absolutePath, label) {
  const relativePath = path.relative(baseDirectory, absolutePath);
  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    fail(`${label} is outside the permitted directory.`);
  }
  return portablePath(relativePath);
}

function resolveProjectFile(projectRoot, filePath, label) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    fail(`${label} must be a non-empty path.`);
  }
  if (filePath.includes('\\')) {
    fail(`${label} must use portable forward slashes: ${filePath}`);
  }
  const absolutePath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(projectRoot, filePath);
  relativeWithin(projectRoot, absolutePath, label);
  return absolutePath;
}

function resolvePortableRelativeFile(baseDirectory, relativePath, label) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    path.posix.isAbsolute(relativePath) ||
    path.posix.normalize(relativePath) !== relativePath ||
    relativePath === '..' ||
    relativePath.startsWith('../') ||
    relativePath.includes('\\')
  ) {
    fail(`${label} is not a safe portable relative path: ${relativePath}`);
  }
  const absolutePath = path.resolve(baseDirectory, ...relativePath.split('/'));
  relativeWithin(baseDirectory, absolutePath, label);
  return absolutePath;
}

function requireRegularFile(filePath, label) {
  if (!existsSync(filePath)) fail(`Missing ${label}: ${filePath}`);
  const stats = statSync(filePath);
  if (!stats.isFile()) fail(`${label} is not a regular file: ${filePath}`);
  return stats;
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function requireSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail(`${label} is not a lowercase SHA-256 digest.`);
  }
}

function requireSortedUniquePaths(entries, label) {
  const paths = entries.map((entry) => {
    if (!entry || typeof entry.path !== 'string' || entry.path.length === 0) {
      fail(`${label} contains an entry without a valid path.`);
    }
    return entry.path;
  });
  if (new Set(paths).size !== paths.length) {
    fail(`${label} contains duplicate paths.`);
  }
  const sortedPaths = [...paths].sort();
  if (paths.some((entryPath, index) => entryPath !== sortedPaths[index])) {
    fail(`${label} paths are not in deterministic lexical order.`);
  }
}

function parseChecksumIndex(checksumPath) {
  const source = readFileSync(checksumPath, 'utf8');
  if (!source.endsWith('\n')) {
    fail('The checksum index must end with a newline.');
  }
  const lines = source.slice(0, -1).split('\n');
  if (lines.length === 0 || lines.some((line) => line.length === 0)) {
    fail('The checksum index must contain non-empty checksum lines only.');
  }
  return lines.map((line, index) => {
    const match = line.match(CHECKSUM_LINE_PATTERN);
    if (!match) {
      fail(`Malformed checksum line ${index + 1}: ${JSON.stringify(line)}`);
    }
    return { sha256: match[1], path: match[2] };
  });
}

/**
 * Verify a packaged release without modifying the package or source tree.
 */
export function verifyReleasePackage({
  projectRoot,
  manifestPath,
  checksumPath,
  expectedVersion,
}) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const manifestAbsolutePath = resolveProjectFile(
    resolvedProjectRoot,
    manifestPath,
    'manifest path',
  );
  const checksumAbsolutePath = resolveProjectFile(
    resolvedProjectRoot,
    checksumPath,
    'checksum path',
  );
  requireRegularFile(manifestAbsolutePath, 'release manifest');
  requireRegularFile(checksumAbsolutePath, 'release checksum index');

  const manifestRelativePath = relativeWithin(
    resolvedProjectRoot,
    manifestAbsolutePath,
    'manifest path',
  );
  const checksumRelativePath = relativeWithin(
    resolvedProjectRoot,
    checksumAbsolutePath,
    'checksum path',
  );
  const packageDirectory = path.dirname(manifestAbsolutePath);
  if (path.dirname(checksumAbsolutePath) !== packageDirectory) {
    fail('The manifest and checksum index must be in the same release directory.');
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestAbsolutePath, 'utf8'));
  } catch (error) {
    fail(`The release manifest is not valid JSON: ${error.message}`);
  }
  if (manifest.schema !== RELEASE_PACKAGE_SCHEMA) {
    fail(`Unexpected manifest schema: ${manifest.schema}`);
  }
  if (typeof expectedVersion !== 'string' || expectedVersion.length === 0) {
    fail('expectedVersion must be a non-empty string.');
  }
  if (manifest.release?.version !== expectedVersion) {
    fail(
      `Release version mismatch: expected ${expectedVersion}, observed ${manifest.release?.version}`,
    );
  }
  if (manifest.integrityScope?.hashAlgorithm !== 'sha256') {
    fail('Manifest integrityScope.hashAlgorithm must be sha256.');
  }
  if (
    manifest.integrityScope?.deterministic !== true ||
    manifest.integrityScope?.generatedTimestampOmitted !== true
  ) {
    fail('Manifest does not declare deterministic, timestamp-free generation.');
  }
  if (
    manifest.generation?.manifestPath !== manifestRelativePath ||
    manifest.generation?.checksumPath !== checksumRelativePath
  ) {
    fail('Manifest generation paths do not match the verified files.');
  }
  if (
    manifest.generation?.manifestSelfHashExcluded !== true ||
    manifest.generation?.checksumSelfHashExcluded !== true
  ) {
    fail('Manifest/checksum self-hash exclusion declarations are missing.');
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail('Manifest files must be a non-empty array.');
  }
  requireSortedUniquePaths(manifest.files, 'Manifest');

  const packageRelativePrefix = `${portablePath(
    path.relative(resolvedProjectRoot, packageDirectory),
  )}/`;
  const verifiedFiles = [];
  for (const entry of manifest.files) {
    if (
      typeof entry.role !== 'string' ||
      entry.role.length === 0 ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0
    ) {
      fail(`Malformed manifest file entry: ${JSON.stringify(entry)}`);
    }
    requireSha256(entry.sha256, `Manifest digest for ${entry.path}`);
    if (!entry.path.startsWith(packageRelativePrefix)) {
      fail(`Manifest file is outside the release directory: ${entry.path}`);
    }
    const absolutePath = resolvePortableRelativeFile(
      resolvedProjectRoot,
      entry.path,
      `manifest file ${entry.path}`,
    );
    if (absolutePath === manifestAbsolutePath || absolutePath === checksumAbsolutePath) {
      fail(`Manifest files must exclude manifest/checksum self-hashes: ${entry.path}`);
    }
    const stats = requireRegularFile(absolutePath, `packaged file ${entry.path}`);
    if (stats.size !== entry.bytes) {
      fail(
        `Byte-count mismatch for ${entry.path}: expected ${entry.bytes}, observed ${stats.size}`,
      );
    }
    const observedSha256 = sha256(absolutePath);
    if (observedSha256 !== entry.sha256) {
      fail(
        `SHA-256 mismatch for ${entry.path}: expected ${entry.sha256}, observed ${observedSha256}`,
      );
    }
    verifiedFiles.push({ ...entry, absolutePath });
  }

  const artifact = verifiedFiles.find(
    (entry) => entry.path === manifest.release?.artifact,
  );
  if (!artifact) fail('Release artifact is not present in manifest.files.');
  if (
    manifest.release.bytes !== artifact.bytes ||
    manifest.release.sha256 !== artifact.sha256
  ) {
    fail('Release artifact metadata does not match its manifest file entry.');
  }

  const checksumEntries = parseChecksumIndex(checksumAbsolutePath);
  requireSortedUniquePaths(checksumEntries, 'Checksum index');
  const expectedChecksumPaths = new Set([
    ...verifiedFiles.map((entry) => portablePath(
      path.relative(packageDirectory, entry.absolutePath),
    )),
    path.basename(manifestAbsolutePath),
  ]);
  const observedChecksumPaths = new Set(
    checksumEntries.map((entry) => entry.path),
  );
  const missingChecksumPaths = [...expectedChecksumPaths]
    .filter((entryPath) => !observedChecksumPaths.has(entryPath));
  const unexpectedChecksumPaths = [...observedChecksumPaths]
    .filter((entryPath) => !expectedChecksumPaths.has(entryPath));
  if (missingChecksumPaths.length > 0 || unexpectedChecksumPaths.length > 0) {
    fail(
      `Checksum path set mismatch; missing=${JSON.stringify(missingChecksumPaths)}, unexpected=${JSON.stringify(unexpectedChecksumPaths)}`,
    );
  }

  for (const entry of checksumEntries) {
    requireSha256(entry.sha256, `Checksum digest for ${entry.path}`);
    const absolutePath = resolvePortableRelativeFile(
      packageDirectory,
      entry.path,
      `checksum file ${entry.path}`,
    );
    if (absolutePath === checksumAbsolutePath) {
      fail('The checksum index must not hash itself.');
    }
    requireRegularFile(absolutePath, `checksum-bound file ${entry.path}`);
    const observedSha256 = sha256(absolutePath);
    if (observedSha256 !== entry.sha256) {
      fail(
        `Checksum mismatch for ${entry.path}: expected ${entry.sha256}, observed ${observedSha256}`,
      );
    }
  }

  return {
    version: expectedVersion,
    manifestPath: manifestRelativePath,
    checksumPath: checksumRelativePath,
    manifestFileCount: verifiedFiles.length,
    checksumEntryCount: checksumEntries.length,
    artifactPath: artifact.path,
    artifactBytes: artifact.bytes,
    artifactSha256: artifact.sha256,
  };
}

function requireArgumentValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) fail(`${flag} requires a value.`);
  return value;
}

function parseArguments(argv) {
  const options = {
    projectRoot: path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
    ),
    manifestPath: null,
    checksumPath: null,
    expectedVersion: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--project-root') {
      options.projectRoot = requireArgumentValue(argv, ++index, argument);
    } else if (argument === '--manifest') {
      options.manifestPath = requireArgumentValue(argv, ++index, argument);
    } else if (argument === '--checksum') {
      options.checksumPath = requireArgumentValue(argv, ++index, argument);
    } else if (argument === '--version') {
      options.expectedVersion = requireArgumentValue(argv, ++index, argument);
    } else if (argument === '--help' || argument === '-h') {
      return null;
    } else {
      fail(`Unknown argument: ${argument}`);
    }
  }
  if (!options.manifestPath) fail('--manifest is required.');
  if (!options.checksumPath) fail('--checksum is required.');
  if (!options.expectedVersion) fail('--version is required.');
  return options;
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/verify-release-package.mjs [options]

Options:
  --project-root <path>  Project root (default: parent of scripts/)
  --manifest <path>      Project-relative release manifest path
  --checksum <path>      Project-relative checksum-index path
  --version <semver>     Expected release version
  -h, --help             Show this help

The verifier is read-only. It validates the package manifest, every packaged
file, and the exact checksum-index membership without regenerating artifacts.
`);
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (!options) {
      printHelp();
    } else {
      const result = verifyReleasePackage(options);
      process.stdout.write(
        [
          `PASS RELEASE_PACKAGE_CURRENT v${result.version}`,
          `MANIFEST_FILES ${result.manifestFileCount}`,
          `CHECKSUM_ENTRIES ${result.checksumEntryCount}`,
          `RELEASE_HTML_SHA256 ${result.artifactSha256}`,
        ].join('\n') + '\n',
      );
    }
  } catch (error) {
    process.stderr.write(`FAIL RELEASE_PACKAGE_INTEGRITY ${error.message}\n`);
    process.exitCode = 1;
  }
}
