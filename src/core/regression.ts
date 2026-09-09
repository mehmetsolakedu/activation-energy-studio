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

/**
 * Smallest scale-free RMS predictor spread accepted by the numerical core.
 *
 * This is a floating-point conditioning guard, not an experimental-resolution
 * claim. Instrument uncertainty must be assessed separately when it is known.
 */
export const MINIMUM_RELATIVE_X_RMS_SPREAD = Math.sqrt(Number.EPSILON);

export class InsufficientRegressionSpreadError extends RangeError {
  readonly relativeRmsSpread: number;
  readonly minimumRelativeRmsSpread: number;

  constructor(relativeRmsSpread: number) {
    super(
      "OLS predictor spread is too small relative to its scale for a reliable slope.",
    );
    this.name = "InsufficientRegressionSpreadError";
    this.relativeRmsSpread = relativeRmsSpread;
    this.minimumRelativeRmsSpread = MINIMUM_RELATIVE_X_RMS_SPREAD;
  }
}

function assertFiniteArray(values: readonly number[], label: string): void {
  if (!values.every(Number.isFinite)) {
    throw new RangeError(`${label} must contain only finite numbers.`);
  }
}

function compensatedSum(values: readonly number[]): number {
  let sum = 0;
  let correction = 0;
  for (const value of values) {
    const adjusted = value - correction;
    const next = sum + adjusted;
    correction = (next - sum) - adjusted;
    sum = next;
  }
  return sum;
}

// Lanczos log-gamma and a continued fraction for the regularized incomplete
// beta. They are used only to obtain the fixed two-sided 95% Student-t
// quantile; the tabulated df=1..30 values remain the primary small-df branch.
function logGamma(value: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ] as const;
  if (value < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  }
  const shifted = value - 1;
  let series = 0.9999999999998099;
  for (let index = 0; index < coefficients.length; index += 1) {
    series += (coefficients[index] as number) / (shifted + index + 1);
  }
  const t = shifted + coefficients.length - 0.5;
  return (
    0.5 * Math.log(2 * Math.PI)
    + (shifted + 0.5) * Math.log(t)
    - t
    + Math.log(series)
  );
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maximumIterations = 300;
  const convergenceTolerance = 3e-14;
  const minimumMagnitude = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < minimumMagnitude) d = minimumMagnitude;
  d = 1 / d;
  let result = d;

  for (let iteration = 1; iteration <= maximumIterations; iteration += 1) {
    const evenNumerator =
      (iteration * (b - iteration) * x)
      / ((qam + 2 * iteration) * (a + 2 * iteration));
    d = 1 + evenNumerator * d;
    if (Math.abs(d) < minimumMagnitude) d = minimumMagnitude;
    c = 1 + evenNumerator / c;
    if (Math.abs(c) < minimumMagnitude) c = minimumMagnitude;
    d = 1 / d;
    result *= d * c;

    const oddNumerator =
      -((a + iteration) * (qab + iteration) * x)
      / ((a + 2 * iteration) * (qap + 2 * iteration));
    d = 1 + oddNumerator * d;
    if (Math.abs(d) < minimumMagnitude) d = minimumMagnitude;
    c = 1 + oddNumerator / c;
    if (Math.abs(c) < minimumMagnitude) c = minimumMagnitude;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) <= convergenceTolerance) return result;
  }
  throw new RangeError("Student-t quantile calculation did not converge.");
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (!(x >= 0 && x <= 1) || !(a > 0) || !(b > 0)) {
    throw new RangeError("Invalid incomplete-beta arguments.");
  }
  if (x === 0) return 0;
  if (x === 1) return 1;
  const front = Math.exp(
    logGamma(a + b)
    - logGamma(a)
    - logGamma(b)
    + a * Math.log(x)
    + b * Math.log1p(-x),
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(a, b, x)) / a;
  }
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

function studentTTwoSidedTail(value: number, degreesOfFreedom: number): number {
  const x = degreesOfFreedom / (degreesOfFreedom + value * value);
  return regularizedIncompleteBeta(x, degreesOfFreedom / 2, 0.5);
}

