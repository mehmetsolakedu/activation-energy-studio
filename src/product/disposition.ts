import type {
  ActivationEnergyAnalysis,
  AlphaActivationEnergyEstimate,
  AlphaMethodResult,
  CalculationStatus,
  Diagnostic,
  DiagnosticCode,
  IsoConversionalMethod,
  KissingerResult,
  MethodName,
} from '../core/types';

export const SCIENTIFIC_DISPOSITIONS = Object.freeze([
  'REPORTABLE',
  'REPORTABLE_WITH_CAUTION',
  'CALCULATED_UNRELIABLE',
  'CALCULATION_REJECTED',
] as const);

export type ScientificDisposition = (typeof SCIENTIFIC_DISPOSITIONS)[number];

export const SCIENTIFIC_DISPOSITION_LABELS: Readonly<
  Record<ScientificDisposition, string>
> = Object.freeze({
  REPORTABLE: 'REPORTABLE',
  REPORTABLE_WITH_CAUTION: 'REPORTABLE WITH CAUTION',
  CALCULATED_UNRELIABLE: 'CALCULATED BUT UNRELIABLE',
  CALCULATION_REJECTED: 'CALCULATION REJECTED',
});

export function scientificDispositionLabel(
  disposition: ScientificDisposition,
): string {
  return SCIENTIFIC_DISPOSITION_LABELS[disposition];
}

export interface ScientificDispositionReason {
  readonly code: string;
  readonly message: string;
  readonly severity: 'info' | 'caution' | 'unreliable' | 'rejection';
}

export interface ScientificResultDisposition {
  readonly resultId: string;
  readonly method: MethodName;
  readonly resultType: 'isoconversional' | 'peak';
  readonly alpha: number | null;
  /** The unchanged calculation-core completion status. */
  readonly computationStatus: CalculationStatus;
  readonly disposition: ScientificDisposition;
  readonly activationEnergyKJPerMol: number | null;
  readonly r2: number | null;
  readonly reasons: readonly ScientificDispositionReason[];
  readonly nextExperimentHints: readonly string[];
}

export interface ReportableAlphaSegment {
  readonly startAlpha: number;
  readonly endAlpha: number;
  /** Exact configured alpha targets in this segment; never inferred across a rejected gap. */
  readonly alphaValues: readonly number[];
  readonly disposition: 'REPORTABLE' | 'REPORTABLE_WITH_CAUTION';
}

export interface ScientificMethodDisposition {
  readonly method: MethodName;
  readonly resultType: 'isoconversional' | 'peak';
  /** The unchanged calculation-core completion status. */
  readonly computationStatus: CalculationStatus;
  readonly disposition: ScientificDisposition;
  readonly results: readonly ScientificResultDisposition[];
  readonly reportableAlphaSegments: readonly ReportableAlphaSegment[];
  readonly meanEaRecommended: boolean;
  readonly meanEaReason: string;
  readonly reasons: readonly ScientificDispositionReason[];
  readonly nextExperimentHints: readonly string[];
}

export interface ScientificDispositionAssessment {
  readonly minimumReportableR2: number;
  readonly overallDisposition: ScientificDisposition;
  readonly methods: readonly ScientificMethodDisposition[];
  readonly kissinger?: ScientificMethodDisposition;
  readonly reasons: readonly ScientificDispositionReason[];
  readonly nextExperimentHints: readonly string[];
}

export function publicationDecisionNote(
  assessment: ScientificDispositionAssessment,
): string {
  const methodLines = [
    ...assessment.methods,
    ...(assessment.kissinger ? [assessment.kissinger] : []),
  ].map((method) => {
    const segments = method.reportableAlphaSegments
      .map((segment) => (
        segment.startAlpha === segment.endAlpha
          ? `alpha=${segment.startAlpha.toFixed(2)}`
          : `alpha=${segment.startAlpha.toFixed(2)}-${segment.endAlpha.toFixed(2)}`
      ))
      .join(', ');
    return `${method.method}: ${scientificDispositionLabel(method.disposition)}${
      segments ? ` (${segments})` : ''
    }; mean Ea recommended=${method.meanEaRecommended ? 'yes' : 'no'} (${method.meanEaReason})`;
  });
  const next = assessment.nextExperimentHints.length > 0
    ? ` Next experiment: ${assessment.nextExperimentHints.join(' ')}`
    : '';
  return `Publication-preview decision: ${scientificDispositionLabel(assessment.overallDisposition)}. ${methodLines.join(' | ')}.${next}`;
}

