import { describe, expect, it } from "vitest";

import {
  calculateFriedman,
  calculateFWO,
  calculateKAS,
  calculateKissinger,
  calculateStarink,
  type ActivationEnergyAnalysis,
  type AlphaMethodResult,
  type KissingerPeak,
  type PreparedRun,
} from "../src/core";
import { createProjectReport } from "../src/report";
import { VERIFIED_EXTERNAL_PEAK_EVIDENCE } from "./helpers/peak-evidence";

interface RunValue {
  id: string;
  beta: number;
  temperatureK: number;
  derivative: number;
}

function preparedRun(value: RunValue): PreparedRun {
  return {
    id: value.id,
    heatingRateKPerMinute: value.beta,
    derivativeSource: "provided",
    sampleId: "replicate-contract",
    atmosphere: "N2",
    stage: "main",
    points: [
      {
        temperatureK: value.temperatureK - 20,
        alpha: 0.1,
        dAlphaDtPerMinute: value.derivative / 2,
      },
      {
        temperatureK: value.temperatureK,
        alpha: 0.5,
        dAlphaDtPerMinute: value.derivative,
      },
      {
        temperatureK: value.temperatureK + 20,
        alpha: 0.9,
        dAlphaDtPerMinute: value.derivative * 2,
      },
    ],
  };
}

const commonValues: RunValue[] = [
  { id: "beta-10", beta: 10, temperatureK: 580, derivative: 0.03 },
  { id: "beta-20", beta: 20, temperatureK: 600, derivative: 0.06 },
  { id: "beta-40", beta: 40, temperatureK: 625, derivative: 0.11 },
];

const replicatedValues: RunValue[] = [
  { id: "beta-5-a", beta: 5, temperatureK: 560, derivative: 0.01 },
  { id: "beta-5-b", beta: 5, temperatureK: 562, derivative: 0.014 },
  ...commonValues,
];

const preaveragedValues: RunValue[] = [
  { id: "beta-5-mean", beta: 5, temperatureK: 561, derivative: 0.012 },
  ...commonValues,
];

const calculators = {
  FWO: calculateFWO,
  KAS: calculateKAS,
  STARINK: calculateStarink,
  FRIEDMAN: calculateFriedman,
} as const;

function singleEstimate(result: AlphaMethodResult) {
  expect(result.status).toBe("success");
  expect(result.estimates).toHaveLength(1);
  return result.estimates[0]!;
}

function expectSameRegression(
  actual: ReturnType<typeof singleEstimate>,
  expected: ReturnType<typeof singleEstimate>,
): void {
  expect(actual.activationEnergyKJPerMol).toBeCloseTo(
    expected.activationEnergyKJPerMol,
    12,
  );
  expect(actual.regression.slope).toBeCloseTo(expected.regression.slope, 12);
  expect(actual.regression.slopeStandardError).toBeCloseTo(
    expected.regression.slopeStandardError,
    12,
  );
  expect(actual.regression.slopeConfidence95[0]).toBeCloseTo(
    expected.regression.slopeConfidence95[0],
    12,
  );
  expect(actual.regression.slopeConfidence95[1]).toBeCloseTo(
    expected.regression.slopeConfidence95[1],
    12,
  );
}

