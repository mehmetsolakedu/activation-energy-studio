import { describe, expect, it } from 'vitest';

import {
  analyzeActivationEnergy,
  interpolateTemperatureAtAlpha,
  prepareThermalRuns,
} from '../src/core';
import {
  buildThermalRuns,
  resolveStageWindowRecords,
  type StageWindow,
} from '../src/integration';
import {
  ingestThermalFiles,
  type BatchIngestionResult,
  type IngestionOptions,
} from '../src/io';
import { createProjectReport } from '../src/report';

const mapping: IngestionOptions = {
  tableKind: 'curve',
  columnMapping: {
    temperature: { column: 0, unit: 'C', temperatureKind: 'sample' },
    massPercent: { column: 1, unit: '%' },
    heatingRate: { column: 2, unit: 'K/min' },
    run: 3,
    sample: 4,
    atmosphere: 5,
  },
};

const stageWindow: StageWindow = { startCelsius: 200, endCelsius: 400 };

async function ingestRuns(
  runs: Array<{
    id: string;
    beta: number;
    temperaturesCelsius: number[];
    massAt: (temperatureCelsius: number) => number;
  }>,
): Promise<BatchIngestionResult> {
  const rows = [
    'Temperature,Mass percent,Heating rate,Run,Sample,Atmosphere',
    ...runs.flatMap((run) =>
      run.temperaturesCelsius.map((temperature) =>
        [
          temperature,
          run.massAt(temperature),
          run.beta,
          run.id,
          'sample-a',
          'N2',
        ].join(','))),
    '',
  ];
  return ingestThermalFiles(
    [new File([rows.join('\n')], 'stage-window-mass.csv', { type: 'text/csv' })],
    [mapping],
  );
}

const linearMass = (temperatureCelsius: number) =>
  90 - 0.1 * (temperatureCelsius - 200);

