#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { unzipSync } from 'fflate';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '0.2.0';
const ARCHIVE_ROOT = `Activation-Energy-Studio-External-Validation-Kit-v${VERSION}`;
const ARCHIVE_NAME = `${ARCHIVE_ROOT}.zip`;
const ARCHIVE_RELATIVE_PATH = `output/${ARCHIVE_NAME}`;
const SIDECAR_RELATIVE_PATH = `${ARCHIVE_RELATIVE_PATH}.sha256`;
const MANIFEST_NAME = 'BUNDLE_MANIFEST.json';
const MANIFEST_SIDECAR_NAME = 'BUNDLE_MANIFEST.sha256';
const PAYLOAD_INDEX_NAME = 'BUNDLE_PAYLOAD_SHA256SUMS.txt';
const MANIFEST_SCHEMA = 'activation-energy-studio/external-validation-kit/v1';
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

function fail(message) {
  throw new Error(`[historical-validation-kit] ${message}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeRelativePath(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty string.`);
  }
  if (
    value.includes('\0')
    || value.includes('\\')
    || value.startsWith('/')
    || /^[A-Za-z]:/u.test(value)
  ) {
    fail(`${label} is unsafe: ${JSON.stringify(value)}.`);
  }
  const parts = value.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    fail(`${label} is not canonical: ${JSON.stringify(value)}.`);
  }
  return value;
}

function findEndOfCentralDirectory(archive) {
  const minimumOffset = Math.max(0, archive.length - 65_557);
  for (let offset = archive.length - 22; offset >= minimumOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = archive.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === archive.length) return offset;
  }
  fail('ZIP end-of-central-directory record is missing or malformed.');
}

function centralDirectoryEntries(archive) {
  const endOffset = findEndOfCentralDirectory(archive);
  const diskNumber = archive.readUInt16LE(endOffset + 4);
  const centralDiskNumber = archive.readUInt16LE(endOffset + 6);
  const entriesOnDisk = archive.readUInt16LE(endOffset + 8);
  const entryCount = archive.readUInt16LE(endOffset + 10);
  const centralSize = archive.readUInt32LE(endOffset + 12);
  const centralOffset = archive.readUInt32LE(endOffset + 16);
  if (diskNumber !== 0 || centralDiskNumber !== 0 || entriesOnDisk !== entryCount) {
    fail('Multi-disk ZIP archives are not permitted.');
  }
  if (
    entryCount === 0xffff
    || centralSize === 0xffffffff
    || centralOffset === 0xffffffff
  ) {
    fail('ZIP64 archives are not permitted for this historical bundle.');
  }
  if (centralOffset + centralSize > endOffset) {
    fail('ZIP central-directory bounds are invalid.');
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries = [];
  const names = new Set();
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > archive.length || archive.readUInt32LE(offset) !== 0x02014b50) {
      fail(`ZIP central-directory entry ${index + 1} is malformed.`);
    }
    const flags = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const diskStart = archive.readUInt16LE(offset + 34);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > archive.length) {
      fail(`ZIP central-directory entry ${index + 1} exceeds archive bounds.`);
    }
    if ((flags & 0x0001) !== 0) fail('Encrypted ZIP entries are not permitted.');
    if (diskStart !== 0) fail('Multi-disk ZIP entries are not permitted.');
    if (
      compressedSize === 0xffffffff
      || uncompressedSize === 0xffffffff
      || localHeaderOffset === 0xffffffff
    ) {
      fail('ZIP64 entries are not permitted for this historical bundle.');
    }
    let name;
    try {
      name = decoder.decode(archive.subarray(offset + 46, offset + 46 + nameLength));
    } catch {
      fail(`ZIP entry ${index + 1} does not have a valid UTF-8 path.`);
    }
    safeRelativePath(name, `ZIP entry ${index + 1}`);
    if (name.endsWith('/')) fail(`Directory ZIP entries are not permitted: ${name}.`);
    if (names.has(name)) fail(`Duplicate ZIP entry path: ${name}.`);
    names.add(name);
    entries.push({ name, uncompressedSize });
    offset = nextOffset;
  }
  if (offset !== centralOffset + centralSize) {
    fail('ZIP central-directory size does not match its entries.');
  }
  return entries;
}

