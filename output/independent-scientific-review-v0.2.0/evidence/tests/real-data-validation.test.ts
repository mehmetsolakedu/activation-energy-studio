import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import realCsv from './fixtures/real/paper010_rh_t_alpha_beta.csv?raw';
import manifest from './fixtures/real/manifest.json';
import reference from './fixtures/real/paper010_rh_reference.json';
import { analyzeActivationEnergy } from '../src/core';
import { ingestThermalFiles } from '../src/io';
import { buildThermalRuns } from '../src/integration';

const fixturePath = path.resolve('tests/fixtures/real/paper010_rh_t_alpha_beta.csv');
const referencePath = path.resolve('tests/fixtures/real/paper010_rh_reference.json');
const sourcePath = path.resolve('tests/fixtures/real/source/paper010/pone.0173946.s002.xlsx');
const publicationTransformPath = path.resolve(
  'tests/fixtures/real/source/paper010/pone.0173946.s004.xlsx',
);
const publicationResultPath = path.resolve(
  'tests/fixtures/real/source/paper010/pone.0173946.s005.xlsx',
);
const oraclePath = path.resolve(
  'tests/fixtures/real/oracle/paper010_decimal_oracle.py',
);
const METHOD_NAMES = ['KAS', 'FWO', 'STARINK', 'FRIEDMAN'] as const;
const ENERGY_MULTIPLIERS = {
  KAS: -8.31446261815324 / 1000,
  FWO: -8.31446261815324 / (1.052 * 1000),
  STARINK: -8.31446261815324 / (1.0008 * 1000),
  FRIEDMAN: -8.31446261815324 / 1000,
} satisfies Record<(typeof METHOD_NAMES)[number], number>;

function expectWithin(
  actual: number,
  expected: string | number,
  tolerance: string | number,
  label: string,
): void {
  const expectedNumber = Number(expected);
  const toleranceNumber = Number(tolerance);
  expect(Number.isFinite(actual), `${label}: actual must be finite`).toBe(true);
  expect(
    Math.abs(actual - expectedNumber),
    `${label}: |${actual} - ${expectedNumber}| must be <= ${toleranceNumber}`,
  ).toBeLessThanOrEqual(toleranceNumber);
}

function expectVectorWithin(
  actual: readonly number[],
  expected: readonly string[],
  tolerance: string,
  label: string,
): void {
  expect(actual, `${label}: vector length`).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expectWithin(value, expected[index], tolerance, `${label}[${index}]`);
  });
}

