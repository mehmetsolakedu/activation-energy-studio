import { describe, expect, it } from 'vitest';

import {
  analyzeActivationEnergy,
  prepareThermalRun,
  type Diagnostic,
  type ThermalRun,
} from '../src/core';
import { buildThermalRuns } from '../src/integration';
import {
  HEATING_RATES,
  INVALID_ANCHOR_FIXTURES,
  adapterBatch,
  alphaRunsWithReplacement,
  directAlphaRun,
  invalidAnchorRun,
  validMassRun,
} from './fixtures/alpha/alpha-safety';

function codes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

describe('AC-ALPHA-02 — invalid mass anchors fail closed', () => {
  it.each(INVALID_ANCHOR_FIXTURES)('$label', (fixture) => {
    const invalid = invalidAnchorRun(fixture);
    const preparation = prepareThermalRun(invalid);

    expect(preparation.run).toBeUndefined();
    expect(codes(preparation.refusals)).toEqual(['INVALID_ALPHA_ANCHORS']);

    const analysis = analyzeActivationEnergy(
      [validMassRun(5, 0), validMassRun(10, 1), validMassRun(20, 2), invalid],
      { alphaValues: [0.5], methods: ['FWO'], includeKissinger: false },
    );

    expect(analysis.status).toBe('refused');
    expect(codes(analysis.refusals)).toEqual(['INVALID_ALPHA_ANCHORS']);
    expect(analysis.methods).toEqual([]);
    expect(analysis.kissinger).toBeUndefined();
  });
});

describe('AC-ALPHA-03 — acquisition order and target plateaus fail closed', () => {
  it('preserves a permuted source-temperature order through the adapter and refuses globally', () => {
    const ingestion = adapterBatch({ permutedRate: 40 });
    const sourceOrder = ingestion.records.map((record) => record.temperatureK);
    const adapted = buildThermalRuns(ingestion, undefined, 'adapter test stage');
    const permuted = adapted.runs.find((run) => run.heatingRate === 40);

    expect(adapted.diagnostics).toEqual([]);
    expect(permuted?.points.map((point) => point.temperature)).toEqual([536, 616, 586, 656]);
    expect(ingestion.records.map((record) => record.temperatureK)).toEqual(sourceOrder);

    const analysis = analyzeActivationEnergy(adapted.runs, {
      alphaValues: [0.5],
      methods: ['FWO'],
      includeKissinger: false,
    });

    expect(analysis.status).toBe('refused');
    expect(codes(analysis.refusals)).toEqual(['TEMPERATURE_NOT_INCREASING']);
    expect(analysis.methods).toEqual([]);
    expect(analysis.preparedRuns.map((run) => run.id)).not.toContain('adapter-40');
  });

  it('refuses a noisy alpha decrease without clipping, sorting, or mutating the input', () => {
    const offset = 3 * 12;
    const decreasing = directAlphaRun(40, 3, [
      { temperature: 500 + offset, alpha: 0.1 },
      { temperature: 540 + offset, alpha: 0.5005 },
      { temperature: 580 + offset, alpha: 0.5 },
      { temperature: 620 + offset, alpha: 0.9 },
    ]);
    const runs = alphaRunsWithReplacement(decreasing);
    const before = structuredClone(runs);

    const analysis = analyzeActivationEnergy(runs, {
      alphaValues: [0.5],
      methods: ['KAS'],
      includeKissinger: false,
    });

    expect(analysis.status).toBe('refused');
    expect(codes(analysis.refusals)).toEqual(['NON_MONOTONIC_ALPHA']);
    expect(analysis.methods).toEqual([]);
    expect(runs).toEqual(before);
  });

  it('refuses an exact requested-alpha plateau per method without failing global eligibility', () => {
    const runs = HEATING_RATES.map((rate, index) =>
      index === 3
        ? directAlphaRun(rate, index, [
            { temperature: 536, alpha: 0.1 },
            { temperature: 566, alpha: 0.5 },
            { temperature: 586, alpha: 0.5 },
            { temperature: 636, alpha: 0.9 },
          ])
        : directAlphaRun(rate, index),
    );

    const analysis = analyzeActivationEnergy(runs, {
      alphaValues: [0.5],
      methods: ['FWO', 'KAS', 'STARINK', 'FRIEDMAN'],
      includeKissinger: false,
    });

    expect(analysis.status).toBe('refused');
    expect(codes(analysis.refusals)).toEqual([
      'AMBIGUOUS_ALPHA_CROSSING',
      'AMBIGUOUS_ALPHA_CROSSING',
      'AMBIGUOUS_ALPHA_CROSSING',
      'AMBIGUOUS_ALPHA_CROSSING',
    ]);
    expect(analysis.refusals).toEqual(
      expect.arrayContaining(
        (['FWO', 'KAS', 'STARINK', 'FRIEDMAN'] as const).map((method) =>
          expect.objectContaining({
            code: 'AMBIGUOUS_ALPHA_CROSSING',
            severity: 'refusal',
            method,
            alpha: 0.5,
            runIds: ['alpha-40'],
          }),
        ),
      ),
    );
    expect(analysis.eligibility.eligible).toBe(true);
    expect(analysis.methods.map((method) => [method.method, method.status])).toEqual([
      ['FWO', 'refused'],
      ['KAS', 'refused'],
      ['STARINK', 'refused'],
      ['FRIEDMAN', 'refused'],
    ]);
    expect(analysis.methods.every((method) => method.estimates.length === 0)).toBe(true);
    expect(analysis.kissinger).toBeUndefined();
  });

  it('does not reject a plateau that is not the requested alpha', () => {
    const runs = HEATING_RATES.map((rate, index) =>
      index === 3
        ? directAlphaRun(rate, index, [
            { temperature: 536, alpha: 0.1 },
            { temperature: 566, alpha: 0.4 },
            { temperature: 586, alpha: 0.4 },
            { temperature: 636, alpha: 0.9 },
          ])
        : directAlphaRun(rate, index),
    );

    const analysis = analyzeActivationEnergy(runs, {
      alphaValues: [0.5],
      methods: ['FWO'],
      includeKissinger: false,
    });

    expect(analysis.status).toBe('success');
    expect(codes(analysis.refusals)).not.toContain('AMBIGUOUS_ALPHA_CROSSING');
    expect(analysis.methods[0]?.estimates[0]?.observations).toHaveLength(4);
  });
});

