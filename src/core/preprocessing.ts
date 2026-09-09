import type {
  Diagnostic,
  HeatingRateUnit,
  MassNormalizationOptions,
  PreparationResult,
  PreparedPoint,
  PreparedRun,
  RunPreparationResult,
  TemperatureUnit,
  ThermalRun,
  TimeUnit,
} from "./types";
import { ALPHA_EQUIVALENCE_TOLERANCE } from "./constants";

const ALPHA_TOLERANCE = ALPHA_EQUIVALENCE_TOLERANCE;
const MASS_DENOMINATOR_TOLERANCE = 1e-12;

function refusal(
  code: Diagnostic["code"],
  message: string,
  runId: string,
): Diagnostic {
  return { code, severity: "refusal", message, runIds: [runId] };
}

function warning(
  code: Diagnostic["code"],
  message: string,
  runId: string,
): Diagnostic {
  return { code, severity: "warning", message, runIds: [runId] };
}

export function convertTemperatureToKelvin(
  value: number,
  unit: Exclude<TemperatureUnit, "unknown">,
): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("Temperature must be finite.");
  }
  const converted = unit === "K" ? value : value + 273.15;
  if (!(converted > 0)) {
    throw new RangeError("Temperature must be greater than absolute zero.");
  }
  return converted;
}

export function convertHeatingRateToKPerMinute(
  value: number,
  unit: Exclude<HeatingRateUnit, "unknown">,
): number {
  if (!Number.isFinite(value) || !(value > 0)) {
    throw new RangeError("Heating rate must be finite and positive.");
  }
  return unit.endsWith("/s") ? value * 60 : value;
}

function convertTimeToMinutes(
  value: number,
  unit: Exclude<TimeUnit, "unknown">,
): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("Time must be finite.");
  }
  return unit === "s" ? value / 60 : value;
}

function rawMassToAlpha(
  masses: readonly number[],
  options: MassNormalizationOptions,
): number[] {
  if (masses.length < 2 || !masses.every(Number.isFinite)) {
    throw new RangeError("Mass normalization requires at least two finite masses.");
  }
  const { initialMass, finalMass } = options;
  if (!Number.isFinite(initialMass) || !Number.isFinite(finalMass)) {
    throw new RangeError("Mass reference values must be finite.");
  }
  const denominator = initialMass - finalMass;
  const scale = Math.max(1, Math.abs(initialMass), Math.abs(finalMass));
  const tolerance = MASS_DENOMINATOR_TOLERANCE * scale;
  if (!(denominator > tolerance)) {
    throw new RangeError(
      "Initial mass must exceed final mass and define a numerically usable conversion span for a selected mass-loss stage.",
    );
  }
  return masses.map((mass) => (initialMass - mass) / denominator);
}

/** Normalize a selected mass-loss stage with alpha=(m0-m)/(m0-mf). */
export function normalizeMassToAlpha(
  masses: readonly number[],
  options: MassNormalizationOptions,
): number[] {
  const alpha = rawMassToAlpha(masses, options);
  if (alpha.some((value) => value < -ALPHA_TOLERANCE || value > 1 + ALPHA_TOLERANCE)) {
    throw new RangeError("Mass series is incompatible with the selected stage anchors.");
  }
  return alpha;
}

export function interpolateTemperatureAtAlpha(
  points: readonly Pick<PreparedPoint, "alpha" | "temperatureK">[],
  targetAlpha: number,
): number | undefined {
  if (!Number.isFinite(targetAlpha) || points.length === 0) return undefined;

  const exactMatches = points.filter(
    (point) => Math.abs(point.alpha - targetAlpha) <= ALPHA_TOLERANCE,
  );
  if (exactMatches.length > 1) return undefined;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index] as Pick<PreparedPoint, "alpha" | "temperatureK">;
    if (Math.abs(point.alpha - targetAlpha) <= ALPHA_TOLERANCE) {
      return point.temperatureK;
    }
    if (index === 0) continue;
    const previous = points[index - 1] as Pick<PreparedPoint, "alpha" | "temperatureK">;
    if (previous.alpha < targetAlpha && targetAlpha < point.alpha) {
      const fraction = (targetAlpha - previous.alpha) / (point.alpha - previous.alpha);
      return previous.temperatureK + fraction * (point.temperatureK - previous.temperatureK);
    }
  }
  return undefined;
}

