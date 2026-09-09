import { describe, expect, it } from 'vitest';

import {
  GAS_CONSTANT_J_PER_MOL_K,
  analyzeActivationEnergy,
  estimateAlphaDerivative,
  prepareThermalRun,
  type ThermalRun,
} from '../src/core';
import { buildThermalRuns } from '../src/integration';
import {
  ingestThermalFile,
  normalizeThermalTable,
  projectWideSeriesTable,
  type BatchIngestionResult,
  type IngestionSource,
  type IngestionResult,
  type NormalizedThermalRecord,
  type RawTable,
  type WideSeriesDefinition,
} from '../src/io';

function asBatch(ingestion: IngestionResult): BatchIngestionResult {
  return {
    status: ingestion.status,
    files: [ingestion],
    diagnostics: ingestion.diagnostics,
    records: ingestion.records,
    tables: ingestion.tables,
    ...(ingestion.wideSeriesAudit
      ? { wideSeriesAudit: [ingestion.wideSeriesAudit] }
      : {}),
  };
}

function partialTimeTable(): RawTable {
  const rows: Array<Array<string | number>> = [[
    'temperature',
    'time',
    'alpha',
    'beta',
    'run',
    'sample',
    'atmosphere',
    'stage',
  ]];

  for (const [index, beta] of [5, 10, 20, 40].entries()) {
    const targetTemperature = [560, 590, 620, 650][index];
    const derivative = Math.exp(
      28 - 140_000 / (GAS_CONSTANT_J_PER_MOL_K * targetTemperature),
    );
    const deltaTime = 0.1 / derivative;
    const deltaTemperature = beta * deltaTime;
    const temperatures = [
      targetTemperature - deltaTemperature,
      targetTemperature,
      targetTemperature + deltaTemperature,
    ];
    const times = index === 3
      ? [0, deltaTime, 5 * deltaTime]
      : [0, deltaTime, 2 * deltaTime];

    for (let point = 0; point < 3; point += 1) {
      rows.push([
        temperatures[point],
        index === 3 && point === 1 ? '' : times[point],
        [0.4, 0.5, 0.6][point],
        beta,
        `long-${beta}`,
        'partial-time-regression',
        'N2',
        'main',
      ]);
    }
  }
  return rows;
}

const betas = [5, 10, 20, 40] as const;
const targetTemperatures = [560, 590, 620, 650] as const;
const sourceAlphas = Array.from(
  { length: 81 },
  (_, index) => Number((0.1 + index * 0.01).toFixed(2)),
);

function wideFixture(): {
  csv: string;
  rawTable: RawTable;
  definitions: WideSeriesDefinition[];
} {
  const headers: string[] = [];
  const definitions: WideSeriesDefinition[] = [];
  for (let index = 0; index < betas.length; index += 1) {
    headers.push(`T${betas[index]}`, `alpha${betas[index]}`);
    definitions.push({
      seriesId: `series-${betas[index]}`,
      runId: `run-${betas[index]}`,
      temperature: { columnIndex: index * 2, unit: 'K' },
      signal: { kind: 'alpha', columnIndex: index * 2 + 1, unit: 'fraction' },
      heatingRate: { value: betas[index], unit: 'K/min' },
      context: { sample: 'grid-audit', atmosphere: 'N2', stage: 'main' },
    });
  }

  const rows = sourceAlphas.map((alpha) => betas.flatMap((beta, index) => {
    const targetTemperature = targetTemperatures[index];
    const trueDerivative = Math.exp(
      28 - 140_000 / (GAS_CONSTANT_J_PER_MOL_K * targetTemperature),
    );
    const linearScale = beta / trueDerivative;
    const delta = alpha - 0.5;
    const temperature = targetTemperature + linearScale * delta + 500 * delta ** 3;
    return [temperature, alpha];
  }));

  const rawTable: RawTable = [headers, ...rows];
  return {
    csv: rawTable.map((row) => row.join(',')).join('\n'),
    rawTable,
    definitions,
  };
}

async function analyzeWideFixture(alphaGrid: readonly number[]) {
  const fixture = wideFixture();
  const ingestion = await ingestThermalFile(
    new File([fixture.csv], 'wide-grid-regression.csv', { type: 'text/csv' }),
    {
      layout: 'wide-series',
      headerRow: 0,
      decimalSeparator: '.',
      wideSeries: fixture.definitions,
      wideAlphaGrid: alphaGrid,
      wideScopeConfirmed: true,
    },
  );
  expect(ingestion.status, JSON.stringify(ingestion.diagnostics)).toBe('ready');

  const adapted = buildThermalRuns(asBatch(ingestion));
  expect(adapted.diagnostics).toEqual([]);
  const analysis = analyzeActivationEnergy(adapted.runs, {
    alphaValues: alphaGrid,
    methods: ['KAS', 'FRIEDMAN'],
    includeKissinger: false,
  });
  const atHalf = (method: 'KAS' | 'FRIEDMAN') => analysis.methods
    .find((result) => result.method === method)
    ?.estimates.find((estimate) => estimate.alpha === 0.5);

  return { ingestion, analysis, kas: atHalf('KAS'), friedman: atHalf('FRIEDMAN') };
}

