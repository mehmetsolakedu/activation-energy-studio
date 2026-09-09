import type {
  RegressionInputAggregation,
  RegressionInputGroup,
  RegressionResult,
} from "./types";

export interface OrdinaryLeastSquaresMetadata {
  readonly rawObservationCount?: number;
  readonly inputAggregation?: RegressionInputAggregation;
  readonly inputGroups?: readonly RegressionInputGroup[];
}

const T_CRITICAL_95: readonly number[] = Object.freeze([
  Number.NaN,
  12.706204736,
  4.30265273,
  3.182446305,
  2.776445105,
  2.570581836,
  2.446911851,
  2.364624252,
  2.306004135,
  2.262157163,
  2.228138852,
  2.20098516,
  2.17881283,
  2.160368656,
  2.144786688,
  2.131449546,
  2.119905299,
  2.109815578,
  2.10092204,
  2.093024054,
  2.085963447,
  2.079613845,
  2.073873068,
  2.06865761,
  2.063898562,
  2.059538553,
  2.055529439,
  2.051830516,
  2.048407142,
  2.045229642,
  2.042272456,
]);

function assertFiniteArray(values: readonly number[], label: string): void {
  if (!values.every(Number.isFinite)) {
    throw new RangeError(`${label} must contain only finite numbers.`);
  }
}

/** Two-sided 95% Student-t critical value. */
export function studentTCritical95(degreesOfFreedom: number): number {
  if (!Number.isInteger(degreesOfFreedom) || degreesOfFreedom < 1) {
    throw new RangeError("Degrees of freedom must be a positive integer.");
  }
  if (degreesOfFreedom < T_CRITICAL_95.length) {
    return T_CRITICAL_95[degreesOfFreedom] as number;
  }

  // Cornish-Fisher expansion around z(0.975), sufficiently accurate above df=30.
  const z = 1.959963984540054;
  const v = degreesOfFreedom;
  const z2 = z * z;
  const z3 = z2 * z;
  const z5 = z3 * z2;
  const z7 = z5 * z2;
  return (
    z +
    (z3 + z) / (4 * v) +
    (5 * z5 + 16 * z3 + 3 * z) / (96 * v * v) +
    (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * v * v * v)
  );
}

/**
 * Ordinary least-squares fit with an intercept.
 * At least three points are required because slope uncertainty needs residual df.
 */
export function ordinaryLeastSquares(
  x: readonly number[],
  y: readonly number[],
  metadata: OrdinaryLeastSquaresMetadata = {},
): RegressionResult {
  if (x.length !== y.length) {
    throw new RangeError("x and y must have equal lengths.");
  }
  if (x.length < 3) {
    throw new RangeError("OLS regression requires at least three observations.");
  }
  assertFiniteArray(x, "x");
  assertFiniteArray(y, "y");

  const n = x.length;
  const residualDegreesOfFreedom = n - 2;
  const rawObservationCount = metadata.rawObservationCount ?? n;
  const inputAggregation = metadata.inputAggregation ?? "none";
  const inputGroups = metadata.inputGroups ?? [];
  if (!Number.isInteger(rawObservationCount) || rawObservationCount < n) {
    throw new RangeError("Raw observation count must be an integer no smaller than OLS n.");
  }
  if (inputGroups.length > 0 && inputGroups.length !== n) {
    throw new RangeError("Regression input-group count must equal OLS n.");
  }
  if (
    inputGroups.length > 0
    && inputGroups.reduce((sum, group) => sum + group.replicateCount, 0)
      !== rawObservationCount
  ) {
    throw new RangeError("Regression input-group replicate counts must equal raw observation count.");
  }
  if (inputAggregation === "none" && rawObservationCount !== n) {
    throw new RangeError("Unaggregated OLS input cannot have more raw observations than n.");
  }
  const meanX = x.reduce((sum, value) => sum + value, 0) / n;
  const meanY = y.reduce((sum, value) => sum + value, 0) / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let index = 0; index < n; index += 1) {
    const dx = (x[index] as number) - meanX;
    const dy = (y[index] as number) - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (!(sxx > 0)) {
    throw new RangeError("OLS regression requires variation in x.");
  }
  if (!(syy > 0)) {
    throw new RangeError("OLS regression requires variation in y.");
  }

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const fitted = x.map((value) => intercept + slope * value);
  const residuals = y.map((value, index) => value - (fitted[index] as number));
  const sse = residuals.reduce((sum, value) => sum + value * value, 0);
  const r2 = 1 - sse / syy;
  const residualStandardError = Math.sqrt(sse / residualDegreesOfFreedom);
  const slopeStandardError = residualStandardError / Math.sqrt(sxx);
  const margin = studentTCritical95(residualDegreesOfFreedom) * slopeStandardError;

  return {
    n,
    rawObservationCount,
    residualDegreesOfFreedom,
    inputAggregation,
    inputGroups: inputGroups.map((group) => ({
      ...group,
      sourceRunIds: [...group.sourceRunIds],
    })),
    x: [...x],
    y: [...y],
    slope,
    intercept,
    fitted,
    residuals,
    sse,
    r2,
    residualStandardError,
    slopeStandardError,
    slopeConfidence95: [slope - margin, slope + margin],
  };
}
