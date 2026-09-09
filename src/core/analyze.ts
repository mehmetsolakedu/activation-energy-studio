import { DEFAULT_ALPHA_VALUES, GAS_CONSTANT_J_PER_MOL_K } from "./constants";
import { evaluateAnalysisEligibility } from "./eligibility";
import { heatingRateKey } from "./heatingRates";
import {
  calculateFriedman,
  calculateFWO,
  calculateKAS,
  calculateKissinger,
  calculateStarink,
} from "./methods";
import { prepareThermalRuns } from "./preprocessing";
import type {
  ActivationEnergyAnalysis,
  AlphaMethodResult,
  AnalysisOptions,
  Diagnostic,
  EligibilityResult,
  IsoConversionalMethod,
  KissingerPeak,
  KissingerResult,
  ThermalRun,
} from "./types";

const DEFAULT_METHODS = Object.freeze([
  "FWO",
  "KAS",
  "STARINK",
  "FRIEDMAN",
] as const satisfies readonly IsoConversionalMethod[]);

function deduplicateDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const unique: Diagnostic[] = [];
  for (const item of diagnostics) {
    const key = JSON.stringify([
      item.severity,
      item.code,
      item.method,
      item.alpha,
      item.message,
      item.runIds,
    ]);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  return unique;
}

function missingPeakResult(runIds: readonly string[]): KissingerResult {
  return {
    method: "KISSINGER",
    resultType: "peak",
    alpha: null,
    formulaId: "kissinger_peak_ln_v1",
    status: "refused",
    observations: [],
    refusals: [
      {
        code: "KISSINGER_PEAK_MISSING",
        severity: "refusal",
        method: "KISSINGER",
        runIds,
        message:
          "Kissinger is separate from conversion-based analyses and needs one explicit peak temperature for every run.",
      },
    ],
    warnings: [],
  };
}

function calculateSelectedMethod(
  method: IsoConversionalMethod,
  runs: ActivationEnergyAnalysis["preparedRuns"],
  alphaValues: readonly number[],
  options: AnalysisOptions,
): AlphaMethodResult {
  const methodOptions = { minR2Warning: options.minR2Warning };
  switch (method) {
    case "FWO":
      return calculateFWO(runs, alphaValues, methodOptions);
    case "KAS":
      return calculateKAS(runs, alphaValues, methodOptions);
    case "STARINK":
      return calculateStarink(runs, alphaValues, methodOptions);
    case "FRIEDMAN":
      return calculateFriedman(runs, alphaValues, methodOptions);
  }
}

/** End-to-end scientific core entry point. No I/O or UI state is used. */
export function analyzeActivationEnergy(
  inputRuns: readonly ThermalRun[],
  options: AnalysisOptions = {},
): ActivationEnergyAnalysis {
  const alphaValues = options.alphaValues ?? DEFAULT_ALPHA_VALUES;
  const selectedMethods = [...new Set(options.methods ?? DEFAULT_METHODS)];
  const curveAnalysisRequested = selectedMethods.length > 0;
  const preparation = prepareThermalRuns(inputRuns);
  const eligibility: EligibilityResult = curveAnalysisRequested
    ? evaluateAnalysisEligibility(preparation.runs, alphaValues)
    : {
        eligible: true,
        distinctHeatingRates: new Set(
          (options.kissingerPeaks ?? []).map((peak) =>
            heatingRateKey(peak.heatingRateKPerMinute),
          ),
        ).size,
        refusals: [],
        warnings: [],
      };
  const curveAnalysisBlocked =
    curveAnalysisRequested
    && (preparation.refusals.length > 0 || !eligibility.eligible);
  const methods = curveAnalysisBlocked
    ? []
    : selectedMethods.map((method) =>
        calculateSelectedMethod(method, preparation.runs, alphaValues, options),
      );

  let kissinger: KissingerResult | undefined;
  if (options.includeKissinger !== false) {
    if (options.kissingerPeaks !== undefined) {
      kissinger = calculateKissinger(options.kissingerPeaks, {
        minR2Warning: options.minR2Warning,
      });
    } else if (!curveAnalysisBlocked) {
      const missingPeakRunIds = preparation.runs
        .filter((run) => run.peakTemperatureK === undefined)
        .map((run) => run.id);
      if (missingPeakRunIds.length > 0) {
        kissinger = missingPeakResult(missingPeakRunIds);
      } else {
        const peaks: KissingerPeak[] = preparation.runs.map((run) => ({
          runId: run.id,
          heatingRateKPerMinute: run.heatingRateKPerMinute,
          peakTemperatureK: run.peakTemperatureK as number,
          ...(run.peakAmbiguous === undefined ? {} : { ambiguous: run.peakAmbiguous }),
          ...(run.peakResolved === undefined ? {} : { peakResolved: run.peakResolved }),
          ...(run.peakQuality === undefined ? {} : { peakQuality: run.peakQuality }),
          ...(run.peakSourceSignal === undefined
            ? {}
            : { sourceSignal: run.peakSourceSignal }),
          ...(run.peakAnalystConfirmed === undefined
            ? {}
            : { analystConfirmed: run.peakAnalystConfirmed }),
          ...(run.stage === undefined ? {} : { stage: run.stage }),
        }));
        kissinger = calculateKissinger(peaks, { minR2Warning: options.minR2Warning });
      }
    }
  }

  const refusals = deduplicateDiagnostics([
    ...(curveAnalysisRequested ? preparation.refusals : []),
    ...(curveAnalysisRequested ? eligibility.refusals : []),
    ...methods.flatMap((result) => result.refusals),
    ...(kissinger?.refusals ?? []),
  ]);
  const warnings = deduplicateDiagnostics([
    ...(curveAnalysisRequested ? preparation.warnings : []),
    ...(curveAnalysisRequested ? eligibility.warnings : []),
    ...methods.flatMap((result) => result.warnings),
    ...(kissinger?.warnings ?? []),
  ]);
  const resultStatuses = [
    ...(curveAnalysisBlocked ? (["refused"] as const) : []),
    ...methods.map((result) => result.status),
    ...(kissinger === undefined ? [] : [kissinger.status]),
  ];
  const successfulCount = resultStatuses.filter((status) => status !== "refused").length;
  const status =
    successfulCount === 0
      ? "refused"
      : resultStatuses.some((result) => result !== "success") || refusals.length > 0
        ? "partial"
        : "success";

  return {
    status,
    preparedRuns: preparation.runs,
    eligibility,
    methods,
    ...(kissinger === undefined ? {} : { kissinger }),
    refusals,
    warnings,
    constants: { gasConstantJPerMolK: GAS_CONSTANT_J_PER_MOL_K },
  };
}
