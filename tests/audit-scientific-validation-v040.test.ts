import { describe, expect, it } from 'vitest';

import oracle from './fixtures/audit-v040/independent-oracle-expected.json';
import {
  calculateFriedman,
  calculateFWO,
  calculateKAS,
  calculateKissinger,
  calculateStarink,
  prepareThermalRun,
  type AlphaMethodResult,
  type KissingerPeak,
  type PreparedRun,
  type ThermalRun,
} from '../src/core';

/**
 * Scientific constants in this file are deliberately literal. This validation
 * layer must not obtain its expected values from the system under test (SUT).
 */
const ORACLE_R_J_PER_MOL_K = 8.31446261815324;
const TRUE_ODE_EA_KJ_PER_MOL = 120;
const ALPHA_TARGETS = [0.2, 0.5, 0.8] as const;
const NOISE_SEED = 0x5eed_a11;

const EXACT_ORACLE_RELATIVE_TOLERANCE = 5e-11;
const NOISE_RECOVERY_LIMITS = {
  FWO: 0.04,
  KAS: 0.02,
  STARINK: 0.02,
  FRIEDMAN: 0.03,
} as const;

type AlphaMethod = keyof typeof NOISE_RECOVERY_LIMITS;

const calculators = {
  FWO: calculateFWO,
  KAS: calculateKAS,
  STARINK: calculateStarink,
  FRIEDMAN: calculateFriedman,
} as const;

function expectRelative(
  actual: number,
  expected: number,
  maximumRelativeError: number,
): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected) / Math.max(1, Math.abs(expected)))
    .toBeLessThanOrEqual(maximumRelativeError);
}

function validPeak(
  beta: number,
  peakTemperatureK: number,
  suffix = '',
): KissingerPeak {
  return {
    runId: `ode-peak-${beta}${suffix}`,
    heatingRateKPerMinute: beta,
    peakTemperatureK,
    stage: 'single first-order reaction',
    peakResolved: true,
    peakQuality: 'clear-interior',
    sourceSignal: 'positive-dalpha-dt',
    analystConfirmed: true,
  };
}

function odeRuns(): PreparedRun[] {
  const fixture = oracle.syntheticFirstOrderOde;
  return fixture.parameters.heatingRatesKPerMinute.map((beta, rateIndex) => ({
    id: `ode-beta-${beta}`,
    heatingRateKPerMinute: beta,
    derivativeSource: 'provided',
    sampleId: 'independent-rk4-first-order-oracle',
    atmosphere: 'N2',
    stage: 'single first-order reaction',
    points: ALPHA_TARGETS.map((alpha) => {
      const row = fixture.alphaResults[String(alpha) as keyof typeof fixture.alphaResults];
      return {
        alpha,
        temperatureK: row.temperaturesK[rateIndex] as number,
        dAlphaDtPerMinute: row.derivativesPerMinute[rateIndex] as number,
      };
    }),
  }));
}

function estimateAt(result: AlphaMethodResult, alpha: number): number {
  expect(result.status).toBe('success');
  const estimate = result.estimates.find((item) => item.alpha === alpha);
  expect(estimate).toBeDefined();
  return estimate!.activationEnergyKJPerMol;
}

