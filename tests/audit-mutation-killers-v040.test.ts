import { describe, expect, it } from 'vitest';

import {
  calculateFriedman,
  calculateFWO,
  calculateKAS,
  calculateKissinger,
  calculateStarink,
  ordinaryLeastSquares,
  prepareThermalRun,
  studentTCritical95,
  type KissingerPeak,
  type PreparedRun,
  type ThermalRun,
} from '../src/core';

const R_ORACLE = 8.31446261815324;
const BETAS = [5, 10, 20, 40] as const;

function solveTemperature(
  beta: number,
  exponent: number,
  slopeCoefficient: number,
  energyKJPerMol: number,
  intercept: number,
): number {
  const residual = (temperatureK: number) =>
    Math.log(beta / temperatureK ** exponent)
    - intercept
    + (slopeCoefficient * energyKJPerMol * 1000) / (R_ORACLE * temperatureK);
  let lower = 250;
  let upper = 2500;
  for (let iteration = 0; iteration < 160; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (residual(middle) > 0) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

function preparedRuns(
  exponent: number,
  slopeCoefficient: number,
  energyKJPerMol: number,
  intercept: number,
): PreparedRun[] {
  return BETAS.map((beta) => {
    const target = solveTemperature(
      beta,
      exponent,
      slopeCoefficient,
      energyKJPerMol,
      intercept,
    );
    return {
      id: `mutation-beta-${beta}`,
      heatingRateKPerMinute: beta,
      derivativeSource: 'provided',
      sampleId: 'mutation-killer',
      atmosphere: 'N2',
      stage: 'single',
      points: [
        { alpha: 0.4, temperatureK: target - 8, dAlphaDtPerMinute: 0.01 },
        { alpha: 0.5, temperatureK: target, dAlphaDtPerMinute: 0.02 },
        { alpha: 0.6, temperatureK: target + 8, dAlphaDtPerMinute: 0.03 },
      ],
    };
  });
}

function validPeak(beta: number, temperatureK: number): KissingerPeak {
  return {
    runId: `mutation-peak-${beta}`,
    heatingRateKPerMinute: beta,
    peakTemperatureK: temperatureK,
    stage: 'single',
    peakResolved: true,
    peakQuality: 'clear-interior',
    sourceSignal: 'positive-dalpha-dt',
    analystConfirmed: true,
  };
}

function energy(result: ReturnType<typeof calculateKAS>): number {
  expect(result.status).toBe('success');
  expect(result.estimates).toHaveLength(1);
  return result.estimates[0]!.activationEnergyKJPerMol;
}

function prepare(run: ThermalRun): PreparedRun {
  const result = prepareThermalRun(run);
  expect(result.refusals).toEqual([]);
  expect(result.run).toBeDefined();
  return result.run!;
}

describe('mutation killers: equation constants and transforms', () => {
  it('kills R, sign, kJ conversion, natural-log, and FWO coefficient mutants', () => {
    const result = calculateFWO(preparedRuns(0, 1.052, 135, 29), [0.5]);
    expect(result.status).toBe('success');
    expect(result.estimates[0]!.activationEnergyKJPerMol).toBeCloseTo(135, 9);
  });

  it('kills Starink temperature-exponent and slope-coefficient mutants', () => {
    const result = calculateStarink(preparedRuns(1.92, 1.0008, 165, 18), [0.5]);
    expect(result.status).toBe('success');
    expect(result.estimates[0]!.activationEnergyKJPerMol).toBeCloseTo(165, 9);
  });

  it('kills the independent Kissinger kJ-conversion mutant', () => {
    const peaks = BETAS.map((beta) =>
      validPeak(beta, solveTemperature(beta, 2, 1, 155, 19)));
    const result = calculateKissinger(peaks);
    expect(result.status).toBe('success');
    expect(result.activationEnergyKJPerMol).toBeCloseTo(155, 9);
  });
});

describe('mutation killers: units and differential path', () => {
  it('kills the 273.15 Celsius-to-Kelvin offset mutant', () => {
    const runs = BETAS.map((beta) => {
      const targetK = solveTemperature(beta, 2, 1, 145, 18);
      return prepare({
        id: `celsius-${beta}`,
        heatingRate: beta,
        heatingRateUnit: 'K/min',
        temperatureUnit: 'C',
        sampleId: 'celsius-mutant-killer',
        atmosphere: 'N2',
        stage: 'single',
        points: [
          { alpha: 0.4, temperature: targetK - 273.15 - 5 },
          { alpha: 0.5, temperature: targetK - 273.15 },
          { alpha: 0.6, temperature: targetK - 273.15 + 5 },
        ],
      });
    });
    expect(energy(calculateKAS(runs, [0.5]))).toBeCloseTo(145, 9);
  });

  it('kills a missing or inverted beta factor in temperature-domain Friedman derivatives', () => {
    const trueEnergyKJPerMol = 140;
    const intercept = 25;
    const targets = [565, 590, 620, 650];
    const raw = BETAS.map((beta, index): ThermalRun => {
      const targetK = targets[index]!;
      const ratePerMinute = Math.exp(
        intercept - (trueEnergyKJPerMol * 1000) / (R_ORACLE * targetK),
      );
      const derivativePerK = ratePerMinute / beta;
      const deltaK = 0.04 / derivativePerK;
      return {
        id: `friedman-temperature-${beta}`,
        heatingRate: beta,
        heatingRateUnit: 'K/min',
        temperatureUnit: 'K',
        sampleId: 'friedman-beta-mutant-killer',
        atmosphere: 'N2',
        stage: 'single',
        points: [
          { alpha: 0.46, temperature: targetK - deltaK },
          { alpha: 0.5, temperature: targetK },
          { alpha: 0.54, temperature: targetK + deltaK },
        ],
      };
    });
    const result = calculateFriedman(raw.map(prepare), [0.5]);
    expect(result.status).toBe('success');
    expect(result.estimates[0]!.activationEnergyKJPerMol).toBeCloseTo(
      trueEnergyKJPerMol,
      9,
    );
  });
});

describe('mutation killers: uncertainty and replicate weighting', () => {
  it('kills Student-t residual-degrees-of-freedom handling mutants', () => {
    expect(studentTCritical95(31)).toBeCloseTo(2.0395134463964064, 11);
    const regression = ordinaryLeastSquares(
      [0.0016, 0.0017, 0.0018, 0.0019, 0.002],
      [3.2, 2.9, 2.7, 2.25, 2.1],
    );
    expect(regression.residualDegreesOfFreedom).toBe(3);
    expect(regression.slopeConfidence95[0]).toBeCloseTo(-3579.1900543897514, 8);
    expect(regression.slopeConfidence95[1]).toBeCloseTo(-2120.8099456102486, 8);
  });

  it('kills first-replicate and raw-row weighting mutants', () => {
    const base = preparedRuns(2, 1, 150, 18);
    const first = base[0]!;
    const target = first.points[1]!.temperatureK;
    const lowReplicateShiftK = 5;
    const highReplicateShiftK = 15;
    const physicalScaleMeanShiftK =
      (lowReplicateShiftK + highReplicateShiftK) / 2;
    const replicated: PreparedRun[] = [
      {
        ...first,
        id: 'replicate-low',
        points: first.points.map((point) => ({
          ...point,
          temperatureK: point.temperatureK + lowReplicateShiftK,
        })),
      },
      {
        ...first,
        id: 'replicate-high',
        points: first.points.map((point) => ({
          ...point,
          temperatureK: point.temperatureK + highReplicateShiftK,
        })),
      },
      ...base.slice(1),
    ];
    const preaveraged: PreparedRun[] = [
      {
        ...first,
        id: 'replicate-mean',
        points: first.points.map((point, index) => ({
          ...point,
          temperatureK:
            index === 1 ? target + physicalScaleMeanShiftK : point.temperatureK,
        })),
      },
      ...base.slice(1),
    ];
    const actual = energy(calculateKAS(replicated, [0.5]));
    const expected = energy(calculateKAS(preaveraged, [0.5]));
    expect(actual).toBeCloseTo(expected, 12);
  });
});
