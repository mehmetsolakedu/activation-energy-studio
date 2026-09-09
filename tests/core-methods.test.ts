import { describe, expect, it } from "vitest";

import {
  FWO_SLOPE_COEFFICIENT,
  GAS_CONSTANT_J_PER_MOL_K,
  STARINK_SLOPE_COEFFICIENT,
  STARINK_TEMPERATURE_EXPONENT,
  analyzeActivationEnergy,
  calculateFriedman,
  calculateFWO,
  calculateKAS,
  calculateKissinger,
  calculateStarink,
  type PreparedRun,
  type ThermalRun,
} from "../src/core";
import {
  VERIFIED_CURVE_PEAK_EVIDENCE,
  VERIFIED_EXTERNAL_PEAK_EVIDENCE,
} from "./helpers/peak-evidence";

const BETAS = [5, 10, 20, 40] as const;

describe("direct-core option validation", () => {
  it.each([
    ["FWO", (value: number) => calculateFWO([], [], { minR2Warning: value })],
    ["KAS", (value: number) => calculateKAS([], [], { minR2Warning: value })],
    ["Starink", (value: number) => calculateStarink([], [], { minR2Warning: value })],
    ["Friedman", (value: number) => calculateFriedman([], [], { minR2Warning: value })],
    ["Kissinger", (value: number) => calculateKissinger([], { minR2Warning: value })],
  ])("%s rejects an invalid R2 warning threshold", (_method, calculate) => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01]) {
      expect(() => calculate(value)).toThrow(/finite number from 0 to 1/i);
    }
  });
});

