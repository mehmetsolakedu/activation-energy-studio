import { describe, expect, it } from 'vitest';

import {
  FWO_SLOPE_COEFFICIENT,
  GAS_CONSTANT_J_PER_MOL_K,
  STARINK_SLOPE_COEFFICIENT,
  calculateFWO,
  calculateFriedman,
  calculateKAS,
  calculateKissinger,
  calculateStarink,
  normalizeMassToAlpha,
  prepareThermalRun,
  type AlphaActivationEnergyEstimate,
  type AlphaMethodResult,
  type KissingerResult,
  type PreparedRun,
  type RegressionResult,
  type ThermalRun,
} from '../src/core';
import fixture from './fixtures/hand/activation_energy_hand_worksheet.json';

type ExpectedMethod = (typeof fixture.methodsN4)[keyof typeof fixture.methodsN4];

function preparedRuns(count: number): PreparedRun[] {
  return fixture.inputs.heatingRatesKPerMin.slice(0, count).map((beta, index) => {
    const temperatureK = fixture.inputs.temperaturesK[index] as number;
    const derivative = fixture.inputs.derivativesPerMinute[index] as number;
    return {
      id: `hand-${beta}`,
      heatingRateKPerMinute: beta,
      derivativeSource: 'provided',
      sampleId: 'independent-hand-fixture',
      atmosphere: 'N2',
      stage: 'main',
      points: [
        { temperatureK: temperatureK - 1, alpha: 0.4, dAlphaDtPerMinute: derivative },
        { temperatureK, alpha: 0.5, dAlphaDtPerMinute: derivative },
        { temperatureK: temperatureK + 1, alpha: 0.6, dAlphaDtPerMinute: derivative },
      ],
    };
  });
}

function energyConfidence(
  regression: RegressionResult,
  coefficient: number,
): [number, number] {
  return regression.slopeConfidence95
    .map((slope) => (-slope * GAS_CONSTANT_J_PER_MOL_K) / coefficient / 1000)
    .sort((left, right) => left - right) as [number, number];
}

function expectNumericArray(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    const expectedValue = expected[index] as number;
    const scale = Math.max(1, Math.abs(expectedValue));
    expect(Math.abs(value - expectedValue) / scale).toBeLessThanOrEqual(2e-13);
  });
}

function expectRegression(
  regression: RegressionResult,
  activationEnergyKJPerMol: number,
  expected: ExpectedMethod,
  coefficient: number,
): void {
  expectNumericArray(regression.x, expected.x);
  expectNumericArray(regression.y, expected.y);
  expect(regression.slope).toBeCloseTo(expected.slope, 9);
  expect(regression.intercept).toBeCloseTo(expected.intercept, 10);
  expect(regression.slopeStandardError).toBeCloseTo(expected.slopeStandardError, 9);
  expectNumericArray(regression.slopeConfidence95, expected.slopeConfidence95);
  expect(regression.r2).toBeCloseTo(expected.r2, 12);
  expect(activationEnergyKJPerMol).toBeCloseTo(expected.activationEnergyKJPerMol, 10);
  expectNumericArray(
    energyConfidence(regression, coefficient),
    expected.energyConfidence95KJPerMol,
  );
}

function estimate(result: AlphaMethodResult): AlphaActivationEnergyEstimate {
  expect(result.estimates).toHaveLength(1);
  return result.estimates[0] as AlphaActivationEnergyEstimate;
}

