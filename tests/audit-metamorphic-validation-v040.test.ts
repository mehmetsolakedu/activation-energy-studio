import { describe, expect, it } from 'vitest';

import {
  calculateFriedman,
  calculateKAS,
  ordinaryLeastSquares,
  prepareThermalRun,
  type AlphaMethodResult,
  type PreparedRun,
  type ThermalRun,
} from '../src/core';
import {
  normalizeThermalTable,
  type BatchIngestionResult,
  type IngestionResult,
  type MassUnit,
  type RawTable,
} from '../src/io';
import { buildThermalRuns } from '../src/integration';

/** Independent literals: expected relationships must not be derived from SUT constants. */
const R_J_PER_MOL_K = 8.31446261815324;
const KAS_EA_KJ_PER_MOL = 110;
const FRIEDMAN_EA_KJ_PER_MOL = 88;
const HEATING_RATES = [5, 10, 20, 40] as const;
const KAS_ALPHA_GRID = [0.25, 0.5, 0.75] as const;
const MASS_ALPHA_POINTS = [0, ...KAS_ALPHA_GRID, 1] as const;

function recordEvidence(caseId: string, values: Record<string, unknown>): void {
  if (process.env.AES_METAMORPHIC_EVIDENCE === '1') {
    console.info(`METAMORPHIC_EVIDENCE ${JSON.stringify({ caseId, ...values })}`);
  }
}

function expectRelative(
  actual: number,
  expected: number,
  maximumRelativeError: number,
): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected) / Math.max(1, Math.abs(expected)))
    .toBeLessThanOrEqual(maximumRelativeError);
}

function estimateAt(result: AlphaMethodResult, alpha: number): number {
  expect(result.status).toBe('success');
  const estimate = result.estimates.find((item) => item.alpha === alpha);
  expect(estimate).toBeDefined();
  return estimate!.activationEnergyKJPerMol;
}

/**
 * Independent bisection of ln(beta/T^2) = b_alpha - E/(RT). The generated
 * temperatures therefore have an analytically known KAS apparent energy.
 */
