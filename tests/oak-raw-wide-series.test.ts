import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeActivationEnergy,
  type IsoConversionalMethod,
} from '../src/core';
import {
  ingestThermalFiles,
  type IngestionOptions,
  type WideSeriesDefinition,
  type WideSeriesIngestionAudit,
} from '../src/io';
import { buildThermalRuns } from '../src/integration';
import reference from './fixtures/real/oak/expected-output.json';

const HEADER_ROW = 1;
const SAMPLE = 'Chilean Oak';
const ATMOSPHERE = 'N2';
const STAGE = 'alpha 0.05-0.85';
const ALPHA_VALUES = Array.from({ length: 17 }, (_, index) =>
  Number(((index + 1) * 0.05).toFixed(2)),
);
const METHODS = [
  'FWO',
  'KAS',
  'FRIEDMAN',
] as const satisfies readonly IsoConversionalMethod[];

const SOURCES = [
  {
    rate: 5,
    fileName: 'TGA-Oak-5Kmin-1.csv',
    filePath: path.resolve(
      'tests/fixtures/real/oak/source/TGA-Oak-5Kmin-1.csv',
    ),
    byteLength: 531_531,
    sha256: 'cdefb2f643e26562400d6313ed5bc2cfe02a500e36242651c42cdcccbd014608',
    rawObservationCount: 7_200,
    populatedRowCount: 7_200,
    populatedLastSourceRow: 7_202,
    pointAuditSha256:
      '7a7c698f73373f5052907036aafcf203931dbd268da24da96942332e0af903a9',
    branch: {
      seriesId: 'oak-5',
      runId: 'oak-5',
      sourceObservationCount: 7_200,
      selectedObservationCount: 1_034,
      startSourceRow: 1_889,
      endSourceRow: 2_922,
      targetAlphaRange: [0.05, 0.85],
      selectedAlphaRange: [0.049823, 0.850418],
    },
  },
  {
    rate: 10,
    fileName: 'TGA-Oak-10Kmin-1.csv',
    filePath: path.resolve(
      'tests/fixtures/real/oak/source/TGA-Oak-10Kmin-1.csv',
    ),
    byteLength: 309_500,
    sha256: 'ddf80f5e2252d77732207768be7c245a6e319349216d32eda7c208b6f6aed9a9',
    rawObservationCount: 3_589,
    populatedRowCount: 3_589,
    populatedLastSourceRow: 3_591,
    pointAuditSha256:
      '51efe044bbb3293952c47656498dc989963b7fe5abf11471caa6c30c425676e5',
    branch: {
      seriesId: 'oak-10',
      runId: 'oak-10',
      sourceObservationCount: 3_589,
      selectedObservationCount: 539,
      startSourceRow: 989,
      endSourceRow: 1_527,
      targetAlphaRange: [0.05, 0.85],
      selectedAlphaRange: [0.049877, 0.850525],
    },
  },
  {
    rate: 20,
    fileName: 'TGA-Oak-20Kmin-1.csv',
    filePath: path.resolve(
      'tests/fixtures/real/oak/source/TGA-Oak-20Kmin-1.csv',
    ),
    byteLength: 137_848,
    sha256: '37f8e355b086479c62e74181d0b2ade298c7bdd63bdb10238dcf566ed0ef8fa1',
    rawObservationCount: 1_800,
    populatedRowCount: 1_800,
    populatedLastSourceRow: 1_802,
    pointAuditSha256:
      '2c88fd53d841999fd1ad9153d70553091798f360cab2c8636723e7bd0dde932b',
    branch: {
      seriesId: 'oak-20',
      runId: 'oak-20',
      sourceObservationCount: 1_800,
      selectedObservationCount: 280,
      startSourceRow: 523,
      endSourceRow: 802,
      targetAlphaRange: [0.05, 0.85],
      selectedAlphaRange: [0.049664, 0.853125],
    },
  },
  {
    rate: 40,
    fileName: 'TGA-Oak-40Kmin-1.csv',
    filePath: path.resolve(
      'tests/fixtures/real/oak/source/TGA-Oak-40Kmin-1.csv',
    ),
    byteLength: 154_524,
    sha256: '967ccc4aac128a5a980fd1eea9154220e846cba4b7e853f3046c08fbc22d10a8',
    rawObservationCount: 996,
    populatedRowCount: 996,
    populatedLastSourceRow: 998,
    pointAuditSha256:
      '0b6dba029e6851d5d762dba75663b58868231268eede1d6cc5d22a846b92c000',
    branch: {
      seriesId: 'oak-40',
      runId: 'oak-40',
      sourceObservationCount: 996,
      selectedObservationCount: 145,
      startSourceRow: 194,
      endSourceRow: 338,
      targetAlphaRange: [0.05, 0.85],
      selectedAlphaRange: [0.049788, 0.850145],
    },
  },
] as const;

