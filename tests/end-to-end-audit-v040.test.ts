import { describe, expect, it } from 'vitest';

import oracle from './fixtures/audit-v040/independent-oracle-expected.json';
import {
  calculateFriedman,
  calculateFWO,
  calculateKAS,
  calculateKissinger,
  calculateStarink,
  estimateAlphaDerivative,
  studentTCritical95,
  type AlphaMethodResult,
  type PreparedRun,
} from '../src/core';

const BETAS = [5, 10, 20, 40] as const;

function preparedRuns(
  temperaturesK: readonly number[],
  derivativesPerMinute: readonly number[] = BETAS,
): PreparedRun[] {
  return BETAS.map((beta, index) => {
    const temperatureK = temperaturesK[index] as number;
    const derivative = derivativesPerMinute[index] as number;
    return {
      id: `audit-beta-${beta}-${index}`,
      heatingRateKPerMinute: beta,
      derivativeSource: 'provided',
      sampleId: 'independent-audit-fixture',
      atmosphere: 'N2',
      stage: 'main',
      points: [
        {
          temperatureK: temperatureK - 5,
          alpha: 0.4,
          dAlphaDtPerMinute: derivative * 0.8,
        },
        { temperatureK, alpha: 0.5, dAlphaDtPerMinute: derivative },
        {
          temperatureK: temperatureK + 5,
          alpha: 0.6,
          dAlphaDtPerMinute: derivative * 1.2,
        },
      ],
    };
  });
}

const alphaCalculators = {
  FWO: calculateFWO,
  KAS: calculateKAS,
  STARINK: calculateStarink,
  FRIEDMAN: calculateFriedman,
} as const;

function expectAlphaRefusal(result: AlphaMethodResult, code: string): void {
  expect(result.status).toBe('refused');
  expect(result.estimates).toHaveLength(0);
  expect(result.refusals.map((item) => item.code)).toContain(code);
}

describe('independent audit oracle comparison', () => {
  it('matches the high-precision hand fixture without importing production code into the oracle', () => {
    const fixture = oracle.handWorkedFixture;
    const temperatures = fixture.temperaturesK.map(Number);
    const derivatives = fixture.friedmanDerivativesPerMinute.map(Number);
    const runs = preparedRuns(temperatures, derivatives);

    for (const [method, calculate] of Object.entries(alphaCalculators)) {
      const result = calculate(runs, [0.5]);
      const expected = Number(
        fixture.methods[method as keyof typeof fixture.methods].activationEnergyKJPerMol,
      );
      expect(result.status, method).toBe('success');
      expect(result.estimates[0]?.activationEnergyKJPerMol, method).toBeCloseTo(expected, 8);
    }

    const kissinger = calculateKissinger(
      BETAS.map((beta, index) => ({
        runId: `audit-peak-${beta}`,
        heatingRateKPerMinute: beta,
        peakTemperatureK: temperatures[index] as number,
        stage: 'main',
      })),
    );
    expect(kissinger.status).toBe('success');
    expect(kissinger.alpha).toBeNull();
    expect(kissinger.activationEnergyKJPerMol).toBeCloseTo(
      Number(fixture.methods.KISSINGER.activationEnergyKJPerMol),
      8,
    );
  });

  it('matches independent two-sided 95% Student-t quantiles', () => {
    for (const [degreesOfFreedom, expected] of Object.entries(
      oracle.studentTCriticalTwoSided95,
    )) {
      expect(studentTCritical95(Number(degreesOfFreedom))).toBeCloseTo(expected, 8);
    }
  });
});