export interface ScientificDispositionOptions {
  /**
   * Configured alpha grid. Supplying it allows missing/rejected targets to break
   * reportable ranges explicitly instead of being silently bridged.
   */
  readonly alphaGrid?: readonly number[];
  readonly minimumReportableR2?: number;
}

const DEFAULT_MINIMUM_REPORTABLE_R2 = 0.98;
const ALPHA_MATCH_TOLERANCE = 1e-12;

const UNRELIABLE_WARNING_CODES = new Set<DiagnosticCode>([
  'LOW_R2',
  'NONPOSITIVE_APPARENT_EA',
]);

const REASON_MESSAGES: Partial<Record<DiagnosticCode, string>> = {
  LOW_R2: 'The regression R² is below the configured reportability threshold.',
  NONPOSITIVE_APPARENT_EA: 'The calculated apparent activation energy is not positive.',
  LIMITED_HEATING_RATES: 'Only three distinct heating rates constrain this result.',
  NARROW_HEATING_RATE_SPAN: 'The heating-rate span is narrow, so slope leverage is limited.',
  DUPLICATE_HEATING_RATE: 'Same-rate replicates were aggregated and do not increase regression degrees of freedom.',
  NUMERICAL_DERIVATIVE: 'Friedman uses an unsmoothed numerical derivative.',
  FRIEDMAN_NON_POSITIVE_RATE: 'One or more derivative observations were excluded before the Friedman fit.',
  FRIEDMAN_DERIVATIVE_UNAVAILABLE: 'Too few positive finite derivative observations remain for Friedman.',
  MULTISTEP_EA_VARIATION: 'Ea(alpha) varies strongly; a single mean would hide likely process complexity.',
  POSSIBLE_MULTISTEP_EA_VARIATION: 'Ea(alpha) variation warrants checking for multiple stages.',
  KISSINGER_COMPLEXITY_UNDERPOWERED: 'The Kissinger design is underpowered for detecting nonlinearity.',
  OVERLAPPING_PEAKS: 'Peak overlap prevents a defensible same-stage Kissinger result.',
  AMBIGUOUS_STAGE: 'One common physical reaction stage has not been established.',
  INCONSISTENT_CONTEXT: 'The runs do not share one consistent experimental context.',
  INSUFFICIENT_DISTINCT_HEATING_RATES: 'At least three distinct positive heating rates are required.',
  TOO_FEW_KISSINGER_PEAKS: 'At least three distinct same-stage beta-Tp observations are required.',
  NO_COMMON_ALPHA_RANGE: 'The runs do not share a usable conversion interval.',
  TARGET_ALPHA_OUTSIDE_COMMON_RANGE: 'This alpha target is outside the all-run common conversion range.',
  AMBIGUOUS_ALPHA_CROSSING: 'This alpha target does not have a unique temperature crossing.',
  REGRESSION_FAILED: 'The regression could not produce a finite defensible result.',
  INVALID_ALPHA_GRID: 'The configured alpha grid is invalid for calculation.',
};

const NEXT_EXPERIMENT_HINTS: Partial<Record<DiagnosticCode, string>> = {
  LOW_R2: 'Inspect raw curves, stage bounds and influential runs; add independent heating rates before reporting.',
  NONPOSITIVE_APPARENT_EA: 'Repeat the experiment and verify stage identity, temperature mapping and heating-rate metadata.',
  LIMITED_HEATING_RATES: 'Add at least one independent heating rate to improve uncertainty estimation.',
  NARROW_HEATING_RATE_SPAN: 'Add heating rates outside the current range to increase regression leverage.',
  NUMERICAL_DERIVATIVE: 'Provide validated instrument DTG/dAlpha/dt or higher-resolution time data and compare integral methods.',
  FRIEDMAN_NON_POSITIVE_RATE: 'Provide positive finite derivative data at this alpha for every heating rate.',
  FRIEDMAN_DERIVATIVE_UNAVAILABLE: 'Acquire positive finite derivative observations at three or more distinct heating rates.',
  MULTISTEP_EA_VARIATION: 'Report Ea(alpha), review stage bounds and do not collapse the profile to one mean.',
  POSSIBLE_MULTISTEP_EA_VARIATION: 'Inspect DTG shoulders and repeat the analysis with defensible stage bounds.',
  KISSINGER_COMPLEXITY_UNDERPOWERED: 'Use at least five distinct heating rates spanning approximately five-fold or more.',
  OVERLAPPING_PEAKS: 'Resolve the same physical peak independently at each heating rate before using Kissinger.',
  AMBIGUOUS_STAGE: 'Confirm one common physical stage across all runs before recalculating.',
  INCONSISTENT_CONTEXT: 'Separate samples, atmospheres or reaction stages into distinct analyses.',
  INSUFFICIENT_DISTINCT_HEATING_RATES: 'Acquire data at enough additional rates to reach at least three distinct positive heating rates.',
  TOO_FEW_KISSINGER_PEAKS: 'Acquire at least three unambiguous same-stage beta-Tp pairs.',
  NO_COMMON_ALPHA_RANGE: 'Acquire runs that cover a shared conversion interval or revise justified stage bounds.',
  TARGET_ALPHA_OUTSIDE_COMMON_RANGE: 'Restrict reporting to the common alpha interval or acquire broader runs.',
  AMBIGUOUS_ALPHA_CROSSING: 'Resolve the plateau or select a defensible alpha target with one crossing.',
  REGRESSION_FAILED: 'Check transformed inputs and acquire more independent, non-degenerate observations.',
  INVALID_ALPHA_GRID: 'Choose unique finite alpha targets strictly between zero and one.',
};

