import { describe, expect, it } from "vitest";

import {
  analyzeActivationEnergy,
  convertHeatingRateToKPerMinute,
  convertTemperatureToKelvin,
  estimateAlphaDerivative,
  evaluateAnalysisEligibility,
  interpolateTemperatureAtAlpha,
  normalizeMassToAlpha,
  prepareThermalRun,
  type PreparedRun,
  type ThermalRun,
} from "../src/core";

function preparedRun(id: string, rate: number, stage = "main"): PreparedRun {
  return {
    id,
    heatingRateKPerMinute: rate,
    derivativeSource: "provided",
    sampleId: "sample-a",
    atmosphere: "N2",
    stage,
    points: [
      { temperatureK: 500 + rate, alpha: 0.1, dAlphaDtPerMinute: 0.01 },
      { temperatureK: 600 + rate, alpha: 0.5, dAlphaDtPerMinute: 0.02 },
      { temperatureK: 700 + rate, alpha: 0.9, dAlphaDtPerMinute: 0.01 },
    ],
  };
}

describe("preprocessing and units", () => {
  it("performs explicit unit conversion and mass normalization", () => {
    expect(convertTemperatureToKelvin(25, "C")).toBeCloseTo(298.15, 12);
    expect(convertHeatingRateToKPerMinute(1, "K/s")).toBe(60);
    expect(
      normalizeMassToAlpha([100, 75, 50], { initialMass: 100, finalMass: 50 }),
    ).toEqual([0, 0.5, 1]);
    expect(() =>
      normalizeMassToAlpha([100, 100, 100], { initialMass: 100, finalMass: 100 }),
    ).toThrow(/conversion span/i);
  });

  it("prepares Celsius mass data only with an explicit stage mass reference", () => {
    const run: ThermalRun = {
      id: "r1",
      temperatureUnit: "C",
      heatingRate: 10,
      heatingRateUnit: "C/min",
      massReference: { initialMass: 100, finalMass: 50 },
      points: [
        { temperature: 100, mass: 100 },
        { temperature: 200, mass: 75 },
        { temperature: 300, mass: 50 },
      ],
    };
    const result = prepareThermalRun(run);
    expect(result.refusals).toEqual([]);
    expect(result.run?.heatingRateKPerMinute).toBe(10);
    expect(result.run?.points.map((point) => point.alpha)).toEqual([0, 0.5, 1]);
    expect(result.run?.points[0]?.temperatureK).toBeCloseTo(373.15, 12);
    expect(result.run?.derivativeSource).toBe("temperature");
  });

  it("refuses implicit full-curve endpoint normalization and ambiguous units", () => {
    const withoutReference: ThermalRun = {
      id: "mass-no-reference",
      temperatureUnit: "K",
      heatingRate: 10,
      heatingRateUnit: "K/min",
      points: [
        { temperature: 400, mass: 100 },
        { temperature: 500, mass: 80 },
        { temperature: 600, mass: 60 },
      ],
    };
    expect(prepareThermalRun(withoutReference).refusals.map((item) => item.code)).toContain(
      "MASS_REFERENCE_REQUIRED",
    );

    const unknownUnit = { ...withoutReference, temperatureUnit: "unknown" as const };
    expect(prepareThermalRun(unknownUnit).refusals.map((item) => item.code)).toContain(
      "UNKNOWN_TEMPERATURE_UNIT",
    );
    expect(analyzeActivationEnergy([withoutReference]).status).toBe("refused");
  });

  it("interpolates T_alpha and estimates an unsmoothed derivative", () => {
    const points = [
      { temperatureK: 300, alpha: 0 },
      { temperatureK: 400, alpha: 0.5 },
      { temperatureK: 500, alpha: 1 },
    ];
    expect(interpolateTemperatureAtAlpha(points, 0.25)).toBeCloseTo(350, 12);
    expect(
      interpolateTemperatureAtAlpha(
        [
          { temperatureK: 300, alpha: 0.4 },
          { temperatureK: 350, alpha: 0.5 },
          { temperatureK: 360, alpha: 0.5 },
          { temperatureK: 400, alpha: 0.6 },
        ],
        0.5,
      ),
    ).toBeUndefined();
    expect(estimateAlphaDerivative(points, 10)).toEqual([
      expect.closeTo(0.05, 12),
      expect.closeTo(0.05, 12),
      expect.closeTo(0.05, 12),
    ]);

    const timed = points.map((point, index) => ({ ...point, timeMinutes: index }));
    expect(estimateAlphaDerivative(timed, 99)).toEqual([
      expect.closeTo(0.5, 12),
      expect.closeTo(0.5, 12),
      expect.closeTo(0.5, 12),
    ]);
  });

  it("hard-refuses a measured time-temperature ramp that is nonlinear by more than 2%", () => {
    const result = prepareThermalRun({
      id: "nonlinear-ramp",
      temperatureUnit: "K",
      heatingRate: 10,
      heatingRateUnit: "K/min",
      timeUnit: "min",
      points: [
        { temperature: 400, time: 0, alpha: 0.1 },
        { temperature: 500, time: 10, alpha: 0.5 },
        { temperature: 610, time: 20, alpha: 0.9 },
      ],
    });
    expect(result.refusals.map((item) => item.code)).toContain(
      "NONLINEAR_HEATING_UNSUPPORTED",
    );
  });
});

describe("eligibility diagnostics", () => {
  it("distinguishes a limited-data warning from a hard refusal", () => {
    const eligible = evaluateAnalysisEligibility(
      [preparedRun("r5", 5), preparedRun("r10", 10), preparedRun("r20", 20)],
      [0.5],
    );
    expect(eligible.eligible).toBe(true);
    expect(eligible.refusals).toEqual([]);
    expect(eligible.warnings.map((item) => item.code)).toContain("LIMITED_HEATING_RATES");

    const tooFew = evaluateAnalysisEligibility(
      [preparedRun("r5", 5), preparedRun("r10", 10)],
      [0.5],
    );
    expect(tooFew.eligible).toBe(false);
    expect(tooFew.refusals.map((item) => item.code)).toContain(
      "INSUFFICIENT_DISTINCT_HEATING_RATES",
    );
  });

  it("hard-refuses mixed reaction stages", () => {
    const result = evaluateAnalysisEligibility(
      [
        preparedRun("r5", 5, "main"),
        preparedRun("r10", 10, "main"),
        preparedRun("r20", 20, "shoulder"),
      ],
      [0.5],
    );
    expect(result.eligible).toBe(false);
    expect(result.refusals.map((item) => item.code)).toContain("INCONSISTENT_CONTEXT");
  });
});
