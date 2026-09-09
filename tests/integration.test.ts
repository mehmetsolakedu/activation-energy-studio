import { describe, expect, it } from 'vitest';

import type { BatchIngestionResult } from '../src/io';
import { buildThermalRuns } from '../src/integration';

function readyBatch(): BatchIngestionResult {
  const base = {
    temperatureKind: 'sample' as const,
    heatingRateKPerMin: 10,
    runId: 'run-10',
    provenance: { fileName: 'run-10.csv', sourceRow: 2 },
  };
  return {
    status: 'ready',
    files: [],
    diagnostics: [],
    records: [
      { ...base, temperatureK: 473.15, massPercent: 100 },
      { ...base, temperatureK: 573.15, massPercent: 70 },
      { ...base, temperatureK: 673.15, massPercent: 40 },
    ],
    tables: { tAlphaBeta: [], betaTp: [] },
  };
}

describe('I/O to scientific core adapter', () => {
  it('requires an explicit stage window for raw mass curves', () => {
    const result = buildThermalRuns(readyBatch());
    expect(result.diagnostics.some((item) => item.code === 'STAGE_WINDOW_REQUIRED')).toBe(true);
    expect(result.runs[0].massReference).toBeUndefined();
  });

  it('derives stage-specific mass references only after explicit selection', () => {
    const result = buildThermalRuns(readyBatch(), { startCelsius: 200, endCelsius: 400 });
    expect(result.diagnostics).toEqual([]);
    expect(result.runs[0].massReference).toEqual({ initialMass: 100, finalMass: 40 });
    expect(result.runs[0].stage).toBe('200.0-400.0 °C');
  });

  it('keeps a standalone beta-Tp table as explicit Kissinger peaks without fake curves', () => {
    const batch: BatchIngestionResult = {
      status: 'ready',
      files: [],
      diagnostics: [],
      records: [],
      tables: {
        tAlphaBeta: [],
        betaTp: [5, 10, 20, 40].map((heatingRateKPerMin, index) => ({
          heatingRateKPerMin,
          peakTemperatureK: 580 + index * 20,
          runId: `peak-${heatingRateKPerMin}`,
          sample: 'sample-a',
          atmosphere: 'N2',
          provenance: { fileName: 'peaks.tsv', sourceRow: index + 2 },
        })),
      },
    };

    const result = buildThermalRuns(batch, undefined, 'main peak stage');

    expect(result.diagnostics).toEqual([]);
    expect(result.runs).toEqual([]);
    expect(result.kissingerPeaks).toEqual([
      { runId: 'peak-5', heatingRateKPerMinute: 5, peakTemperatureK: 580, stage: 'main peak stage' },
      { runId: 'peak-10', heatingRateKPerMinute: 10, peakTemperatureK: 600, stage: 'main peak stage' },
      { runId: 'peak-20', heatingRateKPerMinute: 20, peakTemperatureK: 620, stage: 'main peak stage' },
      { runId: 'peak-40', heatingRateKPerMinute: 40, peakTemperatureK: 640, stage: 'main peak stage' },
    ]);
  });

  it('rejects conflicting sample context inside one run instead of keeping the first row', () => {
    const batch = readyBatch();
    batch.records = batch.records.map((record, index) => ({
      ...record,
      sample: index === 1 ? 'sample-b' : 'sample-a',
    }));

    const result = buildThermalRuns(batch, { startCelsius: 200, endCelsius: 400 });

    expect(result.runs).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'INCONSISTENT_CONTEXT',
        runId: 'run-10',
      }),
    );
  });
});
