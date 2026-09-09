import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { inflateRawSync } from 'node:zlib';

const PROJECT_ROOT = path.resolve('.');
const FIXTURE_ROOT = path.resolve('tests/fixtures/real/nr-cels');
const SOURCE_ROOT = path.resolve(FIXTURE_ROOT, 'source');
const EXPECTED_PATH = path.resolve(
  FIXTURE_ROOT,
  'oracle/expected-output.json',
);
const MANIFEST_PATH = path.resolve(
  FIXTURE_ROOT,
  'manifest/nr-cels-validation-manifest.json',
);

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function zipMembers(file) {
  const archive = readFileSync(file);
  let eocd = -1;
  for (
    let offset = archive.length - 22;
    offset >= Math.max(0, archive.length - 65_557);
    offset -= 1
  ) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  assert.notEqual(eocd, -1, `${file}: ZIP end record`);
  const count = archive.readUInt16LE(eocd + 10);
  let offset = archive.readUInt32LE(eocd + 16);
  const members = new Map();
  for (let index = 0; index < count; index += 1) {
    assert.equal(archive.readUInt32LE(offset), 0x02014b50, `${file}: central entry`);
    const compression = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString('utf8');
    assert.equal(archive.readUInt32LE(localOffset), 0x04034b50, `${name}: local entry`);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(dataStart, dataStart + compressedSize);
    const bytes = compression === 0
      ? Buffer.from(compressed)
      : compression === 8
        ? inflateRawSync(compressed)
        : assert.fail(`${name}: unsupported ZIP compression ${compression}`);
    assert.equal(bytes.length, uncompressedSize, `${name}: uncompressed byte count`);
    members.set(name, bytes);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return members;
}

test('NR-CELS dedicated manifest byte-locks every fixture and evidence artifact', () => {
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(
    manifest.schema,
    'activation-energy-studio/nr-cels-validation-manifest/v1',
  );
  assert.equal(
    manifest.sourceMetadata.datasetVersionDoi,
    '10.5281/zenodo.16939440',
  );
  assert.equal(manifest.sourceMetadata.datasetConceptDoi, '10.5281/zenodo.16939439');
  assert.equal(manifest.validationContract.publicationValuesAreHardOracle, false);
  assert.deepEqual(
    manifest.validationContract.independentMethods,
    ['DEPOSITED_DTG', 'TG_LOCAL_LINEAR_7'],
  );
  assert.equal(
    manifest.validationContract.productionAcceptanceMethod,
    'DEPOSITED_DTG',
  );

  for (const entry of manifest.files) {
    const bytes = readFileSync(path.resolve(FIXTURE_ROOT, entry.path));
    assert.equal(bytes.length, entry.bytes, `${entry.path}: byte count`);
    assert.equal(sha256Bytes(bytes), entry.sha256, `${entry.path}: SHA-256`);
  }
  for (const entry of manifest.supportingEvidence) {
    const bytes = readFileSync(path.resolve(PROJECT_ROOT, entry.path));
    assert.equal(bytes.length, entry.bytes, `${entry.path}: byte count`);
    assert.equal(sha256Bytes(bytes), entry.sha256, `${entry.path}: SHA-256`);
  }
});

test('NR-CELS retained exports are byte-identical to pinned official ZIP members', () => {
  const expected = readJson(EXPECTED_PATH);
  const tgMembers = zipMembers(path.resolve(SOURCE_ROOT, 'TG_DTG_DTA_data.zip'));
  const kineticMembers = zipMembers(path.resolve(SOURCE_ROOT, 'Kinetic_data.zip'));

  assert.equal(tgMembers.size, 20);
  assert.equal(kineticMembers.size, 9);
  for (const audit of expected.source.curveAudits) {
    assert.deepEqual(
      tgMembers.get(audit.file),
      readFileSync(path.resolve(SOURCE_ROOT, audit.path)),
      audit.file,
    );
  }
  for (const audit of expected.source.allKineticFiles) {
    assert.deepEqual(
      kineticMembers.get(audit.file),
      readFileSync(path.resolve(SOURCE_ROOT, audit.path)),
      audit.file,
    );
  }
  const retained = new Set(expected.source.curveAudits.map(({ file }) => file));
  assert.deepEqual(
    [...tgMembers.keys()].filter((name) => !retained.has(name)).sort(),
    ['CEL 10Cmin.txt', 'CELS 10Cmin.txt'],
  );
});

test('NR-CELS UTF-16 curve rows and variable TG/dTG headers retain exact semantics', () => {
  const expected = readJson(EXPECTED_PATH);
  assert.equal(expected.source.curveAudits.length, 18);
  assert.deepEqual(
    [...new Set(expected.source.curveAudits.map(({ tgIndex }) => tgIndex))].sort(),
    [2, 3],
  );
  assert.deepEqual(
    [...new Set(expected.source.curveAudits.map(({ dtgIndex }) => dtgIndex))].sort(),
    [2, 3],
  );

  for (const audit of expected.source.curveAudits) {
    const bytes = readFileSync(path.resolve(SOURCE_ROOT, audit.path));
    assert.deepEqual(bytes.subarray(0, 2), Buffer.from([0xff, 0xfe]), `${audit.file}: BOM`);
    const text = new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
    const withoutCrlf = text.replaceAll('\r\n', '');
    assert.doesNotMatch(withoutCrlf, /[\r\n]/u, `${audit.file}: CRLF only`);
    const rows = text.split('\r\n');
    const headerRow = rows.findIndex((row) => row.startsWith('Time(s)\t'));
    assert.notEqual(headerRow, -1, `${audit.file}: header`);
    assert.equal(rows[headerRow], audit.columnHeaders.join('\t'), audit.file);
    assert.equal(
      rows.slice(headerRow + 1).filter(Boolean).length,
      audit.dataRowCount,
      `${audit.file}: data rows`,
    );
    assert.match(audit.columnHeaders[audit.tgIndex], /^TG /u, audit.file);
    assert.match(audit.columnHeaders[audit.dtgIndex], /^dTG/u, audit.file);
    assert.match(audit.columnHeaders[audit.tgIndex], /\|-b/u, audit.file);
    assert.equal(audit.blankSubtracted, true);
  }
});

test('NR-CELS kinetic exports retain CRLF and the complete 0.01-0.99 source grid', () => {
  const expected = readJson(EXPECTED_PATH);
  assert.equal(expected.source.kineticAudits.length, 3);
  assert.equal(expected.source.allKineticFiles.length, 9);
  for (const audit of expected.source.kineticAudits) {
    const bytes = readFileSync(path.resolve(SOURCE_ROOT, audit.path));
    assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
    const text = bytes.toString('utf8');
    assert.doesNotMatch(text.replaceAll('\r\n', ''), /[\r\n]/u, audit.file);
    const alpha = text
      .split('\r\n')
      .map((row) => row.split('\t')[0])
      .filter((value) => /^0,\d{2}$/u.test(value));
    assert.equal(alpha.length, 99, audit.file);
    assert.equal(alpha[0], '0,01');
    assert.equal(alpha.at(-1), '0,99');
  }
});