function validateOptions(options: ScientificDispositionOptions): {
  alphaGrid: number[] | undefined;
  minimumReportableR2: number;
} {
  const minimumReportableR2 =
    options.minimumReportableR2 ?? DEFAULT_MINIMUM_REPORTABLE_R2;
  if (
    !Number.isFinite(minimumReportableR2)
    || minimumReportableR2 < 0
    || minimumReportableR2 > 1
  ) {
    throw new RangeError('minimumReportableR2 must be a finite number from 0 to 1.');
  }

  if (options.alphaGrid === undefined) {
    return { alphaGrid: undefined, minimumReportableR2 };
  }
  const alphaGrid = [...options.alphaGrid];
  if (
    alphaGrid.length === 0
    || alphaGrid.some((alpha) => !Number.isFinite(alpha) || alpha <= 0 || alpha >= 1)
    || new Set(alphaGrid).size !== alphaGrid.length
  ) {
    throw new RangeError('alphaGrid must contain unique finite values strictly between 0 and 1.');
  }
  alphaGrid.sort((left, right) => left - right);
  return { alphaGrid, minimumReportableR2 };
}

function sameAlpha(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= ALPHA_MATCH_TOLERANCE * scale;
}

function diagnosticApplies(
  diagnostic: Diagnostic,
  method: MethodName,
  alpha: number | null,
): boolean {
  if (diagnostic.method !== undefined && diagnostic.method !== method) return false;
  if (diagnostic.alpha === undefined) return true;
  return alpha !== null && sameAlpha(diagnostic.alpha, alpha);
}

function uniqueDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const unique = new Map<string, Diagnostic>();
  for (const diagnostic of diagnostics) {
    const key = JSON.stringify([
      diagnostic.severity,
      diagnostic.code,
      diagnostic.method ?? null,
      diagnostic.alpha ?? null,
      diagnostic.message,
      diagnostic.runIds ?? [],
    ]);
    if (!unique.has(key)) unique.set(key, diagnostic);
  }
  return [...unique.values()];
}

function conciseFallback(message: string): string {
  const firstSentence = message.trim().split(/(?<=[.!?])\s/u)[0] ?? message.trim();
  return firstSentence.length <= 180
    ? firstSentence
    : `${firstSentence.slice(0, 177).trimEnd()}...`;
}

function reasonFromDiagnostic(
  diagnostic: Diagnostic,
  hasNumericResult: boolean,
): ScientificDispositionReason {
  return {
    code: diagnostic.code,
    message: REASON_MESSAGES[diagnostic.code] ?? conciseFallback(diagnostic.message),
    severity:
      diagnostic.severity === 'refusal'
        ? hasNumericResult
          ? 'unreliable'
          : 'rejection'
        : UNRELIABLE_WARNING_CODES.has(diagnostic.code)
          ? 'unreliable'
          : 'caution',
  };
}

function uniqueReasons(
  reasons: readonly ScientificDispositionReason[],
): ScientificDispositionReason[] {
  const unique = new Map<string, ScientificDispositionReason>();
  for (const reason of reasons) {
    const key = `${reason.code}|${reason.message}|${reason.severity}`;
    if (!unique.has(key)) unique.set(key, reason);
  }
  return [...unique.values()];
}

