// @vitest-environment node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import readXlsxFile from 'read-excel-file/node';
import { describe, expect, it } from 'vitest';

import {
  analyzeActivationEnergy,
  type IsoConversionalMethod,
  type ThermalRun,
} from '../src/core';
import {
  ingestThermalFiles,
  projectWideSeriesTable,
  type IngestionSource,
  type RawTable,
  type WideSeriesDefinition,
  type WideSeriesProjectedPoint,
  type WideSeriesTableOptions,
} from '../src/io';
import { buildThermalRuns } from '../src/integration';

const SOURCE_URL = new URL(
  './fixtures/real/source/paper010/pone.0173946.s002.xlsx',
  import.meta.url,
);
const DERIVED_URL = new URL(
  './fixtures/real/paper010_rh_t_alpha_beta.csv',
  import.meta.url,
);
const ORACLE_URL = new URL(
  './fixtures/real/paper010_rh_reference.json',
  import.meta.url,
);

const EXPECTED_SOURCE_SHA256 =
  'd24e218dd8da9646312b122ddc892d1d338783ce2829877145fa298491d99b57';
const EXPECTED_SHEET = 'Fig.2.';
const EXPECTED_ROW_COUNT = 578;
const EXPECTED_COLUMN_COUNT = 36;
const EXPECTED_AUDIT_POINTS_SHA256 =
  'a9d927aa416168a95125e12f11b607e94e9cd38fee63b671fa5e368305c2ac5d';
const HEADER_ROW = 2;
const ALPHA_VALUES = Array.from({ length: 16 }, (_, index) =>
  Number(((index + 1) * 0.05).toFixed(2)),
);
const METHODS = [
  'FWO',
  'KAS',
  'STARINK',
  'FRIEDMAN',
] as const satisfies readonly IsoConversionalMethod[];
const SAMPLE = 'Rhubarb (RH)';
const ATMOSPHERE = 'Simulated air (N2:O2=4:1)';
const STAGE = 'RH conversion branch, alpha 0.05-0.80';
// The independent oracle consumes the deterministically rounded CSV
// (9 decimal places for T and 12 for dAlpha/dt), while this path retains the
// unrounded raw-XLSX interpolation. The direct-path R² delta is therefore
// bounded separately from the CSV-versus-Decimal oracle tolerance.
const RAW_PROJECTION_TRANSFORMED_ABS = 5e-10;
const RAW_PROJECTION_R2_ABS = 6e-11;

type DerivativeSemantic = 'massLossRate' | 'massChangeRate';

interface ExpectedDerivedRow {
  temperatureCelsius: number;
  alpha: number;
  dAlphaDtPerMinute: number;
  heatingRateKPerMin: number;
  runId: string;
  sample: string;
  atmosphere: string;
}

interface OracleRegression {
  n: number;
  residualDegreesOfFreedom: number;
  x: string[];
  y: string[];
  fitted: string[];
  residuals: string[];
  slope: string;
  intercept: string;
  sse: string;
  rSquared: string;
  residualStandardError: string;
}

interface OracleRecord {
  alpha: string;
  activationEnergyKJPerMol: string;
  regression: OracleRegression;
}

interface OracleReference {
  methods: Record<
    IsoConversionalMethod,
    {
      formulaId: string;
      records: OracleRecord[];
    }
  >;
}

function paper010Definitions(
  derivativeSemantic: DerivativeSemantic = 'massLossRate',
): WideSeriesDefinition[] {
  return [5, 10, 20].map((heatingRate, index) => {
    const derivative = derivativeSemantic === 'massLossRate'
      ? {
          semantic: 'massLossRate' as const,
          valueColumnIndex: 7 + index * 2,
          unit: '%/min' as const,
          temperatureColumn: {
            columnIndex: 6 + index * 2,
            unit: 'C' as const,
          },
        }
      : {
          semantic: 'massChangeRate' as const,
          valueColumnIndex: 7 + index * 2,
          unit: '%/min' as const,
          temperatureColumn: {
            columnIndex: 6 + index * 2,
            unit: 'C' as const,
          },
        };
    return {
      seriesId: `paper010-rh-${heatingRate}`,
      runId: `paper010-rh-${heatingRate}`,
      temperature: { columnIndex: index * 2, unit: 'C' },
      signal: {
        kind: 'massPercent',
        columnIndex: index * 2 + 1,
        unit: '%',
        alphaReference: { initialValue: 100, finalValue: 0 },
      },
      derivative,
      heatingRate: { value: heatingRate, unit: 'K/min' },
      context: {
        sample: SAMPLE,
        atmosphere: ATMOSPHERE,
        stage: STAGE,
      },
    };
  });
}