describe('exact stage-window boundary contract', () => {
  it('interpolates off-grid nonlinear boundary masses without extrapolation', async () => {
    const ingestion = await ingestRuns([{
      id: 'nonlinear',
      beta: 5,
      temperaturesCelsius: [190, 230, 310, 410],
      massAt: (temperature) => {
        const known = new Map([
          [190, 100],
          [230, 95],
          [310, 70],
          [410, 20],
        ]);
        return known.get(temperature) as number;
      },
    }]);
    const resolution = resolveStageWindowRecords(ingestion.records, stageWindow);

    expect(resolution.status).toBe('ok');
    if (resolution.status !== 'ok') return;
    expect(resolution.start.method).toBe('linear-interpolation');
    expect(resolution.end.method).toBe('linear-interpolation');
    expect(resolution.start.record.massPercent).toBeCloseTo(98.75, 12);
    expect(resolution.end.record.massPercent).toBeCloseTo(25, 12);
    expect(resolution.start.sourceRows).toEqual([2, 3]);
    expect(resolution.end.sourceRows).toEqual([4, 5]);
  });

  it('uses exact source rows at coincident boundaries without duplicate points', async () => {
    const ingestion = await ingestRuns([{
      id: 'exact',
      beta: 5,
      temperaturesCelsius: [200, 250, 300, 350, 400],
      massAt: linearMass,
    }]);
    const resolution = resolveStageWindowRecords(ingestion.records, stageWindow);

    expect(resolution.status).toBe('ok');
    if (resolution.status !== 'ok') return;
    expect(resolution.start.method).toBe('source-row');
    expect(resolution.end.method).toBe('source-row');
    expect(resolution.records.map(({ temperatureK }) => temperatureK - 273.15))
      .toEqual([200, 250, 300, 350, 400]);
  });

  it('makes T(alpha=0.5) invariant to shifted sampling grids', async () => {
    const ingestion = await ingestRuns([
      {
        id: 'grid-exact',
        beta: 5,
        temperaturesCelsius: [200, 250, 300, 350, 400],
        massAt: linearMass,
      },
      {
        id: 'grid-late',
        beta: 10,
        temperaturesCelsius: [190, 235, 280, 325, 370, 415],
        massAt: linearMass,
      },
      {
        id: 'grid-early',
        beta: 20,
        temperaturesCelsius: [180, 225, 270, 315, 360, 405],
        massAt: linearMass,
      },
    ]);
    const adapted = buildThermalRuns(ingestion, stageWindow);
    const prepared = prepareThermalRuns(adapted.runs);

    expect(adapted.diagnostics).toEqual([]);
    expect(prepared.refusals).toEqual([]);
    expect(prepared.runs).toHaveLength(3);
    for (const run of prepared.runs) {
      expect(interpolateTemperatureAtAlpha(run.points, 0.5)).toBeCloseTo(573.15, 10);
    }
  });

  it.each([
    [{ startCelsius: 400, endCelsius: 200 }, 'INVALID_STAGE_WINDOW'],
    [{ startCelsius: Number.NaN, endCelsius: 400 }, 'INVALID_STAGE_WINDOW'],
    [{ startCelsius: 200, endCelsius: Number.POSITIVE_INFINITY }, 'INVALID_STAGE_WINDOW'],
  ])('refuses invalid stage window %o', async (window, code) => {
    const ingestion = await ingestRuns([{
      id: 'invalid-window',
      beta: 5,
      temperaturesCelsius: [190, 250, 310, 410],
      massAt: linearMass,
    }]);
    const adapted = buildThermalRuns(ingestion, window);

    expect(adapted.runs).toEqual([]);
    expect(adapted.diagnostics).toContainEqual(expect.objectContaining({ code }));
  });

  it('refuses a boundary outside the measured range', async () => {
    const ingestion = await ingestRuns([{
      id: 'not-bracketed',
      beta: 5,
      temperaturesCelsius: [210, 250, 300, 350, 410],
      massAt: linearMass,
    }]);
    const adapted = buildThermalRuns(ingestion, stageWindow);

    expect(adapted.runs).toEqual([]);
    expect(adapted.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'STAGE_WINDOW_NOT_BRACKETED' }),
    );
  });

  it('refuses non-increasing acquisition order instead of sorting it', async () => {
    const ingestion = await ingestRuns([{
      id: 'permuted',
      beta: 5,
      temperaturesCelsius: [190, 310, 250, 410],
      massAt: linearMass,
    }]);
    const adapted = buildThermalRuns(ingestion, stageWindow);

    expect(adapted.runs).toEqual([]);
    expect(adapted.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'TEMPERATURE_NOT_INCREASING' }),
    );
  });

  it('reports the exact adapter mass anchors and their source rows', async () => {
    const ingestion = await ingestRuns([
      {
        id: 'report-5',
        beta: 5,
        temperaturesCelsius: [190, 250, 310, 410],
        massAt: linearMass,
      },
      {
        id: 'report-10',
        beta: 10,
        temperaturesCelsius: [180, 240, 300, 420],
        massAt: linearMass,
      },
      {
        id: 'report-20',
        beta: 20,
        temperaturesCelsius: [170, 230, 330, 430],
        massAt: linearMass,
      },
    ]);
    const adapted = buildThermalRuns(ingestion, stageWindow);
    const analysis = analyzeActivationEnergy(adapted.runs, {
      alphaValues: [0.5],
      methods: ['KAS'],
      includeKissinger: false,
    });
    const report = createProjectReport(
      analysis,
      {
        projectName: 'Stage-window anchor audit',
        sample: 'sample-a',
        process: 'thermal decomposition',
        stage: '200.0-400.0 °C',
        atmosphere: 'N2',
        sourceFiles: [{
          name: 'stage-window-mass.csv',
          sizeBytes: 1,
          sha256: 'a'.repeat(64),
        }],
      },
      {
        ingestion,
        ingestionOptions: [mapping],
        stageWindow,
        analysisConfiguration: {
          alphaGrid: [0.5],
          methods: ['KAS'],
          includeKissinger: false,
        },
      },
    );

    const normalization = report.reproducibility.preprocessing.massNormalization;
    expect(normalization).toHaveLength(3);
    for (const entry of normalization) {
      const run = adapted.runs.find(({ id }) => id === entry.runId);
      expect(entry.initialValue).toBeCloseTo(run?.massReference?.initialMass as number, 12);
      expect(entry.finalValue).toBeCloseTo(run?.massReference?.finalMass as number, 12);
      expect(entry.initialAnchor?.temperatureCelsius).toBeCloseTo(200, 12);
      expect(entry.finalAnchor?.temperatureCelsius).toBeCloseTo(400, 12);
      expect(entry.initialAnchor?.sourceRows.length).toBeGreaterThanOrEqual(1);
      expect(entry.finalAnchor?.sourceRows.length).toBeGreaterThanOrEqual(1);
    }
  });
});