describe('paper 010 genuine experimental-data validation', () => {
  it('locks source, derived fixture, Decimal reference, and independent oracle hashes', () => {
    const sha256 = (filePath: string) => createHash('sha256').update(readFileSync(filePath)).digest('hex');
    const expectedHashes = Object.fromEntries(manifest.files.map((file) => [file.role, file.sha256]));
    expect(manifest.schema).toBe('activation-energy-studio/fixture-manifest/v2');
    expect(sha256(sourcePath)).toBe(expectedHashes.immutable_official_raw_source);
    expect(sha256(publicationTransformPath))
      .toBe(expectedHashes.official_publication_transform_source);
    expect(sha256(publicationResultPath))
      .toBe(expectedHashes.official_publication_result_source);
    expect(sha256(fixturePath)).toBe(expectedHashes.deterministic_derived_fixture);
    expect(sha256(referencePath)).toBe(expectedHashes.independent_expected_output);
    expect(sha256(oraclePath)).toBe(expectedHashes.independent_reference_implementation);
    expect(expectedHashes.immutable_official_raw_source).toBe(reference.sourceSha256);
    expect(expectedHashes.deterministic_derived_fixture).toBe(reference.derivedFixtureSha256);
    expect(expectedHashes.independent_reference_implementation).toBe(
      reference.oracle.implementationSha256,
    );
    expect(reference.schema).toBe(
      'activation-energy-studio/real-validation-reference/v2',
    );
    expect(reference.oracle).toMatchObject({
      dependencies: 'standard-library-only',
      decimalPrecision: 50,
      importsApplicationSource: false,
    });
    expect(reference.publicationComparison).toMatchObject({
      status: 'not_reproduced_from_raw_without_undocumented_preprocessing',
      valuesAreContextNotOracle: true,
      friedmanDiagnostic: {
        status: 'PUBLICATION_REPRODUCTION_DIAGNOSTIC_NONSTANDARD',
        acceptedAsEquationCorrectFriedman: false,
        diagnosticOnly: true,
      },
    });
    const diagnostic = reference.publicationComparison.friedmanDiagnostic;
    expect(Number(diagnostic.equationCorrectMeanKJPerMol))
      .toBeCloseTo(131.4393431488, 10);
    expect(Number(diagnostic.nonstandardExactS2RawSignalMeanKJPerMol))
      .toBeCloseTo(357.7083663393, 10);
    expect(Number(diagnostic.nonstandardStoredS4MeanKJPerMol))
      .toBeCloseTo(348.7795578517, 10);
    expect(Number(diagnostic.publishedS5MeanKJPerMol))
      .toBeCloseTo(358.46503875, 10);
    expect(
      Number(
        diagnostic.s4LabeledOrdinateRmse
          .versusS2RawMinusDtgPercentPerMinute,
      ),
    ).toBeLessThan(0.05);
  });

  it('matches every locked Decimal KAS/FWO/Starink/Friedman intermediate and result through CSV ingestion and the core', async () => {
    const file = new File([realCsv], 'paper010_rh_t_alpha_beta.csv', { type: 'text/csv' });
    const ingestion = await ingestThermalFiles([file]);
    expect(ingestion.status).toBe('ready');
    expect(ingestion.records).toHaveLength(48);
    expect(ingestion.files[0]?.mappings).toContainEqual(
      expect.objectContaining({
        role: 'dAlphaDt',
        header: 'dAlpha/dt [1/min]',
        unit: 'min^-1',
        confidence: 'exact',
      }),
    );
    expectWithin(
      ingestion.records[0]?.dAlphaDtPerMinute as number,
      reference.observationsByAlpha[0].rates[0].dAlphaDtPerMinute,
      manifest.comparisonTolerances.derivativeAbsPerMinute,
      'first supplied derivative',
    );

    const adapted = buildThermalRuns(
      ingestion,
      undefined,
      'Paper010 supplied-alpha 0.05-0.80 stage',
    );
    expect(adapted.diagnostics).toEqual([]);
    expect(adapted.runs).toHaveLength(3);

    const analysis = analyzeActivationEnergy(adapted.runs, {
      alphaValues: reference.alphaValues.map(Number),
      methods: [...METHOD_NAMES],
      includeKissinger: false,
    });
    expect(analysis.status).not.toBe('refused');
    expect(analysis.preparedRuns.map(({ derivativeSource }) => derivativeSource))
      .toEqual(['provided', 'provided', 'provided']);

    for (const methodName of METHOD_NAMES) {
      const method = analysis.methods.find((item) => item.method === methodName);
      const expectedMethod = reference.methods[methodName];
      expect(method?.status).toBe('success');
      expect(method?.formulaId).toBe(expectedMethod.formulaId);
      expect(method?.estimates).toHaveLength(reference.alphaValues.length);
      method?.estimates.forEach((estimate, index) => {
        const expected = expectedMethod.records[index];
        const regression = estimate.regression;

        expectWithin(
          estimate.alpha,
          expected.alpha,
          manifest.comparisonTolerances.alphaAbs,
          `${methodName} alpha`,
        );
        expect(regression.n).toBe(expected.regression.n);
        expect(regression.rawObservationCount).toBe(expected.regression.n);
        expect(regression.residualDegreesOfFreedom).toBe(
          expected.regression.residualDegreesOfFreedom,
        );
        expect(regression.inputAggregation).toBe('none');
        expectVectorWithin(
          regression.x,
          expected.regression.x,
          manifest.comparisonTolerances.transformedXYAbs,
          `${methodName} x alpha=${expected.alpha}`,
        );
        expectVectorWithin(
          regression.y,
          expected.regression.y,
          manifest.comparisonTolerances.transformedXYAbs,
          `${methodName} y alpha=${expected.alpha}`,
        );
        expectVectorWithin(
          regression.fitted,
          expected.regression.fitted,
          manifest.comparisonTolerances.transformedXYAbs,
          `${methodName} fitted alpha=${expected.alpha}`,
        );
        expectVectorWithin(
          regression.residuals,
          expected.regression.residuals,
          manifest.comparisonTolerances.transformedXYAbs,
          `${methodName} residuals alpha=${expected.alpha}`,
        );
        expectWithin(
          regression.slope,
          expected.regression.slope,
          manifest.comparisonTolerances.slopeAbsK,
          `${methodName} slope alpha=${expected.alpha}`,
        );
        expectWithin(
          regression.intercept,
          expected.regression.intercept,
          manifest.comparisonTolerances.interceptAbs,
          `${methodName} intercept alpha=${expected.alpha}`,
        );
        expectWithin(
          regression.r2,
          expected.regression.rSquared,
          manifest.comparisonTolerances.rSquaredAbs,
          `${methodName} R2 alpha=${expected.alpha}`,
        );
        expectWithin(
          regression.sse,
          expected.regression.sse,
          manifest.comparisonTolerances.rSquaredAbs,
          `${methodName} SSE alpha=${expected.alpha}`,
        );
        expectWithin(
          regression.residualStandardError,
          expected.regression.residualStandardError,
          manifest.comparisonTolerances.interceptAbs,
          `${methodName} residual SE alpha=${expected.alpha}`,
        );
        expectWithin(
          regression.slopeStandardError,
          expected.regression.slopeStandardError,
          manifest.comparisonTolerances.slopeAbsK,
          `${methodName} slope SE alpha=${expected.alpha}`,
        );
        expectVectorWithin(
          regression.slopeConfidence95,
          expected.regression.slopeConfidence95,
          manifest.comparisonTolerances.slopeAbsK,
          `${methodName} slope CI alpha=${expected.alpha}`,
        );
        expectWithin(
          estimate.activationEnergyKJPerMol,
          expected.activationEnergyKJPerMol,
          manifest.comparisonTolerances.energyAbsKJPerMol,
          `${methodName} Ea alpha=${expected.alpha}`,
        );

        if (methodName === 'FRIEDMAN') {
          const expectedRates = reference.observationsByAlpha[index].rates;
          const observations = [...estimate.observations].sort(
            (left, right) =>
              left.heatingRateKPerMinute
              - right.heatingRateKPerMinute,
          );
          expect(observations).toHaveLength(expectedRates.length);
          observations.forEach((observation, rateIndex) => {
            expectWithin(
              observation.dAlphaDtPerMinute as number,
              expectedRates[rateIndex].dAlphaDtPerMinute,
              manifest.comparisonTolerances.derivativeAbsPerMinute,
              `FRIEDMAN dAlpha/dt alpha=${expected.alpha} rate=${expectedRates[rateIndex].heatingRateKPerMin}`,
            );
          });
        }

        const applicationEnergyConfidence = regression.slopeConfidence95
          .map((slope) => slope * ENERGY_MULTIPLIERS[methodName])
          .sort((left, right) => left - right);
        expectVectorWithin(
          applicationEnergyConfidence,
          expected.energyConfidence95KJPerMol,
          manifest.comparisonTolerances.energyCiEndpointAbsKJPerMol,
          `${methodName} Ea CI alpha=${expected.alpha}`,
        );
      });
      const mean = (method?.estimates ?? []).reduce(
        (sum, estimate) => sum + estimate.activationEnergyKJPerMol,
        0,
      ) / (method?.estimates.length ?? 1);
      expectWithin(
        mean,
        expectedMethod.meanActivationEnergyKJPerMol,
        manifest.comparisonTolerances.meanEnergyAbsKJPerMol,
        `${methodName} mean Ea`,
      );
    }
    const friedman = analysis.methods.find(
      ({ method }) => method === 'FRIEDMAN',
    );
    expect(friedman?.warnings.map(({ code }) => code))
      .not.toContain('NUMERICAL_DERIVATIVE');
  });
});
