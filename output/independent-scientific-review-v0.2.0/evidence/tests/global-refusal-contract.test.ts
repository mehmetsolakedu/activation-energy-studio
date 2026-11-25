import { describe, expect, it } from 'vitest';

import {
  analyzeActivationEnergy,
  calculateKissinger,
  type ThermalPoint,
  type ThermalRun,
} from '../src/core';

const POINTS: readonly ThermalPoint[] = [
  { temperature: 500, alpha: 0.1 },
  { temperature: 600, alpha: 0.5 },
  { temperature: 700, alpha: 0.9 },
];

function run(id: string, heatingRate: number, points: readonly ThermalPoint[] = POINTS): ThermalRun {
  return {
    id,
    heatingRate,
    heatingRateUnit: 'K/min',
    temperatureUnit: 'K',
    points,
    sampleId: 'global-contract',
    atmosphere: 'N2',
    stage: 'main',
  };
}

function summary(analysis: ReturnType<typeof analyzeActivationEnergy>) {
  return {
    status: analysis.status,
    codes: analysis.refusals.map(({ code }) => code),
    methods: analysis.methods.length,
    kissinger: analysis.kissinger === undefined ? 'absent' : analysis.kissinger.status,
  };
}

describe('AC-EL-04 global refusal table snapshot', () => {
  it('locks exact reason codes and no-result behavior for every global critical class', () => {
    const unknownTemperature = analyzeActivationEnergy([
      { ...run('unknown-temperature', 5), temperatureUnit: 'unknown' },
      run('temperature-10', 10),
      run('temperature-20', 20),
    ]);
    const unknownHeatingRate = analyzeActivationEnergy([
      { ...run('unknown-rate', 5), heatingRateUnit: 'unknown' },
      run('rate-10', 10),
      run('rate-20', 20),
    ]);
    const nonFiniteCritical = analyzeActivationEnergy([
      run('finite-5', 5),
      run('finite-10', 10),
      run('nonfinite-20', 20, [
        { temperature: 500, alpha: 0.1 },
        { temperature: Number.NaN, alpha: 0.5 },
        { temperature: 700, alpha: 0.9 },
      ]),
    ]);
    const noCommonAlpha = analyzeActivationEnergy([
      run('low-5', 5, [
        { temperature: 500, alpha: 0.05 },
        { temperature: 550, alpha: 0.15 },
        { temperature: 600, alpha: 0.25 },
      ]),
      run('mid-10', 10, [
        { temperature: 500, alpha: 0.35 },
        { temperature: 550, alpha: 0.45 },
        { temperature: 600, alpha: 0.55 },
      ]),
      run('high-20', 20, [
        { temperature: 500, alpha: 0.65 },
        { temperature: 550, alpha: 0.75 },
        { temperature: 600, alpha: 0.85 },
      ]),
    ]);
    const ambiguousStage = calculateKissinger([
      { runId: 'peak-5', heatingRateKPerMinute: 5, peakTemperatureK: 580, stage: 'main' },
      { runId: 'peak-10', heatingRateKPerMinute: 10, peakTemperatureK: 600, stage: 'main' },
      { runId: 'peak-20', heatingRateKPerMinute: 20, peakTemperatureK: 620, stage: 'shoulder' },
    ]);

    expect({
      unknownTemperature: summary(unknownTemperature),
      unknownHeatingRate: summary(unknownHeatingRate),
      nonFiniteCritical: summary(nonFiniteCritical),
      noCommonAlpha: summary(noCommonAlpha),
      ambiguousStage: {
        status: ambiguousStage.status,
        codes: ambiguousStage.refusals.map(({ code }) => code),
        observations: ambiguousStage.observations.length,
        regression: ambiguousStage.regression === undefined ? 'absent' : 'present',
      },
    }).toEqual({
      unknownTemperature: {
        status: 'refused',
        codes: ['UNKNOWN_TEMPERATURE_UNIT', 'INSUFFICIENT_DISTINCT_HEATING_RATES'],
        methods: 0,
        kissinger: 'absent',
      },
      unknownHeatingRate: {
        status: 'refused',
        codes: ['UNKNOWN_HEATING_RATE_UNIT', 'INSUFFICIENT_DISTINCT_HEATING_RATES'],
        methods: 0,
        kissinger: 'absent',
      },
      nonFiniteCritical: {
        status: 'refused',
        codes: ['NON_FINITE_VALUE', 'INSUFFICIENT_DISTINCT_HEATING_RATES'],
        methods: 0,
        kissinger: 'absent',
      },
      noCommonAlpha: {
        status: 'refused',
        codes: ['NO_COMMON_ALPHA_RANGE'],
        methods: 0,
        kissinger: 'absent',
      },
      ambiguousStage: {
        status: 'refused',
        codes: ['AMBIGUOUS_STAGE'],
        observations: 0,
        regression: 'absent',
      },
    });
  });
});