function parseChecksumSidecar(source, expectedName, label) {
  const match = source.match(/^([0-9a-f]{64})  ([^\r\n]+)\n$/u);
  if (!match || match[2] !== expectedName) {
    fail(`${label} must contain exactly one canonical SHA-256 entry for ${expectedName}.`);
  }
  return match[1];
}

function parseManifest(bytes) {
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    fail(`Internal manifest is not valid JSON: ${error.message}`);
  }
  if (manifest.schemaVersion !== MANIFEST_SCHEMA) {
    fail(`Unexpected internal manifest schema: ${manifest.schemaVersion ?? 'missing'}.`);
  }
  if (
    manifest.kit?.name !== ARCHIVE_ROOT
    || manifest.kit?.version !== VERSION
    || manifest.kit?.archiveRoot !== ARCHIVE_ROOT
  ) {
    fail('Internal manifest does not identify the frozen v0.2.0 kit.');
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail('Internal manifest has no payload file list.');
  }
  return manifest;
}

function payloadEntries(manifest) {
  const paths = new Set();
  return manifest.files.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail(`Manifest payload entry ${index + 1} is not an object.`);
    }
    const relativePath = safeRelativePath(entry.path, `Manifest payload path ${index + 1}`);
    if (paths.has(relativePath)) fail(`Duplicate manifest payload path: ${relativePath}.`);
    paths.add(relativePath);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
      fail(`Manifest payload byte count is invalid: ${relativePath}.`);
    }
    if (!SHA256_PATTERN.test(entry.sha256 ?? '')) {
      fail(`Manifest payload SHA-256 is invalid: ${relativePath}.`);
    }
    return { path: relativePath, bytes: entry.bytes, sha256: entry.sha256 };
  });
}