export function isAmbiguousAlphaCrossing(
  points: readonly Pick<PreparedPoint, "alpha" | "temperatureK">[],
  targetAlpha: number,
): boolean {
  return (
    points.filter((point) => Math.abs(point.alpha - targetAlpha) <= ALPHA_TOLERANCE)
      .length > 1
  );
}

export function interpolateDerivativeAtAlpha(
  points: readonly PreparedPoint[],
  targetAlpha: number,
): number | undefined {
  if (!Number.isFinite(targetAlpha) || points.length === 0) return undefined;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index] as PreparedPoint;
    if (Math.abs(point.alpha - targetAlpha) <= ALPHA_TOLERANCE) {
      const derivative = point.dAlphaDtPerMinute;
      return derivative !== undefined && Number.isFinite(derivative) && derivative > 0
        ? derivative
        : undefined;
    }
    if (index === 0) continue;
    const previous = points[index - 1] as PreparedPoint;
    if (previous.alpha < targetAlpha && targetAlpha < point.alpha) {
      const left = previous.dAlphaDtPerMinute;
      const right = point.dAlphaDtPerMinute;
      if (
        left === undefined
        || right === undefined
        || !Number.isFinite(left)
        || !Number.isFinite(right)
        || !(left > 0)
        || !(right > 0)
      ) return undefined;
      const fraction = (targetAlpha - previous.alpha) / (point.alpha - previous.alpha);
      return left + fraction * (right - left);
    }
  }
  return undefined;
}

export function estimateFiniteDifference(
  alpha: readonly number[],
  axis: readonly number[],
): Array<number | undefined> {
  if (alpha.length !== axis.length || !alpha.every(Number.isFinite) || !axis.every(Number.isFinite)) {
    throw new RangeError("Finite-difference values and axis must be finite and equally sized.");
  }
  if (alpha.length < 2) return alpha.map(() => undefined);
  const axisScale = Math.max(1, ...axis.map((value) => Math.abs(value)));
  const minimumSpacing = 16 * Number.EPSILON * axisScale;
  const spacings = axis.slice(1).map(
    (value, index) => value - (axis[index] as number),
  );
  if (spacings.some((spacing) => !(spacing > minimumSpacing))) {
    throw new RangeError(
      "Finite-difference axis must be strictly increasing with numerically distinguishable points.",
    );
  }
  if (alpha.length === 2) {
    const derivative =
      ((alpha[1] as number) - (alpha[0] as number)) / (spacings[0] as number);
    if (!Number.isFinite(derivative)) {
      throw new RangeError("Finite-difference calculation produced a non-finite derivative.");
    }
    return [derivative, derivative];
  }

  const derivatives = alpha.map((_, index) => {
    const leftIndex = index === 0 ? 0 : index === alpha.length - 1 ? index - 2 : index - 1;
    const centerIndex = leftIndex + 1;
    const rightIndex = leftIndex + 2;
    const leftSpacing =
      (axis[centerIndex] as number) - (axis[leftIndex] as number);
    const rightSpacing =
      (axis[rightIndex] as number) - (axis[centerIndex] as number);
    const leftValue = alpha[leftIndex] as number;
    const centerValue = alpha[centerIndex] as number;
    const rightValue = alpha[rightIndex] as number;

    if (index === leftIndex) {
      return (
        -((2 * leftSpacing + rightSpacing) / (leftSpacing * (leftSpacing + rightSpacing)))
          * leftValue
        + ((leftSpacing + rightSpacing) / (leftSpacing * rightSpacing)) * centerValue
        - (leftSpacing / (rightSpacing * (leftSpacing + rightSpacing))) * rightValue
      );
    }
    if (index === rightIndex) {
      return (
        (rightSpacing / (leftSpacing * (leftSpacing + rightSpacing))) * leftValue
        - ((leftSpacing + rightSpacing) / (leftSpacing * rightSpacing)) * centerValue
        + ((leftSpacing + 2 * rightSpacing) / (rightSpacing * (leftSpacing + rightSpacing)))
          * rightValue
      );
    }
    return (
      -(rightSpacing / (leftSpacing * (leftSpacing + rightSpacing))) * leftValue
      + ((rightSpacing - leftSpacing) / (leftSpacing * rightSpacing)) * centerValue
      + (leftSpacing / (rightSpacing * (leftSpacing + rightSpacing))) * rightValue
    );
  });
  if (!derivatives.every(Number.isFinite)) {
    throw new RangeError("Finite-difference calculation produced a non-finite derivative.");
  }
  return derivatives;
}

