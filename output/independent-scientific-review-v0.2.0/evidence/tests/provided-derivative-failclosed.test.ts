import { describe, expect, it } from "vitest";

import {
  analyzeActivationEnergy,
  prepareThermalRun,
  type ThermalRun,
} from "../src/core";

function rawRun(id: string, heatingRate: number): ThermalRun {
  return {
    id,
    heatingRate,
    heatingRateUnit: "K/min",
    temperatureUnit: "K",
    sampleId: "provided-derivative-contract",
    atmosphere: "N2",
    stage: "main",
    points: [
      { temperature: 500 + heatingRate, alpha: 0.1, dAlphaDtPerMinute: 0.01 },
      { temperature: 550 + heatingRate, alpha: 0.5, dAlphaDtPerMinute: 0.02 },
      { temperature: 600 + heatingRate, alpha: 0.9, dAlphaDtPerMinute: 0.03 },
    ],
  };
}

describe("provided derivative fail-closed contract", () => {
  it.each([
    {
      label: "one missing value",
      mutate: (run: ThermalRun): ThermalRun => ({
        ...run,
        points: run.points.map((point, index) => {
          if (index !== 1) return point;
          const { dAlphaDtPerMinute: _removed, ...withoutDerivative } = point;
          return withoutDerivative;
        }),
      }),
      missingCount: 1,
      nonFiniteCount: 0,
    },
    {
      label: "NaN",
      mutate: (run: ThermalRun): ThermalRun => ({
        ...run,
        points: run.points.map((point, index) =>
          index === 1 ? { ...point, dAlphaDtPerMinute: Number.NaN } : point),
      }),
      missingCount: 0,
      nonFiniteCount: 1,
    },
    {
      label: "positive infinity",
      mutate: (run: ThermalRun): ThermalRun => ({
        ...run,
        points: run.points.map((point, index) =>
          index === 1 ? { ...point, dAlphaDtPerMinute: Number.POSITIVE_INFINITY } : point),
      }),
      missingCount: 0,
      nonFiniteCount: 1,
    },
    {
      label: "negative infinity",
      mutate: (run: ThermalRun): ThermalRun => ({
        ...run,
        points: run.points.map((point, index) =>
          index === 1 ? { ...point, dAlphaDtPerMinute: Number.NEGATIVE_INFINITY } : point),
      }),
      missingCount: 0,
      nonFiniteCount: 1,
    },
  ])("refuses $label without numerical fallback", ({ mutate, missingCount, nonFiniteCount }) => {
    const result = prepareThermalRun(mutate(rawRun("bad-derivative", 10)));

    expect(result.run).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.refusals).toEqual([
      {
        code: "INVALID_PROVIDED_DERIVATIVE",
        severity: "refusal",
        message:
          "Run bad-derivative has a partially missing or non-finite provided dAlpha/dt series. "
          + "Every point must contain a finite dAlpha/dt value per minute, or the provided "
          + "derivative must be omitted entirely; numerical fallback is not allowed for a "
          + "malformed supplied series.",
        runIds: ["bad-derivative"],
        details: {
          pointCount: 3,
          missingCount,
          nonFiniteCount,
        },
      },
    ]);
  });

  it("keeps the explicit numerical pathway when the derivative column is wholly absent", () => {
    const run = rawRun("no-derivative-column", 10);
    const withoutDerivative: ThermalRun = {
      ...run,
      points: run.points.map(({ dAlphaDtPerMinute: _removed, ...point }) => point),
    };

    const result = prepareThermalRun(withoutDerivative);

    expect(result.refusals).toEqual([]);
    expect(result.run?.derivativeSource).toBe("temperature");
    expect(
      result.run?.points.every((point) => Number.isFinite(point.dAlphaDtPerMinute)),
    ).toBe(true);
  });

  it("blocks all requested curve methods when one run supplies a malformed derivative series", () => {
    const runs = [5, 10, 20, 40].map((rate) => rawRun(`beta-${rate}`, rate));
    const broken = runs.map((run) => {
      if (run.heatingRate !== 40) return run;
      return {
        ...run,
        points: run.points.map((point, index) => {
          if (index !== 1) return point;
          const { dAlphaDtPerMinute: _removed, ...withoutDerivative } = point;
          return withoutDerivative;
        }),
      } satisfies ThermalRun;
    });

    const analysis = analyzeActivationEnergy(broken, {
      alphaValues: [0.5],
      methods: ["FWO", "FRIEDMAN"],
      includeKissinger: false,
    });

    expect(analysis.status).toBe("refused");
    expect(analysis.methods).toEqual([]);
    expect(analysis.preparedRuns.map((run) => run.id)).toEqual([
      "beta-5",
      "beta-10",
      "beta-20",
    ]);
    expect(analysis.refusals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INVALID_PROVIDED_DERIVATIVE",
          severity: "refusal",
          runIds: ["beta-40"],
        }),
      ]),
    );
    expect(analysis.warnings.map((warning) => warning.code)).not.toContain(
      "NUMERICAL_DERIVATIVE",
    );
  });
});
