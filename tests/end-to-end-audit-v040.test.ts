import { describe, expect, it } from 'vitest';

import oracle from './fixtures/audit-v040/independent-oracle-expected.json';
import {
  calculateFriedman,
  calculateFWO,
  calculateKAS,
  calculateKissinger,
  calculateStarink,
  estimateAlphaDerivative,
  prepareThermalRun,
  studentTCritical95,
  type AlphaMethodResult,
  type KissingerPeak,
  type PreparedRun,
} from '../src/core';
import { VERIFIED_EXTERNAL_PEAK_EVIDENCE } from './helpers/peak-evidence';

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

function expectNoRefusedEnergyOrUncertaintyPayload(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain('activationEnergyKJPerMol');
  expect(serialized).not.toContain('candidateActivationEnergyKJPerMol');
  expect(serialized).not.toContain('slopeStandardError');
  expect(serialized).not.toContain('slopeConfidence95');
}

function verifiedPeaks(): KissingerPeak[] {
  return BETAS.map((beta, index) => ({
    runId: `quality-peak-${beta}`,
    heatingRateKPerMinute: beta,
    peakTemperatureK: 580 + index * 20,
    ...VERIFIED_EXTERNAL_PEAK_EVIDENCE,
    stage: 'main',
  }));
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
        ...VERIFIED_EXTERNAL_PEAK_EVIDENCE,
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
  it('refuses alpha targets that are distinct in binary but equivalent for interpolation', () => {
    const fixture = oracle.handWorkedFixture;
    const result = calculateKAS(
      preparedRuns(fixture.temperaturesK.map(Number)),
      [0.5, 0.50000000005],
    );
    expectAlphaRefusal(result, 'INVALID_ALPHA_GRID');
  });

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
      expectNoRefusedEnergyOrUncertaintyPayload(result);
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
        ...VERIFIED_EXTERNAL_PEAK_EVIDENCE,
        stage: 'main',
      })),
    );
    expect(result.status).toBe('refused');
    expect(result.resultType).toBe('peak');
    expect(result.alpha).toBeNull();
    expect(result.activationEnergyKJPerMol).toBeUndefined();
    expect(result.regression).toBeUndefined();
    expectNoRefusedEnergyOrUncertaintyPayload(result);
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
        ...VERIFIED_EXTERNAL_PEAK_EVIDENCE,
        stage: 'main',
      })),
    );
    expect(result.status).toBe('refused');
    expect(result.activationEnergyKJPerMol).toBeUndefined();
    expect(result.refusals.map((item) => item.code)).toContain(
      'INSUFFICIENT_RECIPROCAL_TEMPERATURE_SPREAD',
    );
  });

  it.each([
    ['explicit unresolved identity', { peakResolved: false }, 'KISSINGER_PEAK_UNRESOLVED'],
    ['boundary peak', { peakQuality: 'boundary' }, 'KISSINGER_PEAK_BOUNDARY'],
    ['shoulder peak', { peakQuality: 'shoulder' }, 'KISSINGER_PEAK_QUALITY_UNVERIFIED'],
    ['overlapping peak', { peakQuality: 'multiple-overlapping' }, 'OVERLAPPING_PEAKS'],
    ['legacy ambiguous flag', { ambiguous: true }, 'OVERLAPPING_PEAKS'],
    ['unconfirmed analyst decision', { analystConfirmed: false }, 'KISSINGER_PEAK_UNCONFIRMED'],
  ] as const)(
    'Kissinger refuses a %s without exposing a numeric result',
    (_label, override, expectedCode) => {
      const peaks = verifiedPeaks();
      peaks[1] = { ...peaks[1]!, ...override };
      const result = calculateKissinger(peaks);
      expect(result.status).toBe('refused');
      expect(result.activationEnergyKJPerMol).toBeUndefined();
      expect(result.regression).toBeUndefined();
      expect(result.refusals.map((item) => item.code)).toContain(expectedCode);
    },
  );

  it('Kissinger refuses legacy rows whose explicit evidence contract is absent', () => {
    const result = calculateKissinger(
      BETAS.map((beta, index) => ({
        runId: `legacy-peak-${beta}`,
        heatingRateKPerMinute: beta,
        peakTemperatureK: 580 + index * 20,
        stage: 'main',
      })),
    );
    expect(result.status).toBe('refused');
    expect(result.activationEnergyKJPerMol).toBeUndefined();
    expect(result.refusals.map((item) => item.code)).toEqual(expect.arrayContaining([
      'KISSINGER_PEAK_UNRESOLVED',
      'KISSINGER_PEAK_QUALITY_UNVERIFIED',
      'KISSINGER_PEAK_SIGNAL_UNVERIFIED',
      'KISSINGER_PEAK_UNCONFIRMED',
    ]));
  });

  it('Kissinger refuses a row whose peak-source signal is missing', () => {
    const peaks = verifiedPeaks();
    const { sourceSignal: _omitted, ...withoutSignal } = peaks[0]!;
    peaks[0] = withoutSignal;
    const result = calculateKissinger(peaks);
    expect(result.status).toBe('refused');
    expect(result.activationEnergyKJPerMol).toBeUndefined();
    expect(result.refusals.map((item) => item.code)).toContain(
      'KISSINGER_PEAK_SIGNAL_UNVERIFIED',
    );
  });

  it('curve-backed Kissinger evidence requires an observed strict local maximum', () => {
    const base = {
      id: 'curve-peak-audit',
      heatingRate: 10,
      heatingRateUnit: 'K/min' as const,
      temperatureUnit: 'K' as const,
      peakTemperature: 600,
      peakResolved: true,
      peakQuality: 'clear-interior' as const,
      peakSourceSignal: 'positive-dalpha-dt' as const,
      peakAnalystConfirmed: true,
      stage: 'main',
    };
    const valid = prepareThermalRun({
      ...base,
      points: [
        { temperature: 500, alpha: 0.2, dAlphaDtPerMinute: 0.01 },
        { temperature: 600, alpha: 0.5, dAlphaDtPerMinute: 0.04 },
        { temperature: 700, alpha: 0.8, dAlphaDtPerMinute: 0.02 },
      ],
    });
    expect(valid.run?.peakTemperatureK).toBe(600);
    expect(valid.refusals).toEqual([]);

    const notMaximum = prepareThermalRun({
      ...base,
      points: [
        { temperature: 500, alpha: 0.2, dAlphaDtPerMinute: 0.01 },
        { temperature: 600, alpha: 0.5, dAlphaDtPerMinute: 0.02 },
        { temperature: 700, alpha: 0.8, dAlphaDtPerMinute: 0.03 },
      ],
    });
    expect(notMaximum.run).toBeUndefined();
    expect(notMaximum.refusals.map((item) => item.code)).toContain(
      'KISSINGER_PEAK_SIGNAL_UNVERIFIED',
    );

    const offGrid = prepareThermalRun({
      ...base,
      peakTemperature: 610,
      points: [
        { temperature: 500, alpha: 0.2, dAlphaDtPerMinute: 0.01 },
        { temperature: 600, alpha: 0.5, dAlphaDtPerMinute: 0.04 },
        { temperature: 700, alpha: 0.8, dAlphaDtPerMinute: 0.02 },
      ],
    });
    expect(offGrid.run).toBeUndefined();
    expect(offGrid.refusals.map((item) => item.code)).toContain(
      'KISSINGER_PEAK_SIGNAL_UNVERIFIED',
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