describe("replicate-aware distinct-heating-rate regression", () => {
  it.each(Object.entries(calculators))(
    "%s averages physical replicate quantities before one equal-weight OLS input per beta",
    (_method, calculate) => {
      const replicated = singleEstimate(
        calculate(replicatedValues.map(preparedRun), [0.5]),
      );
      const preaveraged = singleEstimate(
        calculate(preaveragedValues.map(preparedRun), [0.5]),
      );

      expectSameRegression(replicated, preaveraged);
      expect(replicated.observations).toHaveLength(5);
      expect(replicated.regression).toMatchObject({
        n: 4,
        rawObservationCount: 5,
        residualDegreesOfFreedom: 2,
        inputAggregation: "arithmetic-mean-physical-scale-by-heating-rate",
      });
      expect(replicated.regression.inputGroups).toHaveLength(4);
      expect(replicated.regression.inputGroups[0]).toMatchObject({
        groupId: "beta:5.00000000000000",
        sourceRunIds: ["beta-5-a", "beta-5-b"],
        replicateCount: 2,
        aggregation: "arithmetic-mean-physical-scale-by-heating-rate",
        heatingRateKPerMinute: 5,
        temperatureK: 561,
      });
      expect(replicated.regression.inputGroups[0]?.temperatureSampleStandardDeviationK)
        .toBeCloseTo(Math.SQRT2, 12);
      expect(replicated.regression.inputGroups.reduce(
        (sum, group) => sum + group.replicateCount,
        0,
      )).toBe(5);
    },
  );

  it.each(Object.entries(calculators))(
    "%s is invariant when balanced extra replicates preserve the physical-scale mean",
    (_method, calculate) => {
      const baseline = singleEstimate(
        calculate(replicatedValues.map(preparedRun), [0.5]),
      );
      const expandedValues: RunValue[] = [
        ...replicatedValues.slice(0, 2),
        { id: "beta-5-c", beta: 5, temperatureK: 559, derivative: 0.008 },
        { id: "beta-5-d", beta: 5, temperatureK: 563, derivative: 0.016 },
        ...commonValues,
      ];
      const expanded = singleEstimate(
        calculate(expandedValues.map(preparedRun), [0.5]),
      );

      expectSameRegression(expanded, baseline);
      expect(expanded.regression.n).toBe(4);
      expect(expanded.regression.rawObservationCount).toBe(7);
      expect(expanded.regression.residualDegreesOfFreedom).toBe(2);
    },
  );

  it("applies the same physical-scale grouping contract to Kissinger peaks", () => {
    const replicated: KissingerPeak[] = [
      { runId: "peak-5-a", heatingRateKPerMinute: 5, peakTemperatureK: 560, ...VERIFIED_EXTERNAL_PEAK_EVIDENCE, stage: "main" },
      { runId: "peak-5-b", heatingRateKPerMinute: 5, peakTemperatureK: 562, ...VERIFIED_EXTERNAL_PEAK_EVIDENCE, stage: "main" },
      { runId: "peak-10", heatingRateKPerMinute: 10, peakTemperatureK: 580, ...VERIFIED_EXTERNAL_PEAK_EVIDENCE, stage: "main" },
      { runId: "peak-20", heatingRateKPerMinute: 20, peakTemperatureK: 600, ...VERIFIED_EXTERNAL_PEAK_EVIDENCE, stage: "main" },
      { runId: "peak-40", heatingRateKPerMinute: 40, peakTemperatureK: 625, ...VERIFIED_EXTERNAL_PEAK_EVIDENCE, stage: "main" },
    ];
    const preaveraged: KissingerPeak[] = [
      { runId: "peak-5-mean", heatingRateKPerMinute: 5, peakTemperatureK: 561, ...VERIFIED_EXTERNAL_PEAK_EVIDENCE, stage: "main" },
      ...replicated.slice(2),
    ];

    const actual = calculateKissinger(replicated);
    const expected = calculateKissinger(preaveraged);

    expect(actual.status).toBe("success");
    expect(expected.status).toBe("success");
    expect(actual.activationEnergyKJPerMol).toBeCloseTo(
      expected.activationEnergyKJPerMol!,
      12,
    );
    expectSameRegression(
      {
        alpha: 0.5,
        activationEnergyKJPerMol: actual.activationEnergyKJPerMol!,
        regression: actual.regression!,
        observations: actual.observations,
      },
      {
        alpha: 0.5,
        activationEnergyKJPerMol: expected.activationEnergyKJPerMol!,
        regression: expected.regression!,
        observations: expected.observations,
      },
    );
    expect(actual.regression).toMatchObject({
      n: 4,
      rawObservationCount: 5,
      residualDegreesOfFreedom: 2,
      inputAggregation: "arithmetic-mean-physical-scale-by-heating-rate",
    });
    expect(actual.warnings.map((warning) => warning.code)).toContain(
      "DUPLICATE_HEATING_RATE",
    );
  });

  it("refuses duplicated Kissinger run identifiers instead of treating copied rows as replicates", () => {
    const result = calculateKissinger([
      { runId: "same", heatingRateKPerMinute: 5, peakTemperatureK: 560, ...VERIFIED_EXTERNAL_PEAK_EVIDENCE, stage: "main" },
      { runId: "same", heatingRateKPerMinute: 10, peakTemperatureK: 580, ...VERIFIED_EXTERNAL_PEAK_EVIDENCE, stage: "main" },
      { runId: "third", heatingRateKPerMinute: 20, peakTemperatureK: 600, ...VERIFIED_EXTERNAL_PEAK_EVIDENCE, stage: "main" },
    ]);

    expect(result.status).toBe("refused");
    expect(result.regression).toBeUndefined();
    expect(result.refusals).toEqual([
      expect.objectContaining({ code: "DUPLICATE_RUN_ID", runIds: ["same", "same", "third"] }),
    ]);
  });

  it("reports distinct-beta n and raw replicate provenance without indexing aggregate residuals as raw rows", () => {
    const preparedRuns = replicatedValues.map(preparedRun);
    const method = calculateKAS(preparedRuns, [0.5]);
    const analysis: ActivationEnergyAnalysis = {
      status: "success",
      preparedRuns,
      eligibility: {
        eligible: true,
        commonAlphaRange: [0.1, 0.9],
        distinctHeatingRates: 4,
        refusals: [],
        warnings: [],
      },
      methods: [method],
      refusals: [],
      warnings: [],
      constants: { gasConstantJPerMolK: 8.31446261815324 },
    };

    const report = createProjectReport(analysis, {
      projectName: "Replicate trace contract",
      sourceFiles: [],
    });
    const result = report.results[0]!;
    const link = report.traceability.resultLinks[0]!;
    const traces = report.traceability.observationLinks;

    expect(result).toMatchObject({
      n: 4,
      rawObservationCount: 5,
      residualDegreesOfFreedom: 2,
      regressionInputAggregation: "arithmetic-mean-physical-scale-by-heating-rate",
    });
    expect(link.includedObservationIds).toHaveLength(5);
    expect(link.regressionInputGroupIds).toHaveLength(4);
    expect(
      traces.filter(
        (trace) => trace.regressionInputGroupId === "beta:5.00000000000000",
      ),
    ).toHaveLength(2);
    expect(
      traces.every(
        (trace) => Number.isFinite(trace.predictedY) && Number.isFinite(trace.residual),
      ),
    ).toBe(true);
  });
});
