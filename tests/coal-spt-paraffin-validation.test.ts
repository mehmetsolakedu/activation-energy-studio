import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import projectedCsv from './fixtures/real/coal-spt-paraffin/paraffin10_t_alpha_beta.csv?raw';
import manifest from './fixtures/real/coal-spt-paraffin/manifest.json';
import reference from './fixtures/real/coal-spt-paraffin/expected-output.json';
import {
  analyzeActivationEnergy,
  type IsoConversionalMethod,
} from '../src/core';
import { ingestThermalFiles } from '../src/io';
import { buildThermalRuns } from '../src/integration';

const PROJECT_ROOT = path.resolve('.');
const FIXTURE_ROOT = path.resolve(
  'tests/fixtures/real/coal-spt-paraffin',
);
const ALPHA_VALUES = reference.alphaValues.map(Number);
const METHODS = [
  'FWO',
  'KAS',
  'FRIEDMAN',
] as const satisfies readonly IsoConversionalMethod[];
const ENERGY_MULTIPLIERS = {
  FWO: -8.31446261815324 / (1.052 * 1000),
  KAS: -8.31446261815324 / 1000,
  FRIEDMAN: -8.31446261815324 / 1000,
} satisfies Record<(typeof METHODS)[number], number>;

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

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
  expect(actual, `${label}: length`).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expectWithin(value, expected[index], tolerance, `${label}[${index}]`);
  });
}