export function verifyHistoricalValidationKit({ projectRoot = PROJECT_ROOT } = {}) {
  const archivePath = path.resolve(projectRoot, ARCHIVE_RELATIVE_PATH);
  const sidecarPath = path.resolve(projectRoot, SIDECAR_RELATIVE_PATH);
  const archive = readFileSync(archivePath);
  const expectedArchiveSha256 = parseChecksumSidecar(
    readFileSync(sidecarPath, 'utf8'),
    ARCHIVE_NAME,
    'Archive checksum sidecar',
  );
  const archiveSha256 = sha256(archive);
  if (archiveSha256 !== expectedArchiveSha256) {
    fail(`Archive SHA-256 mismatch: expected ${expectedArchiveSha256}, observed ${archiveSha256}.`);
  }

  const centralEntries = centralDirectoryEntries(archive);
  let unzipped;
  try {
    unzipped = unzipSync(new Uint8Array(archive));
  } catch (error) {
    fail(`ZIP decompression failed: ${error.message}`);
  }
  if (Object.keys(unzipped).length !== centralEntries.length) {
    fail('ZIP entry count changed during decompression; duplicate paths are suspected.');
  }
  for (const { name, uncompressedSize } of centralEntries) {
    const bytes = unzipped[name];
    if (!bytes) fail(`ZIP payload is missing after decompression: ${name}.`);
    if (bytes.length !== uncompressedSize) fail(`ZIP byte count mismatch: ${name}.`);
  }

  const prefix = `${ARCHIVE_ROOT}/`;
  const manifestArchivePath = `${prefix}${MANIFEST_NAME}`;
  const manifestSidecarArchivePath = `${prefix}${MANIFEST_SIDECAR_NAME}`;
  const payloadIndexArchivePath = `${prefix}${PAYLOAD_INDEX_NAME}`;
  for (const requiredPath of [manifestArchivePath, manifestSidecarArchivePath, payloadIndexArchivePath]) {
    if (!unzipped[requiredPath]) fail(`Required internal file is missing: ${requiredPath}.`);
  }

  const manifestBytes = Buffer.from(unzipped[manifestArchivePath]);
  const manifestSha256 = sha256(manifestBytes);
  const expectedManifestSha256 = parseChecksumSidecar(
    Buffer.from(unzipped[manifestSidecarArchivePath]).toString('utf8'),
    MANIFEST_NAME,
    'Internal manifest checksum sidecar',
  );
  if (manifestSha256 !== expectedManifestSha256) {
    fail(`Internal manifest SHA-256 mismatch: expected ${expectedManifestSha256}, observed ${manifestSha256}.`);
  }

  const manifest = parseManifest(manifestBytes);
  const payloads = payloadEntries(manifest);
  const index = manifest.payloadChecksumIndex;
  if (
    index?.path !== PAYLOAD_INDEX_NAME
    || index?.algorithm !== 'SHA-256'
    || index?.format !== 'sha256-two-space-path-v1'
    || index?.entryCount !== payloads.length
    || !Number.isSafeInteger(index?.bytes)
    || !SHA256_PATTERN.test(index?.sha256 ?? '')
  ) {
    fail('Internal payload-checksum index metadata is invalid.');
  }

  const expectedArchivePaths = new Set([
    manifestArchivePath,
    manifestSidecarArchivePath,
    payloadIndexArchivePath,
    ...payloads.map((entry) => `${prefix}${entry.path}`),
  ]);
  if (expectedArchivePaths.size !== centralEntries.length) {
    fail('Internal manifest file set contains a duplicate or count mismatch.');
  }
  for (const { name } of centralEntries) {
    if (!name.startsWith(prefix)) fail(`ZIP entry escapes the archive root: ${name}.`);
    if (!expectedArchivePaths.has(name)) fail(`Unmanifested ZIP entry: ${name}.`);
  }
  for (const expectedPath of expectedArchivePaths) {
    if (!unzipped[expectedPath]) fail(`Manifested ZIP entry is missing: ${expectedPath}.`);
  }

  const expectedIndexText = payloads.map((entry) => `${entry.sha256}  ${entry.path}\n`).join('');
  const indexBytes = Buffer.from(unzipped[payloadIndexArchivePath]);
  if (
    indexBytes.length !== index.bytes
    || sha256(indexBytes) !== index.sha256
    || indexBytes.toString('utf8') !== expectedIndexText
  ) {
    fail('Internal payload-checksum index is stale or inconsistent with the manifest.');
  }

  for (const entry of payloads) {
    const bytes = Buffer.from(unzipped[`${prefix}${entry.path}`]);
    if (bytes.length !== entry.bytes) fail(`Payload byte count mismatch: ${entry.path}.`);
    const observed = sha256(bytes);
    if (observed !== entry.sha256) {
      fail(`Payload SHA-256 mismatch: ${entry.path}; expected ${entry.sha256}, observed ${observed}.`);
    }
  }

  return Object.freeze({
    version: VERSION,
    archivePath: ARCHIVE_RELATIVE_PATH,
    archiveSha256,
    archiveEntries: centralEntries.length,
    payloadCount: payloads.length,
    manifestSha256,
  });
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const result = verifyHistoricalValidationKit();
    process.stdout.write(
      `TECHNICAL_OK HISTORICAL_VALIDATION_KIT_CURRENT version=${result.version} `
      + `payloads=${result.payloadCount} archiveEntries=${result.archiveEntries} `
      + `archiveSha256=${result.archiveSha256}\n`,
    );
  } catch (error) {
    process.stderr.write(`FAIL HISTORICAL_VALIDATION_KIT ${error.message}\n`);
    process.exitCode = 1;
  }
}