const HEADERS = [
  'Temperature (°C)',
  'Temperature (K)',
  '1/T (K-1)',
  'Time (s)',
  'Time (min)',
  'Mass (mg)',
  'Conversion, α',
  'dα/dT (K-1)',
  'dα/dt (min-1)',
  '',
  '',
  '',
];

const EXPECTED_PROVENANCE_MAPPINGS = [
  {
    role: 'temperature',
    sourceColumnIndex: 0,
    sourceHeader: 'Temperature (°C)',
    sourceUnit: 'C',
    confidence: 'manual',
  },
  {
    role: 'alpha',
    sourceColumnIndex: 6,
    sourceHeader: 'Conversion, α',
    sourceUnit: 'fraction',
    confidence: 'manual',
  },
  {
    role: 'dAlphaDt',
    sourceColumnIndex: 8,
    sourceHeader: 'dα/dt (min-1)',
    sourceUnit: 'min^-1',
    confidence: 'manual',
  },
] as const;

// These are locked raw-path reductions using Celsius + 273.15 and the core's
// exact R constant. They are not the publication's reported values and the
// publication is deliberately not treated as a numerical oracle.
const RAW_PATH_MEAN_EA_KJ_PER_MOL: Readonly<
  Partial<Record<IsoConversionalMethod, number>>
> = {
  FWO: 176.99549886687606,
  KAS: 176.10469514302366,
  FRIEDMAN: 177.50651079192372,
} as const;

function definition(rate: number): WideSeriesDefinition {
  return {
    seriesId: `oak-${rate}`,
    runId: `oak-${rate}`,
    temperature: { columnIndex: 0, unit: 'C' },
    signal: {
      kind: 'alpha',
      columnIndex: 6,
      unit: 'fraction',
    },
    derivative: {
      semantic: 'dAlphaDt',
      valueColumnIndex: 8,
      unit: 'min^-1',
    },
    heatingRate: { value: rate, unit: 'K/min' },
    context: {
      sample: SAMPLE,
      atmosphere: ATMOSPHERE,
      stage: STAGE,
    },
  };
}

function ingestionOptions(rate: number): IngestionOptions {
  return {
    layout: 'wide-series',
    headerRow: HEADER_ROW,
    delimiter: ';',
    decimalSeparator: '.',
    wideSeries: [definition(rate)],
    wideAlphaGrid: ALPHA_VALUES,
    wideScopeConfirmed: true,
  };
}

function pointAuditDigest(audit: WideSeriesIngestionAudit): string {
  return createHash('sha256')
    .update(JSON.stringify(audit.points.map((point) => [
      point.seriesId,
      point.runId,
      point.alpha,
      point.sourceRows,
      point.derivativeSourceRows ?? null,
    ])))
    .digest('hex');
}

function excludedColumns(
  populatedRowCount: number,
  populatedLastSourceRow: number,
) {
  return [
    [1, 'Temperature (K)'],
    [2, '1/T (K-1)'],
    [3, 'Time (s)'],
    [4, 'Time (min)'],
    [5, 'Mass (mg)'],
    [7, 'dα/dT (K-1)'],
  ].map(([columnIndex, sourceHeader]) => ({
    columnIndex,
    sourceHeader,
    populatedRowCount,
    firstSourceRow: 3,
    lastSourceRow: populatedLastSourceRow,
  }));
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
  expect(actual, `${label}: vector length`).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expectWithin(value, expected[index], tolerance, `${label}[${index}]`);
  });
}