describe('Coal-SPT-Paraffin immutable evidence lane', () => {
  it('locks source, projection, Decimal reference, oracle, and adjudication evidence', () => {
    expect(manifest).toMatchObject({
      schema:
        'activation-energy-studio/coal-spt-paraffin-fixture-manifest/v1',
      fixtureId: 'coal-spt-paraffin-v1-paraffin10-alpha-01-08',
      classification: 'gold-candidate',
      sourceMetadata: {
        selectedDatasetDoi: '10.17632/w22346frww.1',
        selectedDatasetVersion: 1,
        latestAssociatedDatasetDoi: '10.17632/w22346frww.2',
        datasetLicense: 'CC BY 4.0',
        heatingRatesKPerMin: [3, 10, 20, 40],
        replicatesPerRate: 2,
      },
      manualApproval: {
        status: 'approved_for_bounded_validation',
        publicationValuesAreOracle: false,
      },
      validationContract: {
        methods: ['FWO', 'KAS', 'FRIEDMAN'],
        replicateAggregation:
          'arithmetic-mean-physical-scale-by-heating-rate',
        publicationValuesAreOracle: false,
      },
    });

    for (const file of manifest.files) {
      const filePath = path.resolve(FIXTURE_ROOT, file.path);
      const bytes = readFileSync(filePath);
      expect(bytes.byteLength, file.path).toBe(file.bytes);
      expect(sha256(filePath), file.path).toBe(file.sha256);
    }
    for (const file of manifest.supportingEvidence) {
      const filePath = path.resolve(PROJECT_ROOT, file.path);
      const bytes = readFileSync(filePath);
      expect(bytes.byteLength, file.path).toBe(file.bytes);
      expect(sha256(filePath), file.path).toBe(file.sha256);
    }

    const byRole = Object.fromEntries(
      manifest.files.map((file) => [file.role, file]),
    );
    expect(reference.source.sha256).toBe(
      byRole.immutable_official_raw_source_mendeley_v1.sha256,
    );
    expect(reference.source.bytes).toBe(
      byRole.immutable_official_raw_source_mendeley_v1.bytes,
    );
    expect(reference.derivedFixture.sha256).toBe(
      byRole.deterministic_projected_fixture.sha256,
    );
    expect(reference.oracle.implementationSha256).toBe(
      byRole.independent_reference_implementation.sha256,
    );
    expect(reference).toMatchObject({
      schema: 'activation-energy-studio/coal-spt-paraffin-reference/v1',
      fixtureId: 'coal-spt-paraffin-v1-paraffin10-alpha-01-08',
      oracle: {
        dependencies: 'python-standard-library-only',
        decimalPrecision: 50,
        importsApplicationSource: false,
      },
      scientificPolicy: {
        conversionRule: '(W0-Wt)/(W0-Wf)',
        publicationValuesAreOracle: false,
      },
      publicationComparison: {
        status: 'secondary_context_not_acceptance_oracle',
        valuesAreContextNotOracle: true,
      },
    });
    expect(reference.source.runAudits).toHaveLength(8);
    expect(reference.observationsByAlpha).toHaveLength(8);
    expect(reference.derivedFixture.rows).toBe(64);
    expect(
      manifest.knownIssues.map(({ code }) => code),
    ).toEqual(expect.arrayContaining([
      'MENDELEY_V2_INCOMPLETE_AND_MISLABELED',
      'PUBLICATION_TABLE_COPY_AND_CONFLICT_ERRORS',
      'BLEND_RAW_CURVES_ABSENT',
    ]));
  });

  it('matches every Decimal intermediate and result through production CSV ingestion and the core', async () => {
    const file = new File(
      [projectedCsv],
      'coal-spt-paraffin-paraffin10-projected.csv',
      { type: 'text/csv' },
    );
    const ingestion = await ingestThermalFiles([file]);
    expect(
      ingestion.status,
      JSON.stringify(ingestion.diagnostics, null, 2),
    ).toBe('ready');
    expect(ingestion.records).toHaveLength(64);
    expect(ingestion.tables.tAlphaBeta).toHaveLength(64);
    expect(ingestion.files[0]?.mappings).toContainEqual(
      expect.objectContaining({
        role: 'dAlphaDt',
        header: 'dAlpha/dt [1/min]',
        unit: 'min^-1',
        confidence: 'exact',
      }),
    );

    const adapted = buildThermalRuns(
      ingestion,
      undefined,
      'Paraffin nominal-10 mg alpha 0.1-0.8',
    );
    expect(adapted.diagnostics).toEqual([]);
    expect(adapted.runs).toHaveLength(8);
    expect(
      adapted.runs.map(({ id, points }) => [id, points.length]),
    ).toEqual([
      ['csp-paraffin10-beta03-rep1', 8],
      ['csp-paraffin10-beta03-rep2', 8],
      ['csp-paraffin10-beta10-rep1', 8],
      ['csp-paraffin10-beta10-rep2', 8],
      ['csp-paraffin10-beta20-rep1', 8],
      ['csp-paraffin10-beta20-rep2', 8],
      ['csp-paraffin10-beta40-rep1', 8],
      ['csp-paraffin10-beta40-rep2', 8],
    ]);

    const analysis = analyzeActivationEnergy(adapted.runs, {
      alphaValues: ALPHA_VALUES,
      methods: [...METHODS],
      includeKissinger: false,
    });
    expect(analysis.status).not.toBe('refused');
    expect(analysis.eligibility).toMatchObject({
      eligible: true,
      distinctHeatingRates: 4,
    });
    expect(analysis.kissinger).toBeUndefined();
    expect(
      analysis.preparedRuns.map(({ derivativeSource }) => derivativeSource),
    ).toEqual(Array(8).fill('provided'));

    for (const methodName of METHODS) {
      const method = analysis.methods.find(
        ({ method: name }) => name === methodName,
      );
      const expectedMethod = reference.methods[methodName];
      expect(method?.status).toBe('success');
      expect(method?.formulaId).toBe(expectedMethod.formulaId);
      expect(method?.estimates).toHaveLength(8);

      method?.estimates.forEach((estimate, alphaIndex) => {
        const expected = expectedMethod.records[alphaIndex];
        const regression = estimate.regression;
        expectWithin(
          estimate.alpha,
          expected.alpha,
          manifest.comparisonTolerances.alphaAbs,
          `${methodName} alpha`,
        );
        expect(regression).toMatchObject({
          n: 4,
          rawObservationCount: 8,
          residualDegreesOfFreedom: 2,
          inputAggregation:
            'arithmetic-mean-physical-scale-by-heating-rate',
        });
        expect(regression.inputGroups).toHaveLength(4);
        regression.inputGroups.forEach((group, groupIndex) => {
          const expectedGroup = expected.regression.inputGroups[groupIndex];
          expect(group).toMatchObject({
            groupId: expectedGroup.groupId,
            sourceRunIds: expectedGroup.sourceRunIds,
            replicateCount: 2,
            aggregation:
              'arithmetic-mean-physical-scale-by-heating-rate',
          });
          expectWithin(
            group.heatingRateKPerMinute,
            expectedGroup.heatingRateKPerMinute,
            manifest.comparisonTolerances.inputGroupPhysicalAbs,
            `${methodName} group beta`,
          );
          expectWithin(
            group.temperatureK,
            expectedGroup.temperatureK,
            manifest.comparisonTolerances.inputGroupPhysicalAbs,
            `${methodName} group temperature`,
          );
          expectWithin(
            group.temperatureSampleStandardDeviationK as number,
            expectedGroup.temperatureSampleStandardDeviationK,
            manifest.comparisonTolerances.inputGroupPhysicalAbs,
            `${methodName} group temperature SD`,
          );
          if (methodName === 'FRIEDMAN') {
            expect('dAlphaDtPerMinute' in expectedGroup).toBe(true);
            expect(
              'derivativeSampleStandardDeviationPerMinute' in expectedGroup,
            ).toBe(true);
            if (
              !('dAlphaDtPerMinute' in expectedGroup)
              || !(
                'derivativeSampleStandardDeviationPerMinute'
                in expectedGroup
              )
            ) {
              throw new Error(
                'Friedman oracle input group lacks derivative provenance.',
              );
            }
            expectWithin(
              group.dAlphaDtPerMinute as number,
              expectedGroup.dAlphaDtPerMinute,
              manifest.comparisonTolerances.inputGroupPhysicalAbs,
              'Friedman group derivative',
            );
            expectWithin(
              group.derivativeSampleStandardDeviationPerMinute as number,
              expectedGroup.derivativeSampleStandardDeviationPerMinute,
              manifest.comparisonTolerances.inputGroupPhysicalAbs,
              'Friedman group derivative SD',
            );
          }
          expectWithin(
            group.x,
            expectedGroup.x,
            manifest.comparisonTolerances.transformedXYAbs,
            `${methodName} group x`,
          );
          expectWithin(
            group.y,
            expectedGroup.y,
            manifest.comparisonTolerances.transformedXYAbs,
            `${methodName} group y`,
          );
        });

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
          manifest.comparisonTolerances.sseAbs,
          `${methodName} SSE alpha=${expected.alpha}`,
        );
        expectWithin(
          regression.residualStandardError,
          expected.regression.residualStandardError,
          manifest.comparisonTolerances.residualStandardErrorAbs,
          `${methodName} residual SE alpha=${expected.alpha}`,
        );
        expectWithin(
          regression.slopeStandardError,
          expected.regression.slopeStandardError,
          manifest.comparisonTolerances.slopeStandardErrorAbsK,
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
        const energyConfidence = regression.slopeConfidence95
          .map((slope) => slope * ENERGY_MULTIPLIERS[methodName])
          .sort((left, right) => left - right);
        expectVectorWithin(
          energyConfidence,
          expected.energyConfidence95KJPerMol,
          manifest.comparisonTolerances.energyCiEndpointAbsKJPerMol,
          `${methodName} Ea CI alpha=${expected.alpha}`,
        );

        if (methodName === 'FRIEDMAN') {
          const expectedObservations =
            reference.observationsByAlpha[alphaIndex].observations;
          const observations = [...estimate.observations].sort(
            (left, right) => left.runId.localeCompare(right.runId),
          );
          expect(observations).toHaveLength(8);
          observations.forEach((observation, observationIndex) => {
            const expectedObservation = expectedObservations[observationIndex];
            expect(observation.runId).toBe(expectedObservation.runId);
            expectWithin(
              observation.temperatureK,
              expectedObservation.temperatureK,
              manifest.comparisonTolerances.temperatureAbsK,
              'Friedman raw observation temperature',
            );
            expectWithin(
              observation.dAlphaDtPerMinute as number,
              expectedObservation.dAlphaDtPerMinute,
              manifest.comparisonTolerances.derivativeAbsPerMinute,
              'Friedman raw observation derivative',
            );
          });
        }
      });

      const mean = (method?.estimates ?? []).reduce(
        (sum, estimate) => sum + estimate.activationEnergyKJPerMol,
        0,
      ) / (method?.estimates.length ?? 1);
      expectWithin(
        mean,
        expectedMethod.summary.meanActivationEnergyKJPerMol,
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

  it('keeps publication parity secondary and inside the predeclared context bands', () => {
    expect(reference.publicationComparison.valuesAreContextNotOracle)
      .toBe(true);
    for (const methodName of METHODS) {
      const comparison =
        reference.publicationComparison.methods[methodName];
      expect(
        Math.abs(Number(comparison.publishedMinusOracleMeanKJPerMol)),
      ).toBeLessThanOrEqual(
        Number(
          manifest.comparisonTolerances.publicationMeanContextAbsKJPerMol,
        ),
      );
      expect(
        Number(comparison.maximumAbsolutePerAlphaDifferenceKJPerMol),
      ).toBeLessThanOrEqual(
        Number(
          manifest.comparisonTolerances
            .publicationPerAlphaContextAbsKJPerMol,
        ),
      );
    }
    expect(
      reference.publicationComparison.quarantinedPublicationIssues
        .map(({ code }) => code),
    ).toEqual(expect.arrayContaining([
      'DIB_PARAFFIN_1_8_COPIED_FROM_PARAFFIN_10',
      'DIB_PARAFFIN_5_COPIED_FROM_COAL',
      'PARAFFIN_10_TP_CONFLICT',
      'TERNARY_GLOBAL_MEAN_CONFLICT',
    ]));
  });
});
