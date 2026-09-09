import {
  DEFAULT_ALPHA_VALUES,
  FWO_SLOPE_COEFFICIENT,
  GAS_CONSTANT_J_PER_MOL_K,
  STARINK_SLOPE_COEFFICIENT,
  STARINK_TEMPERATURE_EXPONENT,
} from "./constants";
import { evaluateAnalysisEligibility } from "./eligibility";
import { heatingRateKey } from "./heatingRates";
import {
  interpolateDerivativeAtAlpha,
  interpolateTemperatureAtAlpha,
  isAmbiguousAlphaCrossing,
} from "./preprocessing";
import { ordinaryLeastSquares } from "./regression";
import type {
  AlphaActivationEnergyEstimate,
  AlphaMethodResult,
  Diagnostic,
  IsoConversionalMethod,
  KissingerPeak,
  KissingerResult,
  MethodCalculationOptions,
  MethodName,
  MethodObservation,
  PreparedRun,
  RegressionInputGroup,
} from "./types";

const DEFAULT_MIN_R2_WARNING = 0.98;

function formulaId(method: IsoConversionalMethod): string {
  switch (method) {
    case "FWO":
      return "fwo_doyle_ln_1.052_v1";
    case "KAS":
      return "kas_ln_beta_over_t2_v1";
    case "STARINK":
      return "starink_ln_beta_over_t1.92_1.0008_v1";
    case "FRIEDMAN":
      return "friedman_ln_dalpha_dt_v1";
  }
}

function diagnostic(
  severity: Diagnostic["severity"],
  code: Diagnostic["code"],
  message: string,
  extra: Partial<Diagnostic> = {},
): Diagnostic {
  return { severity, code, message, ...extra };
}

function activationEnergyFromSlope(
  method: IsoConversionalMethod,
  slope: number,
): number {
  const coefficient =
    method === "FWO"
      ? FWO_SLOPE_COEFFICIENT
      : method === "STARINK"
        ? STARINK_SLOPE_COEFFICIENT
        : 1;
  return (-slope * GAS_CONSTANT_J_PER_MOL_K) / coefficient / 1000;
}

function transformedY(
  method: Exclude<IsoConversionalMethod, "FRIEDMAN">,
  heatingRateKPerMinute: number,
  temperatureK: number,
): number {
  switch (method) {
    case "FWO":
      return Math.log(heatingRateKPerMinute);
    case "KAS":
      return Math.log(heatingRateKPerMinute / temperatureK ** 2);
    case "STARINK":
      return Math.log(
        heatingRateKPerMinute / temperatureK ** STARINK_TEMPERATURE_EXPONENT,
      );
  }
}

function arithmeticMean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStandardDeviation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mean = arithmeticMean(values);
  const sumSquaredDeviation = values.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0,
  );
  return Math.sqrt(sumSquaredDeviation / (values.length - 1));
}

function buildRegressionInputGroups(
  method: MethodName,
  rawObservations: readonly MethodObservation[],
): RegressionInputGroup[] {
  const sortedObservations = [...rawObservations].sort((left, right) => {
    if (left.heatingRateKPerMinute !== right.heatingRateKPerMinute) {
      return left.heatingRateKPerMinute - right.heatingRateKPerMinute;
    }
    return left.runId < right.runId ? -1 : left.runId > right.runId ? 1 : 0;
  });
  const grouped = new Map<string, MethodObservation[]>();
  for (const observation of sortedObservations) {
    const key = heatingRateKey(observation.heatingRateKPerMinute);
    const group = grouped.get(key);
    if (group) group.push(observation);
    else grouped.set(key, [observation]);
  }

  return [...grouped.entries()].map(([key, contributions]) => {
    const heatingRateKPerMinute = arithmeticMean(
      contributions.map((observation) => observation.heatingRateKPerMinute),
    );
    const temperatureK = arithmeticMean(
      contributions.map((observation) => observation.temperatureK),
    );
    const dAlphaDtPerMinute =
      method === "FRIEDMAN"
        ? arithmeticMean(
            contributions.map((observation) => observation.dAlphaDtPerMinute as number),
          )
        : undefined;
    const x = 1 / temperatureK;
    const y =
      method === "FRIEDMAN"
        ? Math.log(dAlphaDtPerMinute as number)
        : method === "KISSINGER"
          ? Math.log(heatingRateKPerMinute / temperatureK ** 2)
          : transformedY(method, heatingRateKPerMinute, temperatureK);

    return {
      groupId: `beta:${key}`,
      sourceRunIds: contributions.map((observation) => observation.runId),
      replicateCount: contributions.length,
      aggregation:
        contributions.length === 1
          ? "single-run"
          : "arithmetic-mean-physical-scale-by-heating-rate",
      heatingRateKPerMinute,
      temperatureK,
      ...(dAlphaDtPerMinute === undefined ? {} : { dAlphaDtPerMinute }),
      x,
      y,
      temperatureSampleStandardDeviationK: sampleStandardDeviation(
        contributions.map((observation) => observation.temperatureK),
      ),
      ...(method === "FRIEDMAN"
        ? {
            derivativeSampleStandardDeviationPerMinute: sampleStandardDeviation(
              contributions.map(
                (observation) => observation.dAlphaDtPerMinute as number,
              ),
            ),
          }
        : {}),
    };
  });
}