function hintsForReasons(reasons: readonly ScientificDispositionReason[]): string[] {
  const hints = new Set<string>();
  for (const reason of reasons) {
    const hint = NEXT_EXPERIMENT_HINTS[reason.code as DiagnosticCode];
    if (hint) hints.add(hint);
  }
  if (hints.size === 0 && reasons.some((reason) => reason.severity !== 'info')) {
    hints.add('Review the flagged evidence and repeat the analysis after correcting the input or experiment.');
  }
  return [...hints];
}

function resultId(method: MethodName, alpha: number | null): string {
  return alpha === null ? `${method}:peak` : `${method}:alpha:${alpha.toPrecision(15)}`;
}

interface NumericResultInput {
  readonly method: MethodName;
  readonly resultType: 'isoconversional' | 'peak';
  readonly alpha: number | null;
  readonly computationStatus: CalculationStatus;
  readonly activationEnergyKJPerMol: number | undefined;
  readonly r2: number | undefined;
  readonly diagnostics: readonly Diagnostic[];
  readonly minimumReportableR2: number;
}

function classifyNumericResult(input: NumericResultInput): ScientificResultDisposition {
  const hasNumericResult = input.activationEnergyKJPerMol !== undefined;
  const scopedDiagnostics = uniqueDiagnostics(
    input.diagnostics.filter((diagnostic) =>
      diagnosticApplies(diagnostic, input.method, input.alpha)),
  );
  const reasons = scopedDiagnostics.map((diagnostic) =>
    reasonFromDiagnostic(diagnostic, hasNumericResult));

  let disposition: ScientificDisposition;
  if (!hasNumericResult) {
    disposition = 'CALCULATION_REJECTED';
    if (reasons.length === 0) {
      reasons.push({
        code: 'NO_NUMERIC_RESULT',
        message: 'No numeric result was produced for this requested target.',
        severity: 'rejection',
      });
    }
  } else if (
    !Number.isFinite(input.activationEnergyKJPerMol)
    || !(input.activationEnergyKJPerMol > 0)
  ) {
    disposition = 'CALCULATED_UNRELIABLE';
    if (!reasons.some((reason) => reason.code === 'NONPOSITIVE_APPARENT_EA')) {
      reasons.unshift({
        code: Number.isFinite(input.activationEnergyKJPerMol)
          ? 'NONPOSITIVE_APPARENT_EA'
          : 'NONFINITE_ACTIVATION_ENERGY',
        message: Number.isFinite(input.activationEnergyKJPerMol)
          ? 'The calculated apparent activation energy is not positive.'
          : 'The calculated apparent activation energy is not finite.',
        severity: 'unreliable',
      });
    }
  } else if (!Number.isFinite(input.r2)) {
    disposition = 'CALCULATED_UNRELIABLE';
    reasons.unshift({
      code: 'R2_UNAVAILABLE',
      message: 'A finite regression R² is unavailable for the calculated value.',
      severity: 'unreliable',
    });
  } else if ((input.r2 as number) < input.minimumReportableR2) {
    disposition = 'CALCULATED_UNRELIABLE';
    if (!reasons.some((reason) => reason.code === 'LOW_R2')) {
      reasons.unshift({
        code: 'R2_BELOW_REPORTABILITY_THRESHOLD',
        message:
          `Regression R² ${(input.r2 as number).toFixed(5)} is below `
          + `${input.minimumReportableR2.toFixed(5)}.`,
        severity: 'unreliable',
      });
    }
  } else if (
    reasons.some((reason) =>
      reason.severity === 'unreliable' || reason.severity === 'rejection')
  ) {
    disposition = 'CALCULATED_UNRELIABLE';
  } else if (reasons.some((reason) => reason.severity === 'caution')) {
    disposition = 'REPORTABLE_WITH_CAUTION';
  } else {
    disposition = 'REPORTABLE';
    reasons.push({
      code: 'FINITE_POSITIVE_RESULT_WITH_ACCEPTABLE_R2',
      message: 'The result is finite, positive and meets the configured R² threshold.',
      severity: 'info',
    });
  }

  const unique = uniqueReasons(reasons);
  return {
    resultId: resultId(input.method, input.alpha),
    method: input.method,
    resultType: input.resultType,
    alpha: input.alpha,
    computationStatus: input.computationStatus,
    disposition,
    activationEnergyKJPerMol:
      input.activationEnergyKJPerMol === undefined ? null : input.activationEnergyKJPerMol,
    r2: input.r2 === undefined ? null : input.r2,
    reasons: unique,
    nextExperimentHints: hintsForReasons(unique),
  };
}