describe('official Chilean Oak raw CSV production path', () => {
  it('ingests four explicit wide series, preserves source audit, and calculates FWO/KAS/Friedman', async () => {
    const sourceBytes = await Promise.all(
      SOURCES.map(async (source) => {
        const bytes = new Uint8Array(await readFile(source.filePath));
        expect(bytes.byteLength).toBe(source.byteLength);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(
          source.sha256,
        );
        return bytes;
      }),
    );

    // The official 10 K/min export itself contains this isolated tail cell
    // after 3,589 complete observations. Keep the artifact locked and visible
    // instead of silently repairing the fixture before browser ingestion.
    expect(
      new TextDecoder()
        .decode(sourceBytes[1])
        .split(/\r?\n/u)[4_801],
    ).toBe('0.001075402;;;;;;;;;;;');

    const files = sourceBytes.map((bytes, index) => new File(
      [bytes],
      SOURCES[index].fileName,
      { type: 'text/csv' },
    ));
    const ingestion = await ingestThermalFiles(
      files,
      SOURCES.map(({ rate }) => ingestionOptions(rate)),
    );

    expect(
      ingestion.status,
      JSON.stringify(ingestion.diagnostics, null, 2),
    ).toBe('ready');
    expect(ingestion.files).toHaveLength(4);
    expect(ingestion.files.map(({ status }) => status)).toEqual([
      'ready',
      'ready',
      'ready',
      'ready',
    ]);
    expect(
      ingestion.diagnostics.filter(({ severity }) => severity === 'error'),
    ).toEqual([]);
    expect(ingestion.diagnostics).toContainEqual({
      severity: 'warning',
      code: 'WIDE_TRAILING_INCOMPLETE_ROW_EXCLUDED',
      message:
        'A populated but incomplete row after the final complete observation was excluded as trailing export debris; review the reported source row.',
      sourceFile: 'TGA-Oak-10Kmin-1.csv',
      row: 4_802,
      column: 7,
      header: 'Conversion, α',
      suggestion: undefined,
    });
    expect(
      ingestion.diagnostics.filter(
        ({ code }) => code === 'WIDE_TRAILING_INCOMPLETE_ROW_EXCLUDED',
      ),
    ).toHaveLength(1);
    expect(ingestion.records).toHaveLength(68);
    expect(ingestion.tables.tAlphaBeta).toHaveLength(68);
    expect(ingestion.tables.betaTp).toEqual([]);
    expect(ingestion.wideSeriesAudit).toHaveLength(4);

    for (const [index, source] of SOURCES.entries()) {
      const fileResult = ingestion.files[index];
      const audit = ingestion.wideSeriesAudit?.[index];
      expect(audit).toBeDefined();
      expect(fileResult.wideSeriesAudit).toEqual(audit);
      expect(fileResult.source).toMatchObject({
        fileName: source.fileName,
        fileType: 'csv',
        delimiter: ';',
        decimalSeparator: '.',
      });
      expect(audit).toMatchObject({
        layout: 'wide-series',
        source: {
          fileName: source.fileName,
          fileType: 'csv',
        },
        headerRow: HEADER_ROW,
        headerSourceRow: 2,
        headers: HEADERS,
        decimalSeparator: '.',
        alphaGrid: ALPHA_VALUES,
        series: [definition(source.rate)],
        rawObservationCount: source.rawObservationCount,
        projectedPointCount: 17,
        scopeConfirmed: true,
      });
      expect(audit!.branches).toEqual([source.branch]);
      expect(audit!.excludedPopulatedColumns).toEqual(
        excludedColumns(
          source.populatedRowCount,
          source.populatedLastSourceRow,
        ),
      );
      expect(pointAuditDigest(audit!)).toBe(source.pointAuditSha256);
      expect(
        audit!.points.every(
          ({ sourceRows, derivativeSourceRows }) => (
            sourceRows.length > 0
            && derivativeSourceRows !== undefined
            && derivativeSourceRows.length > 0
            && JSON.stringify(derivativeSourceRows) === JSON.stringify(sourceRows)
          ),
        ),
      ).toBe(true);

      const fileRecords = ingestion.records.filter(
        ({ provenance }) => provenance.fileName === source.fileName,
      );
      expect(fileRecords).toHaveLength(17);
      expect(fileRecords.map(({ runId, alpha, provenance }) => ({
        seriesId: runId,
        runId,
        alpha,
        sourceRows: provenance.sourceRows,
        derivativeSourceRows: provenance.derivativeSourceRows,
      }))).toEqual(audit!.points);
      expect(
        fileRecords.every(({ provenance }) => (
          provenance.sourceRows !== undefined
          && provenance.sourceRow === provenance.sourceRows[0]
          && JSON.stringify(provenance.columnMappings)
            === JSON.stringify(EXPECTED_PROVENANCE_MAPPINGS)
        )),
      ).toBe(true);
    }

    expect(ingestion.files[1].populatedColumns).toEqual(
      expect.arrayContaining([
        {
          columnIndex: 0,
          header: 'Temperature (°C)',
          populatedRowCount: 3_590,
          firstSourceRow: 3,
          lastSourceRow: 4_802,
        },
        {
          columnIndex: 6,
          header: 'Conversion, α',
          populatedRowCount: 3_589,
          firstSourceRow: 3,
          lastSourceRow: 3_591,
        },
      ]),
    );
    expect(ingestion.records[0].temperatureK).toBeCloseTo(
      523.8834439834025,
      11,
    );
    for (const alphaRecord of reference.observationsByAlpha) {
      for (const rateRecord of alphaRecord.rates) {
        const actual = ingestion.records.find(
          ({ alpha, heatingRateKPerMin }) => (
            alpha === Number(alphaRecord.alpha)
            && heatingRateKPerMin === Number(rateRecord.heatingRateKPerMin)
          ),
        );
        expect(
          actual,
          `missing raw-path point alpha=${alphaRecord.alpha}, beta=${rateRecord.heatingRateKPerMin}`,
        ).toBeDefined();
        expectWithin(
          actual!.temperatureK,
          rateRecord.temperatureK,
          reference.comparisonTolerances.temperatureAbsK,
          `temperature alpha=${alphaRecord.alpha}, beta=${rateRecord.heatingRateKPerMin}`,
        );
        expectWithin(
          actual!.dAlphaDtPerMinute!,
          rateRecord.dAlphaDtPerMinute,
          reference.comparisonTolerances.derivativeAbsPerMinute,
          `dAlpha/dt alpha=${alphaRecord.alpha}, beta=${rateRecord.heatingRateKPerMin}`,
        );
        expect(actual!.provenance.sourceRows).toEqual(rateRecord.sourceRows);
        expect(actual!.provenance.derivativeSourceRows).toEqual(
          rateRecord.sourceRows,
        );
      }
    }

    const adapted = buildThermalRuns(ingestion);
    expect(adapted.diagnostics).toEqual([]);
    expect(adapted.kissingerPeaks).toEqual([]);
    expect(adapted.runs.map((run) => ({
      id: run.id,
      heatingRate: run.heatingRate,
      pointCount: run.points.length,
      sampleId: run.sampleId,
      atmosphere: run.atmosphere,
      stage: run.stage,
    }))).toEqual(SOURCES.map(({ rate }) => ({
      id: `oak-${rate}`,
      heatingRate: rate,
      pointCount: 17,
      sampleId: SAMPLE,
      atmosphere: ATMOSPHERE,
      stage: STAGE,
    })));

    const analysis = analyzeActivationEnergy(adapted.runs, {
      alphaValues: ALPHA_VALUES,
      methods: METHODS,
      includeKissinger: false,
    });
    expect(analysis.status).toBe('success');
    expect(analysis.constants.gasConstantJPerMolK).toBe(8.31446261815324);
    expect(analysis.eligibility).toMatchObject({
      eligible: true,
      distinctHeatingRates: 4,
    });
    expect(analysis.kissinger).toBeUndefined();
    expect(analysis.refusals).toEqual([]);
    expect(
      analysis.preparedRuns.map(({ id, derivativeSource }) => ({
        id,
        derivativeSource,
      })),
    ).toEqual(SOURCES.map(({ rate }) => ({
      id: `oak-${rate}`,
      derivativeSource: 'provided',
    })));
    expect(analysis.methods.map(({ method, status, estimates, refusals }) => ({
      method,
      status,
      alphaValues: estimates.map(({ alpha }) => alpha),
      refusalCount: refusals.length,
    }))).toEqual(METHODS.map((method) => ({
      method,
      status: 'success',
      alphaValues: ALPHA_VALUES,
      refusalCount: 0,
    })));

    for (const method of analysis.methods) {
      expect(method.method in reference.methods).toBe(true);
      const methodName = method.method as keyof typeof reference.methods;
      const expectedMethod = reference.methods[methodName];
      expect(method.formulaId).toBe(expectedMethod.formulaId);
      expect(method.estimates).toHaveLength(expectedMethod.records.length);
      method.estimates.forEach((estimate, index) => {
        const expected = expectedMethod.records[index];
        const regression = estimate.regression;
        expectWithin(
          estimate.alpha,
          expected.alpha,
          reference.comparisonTolerances.alphaAbs,
          `${method.method} alpha`,
        );
        expectWithin(
          estimate.activationEnergyKJPerMol,
          expected.activationEnergyKJPerMol,
          reference.comparisonTolerances.energyAbsKJPerMol,
          `${method.method} Ea alpha=${expected.alpha}`,
        );
        expect(regression.n).toBe(expected.regression.n);
        expect(regression.rawObservationCount)
          .toBe(expected.regression.rawObservationCount);
        expect(regression.residualDegreesOfFreedom)
          .toBe(expected.regression.residualDegreesOfFreedom);
        expect(regression.inputAggregation)
          .toBe(expected.regression.inputAggregation);
        expectVectorWithin(
          regression.x,
          expected.regression.x,
          reference.comparisonTolerances.transformedXYAbs,
          `${method.method} x alpha=${expected.alpha}`,
        );
        expectVectorWithin(
          regression.y,
          expected.regression.y,
          reference.comparisonTolerances.transformedXYAbs,
          `${method.method} y alpha=${expected.alpha}`,
        );
        expectVectorWithin(
          regression.fitted,
          expected.regression.fitted,
          reference.comparisonTolerances.transformedXYAbs,
          `${method.method} fitted alpha=${expected.alpha}`,
        );
        expectVectorWithin(
          regression.residuals,
          expected.regression.residuals,
          reference.comparisonTolerances.transformedXYAbs,
          `${method.method} residuals alpha=${expected.alpha}`,
        );
        expectWithin(
          regression.slope,
          expected.regression.slope,
          reference.comparisonTolerances.slopeAbsK,
          `${method.method} slope alpha=${expected.alpha}`,
        );
        expectWithin(
          regression.intercept,
          expected.regression.intercept,
          reference.comparisonTolerances.interceptAbs,
          `${method.method} intercept alpha=${expected.alpha}`,
        );
        expectWithin(
          regression.r2,
          expected.regression.rSquared,
          reference.comparisonTolerances.rSquaredAbs,
          `${method.method} R2 alpha=${expected.alpha}`,
        );
        expectWithin(
          regression.sse,
          expected.regression.sse,
          reference.comparisonTolerances.rSquaredAbs,
          `${method.method} SSE alpha=${expected.alpha}`,
        );
        expectWithin(
          regression.residualStandardError,
          expected.regression.residualStandardError,
          reference.comparisonTolerances.interceptAbs,
          `${method.method} residual SE alpha=${expected.alpha}`,
        );
        expectWithin(
          regression.slopeStandardError,
          expected.regression.slopeStandardError,
          reference.comparisonTolerances.slopeAbsK,
          `${method.method} slope SE alpha=${expected.alpha}`,
        );
        expectVectorWithin(
          regression.slopeConfidence95,
          expected.regression.slopeConfidence95,
          reference.comparisonTolerances.slopeAbsK,
          `${method.method} slope CI alpha=${expected.alpha}`,
        );
      });

      const mean = method.estimates.reduce(
        (sum, { activationEnergyKJPerMol }) => (
          sum + activationEnergyKJPerMol
        ),
        0,
      ) / method.estimates.length;
      const expectedMean = RAW_PATH_MEAN_EA_KJ_PER_MOL[method.method];
      expect(expectedMean).toBeDefined();
      if (expectedMean === undefined) {
        throw new Error(`Missing locked mean for ${method.method}.`);
      }
      expect(
        Math.abs(mean - expectedMean),
      ).toBeLessThan(1e-9);
    }
  });
});