describe('P1 fail-closed scientific contracts', () => {
  it.each(Object.entries(alphaCalculators))(
    '%s refuses a non-positive apparent Ea instead of exposing a numeric result',
    (method, calculate) => {
      const fixture = oracle.nonpositiveEaFixture;
      const runs = preparedRuns(
        fixture.temperaturesK.map(Number),
        BETAS,
      );
      const result = calculate(runs, [0.5]);
      expectAlphaRefusal(result, 'NONPOSITIVE_APPARENT_EA');
      expect(result.warnings.map((item) => item.code), method).not.toContain(
        'NONPOSITIVE_APPARENT_EA',
      );
    },
  );

  it('Kissinger refuses a non-positive apparent Ea and retains peak identity', () => {
    const fixture = oracle.nonpositiveEaFixture;
    const result = calculateKissinger(
      BETAS.map((beta, index) => ({
        runId: `audit-negative-peak-${beta}`,
        heatingRateKPerMinute: beta,
        peakTemperatureK: Number(fixture.temperaturesK[index]),
        stage: 'main',
      })),
    );
    expect(result.status).toBe('refused');
    expect(result.resultType).toBe('peak');
    expect(result.alpha).toBeNull();
    expect(result.activationEnergyKJPerMol).toBeUndefined();
    expect(result.refusals.map((item) => item.code)).toContain(
      'NONPOSITIVE_APPARENT_EA',
    );
  });

  it.each(Object.entries(alphaCalculators))(
    '%s refuses an ill-conditioned reciprocal-temperature regression',
    (method, calculate) => {
      const fixture = oracle.illConditionedReciprocalTemperatureFixture;
      const result = calculate(
        preparedRuns(fixture.temperaturesK, BETAS),
        [0.5],
      );
      expectAlphaRefusal(result, 'INSUFFICIENT_RECIPROCAL_TEMPERATURE_SPREAD');
      expect(result.warnings.map((item) => item.code), method).not.toContain(
        'INSUFFICIENT_RECIPROCAL_TEMPERATURE_SPREAD',
      );
    },
  );

  it('Kissinger refuses an ill-conditioned reciprocal-temperature regression', () => {
    const fixture = oracle.illConditionedReciprocalTemperatureFixture;
    const result = calculateKissinger(
      BETAS.map((beta, index) => ({
        runId: `audit-conditioned-peak-${beta}`,
        heatingRateKPerMinute: beta,
        peakTemperatureK: fixture.temperaturesK[index] as number,
        stage: 'main',
      })),
    );
    expect(result.status).toBe('refused');
    expect(result.activationEnergyKJPerMol).toBeUndefined();
    expect(result.refusals.map((item) => item.code)).toContain(
      'INSUFFICIENT_RECIPROCAL_TEMPERATURE_SPREAD',
    );
  });

  it('refuses a Friedman alpha if any required run has an invalid target derivative', () => {
    const fixture = oracle.handWorkedFixture;
    const derivatives = fixture.friedmanDerivativesPerMinute.map(Number);
    derivatives[0] = 0;
    const result = calculateFriedman(
      preparedRuns(fixture.temperaturesK.map(Number), derivatives),
      [0.5],
    );
    expectAlphaRefusal(result, 'FRIEDMAN_DERIVATIVE_UNAVAILABLE');
    expect(result.refusals[0]?.runIds).toContain('audit-beta-5-0');
  });
});

describe('irregular-grid derivative invariance', () => {
  it('uses three-point nonuniform weights for time-domain interior and endpoints', () => {
    const fixture = oracle.irregularGridDerivativeFixture;
    const points = fixture.timeMinutes.map((timeMinutes, index) => ({
      temperatureK: 500 + 10 * (timeMinutes + 1),
      timeMinutes,
      alpha: fixture.alpha[index] as number,
    }));
    const derivative = estimateAlphaDerivative(points, 10);
    expect(derivative[0]).toBeCloseTo(0.03, 12);
    expect(derivative[1]).toBeCloseTo(
      fixture.threePointNonuniformDerivativeAtZeroPerMinute,
      12,
    );
    expect(derivative[2]).toBeCloseTo(0.09, 12);
  });

  it('uses the same nonuniform weights for temperature-domain derivatives before beta conversion', () => {
    const points = [
      { temperatureK: 500, alpha: 0.36 },
      { temperatureK: 510, alpha: 0.4 },
      { temperatureK: 530, alpha: 0.54 },
    ];
    const derivative = estimateAlphaDerivative(points, 10);
    expect(derivative[0]).toBeCloseTo(0.03, 12);
    expect(derivative[1]).toBeCloseTo(0.05, 12);
    expect(derivative[2]).toBeCloseTo(0.09, 12);
  });
});