/** Two-sided 95% Student-t critical value. */
export function studentTCritical95(degreesOfFreedom: number): number {
  if (!Number.isInteger(degreesOfFreedom) || degreesOfFreedom < 1) {
    throw new RangeError("Degrees of freedom must be a positive integer.");
  }
  if (degreesOfFreedom < T_CRITICAL_95.length) {
    return T_CRITICAL_95[degreesOfFreedom] as number;
  }

  let lower = 0;
  let upper = 4;
  while (studentTTwoSidedTail(upper, degreesOfFreedom) > 0.05) upper *= 2;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    if (studentTTwoSidedTail(midpoint, degreesOfFreedom) > 0.05) {
      lower = midpoint;
    } else {
      upper = midpoint;
    }
  }
  const critical = (lower + upper) / 2;
  if (!Number.isFinite(critical)) {
    throw new RangeError("Student-t quantile calculation produced a non-finite value.");
  }
  return critical;
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
  const xScale = Math.max(...x.map((value) => Math.abs(value)));
  const yScale = Math.max(...y.map((value) => Math.abs(value)));
  if (!(xScale > 0)) {
    throw new RangeError("OLS regression requires variation in x.");
  }
  if (!(yScale > 0)) {
    throw new RangeError("OLS regression requires variation in y.");
  }

  const normalizedX = x.map((value) => value / xScale);
  const normalizedY = y.map((value) => value / yScale);
  const meanNormalizedX = compensatedSum(normalizedX) / n;
  const meanNormalizedY = compensatedSum(normalizedY) / n;
  const dx = normalizedX.map((value) => value - meanNormalizedX);
  const dy = normalizedY.map((value) => value - meanNormalizedY);
  const sxxNormalized = compensatedSum(dx.map((value) => value * value));
  const sxyNormalized = compensatedSum(dx.map((value, index) => value * (dy[index] as number)));
  const syyNormalized = compensatedSum(dy.map((value) => value * value));
  if (!(sxxNormalized > 0) || !Number.isFinite(sxxNormalized)) {
    throw new RangeError("OLS regression requires variation in x.");
  }
  if (!(syyNormalized > 0) || !Number.isFinite(syyNormalized)) {
    throw new RangeError("OLS regression requires variation in y.");
  }
  const relativeRmsSpread = Math.sqrt(sxxNormalized / n);
  if (!(relativeRmsSpread > MINIMUM_RELATIVE_X_RMS_SPREAD)) {
    throw new InsufficientRegressionSpreadError(relativeRmsSpread);
  }

  const normalizedSlope = sxyNormalized / sxxNormalized;
  const slope = (yScale / xScale) * normalizedSlope;
  const intercept = yScale * (meanNormalizedY - normalizedSlope * meanNormalizedX);
  const fitted = dx.map(
    (value) => yScale * (meanNormalizedY + normalizedSlope * value),
  );
  const residuals = dy.map(
    (value, index) => yScale * (value - normalizedSlope * (dx[index] as number)),
  );
  const normalizedResiduals = dy.map(
    (value, index) => value - normalizedSlope * (dx[index] as number),
  );
  const sseNormalized = compensatedSum(
    normalizedResiduals.map((value) => value * value),
  );
  const sse = yScale * yScale * sseNormalized;
  const r2 = 1 - sseNormalized / syyNormalized;
  const residualStandardError = yScale * Math.sqrt(sseNormalized / residualDegreesOfFreedom);
  const slopeStandardError =
    (yScale / xScale)
    * Math.sqrt(sseNormalized / residualDegreesOfFreedom / sxxNormalized);
  const margin = studentTCritical95(residualDegreesOfFreedom) * slopeStandardError;
  const slopeConfidence95 = [slope - margin, slope + margin] as const;
  const sxx = xScale * xScale * sxxNormalized;

  const scalarOutputs = [
    slope,
    intercept,
    sse,
    r2,
    residualStandardError,
    slopeStandardError,
    slopeConfidence95[0],
    slopeConfidence95[1],
    sxx,
  ];
  if (
    !scalarOutputs.every(Number.isFinite)
    || !fitted.every(Number.isFinite)
    || !residuals.every(Number.isFinite)
  ) {
    throw new RangeError("OLS regression produced a non-finite result.");
  }

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
    slopeConfidence95,
  };
}
