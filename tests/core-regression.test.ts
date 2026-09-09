import { describe, expect, it } from "vitest";

import { ordinaryLeastSquares, studentTCritical95 } from "../src/core";
import largeDfOracle from "./fixtures/hand/student_t_critical_95_large_df_oracle.json";

describe("ordinaryLeastSquares", () => {
  it("matches a hand-calculated regression and exposes uncertainty", () => {
    const result = ordinaryLeastSquares([1, 2, 3, 4], [2, 4, 5, 8]);

    expect(result.slope).toBeCloseTo(1.9, 12);
    expect(result.intercept).toBeCloseTo(0, 12);
    expect(result.residuals).toEqual(
      expect.arrayContaining([
        expect.closeTo(0.1, 12),
        expect.closeTo(0.2, 12),
        expect.closeTo(-0.7, 12),
        expect.closeTo(0.4, 12),
      ]),
    );
    expect(result.sse).toBeCloseTo(0.7, 12);
    expect(result.r2).toBeCloseTo(0.9626666666666667, 12);
    expect(result.residualStandardError).toBeCloseTo(Math.sqrt(0.35), 12);
    expect(result.slopeStandardError).toBeCloseTo(Math.sqrt(0.07), 12);
    expect(result.slopeConfidence95[0]).toBeCloseTo(0.7616250898546866, 12);
    expect(result.slopeConfidence95[1]).toBeCloseTo(3.038374910145313, 12);
    expect(result).toMatchObject({
      n: 4,
      rawObservationCount: 4,
      residualDegreesOfFreedom: 2,
      inputAggregation: "none",
      inputGroups: [],
    });
  });

  it("uses Student-t uncertainty and rejects underdetermined inputs", () => {
    expect(studentTCritical95(1)).toBeCloseTo(12.706204736, 10);
    expect(studentTCritical95(30)).toBeCloseTo(2.042272456, 10);
    expect(() => ordinaryLeastSquares([1, 2], [2, 3])).toThrow(/at least three/i);
    expect(() => ordinaryLeastSquares([1, 1, 1], [1, 2, 3])).toThrow(/variation in x/i);
    expect(() => ordinaryLeastSquares([1, 2, 3], [4, 4, 4])).toThrow(/variation in y/i);
  });

  it("bounds the large-df expansion against independent 0.975 quantiles", () => {
    const errors = largeDfOracle.referenceValues.map(({ degreesOfFreedom, criticalValue }) =>
      Math.abs(studentTCritical95(degreesOfFreedom) - criticalValue));

    expect(Math.max(...errors)).toBeLessThanOrEqual(
      largeDfOracle.acceptanceBoundary.maximumAbsoluteDifference,
    );
  });
});