function regressByHeatingRate(
  method: MethodName,
  observations: readonly MethodObservation[],
) {
  const inputGroups = buildRegressionInputGroups(method, observations);
  const hasReplicates = inputGroups.some((group) => group.replicateCount > 1);
  return ordinaryLeastSquares(
    inputGroups.map((group) => group.x),
    inputGroups.map((group) => group.y),
    {
      rawObservationCount: observations.length,
      inputAggregation: hasReplicates
        ? "arithmetic-mean-physical-scale-by-heating-rate"
        : "none",
      inputGroups,
    },
  );
}

function refuseAmbiguousAlpha(
  method: IsoConversionalMethod,
  runs: readonly PreparedRun[],
  alpha: number,
  refusals: Diagnostic[],
): boolean {
  const runIds = runs
    .filter((run) => isAmbiguousAlphaCrossing(run.points, alpha))
    .map((run) => run.id);
  if (runIds.length === 0) return false;

  refusals.push(
    diagnostic(
      "refusal",
      "AMBIGUOUS_ALPHA_CROSSING",
      `${method} cannot calculate alpha ${alpha} because T_alpha is not unique on one or more runs.`,
      { method, alpha, runIds },
    ),
  );
  return true;
}

function appendEaVariationWarning(
  method: IsoConversionalMethod,
  estimates: readonly AlphaActivationEnergyEstimate[],
  warnings: Diagnostic[],
): void {
  if (estimates.length < 2) return;
  const energies = estimates.map((estimate) => estimate.activationEnergyKJPerMol);
  const mean = energies.reduce((sum, value) => sum + value, 0) / energies.length;
  if (!Number.isFinite(mean) || Math.abs(mean) <= Number.EPSILON) return;
  const relativeRange = (Math.max(...energies) - Math.min(...energies)) / Math.abs(mean);
  if (relativeRange > 0.2) {
    warnings.push(
      diagnostic(
        "warning",
        "MULTISTEP_EA_VARIATION",
        `${method} E(alpha) varies by more than 20%; do not collapse it to one mean value.`,
        { method, details: { relativeRange } },
      ),
    );
  } else if (relativeRange >= 0.1) {
    warnings.push(
      diagnostic(
        "warning",
        "POSSIBLE_MULTISTEP_EA_VARIATION",
        `${method} E(alpha) varies by 10-20%; inspect possible multi-step behavior.`,
        { method, details: { relativeRange } },
      ),
    );
  }
}

