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
import test from 'node:test';

import {
  coalSptParaffinPythonCandidates,
  discoverCoalSptParaffinPython,
  runCoalSptParaffinOracle,
} from '../scripts/run-coal-spt-paraffin-oracle.mjs';

const PROJECT_ROOT = path.resolve('.');
const FIXTURE_ROOT = path.join(
  PROJECT_ROOT,
  'tests/fixtures/real/coal-spt-paraffin',
);
const SOURCE_PATH = path.join(
  FIXTURE_ROOT,
  'source/TGA raw data of coal, SPT and paraffin at different masses.xlsx',
);
const DERIVED_PATH = path.join(
  FIXTURE_ROOT,
  'paraffin10_t_alpha_beta.csv',
);
const REFERENCE_PATH = path.join(FIXTURE_ROOT, 'expected-output.json');

function parseLastJsonLine(text) {
  const lines = String(text)
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean);
  assert.ok(lines.length > 0, 'Expected at least one JSON line.');
  return JSON.parse(lines.at(-1));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const runtime = discoverCoalSptParaffinPython();

function run(arguments_) {
  return runCoalSptParaffinOracle(arguments_, {
    runtime,
    stdio: 'pipe',
  });
}

test('discovers an isolated stdlib Decimal-capable Python runtime', () => {
  assert.match(runtime.version, /^\d+\.\d+\.\d+$/u);
  assert.ok(
    coalSptParaffinPythonCandidates().some(
      ({ source }) => source === runtime.source,
    ),
  );
});

test('read-only check reproduces every locked Coal-SPT-Paraffin artifact', () => {
  const result = run(['--project-root', PROJECT_ROOT, '--check']);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  const summary = parseLastJsonLine(result.stdout);
  assert.deepEqual(summary, {
    derivedSha256:
      '146dca7f870e8ab1c0d15449b19b0b1d0754c96c39aa7cbf65922e904a59e782',
    fixtureId: 'coal-spt-paraffin-v1-paraffin10-alpha-01-08',
    meanActivationEnergyKJPerMol: {
      FRIEDMAN:
        '80.304924614163890493944846465972873831058732800645',
      FWO:
        '85.344625218322541096361349274750507477071263279019',
      KAS:
        '80.254594232234618294668001688274811021763123553059',
    },
    oracleSha256:
      '8072703fb4188e6dc7ee0c6a68bddb91f372dc7812dffb2dee3bbadeac2a5604',
    referenceSha256:
      '65731e5bc8b620bcac9b99d7b1944df9b4e00a5e31744a55c2a3de1b4fd28b3a',
    rows: 64,
    sourceSha256:
      '0226a9f6eaa1fb1bdfc7e5713d2a5faed95d3ac2e8fd3154a66e981bbc4ead21',
    status: 'PASS',
  });
});

test('independent emission is byte-deterministic', (t) => {
  const directory = mkdtempSync(
    path.join(tmpdir(), 'coal-spt-paraffin-oracle-'),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const emittedCsv = path.join(directory, 'projected.csv');
  const emittedJson = path.join(directory, 'expected.json');

  const result = run([
    '--project-root',
    PROJECT_ROOT,
    '--emit-csv',
    emittedCsv,
    '--emit-json',
    emittedJson,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const summary = parseLastJsonLine(result.stdout);
  assert.equal(summary.status, 'EMITTED');
  assert.deepEqual(readFileSync(emittedCsv), readFileSync(DERIVED_PATH));
  assert.deepEqual(readFileSync(emittedJson), readFileSync(REFERENCE_PATH));
});

test('source-byte and regenerated-artifact tampering fail closed', (t) => {
  const directory = mkdtempSync(
    path.join(tmpdir(), 'coal-spt-paraffin-tamper-'),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const sourceCopy = path.join(directory, 'source.xlsx');
  copyFileSync(SOURCE_PATH, sourceCopy);
  const sourceBytes = readFileSync(sourceCopy);
  sourceBytes[100] ^= 0x01;
  writeFileSync(sourceCopy, sourceBytes);
  const badSource = run([
    '--project-root',
    PROJECT_ROOT,
    '--source',
    sourceCopy,
  ]);
  assert.notEqual(badSource.status, 0);
  assert.equal(
    parseLastJsonLine(badSource.stderr).code,
    'ORACLE_SOURCE_HASH_MISMATCH',
  );

  const derivedCopy = path.join(directory, 'projected.csv');
  copyFileSync(DERIVED_PATH, derivedCopy);
  writeFileSync(
    derivedCopy,
    Buffer.concat([readFileSync(derivedCopy), Buffer.from('\n')]),
  );
  const badDerived = run([
    '--project-root',
    PROJECT_ROOT,
    '--check',
    '--derived',
    derivedCopy,
  ]);
  assert.notEqual(badDerived.status, 0);
  assert.equal(
    parseLastJsonLine(badDerived.stderr).code,
    'ORACLE_DERIVED_FIXTURE_MISMATCH',
  );

  assert.equal(
    sha256(readFileSync(SOURCE_PATH)),
    '0226a9f6eaa1fb1bdfc7e5713d2a5faed95d3ac2e8fd3154a66e981bbc4ead21',
  );
});
