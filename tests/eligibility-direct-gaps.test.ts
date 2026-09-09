import { describe, expect, it } from "vitest";

import {
  GAS_CONSTANT_J_PER_MOL_K,
  analyzeActivationEnergy,
  calculateFriedman,
  calculateKAS,
  calculateKissinger,
  prepareThermalRun,
  type Diagnostic,
  type KissingerPeak,
  type PreparedRun,
  type ThermalRun,
} from "../src/core";

function codes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

function rawRuns(rates: readonly number[]): ThermalRun[] {
  return rates.map((heatingRate, index) => {
    const targetTemperature = 560 + index * 30;
    const derivative = 0.01 * 2 ** index;
    return {
      id: `beta-${heatingRate}`,
      heatingRate,
      heatingRateUnit: "K/min",
      temperatureUnit: "K",
      sampleId: "eligibility-sample",
      atmosphere: "N2",
      stage: "main",
      peakTemperature: targetTemperature,
      points: [
        { temperature: targetTemperature - 20, alpha: 0.1, dAlphaDtPerMinute: derivative / 2 },
        { temperature: targetTemperature, alpha: 0.5, dAlphaDtPerMinute: derivative },
        { temperature: targetTemperature + 20, alpha: 0.9, dAlphaDtPerMinute: derivative * 2 },
      ],
    };
  });
}

function kissingerPeaks(rates: readonly number[]): KissingerPeak[] {
  return rates.map((heatingRateKPerMinute, index) => ({
    runId: `peak-${index + 1}`,
    heatingRateKPerMinute,
    peakTemperatureK: 570 + index * 18,
    stage: "main",
  }));
}

function friedmanRawRuns(mode: "provided" | "time" | "temperature"): ThermalRun[] {
  const rates = [5, 10, 20, 40] as const;
  const temperatures = [570, 600, 630, 660] as const;
  const activationEnergyJPerMol = 140_000;
  const intercept = 25;

  return rates.map((heatingRate, index) => {
    const targetTemperature = temperatures[index] as number;
    const derivative = Math.exp(
      intercept - activationEnergyJPerMol / (GAS_CONSTANT_J_PER_MOL_K * targetTemperature),
    );
    const deltaTimeMinutes = 0.1 / derivative;
    const deltaTemperature = heatingRate * deltaTimeMinutes;
    return {
      id: `${mode}-${heatingRate}`,
      heatingRate,
      heatingRateUnit: "K/min",
      temperatureUnit: "K",
      ...(mode === "time" ? { timeUnit: "min" as const } : {}),
      sampleId: "friedman-direct-path",
      atmosphere: "N2",
      stage: "main",
      points: [-1, 0, 1].map((offset) => ({
        temperature: targetTemperature + offset * deltaTemperature,
        alpha: 0.5 + offset * 0.1,
        ...(mode === "time" ? { time: (offset + 1) * deltaTimeMinutes } : {}),
        ...(mode === "provided" ? { dAlphaDtPerMinute: derivative } : {}),
      })),
    };
  });
}

function partialAlphaRuns(): PreparedRun[] {
  return [5, 10, 20, 40].map((heatingRateKPerMinute, index) => {
    const base = 500 + index * 20;
    const ambiguousAtHalf = index < 2;
    return {
      id: `partial-${heatingRateKPerMinute}`,
      heatingRateKPerMinute,
      derivativeSource: "provided",
      sampleId: "partial-alpha",
      atmosphere: "N2",
      stage: "main",
      points: ambiguousAtHalf
        ? [
            { temperatureK: base, alpha: 0.1, dAlphaDtPerMinute: 0.01 },
            { temperatureK: base + 40, alpha: 0.5, dAlphaDtPerMinute: 0.02 },
            { temperatureK: base + 50, alpha: 0.5, dAlphaDtPerMinute: 0.02 },
            { temperatureK: base + 80, alpha: 0.7, dAlphaDtPerMinute: 0.03 },
            { temperatureK: base + 100, alpha: 0.9, dAlphaDtPerMinute: 0.04 },
          ]
        : [
            { temperatureK: base, alpha: 0.1, dAlphaDtPerMinute: 0.01 },
            { temperatureK: base + 45, alpha: 0.5, dAlphaDtPerMinute: 0.02 },
            { temperatureK: base + 80, alpha: 0.7, dAlphaDtPerMinute: 0.03 },
            { temperatureK: base + 100, alpha: 0.9, dAlphaDtPerMinute: 0.04 },
          ],
    } satisfies PreparedRun;
  });
}