/**
 * Estimate d(alpha)/dt per minute without smoothing. Time is preferred when a
 * complete monotone time axis exists; otherwise d(alpha)/dT is multiplied by beta.
 */
export function estimateAlphaDerivative(
  points: readonly Pick<PreparedPoint, "alpha" | "temperatureK" | "timeMinutes">[],
  heatingRateKPerMinute: number,
): Array<number | undefined> {
  if (!Number.isFinite(heatingRateKPerMinute) || !(heatingRateKPerMinute > 0)) {
    throw new RangeError("Heating rate must be finite and positive.");
  }
  if (points.length < 2) return points.map(() => undefined);
  const alpha = points.map((point) => point.alpha);
  const anyTime = points.some((point) => point.timeMinutes !== undefined);
  const completeTime = points.every(
    (point) => point.timeMinutes !== undefined && Number.isFinite(point.timeMinutes),
  );
  if (anyTime && !completeTime) {
    throw new RangeError(
      "Derivative estimation requires a complete finite time series or no time series.",
    );
  }
  if (completeTime) {
    return estimateFiniteDifference(
      alpha,
      points.map((point) => point.timeMinutes as number),
    );
  }
  return estimateFiniteDifference(
    alpha,
    points.map((point) => point.temperatureK),
  ).map((value) => (value === undefined ? undefined : value * heatingRateKPerMinute));
}

function isStrictlyIncreasing(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || value > (values[index - 1] as number));
}

function isNonDecreasing(values: readonly number[]): boolean {
  return values.every(
    (value, index) => index === 0 || value + ALPHA_TOLERANCE >= (values[index - 1] as number),
  );
}

