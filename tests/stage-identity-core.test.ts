import { describe, expect, it } from "vitest";

import {
  analyzeActivationEnergy,
  calculateKissinger,
  type Diagnostic,
  type KissingerPeak,
  type ThermalRun,
} from "../src/core";

const RATES = [5, 10, 20] as const;

function codes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map(({ code }) => code);
}

function curveRuns(stages: readonly (string | undefined)[]): ThermalRun[] {
  return RATES.map((heatingRate, index) => {
    const temperature = 560 + index * 30;
    return {
      id: `curve-${heatingRate}`,
      heatingRate,
      heatingRateUnit: "K/min",
      temperatureUnit: "K",
      sampleId: "stage-identity-sample",
      atmosphere: "N2",
      ...(stages[index] === undefined ? {} : { stage: stages[index] }),
      points: [
        { temperature: temperature - 20, alpha: 0.1 },
        { temperature, alpha: 0.5 },
        { temperature: temperature + 20, alpha: 0.9 },
      ],
    };
  });
}

function peaks(stages: readonly (string | undefined)[]): KissingerPeak[] {
  return RATES.map((heatingRateKPerMinute, index) => ({
    runId: `peak-${heatingRateKPerMinute}`,
    heatingRateKPerMinute,
    peakTemperatureK: 580 + index * 25,
    ...(stages[index] === undefined ? {} : { stage: stages[index] }),
  }));
}

function analyzeCurves(stages: readonly (string | undefined)[]) {
  return analyzeActivationEnergy(curveRuns(stages), {
    alphaValues: [0.5],
    methods: ["KAS"],
    includeKissinger: false,
  });
}

function expectNoCurveNumber(analysis: ReturnType<typeof analyzeCurves>): void {
  expect(analysis.status).toBe("refused");
  expect(analysis.methods).toEqual([]);
}

function expectNoPeakNumber(result: ReturnType<typeof calculateKissinger>): void {
  expect(result.status).toBe("refused");
  expect(result.activationEnergyKJPerMol).toBeUndefined();
  expect(result.regression).toBeUndefined();
  expect(result.observations).toEqual([]);
}

describe("core physical-stage identity contract", () => {
  it("hard-refuses all-missing stage assignments for curves and Kissinger peaks", () => {
    const curve = analyzeCurves([undefined, undefined, undefined]);
    const peak = calculateKissinger(peaks([undefined, undefined, undefined]));

    expectNoCurveNumber(curve);
    expect(codes(curve.refusals)).toContain("AMBIGUOUS_STAGE");
    expectNoPeakNumber(peak);
    expect(codes(peak.refusals)).toEqual(["AMBIGUOUS_STAGE"]);
  });

  it("hard-refuses partially missing stage assignments", () => {
    const curve = analyzeCurves(["main", undefined, "main"]);
    const peak = calculateKissinger(peaks(["main", undefined, "main"]));

    expectNoCurveNumber(curve);
    expect(codes(curve.refusals)).toContain("AMBIGUOUS_STAGE");
    expectNoPeakNumber(peak);
    expect(codes(peak.refusals)).toEqual(["AMBIGUOUS_STAGE"]);
  });

  it("keeps the existing mixed-stage refusal behavior", () => {
    const curve = analyzeCurves(["main", "shoulder", "main"]);
    const peak = calculateKissinger(peaks(["main", "shoulder", "main"]));

    expectNoCurveNumber(curve);
    expect(codes(curve.refusals)).toContain("INCONSISTENT_CONTEXT");
    expectNoPeakNumber(peak);
    expect(codes(peak.refusals)).toEqual(["AMBIGUOUS_STAGE"]);
  });

  it("produces finite numbers only when every input shares one nonblank stage", () => {
    const curve = analyzeCurves(["main", "main", "main"]);
    const peak = calculateKissinger(peaks(["main", "main", "main"]));

    expect(curve.status).toBe("success");
    expect(curve.refusals).toEqual([]);
    expect(curve.methods).toHaveLength(1);
    expect(curve.methods[0]?.estimates).toHaveLength(1);
    expect(curve.methods[0]?.estimates[0]?.activationEnergyKJPerMol)
      .toSatisfy((value: number) => Number.isFinite(value) && value > 0);

    expect(peak.status).toBe("success");
    expect(peak.refusals).toEqual([]);
    expect(peak.activationEnergyKJPerMol)
      .toSatisfy((value: number) => Number.isFinite(value) && value > 0);
    expect(peak.regression).toBeDefined();
  });
});