function diagnosticsForMethod(
  analysis: ActivationEnergyAnalysis,
  result: AlphaMethodResult | KissingerResult,
): Diagnostic[] {
  return uniqueDiagnostics([
    ...analysis.refusals,
    ...analysis.warnings,
    ...result.refusals,
    ...result.warnings,
  ]);
}

function inferredAlphaGrid(
  method: AlphaMethodResult,
  diagnostics: readonly Diagnostic[],
): number[] {
  const alphas = new Set<number>(method.estimates.map((estimate) => estimate.alpha));
  for (const diagnostic of diagnostics) {
    if (
      diagnostic.alpha !== undefined
      && (diagnostic.method === undefined || diagnostic.method === method.method)
    ) {
      alphas.add(diagnostic.alpha);
    }
  }
  return [...alphas].sort((left, right) => left - right);
}

function estimateAtAlpha(
  estimates: readonly AlphaActivationEnergyEstimate[],
  alpha: number,
): AlphaActivationEnergyEstimate | undefined {
  return estimates.find((estimate) => sameAlpha(estimate.alpha, alpha));
}

function segmentDisposition(
  values: readonly ScientificResultDisposition[],
): ReportableAlphaSegment['disposition'] {
  return values.some((value) => value.disposition === 'REPORTABLE_WITH_CAUTION')
    ? 'REPORTABLE_WITH_CAUTION'
    : 'REPORTABLE';
}

function reportableSegments(
  orderedResults: readonly ScientificResultDisposition[],
): ReportableAlphaSegment[] {
  const segments: ScientificResultDisposition[][] = [];
  for (const result of orderedResults) {
    const isReportable =
      result.disposition === 'REPORTABLE'
      || result.disposition === 'REPORTABLE_WITH_CAUTION';
    if (!isReportable || result.alpha === null) continue;

    const previousResult = orderedResults[orderedResults.indexOf(result) - 1];
    const canExtend =
      segments.length > 0
      && previousResult !== undefined
      && previousResult.alpha !== null
      && (
        previousResult.disposition === 'REPORTABLE'
        || previousResult.disposition === 'REPORTABLE_WITH_CAUTION'
      );
    if (canExtend) {
      (segments[segments.length - 1] as ScientificResultDisposition[]).push(result);
    } else {
      segments.push([result]);
    }
  }

  return segments.map((segment) => {
    const alphaValues = segment.map((result) => result.alpha as number);
    return {
      startAlpha: alphaValues[0] as number,
      endAlpha: alphaValues[alphaValues.length - 1] as number,
      alphaValues,
      disposition: segmentDisposition(segment),
    };
  });
}

function methodDisposition(
  results: readonly ScientificResultDisposition[],
): ScientificDisposition {
  const calculated = results.filter((result) => result.activationEnergyKJPerMol !== null);
  if (calculated.length === 0) return 'CALCULATION_REJECTED';
  if (calculated.some((result) => result.disposition === 'CALCULATED_UNRELIABLE')) {
    return 'CALCULATED_UNRELIABLE';
  }
  if (
    calculated.some((result) => result.disposition === 'REPORTABLE_WITH_CAUTION')
    || results.some((result) => result.disposition === 'CALCULATION_REJECTED')
  ) {
    return 'REPORTABLE_WITH_CAUTION';
  }
  return 'REPORTABLE';
}

function meanDecision(
  method: IsoConversionalMethod,
  results: readonly ScientificResultDisposition[],
  diagnostics: readonly Diagnostic[],
): Pick<ScientificMethodDisposition, 'meanEaRecommended' | 'meanEaReason'> {
  if (
    diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'MULTISTEP_EA_VARIATION'
        && diagnosticApplies(diagnostic, method, null),
    )
  ) {
    return {
      meanEaRecommended: false,
      meanEaReason: 'Strong Ea(alpha) variation makes a single mean scientifically misleading.',
    };
  }
  if (results.length < 2) {
    return {
      meanEaRecommended: false,
      meanEaReason: 'At least two calculated alpha results are needed for a method-level mean.',
    };
  }
  if (
    results.some(
      (result) =>
        result.disposition === 'CALCULATED_UNRELIABLE'
        || result.disposition === 'CALCULATION_REJECTED',
    )
  ) {
    return {
      meanEaRecommended: false,
      meanEaReason: 'A mean is not recommended while alpha results are unreliable or rejected.',
    };
  }
  return {
    meanEaRecommended: true,
    meanEaReason: 'A method-specific mean is available but remains secondary to the Ea(alpha) profile.',
  };
}

