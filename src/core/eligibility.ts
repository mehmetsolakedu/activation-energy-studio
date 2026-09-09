import { ALPHA_EQUIVALENCE_TOLERANCE, DEFAULT_ALPHA_VALUES } from "./constants";
import { heatingRateKey } from "./heatingRates";
import type { Diagnostic, EligibilityResult, PreparedRun } from "./types";

function makeDiagnostic(
  severity: Diagnostic["severity"],
  code: Diagnostic["code"],
  message: string,
  extra: Partial<Diagnostic> = {},
): Diagnostic {
  return { code, severity, message, ...extra };
}

function contextValues(
  runs: readonly PreparedRun[],
  field: "sampleId" | "atmosphere" | "stage",
): { defined: string[]; missing: string[] } {
  const defined = runs
    .map((run) => run[field]?.trim())
    .filter((value): value is string => value !== undefined && value.length > 0);
  const missing = runs
    .filter((run) => run[field] === undefined || run[field]?.trim().length === 0)
    .map((run) => run.id);
  return { defined, missing };
}

export function evaluateAnalysisEligibility(
  runs: readonly PreparedRun[],
  alphaValues: readonly number[] = DEFAULT_ALPHA_VALUES,
): EligibilityResult {
  const refusals: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];

  const sortedAlphaValues = [...alphaValues].sort((left, right) => left - right);
  const hasEquivalentTargets = sortedAlphaValues.some(
    (alpha, index) =>
      index > 0
      && Math.abs(alpha - (sortedAlphaValues[index - 1] as number))
        <= ALPHA_EQUIVALENCE_TOLERANCE
          * Math.max(1, Math.abs(alpha), Math.abs(sortedAlphaValues[index - 1] as number)),
  );
  const invalidAlphaGrid =
    alphaValues.length === 0 ||
    alphaValues.some((alpha) => !Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) ||
    hasEquivalentTargets;
  if (invalidAlphaGrid) {
    refusals.push(
      makeDiagnostic(
        "refusal",
        "INVALID_ALPHA_GRID",
        "Alpha targets must be distinct beyond the interpolation tolerance, finite, and strictly between 0 and 1.",
      ),
    );
  }

  const runIds = runs.map((run) => run.id);
  if (new Set(runIds).size !== runIds.length) {
    refusals.push(
      makeDiagnostic("refusal", "DUPLICATE_RUN_ID", "Run identifiers must be unique.", {
        runIds,
      }),
    );
  }

  const validRates = runs
    .map((run) => run.heatingRateKPerMinute)
    .filter((rate) => Number.isFinite(rate) && rate > 0);
  const rateGroups = new Map<string, PreparedRun[]>();
  for (const run of runs) {
    if (!Number.isFinite(run.heatingRateKPerMinute) || !(run.heatingRateKPerMinute > 0)) {
      continue;
    }
    const key = heatingRateKey(run.heatingRateKPerMinute);
    const group = rateGroups.get(key);
    if (group) group.push(run);
    else rateGroups.set(key, [run]);
  }
  const distinctRates = rateGroups.size;
  if (distinctRates < validRates.length) {
    const replicateGroups = [...rateGroups.values()].filter((group) => group.length > 1);
    warnings.push(
      makeDiagnostic(
        "warning",
        "DUPLICATE_HEATING_RATE",
        "Replicate heating rates are retained for provenance and aggregated into one equal-weight regression input per heating rate; they do not increase n or residual degrees of freedom.",
        {
          runIds: replicateGroups.flatMap((group) => group.map((run) => run.id)),
          details: {
            rawObservationCount: validRates.length,
            distinctHeatingRates: distinctRates,
            replicateGroupCount: replicateGroups.length,
            maximumReplicatesPerRate: Math.max(
              ...replicateGroups.map((group) => group.length),
            ),
          },
        },
      ),
    );
  }
  if (validRates.length !== runs.length || distinctRates < 3) {
    refusals.push(
      makeDiagnostic(
        "refusal",
        "INSUFFICIENT_DISTINCT_HEATING_RATES",
        "At least three distinct positive heating rates are required.",
        { runIds, details: { distinctHeatingRates: distinctRates } },
      ),
    );
  } else {
    if (distinctRates === 3) {
      warnings.push(
        makeDiagnostic(
          "warning",
          "LIMITED_HEATING_RATES",
          "Only three distinct heating rates are available; uncertainty is weakly constrained.",
          { runIds },
        ),
      );
    }
    const minimumRate = Math.min(...validRates);
    const maximumRate = Math.max(...validRates);
    if (maximumRate / minimumRate < 2) {
      warnings.push(
        makeDiagnostic(
          "warning",
          "NARROW_HEATING_RATE_SPAN",
          "The heating-rate span is less than two-fold; slope uncertainty may be large.",
          { details: { minimumRate, maximumRate } },
        ),
      );
    }
  }

  const contextRules: ReadonlyArray<{
    field: "sampleId" | "atmosphere" | "stage";
    code: "INCONSISTENT_SAMPLE" | "INCONSISTENT_ATMOSPHERE" | "INCONSISTENT_STAGE";
    label: string;
  }> = [
    { field: "sampleId", code: "INCONSISTENT_SAMPLE", label: "sample" },
    { field: "atmosphere", code: "INCONSISTENT_ATMOSPHERE", label: "atmosphere" },
    { field: "stage", code: "INCONSISTENT_STAGE", label: "reaction stage" },
  ];
  for (const rule of contextRules) {
    const values = contextValues(runs, rule.field);
    if (new Set(values.defined).size > 1) {
      refusals.push(
        makeDiagnostic(
          "refusal",
          "INCONSISTENT_CONTEXT",
          `Runs do not share the same ${rule.label}.`,
          { runIds, details: { field: rule.field, reasonCode: rule.code } },
        ),
      );
    } else if (values.missing.length > 0) {
      if (rule.field === "stage") {
        refusals.push(
          makeDiagnostic(
            "refusal",
            "AMBIGUOUS_STAGE",
            "Reaction stage metadata is missing for one or more runs; one common physical stage must be assigned before analysis.",
            {
              runIds: values.missing,
              details: {
                field: rule.field,
                missingStageCount: values.missing.length,
                runCount: runs.length,
              },
            },
          ),
        );
      } else {
        warnings.push(
          makeDiagnostic(
            "warning",
            "MISSING_CONTEXT_METADATA",
            `${rule.label} metadata is missing for one or more runs.`,
            { runIds: values.missing, details: { field: rule.field } },
          ),
        );
      }
    }
  }

  let commonAlphaRange: readonly [number, number] | undefined;
  if (runs.length > 0 && runs.every((run) => run.points.length > 0)) {
    const lower = Math.max(
      ...runs.map((run) => (run.points[0] as PreparedRun["points"][number]).alpha),
    );
    const upper = Math.min(
      ...runs.map(
        (run) => (run.points[run.points.length - 1] as PreparedRun["points"][number]).alpha,
      ),
    );
    if (!(upper > lower)) {
      refusals.push(
        makeDiagnostic(
          "refusal",
          "NO_COMMON_ALPHA_RANGE",
          "Runs do not share a non-zero conversion interval.",
          { runIds },
        ),
      );
    } else {
      commonAlphaRange = [lower, upper];
      if (!invalidAlphaGrid) {
        const accepted = alphaValues.filter((alpha) => alpha >= lower && alpha <= upper);
        const rejected = alphaValues.filter((alpha) => alpha < lower || alpha > upper);
        for (const alpha of rejected) {
          warnings.push(
            makeDiagnostic(
              "warning",
              "TARGET_ALPHA_OUTSIDE_COMMON_RANGE",
              `Alpha ${alpha} is outside the common conversion range and will not be calculated.`,
              { alpha, details: { commonLowerAlpha: lower, commonUpperAlpha: upper } },
            ),
          );
        }
        if (accepted.length === 0) {
          refusals.push(
            makeDiagnostic(
              "refusal",
              "INVALID_ALPHA_GRID",
              "No requested alpha target lies inside the common conversion range.",
              { details: { commonLowerAlpha: lower, commonUpperAlpha: upper } },
            ),
          );
        }
      }
    }
  } else {
    refusals.push(
      makeDiagnostic(
        "refusal",
        "NO_COMMON_ALPHA_RANGE",
        "Prepared runs are missing conversion points.",
        { runIds },
      ),
    );
  }

  return {
    eligible: refusals.length === 0,
    ...(commonAlphaRange === undefined ? {} : { commonAlphaRange }),
    distinctHeatingRates: distinctRates,
    refusals,
    warnings,
  };
}