function calculateIntegralMethod(
  method: Exclude<IsoConversionalMethod, "FRIEDMAN">,
  runs: readonly PreparedRun[],
  alphaValues: readonly number[],
  options: MethodCalculationOptions,
): AlphaMethodResult {
  const eligibility = evaluateAnalysisEligibility(runs, alphaValues);
  const refusals: Diagnostic[] = [...eligibility.refusals];
  const warnings: Diagnostic[] = [...eligibility.warnings];
  const estimates: AlphaActivationEnergyEstimate[] = [];
  if (!eligibility.eligible) {
    return {
      method,
      resultType: "isoconversional",
      formulaId: formulaId(method),
      status: "refused",
      estimates,
      refusals,
      warnings,
    };
  }

  const [commonLower, commonUpper] = eligibility.commonAlphaRange as readonly [number, number];
  const minR2Warning = options.minR2Warning ?? DEFAULT_MIN_R2_WARNING;
  for (const alpha of alphaValues) {
    if (alpha < commonLower || alpha > commonUpper) {
      refusals.push(
        diagnostic(
          "refusal",
          "TARGET_ALPHA_OUTSIDE_COMMON_RANGE",
          `${method} cannot calculate alpha ${alpha} outside the common range.`,
          { method, alpha },
        ),
      );
      continue;
    }
    if (refuseAmbiguousAlpha(method, runs, alpha, refusals)) {
      continue;
    }

    const observations: MethodObservation[] = [];
    for (const run of runs) {
      const temperatureK = interpolateTemperatureAtAlpha(run.points, alpha);
      if (temperatureK === undefined || !(temperatureK > 0)) {
        warnings.push(
          diagnostic(
            "warning",
            "TARGET_ALPHA_OUTSIDE_COMMON_RANGE",
            `${method} cannot interpolate alpha ${alpha} for run ${run.id}.`,
            { method, alpha, runIds: [run.id] },
          ),
        );
        continue;
      }
      observations.push({
        runId: run.id,
        heatingRateKPerMinute: run.heatingRateKPerMinute,
        temperatureK,
        x: 1 / temperatureK,
        y: transformedY(method, run.heatingRateKPerMinute, temperatureK),
      });
    }
    const usableDistinctRates = new Set(
      observations.map((observation) => heatingRateKey(observation.heatingRateKPerMinute)),
    ).size;
    if (usableDistinctRates < 3) {
      refusals.push(
        diagnostic(
          "refusal",
          "INSUFFICIENT_DISTINCT_HEATING_RATES",
          `${method} has fewer than three usable distinct rates at alpha ${alpha}.`,
          { method, alpha, runIds: observations.map((observation) => observation.runId) },
        ),
      );
      continue;
    }

    try {
      const regression = regressByHeatingRate(method, observations);
      const activationEnergyKJPerMol = activationEnergyFromSlope(method, regression.slope);
      estimates.push({ alpha, activationEnergyKJPerMol, regression, observations });
      if (regression.r2 < minR2Warning) {
        warnings.push(
          diagnostic(
            "warning",
            "LOW_R2",
            `${method} regression at alpha ${alpha} has R²=${regression.r2.toFixed(4)}.`,
            { method, alpha, details: { r2: regression.r2, threshold: minR2Warning } },
          ),
        );
      }
      if (!(activationEnergyKJPerMol > 0)) {
        warnings.push(
          diagnostic(
            "warning",
            "NONPOSITIVE_APPARENT_EA",
            `${method} produced a non-positive apparent activation energy at alpha ${alpha}.`,
            { method, alpha, details: { activationEnergyKJPerMol } },
          ),
        );
      }
    } catch (error) {
      refusals.push(
        diagnostic(
          "refusal",
          "REGRESSION_FAILED",
          `${method} regression failed at alpha ${alpha}: ${(error as Error).message}`,
          { method, alpha },
        ),
      );
    }
  }

  const status =
    estimates.length === 0
      ? "refused"
      : estimates.length < alphaValues.length || refusals.length > 0
        ? "partial"
        : "success";
  appendEaVariationWarning(method, estimates, warnings);
  return {
    method,
    resultType: "isoconversional",
    formulaId: formulaId(method),
    status,
    estimates,
    refusals,
    warnings,
  };
}

export function calculateFWO(
  runs: readonly PreparedRun[],
  alphaValues: readonly number[] = DEFAULT_ALPHA_VALUES,
  options: MethodCalculationOptions = {},
): AlphaMethodResult {
  return calculateIntegralMethod("FWO", runs, alphaValues, options);
}