function summarizeAlphaMethod(
  analysis: ActivationEnergyAnalysis,
  method: AlphaMethodResult,
  configuredAlphaGrid: readonly number[] | undefined,
  minimumReportableR2: number,
): ScientificMethodDisposition {
  const diagnostics = diagnosticsForMethod(analysis, method);
  const alphaGrid = configuredAlphaGrid ?? inferredAlphaGrid(method, diagnostics);
  const results = alphaGrid.map((alpha) => {
    const estimate = estimateAtAlpha(method.estimates, alpha);
    return classifyNumericResult({
      method: method.method,
      resultType: 'isoconversional',
      alpha,
      computationStatus: method.status,
      activationEnergyKJPerMol: estimate?.activationEnergyKJPerMol,
      r2: estimate?.regression.r2,
      diagnostics,
      minimumReportableR2,
    });
  });
  const mean = meanDecision(method.method, results, diagnostics);
  const reasons = uniqueReasons(results.flatMap((result) => result.reasons));
  return {
    method: method.method,
    resultType: 'isoconversional',
    computationStatus: method.status,
    disposition: methodDisposition(results),
    results,
    reportableAlphaSegments: reportableSegments(results),
    ...mean,
    reasons,
    nextExperimentHints: [...new Set(results.flatMap((result) => result.nextExperimentHints))],
  };
}

function summarizeKissinger(
  analysis: ActivationEnergyAnalysis,
  kissinger: KissingerResult,
  minimumReportableR2: number,
): ScientificMethodDisposition {
  const diagnostics = diagnosticsForMethod(analysis, kissinger);
  const result = classifyNumericResult({
    method: 'KISSINGER',
    resultType: 'peak',
    alpha: null,
    computationStatus: kissinger.status,
    activationEnergyKJPerMol: kissinger.activationEnergyKJPerMol,
    r2: kissinger.regression?.r2,
    diagnostics,
    minimumReportableR2,
  });
  return {
    method: 'KISSINGER',
    resultType: 'peak',
    computationStatus: kissinger.status,
    disposition: result.disposition,
    results: [result],
    reportableAlphaSegments: [],
    meanEaRecommended: false,
    meanEaReason: 'Kissinger is one separate peak result, not an Ea(alpha) profile to average.',
    reasons: result.reasons,
    nextExperimentHints: result.nextExperimentHints,
  };
}

function overallDisposition(
  summaries: readonly ScientificMethodDisposition[],
): ScientificDisposition {
  const calculated = summaries.filter(
    (summary) => summary.disposition !== 'CALCULATION_REJECTED',
  );
  if (calculated.length === 0) return 'CALCULATION_REJECTED';
  if (calculated.some((summary) => summary.disposition === 'CALCULATED_UNRELIABLE')) {
    return 'CALCULATED_UNRELIABLE';
  }
  if (
    calculated.some((summary) => summary.disposition === 'REPORTABLE_WITH_CAUTION')
    || summaries.some((summary) => summary.disposition === 'CALCULATION_REJECTED')
  ) {
    return 'REPORTABLE_WITH_CAUTION';
  }
  return 'REPORTABLE';
}

/**
 * Adds publication-oriented scientific dispositions around the unchanged
 * calculation-core result. It never mutates or relabels core completion status.
 */
export function assessScientificDisposition(
  analysis: ActivationEnergyAnalysis,
  options: ScientificDispositionOptions = {},
): ScientificDispositionAssessment {
  const { alphaGrid, minimumReportableR2 } = validateOptions(options);
  const methods = analysis.methods.map((method) =>
    summarizeAlphaMethod(analysis, method, alphaGrid, minimumReportableR2));
  const kissinger =
    analysis.kissinger === undefined
      ? undefined
      : summarizeKissinger(analysis, analysis.kissinger, minimumReportableR2);
  const summaries = [...methods, ...(kissinger === undefined ? [] : [kissinger])];
  const reasons = uniqueReasons(summaries.flatMap((summary) => summary.reasons));
  return {
    minimumReportableR2,
    overallDisposition: overallDisposition(summaries),
    methods,
    ...(kissinger === undefined ? {} : { kissinger }),
    reasons,
    nextExperimentHints: [
      ...new Set(summaries.flatMap((summary) => summary.nextExperimentHints)),
    ],
  };
}
