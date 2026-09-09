import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ALPHA_VALUES,
  FWO_SLOPE_COEFFICIENT,
  GAS_CONSTANT_J_PER_MOL_K,
  STARINK_SLOPE_COEFFICIENT,
  STARINK_TEMPERATURE_EXPONENT,
  analyzeActivationEnergy,
  calculateFWO,
  calculateFriedman,
  calculateKAS,
  calculateStarink,
  estimateAlphaDerivative,
  evaluateAnalysisEligibility,
  interpolateTemperatureAtAlpha,
  normalizeMassToAlpha,
  ordinaryLeastSquares,
  prepareThermalRun,
  studentTCritical95,
  type PreparedRun,
  type ThermalRun,
} from '../src/core';

const BETAS = [5, 10, 20, 40] as const;

function exactTemperature(
  beta: number,
  exponent: number,
  coefficient: number,
  activationEnergyKJPerMol: number,
  intercept: number,
): number {
  const residual = (temperatureK: number) =>
    Math.log(beta / temperatureK ** exponent) -
    intercept +
    (coefficient * activationEnergyKJPerMol * 1000) /
      (GAS_CONSTANT_J_PER_MOL_K * temperatureK);
  let lower = 250;
  let upper = 2500;
  for (let iteration = 0; iteration < 140; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (residual(middle) > 0) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

function preparedIntegralRuns(
  exponent: number,
  coefficient: number,
  activationEnergyKJPerMol: number,
  intercept: number,
): PreparedRun[] {
  return BETAS.map((beta) => {
    const target = exactTemperature(
      beta,
      exponent,
      coefficient,
      activationEnergyKJPerMol,
      intercept,
    );
    return {
      id: `beta-${beta}`,
      heatingRateKPerMinute: beta,
      derivativeSource: 'provided',
      sampleId: 'numeric-golden',
      atmosphere: 'N2',
      stage: 'main',
      points: [
        { temperatureK: target - 10, alpha: 0.4, dAlphaDtPerMinute: 0.01 },
        { temperatureK: target, alpha: 0.5, dAlphaDtPerMinute: 0.02 },
        { temperatureK: target + 10, alpha: 0.6, dAlphaDtPerMinute: 0.03 },
      ],
    };
  });
}

function wideRangeRuns(): PreparedRun[] {
  return BETAS.map((beta) => ({
    id: `wide-${beta}`,
    heatingRateKPerMinute: beta,
    derivativeSource: 'provided',
    sampleId: 'grid-check',
    atmosphere: 'N2',
    stage: 'main',
    points: [
      { temperatureK: 430 + 18 * Math.log(beta), alpha: 0.1, dAlphaDtPerMinute: 0.01 },
      { temperatureK: 730 + 18 * Math.log(beta), alpha: 0.9, dAlphaDtPerMinute: 0.02 },
    ],
  }));
}

function codes(items: readonly { code: string }[]): string[] {
  return items.map((item) => item.code);
}

describe('AC-ALPHA acceptance matrix', () => {
  it('matches mass and mass-percent normalization and refuses unstable anchors without clipping', () => {
    const mass = normalizeMassToAlpha([10, 8.5, 7], { initialMass: 10, finalMass: 7 });
    const massPercent = normalizeMassToAlpha([100, 85, 70], {
      initialMass: 100,
      finalMass: 70,
    });
    mass.forEach((value, index) => {
      expect(value).toBeCloseTo(massPercent[index] as number, 12);
    });
    expect(mass).toEqual([0, 0.5, 1]);

    expect(() => normalizeMassToAlpha([10, 9], { initialMass: Number.NaN, finalMass: 9 }))
      .toThrow(/finite/i);
    expect(() => normalizeMassToAlpha([100, 100], { initialMass: 100, finalMass: 100 + 5e-11 }))
      .toThrow(/usable conversion span/i);

    const contextMismatch = prepareThermalRun({
      id: 'anchor-context-mismatch',
      temperatureUnit: 'K',
      heatingRate: 10,
      heatingRateUnit: 'K/min',
      massReference: { initialMass: 100, finalMass: 90 },
      points: [
        { temperature: 400, mass: 100 },
        { temperature: 500, mass: 80 },
        { temperature: 600, mass: 90 },
      ],
    });
    expect(codes(contextMismatch.refusals)).toContain('INVALID_ALPHA_ANCHORS');
    expect(contextMismatch.run).toBeUndefined();
  });

  it('locks the default grid and rejects every invalid override class', () => {
    expect(DEFAULT_ALPHA_VALUES).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
    const runs = wideRangeRuns();
    const defaultResult = calculateKAS(runs);
    expect(defaultResult.estimates.map((estimate) => estimate.alpha)).toEqual(DEFAULT_ALPHA_VALUES);

    const invalidGrids: readonly (readonly number[])[] = [
      [],
      [0.5, 0.5],
      [0],
      [1],
      [-0.1, 0.5],
      [0.5, Number.NaN],
      [0.5, Number.POSITIVE_INFINITY],
    ];
    for (const grid of invalidGrids) {
      const eligibility = evaluateAnalysisEligibility(runs, grid);
      expect(eligibility.eligible).toBe(false);
      expect(codes(eligibility.refusals)).toContain('INVALID_ALPHA_GRID');
      expect(calculateKAS(runs, grid).estimates).toEqual([]);
    }

    const custom = calculateKAS(runs, [0.25, 0.75]);
    expect(custom.estimates.map((estimate) => estimate.alpha)).toEqual([0.25, 0.75]);
  });

  it('uses the all-run alpha intersection, exact piecewise interpolation and no extrapolation', () => {
    const ranges: ReadonlyArray<readonly [number, number]> = [
      [0.1, 0.8],
      [0.2, 0.9],
      [0.15, 0.85],
      [0.12, 0.88],
    ];
    const runs = BETAS.map((beta, index): PreparedRun => ({
      id: `range-${beta}`,
      heatingRateKPerMinute: beta,
      derivativeSource: 'provided',
      sampleId: 'common-range',
      atmosphere: 'N2',
      stage: 'main',
      points: [
        { temperatureK: 400 + beta, alpha: ranges[index]?.[0] as number },
        { temperatureK: 800 + beta, alpha: ranges[index]?.[1] as number },
      ],
    }));
    const eligibility = evaluateAnalysisEligibility(runs, [0.1, 0.2, 0.5, 0.8, 0.9]);
    expect(eligibility.commonAlphaRange?.[0]).toBeCloseTo(0.2, 15);
    expect(eligibility.commonAlphaRange?.[1]).toBeCloseTo(0.8, 15);
    expect(eligibility.warnings.filter((item) => item.code === 'TARGET_ALPHA_OUTSIDE_COMMON_RANGE'))
      .toHaveLength(2);

    const result = calculateKAS(runs, [0.1, 0.2, 0.5, 0.8, 0.9]);
    expect(result.estimates.map((estimate) => estimate.alpha)).toEqual([0.2, 0.5, 0.8]);
    expect(interpolateTemperatureAtAlpha([
      { temperatureK: 300, alpha: 0.1 },
      { temperatureK: 500, alpha: 0.5 },
    ], 0.2)).toBeCloseTo(350, 9);
    expect(interpolateTemperatureAtAlpha([
      { temperatureK: 300, alpha: 0.1 },
      { temperatureK: 500, alpha: 0.5 },
    ], 0.05)).toBeUndefined();
  });
});

function friedmanInputs(mode: 'provided' | 'time' | 'temperature'): ThermalRun[] {
  const activationEnergyKJPerMol = 140;
  const intercept = 25;
  const targetTemperatures = [570, 600, 630, 660];
  return BETAS.map((beta, index) => {
    const targetTemperature = targetTemperatures[index] as number;
    const rate = Math.exp(
      intercept -
        (activationEnergyKJPerMol * 1000) /
          (GAS_CONSTANT_J_PER_MOL_K * targetTemperature),
    );
    const deltaTimeMinutes = 0.1 / rate;
    const deltaTemperature = beta * deltaTimeMinutes;
    return {
      id: `${mode}-${beta}`,
      temperatureUnit: 'K',
      heatingRate: beta,
      heatingRateUnit: 'K/min',
      ...(mode === 'time' ? { timeUnit: 'min' as const } : {}),
      sampleId: 'friedman-equivalence',
      atmosphere: 'N2',
      stage: 'main',
      points: [-1, 0, 1].map((offset) => ({
        temperature: targetTemperature + offset * deltaTemperature,
        alpha: 0.5 + offset * 0.1,
        ...(mode === 'time' ? { time: (offset + 1) * deltaTimeMinutes } : {}),
        ...(mode === 'provided' ? { dAlphaDtPerMinute: rate } : {}),
      })),
    };
  });
}

describe('AC-NUM numerical traps and method independence', () => {
  it('makes supplied, time and beta*dalpha/dT derivatives equivalent including endpoints', () => {
    const prepared = (['provided', 'time', 'temperature'] as const).map((mode) => {
      const results = friedmanInputs(mode).map(prepareThermalRun);
      expect(results.flatMap((result) => result.refusals)).toEqual([]);
      expect(results.map((result) => result.run?.derivativeSource)).toEqual(BETAS.map(() => mode));
      return results.map((result) => result.run as PreparedRun);
    });

    for (let runIndex = 0; runIndex < BETAS.length; runIndex += 1) {
      const supplied = prepared[0]?.[runIndex]?.points.map((point) => point.dAlphaDtPerMinute);
      for (const pathway of prepared.slice(1)) {
        pathway[runIndex]?.points.forEach((point, pointIndex) => {
          expect(point.dAlphaDtPerMinute).toBeCloseTo(supplied?.[pointIndex] as number, 12);
        });
      }
    }

    const energies = prepared.map((runs) =>
      calculateFriedman(runs, [0.5]).estimates[0]?.activationEnergyKJPerMol,
    );
    energies.forEach((energy) => expect(energy).toBeCloseTo(140, 8));

    const linear = [
      { temperatureK: 300, alpha: 0, timeMinutes: 0 },
      { temperatureK: 400, alpha: 0.5, timeMinutes: 1 },
      { temperatureK: 500, alpha: 1, timeMinutes: 2 },
    ];
    expect(estimateAlphaDerivative(linear, 99)).toEqual([
      expect.closeTo(0.5, 15),
      expect.closeTo(0.5, 15),
      expect.closeTo(0.5, 15),
    ]);
  });

  it('proves Celsius/Kelvin equivalence and calculation x=1/T rather than plot-scaled 1000/T', () => {
    const temperatures = BETAS.map((beta) => exactTemperature(beta, 2, 1, 150, 20));
    const makeRuns = (unit: 'K' | 'C'): ThermalRun[] => BETAS.map((beta, index) => {
      const targetK = temperatures[index] as number;
      const toInput = (kelvin: number) => unit === 'K' ? kelvin : kelvin - 273.15;
      return {
        id: `${unit}-${beta}`,
        temperatureUnit: unit,
        heatingRate: beta,
        heatingRateUnit: 'K/min',
        sampleId: 'kelvin-trap',
        atmosphere: 'N2',
        stage: 'main',
        points: [
          { temperature: toInput(targetK - 10), alpha: 0.4 },
          { temperature: toInput(targetK), alpha: 0.5 },
          { temperature: toInput(targetK + 10), alpha: 0.6 },
        ],
      };
    });
    const kelvin = analyzeActivationEnergy(makeRuns('K'), {
      methods: ['KAS'], alphaValues: [0.5], includeKissinger: false,
    });
    const celsius = analyzeActivationEnergy(makeRuns('C'), {
      methods: ['KAS'], alphaValues: [0.5], includeKissinger: false,
    });
    const kelvinEstimate = kelvin.methods[0]?.estimates[0];
    const celsiusEstimate = celsius.methods[0]?.estimates[0];
    expect(kelvinEstimate?.activationEnergyKJPerMol).toBeCloseTo(150, 8);
    expect(celsiusEstimate?.activationEnergyKJPerMol).toBeCloseTo(
      kelvinEstimate?.activationEnergyKJPerMol as number,
      10,
    );
    kelvinEstimate?.observations.forEach((observation) => {
      expect(observation.x).toBeCloseTo(1 / observation.temperatureK, 15);
      expect(Math.abs(observation.x - 1000 / observation.temperatureK)).toBeGreaterThan(1);
    });
  });

  it('locks natural-log FWO against the base-10 coefficient trap', () => {
    const result = calculateFWO(
      preparedIntegralRuns(0, FWO_SLOPE_COEFFICIENT, 150, 32),
      [0.5],
    );
    const estimate = result.estimates[0];
    const base10 = ordinaryLeastSquares(
      estimate?.observations.map((observation) => observation.x) as number[],
      estimate?.observations.map((observation) => Math.log10(observation.heatingRateKPerMinute)) as number[],
    );
    const coefficientBase10 = FWO_SLOPE_COEFFICIENT / Math.LN10;
    const energyFromBase10 =
      (-base10.slope * GAS_CONSTANT_J_PER_MOL_K) / coefficientBase10 / 1000;
    const wrongMixedBaseEnergy =
      (-base10.slope * GAS_CONSTANT_J_PER_MOL_K) / FWO_SLOPE_COEFFICIENT / 1000;
    const publishedRoundedCoefficient = 0.4567;
    const energyFromPublishedRoundedCoefficient =
      (-base10.slope * GAS_CONSTANT_J_PER_MOL_K) /
      publishedRoundedCoefficient /
      1000;
    expect(estimate?.activationEnergyKJPerMol).toBeCloseTo(150, 8);
    expect(energyFromBase10).toBeCloseTo(estimate?.activationEnergyKJPerMol as number, 10);
    expect(coefficientBase10).toBeCloseTo(0.4568777949622209, 15);
    const publishedRelativeDifference =
      Math.abs(energyFromPublishedRoundedCoefficient - 150) / 150;
    expect(publishedRelativeDifference).toBeLessThanOrEqual(5e-4);
    expect(publishedRelativeDifference).toBeGreaterThan(1e-4);
    expect(Math.abs(wrongMixedBaseEnergy - 150)).toBeGreaterThan(80);
  });

  it('keeps FWO, KAS and Starink result objects, formulas and transforms independent', () => {
    const runs = preparedIntegralRuns(0, FWO_SLOPE_COEFFICIENT, 150, 32);
    const fwo = calculateFWO(runs, [0.5]);
    const kas = calculateKAS(runs, [0.5]);
    const starink = calculateStarink(runs, [0.5]);
    expect(new Set([fwo.formulaId, kas.formulaId, starink.formulaId]).size).toBe(3);
    expect(fwo).not.toBe(kas);
    expect(kas).not.toBe(starink);
    expect(fwo.estimates).not.toBe(kas.estimates);
    const observation = fwo.estimates[0]?.observations[0];
    const kasObservation = kas.estimates[0]?.observations[0];
    const starinkObservation = starink.estimates[0]?.observations[0];
    expect(observation?.y).toBeCloseTo(Math.log(observation?.heatingRateKPerMinute as number), 15);
    expect(kasObservation?.y).toBeCloseTo(
      Math.log((kasObservation?.heatingRateKPerMinute as number) / (kasObservation?.temperatureK as number) ** 2),
      15,
    );
    expect(starinkObservation?.y).toBeCloseTo(
      Math.log(
        (starinkObservation?.heatingRateKPerMinute as number) /
          (starinkObservation?.temperatureK as number) ** STARINK_TEMPERATURE_EXPONENT,
      ),
      15,
    );
    expect(STARINK_SLOPE_COEFFICIENT).toBe(1.0008);
  });
});

function profileRuns(energies: readonly number[]): PreparedRun[] {
  const alphas = energies.length === 2 ? [0.3, 0.7] : energies.map((_, index) => 0.2 + 0.2 * index);
  return BETAS.map((beta) => ({
    id: `profile-${beta}`,
    heatingRateKPerMinute: beta,
    derivativeSource: 'provided',
    sampleId: 'profile',
    atmosphere: 'N2',
    stage: 'main',
    points: energies.map((energy, index) => ({
      alpha: alphas[index] as number,
      temperatureK: exactTemperature(beta, 2, 1, energy, 20),
      dAlphaDtPerMinute: 0.01 + index * 0.01,
    })),
  }));
}

describe('AC-REG uncertainty and Ea(alpha) diagnostics', () => {
  it.each([
    { x: [1, 2, 4], y: [2.2, 4.3, 7.7], df: 1, t: 12.706204736, ci: [0.5566975900500426, 3.0718738385213875] },
    { x: [1, 2, 3, 4], y: [2, 4, 5, 8], df: 2, t: 4.30265273, ci: [0.7616250898546866, 3.038374910145313] },
    { x: [1, 2, 3, 4, 6], y: [1.8, 4.3, 5.7, 8.2, 12.1], df: 3, t: 3.182446305, ci: [1.8026560178716218, 2.2757223605067565] },
  ])('matches independent Student-t slope CI for n=$df+2', ({ x, y, df, t, ci }) => {
    const regression = ordinaryLeastSquares(x, y);
    expect(studentTCritical95(df)).toBeCloseTo(t, 9);
    expect(regression.slopeConfidence95[0]).toBeCloseTo(ci[0], 10);
    expect(regression.slopeConfidence95[1]).toBeCloseTo(ci[1], 10);
  });

  it('emits the predeclared 10–20% and greater-than-20% Ea variation diagnostics', () => {
    const possible = calculateKAS(profileRuns([100, 115]), [0.3, 0.7]);
    expect(possible.estimates.map((estimate) => estimate.activationEnergyKJPerMol))
      .toEqual([expect.closeTo(100, 8), expect.closeTo(115, 8)]);
    expect(codes(possible.warnings)).toContain('POSSIBLE_MULTISTEP_EA_VARIATION');
    expect(codes(possible.warnings)).not.toContain('MULTISTEP_EA_VARIATION');

    const multistep = calculateKAS(profileRuns([100, 140]), [0.3, 0.7]);
    expect(multistep.estimates.map((estimate) => estimate.activationEnergyKJPerMol))
      .toEqual([expect.closeTo(100, 8), expect.closeTo(140, 8)]);
    expect(codes(multistep.warnings)).toContain('MULTISTEP_EA_VARIATION');
  });
});