export function calculateKAS(
  runs: readonly PreparedRun[],
  alphaValues: readonly number[] = DEFAULT_ALPHA_VALUES,
  options: MethodCalculationOptions = {},
): AlphaMethodResult {
  return calculateIntegralMethod("KAS", runs, alphaValues, options);
}

export function calculateStarink(
  runs: readonly PreparedRun[],
  alphaValues: readonly number[] = DEFAULT_ALPHA_VALUES,
  options: MethodCalculationOptions = {},
): AlphaMethodResult {
  return calculateIntegralMethod("STARINK", runs, alphaValues, options);
}

export function calculateFriedman(
  runs: readonly PreparedRun[],
  alphaValues: readonly number[] = DEFAULT_ALPHA_VALUES,
  options: MethodCalculationOptions = {},
): AlphaMethodResult {
  const method = "FRIEDMAN" as const;
  const eligibility = evaluateAnalysisEligibility(runs, alphaValues);
  const refusals: Diagnostic[] = [...eligibility.refusals];
  const warnings: Diagnostic[] = [...eligibility.warnings];
  const estimates: AlphaActivationEnergyEstimate[] = [];
  if (!eligibility.eligible) {
    return {
      method,
      resultType: "isoconversional",
      formulaId: formulaId(method),
      status: "refused",
      estimates,
      refusals,
      warnings,
    };
  }

  const numericalDerivativeRuns = runs
    .filter((run) => run.derivativeSource !== "provided")
    .map((run) => run.id);
  if (numericalDerivativeRuns.length > 0) {
    warnings.push(
      diagnostic(
        "warning",
        "NUMERICAL_DERIVATIVE",
        "Friedman uses an unsmoothed numerical derivative for one or more runs.",
        { method, runIds: numericalDerivativeRuns },
      ),
    );
  }

  const [commonLower, commonUpper] = eligibility.commonAlphaRange as readonly [number, number];
  const minR2Warning = options.minR2Warning ?? DEFAULT_MIN_R2_WARNING;
  for (const alpha of alphaValues) {
    if (alpha < commonLower || alpha > commonUpper) {
      refusals.push(
        diagnostic(
          "refusal",
          "TARGET_ALPHA_OUTSIDE_COMMON_RANGE",
          `Friedman cannot calculate alpha ${alpha} outside the common range.`,
          { method, alpha },
        ),
      );
      continue;
    }
    if (refuseAmbiguousAlpha(method, runs, alpha, refusals)) {
      continue;
    }

    const observations: MethodObservation[] = [];
    const badRunIds: string[] = [];
    for (const run of runs) {
      const temperatureK = interpolateTemperatureAtAlpha(run.points, alpha);
      const derivative = interpolateDerivativeAtAlpha(run.points, alpha);
      if (
        temperatureK === undefined ||
        !(temperatureK > 0) ||
        derivative === undefined ||
        !Number.isFinite(derivative) ||
        !(derivative > 0)
      ) {
        badRunIds.push(run.id);
        continue;
      }
      observations.push({
        runId: run.id,
        heatingRateKPerMinute: run.heatingRateKPerMinute,
        temperatureK,
        dAlphaDtPerMinute: derivative,
        x: 1 / temperatureK,
        y: Math.log(derivative),
      });
    }
    if (badRunIds.length > 0) {
      warnings.push(
        diagnostic(
          "warning",
          "FRIEDMAN_NON_POSITIVE_RATE",
          `Friedman excluded non-positive or unavailable dα/dt observations at alpha ${alpha}.`,
          { method, alpha, runIds: badRunIds },
        ),
      );
    }
    const usableDistinctRates = new Set(
      observations.map((observation) => heatingRateKey(observation.heatingRateKPerMinute)),
    ).size;
    if (usableDistinctRates < 3) {
      refusals.push(
        diagnostic(
          "refusal",
          "FRIEDMAN_DERIVATIVE_UNAVAILABLE",
          `Friedman has fewer than three usable rates at alpha ${alpha}.`,
          { method, alpha },
        ),
      );
      continue;
    }

    try {
      const regression = regressByHeatingRate(method, observations);
      const activationEnergyKJPerMol = activationEnergyFromSlope(method, regression.slope);
      estimates.push({ alpha, activationEnergyKJPerMol, regression, observations });
      if (regression.r2 < minR2Warning) {
        warnings.push(
          diagnostic(
            "warning",
            "LOW_R2",
            `Friedman regression at alpha ${alpha} has R²=${regression.r2.toFixed(4)}.`,
            { method, alpha, details: { r2: regression.r2, threshold: minR2Warning } },
          ),
        );
      }
      if (!(activationEnergyKJPerMol > 0)) {
        warnings.push(
          diagnostic(
            "warning",
            "NONPOSITIVE_APPARENT_EA",
            `Friedman produced a non-positive apparent activation energy at alpha ${alpha}.`,
            { method, alpha, details: { activationEnergyKJPerMol } },
          ),
        );
      }
    } catch (error) {
      refusals.push(
        diagnostic(
          "refusal",
          "REGRESSION_FAILED",
          `Friedman regression failed at alpha ${alpha}: ${(error as Error).message}`,
          { method, alpha },
        ),
      );
    }
  }

  const status =
    estimates.length === 0
      ? "refused"
      : estimates.length < alphaValues.length || refusals.length > 0
        ? "partial"
        : "success";
  appendEaVariationWarning(method, estimates, warnings);
  return {
    method,
    resultType: "isoconversional",
    formulaId: formulaId(method),
    status,
    estimates,
    refusals,
    warnings,
  };
}