function solveKasTemperature(
  betaKPerMinute: number,
  alpha: number,
): number {
  const intercept = 12.2 - 1.5 * alpha;
  const residual = (temperatureK: number) => (
    Math.log(betaKPerMinute / temperatureK ** 2)
    - intercept
    + (KAS_EA_KJ_PER_MOL * 1000) / (R_J_PER_MOL_K * temperatureK)
  );
  let lower = 250;
  let upper = 2500;
  expect(residual(lower)).toBeGreaterThan(0);
  expect(residual(upper)).toBeLessThan(0);
  for (let iteration = 0; iteration < 180; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (residual(middle) > 0) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

function readyBatch(file: IngestionResult): BatchIngestionResult {
  expect(file.status, JSON.stringify(file.diagnostics)).toBe('ready');
  return {
    status: 'ready',
    files: [file],
    diagnostics: file.diagnostics,
    records: file.records,
    tables: file.tables,
  };
}

function massAtAlphaMg(alpha: number): number {
  return 12 - 9 * alpha;
}

function ingestMassRun(
  betaKPerMinute: number,
  unit: MassUnit,
): PreparedRun {
  const temperaturesK = MASS_ALPHA_POINTS.map((alpha) => (
    solveKasTemperature(betaKPerMinute, alpha)
  ));
  const divisor = unit === 'mg' ? 1 : 1000;
  const table: RawTable = [
    ['Temperature [K]', `Mass [${unit}]`],
    ...MASS_ALPHA_POINTS.map((alpha, index) => [
      temperaturesK[index]!,
      massAtAlphaMg(alpha) / divisor,
    ]),
  ];
  const source = {
    fileName: `controlled-${betaKPerMinute}-${unit}.csv`,
    fileType: 'table' as const,
  };
  const ingestion = normalizeThermalTable(table, source, {
    tableKind: 'curve',
    decimalSeparator: '.',
    columnMapping: {
      temperature: { column: 0, unit: 'K' },
      mass: { column: 1, unit },
    },
    defaults: {
      heatingRate: { value: betaKPerMinute, unit: 'K/min' },
      runId: `mass-${betaKPerMinute}-${unit}`,
      sample: 'controlled-mass-sample',
      atmosphere: 'N2',
      stage: 'single controlled mass-loss stage',
    },
  });
  const built = buildThermalRuns(
    readyBatch(ingestion),
    {
      startCelsius: temperaturesK[0]! - 273.15,
      endCelsius: temperaturesK.at(-1)! - 273.15,
    },
    'single controlled mass-loss stage',
  );
  expect(built.diagnostics, JSON.stringify(built.diagnostics)).toEqual([]);
  expect(built.runs).toHaveLength(1);
  const prepared = prepareThermalRun(built.runs[0]!);
  expect(prepared.refusals, JSON.stringify(prepared.refusals)).toEqual([]);
  expect(prepared.run).toBeDefined();
  return prepared.run!;
}

function ingestExplicitAlphaRun(
  betaKPerMinute: number,
  alphaValues: readonly number[],
  suffix: string,
): PreparedRun {
  const table: RawTable = [
    ['Temperature [K]', 'Explicit normalized alpha [fraction]'],
    ...MASS_ALPHA_POINTS.map((alpha, index) => [
      solveKasTemperature(betaKPerMinute, alpha),
      alphaValues[index]!,
    ]),
  ];
  const ingestion = normalizeThermalTable(
    table,
    { fileName: `controlled-${betaKPerMinute}-${suffix}.csv`, fileType: 'table' },
    {
      tableKind: 'curve',
      decimalSeparator: '.',
      columnMapping: {
        temperature: { column: 0, unit: 'K' },
        alpha: { column: 1, unit: 'fraction' },
      },
      defaults: {
        heatingRate: { value: betaKPerMinute, unit: 'K/min' },
        runId: `alpha-${betaKPerMinute}-${suffix}`,
        sample: 'controlled-mass-sample',
        atmosphere: 'N2',
        stage: 'single controlled mass-loss stage',
      },
    },
  );
  const built = buildThermalRuns(
    readyBatch(ingestion),
    undefined,
    'single controlled mass-loss stage',
  );
  expect(built.diagnostics, JSON.stringify(built.diagnostics)).toEqual([]);
  expect(built.runs).toHaveLength(1);
  const prepared = prepareThermalRun(built.runs[0]!);
  expect(prepared.refusals, JSON.stringify(prepared.refusals)).toEqual([]);
  expect(prepared.run).toBeDefined();
  return prepared.run!;
}

function controlledFriedmanRun(
  betaKPerMinute: number,
  targetTemperatureK: number,
  timeUnit: 'min' | 's',
  normalizedOffsets: readonly number[],
  suffix: string,
): ThermalRun {
  const logRateIntercept = 18;
  const targetRatePerMinute = Math.exp(
    logRateIntercept
      - (FRIEDMAN_EA_KJ_PER_MOL * 1000)
        / (R_J_PER_MOL_K * targetTemperatureK),
  );
  const centerTimeMinutes = 10;
  return {
    id: `friedman-${betaKPerMinute}-${suffix}`,
    heatingRate: betaKPerMinute,
    heatingRateUnit: 'K/min',
    temperatureUnit: 'K',
    timeUnit,
    sampleId: 'controlled-quadratic-time-curve',
    atmosphere: 'N2',
    stage: 'single controlled reaction',
    points: normalizedOffsets.map((normalizedOffset) => {
      const timeOffsetMinutes = normalizedOffset / targetRatePerMinute;
      const timeMinutes = centerTimeMinutes + timeOffsetMinutes;
      return {
        temperature: targetTemperatureK + betaKPerMinute * timeOffsetMinutes,
        time: timeUnit === 'min' ? timeMinutes : timeMinutes * 60,
        // Quadratic in time: the three-point nonuniform formula is exact.
        alpha:
          0.5
          + normalizedOffset
          + 0.08 * normalizedOffset ** 2,
      };
    }),
  };
}

function preparedFriedmanRuns(
  timeUnit: 'min' | 's',
  normalizedOffsets: readonly number[],
  suffix: string,
): PreparedRun[] {
  const targetTemperaturesK = [520, 560, 600, 640] as const;
  return HEATING_RATES.map((beta, index) => {
    const result = prepareThermalRun(controlledFriedmanRun(
      beta,
      targetTemperaturesK[index]!,
      timeUnit,
      normalizedOffsets,
      suffix,
    ));
    expect(result.refusals, JSON.stringify(result.refusals)).toEqual([]);
    expect(result.run).toBeDefined();
    return result.run!;
  });
}

describe('audit v0.4.0: executed metamorphic scientific contracts', () => {
  it('keeps normalized alpha and KAS Ea invariant for equivalent mg and g mass values and anchors', () => {
    const milligramRuns = HEATING_RATES.map((beta) => ingestMassRun(beta, 'mg'));
    const gramRuns = HEATING_RATES.map((beta) => ingestMassRun(beta, 'g'));

    milligramRuns.forEach((milligramRun, runIndex) => {
      const gramRun = gramRuns[runIndex]!;
      expect(gramRun.points).toHaveLength(milligramRun.points.length);
      gramRun.points.forEach((point, pointIndex) => {
        expectRelative(point.alpha, milligramRun.points[pointIndex]!.alpha, 2e-15);
        expectRelative(point.alpha, MASS_ALPHA_POINTS[pointIndex]!, 2e-15);
        expectRelative(
          point.temperatureK,
          milligramRun.points[pointIndex]!.temperatureK,
          2e-15,
        );
      });
    });

    const milligramResult = calculateKAS(milligramRuns, KAS_ALPHA_GRID);
    const gramResult = calculateKAS(gramRuns, KAS_ALPHA_GRID);
    const activationEnergies = KAS_ALPHA_GRID.map((alpha) => {
      const expected = KAS_EA_KJ_PER_MOL;
      const milligramEa = estimateAt(milligramResult, alpha);
      const gramEa = estimateAt(gramResult, alpha);
      expectRelative(milligramEa, expected, 2e-10);
      expectRelative(gramEa, expected, 2e-10);
      expectRelative(gramEa, milligramEa, 2e-12);
      return { alpha, milligramEa, gramEa };
    });
    recordEvidence('mass-mg-vs-g', {
      alpha: milligramRuns[0]!.points.map((point) => point.alpha),
      activationEnergies,
    });
  });

  it('keeps Ea invariant under x=1/T versus x=1000/T with explicit slope-unit conversion', () => {
    const temperaturesK = [515, 550, 590, 635, 680] as const;
    const expectedEaKJPerMol = 112.3;
    const intercept = 9.7;
    const reciprocalK = temperaturesK.map((temperatureK) => 1 / temperatureK);
    const reciprocalMilliK = reciprocalK.map((value) => value * 1000);
    const y = reciprocalK.map((x) => (
      intercept - (expectedEaKJPerMol * 1000 / R_J_PER_MOL_K) * x
    ));

    const perKelvin = ordinaryLeastSquares(reciprocalK, y);
    const perThousandKelvin = ordinaryLeastSquares(reciprocalMilliK, y);
    const eaFromPerKelvin = -perKelvin.slope * R_J_PER_MOL_K / 1000;
    const eaFromPerThousandKelvin = -perThousandKelvin.slope * R_J_PER_MOL_K;

    expectRelative(perThousandKelvin.slope, perKelvin.slope / 1000, 2e-13);
    expectRelative(eaFromPerKelvin, expectedEaKJPerMol, 2e-13);
    expectRelative(eaFromPerThousandKelvin, expectedEaKJPerMol, 2e-13);
    expectRelative(eaFromPerThousandKelvin, eaFromPerKelvin, 2e-13);
    recordEvidence('ols-reciprocal-temperature-scale', {
      slopeForOnePerK: perKelvin.slope,
      slopeForThousandPerK: perThousandKelvin.slope,
      eaFromOnePerK: eaFromPerKelvin,
      eaFromThousandPerK: eaFromPerThousandKelvin,
    });
  });

  it('keeps prepared time, numerical derivatives, and Friedman Ea invariant for seconds versus minutes', () => {
    const offsets = [-0.08, -0.04, 0, 0.04, 0.08] as const;
    const minuteRuns = preparedFriedmanRuns('min', offsets, 'minutes');
    const secondRuns = preparedFriedmanRuns('s', offsets, 'seconds');
    let maximumTimeDifferenceMinutes = 0;
    let maximumDerivativeDifferencePerMinute = 0;

    minuteRuns.forEach((minuteRun, runIndex) => {
      const secondRun = secondRuns[runIndex]!;
      expect(secondRun.derivativeSource).toBe('time');
      expect(minuteRun.derivativeSource).toBe('time');
      secondRun.points.forEach((point, pointIndex) => {
        const minutePoint = minuteRun.points[pointIndex]!;
        maximumTimeDifferenceMinutes = Math.max(
          maximumTimeDifferenceMinutes,
          Math.abs(point.timeMinutes! - minutePoint.timeMinutes!),
        );
        maximumDerivativeDifferencePerMinute = Math.max(
          maximumDerivativeDifferencePerMinute,
          Math.abs(
            point.dAlphaDtPerMinute! - minutePoint.dAlphaDtPerMinute!,
          ),
        );
        expectRelative(point.timeMinutes!, minutePoint.timeMinutes!, 2e-14);
        expectRelative(
          point.dAlphaDtPerMinute!,
          minutePoint.dAlphaDtPerMinute!,
          3e-13,
        );
      });
    });

    const minuteEa = estimateAt(calculateFriedman(minuteRuns, [0.5]), 0.5);
    const secondEa = estimateAt(calculateFriedman(secondRuns, [0.5]), 0.5);
    expectRelative(minuteEa, FRIEDMAN_EA_KJ_PER_MOL, 2e-10);
    expectRelative(secondEa, FRIEDMAN_EA_KJ_PER_MOL, 2e-10);
    expectRelative(secondEa, minuteEa, 2e-12);
    recordEvidence('time-seconds-vs-minutes', {
      maximumTimeDifferenceMinutes,
      maximumDerivativeDifferencePerMinute,
      minuteEa,
      secondEa,
    });
  });

  it('keeps the raw-grid derivative and Friedman Ea invariant when only raw sampling density changes', () => {
    const sparseOffsets = [-0.08, 0, 0.08] as const;
    const denseOffsets = [
      -0.08,
      -0.06,
      -0.04,
      -0.02,
      0,
      0.02,
      0.04,
      0.06,
      0.08,
    ] as const;
    const sparseRuns = preparedFriedmanRuns('min', sparseOffsets, 'sparse-raw-grid');
    const denseRuns = preparedFriedmanRuns('min', denseOffsets, 'dense-raw-grid');
    const fixedOutputAlphaGrid = [0.5] as const;

    expect(sparseRuns.every((run) => run.points.length === 3)).toBe(true);
    expect(denseRuns.every((run) => run.points.length === 9)).toBe(true);
    sparseRuns.forEach((sparseRun, runIndex) => {
      const denseRun = denseRuns[runIndex]!;
      const sparseTarget = sparseRun.points.find((point) => point.alpha === 0.5)!;
      const denseTarget = denseRun.points.find((point) => point.alpha === 0.5)!;
      expectRelative(
        denseTarget.dAlphaDtPerMinute!,
        sparseTarget.dAlphaDtPerMinute!,
        3e-13,
      );
    });

    const sparseResult = calculateFriedman(sparseRuns, fixedOutputAlphaGrid);
    const denseResult = calculateFriedman(denseRuns, fixedOutputAlphaGrid);
    expect(sparseResult.estimates).toHaveLength(1);
    expect(denseResult.estimates).toHaveLength(1);
    const sparseEa = estimateAt(sparseResult, 0.5);
    const denseEa = estimateAt(denseResult, 0.5);
    expectRelative(sparseEa, FRIEDMAN_EA_KJ_PER_MOL, 2e-10);
    expectRelative(denseEa, FRIEDMAN_EA_KJ_PER_MOL, 2e-10);
    expectRelative(denseEa, sparseEa, 2e-12);
    recordEvidence('raw-grid-density', {
      sparseRawPointCountPerRun: sparseRuns[0]!.points.length,
      denseRawPointCountPerRun: denseRuns[0]!.points.length,
      outputAlphaGrid: fixedOutputAlphaGrid,
      sparseTargetDerivatives: sparseRuns.map((run) => (
        run.points.find((point) => point.alpha === 0.5)!.dAlphaDtPerMinute
      )),
      denseTargetDerivatives: denseRuns.map((run) => (
        run.points.find((point) => point.alpha === 0.5)!.dAlphaDtPerMinute
      )),
      sparseEa,
      denseEa,
    });
  });

  it('fails closed on untreated reverse-coded mass, then matches alpha and KAS Ea after explicit physical normalization', () => {
    const massRuns = HEATING_RATES.map((beta) => ingestMassRun(beta, 'mg'));
    const reverseSignal = MASS_ALPHA_POINTS.map((alpha) => -massAtAlphaMg(alpha));
    const reverseStart = reverseSignal[0]!;
    const reverseEnd = reverseSignal.at(-1)!;
    const explicitlyNormalizedAlpha = reverseSignal.map(
      (signal) => (signal - reverseStart) / (reverseEnd - reverseStart),
    );

    // The raw signal increases, so treating it as ordinary mass must not be
    // silently accepted under the mass-loss normalization contract.
    const untreated = prepareThermalRun({
      id: 'untreated-reverse-coded-mass',
      heatingRate: 10,
      heatingRateUnit: 'K/min',
      temperatureUnit: 'K',
      massReference: { initialMass: reverseStart, finalMass: reverseEnd },
      points: MASS_ALPHA_POINTS.map((alpha, index) => ({
        temperature: solveKasTemperature(10, alpha),
        mass: reverseSignal[index]!,
      })),
      sampleId: 'controlled-mass-sample',
      atmosphere: 'N2',
      stage: 'single controlled mass-loss stage',
    });
    expect(untreated.run).toBeUndefined();
    expect(untreated.refusals.map((item) => item.code)).toContain(
      'INVALID_ALPHA_ANCHORS',
    );

    const normalizedRuns = HEATING_RATES.map((beta) => ingestExplicitAlphaRun(
      beta,
      explicitlyNormalizedAlpha,
      'explicit-reverse-normalization',
    ));
    normalizedRuns.forEach((normalizedRun, runIndex) => {
      normalizedRun.points.forEach((point, pointIndex) => {
        expectRelative(point.alpha, MASS_ALPHA_POINTS[pointIndex]!, 2e-15);
        expectRelative(point.alpha, massRuns[runIndex]!.points[pointIndex]!.alpha, 2e-15);
      });
    });

    const massResult = calculateKAS(massRuns, KAS_ALPHA_GRID);
    const normalizedResult = calculateKAS(normalizedRuns, KAS_ALPHA_GRID);
    const activationEnergies = KAS_ALPHA_GRID.map((alpha) => {
      const massEa = estimateAt(massResult, alpha);
      const normalizedEa = estimateAt(normalizedResult, alpha);
      expectRelative(normalizedEa, KAS_EA_KJ_PER_MOL, 2e-10);
      expectRelative(normalizedEa, massEa, 2e-12);
      return { alpha, massEa, normalizedEa };
    });
    recordEvidence('reverse-coded-explicit-normalization', {
      untreatedRefusalCodes: untreated.refusals.map((item) => item.code),
      reverseSignal,
      explicitlyNormalizedAlpha,
      activationEnergies,
    });
  });
});