/** Mulberry32 has a fully specified 32-bit state transition. */
function seededUniform(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function seededNormal(uniform: () => number): number {
  const first = Math.max(uniform(), Number.MIN_VALUE);
  const second = uniform();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function controlledNoiseRuns(seed = NOISE_SEED): PreparedRun[] {
  const uniform = seededUniform(seed);
  const fixture = oracle.syntheticFirstOrderOde;
  const half = fixture.alphaResults['0.5'];
  return fixture.parameters.heatingRatesKPerMinute.map((beta, index) => {
    const targetTemperatureK =
      (half.temperaturesK[index] as number) + 0.35 * seededNormal(uniform);
    const targetDerivative =
      (half.derivativesPerMinute[index] as number)
      * Math.exp(0.008 * seededNormal(uniform));
    return {
      id: `controlled-noise-${beta}`,
      heatingRateKPerMinute: beta,
      derivativeSource: 'provided',
      sampleId: 'fixed-seed-noise',
      atmosphere: 'N2',
      stage: 'single first-order reaction',
      points: [
        {
          alpha: 0.37,
          temperatureK: targetTemperatureK - 7.1,
          dAlphaDtPerMinute: targetDerivative * 0.74,
        },
        {
          alpha: 0.5,
          temperatureK: targetTemperatureK,
          dAlphaDtPerMinute: targetDerivative,
        },
        {
          alpha: 0.73,
          temperatureK: targetTemperatureK + 12.6,
          dAlphaDtPerMinute: targetDerivative * 1.19,
        },
      ],
    };
  });
}

function quadraticLocalAlpha(
  offset: number,
  firstDerivative: number,
): number {
  return 0.5 + firstDerivative * offset + 0.12 * firstDerivative ** 2 * offset ** 2;
}

function irregularThermalRuns(axis: 'time' | 'temperature'): ThermalRun[] {
  const fixture = oracle.syntheticFirstOrderOde;
  const half = fixture.alphaResults['0.5'];
  return fixture.parameters.heatingRatesKPerMinute.map((beta, index) => {
    const targetTemperatureK = half.temperaturesK[index] as number;
    const targetRate = half.derivativesPerMinute[index] as number;
    const derivativePerAxis = axis === 'time' ? targetRate : targetRate / beta;
    const leftOffset = -0.04 / derivativePerAxis;
    const rightOffset = 0.07 / derivativePerAxis;
    const offsets = [leftOffset, 0, rightOffset] as const;
    const centerTimeMinutes = 20;
    return {
      id: `irregular-${axis}-${beta}`,
      heatingRate: beta,
      heatingRateUnit: 'K/min',
      temperatureUnit: 'K',
      ...(axis === 'time' ? { timeUnit: 'min' as const } : {}),
      sampleId: 'quadratic-local-alpha',
      atmosphere: 'N2',
      stage: 'single first-order reaction',
      points: offsets.map((offset) => ({
        temperature:
          axis === 'time'
            ? targetTemperatureK + beta * offset
            : targetTemperatureK + offset,
        alpha: quadraticLocalAlpha(offset, derivativePerAxis),
        ...(axis === 'time' ? { time: centerTimeMinutes + offset } : {}),
      })),
    };
  });
}

function prepareAll(runs: readonly ThermalRun[]): PreparedRun[] {
  return runs.map((run) => {
    const prepared = prepareThermalRun(run);
    expect(prepared.refusals, run.id).toEqual([]);
    expect(prepared.run, run.id).toBeDefined();
    return prepared.run!;
  });
}

function solveKasTemperature(
  beta: number,
  energyKJPerMol: number,
  intercept: number,
): number {
  const residual = (temperatureK: number) =>
    Math.log(beta / temperatureK ** 2)
    - intercept
    + (energyKJPerMol * 1000) / (ORACLE_R_J_PER_MOL_K * temperatureK);
  let lower = 250;
  let upper = 2500;
  if (!(residual(lower) > 0 && residual(upper) < 0)) {
    throw new Error('Independent KAS property root is not bracketed.');
  }
  for (let iteration = 0; iteration < 160; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (residual(middle) > 0) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

describe('audit layer: independent first-order ODE oracle', () => {
  it('matches independent RK4 crossing temperatures, regression outputs, and method-specific approximation bounds', () => {
    const runs = odeRuns();
    for (const [method, calculate] of Object.entries(calculators)) {
      const result = calculate(runs, ALPHA_TARGETS);
      for (const alpha of ALPHA_TARGETS) {
        const independent = oracle.syntheticFirstOrderOde.alphaResults[
          String(alpha) as keyof typeof oracle.syntheticFirstOrderOde.alphaResults
        ].methods[method as AlphaMethod];
        const actual = estimateAt(result, alpha);
        expectRelative(
          actual,
          independent.activationEnergyKJPerMol,
          EXACT_ORACLE_RELATIVE_TOLERANCE,
        );
        expectRelative(
          actual,
          TRUE_ODE_EA_KJ_PER_MOL,
          NOISE_RECOVERY_LIMITS[method as AlphaMethod],
        );
      }
    }
  });

  it('recovers the independent first-order peak solution with an explicitly adjudicated Kissinger peak contract', () => {
    const fixture = oracle.syntheticFirstOrderOde;
    const peaks = fixture.parameters.heatingRatesKPerMinute.map((beta, index) =>
      validPeak(beta, fixture.peakTemperaturesK[index] as number));
    const result = calculateKissinger(peaks);
    expect(result.status).toBe('success');
    expectRelative(
      result.activationEnergyKJPerMol!,
      fixture.kissinger.activationEnergyKJPerMol,
      EXACT_ORACLE_RELATIVE_TOLERANCE,
    );
    expectRelative(
      result.activationEnergyKJPerMol!,
      TRUE_ODE_EA_KJ_PER_MOL,
      1e-10,
    );
  });
});

describe('audit layer: controlled noise and irregular sampling', () => {
  it('is reproducible byte-for-value under the declared fixed seed and remains inside predeclared recovery bounds', () => {
    const first = controlledNoiseRuns();
    const second = controlledNoiseRuns();
    expect(second).toEqual(first);

    for (const [method, calculate] of Object.entries(calculators)) {
      const actual = estimateAt(calculate(first, [0.5]), 0.5);
      expectRelative(
        actual,
        TRUE_ODE_EA_KJ_PER_MOL,
        NOISE_RECOVERY_LIMITS[method as AlphaMethod],
      );
    }
  });

  it.each(['time', 'temperature'] as const)(
    'recovers the exact local derivative and Friedman energy on a nonuniform %s axis',
    (axis) => {
      const prepared = prepareAll(irregularThermalRuns(axis));
      const expectedRates = oracle.syntheticFirstOrderOde.alphaResults['0.5']
        .derivativesPerMinute;
      prepared.forEach((run, index) => {
        const center = run.points.find((point) => point.alpha === 0.5);
        expect(center).toBeDefined();
        expectRelative(
          center!.dAlphaDtPerMinute!,
          expectedRates[index] as number,
          2e-12,
        );
      });
      expectRelative(
        estimateAt(calculateFriedman(prepared, [0.5]), 0.5),
        TRUE_ODE_EA_KJ_PER_MOL,
        2e-10,
      );
    },
  );
});

describe('audit layer: metamorphic and property-style contracts', () => {
  it.each(Object.entries(calculators))(
    '%s is invariant to run order and a common heating-rate scale factor',
    (_method, calculate) => {
      const baselineRuns = odeRuns();
      const baseline = calculate(baselineRuns, ALPHA_TARGETS);
      const transformed = calculate(
        [...baselineRuns].reverse().map((run) => ({
          ...run,
          heatingRateKPerMinute: run.heatingRateKPerMinute * 3.7,
        })),
        ALPHA_TARGETS,
      );
      for (const alpha of ALPHA_TARGETS) {
        expectRelative(
          estimateAt(transformed, alpha),
          estimateAt(baseline, alpha),
          2e-12,
        );
      }
    },
  );

  it('keeps Friedman energy invariant when every positive derivative is rescaled by one common factor', () => {
    const baselineRuns = odeRuns();
    const scaledRuns = baselineRuns.map((run) => ({
      ...run,
      points: run.points.map((point) => ({
        ...point,
        dAlphaDtPerMinute: point.dAlphaDtPerMinute! * 7.25,
      })),
    }));
    const baseline = calculateFriedman(baselineRuns, ALPHA_TARGETS);
    const scaled = calculateFriedman(scaledRuns, ALPHA_TARGETS);
    for (const alpha of ALPHA_TARGETS) {
      expectRelative(
        estimateAt(scaled, alpha),
        estimateAt(baseline, alpha),
        2e-12,
      );
    }
  });

  it('produces equivalent KAS and Friedman outputs for Celsius/K-per-second and Kelvin/K-per-minute inputs', () => {
    const kelvin = prepareAll(irregularThermalRuns('temperature'));
    const celsius = prepareAll(
      irregularThermalRuns('temperature').map((run) => ({
        ...run,
        heatingRate: run.heatingRate / 60,
        heatingRateUnit: 'K/s' as const,
        temperatureUnit: 'C' as const,
        points: run.points.map((point) => ({
          ...point,
          temperature: point.temperature - 273.15,
        })),
      })),
    );
    for (const calculate of [calculateKAS, calculateFriedman] as const) {
      expectRelative(
        estimateAt(calculate(celsius, [0.5]), 0.5),
        estimateAt(calculate(kelvin, [0.5]), 0.5),
        2e-12,
      );
    }
  });

  it('recovers 32 deterministic KAS parameterizations across broad E and beta ranges', () => {
    const uniform = seededUniform(0xa11d_17ed);
    for (let caseIndex = 0; caseIndex < 32; caseIndex += 1) {
      const energyKJPerMol = 55 + 190 * uniform();
      const intercept = 8 + 18 * uniform();
      const baseBetas = [2, 5, 10, 20, 40];
      const scale = 0.55 + 1.8 * uniform();
      const runs = baseBetas.map((baseBeta, index): PreparedRun => {
        const beta = baseBeta * scale;
        const target = solveKasTemperature(beta, energyKJPerMol, intercept);
        return {
          id: `property-${caseIndex}-${index}`,
          heatingRateKPerMinute: beta,
          derivativeSource: 'provided',
          sampleId: 'deterministic-property-kas',
          atmosphere: 'N2',
          stage: 'single',
          points: [
            { alpha: 0.31, temperatureK: target - 9 },
            { alpha: 0.5, temperatureK: target },
            { alpha: 0.77, temperatureK: target + 11 },
          ],
        };
      });
      const permutation = caseIndex % 2 === 0 ? [...runs].reverse() : runs;
      expectRelative(
        estimateAt(calculateKAS(permutation, [0.5]), 0.5),
        energyKJPerMol,
        2e-10,
      );
    }
  });
});

describe('audit layer: adversarial scientific boundaries', () => {
  it.each(['boundary', 'shoulder', 'multiple-overlapping'] as const)(
    'returns no numeric Kissinger result for a %s peak classification',
    (peakQuality) => {
      const fixture = oracle.syntheticFirstOrderOde;
      const peaks = fixture.parameters.heatingRatesKPerMinute.map((beta, index) => ({
        ...validPeak(beta, fixture.peakTemperaturesK[index] as number),
        peakQuality,
      }));
      const result = calculateKissinger(peaks);
      expect(result.status).toBe('refused');
      expect(result.activationEnergyKJPerMol).toBeUndefined();
      expect(result.regression).toBeUndefined();
    },
  );

  it('returns no numeric Kissinger result when explicit analyst confirmation is absent', () => {
    const fixture = oracle.syntheticFirstOrderOde;
    const peaks = fixture.parameters.heatingRatesKPerMinute.map((beta, index) => {
      const { analystConfirmed: _omitted, ...peak } = validPeak(
        beta,
        fixture.peakTemperaturesK[index] as number,
      );
      return peak;
    });
    const result = calculateKissinger(peaks);
    expect(result.status).toBe('refused');
    expect(result.activationEnergyKJPerMol).toBeUndefined();
    expect(result.refusals.map((item) => item.code)).toContain(
      'KISSINGER_PEAK_UNCONFIRMED',
    );
  });

  it('fails closed on repeated or reversed independent axes used for numerical derivatives', () => {
    const base = irregularThermalRuns('time')[0]!;
    for (const points of [
      base.points.map((point, index) => ({
        ...point,
        time: index === 2 ? base.points[1]!.time : point.time,
      })),
      [...base.points].reverse(),
    ]) {
      const result = prepareThermalRun({ ...base, points });
      expect(result.run).toBeUndefined();
      expect(result.refusals.length).toBeGreaterThan(0);
    }
  });
});