export function calculateKissinger(
  peaks: readonly KissingerPeak[],
  options: MethodCalculationOptions = {},
): KissingerResult {
  const method = "KISSINGER" as const;
  const refusals: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const observations: MethodObservation[] = [];
  const resultIdentity = {
    method,
    resultType: "peak" as const,
    alpha: null,
    formulaId: "kissinger_peak_ln_v1" as const,
  };
  const ambiguousPeaks = peaks.filter((peak) => peak.ambiguous);
  if (ambiguousPeaks.length > 0) {
    refusals.push(
      diagnostic(
        "refusal",
        "OVERLAPPING_PEAKS",
        "Kissinger peak identity is ambiguous or overlapping for one or more runs.",
        { method, runIds: ambiguousPeaks.map((peak) => peak.runId) },
      ),
    );
    return { ...resultIdentity, status: "refused", observations, refusals, warnings };
  }
  const peaksWithoutStage = peaks.filter((peak) => !peak.stage?.trim());
  if (peaksWithoutStage.length > 0) {
    refusals.push(
      diagnostic(
        "refusal",
        "AMBIGUOUS_STAGE",
        "Kissinger requires an explicit physical-stage assignment for every peak.",
        {
          method,
          runIds: peaksWithoutStage.map((peak) => peak.runId),
          details: {
            missingStageCount: peaksWithoutStage.length,
            peakCount: peaks.length,
          },
        },
      ),
    );
    return { ...resultIdentity, status: "refused", observations, refusals, warnings };
  }
  const stages = new Set(
    peaks.map((peak) => peak.stage?.trim()).filter((stage): stage is string => Boolean(stage)),
  );
  if (stages.size > 1) {
    refusals.push(
      diagnostic(
        "refusal",
        "AMBIGUOUS_STAGE",
        "Kissinger peaks are not assigned to one common physical stage.",
        { method, runIds: peaks.map((peak) => peak.runId) },
      ),
    );
    return { ...resultIdentity, status: "refused", observations, refusals, warnings };
  }
  const runIds = peaks.map((peak) => peak.runId);
  if (new Set(runIds).size !== runIds.length) {
    refusals.push(
      diagnostic(
        "refusal",
        "DUPLICATE_RUN_ID",
        "Kissinger peak identifiers must be unique; duplicated rows are not valid replicates.",
        { method, runIds },
      ),
    );
    return { ...resultIdentity, status: "refused", observations, refusals, warnings };
  }
  const valid = peaks.every(
    (peak) =>
      Number.isFinite(peak.heatingRateKPerMinute) &&
      peak.heatingRateKPerMinute > 0 &&
      Number.isFinite(peak.peakTemperatureK) &&
      peak.peakTemperatureK > 0,
  );
  const distinctRates = new Set(
    peaks.map((peak) => heatingRateKey(peak.heatingRateKPerMinute)),
  ).size;
  if (distinctRates < peaks.length) {
    const replicateCounts = new Map<string, number>();
    for (const peak of peaks) {
      const key = heatingRateKey(peak.heatingRateKPerMinute);
      replicateCounts.set(key, (replicateCounts.get(key) ?? 0) + 1);
    }
    warnings.push(
      diagnostic(
        "warning",
        "DUPLICATE_HEATING_RATE",
        "Kissinger replicates are aggregated on the physical scale into one equal-weight regression input per heating rate; they do not increase n or residual degrees of freedom.",
        {
          method,
          runIds,
          details: {
            rawObservationCount: peaks.length,
            distinctHeatingRates: distinctRates,
            replicateGroupCount: [...replicateCounts.values()].filter((count) => count > 1)
              .length,
            maximumReplicatesPerRate: Math.max(...replicateCounts.values()),
          },
        },
      ),
    );
  }
  if (!valid || peaks.length < 3 || distinctRates < 3) {
    refusals.push(
      diagnostic(
        "refusal",
        "TOO_FEW_KISSINGER_PEAKS",
        "Kissinger requires at least three finite peaks at distinct positive heating rates.",
        { method, runIds: peaks.map((peak) => peak.runId) },
      ),
    );
    return { ...resultIdentity, status: "refused", observations, refusals, warnings };
  }
  if (distinctRates === 3) {
    warnings.push(
      diagnostic(
        "warning",
        "LIMITED_HEATING_RATES",
        "Kissinger uses only three distinct heating rates; uncertainty is weakly constrained.",
        { method },
      ),
    );
  }
  const rateRatio =
    Math.max(...peaks.map((peak) => peak.heatingRateKPerMinute)) /
    Math.min(...peaks.map((peak) => peak.heatingRateKPerMinute));
  if (distinctRates < 5 || rateRatio < 5) {
    warnings.push(
      diagnostic(
        "warning",
        "KISSINGER_COMPLEXITY_UNDERPOWERED",
        "Kissinger has fewer than five distinct rates or less than a five-fold rate span; nonlinearity is weakly testable.",
        { method, details: { distinctHeatingRates: distinctRates, rateRatio } },
      ),
    );
  }

  for (const peak of peaks) {
    observations.push({
      runId: peak.runId,
      heatingRateKPerMinute: peak.heatingRateKPerMinute,
      temperatureK: peak.peakTemperatureK,
      x: 1 / peak.peakTemperatureK,
      y: Math.log(peak.heatingRateKPerMinute / peak.peakTemperatureK ** 2),
    });
  }

  try {
    const regression = regressByHeatingRate(method, observations);
    const activationEnergyKJPerMol =
      (-regression.slope * GAS_CONSTANT_J_PER_MOL_K) / 1000;
    const minR2Warning = options.minR2Warning ?? DEFAULT_MIN_R2_WARNING;
    if (regression.r2 < minR2Warning) {
      warnings.push(
        diagnostic(
          "warning",
          "LOW_R2",
          `Kissinger regression has R²=${regression.r2.toFixed(4)}.`,
          { method, details: { r2: regression.r2, threshold: minR2Warning } },
        ),
      );
    }
    if (!(activationEnergyKJPerMol > 0)) {
      warnings.push(
        diagnostic(
          "warning",
          "NONPOSITIVE_APPARENT_EA",
          "Kissinger produced a non-positive apparent activation energy.",
          { method, details: { activationEnergyKJPerMol } },
        ),
      );
    }
    return {
      ...resultIdentity,
      status: "success",
      activationEnergyKJPerMol,
      regression,
      observations,
      refusals,
      warnings,
    };
  } catch (error) {
    refusals.push(
      diagnostic(
        "refusal",
        "REGRESSION_FAILED",
        `Kissinger regression failed: ${(error as Error).message}`,
        { method },
      ),
    );
    return { ...resultIdentity, status: "refused", observations, refusals, warnings };
  }
}
