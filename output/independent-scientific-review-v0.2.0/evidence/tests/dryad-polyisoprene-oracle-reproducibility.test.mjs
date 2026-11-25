import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DRYAD_POLYISOPRENE_ORACLE_PATH,
  runDryadPolyisopreneOracle,
} from '../scripts/run-dryad-polyisoprene-oracle.mjs';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '..');
const FIXTURE_ROOT = path.join(
  PROJECT_ROOT,
  'tests/fixtures/real/dryad-polyisoprene',
);
const EXPECTED_PATH = path.join(FIXTURE_ROOT, 'expected-output.json');
const MANIFEST_PATH = path.join(FIXTURE_ROOT, 'manifest.json');
const MANUAL_PATH = path.join(
  FIXTURE_ROOT,
  'manual/hbpi-table3-swap-adjudication.json',
);

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

test('Dryad LPI-01 Decimal oracle reproduces the byte-locked output', () => {
  const result = runDryadPolyisopreneOracle(['--check'], { stdio: 'pipe' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    Buffer.from(result.stdout, 'utf8'),
    readFileSync(EXPECTED_PATH),
  );
});

test('Dryad LPI-01 oracle remains independent of application source', () => {
  const implementation = readFileSync(
    DRYAD_POLYISOPRENE_ORACLE_PATH,
    'utf8',
  );
  assert.doesNotMatch(implementation, /(?:from|import)\s+.*src[./]/);
  assert.match(implementation, /from decimal import Decimal/);
  assert.match(implementation, /python-standard-library-only/);
  assert.equal(
    sha256(DRYAD_POLYISOPRENE_ORACLE_PATH),
    '55d1841373085fe0c7f240239517647dc3c43468fb23a013a3398956f10e862b',
  );
});

test('Dryad LPI-01 hard oracle locks the explicit recipe and method means', () => {
  const expected = readJson(EXPECTED_PATH);
  assert.equal(expected.classification, 'gold-candidate');
  assert.deepEqual(expected.recipe.alphaValues, [
    '0.2',
    '0.3',
    '0.4',
    '0.5',
    '0.6',
    '0.7',
    '0.8',
  ]);
  assert.equal(expected.recipe.gasConstantJPerMolK, '8.3142');
  assert.equal(expected.recipe.fwoCoefficient, '1.052');
  assert.equal(expected.recipe.preserveAcquisitionOrder, true);
  assert.equal(expected.recipe.noSmoothingSortingExtrapolationOrRepair, true);
  assert.equal(
    expected.methods.FWO.meanActivationEnergyKJPerMol,
    '316.04241736807292315856392679494452043995001789313',
  );
  assert.equal(
    expected.methods.KAS.meanActivationEnergyKJPerMol,
    '321.14992729701366067640249829557151699969387566379',
  );
  assert.equal(
    expected.methods.FRIEDMAN.meanActivationEnergyKJPerMol,
    '301.0239645361895217878312920772962725706329899783',
  );
  for (const method of ['FWO', 'KAS', 'FRIEDMAN']) {
    assert.equal(expected.methods[method].publicationValueIsHardOracle, false);
    assert.equal(expected.methods[method].records.length, 7);
    assert.ok(
      expected.methods[method].records.every(
        (record) => record.regression.n === 4,
      ),
    );
  }
});

test('Dryad source, oracle, and evidence hashes match the fixture manifest', () => {
  const manifest = readJson(MANIFEST_PATH);
  const entries = [
    ...manifest.files.map((entry) => ({
      ...entry,
      absolutePath: path.join(FIXTURE_ROOT, entry.path),
    })),
    ...manifest.supportingEvidence.map((entry) => ({
      ...entry,
      absolutePath: path.join(PROJECT_ROOT, entry.path),
    })),
  ];
  for (const entry of entries) {
    const bytes = readFileSync(entry.absolutePath);
    assert.equal(
      bytes.byteLength,
      entry.bytes,
      `${entry.path} byte count`,
    );
    assert.equal(sha256(entry.absolutePath), entry.sha256, entry.path);
  }
  assert.equal(
    manifest.sourceMetadata.officialArchive.sha256,
    '6f98106f149567647b58edd8667cc899438a1ac5642c24b9a294655115e3295c',
  );
});

test('Dryad Table 3 swap is explicitly adjudicated and quarantined', () => {
  const expected = readJson(EXPECTED_PATH);
  const manual = readJson(MANUAL_PATH);
  assert.equal(
    expected.publicationAdjudication.classification,
    'manual_review_expected_publication_row_swap',
  );
  assert.equal(
    expected.publicationAdjudication
      .peakTemperatureColumnParticipatesInSwapFinding,
    false,
  );
  assert.equal(manual.decision, 'accept_raw_traces_quarantine_paper_rows');
  assert.deepEqual(
    manual.rawTraceObservations,
    expected.publicationAdjudication.samples,
  );
  assert.equal(manual.peakTemperatureColumnParticipatesInSwapFinding, false);
  assert.equal(manual.publicationTable4ValuesAreHardOracle, false);
});