describe('AC-ALPHA-06 — one physical stage is mandatory', () => {
  it.each([
    ['sampleId', 'different-sample'],
    ['atmosphere', 'Air'],
    ['stage', 'overlapping-shoulder'],
  ] as const)('refuses conflicting %s metadata with no result', (field, value) => {
    const replacement = directAlphaRun(40, 3, undefined, { [field]: value });
    const analysis = analyzeActivationEnergy(alphaRunsWithReplacement(replacement), {
      alphaValues: [0.5],
      methods: ['FWO'],
      includeKissinger: true,
    });

    expect(analysis.status).toBe('refused');
    expect(codes(analysis.refusals)).toEqual(['INCONSISTENT_CONTEXT']);
    expect(analysis.refusals[0]?.details).toMatchObject({ field });
    expect(analysis.methods).toEqual([]);
    expect(analysis.kissinger).toBeUndefined();
  });

  it('treats an explicitly unresolved peak overlap as an analysis-wide AMBIGUOUS_STAGE refusal', () => {
    const ambiguous: ThermalRun = {
      ...directAlphaRun(40, 3),
      peakTemperature: 580,
      peakAmbiguous: true,
    };
    const preparation = prepareThermalRun(ambiguous);

    expect(preparation.run).toBeUndefined();
    expect(codes(preparation.refusals)).toEqual(['AMBIGUOUS_STAGE']);

    const analysis = analyzeActivationEnergy(alphaRunsWithReplacement(ambiguous), {
      alphaValues: [0.5],
      methods: ['FWO', 'KAS'],
      includeKissinger: true,
    });
    expect(analysis.status).toBe('refused');
    expect(codes(analysis.refusals)).toEqual(['AMBIGUOUS_STAGE']);
    expect(analysis.methods).toEqual([]);
    expect(analysis.kissinger).toBeUndefined();
  });

  it('automatically refuses multiple peak candidates for one run instead of selecting the first', () => {
    const ingestion = adapterBatch({
      includePeakCandidates: true,
      multiplePeakRate: 20,
    });
    const adapted = buildThermalRuns(ingestion, undefined, 'adapter test stage');
    const ambiguous = adapted.runs.find((run) => run.id === 'adapter-20');

    expect(adapted.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'AMBIGUOUS_STAGE',
    ]);
    expect(ambiguous?.peakAmbiguous).toBe(true);
    expect(ambiguous?.peakTemperature).toBeUndefined();

    const analysis = analyzeActivationEnergy(adapted.runs, {
      alphaValues: [0.5],
      methods: ['FWO', 'KAS', 'STARINK', 'FRIEDMAN'],
      includeKissinger: true,
    });

    expect(analysis.status).toBe('refused');
    expect(codes(analysis.refusals)).toEqual(['AMBIGUOUS_STAGE']);
    expect(analysis.methods).toEqual([]);
    expect(analysis.kissinger).toBeUndefined();
  });

  it('keeps one independently selected peak per run eligible as a negative control', () => {
    const adapted = buildThermalRuns(
      adapterBatch({ includePeakCandidates: true }),
      undefined,
      'adapter test stage',
    );
    const analysis = analyzeActivationEnergy(adapted.runs, {
      alphaValues: [0.5],
      methods: ['FWO'],
      includeKissinger: true,
    });

    expect(adapted.diagnostics).toEqual([]);
    expect(adapted.runs.every((run) => run.peakAmbiguous !== true)).toBe(true);
    expect(analysis.status).toBe('success');
    expect(analysis.methods[0]?.estimates).toHaveLength(1);
    expect(analysis.kissinger?.status).toBe('success');
  });
});
