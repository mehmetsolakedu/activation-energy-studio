import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  NR_CELS_FRIEDMAN_ORACLE_PATH,
  runNrCelsFriedmanOracle,
} from '../scripts/run-nr-cels-friedman-oracle.mjs';

const FIXTURE_ROOT = path.resolve('tests/fixtures/real/nr-cels');
const EXPECTED_PATH = path.resolve(
  FIXTURE_ROOT,
  'oracle/expected-output.json',
);
const MANUAL_PATH = path.resolve(
  FIXTURE_ROOT,
  'manual/nr-cels-adjudication.json',
);

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

test('NR-CELS standard-library Decimal oracle reproduces the byte-locked output', () => {
  const result = runNrCelsFriedmanOracle(['--check'], { stdio: 'pipe' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    Buffer.from(result.stdout, 'utf8'),
    readFileSync(EXPECTED_PATH),
  );
});

test('NR-CELS oracle remains independent of application implementation', () => {
  const implementation = readFileSync(NR_CELS_FRIEDMAN_ORACLE_PATH, 'utf8');
  assert.doesNotMatch(implementation, /(?:from|import)\s+.*src[./]/u);
  assert.match(implementation, /from decimal import Decimal/u);
  assert.match(implementation, /python-standard-library-only/u);
  assert.doesNotMatch(implementation, /PRODUCTION_ISOTONIC|alphaMonotonicPolicy/u);
});

test('NR-CELS locks both declared reconstructions at all 91 alpha targets', () => {
  const expected = readJson(EXPECTED_PATH);
  assert.equal(expected.classification, 'diagnostic-reconstruction');
  assert.deepEqual(Object.keys(expected.samples), ['30', '45', '55']);
  assert.equal(expected.recipe.alphaValues.length, 91);
  assert.equal(expected.recipe.alphaValues[0], '0.05');
  assert.equal(expected.recipe.alphaValues.at(-1), '0.95');
  assert.equal(
    expected.recipe.noSortingExtrapolationMonotonicRepairOrSourceMutation,
    true,
  );

  const lockedRmse = {
    30: {
      DEPOSITED_DTG:
        '3.6336069789090786169661319703784347465489956964152',
      TG_LOCAL_LINEAR_7:
        '2.8309457374931844254366227389305162061388062393324',
    },
    45: {
      DEPOSITED_DTG:
        '9.5141299739665259520785608870528942381176637444424',
      TG_LOCAL_LINEAR_7:
        '6.1922231025599545501804611083547582982985818289881',
    },
    55: {
      DEPOSITED_DTG:
        '9.9256956017149095039881925001141638265939165736821',
      TG_LOCAL_LINEAR_7:
        '5.1577451385085390100662077497976399283435754060457',
    },
  };
  for (const sample of [30, 45, 55]) {
    const methods = expected.samples[String(sample)].methods;
    assert.deepEqual(
      Object.keys(methods).sort(),
      ['DEPOSITED_DTG', 'TG_LOCAL_LINEAR_7'],
    );
    for (const method of ['DEPOSITED_DTG', 'TG_LOCAL_LINEAR_7']) {
      assert.equal(methods[method].records.length, 91);
      assert.equal(methods[method].summary.alphaCount, 91);
      assert.equal(
        methods[method].summary.rmseVsPublishedKJPerMol,
        lockedRmse[sample][method],
      );
      assert.ok(
        methods[method].records.every(
          (record) => record.regression.n === 6,
        ),
      );
    }
  }
});

test('NR-CELS manual adjudication preserves the concept-DOI and publication traps', () => {
  const expected = readJson(EXPECTED_PATH);
  const manual = readJson(MANUAL_PATH);
  assert.equal(
    manual.conceptDoiAdjudication.decision,
    'pin_version_record_16939440',
  );
  assert.equal(
    manual.conceptDoiAdjudication.currentLatestRecord,
    'https://zenodo.org/records/18176373',
  );
  assert.equal(manual.conceptDoiAdjudication.currentLatestContainsRawArchives, false);
  assert.equal(expected.source.conceptLatestContainsRawArchives, false);
  assert.deepEqual(
    manual.publicationDiscrepancies.map(({ code }) => code),
    [
      'NR_CELS_45_MAXIMUM_TRANSPOSED',
      'NR_CELS_30_MODEL_N_ROUNDING_OR_VERSION',
      'DATASET_TITLE_FILLER_RANGE',
    ],
  );
  assert.equal(
    manual.productionHandoff.rawPath,
    'wide-series ingestion of each retained instrument export with TG mapped to massPercent, explicit initialValue=100 and finalValue=min(observed TG) anchors, and signed deposited dTG mapped to the semantic massChangeRate field',
  );
  assert.doesNotMatch(
    JSON.stringify(manual.productionHandoff),
    /isotonic|alphaMonotonicPolicy/u,
  );
});