describe('independent hand worksheet', () => {
  it('matches the hand mass and mass-percent alpha calculation', () => {
    const expected = fixture.massNormalization.expectedAlpha;
    const mass = normalizeMassToAlpha(fixture.massNormalization.mass, {
      initialMass: fixture.massNormalization.mass[0],
      finalMass: fixture.massNormalization.mass.at(-1) as number,
    });
    const percent = normalizeMassToAlpha(fixture.massNormalization.massPercent, {
      initialMass: fixture.massNormalization.massPercent[0],
      finalMass: fixture.massNormalization.massPercent.at(-1) as number,
    });
    expectNumericArray(mass, expected);
    expectNumericArray(percent, expected);
  });

  it('matches independent x/y/slope/E/SE/CI values for all four isoconversional methods', () => {
    const runs = preparedRuns(4);
    const calculations = [
      ['FWO', calculateFWO(runs, [0.5]), FWO_SLOPE_COEFFICIENT],
      ['KAS', calculateKAS(runs, [0.5]), 1],
      ['STARINK', calculateStarink(runs, [0.5]), STARINK_SLOPE_COEFFICIENT],
      ['FRIEDMAN', calculateFriedman(runs, [0.5]), 1],
    ] as const;
    for (const [method, result, coefficient] of calculations) {
      const value = estimate(result);
      expectRegression(
        value.regression,
        value.activationEnergyKJPerMol,
        fixture.methodsN4[method],
        coefficient,
      );
    }
  });

  it('matches the manifest-driven supplied/time/temperature Friedman derivative trio including endpoints', () => {
    const contract = fixture.friedmanDerivativeEquivalence;
    const pathways = (['provided', 'time', 'temperature'] as const).map((mode) => {
      const runs = contract.runs.map((item): ThermalRun => ({
        id: `${mode}-${item.heatingRateKPerMin}`,
        heatingRate: item.heatingRateKPerMin,
        heatingRateUnit: 'K/min',
        temperatureUnit: 'K',
        ...(mode === 'time' ? { timeUnit: 'min' as const } : {}),
        sampleId: 'derivative-hand-fixture',
        atmosphere: 'N2',
        stage: 'main',
        points: [-1, 0, 1].map((offset) => ({
          temperature: item.targetTemperatureK + offset * item.deltaTemperatureK,
          alpha: contract.targetAlpha + offset * 0.1,
          ...(mode === 'time'
            ? { time: (offset + 1) * item.deltaTimeMinutes }
            : {}),
          ...(mode === 'provided'
            ? { dAlphaDtPerMinute: item.expectedDerivativePerMinute }
            : {}),
        })),
      }));
      return runs.map((run, index) => {
        const prepared = prepareThermalRun(run);
        expect(prepared.refusals).toEqual([]);
        expect(prepared.run?.derivativeSource).toBe(mode);
        prepared.run?.points.forEach((point) => {
          const expected = contract.runs[index]?.expectedDerivativePerMinute as number;
          expect(
            Math.abs((point.dAlphaDtPerMinute as number) - expected) /
              Math.max(1, Math.abs(expected)),
          ).toBeLessThanOrEqual(contract.derivativeRelativeTolerance);
        });
        return prepared.run as PreparedRun;
      });
    });

    pathways.forEach((runs) => {
      const energy = estimate(calculateFriedman(runs, [contract.targetAlpha]))
        .activationEnergyKJPerMol;
      expect(
        Math.abs(energy - contract.activationEnergyKJPerMol) /
          contract.activationEnergyKJPerMol,
      ).toBeLessThanOrEqual(
        contract.energyMachineEpsilonMultiplier * Number.EPSILON,
      );
    });
  });

  it('matches the independent separate Kissinger peak worksheet', () => {
    const result: KissingerResult = calculateKissinger(
      fixture.inputs.heatingRatesKPerMin.slice(0, 4).map((beta, index) => ({
        runId: `hand-${beta}`,
        heatingRateKPerMinute: beta,
        peakTemperatureK: fixture.inputs.temperaturesK[index] as number,
        stage: 'main',
      })),
    );
    expect(result.resultType).toBe('peak');
    expect(result.alpha).toBeNull();
    expectRegression(
      result.regression as RegressionResult,
      result.activationEnergyKJPerMol as number,
      fixture.methodsN4.KISSINGER,
      1,
    );
  });

  it.each(fixture.kasRegressionSizes)(
    'matches independently transformed KAS E confidence limits for n=$n',
    (expected) => {
      const value = estimate(calculateKAS(preparedRuns(expected.n), [0.5]));
      expect(value.regression.n).toBe(expected.n);
      expect(value.regression.slope).toBeCloseTo(expected.slope, 9);
      expect(value.regression.slopeStandardError).toBeCloseTo(
        expected.slopeStandardError,
        9,
      );
      expectNumericArray(value.regression.slopeConfidence95, expected.slopeConfidence95);
      expect(value.activationEnergyKJPerMol).toBeCloseTo(
        expected.activationEnergyKJPerMol,
        10,
      );
      expectNumericArray(energyConfidence(value.regression, 1), expected.energyConfidence95KJPerMol);
    },
  );
});