/** Solve ln(beta/T^p)=intercept-cE/(RT) by bisection. */
function exactTemperature(
  beta: number,
  exponent: number,
  slopeCoefficient: number,
  activationEnergyJPerMol: number,
  intercept: number,
): number {
  const residual = (temperatureK: number) =>
    Math.log(beta / temperatureK ** exponent) -
    intercept +
    (slopeCoefficient * activationEnergyJPerMol) /
      (GAS_CONSTANT_J_PER_MOL_K * temperatureK);
  let lower = 250;
  let upper = 2500;
  if (!(residual(lower) > 0 && residual(upper) < 0)) {
    throw new Error("Synthetic-temperature root is not bracketed.");
  }
  for (let iteration = 0; iteration < 120; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (residual(middle) > 0) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

function integralRuns(
  exponent: number,
  coefficient: number,
  activationEnergyKJPerMol: number,
  intercept: number,
): PreparedRun[] {
  return BETAS.map((beta) => {
    const temperatureK = exactTemperature(
      beta,
      exponent,
      coefficient,
      activationEnergyKJPerMol * 1000,
      intercept,
    );
    return {
      id: `beta-${beta}`,
      heatingRateKPerMinute: beta,
      derivativeSource: "provided",
      sampleId: "synthetic",
      atmosphere: "N2",
      stage: "main",
      points: [
        { temperatureK: temperatureK - 12, alpha: 0.4, dAlphaDtPerMinute: 0.01 },
        { temperatureK, alpha: 0.5, dAlphaDtPerMinute: 0.02 },
        { temperatureK: temperatureK + 12, alpha: 0.6, dAlphaDtPerMinute: 0.03 },
      ],
    };
  });
}

describe("integral isoconversional methods", () => {
  it("recovers exact synthetic FWO activation energy using the 1.052 coefficient", () => {
    const result = calculateFWO(
      integralRuns(0, FWO_SLOPE_COEFFICIENT, 150, 32),
      [0.5],
    );
    expect(result.status).toBe("success");
    expect(result.resultType).toBe("isoconversional");
    expect(result.formulaId).toBe("fwo_doyle_ln_1.052_v1");
    expect(result.estimates[0]?.activationEnergyKJPerMol).toBeCloseTo(150, 8);
    expect(result.estimates[0]?.regression.r2).toBeCloseTo(1, 12);
  });

  it("recovers exact synthetic KAS activation energy", () => {
    const result = calculateKAS(integralRuns(2, 1, 175, 22), [0.5]);
    expect(result.status).toBe("success");
    expect(result.estimates[0]?.activationEnergyKJPerMol).toBeCloseTo(175, 8);
    expect(result.estimates[0]?.regression.r2).toBeCloseTo(1, 12);
  });

  it("recovers exact synthetic Starink activation energy using T^1.92 and 1.0008", () => {
    const result = calculateStarink(
      integralRuns(
        STARINK_TEMPERATURE_EXPONENT,
        STARINK_SLOPE_COEFFICIENT,
        125,
        17,
      ),
      [0.5],
    );
    expect(result.status).toBe("success");
    expect(result.estimates[0]?.activationEnergyKJPerMol).toBeCloseTo(125, 8);
    expect(result.estimates[0]?.regression.r2).toBeCloseTo(1, 12);
  });

  it("retains a computable low-R2 result as a warning, not a hard refusal", () => {
    const temperatures = [600, 700, 620, 760];
    const runs = BETAS.map((beta, index): PreparedRun => ({
      id: `noisy-${beta}`,
      heatingRateKPerMinute: beta,
      derivativeSource: "provided",
      sampleId: "synthetic",
      atmosphere: "N2",
      stage: "main",
      points: [
        { temperatureK: (temperatures[index] as number) - 5, alpha: 0.4 },
        { temperatureK: temperatures[index] as number, alpha: 0.5 },
        { temperatureK: (temperatures[index] as number) + 5, alpha: 0.6 },
      ],
    }));
    const result = calculateFWO(runs, [0.5]);
    expect(result.estimates).toHaveLength(1);
    expect(result.refusals).toEqual([]);
    expect(result.warnings.map((item) => item.code)).toContain("LOW_R2");
  });
});

describe("differential and peak methods", () => {
  it("recovers exact synthetic Friedman activation energy", () => {
    const activationEnergyKJPerMol = 140;
    const intercept = 25;
    const temperatures = [570, 600, 630, 660];
    const runs = BETAS.map((beta, index): PreparedRun => {
      const temperatureK = temperatures[index] as number;
      const rate = Math.exp(
        intercept -
          (activationEnergyKJPerMol * 1000) /
            (GAS_CONSTANT_J_PER_MOL_K * temperatureK),
      );
      return {
        id: `friedman-${beta}`,
        heatingRateKPerMinute: beta,
        derivativeSource: "provided",
        sampleId: "synthetic",
        atmosphere: "N2",
        stage: "main",
        points: [
          { temperatureK: temperatureK - 10, alpha: 0.4, dAlphaDtPerMinute: rate * 0.8 },
          { temperatureK, alpha: 0.5, dAlphaDtPerMinute: rate },
          { temperatureK: temperatureK + 10, alpha: 0.6, dAlphaDtPerMinute: rate * 1.2 },
        ],
      };
    });
    const result = calculateFriedman(runs, [0.5]);
    expect(result.status).toBe("success");
    expect(result.estimates[0]?.activationEnergyKJPerMol).toBeCloseTo(140, 8);
    expect(result.estimates[0]?.regression.r2).toBeCloseTo(1, 12);
  });

  it("refuses a non-positive Friedman derivative even when three distinct rates remain", () => {
    const runs = integralRuns(0, FWO_SLOPE_COEFFICIENT, 150, 32);
    const broken = runs.map((run, index) =>
      ({
        ...run,
        points: run.points.map((point) =>
          point.alpha === 0.5
            ? {
                ...point,
                dAlphaDtPerMinute:
                  index === 0
                    ? 0
                    : Math.exp(
                        25 -
                          140_000 /
                            (GAS_CONSTANT_J_PER_MOL_K * point.temperatureK),
                      ),
              }
            : point,
        ),
      }),
    );
    const result = calculateFriedman(broken, [0.5]);
    expect(result.status).toBe("refused");
    expect(result.estimates).toHaveLength(0);
    expect(result.refusals).toContainEqual(
      expect.objectContaining({
        code: "FRIEDMAN_DERIVATIVE_UNAVAILABLE",
        runIds: [broken[0]?.id],
      }),
    );
  });

  it("hard-refuses a Friedman alpha when exclusions leave fewer than three rates", () => {
    const runs = integralRuns(0, FWO_SLOPE_COEFFICIENT, 150, 32)
      .slice(0, 3)
      .map((run, index) => ({
        ...run,
        points: run.points.map((point) =>
          point.alpha === 0.5 && index === 0
            ? { ...point, dAlphaDtPerMinute: 0 }
            : point,
        ),
      }));
    const result = calculateFriedman(runs, [0.5]);
    expect(result.status).toBe("refused");
    expect(result.refusals.map((item) => item.code)).toContain(
      "FRIEDMAN_DERIVATIVE_UNAVAILABLE",
    );
  });

  it("recovers exact synthetic Kissinger activation energy", () => {
    const peaks = BETAS.map((beta) => ({
      runId: `peak-${beta}`,
      heatingRateKPerMinute: beta,
      peakTemperatureK: exactTemperature(beta, 2, 1, 160_000, 20),
      ...VERIFIED_EXTERNAL_PEAK_EVIDENCE,
      stage: "synthetic peak stage",
    }));
    const result = calculateKissinger(peaks);
    expect(result.status).toBe("success");
    expect(result.resultType).toBe("peak");
    expect(result.alpha).toBeNull();
    expect(result.activationEnergyKJPerMol).toBeCloseTo(160, 8);
    expect(result.regression?.r2).toBeCloseTo(1, 12);
    expect(result.warnings.map((item) => item.code)).toContain(
      "KISSINGER_COMPLEXITY_UNDERPOWERED",
    );
  });
});

describe("end-to-end core orchestration", () => {
  it("returns JSON-serializable method and separate Kissinger results", () => {
    const runs: ThermalRun[] = integralRuns(0, FWO_SLOPE_COEFFICIENT, 150, 32).map(
      (run) => ({
        id: run.id,
        heatingRate: run.heatingRateKPerMinute,
        heatingRateUnit: "K/min",
        temperatureUnit: "K",
        sampleId: run.sampleId,
        atmosphere: run.atmosphere,
        stage: run.stage,
        peakTemperature: run.points[1]?.temperatureK,
        ...VERIFIED_CURVE_PEAK_EVIDENCE,
        points: run.points.map((point) => ({
          temperature: point.temperatureK,
          alpha: point.alpha,
          dAlphaDtPerMinute: Math.exp(
            25 - 140_000 / (GAS_CONSTANT_J_PER_MOL_K * point.temperatureK),
          ),
        })),
      }),
    );
    const analysis = analyzeActivationEnergy(runs, { alphaValues: [0.5] });

    expect(analysis.status).toBe("success");
    expect(analysis.methods.map((result) => result.method)).toEqual([
      "FWO",
      "KAS",
      "STARINK",
      "FRIEDMAN",
    ]);
    expect(analysis.kissinger?.status).toBe("success");
    expect(() => JSON.stringify(analysis)).not.toThrow();
  });
});
