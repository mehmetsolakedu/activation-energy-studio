import { describe, expect, it } from 'vitest';

import {
  GAS_CONSTANT_J_PER_MOL_K,
  calculateKAS,
  type PreparedRun,
} from '../src/core';
import fixture from './fixtures/synthetic/layer2_validation.json';

function solveKasTemperature(
  beta: number,
  energyKJPerMol: number,
  intercept: number,
): number {
  const residual = (temperatureK: number) =>
    Math.log(beta / temperatureK ** 2) -
    intercept +
    (energyKJPerMol * 1000) / (GAS_CONSTANT_J_PER_MOL_K * temperatureK);
  let lower = 250;
  let upper = 2500;
  for (let iteration = 0; iteration < 140; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (residual(middle) > 0) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

function runAtTargets(
  targets: readonly { alpha: number; energy: number }[],
): PreparedRun[] {
  return [5, 10, 20, 40].map((beta) => ({
    id: `layer2-${beta}`,
    heatingRateKPerMinute: beta,
    derivativeSource: 'provided',
    sampleId: 'synthetic-layer2',
    atmosphere: 'N2',
    stage: 'main',
    points: targets.map(({ alpha, energy }) => ({
      alpha,
      temperatureK: solveKasTemperature(beta, energy, 20),
      dAlphaDtPerMinute: 0.01 + alpha * 0.01,
    })),
  }));
}

describe('AC-VAL-02 synthetic edge layer', () => {
  it('retains an auditable finite estimate under deterministic controlled temperature noise', () => {
    const spec = fixture.controlledNoise;
    const runs: PreparedRun[] = spec.heatingRatesKPerMin.map((beta, index) => {
      const target =
        solveKasTemperature(beta, spec.trueActivationEnergyKJPerMol, spec.intercept) +
        (spec.temperatureNoiseK[index] as number);
      return {
        id: `noisy-${beta}`,
        heatingRateKPerMinute: beta,
        derivativeSource: 'provided',
        sampleId: 'controlled-noise',
        atmosphere: 'N2',
        stage: 'main',
        points: [
          { temperatureK: target - 1, alpha: 0.4, dAlphaDtPerMinute: 0.01 },
          { temperatureK: target, alpha: 0.5, dAlphaDtPerMinute: 0.02 },
          { temperatureK: target + 1, alpha: 0.6, dAlphaDtPerMinute: 0.03 },
        ],
      };
    });
    const result = calculateKAS(runs, [0.5], { minR2Warning: spec.minR2Warning });
    const estimate = result.estimates[0];
    expect(estimate).toBeDefined();
    expect(Number.isFinite(estimate?.activationEnergyKJPerMol)).toBe(true);
    expect(
      Math.abs(
        (estimate?.activationEnergyKJPerMol as number) -
          spec.trueActivationEnergyKJPerMol,
      ) / spec.trueActivationEnergyKJPerMol,
    ).toBeLessThanOrEqual(spec.maximumRelativeEnergyError);
    expect(estimate?.regression.r2).toBeLessThan(1);
    expect(result.warnings.map(({ code }) => code)).toContain('LOW_R2');
  });

  it('detects the predeclared multistep profile without collapsing the alpha results', () => {
    const spec = fixture.multistep;
    const result = calculateKAS(
      runAtTargets(spec.alpha.map((alpha, index) => ({
        alpha,
        energy: spec.activationEnergyKJPerMol[index] as number,
      }))),
      spec.alpha,
    );
    expect(result.estimates.map(({ activationEnergyKJPerMol }) => activationEnergyKJPerMol))
      .toEqual([
        expect.closeTo(spec.activationEnergyKJPerMol[0] as number, 8),
        expect.closeTo(spec.activationEnergyKJPerMol[1] as number, 8),
      ]);
    expect(result.warnings.map(({ code }) => code)).toContain(spec.expectedCode);
  });

  it('refuses a fixture with no all-run common alpha range', () => {
    const runs: PreparedRun[] = fixture.missingCommonRange.alphaRanges.map((range, index) => ({
      id: `disjoint-${index + 1}`,
      heatingRateKPerMinute: [5, 10, 20][index] as number,
      derivativeSource: 'provided',
      sampleId: 'missing-common-range',
      atmosphere: 'N2',
      stage: 'main',
      points: [
        { temperatureK: 500, alpha: range[0] as number, dAlphaDtPerMinute: 0.01 },
        { temperatureK: 600, alpha: range[1] as number, dAlphaDtPerMinute: 0.02 },
      ],
    }));
    const result = calculateKAS(runs, [0.5]);
    expect(result.status).toBe('refused');
    expect(result.estimates).toEqual([]);
    expect(result.refusals.map(({ code }) => code)).toContain(
      fixture.missingCommonRange.expectedCode,
    );
  });
});