export function prepareThermalRun(run: ThermalRun): RunPreparationResult {
  const refusals: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];

  if (run.temperatureUnit === "unknown") {
    refusals.push(
      refusal(
        "UNKNOWN_TEMPERATURE_UNIT",
        `Run ${run.id} has an unknown temperature unit; Kelvin conversion is not auditable.`,
        run.id,
      ),
    );
  }
  if (run.heatingRateUnit === "unknown") {
    refusals.push(
      refusal(
        "UNKNOWN_HEATING_RATE_UNIT",
        `Run ${run.id} has an unknown heating-rate unit.`,
        run.id,
      ),
    );
  }
  if (Number.isFinite(run.heatingRate) && run.heatingRate <= 0) {
    refusals.push(
      refusal(
        "COOLING_UNSUPPORTED",
        `Run ${run.id} has a nonpositive heating rate; cooling and isothermal programs are not supported.`,
        run.id,
      ),
    );
  }
  if (run.points.length < 3) {
    refusals.push(
      refusal("TOO_FEW_POINTS", `Run ${run.id} requires at least three points.`, run.id),
    );
  }
  if (run.peakAmbiguous === true) {
    refusals.push(
      refusal(
        "AMBIGUOUS_STAGE",
        `Run ${run.id} has multiple or overlapping peak candidates; one physical reaction stage cannot be assigned safely.`,
        run.id,
      ),
    );
  }
  if (refusals.length > 0) return { refusals, warnings };

  let heatingRateKPerMinute: number;
  let temperaturesK: number[];
  try {
    heatingRateKPerMinute = convertHeatingRateToKPerMinute(
      run.heatingRate,
      run.heatingRateUnit as Exclude<HeatingRateUnit, "unknown">,
    );
    temperaturesK = run.points.map((point) =>
      convertTemperatureToKelvin(
        point.temperature,
        run.temperatureUnit as Exclude<TemperatureUnit, "unknown">,
      ),
    );
  } catch (error) {
    const code = /Heating rate/i.test((error as Error).message)
      ? "INVALID_HEATING_RATE"
      : "NON_FINITE_VALUE";
    refusals.push(refusal(code, `Run ${run.id}: ${(error as Error).message}`, run.id));
    return { refusals, warnings };
  }

  if (!isStrictlyIncreasing(temperaturesK)) {
    refusals.push(
      refusal(
        "TEMPERATURE_NOT_INCREASING",
        `Run ${run.id} temperature must be strictly increasing in acquisition order.`,
        run.id,
      ),
    );
    return { refusals, warnings };
  }

  const completeAlpha = run.points.every(
    (point) => point.alpha !== undefined && Number.isFinite(point.alpha),
  );
  const completeMass = run.points.every(
    (point) => point.mass !== undefined && Number.isFinite(point.mass),
  );
  let alpha: number[];
  if (completeAlpha) {
    alpha = run.points.map((point) => point.alpha as number);
  } else if (completeMass) {
    const masses = run.points.map((point) => point.mass as number);
    if (run.massReference === undefined) {
      refusals.push(
        refusal(
          "MASS_REFERENCE_REQUIRED",
          `Run ${run.id} needs explicit m0 and mf values for the selected reaction stage; full-curve endpoints are not inferred.`,
          run.id,
        ),
      );
      return { refusals, warnings };
    }
    try {
      alpha = normalizeMassToAlpha(masses, run.massReference);
    } catch (error) {
      refusals.push(
        refusal(
        "INVALID_ALPHA_ANCHORS",
          `Run ${run.id}: ${(error as Error).message}`,
          run.id,
        ),
      );
      return { refusals, warnings };
    }
  } else {
    refusals.push(
      refusal(
        "ALPHA_SOURCE_MISSING",
        `Run ${run.id} needs a complete alpha column or a complete mass column.`,
        run.id,
      ),
    );
    return { refusals, warnings };
  }

  if (alpha.some((value) => !Number.isFinite(value) || value < -ALPHA_TOLERANCE || value > 1 + ALPHA_TOLERANCE)) {
    refusals.push(
      refusal(
        "ALPHA_OUT_OF_RANGE",
        `Run ${run.id} contains conversion outside [0, 1].`,
        run.id,
      ),
    );
  }
  if (!isNonDecreasing(alpha)) {
    refusals.push(
      refusal(
        "NON_MONOTONIC_ALPHA",
        `Run ${run.id} conversion decreases; automatic branch selection would be unsafe.`,
        run.id,
      ),
    );
  }
  if ((alpha[alpha.length - 1] as number) - (alpha[0] as number) <= ALPHA_TOLERANCE) {
    refusals.push(
      refusal("ALPHA_RANGE_EMPTY", `Run ${run.id} has no usable conversion span.`, run.id),
    );
  }
  if (refusals.length > 0) return { refusals, warnings };

  let timeMinutes: Array<number | undefined> = run.points.map(() => undefined);
  const hasAnyTime = run.points.some((point) => point.time !== undefined);
  const hasCompleteTime = run.points.every(
    (point) => point.time !== undefined && Number.isFinite(point.time),
  );
  if (hasAnyTime && !hasCompleteTime) {
    const missingCount = run.points.filter((point) => point.time === undefined).length;
    const nonFiniteCount = run.points.filter(
      (point) => point.time !== undefined && !Number.isFinite(point.time),
    ).length;
    refusals.push({
      code: "INVALID_TIME_SERIES",
      severity: "refusal",
      message:
        `Run ${run.id} has a partially missing or non-finite time series. `
        + "Every point must contain a finite time value, or the time series must be "
        + "omitted entirely; temperature-based fallback is not allowed for a malformed "
        + "mapped time series.",
      runIds: [run.id],
      details: {
        pointCount: run.points.length,
        missingCount,
        nonFiniteCount,
      },
    });
    return { refusals, warnings };
  }
  let usableTime = false;
  if (hasCompleteTime) {
    if (run.timeUnit === undefined || run.timeUnit === "unknown") {
      warnings.push(
        warning(
          "UNKNOWN_TIME_UNIT",
          `Run ${run.id} time values are ignored because their unit is unknown.`,
          run.id,
        ),
      );
    } else {
      timeMinutes = run.points.map((point) =>
        convertTimeToMinutes(point.time as number, run.timeUnit as Exclude<TimeUnit, "unknown">),
      );
      usableTime = isStrictlyIncreasing(timeMinutes as number[]);
      if (!usableTime) {
        refusals.push(
          refusal(
            "TIME_NOT_INCREASING",
            `Run ${run.id} time is not strictly increasing; mapped time cannot be discarded in favor of a silent temperature-based fallback.`,
            run.id,
          ),
        );
        return { refusals, warnings };
      }
    }
  }

  if (usableTime) {
    const segmentRates = temperaturesK.slice(1).map((temperature, index) => {
      const deltaTemperature = temperature - (temperaturesK[index] as number);
      const deltaTime =
        (timeMinutes[index + 1] as number) - (timeMinutes[index] as number);
      return deltaTemperature / deltaTime;
    });
    const maximumRelativeDeviation = Math.max(
      ...segmentRates.map(
        (rate) => Math.abs(rate - heatingRateKPerMinute) / heatingRateKPerMinute,
      ),
    );
    if (maximumRelativeDeviation > 0.02) {
      refusals.push(
        refusal(
          "NONLINEAR_HEATING_UNSUPPORTED",
          `Run ${run.id} deviates from its declared linear heating rate by more than 2%.`,
          run.id,
        ),
      );
      return { refusals, warnings };
    }
  }

  const hasAnyPrecomputedDerivative = run.points.some(
    (point) => (
      point.dAlphaDtPerMinute !== undefined
      || point.dAlphaDtSource !== undefined
    ),
  );
  const completeProvidedDerivative = run.points.every(
    (point) =>
      point.dAlphaDtPerMinute !== undefined
      && Number.isFinite(point.dAlphaDtPerMinute)
      && (point.dAlphaDtSource ?? "provided") === "provided",
  );
  const completeTemperatureDerivative = run.points.every(
    (point) =>
      point.dAlphaDtPerMinute !== undefined
      && Number.isFinite(point.dAlphaDtPerMinute)
      && point.dAlphaDtSource === "temperature",
  );
  const completePrecomputedDerivative =
    completeProvidedDerivative || completeTemperatureDerivative;
  if (hasAnyPrecomputedDerivative && !completePrecomputedDerivative) {
    const missingCount = run.points.filter(
      (point) => point.dAlphaDtPerMinute === undefined,
    ).length;
    const nonFiniteCount = run.points.filter(
      (point) =>
        point.dAlphaDtPerMinute !== undefined
        && !Number.isFinite(point.dAlphaDtPerMinute),
    ).length;
    refusals.push({
      code: "INVALID_PROVIDED_DERIVATIVE",
      severity: "refusal",
      message:
        `Run ${run.id} has a partially missing or non-finite provided dAlpha/dt series. `
        + "Every point must contain a finite dAlpha/dt value per minute, or the provided "
        + "derivative must be omitted entirely; numerical fallback is not allowed for a "
        + "malformed supplied series.",
      runIds: [run.id],
      details: {
        pointCount: run.points.length,
        missingCount,
        nonFiniteCount,
      },
    });
    return { refusals, warnings };
  }
  const derivativeSource = completeProvidedDerivative
    ? "provided"
    : completeTemperatureDerivative
      ? "temperature"
      : usableTime
        ? "time"
        : "temperature";

  const basePoints = run.points.map((_, index) => ({
    temperatureK: temperaturesK[index] as number,
    alpha: alpha[index] as number,
    timeMinutes: timeMinutes[index],
  }));
  let derivatives: Array<number | undefined>;
  try {
    derivatives = completePrecomputedDerivative
      ? run.points.map((point) => point.dAlphaDtPerMinute as number)
      : estimateAlphaDerivative(basePoints, heatingRateKPerMinute);
  } catch (error) {
    refusals.push(
      refusal(
        usableTime ? "INVALID_TIME_SERIES" : "TEMPERATURE_NOT_INCREASING",
        `Run ${run.id}: ${(error as Error).message}`,
        run.id,
      ),
    );
    return { refusals, warnings };
  }

  const points: PreparedPoint[] = basePoints.map((point, index) => ({
    temperatureK: point.temperatureK,
    alpha: point.alpha,
    ...(point.timeMinutes === undefined ? {} : { timeMinutes: point.timeMinutes }),
    ...(derivatives[index] === undefined
      ? {}
      : { dAlphaDtPerMinute: derivatives[index] as number }),
  }));

  let peakTemperatureK: number | undefined;
  if (run.peakTemperature !== undefined) {
    try {
      peakTemperatureK = convertTemperatureToKelvin(
        run.peakTemperature,
        run.temperatureUnit as Exclude<TemperatureUnit, "unknown">,
      );
      const lowerTemperatureK = temperaturesK[0] as number;
      const upperTemperatureK = temperaturesK[temperaturesK.length - 1] as number;
      const boundaryTolerance =
        16
        * Number.EPSILON
        * Math.max(1, Math.abs(lowerTemperatureK), Math.abs(upperTemperatureK));
      if (
        !(peakTemperatureK > lowerTemperatureK + boundaryTolerance)
        || !(peakTemperatureK < upperTemperatureK - boundaryTolerance)
      ) {
        refusals.push(
          refusal(
            "KISSINGER_PEAK_OUTSIDE_RUN_RANGE",
            `Run ${run.id} peak temperature must lie strictly inside the measured range with observations on both sides.`,
            run.id,
          ),
        );
        return { refusals, warnings };
      }
      if (
        run.peakSourceSignal === "positive-dalpha-dt"
        || run.peakSourceSignal === "positive-mass-loss-rate"
      ) {
        const peakIndex = points.findIndex(
          (point) => Math.abs(point.temperatureK - peakTemperatureK!) <= boundaryTolerance,
        );
        const peakRate = peakIndex >= 0
          ? points[peakIndex]?.dAlphaDtPerMinute
          : undefined;
        const previousRate = peakIndex > 0
          ? points[peakIndex - 1]?.dAlphaDtPerMinute
          : undefined;
        const nextRate = peakIndex >= 0 && peakIndex < points.length - 1
          ? points[peakIndex + 1]?.dAlphaDtPerMinute
          : undefined;
        if (
          peakIndex <= 0
          || peakIndex >= points.length - 1
          || !Number.isFinite(peakRate)
          || !Number.isFinite(previousRate)
          || !Number.isFinite(nextRate)
          || !((peakRate as number) > 0)
          || !((peakRate as number) > (previousRate as number))
          || !((peakRate as number) > (nextRate as number))
        ) {
          refusals.push(
            refusal(
              "KISSINGER_PEAK_SIGNAL_UNVERIFIED",
              `Run ${run.id} peak temperature is not an observed strict interior maximum of the declared positive rate signal. Use external-beta-tp-table only for independently curated peak tables.`,
              run.id,
            ),
          );
          return { refusals, warnings };
        }
      }
    } catch (error) {
      refusals.push(
        refusal("NON_FINITE_VALUE", `Run ${run.id}: ${(error as Error).message}`, run.id),
      );
      return { refusals, warnings };
    }
  }

  const prepared: PreparedRun = {
    id: run.id,
    heatingRateKPerMinute,
    points,
    derivativeSource,
    ...(peakTemperatureK === undefined ? {} : { peakTemperatureK }),
    ...(run.peakAmbiguous === undefined ? {} : { peakAmbiguous: run.peakAmbiguous }),
    ...(run.peakResolved === undefined ? {} : { peakResolved: run.peakResolved }),
    ...(run.peakQuality === undefined ? {} : { peakQuality: run.peakQuality }),
    ...(run.peakSourceSignal === undefined
      ? {}
      : { peakSourceSignal: run.peakSourceSignal }),
    ...(run.peakAnalystConfirmed === undefined
      ? {}
      : { peakAnalystConfirmed: run.peakAnalystConfirmed }),
    ...(run.sampleId === undefined ? {} : { sampleId: run.sampleId }),
    ...(run.atmosphere === undefined ? {} : { atmosphere: run.atmosphere }),
    ...(run.stage === undefined ? {} : { stage: run.stage }),
  };
  return { run: prepared, refusals, warnings };
}

export function prepareThermalRuns(runs: readonly ThermalRun[]): PreparationResult {
  const prepared: PreparedRun[] = [];
  const refusals: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  for (const run of runs) {
    const result = prepareThermalRun(run);
    if (result.run !== undefined) prepared.push(result.run);
    refusals.push(...result.refusals);
    warnings.push(...result.warnings);
  }
  return { runs: prepared, refusals, warnings };
}