describe('v0.3.2 scientific blocker regressions', () => {
  it('fails closed when one cell is missing from a mapped time series', () => {
    const directRun: ThermalRun = {
      id: 'partial-time-direct',
      heatingRate: 10,
      heatingRateUnit: 'K/min',
      temperatureUnit: 'K',
      timeUnit: 'min',
      sampleId: 'partial-time-regression',
      atmosphere: 'N2',
      stage: 'main',
      points: [
        { temperature: 500, time: 0, alpha: 0.1 },
        { temperature: 510, alpha: 0.5 },
        { temperature: 530, time: 2, alpha: 0.9 },
      ],
    };
    const direct = prepareThermalRun(directRun);
    expect(direct.run).toBeUndefined();
    expect(direct.refusals.map(({ code }) => code)).toContain('INVALID_TIME_SERIES');
    expect(() => estimateAlphaDerivative([
      { temperatureK: 500, timeMinutes: 0, alpha: 0.1 },
      { temperatureK: 510, alpha: 0.5 },
      { temperatureK: 530, timeMinutes: 2, alpha: 0.9 },
    ], 10)).toThrow(/complete finite time series/i);

    const ingestion = normalizeThermalTable(
      partialTimeTable(),
      { fileName: 'partial-time.csv', fileType: 'csv' },
      {
        headerRow: 0,
        decimalSeparator: '.',
        columnMapping: {
          temperature: { column: 'temperature', unit: 'K' },
          time: { column: 'time', unit: 'min' },
          alpha: { column: 'alpha', unit: 'fraction' },
          heatingRate: { column: 'beta', unit: 'K/min' },
          run: 'run',
          sample: 'sample',
          atmosphere: 'atmosphere',
          stage: 'stage',
        },
        tableKind: 'curve',
      },
    );
    expect(ingestion.status).toBe('ready');
    const adapted = buildThermalRuns(asBatch(ingestion));
    const analysis = analyzeActivationEnergy(adapted.runs, {
      alphaValues: [0.5],
      methods: ['FRIEDMAN'],
      includeKissinger: false,
    });
    expect(analysis.status).toBe('refused');
    expect(analysis.refusals).toContainEqual(
      expect.objectContaining({
        code: 'INVALID_TIME_SERIES',
        runIds: ['long-40'],
      }),
    );
  });

  it('derives wide-series Friedman rates from raw observations before alpha projection', async () => {
    const coarse = await analyzeWideFixture([
      0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
    ]);
    const fine = await analyzeWideFixture([
      0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5,
      0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9,
    ]);

    expect(coarse.analysis.status).toBe('success');
    expect(fine.analysis.status).toBe('success');
    expect(coarse.friedman).toBeDefined();
    expect(fine.friedman).toBeDefined();
    expect(coarse.friedman!.activationEnergyKJPerMol).toBeCloseTo(140, 0);
    expect(fine.friedman!.activationEnergyKJPerMol).toBeCloseTo(140, 0);
    expect(
      Math.abs(
        coarse.friedman!.activationEnergyKJPerMol
        - fine.friedman!.activationEnergyKJPerMol,
      ),
    ).toBeLessThan(1e-10);

    expect(coarse.kas!.activationEnergyKJPerMol).toBeCloseTo(
      fine.kas!.activationEnergyKJPerMol,
      12,
    );
    expect(coarse.analysis.warnings.map(({ code }) => code)).toContain(
      'NUMERICAL_DERIVATIVE',
    );
    expect(fine.analysis.warnings.map(({ code }) => code)).toContain(
      'NUMERICAL_DERIVATIVE',
    );
    const coarseHalfRecord = coarse.ingestion.records.find(
      ({ alpha, runId }) => alpha === 0.5 && runId === 'run-5',
    );
    expect(coarseHalfRecord).toMatchObject({
      dAlphaDtSource: 'temperature',
      provenance: {
        sourceRows: [42],
        derivativeSourceRows: [41, 42, 43],
      },
    });
    expect(coarse.analysis.preparedRuns.every(
      ({ derivativeSource }) => derivativeSource === 'temperature',
    )).toBe(true);
    expect(fine.analysis.preparedRuns.every(
      ({ derivativeSource }) => derivativeSource === 'temperature',
    )).toBe(true);
  });

  it('refuses projected wide-series rows when a caller drops the raw-grid derivative contract', () => {
    const fixture = wideFixture();
    const source: IngestionSource = {
      fileName: 'wide-grid-malformed-adapter.csv',
      fileType: 'csv',
    };
    const projection = projectWideSeriesTable(
      fixture.rawTable,
      source,
      {
        headerRow: 0,
        decimalSeparator: '.',
        series: fixture.definitions,
      },
      [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
    );
    expect(projection.status).toBe('ready');

    const malformedRecords: NormalizedThermalRecord[] = projection.projectedPoints
      .map((point) => ({
        temperatureK: point.temperatureK,
        temperatureKind: 'sample',
        alpha: point.alpha,
        heatingRateKPerMin: point.heatingRateKPerMin,
        runId: point.runId,
        sample: point.context.sample,
        atmosphere: point.context.atmosphere,
        stage: point.context.stage,
        provenance: {
          fileName: source.fileName,
          sourceRow: point.sourceRows[0],
          sourceRows: [...point.sourceRows],
        },
      }));
    const adapted = buildThermalRuns({
      status: 'ready',
      files: [],
      diagnostics: [],
      records: malformedRecords,
      tables: { tAlphaBeta: [], betaTp: [] },
    });

    expect(adapted.runs).toEqual([]);
    expect(adapted.diagnostics).toHaveLength(4);
    expect(adapted.diagnostics.every(
      ({ code }) => code === 'WIDE_PROJECTED_DERIVATIVE_MISSING',
    )).toBe(true);
  });
});
