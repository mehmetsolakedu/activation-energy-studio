import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PlatformMatrixValidationError,
  createPlatformMatrixRecord,
  serializePlatformMatrixRecord,
} from '../scripts/create-platform-matrix-record.mjs';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(TEST_DIRECTORY, '..');
const SCRIPT_PATH = resolve(PROJECT_ROOT, 'scripts/create-platform-matrix-record.mjs');
const temporaryDirectories = [];

after(() => {
  temporaryDirectories.forEach((path) => rmSync(path, { recursive: true, force: true }));
});

function makeEvidenceRecord(family, runId) {
  const label = family === 'macos' ? 'macOS 15.5' : family === 'windows11' ? 'Windows 11 Pro' : 'Ubuntu 22.04';
  return {
    schemaVersion: 'activation-energy-studio/platform-evidence-record/v1',
    runId,
    recordStatus: 'VALIDATED_RETAINED_ARTIFACT_SET',
    claimBoundary: {
      acPlat01: 'ONE_RUN_EVIDENCE_READY_FOR_REVIEW',
      acPlat02: 'AWAITING_THREE_PLATFORM_SCIENTIFIC_JSON_COMPARISON',
      statement: 'One retained run; not a platform PASS.',
    },
    timeWindow: {
      startedAt: '2026-07-18T10:00:00.000Z',
      endedAt: '2026-07-18T10:10:00.000Z',
    },
    environment: {
      os: { family, edition: label, build: `${family}-build`, architecture: 'x64' },
      browser: { name: 'Chromium', version: 'fixture-1', engine: 'Blink fixture-1' },
    },
    artifacts: {
      release: { sha256: '1'.repeat(64) },
      goldenInput: { sha256: '2'.repeat(64) },
      selfTestJson: { sha256: family === 'macos' ? 'a'.repeat(64) : family === 'windows11' ? 'b'.repeat(64) : 'c'.repeat(64) },
    },
    selfTest: {
      recordStatus: 'PASS',
      platformGateStatus: 'NOT_CLOSED_BY_SELF_TEST',
      passedCheckCount: 11,
      inputSha256: '2'.repeat(64),
      scientificBuildSha256: '4'.repeat(64),
      scientificPayloadSha256: '5'.repeat(64),
    },
    protocolObservation: {
      networkCapture: {
        externalRequestAttempts: 0,
        totalEntries: 1,
        localRequestEntries: 1,
        pageCount: 1,
        creator: { name: 'DevTools', version: 'fixture-1' },
      },
    },
    visualEvidence: {
      contentReviewStatus: 'AWAITING_HUMAN_VISUAL_REVIEW',
    },
    scientificReport: {
      canonicalSha256: '6'.repeat(64),
    },
  };
}

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'activation-energy-platform-matrix-'));
  temporaryDirectories.push(directory);
  const definitions = [
    ['ubuntu', 'ubuntu-run-01'],
    ['macos', 'macos-run-01'],
    ['windows11', 'windows-run-01'],
  ];
  const records = definitions.map(([family, runId]) => makeEvidenceRecord(family, runId));
  const paths = records.map((record) => {
    const path = join(directory, `${record.environment.os.family}-evidence-record.json`);
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
    return path;
  });
  return { directory, records, paths, output: join(directory, 'platform-matrix-record.json') };
}

function rewrite(fixture, index) {
  writeFileSync(fixture.paths[index], `${JSON.stringify(fixture.records[index], null, 2)}\n`);
}

function expectCode(callback, code) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof PlatformMatrixValidationError);
    assert.equal(error.code, code);
    return true;
  });
}