function wideOptions(
  derivativeSemantic: DerivativeSemantic = 'massLossRate',
): WideSeriesTableOptions {
  return {
    headerRow: HEADER_ROW,
    decimalSeparator: '.',
    series: paper010Definitions(derivativeSemantic),
  };
}

function parseDerivedCsv(csv: string): ExpectedDerivedRow[] {
  const rows = csv.trim().split(/\r?\n/u);
  expect(rows[0]).toBe(
    'Temperature [°C],Alpha [0-1],dAlpha/dt [1/min],Mass percent [%],'
    + 'Heating rate [K/min],Run,Sample,Atmosphere',
  );
  return rows.slice(1).map((line) => {
    const [
      temperature,
      alpha,
      derivative,
      _mass,
      heatingRate,
      runId,
      sample,
      atmosphere,
    ] = line.split(',');
    return {
      temperatureCelsius: Number(temperature),
      alpha: Number(alpha),
      dAlphaDtPerMinute: Number(derivative),
      heatingRateKPerMin: Number(heatingRate),
      runId,
      sample,
      atmosphere,
    };
  });
}

function thermalRuns(
  projectedPoints: readonly WideSeriesProjectedPoint[],
): ThermalRun[] {
  return paper010Definitions().map((definition) => {
    const points = projectedPoints.filter(
      ({ runId }) => runId === definition.runId,
    );
    expect(points).toHaveLength(ALPHA_VALUES.length);
    return {
      id: definition.runId,
      heatingRate: definition.heatingRate.value,
      heatingRateUnit: definition.heatingRate.unit,
      temperatureUnit: 'K',
      sampleId: definition.context.sample,
      atmosphere: definition.context.atmosphere,
      stage: definition.context.stage,
      points: points.map((point) => ({
        temperature: point.temperatureK,
        alpha: point.alpha,
        dAlphaDtPerMinute: point.dAlphaDtPerMinute,
      })),
    };
  });
}

async function lockedRawTable(): Promise<RawTable> {
  const sourcePath = fileURLToPath(SOURCE_URL);
  const sourceBytes = await readFile(SOURCE_URL);
  expect(createHash('sha256').update(sourceBytes).digest('hex')).toBe(
    EXPECTED_SOURCE_SHA256,
  );

  const sheets = await readXlsxFile(sourcePath);
  const sourceSheet = sheets.find(({ sheet }) => sheet === EXPECTED_SHEET);
  expect(sourceSheet, `Required worksheet "${EXPECTED_SHEET}" is missing.`)
    .toBeDefined();

  const table = sourceSheet!.data as RawTable;
  expect(table).toHaveLength(EXPECTED_ROW_COUNT);
  expect(Math.max(...table.map((row) => row.length))).toBe(
    EXPECTED_COLUMN_COUNT,
  );
  expect(table[HEADER_ROW].slice(0, 12)).toEqual([
    'temperature',
    'weight',
    'temperature',
    'weight',
    'temperature',
    'weight',
    'temperature',
    'weight',
    'temperature',
    'weight',
    'temperature',
    'weight',
  ]);
  return table;
}

