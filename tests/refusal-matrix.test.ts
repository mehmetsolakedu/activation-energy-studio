import { describe, expect, it } from "vitest";

import {
  analyzeActivationEnergy,
  calculateFWO,
  calculateKissinger,
  evaluateAnalysisEligibility,
  type Diagnostic,
  type KissingerPeak,
  type PreparedRun,
  type ThermalPoint,
  type ThermalRun,
} from "../src/core";
import { VERIFIED_EXTERNAL_PEAK_EVIDENCE } from "./helpers/peak-evidence";

const DEFAULT_POINTS: readonly ThermalPoint[] = [
  { temperature: 500, alpha: 0.1, dAlphaDtPerMinute: 0.01 },
  { temperature: 600, alpha: 0.5, dAlphaDtPerMinute: 0.02 },
  { temperature: 700, alpha: 0.9, dAlphaDtPerMinute: 0.03 },
];

function rawRun(
  id: string,
  heatingRate: number,
  points: readonly ThermalPoint[] = DEFAULT_POINTS,
  extra: Partial<Omit<ThermalRun, "id" | "heatingRate" | "points">> = {},
): ThermalRun {
  return {
    id,
    heatingRate,
    heatingRateUnit: "K/min",
    temperatureUnit: "K",
    points,
    sampleId: "matrix-sample",
    atmosphere: "N2",
    stage: "main",
    ...extra,
  };
}

function preparedRun(id: string, heatingRateKPerMinute: number): PreparedRun {
  return {
    id,
    heatingRateKPerMinute,
    derivativeSource: "provided",
    sampleId: "matrix-sample",
    atmosphere: "N2",
    stage: "main",
    points: [
      { temperatureK: 500, alpha: 0.1, dAlphaDtPerMinute: 0.01 },
      { temperatureK: 600, alpha: 0.5, dAlphaDtPerMinute: 0.02 },
      { temperatureK: 700, alpha: 0.9, dAlphaDtPerMinute: 0.03 },
    ],
  };
}

function diagnosticCodes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((item) => item.code);
}