describe('three-OS platform matrix recorder', () => {
  it('creates a deterministic macOS/Windows 11/Ubuntu matrix without closing platform gates', () => {
    const fixture = createFixture();
    const first = createPlatformMatrixRecord(fixture.paths);
    const second = createPlatformMatrixRecord([...fixture.paths].reverse());

    assert.equal(serializePlatformMatrixRecord(first), serializePlatformMatrixRecord(second));
    assert.equal(first.recordStatus, 'VALIDATED_THREE_PLATFORM_EVIDENCE_MATRIX');
    assert.deepEqual(first.platforms.map((item) => item.family), ['macos', 'windows11', 'ubuntu']);
    assert.deepEqual(first.platforms.map((item) => item.runId), [
      'macos-run-01',
      'windows-run-01',
      'ubuntu-run-01',
    ]);
    assert.equal(first.commonHashes.releaseSha256, '1'.repeat(64));
    assert.equal(first.commonHashes.goldenInputSha256, '2'.repeat(64));
    assert.equal(first.commonHashes.scientificBuildSha256, '4'.repeat(64));
    assert.equal(first.commonHashes.selfTestPayloadSha256, '5'.repeat(64));
    assert.equal(first.commonHashes.scientificReportCanonicalSha256, '6'.repeat(64));
    assert.match(first.claimBoundary.statement, /does not itself mark AC-PLAT-01 or AC-PLAT-02 PASS/);
  });

  it('runs through the CLI and writes only the validated deterministic matrix', () => {
    const fixture = createFixture();
    const argumentsList = fixture.paths.flatMap((path) => ['--record', path]);
    const result = spawnSync(
      process.execPath,
      [SCRIPT_PATH, ...argumentsList, '--output', fixture.output],
      { cwd: PROJECT_ROOT, encoding: 'utf8' },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^OK PLATFORM_MATRIX_RECORD_CREATED /);
    const matrix = JSON.parse(readFileSync(fixture.output, 'utf8'));
    assert.equal(matrix.platforms.length, 3);
    assert.equal(matrix.claimBoundary.acPlat02, 'THREE_OS_MATRIX_READY_FOR_HUMAN_REVIEW');
  });

  it('rejects an incomplete/duplicate OS set and duplicate run identifiers', () => {
    const osFixture = createFixture();
    osFixture.records[0].environment.os.family = 'macos';
    rewrite(osFixture, 0);
    expectCode(() => createPlatformMatrixRecord(osFixture.paths), 'MATRIX_MISMATCH');

    const runFixture = createFixture();
    runFixture.records[0].runId = runFixture.records[1].runId;
    rewrite(runFixture, 0);
    expectCode(() => createPlatformMatrixRecord(runFixture.paths), 'MATRIX_MISMATCH');
  });

  it('rejects any release, input, build, payload, or scientific-report hash mismatch', () => {
    const mutations = [
      (record) => { record.artifacts.release.sha256 = '7'.repeat(64); },
      (record) => {
        record.artifacts.goldenInput.sha256 = '7'.repeat(64);
        record.selfTest.inputSha256 = '7'.repeat(64);
      },
      (record) => { record.selfTest.scientificBuildSha256 = '7'.repeat(64); },
      (record) => { record.selfTest.scientificPayloadSha256 = '7'.repeat(64); },
      (record) => { record.scientificReport.canonicalSha256 = '7'.repeat(64); },
    ];
    for (const mutate of mutations) {
      const fixture = createFixture();
      mutate(fixture.records[0]);
      rewrite(fixture, 0);
      expectCode(() => createPlatformMatrixRecord(fixture.paths), 'MATRIX_MISMATCH');
    }
  });

  it('rejects nonzero network evidence, a failed self-test, or a removed human-review boundary', () => {
    const networkFixture = createFixture();
    networkFixture.records[0].protocolObservation.networkCapture.externalRequestAttempts = 1;
    rewrite(networkFixture, 0);
    expectCode(() => createPlatformMatrixRecord(networkFixture.paths), 'RECORD_INVALID');

    const selfTestFixture = createFixture();
    selfTestFixture.records[1].selfTest.recordStatus = 'FAIL';
    rewrite(selfTestFixture, 1);
    expectCode(() => createPlatformMatrixRecord(selfTestFixture.paths), 'RECORD_INVALID');

    const visualFixture = createFixture();
    visualFixture.records[2].visualEvidence.contentReviewStatus = 'AUTOMATICALLY_APPROVED';
    rewrite(visualFixture, 2);
    expectCode(() => createPlatformMatrixRecord(visualFixture.paths), 'RECORD_INVALID');
  });
});