describe('Paper 010 official raw XLSX wide-series regression', () => {
  it('locks the source, preserves all selected observations, and reproduces the derived fixture', async () => {
    const table = await lockedRawTable();
    const source: IngestionSource = {
      fileName: basename(fileURLToPath(SOURCE_URL)),
      fileType: 'xlsx',
      sheetName: EXPECTED_SHEET,
    };

    const result = projectWideSeriesTable(
      table,
      source,
      wideOptions(),
      ALPHA_VALUES,
    );

    expect(result.status).toBe('ready');
    expect(result.dataset).not.toBeNull();
    expect(result.diagnostics.filter(({ severity }) => severity === 'error'))
      .toEqual([]);
    expect(result.dataset!.source).toEqual(source);
    expect(result.dataset!.headerRow).toBe(HEADER_ROW);
    expect(result.dataset!.observations).toHaveLength(1716);
    expect(
      Object.fromEntries(
        paper010Definitions().map(({ runId }) => [
          runId,
          result.dataset!.observations.filter(
            (observation) => observation.runId === runId,
          ).length,
        ]),
      ),
    ).toEqual({
      'paper010-rh-5': 574,
      'paper010-rh-10': 574,
      'paper010-rh-20': 568,
    });
    expect(result.branches).toEqual([
      expect.objectContaining({
        runId: 'paper010-rh-5',
        sourceObservationCount: 574,
        selectedObservationCount: 307,
        startSourceRow: 119,
        endSourceRow: 425,
      }),
      expect.objectContaining({
        runId: 'paper010-rh-10',
        sourceObservationCount: 574,
        selectedObservationCount: 331,
        startSourceRow: 137,
        endSourceRow: 467,
      }),
      expect.objectContaining({
        runId: 'paper010-rh-20',
        sourceObservationCount: 568,
        selectedObservationCount: 365,
        startSourceRow: 131,
        endSourceRow: 495,
      }),
    ]);
    expect(result.projectedPoints).toHaveLength(48);

    // The official derivative columns are positive -dm/dt values. The
    // `massLossRate` mapping must therefore preserve the sign and divide the
    // percent-per-minute value by the 100 %-point mass span.
    for (const [runId, sourceRow, columnIndex, rawValue] of [
      ['paper010-rh-5', 119, 7, 0.40233],
      ['paper010-rh-10', 137, 9, 1.24631],
      ['paper010-rh-20', 131, 11, 1.52822],
    ] as const) {
      expect(table[sourceRow - 1][columnIndex]).toBe(rawValue);
      const observation = result.dataset!.observations.find(
        (candidate) => (
          candidate.runId === runId && candidate.sourceRow === sourceRow
        ),
      );
      expect(observation).toBeDefined();
      expect(observation!.rawDerivativeValue).toBe(rawValue);
      expect(observation!.dAlphaDtPerMinute).toBeCloseTo(
        rawValue / 100,
        14,
      );
    }

    const expectedRows = parseDerivedCsv(
      await readFile(DERIVED_URL, 'utf8'),
    );
    expect(expectedRows).toHaveLength(48);
    const expectedByKey = new Map(
      expectedRows.map((row) => [
        `${row.runId}|${row.alpha.toFixed(2)}`,
        row,
      ]),
    );
    let maximumTemperatureErrorCelsius = 0;
    let maximumDerivativeErrorPerMinute = 0;
    for (const point of result.projectedPoints) {
      const expected = expectedByKey.get(
        `${point.runId}|${point.alpha.toFixed(2)}`,
      );
      expect(expected).toBeDefined();
      expect(point.heatingRateKPerMin).toBe(expected!.heatingRateKPerMin);
      expect(point.context).toEqual({
        sample: expected!.sample,
        atmosphere: expected!.atmosphere,
        stage: STAGE,
      });
      maximumTemperatureErrorCelsius = Math.max(
        maximumTemperatureErrorCelsius,
        Math.abs(point.temperatureK - 273.15 - expected!.temperatureCelsius),
      );
      maximumDerivativeErrorPerMinute = Math.max(
        maximumDerivativeErrorPerMinute,
        Math.abs(
          point.dAlphaDtPerMinute! - expected!.dAlphaDtPerMinute,
        ),
      );
    }
    expect(maximumTemperatureErrorCelsius).toBeLessThanOrEqual(6e-10);
    expect(maximumDerivativeErrorPerMinute).toBeLessThanOrEqual(1e-12);
  });

  it('produces 16 alpha values by four methods against the independent oracle, with no Kissinger result', async () => {
    const table = await lockedRawTable();
    const source: IngestionSource = {
      fileName: basename(fileURLToPath(SOURCE_URL)),
      fileType: 'xlsx',
      sheetName: EXPECTED_SHEET,
    };
    const projection = projectWideSeriesTable(
      table,
      source,
      wideOptions(),
      ALPHA_VALUES,
    );
    expect(projection.status).toBe('ready');

    const analysis = analyzeActivationEnergy(
      thermalRuns(projection.projectedPoints),
      {
        alphaValues: ALPHA_VALUES,
        methods: METHODS,
        includeKissinger: false,
      },
    );
    const oracle = JSON.parse(
      await readFile(ORACLE_URL, 'utf8'),
    ) as OracleReference;

    expect(analysis.eligibility.eligible).toBe(true);
    expect(analysis.kissinger).toBeUndefined();
    expect(analysis.methods.map(({ method }) => method)).toEqual(METHODS);
    expect(
      analysis.methods.reduce(
        (total, method) => total + method.estimates.length,
        0,
      ),
    ).toBe(64);

    let maximumTransformedDifference = 0;
    let maximumR2Difference = 0;
    for (const method of analysis.methods) {
      const expectedMethod = oracle.methods[method.method];
      expect(method.formulaId).toBe(expectedMethod.formulaId);
      expect(method.refusals).toEqual([]);
      expect(method.estimates).toHaveLength(16);
      for (const [index, estimate] of method.estimates.entries()) {
        const expected = expectedMethod.records[index];
        expect(estimate.alpha).toBeCloseTo(Number(expected.alpha), 13);
        expect(
          Math.abs(
            estimate.activationEnergyKJPerMol
            - Number(expected.activationEnergyKJPerMol),
          ),
        ).toBeLessThanOrEqual(5e-6);
        expect(estimate.regression.n).toBe(3);
        expect(estimate.regression.rawObservationCount).toBe(3);
        expect(estimate.regression.residualDegreesOfFreedom).toBe(1);
        expect(
          Math.abs(
            estimate.regression.slope
            - Number(expected.regression.slope),
          ),
        ).toBeLessThanOrEqual(1e-3);
        expect(
          Math.abs(
            estimate.regression.intercept
            - Number(expected.regression.intercept),
          ),
        ).toBeLessThanOrEqual(1e-6);
        for (const field of ['x', 'y', 'fitted', 'residuals'] as const) {
          for (const [valueIndex, value] of
            estimate.regression[field].entries()) {
            maximumTransformedDifference = Math.max(
              maximumTransformedDifference,
              Math.abs(
                value - Number(expected.regression[field][valueIndex]),
              ),
            );
          }
        }
        maximumTransformedDifference = Math.max(
          maximumTransformedDifference,
          Math.abs(
            estimate.regression.sse - Number(expected.regression.sse),
          ),
          Math.abs(
            estimate.regression.residualStandardError
            - Number(expected.regression.residualStandardError),
          ),
        );
        maximumR2Difference = Math.max(
          maximumR2Difference,
          Math.abs(
            estimate.regression.r2
            - Number(expected.regression.rSquared),
          ),
        );
      }
    }
    expect(maximumTransformedDifference).toBeLessThanOrEqual(
      RAW_PROJECTION_TRANSFORMED_ABS,
    );
    expect(maximumR2Difference).toBeLessThanOrEqual(
      RAW_PROJECTION_R2_ABS,
    );
  });

  it('passes the official workbook through the public wide-series ingest API and scientific adapter', async () => {
    const sourceBytes = new Uint8Array(await readFile(SOURCE_URL));
    const file = new File(
      [sourceBytes],
      basename(fileURLToPath(SOURCE_URL)),
      {
        type:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    );
    const definitions = paper010Definitions();
    const ingestion = await ingestThermalFiles([file], {
      layout: 'wide-series',
      sheet: EXPECTED_SHEET,
      headerRow: HEADER_ROW,
      decimalSeparator: '.',
      wideSeries: definitions,
      wideAlphaGrid: ALPHA_VALUES,
      wideScopeConfirmed: true,
    });

    expect(ingestion.status).toBe('ready');
    expect(ingestion.files).toHaveLength(1);
    expect(ingestion.files[0].status).toBe('ready');
    expect(
      ingestion.diagnostics.filter(({ severity }) => severity === 'error'),
    ).toEqual([]);
    expect(ingestion.records).toHaveLength(48);
    expect(ingestion.tables.tAlphaBeta).toHaveLength(48);
    expect(ingestion.tables.betaTp).toEqual([]);

    const audit = ingestion.wideSeriesAudit?.[0];
    expect(audit).toBeDefined();
    expect(ingestion.files[0].wideSeriesAudit).toEqual(audit);
    expect(audit).toMatchObject({
      layout: 'wide-series',
      source: {
        fileName: basename(fileURLToPath(SOURCE_URL)),
        fileType: 'xlsx',
        sheetName: EXPECTED_SHEET,
      },
      headerRow: HEADER_ROW,
      headerSourceRow: HEADER_ROW + 1,
      decimalSeparator: '.',
      alphaGrid: ALPHA_VALUES,
      rawObservationCount: 1716,
      projectedPointCount: 48,
      scopeConfirmed: true,
    });
    expect(audit!.series).toEqual(definitions);
    expect(audit!.branches).toEqual([
      expect.objectContaining({
        runId: 'paper010-rh-5',
        sourceObservationCount: 574,
        selectedObservationCount: 307,
        startSourceRow: 119,
        endSourceRow: 425,
      }),
      expect.objectContaining({
        runId: 'paper010-rh-10',
        sourceObservationCount: 574,
        selectedObservationCount: 331,
        startSourceRow: 137,
        endSourceRow: 467,
      }),
      expect.objectContaining({
        runId: 'paper010-rh-20',
        sourceObservationCount: 568,
        selectedObservationCount: 365,
        startSourceRow: 131,
        endSourceRow: 495,
      }),
    ]);
    expect(
      audit!.excludedPopulatedColumns,
    ).toEqual([
      [12, 'temperature', 575, 578],
      [13, 'weight', 575, 578],
      [14, 'temperature', 574, 577],
      [15, 'weight', 574, 577],
      [16, 'temperature', 567, 570],
      [17, 'weight', 567, 570],
      [18, 'temperature', 575, 578],
      [19, 'DTG', 575, 578],
      [20, 'temperature', 574, 577],
      [21, 'DTG', 574, 577],
      [22, 'temperature', 567, 570],
      [23, 'DTG', 567, 570],
      [24, 'temperature', 574, 577],
      [25, 'DTG', 574, 577],
      [26, 'temperature', 570, 573],
      [27, 'DTG', 570, 573],
      [28, 'temperature', 567, 570],
      [29, 'DTG', 567, 570],
      [30, 'temperature', 574, 577],
      [31, 'DTG', 574, 577],
      [32, 'temperature', 570, 573],
      [33, 'DTG', 570, 573],
      [34, 'temperature', 567, 570],
      [35, 'DTG', 567, 570],
    ].map(([
      columnIndex,
      sourceHeader,
      populatedRowCount,
      lastSourceRow,
    ]) => ({
      columnIndex,
      sourceHeader,
      populatedRowCount,
      firstSourceRow: 4,
      lastSourceRow,
    })));

    const direct = projectWideSeriesTable(
      await lockedRawTable(),
      {
        fileName: basename(fileURLToPath(SOURCE_URL)),
        fileType: 'xlsx',
        sheetName: EXPECTED_SHEET,
      },
      wideOptions(),
      ALPHA_VALUES,
    );
    expect(direct.status).toBe('ready');
    const expectedPointAudit = direct.projectedPoints.map((point) => ({
      seriesId: point.seriesId,
      runId: point.runId,
      alpha: point.alpha,
      sourceRows: [...point.sourceRows],
      ...(point.derivativeSourceRows
        ? { derivativeSourceRows: [...point.derivativeSourceRows] }
        : {}),
    }));
    expect(audit!.points).toEqual(expectedPointAudit);
    expect(
      createHash('sha256')
        .update(JSON.stringify(audit!.points.map((point) => [
          point.seriesId,
          point.runId,
          point.alpha,
          point.sourceRows,
          point.derivativeSourceRows ?? null,
        ])))
        .digest('hex'),
    ).toBe(EXPECTED_AUDIT_POINTS_SHA256);
    expect(
      ingestion.records.map(({ runId, alpha, provenance }) => ({
        seriesId: runId,
        runId,
        alpha,
        sourceRows: provenance.sourceRows,
        derivativeSourceRows: provenance.derivativeSourceRows,
      })),
    ).toEqual(expectedPointAudit);
    expect(
      ingestion.records.every(
        ({ provenance }) => (
          provenance.sourceRows !== undefined
          && provenance.sourceRow === provenance.sourceRows[0]
          && provenance.derivativeSourceRows !== undefined
        ),
      ),
    ).toBe(true);

    const adapted = buildThermalRuns(ingestion);
    expect(adapted.diagnostics).toEqual([]);
    expect(adapted.runs).toHaveLength(3);
    expect(adapted.kissingerPeaks).toEqual([]);
    expect(
      adapted.runs.map(({ id, points, stage }) => ({
        id,
        pointCount: points.length,
        stage,
      })),
    ).toEqual([
      {
        id: 'paper010-rh-5',
        pointCount: 16,
        stage: STAGE,
      },
      {
        id: 'paper010-rh-10',
        pointCount: 16,
        stage: STAGE,
      },
      {
        id: 'paper010-rh-20',
        pointCount: 16,
        stage: STAGE,
      },
    ]);

    const analysis = analyzeActivationEnergy(adapted.runs, {
      alphaValues: ALPHA_VALUES,
      methods: METHODS,
      includeKissinger: false,
    });
    expect(analysis.eligibility.eligible).toBe(true);
    expect(analysis.kissinger).toBeUndefined();
    expect(
      analysis.methods.reduce(
        (total, method) => total + method.estimates.length,
        0,
      ),
    ).toBe(64);
    expect(analysis.methods.every(({ refusals }) => refusals.length === 0))
      .toBe(true);
  });

  it('refuses Friedman after the same positive -dm/dt columns are misdeclared as signed dm/dt', async () => {
    const table = await lockedRawTable();
    const source: IngestionSource = {
      fileName: basename(fileURLToPath(SOURCE_URL)),
      fileType: 'xlsx',
      sheetName: EXPECTED_SHEET,
    };
    const incorrectlySigned = projectWideSeriesTable(
      table,
      source,
      wideOptions('massChangeRate'),
      ALPHA_VALUES,
    );

    expect(incorrectlySigned.status).toBe('ready');
    expect(
      incorrectlySigned.projectedPoints.every(
        ({ dAlphaDtPerMinute }) => dAlphaDtPerMinute! < 0,
      ),
    ).toBe(true);
    const incorrectlySignedObservation =
      incorrectlySigned.dataset!.observations.find(
        ({ runId, sourceRow }) => (
          runId === 'paper010-rh-5' && sourceRow === 119
        ),
      );
    expect(incorrectlySignedObservation).toBeDefined();
    expect(incorrectlySignedObservation!.rawDerivativeValue).toBe(0.40233);
    expect(incorrectlySignedObservation!.dAlphaDtPerMinute).toBeCloseTo(
      -0.40233 / 100,
      14,
    );

    const analysis = analyzeActivationEnergy(
      thermalRuns(incorrectlySigned.projectedPoints),
      {
        alphaValues: ALPHA_VALUES,
        methods: ['FRIEDMAN'],
        includeKissinger: false,
      },
    );
    expect(analysis.methods).toHaveLength(1);
    expect(analysis.methods[0].status).toBe('refused');
    expect(analysis.methods[0].estimates).toEqual([]);
    expect(
      analysis.methods[0].warnings.map(({ code }) => code),
    ).toContain('FRIEDMAN_NON_POSITIVE_RATE');
    expect(
      analysis.methods[0].refusals.map(({ code }) => code),
    ).toContain('FRIEDMAN_DERIVATIVE_UNAVAILABLE');
    expect(analysis.kissinger).toBeUndefined();
  });
});