describe("AC-EL / AC-RF refusal and warning matrix", () => {
  it.each([
    { rates: [5, 10], eligible: false, code: "INSUFFICIENT_DISTINCT_HEATING_RATES" },
    { rates: [5, 10, 20], eligible: true, code: "LIMITED_HEATING_RATES" },
    { rates: [5, 10, 20, 40], eligible: true, code: undefined },
  ])(
    "counts $rates.length distinct positive rates without treating the four-rate case as limited",
    ({ rates, eligible, code }) => {
      const result = evaluateAnalysisEligibility(
        rates.map((rate) => preparedRun(`beta-${rate}`, rate)),
        [0.5],
      );

      expect(result.eligible).toBe(eligible);
      expect(result.distinctHeatingRates).toBe(rates.length);
      const allCodes = diagnosticCodes([...result.refusals, ...result.warnings]);
      if (code === undefined) {
        expect(allCodes).not.toContain("LIMITED_HEATING_RATES");
      } else {
        expect(allCodes).toContain(code);
      }
    },
  );

  it("does not count duplicate-rate replicates as independent rates, even when that causes refusal", () => {
    const analysis = analyzeActivationEnergy(
      [rawRun("replicate-a", 5), rawRun("replicate-b", 5), rawRun("beta-10", 10)],
      { alphaValues: [0.5], methods: ["FWO"] },
    );

    expect(analysis.status).toBe("refused");
    expect(analysis.eligibility.distinctHeatingRates).toBe(2);
    expect(diagnosticCodes(analysis.refusals)).toContain(
      "INSUFFICIENT_DISTINCT_HEATING_RATES",
    );
    expect(diagnosticCodes(analysis.warnings)).toContain("DUPLICATE_HEATING_RATE");
    expect(analysis.methods).toEqual([]);
  });

  it("refuses non-overlapping conversion ranges before any isoconversional result", () => {
    const ranges: readonly (readonly number[])[] = [
      [0.05, 0.15, 0.25],
      [0.35, 0.45, 0.55],
      [0.65, 0.75, 0.85],
    ];
    const analysis = analyzeActivationEnergy(
      [5, 10, 20].map((rate, runIndex) =>
        rawRun(
          `beta-${rate}`,
          rate,
          (ranges[runIndex] as readonly number[]).map((alpha, pointIndex) => ({
            temperature: 500 + 100 * pointIndex,
            alpha,
            dAlphaDtPerMinute: 0.01 + 0.01 * pointIndex,
          })),
        ),
      ),
      { alphaValues: [0.5], methods: ["FWO", "KAS", "STARINK"] },
    );

    expect(analysis.status).toBe("refused");
    expect(diagnosticCodes(analysis.refusals)).toContain("NO_COMMON_ALPHA_RANGE");
    expect(analysis.methods).toEqual([]);
  });

  it("refuses a non-increasing temperature sequence in acquisition order without sorting input", () => {
    const invalid = rawRun("temperature-reversal", 40, [
      { temperature: 500, alpha: 0.1 },
      { temperature: 490, alpha: 0.5 },
      { temperature: 700, alpha: 0.9 },
    ]);
    const input = [rawRun("beta-5", 5), rawRun("beta-10", 10), rawRun("beta-20", 20), invalid];
    const before = JSON.parse(JSON.stringify(input)) as ThermalRun[];

    const analysis = analyzeActivationEnergy(input, {
      alphaValues: [0.5],
      methods: ["FWO"],
    });

    expect(diagnosticCodes(analysis.refusals)).toContain("TEMPERATURE_NOT_INCREASING");
    expect(analysis.methods).toEqual([]);
    expect(analysis.preparedRuns.map((run) => run.id)).not.toContain(invalid.id);
    expect(input).toEqual(before);
  });

  it("refuses decreasing alpha in acquisition order without clipping or reordering input", () => {
    const invalid = rawRun("alpha-reversal", 40, [
      { temperature: 500, alpha: 0.1 },
      { temperature: 600, alpha: 0.6 },
      { temperature: 700, alpha: 0.4 },
    ]);
    const input = [rawRun("beta-5", 5), rawRun("beta-10", 10), rawRun("beta-20", 20), invalid];
    const before = JSON.parse(JSON.stringify(input)) as ThermalRun[];

    const analysis = analyzeActivationEnergy(input, {
      alphaValues: [0.5],
      methods: ["FWO"],
    });

    expect(diagnosticCodes(analysis.refusals)).toContain("NON_MONOTONIC_ALPHA");
    expect(analysis.methods).toEqual([]);
    expect(analysis.preparedRuns.map((run) => run.id)).not.toContain(invalid.id);
    expect(input).toEqual(before);
  });

  it.each([0, -5])(
    "refuses a nonpositive beta=%s as an unsupported heating direction",
    (heatingRate) => {
      const analysis = analyzeActivationEnergy(
        [
          rawRun("beta-5", 5),
          rawRun("beta-10", 10),
          rawRun("beta-20", 20),
          rawRun("nonpositive-beta", heatingRate),
        ],
        { alphaValues: [0.5], methods: ["FWO", "FRIEDMAN"] },
      );

      expect(analysis.status).toBe("refused");
      expect(diagnosticCodes(analysis.refusals)).toContain("COOLING_UNSUPPORTED");
      expect(analysis.methods).toEqual([]);
    },
  );

  it("refuses a measured nonlinear temperature program before method calculation", () => {
    const nonlinear = rawRun(
      "nonlinear-program",
      40,
      [
        { temperature: 500, time: 0, alpha: 0.1 },
        { temperature: 540, time: 1, alpha: 0.5 },
        { temperature: 600, time: 2, alpha: 0.9 },
      ],
      { timeUnit: "min" },
    );
    const analysis = analyzeActivationEnergy(
      [rawRun("beta-5", 5), rawRun("beta-10", 10), rawRun("beta-20", 20), nonlinear],
      { alphaValues: [0.5], methods: ["FWO", "FRIEDMAN"] },
    );

    expect(analysis.status).toBe("refused");
    expect(diagnosticCodes(analysis.refusals)).toContain("NONLINEAR_HEATING_UNSUPPORTED");
    expect(analysis.methods).toEqual([]);
  });

  it("refuses a finite positive-slope fit without exposing a nonpositive apparent Ea", () => {
    const temperatures = [700, 650, 600, 550];
    const runs = [5, 10, 20, 40].map((rate, index): PreparedRun => {
      const temperatureK = temperatures[index] as number;
      return {
        ...preparedRun(`beta-${rate}`, rate),
        points: [
          { temperatureK: temperatureK - 10, alpha: 0.4, dAlphaDtPerMinute: 0.01 },
          { temperatureK, alpha: 0.5, dAlphaDtPerMinute: 0.02 },
          { temperatureK: temperatureK + 10, alpha: 0.6, dAlphaDtPerMinute: 0.03 },
        ],
      };
    });

    const result = calculateFWO(runs, [0.5]);

    expect(result.status).toBe("refused");
    expect(result.estimates).toHaveLength(0);
    expect(diagnosticCodes(result.warnings)).not.toContain("NONPOSITIVE_APPARENT_EA");
    expect(result.refusals).toContainEqual(expect.objectContaining({
      code: "NONPOSITIVE_APPARENT_EA",
      details: expect.objectContaining({ fittedSlope: expect.any(Number) }),
    }));
  });

  it("hard-refuses an explicitly ambiguous or overlapping Kissinger peak identity", () => {
    const peaks: KissingerPeak[] = [
      { runId: "peak-5", heatingRateKPerMinute: 5, peakTemperatureK: 580, ...VERIFIED_EXTERNAL_PEAK_EVIDENCE, stage: "main" },
      {
        runId: "peak-10",
        heatingRateKPerMinute: 10,
        peakTemperatureK: 600,
        ...VERIFIED_EXTERNAL_PEAK_EVIDENCE,
        stage: "main",
        ambiguous: true,
      },
      { runId: "peak-20", heatingRateKPerMinute: 20, peakTemperatureK: 620, ...VERIFIED_EXTERNAL_PEAK_EVIDENCE, stage: "main" },
    ];

    const result = calculateKissinger(peaks);

    expect(result.status).toBe("refused");
    expect(diagnosticCodes(result.refusals)).toEqual(["OVERLAPPING_PEAKS"]);
    expect(result.observations).toEqual([]);
    expect(result.regression).toBeUndefined();
    expect(result.activationEnergyKJPerMol).toBeUndefined();
  });

  it("does not count duplicate Kissinger peaks as independent heating rates", () => {
    const result = calculateKissinger([
      { runId: "peak-5-a", heatingRateKPerMinute: 5, peakTemperatureK: 580, ...VERIFIED_EXTERNAL_PEAK_EVIDENCE, stage: "main" },
      { runId: "peak-5-b", heatingRateKPerMinute: 5, peakTemperatureK: 581, ...VERIFIED_EXTERNAL_PEAK_EVIDENCE, stage: "main" },
      { runId: "peak-10", heatingRateKPerMinute: 10, peakTemperatureK: 600, ...VERIFIED_EXTERNAL_PEAK_EVIDENCE, stage: "main" },
    ]);

    expect(result.status).toBe("refused");
    expect(diagnosticCodes(result.refusals)).toContain("TOO_FEW_KISSINGER_PEAKS");
    expect(diagnosticCodes(result.warnings)).toContain("DUPLICATE_HEATING_RATE");
    expect(result.regression).toBeUndefined();
  });

  it("hard-refuses Kissinger peaks assigned to different physical stages", () => {
    const result = calculateKissinger([
      { runId: "peak-5", heatingRateKPerMinute: 5, peakTemperatureK: 580, ...VERIFIED_EXTERNAL_PEAK_EVIDENCE, stage: "main" },
      { runId: "peak-10", heatingRateKPerMinute: 10, peakTemperatureK: 600, ...VERIFIED_EXTERNAL_PEAK_EVIDENCE, stage: "main" },
      {
        runId: "peak-20",
        heatingRateKPerMinute: 20,
        peakTemperatureK: 620,
        ...VERIFIED_EXTERNAL_PEAK_EVIDENCE,
        stage: "shoulder",
      },
    ]);

    expect(result.status).toBe("refused");
    expect(diagnosticCodes(result.refusals)).toEqual(["AMBIGUOUS_STAGE"]);
    expect(result.regression).toBeUndefined();
    expect(result.activationEnergyKJPerMol).toBeUndefined();
  });
});
