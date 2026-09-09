import { describe, expect, it } from 'vitest';

import sampleCsv from '../examples/synthetic_kas_150.csv?raw';
import { analyzeActivationEnergy } from '../src/core';
import { ingestThermalFiles } from '../src/io';
import { buildThermalRuns } from '../src/integration';

describe('complete scientific data path', () => {
  it('recovers the designed KAS value through real CSV ingestion', async () => {
    const file = new File([sampleCsv], 'synthetic_kas_150.csv', { type: 'text/csv' });
    const ingestion = await ingestThermalFiles([file]);
    expect(ingestion.status).toBe('ready');

    const adapted = buildThermalRuns(
      ingestion,
      undefined,
      'synthetic supplied-alpha 0.10-0.90 stage',
    );
    expect(adapted.diagnostics).toEqual([]);
    expect(adapted.runs).toHaveLength(4);

    const analysis = analyzeActivationEnergy(adapted.runs, {
      alphaValues: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
      methods: ['FWO', 'KAS', 'STARINK', 'FRIEDMAN'],
      includeKissinger: false,
    });
    const kas = analysis.methods.find((method) => method.method === 'KAS');
    expect(kas?.status).toBe('success');
    expect(kas?.estimates).toHaveLength(9);
    for (const estimate of kas?.estimates ?? []) {
      expect(estimate.activationEnergyKJPerMol).toBeCloseTo(150, 4);
      expect(estimate.regression.r2).toBeCloseTo(1, 8);
    }
  });

  it('runs a standalone beta-Tp Kissinger analysis without fabricating TGA curves', () => {
    const analysis = analyzeActivationEnergy([], {
      methods: [],
      includeKissinger: true,
      kissingerPeaks: [
        { runId: 'peak-5', heatingRateKPerMinute: 5, peakTemperatureK: 580, stage: 'main peak' },
        { runId: 'peak-10', heatingRateKPerMinute: 10, peakTemperatureK: 600, stage: 'main peak' },
        { runId: 'peak-20', heatingRateKPerMinute: 20, peakTemperatureK: 620, stage: 'main peak' },
        { runId: 'peak-40', heatingRateKPerMinute: 40, peakTemperatureK: 640, stage: 'main peak' },
      ],
    });

    expect(analysis.status).toBe('success');
    expect(analysis.preparedRuns).toEqual([]);
    expect(analysis.methods).toEqual([]);
    expect(analysis.eligibility).toMatchObject({
      eligible: true,
      distinctHeatingRates: 4,
      refusals: [],
    });
    expect(analysis.kissinger).toMatchObject({
      method: 'KISSINGER',
      resultType: 'peak',
      alpha: null,
      formulaId: 'kissinger_peak_ln_v1',
      status: 'success',
    });
    expect(analysis.kissinger?.activationEnergyKJPerMol).toBeGreaterThan(0);
  });
});