describe("direct eligibility and refusal acceptance gaps", () => {
  it("returns all four isoconversional methods and a separate Kissinger result at exactly three rates", () => {
    const analysis = analyzeActivationEnergy(rawRuns([5, 10, 20]), { alphaValues: [0.5] });

    expect(analysis.status).toBe("success");
    expect(analysis.methods.map((method) => method.method)).toEqual([
      "FWO",
      "KAS",
      "STARINK",
      "FRIEDMAN",
    ]);
    for (const method of analysis.methods) {
      expect(method.estimates).toHaveLength(1);
      expect(codes(method.warnings)).toContain("LIMITED_HEATING_RATES");
    }
    expect(analysis.kissinger?.status).toBe("success");
    expect(analysis.kissinger?.activationEnergyKJPerMol).toEqual(expect.any(Number));
    expect(codes(analysis.kissinger?.warnings ?? [])).toContain("LIMITED_HEATING_RATES");
  });

  it("retains a method result and emits NARROW_HEATING_RATE_SPAN for a sub-twofold rate span", () => {
    const analysis = analyzeActivationEnergy(rawRuns([10, 11, 12, 13]), {
      alphaValues: [0.5],
      methods: ["KAS"],
      includeKissinger: false,
    });

    expect(analysis.status).toBe("success");
    expect(analysis.methods[0]?.estimates).toHaveLength(1);
    expect(codes(analysis.warnings)).toContain("NARROW_HEATING_RATE_SPAN");
    expect(codes(analysis.methods[0]?.warnings ?? [])).toContain("NARROW_HEATING_RATE_SPAN");
  });

  it("emits Kissinger underpowered warning for fewer than five rates despite a tenfold span", () => {
    const result = calculateKissinger(kissingerPeaks([1, 2, 5, 10]));

    expect(result.status).toBe("success");
    expect(result.observations).toHaveLength(4);
    expect(codes(result.warnings)).toContain("KISSINGER_COMPLEXITY_UNDERPOWERED");
  });

  it("emits Kissinger underpowered warning for a sub-fivefold span despite five rates", () => {
    const result = calculateKissinger(kissingerPeaks([10, 11, 12, 13, 14]));

    expect(result.status).toBe("success");
    expect(result.observations).toHaveLength(5);
    expect(codes(result.warnings)).toContain("KISSINGER_COMPLEXITY_UNDERPOWERED");
  });

  it.each(["sampleId", "atmosphere"] as const)(
    "hard-refuses inconsistent %s context before every method result",
    (field) => {
      const runs = rawRuns([5, 10, 20]);
      const inconsistent = runs.map((run, index): ThermalRun => {
        if (index !== 2) return run;
        return field === "sampleId"
          ? { ...run, sampleId: "different-sample" }
          : { ...run, atmosphere: "Air" };
      });

      const analysis = analyzeActivationEnergy(inconsistent, { alphaValues: [0.5] });

      expect(analysis.status).toBe("refused");
      expect(analysis.methods).toEqual([]);
      expect(analysis.kissinger).toBeUndefined();
      expect(analysis.refusals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "INCONSISTENT_CONTEXT",
            details: expect.objectContaining({ field }),
          }),
        ]),
      );
    },
  );

  it("hard-refuses only Kissinger when one explicit peak temperature is missing", () => {
    const complete = rawRuns([5, 10, 20]);
    const { peakTemperature: _missingPeak, ...withoutPeak } = complete[1] as ThermalRun & {
      peakTemperature: number;
    };
    const analysis = analyzeActivationEnergy(
      [complete[0] as ThermalRun, withoutPeak, complete[2] as ThermalRun],
      { alphaValues: [0.5] },
    );

    expect(analysis.status).toBe("partial");
    expect(analysis.methods).toHaveLength(4);
    expect(analysis.methods.every((method) => method.estimates.length === 1)).toBe(true);
    expect(analysis.kissinger?.status).toBe("refused");
    expect(codes(analysis.kissinger?.refusals ?? [])).toEqual(["KISSINGER_PEAK_MISSING"]);
    expect(analysis.kissinger?.regression).toBeUndefined();
    expect(analysis.kissinger?.activationEnergyKJPerMol).toBeUndefined();
  });

  it.each(["time", "temperature"] as const)(
    "emits exact NUMERICAL_DERIVATIVE for the %s finite-difference pathway",
    (mode) => {
      const prepared = friedmanRawRuns(mode).map((run) => {
        const result = prepareThermalRun(run);
        expect(result.refusals).toEqual([]);
        expect(result.run?.derivativeSource).toBe(mode);
        return result.run as PreparedRun;
      });

      const result = calculateFriedman(prepared, [0.5]);

      expect(result.status).toBe("success");
      expect(result.estimates).toHaveLength(1);
      expect(codes(result.warnings)).toContain("NUMERICAL_DERIVATIVE");
    },
  );

  it("does not label an externally supplied derivative as numerical", () => {
    const prepared = friedmanRawRuns("provided").map(
      (run) => prepareThermalRun(run).run as PreparedRun,
    );

    const result = calculateFriedman(prepared, [0.5]);

    expect(result.status).toBe("success");
    expect(codes(result.warnings)).not.toContain("NUMERICAL_DERIVATIVE");
  });

  it.each([
    { label: "nonpositive", derivative: 0 },
    { label: "non-finite", derivative: Number.NaN },
  ])(
    "excludes $label Friedman rates from the logarithm and refuses that alpha below three rates",
    ({ derivative }) => {
      const prepared = friedmanRawRuns("provided").map(
        (run) => prepareThermalRun(run).run as PreparedRun,
      );
      const broken = prepared.map((run, runIndex): PreparedRun => ({
        ...run,
        points: run.points.map((point) =>
          runIndex < 2 && point.alpha === 0.5
            ? { ...point, dAlphaDtPerMinute: derivative }
            : point,
        ),
      }));

      const result = calculateFriedman(broken, [0.5]);

      expect(result.status).toBe("refused");
      expect(result.estimates).toEqual([]);
      expect(codes(result.warnings)).toContain("FRIEDMAN_NON_POSITIVE_RATE");
      expect(result.refusals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "FRIEDMAN_DERIVATIVE_UNAVAILABLE", alpha: 0.5 }),
        ]),
      );
    },
  );

  it("refuses only the requested-alpha plateau and preserves another calculable alpha", () => {
    const result = calculateKAS(partialAlphaRuns(), [0.5, 0.7]);

    expect(result.status).toBe("partial");
    expect(result.estimates).toHaveLength(1);
    expect(result.estimates[0]).toMatchObject({ alpha: 0.7 });
    expect(result.refusals).toEqual([
      expect.objectContaining({
        code: "AMBIGUOUS_ALPHA_CROSSING",
        severity: "refusal",
        alpha: 0.5,
        runIds: ["partial-5", "partial-10"],
      }),
    ]);
    expect(result.warnings).toEqual([]);
  });
});
