import type {
  ActivationEnergyAnalysis,
  CalculationStatus,
  Diagnostic,
  MethodName,
  MethodObservation,
  RegressionInputAggregation,
  RegressionResult,
} from '../core/types';
import { heatingRateKey } from '../core/heatingRates';
import type {
  BatchIngestionResult,
  BetaTpRow,
  ColumnMapping,
  ColumnRole,
  IngestionOptions,
  IngestionSource,
  NormalizedThermalRecord,
  ProvenanceColumnMapping,
  RecordProvenance,
  TAlphaBetaRow,
  WideSeriesDefinition,
  WideSeriesIngestionAudit,
} from '../io/types';
import {
  resolveStageWindowRecords,
  type StageBoundaryResolution,
  type StageWindow,
} from '../integration';
import {
  assessScientificDisposition,
  type ScientificDisposition,
} from '../product/disposition';

export const REPORT_SCHEMA_VERSION = 'activation-energy-studio/project-report/v7' as const;
export const CORE_MATH_VERSION = 'activation-energy-core/v3' as const;
export const FORMULA_SET_VERSION = 'activation-energy-formulas/v1' as const;
export const REPORT_VOLATILE_FIELDS = ['generatedAt'] as const;

export const APPARENT_EA_CLAIM_BOUNDARY =
  'Reported values are apparent activation energies conditional on the sample, process/stage, atmosphere, method, alpha range, input data, and preprocessing choices. They are not universal material constants and do not prove a single-step mechanism.';

export const REGRESSION_CI_CLAIM_BOUNDARY =
  'Regression-only uncertainty: the 95% confidence interval covers post-aggregation regression scatter only; it does not include within-heating-rate replicate variability, calibration uncertainty, anchor uncertainty, baseline uncertainty, or derivative-method uncertainty.';

export interface ReportContextLabels {
  sample: string;
  process: string;
  stage: string;
  atmosphere: string;
  methods: MethodName[];
}

export interface ReportAnalysisConfiguration {
  alphaGrid?: readonly number[];
  methods?: readonly MethodName[];
  includeKissinger?: boolean;
  minR2Warning?: number;
}

export interface ReportGenerationInput {
  ingestion?: BatchIngestionResult;
  ingestionOptions?: IngestionOptions | readonly IngestionOptions[];
  analysisConfiguration?: ReportAnalysisConfiguration;
  stageWindow?: StageWindow;
  /**
   * Ordered, hash-bound file identities supplied by the report builder.
   * The array order must match `ingestion.files`; filenames are display labels
   * and are deliberately not used as unique keys.
   */
  sourceFiles?: readonly ReportSourceFileIdentity[];
}

export interface ReportSourceFileIdentity {
  readonly sourceFileId: string;
  readonly name: string;
  readonly sha256: string;
}

export interface ReportColumnMapping {
  role: ColumnMapping['role'];
  sourceColumnIndex: number;
  sourceHeader: string;
  sourceUnit: string | null;
  canonicalUnit: string | null;
  conversion: string;
  confidence: ColumnMapping['confidence'];
}

export interface ReportInputTable {
  sourceFileId: string | null;
  fileName: string;
  fileType: string;
  sheetName: string | null;
  delimiter: string | null;
  decimalSeparator: string | null;
  textEncoding: NonNullable<IngestionSource['textEncoding']> | null;
  /** Zero-based source row used as the table header. */
  headerRow: number;
  tableKind: string;
  ignoredRoles?: ColumnRole[];
  mappings: ReportColumnMapping[];
}

export interface ReportMassNormalization {
  runId: string;
  alphaSource: 'direct-alpha' | 'mass-normalized' | 'unknown';
  sourceQuantity: 'alpha' | 'massMg' | 'massPercent' | 'unknown';
  initialValue: number | null;
  finalValue: number | null;
  stageWindowCelsius: readonly [number, number] | null;
  initialAnchor: ReportStageBoundaryAnchor | null;
  finalAnchor: ReportStageBoundaryAnchor | null;
}

export interface ReportStageBoundaryAnchor {
  temperatureCelsius: number;
  method: StageBoundaryResolution['method'];
  sourceRows: number[];
}

export interface TemperatureAtAlphaRow {
  alpha: number;
  temperatures: Array<{
    runId: string;
    temperatureK: number;
  }>;
}

export interface ReportFormulaDefinition {
  method: MethodName;
  formulaId: string;
  logBase: 'natural';
  approximationConstants: Record<string, number>;
  modelEquation: string;
  xTransform: string;
  yTransform: string;
  energyFromSlope: string;
}

export interface ScientificResultRow {
  resultId: string;
  quantity: 'apparent activation energy';
  claimBoundary: string;
  confidenceBoundary: typeof REGRESSION_CI_CLAIM_BOUNDARY;
  sample: string;
  process: string;
  stage: string;
  atmosphere: string;
  method: MethodName;
  resultType: 'isoconversional' | 'peak';
  formulaId: string;
  alpha: number | null;
  activationEnergyKJPerMol: number | null;
  confidence95LowerKJPerMol: number | null;
  confidence95UpperKJPerMol: number | null;
  /** Equal-weight distinct-heating-rate regression inputs. */
  n: number | null;
  rawObservationCount: number | null;
  residualDegreesOfFreedom: number | null;
  regressionInputAggregation: RegressionInputAggregation | null;
  r2: number | null;
  slope: number | null;
  slopeStandardError: number | null;
  /** Unchanged calculation-core completion status. */
  status: CalculationStatus;
  /** Publication-oriented decision derived outside the calculation core. */
  disposition: ScientificDisposition;
}

export interface SourceRowReference {
  sourceFileId: string | null;
  fileName: string;
  sheetName: string | null;
  sourceRow: number;
  contribution:
    | 'exact'
    | 'interpolation-lower'
    | 'interpolation-upper'
    | 'derivative-exact'
    | 'derivative-interpolation-lower'
    | 'derivative-interpolation-upper';
  /** Exact row-level input mapping; empty only for legacy provenance. */
  columnMappings: ProvenanceColumnMapping[];
}

export interface ObservationTrace {
  observationId: string;
  resultId: string;
  runId: string;
  regressionInputGroupId: string;
  decision: 'included';
  heatingRateKPerMinute: number;
  temperatureK: number;
  dAlphaDtPerMinute: number | null;
  x: number;
  y: number;
  predictedY: number;
  residual: number;
  peakEvidence: {
    peakResolved: boolean | null;
    peakQuality: BetaTpRow['peakQuality'] | null;
    peakSourceSignal: BetaTpRow['peakSourceSignal'] | null;
    peakAnalystConfirmed: boolean | null;
    peakAmbiguous: boolean | null;
  } | null;
  sourceResolution: 'exact' | 'interpolated' | 'unresolved';
  sourceRows: SourceRowReference[];
}

export interface ExclusionTrace {
  resultId: string;
  runId: string;
  decision: 'excluded';
  reasonCode: string;
  reason: string;
  severity: string;
}

export interface ResultTrace {
  resultId: string;
  method: MethodName;
  resultType: 'isoconversional' | 'peak';
  alpha: number | null;
  formulaId: string;
  includedObservationIds: string[];
  regressionInputGroupIds: string[];
  exclusions: ExclusionTrace[];
}

export interface TraceabilityGap {
  code:
    | 'INPUT_AUDIT_UNAVAILABLE'
    | 'SOURCE_ROW_UNRESOLVED'
    | 'SOURCE_MAPPING_UNAVAILABLE'
    | 'SOURCE_FILE_IDENTITY_UNAVAILABLE';
  message: string;
  observationId?: string;
}

export interface ReportTraceability {
  resultLinks: ResultTrace[];
  observationLinks: ObservationTrace[];
  gaps: TraceabilityGap[];
}

export interface ReportReproducibility {
  coreMathVersion: typeof CORE_MATH_VERSION;
  formulaSetVersion: typeof FORMULA_SET_VERSION;
  volatileFields: readonly ['generatedAt'];
  canonicalUnits: {
    temperature: 'K';
    heatingRate: 'K/min';
    time: 'min';
    alpha: 'fraction';
    activationEnergy: 'kJ/mol';
    derivative: '1/min';
  };
  configuration: {
    alphaGrid: number[];
    selectedMethods: MethodName[];
    includeKissinger: boolean;
    minR2Warning: number;
    stageWindowCelsius: readonly [number, number] | null;
  };
  inputTables: ReportInputTable[];
  preprocessing: {
    temperatureOrdering: 'ascending';
    alphaInterpolation: 'piecewise-linear';
    smoothing: 'none';
    derivativeSources: Array<{ runId: string; source: string }>;
    massNormalization: ReportMassNormalization[];
    wideSeriesFiles: ReportWideSeriesFileAudit[];
  };
  alphaGrid: number[];
  commonAlphaRange: readonly [number, number] | null;
  temperatureAtAlphaMatrix: TemperatureAtAlphaRow[];
  formulas: ReportFormulaDefinition[];
}

export interface ReportWideSeriesDefinition {
  seriesId: string;
  runId: string;
  temperature: {
    columnIndex: number;
    unit: string;
  };
  signal: {
    kind: WideSeriesDefinition['signal']['kind'];
    columnIndex: number;
    unit: string;
    alphaReference: {
      initialValue: number;
      finalValue: number;
      source: 'manual';
    } | null;
  };
  derivative: {
    semantic: NonNullable<WideSeriesDefinition['derivative']>['semantic'];
    semanticSource: 'manual';
    valueColumnIndex: number;
    unit: string;
    temperatureColumn: {
      columnIndex: number;
      unit: string;
    } | null;
    canonicalOutput: 'dAlphaDtPerMinute';
    canonicalConversionFormula: string;
  } | null;
  heatingRate: {
    value: number;
    unit: string;
    canonicalKPerMinute: number;
    source: 'manual';
  };
  context: {
    sample: string;
    atmosphere: string;
    stage: string;
    source: 'manual';
  };
}

export interface ReportWideSeriesFileAudit {
  layout: 'wide-series';
  source: {
    sourceFileId: string | null;
    fileName: string;
    fileType: string;
    sheetName: string | null;
  };
  headerRow: number;
  headerSourceRow: number;
  headers: string[];
  decimalSeparator: '.' | ',';
  alphaGrid: number[];
  series: ReportWideSeriesDefinition[];
  rawObservationCount: number;
  projectedPointCount: number;
  branches: Array<{
    seriesId: string;
    runId: string;
    sourceObservationCount: number;
    selectedObservationCount: number;
    startSourceRow: number;
    endSourceRow: number;
    targetAlphaRange: [number, number];
    selectedAlphaRange: [number, number];
  }>;
  excludedPopulatedColumns: Array<{
    columnIndex: number;
    sourceHeader: string;
    populatedRowCount: number;
    firstSourceRow: number;
    lastSourceRow: number;
  }>;
  scopeConfirmed: boolean;
  points: Array<{
    seriesId: string;
    runId: string;
    alpha: number;
    sourceRows: number[];
    derivativeSourceRows: number[];
  }>;
}

interface ContextLike {
  sample?: string;
  process?: string;
  stage?: string;
  atmosphere?: string;
}

interface SourceCandidate {
  runId: string;
  temperatureK: number;
  alpha?: number;
  kind: 'curve' | 't-alpha-beta' | 'beta-tp';
  provenance: RecordProvenance;
  sourceFileId: string | null;
  peakEvidence?: NonNullable<ObservationTrace['peakEvidence']>;
}

const FORMULAS: Readonly<Record<MethodName, Omit<ReportFormulaDefinition, 'method' | 'formulaId'>>> = {
  FWO: {
    logBase: 'natural',
    approximationConstants: { doyleIntercept: -5.331, slopeCoefficient: 1.052 },
    modelEquation: 'ln(beta) = C_alpha - 5.331 - 1.052E/(RT)',
    xTransform: 'x = 1 / T_alpha [K^-1]',
    yTransform: 'y = ln(beta / [K min^-1])',
    energyFromSlope: 'E_alpha [kJ mol^-1] = -slope * R / (1.052 * 1000)',
  },
  KAS: {
    logBase: 'natural',
    approximationConstants: { slopeCoefficient: 1 },
    modelEquation: 'ln(beta/T_alpha^2) = C_alpha - E/(RT_alpha)',
    xTransform: 'x = 1 / T_alpha [K^-1]',
    yTransform: 'y = ln((beta / [K min^-1]) / (T_alpha / K)^2)',
    energyFromSlope: 'E_alpha [kJ mol^-1] = -slope * R / 1000',
  },
  STARINK: {
    logBase: 'natural',
    approximationConstants: { temperatureExponent: 1.92, slopeCoefficient: 1.0008 },
    modelEquation: 'ln(beta/T_alpha^1.92) = C_alpha - 1.0008E/(RT_alpha)',
    xTransform: 'x = 1 / T_alpha [K^-1]',
    yTransform: 'y = ln((beta / [K min^-1]) / (T_alpha / K)^1.92)',
    energyFromSlope: 'E_alpha [kJ mol^-1] = -slope * R / (1.0008 * 1000)',
  },
  FRIEDMAN: {
    logBase: 'natural',
    approximationConstants: { slopeCoefficient: 1 },
    modelEquation: 'ln(dalpha/dt) = C_alpha - E/(RT_alpha)',
    xTransform: 'x = 1 / T_alpha [K^-1]',
    yTransform: 'y = ln((d alpha / dt) / [min^-1])',
    energyFromSlope: 'E_alpha [kJ mol^-1] = -slope * R / 1000',
  },
  KISSINGER: {
    logBase: 'natural',
    approximationConstants: { slopeCoefficient: 1 },
    modelEquation: 'ln(beta/T_p^2) = C - E/(RT_p)',
    xTransform: 'x = 1 / T_p [K^-1]',
    yTransform: 'y = ln((beta / [K min^-1]) / (T_p / K)^2)',
    energyFromSlope: 'E_peak [kJ mol^-1] = -slope * R / 1000',
  },
};

function contextLabels(analysis: ActivationEnergyAnalysis, context: ContextLike): ReportContextLabels {
  return {
    sample: context.sample?.trim() || 'not-specified',
    process: context.process?.trim() || 'not-specified',
    stage: context.stage?.trim() || 'not-specified',
    atmosphere: context.atmosphere?.trim() || 'not-specified',
    methods: [
      ...analysis.methods.map((method) => method.method),
      ...(analysis.kissinger ? (['KISSINGER'] as const) : []),
    ],
  };
}

function confidenceFromRegression(
  activationEnergyKJPerMol: number | undefined,
  regression: RegressionResult | undefined,
): readonly [number, number] | null {
  if (
    activationEnergyKJPerMol === undefined ||
    !regression ||
    !Number.isFinite(regression.slope) ||
    regression.slope === 0
  ) {
    return null;
  }
  const multiplier = activationEnergyKJPerMol / -regression.slope;
  const limits = regression.slopeConfidence95
    .map((bound) => -bound * multiplier)
    .sort((a, b) => a - b);
  return [limits[0], limits[1]];
}

function alphaResultId(method: MethodName, alpha: number): string {
  return `${method}:alpha:${alpha.toPrecision(15)}`;
}

export function buildScientificResultRows(
  analysis: ActivationEnergyAnalysis,
  context: ContextLike,
  configuration?: ReportAnalysisConfiguration,
): ScientificResultRow[] {
  const assessment = assessScientificDisposition(analysis, {
    ...(configuration?.alphaGrid === undefined
      ? {}
      : { alphaGrid: configuration.alphaGrid }),
    ...(configuration?.minR2Warning === undefined
      ? {}
      : { minimumReportableR2: configuration.minR2Warning }),
  });
  const dispositionByResultId = new Map(
    [
      ...assessment.methods,
      ...(assessment.kissinger === undefined ? [] : [assessment.kissinger]),
    ].flatMap((method) =>
      method.results.map((result) => [result.resultId, result.disposition] as const)),
  );
  const dispositionFor = (resultId: string): ScientificDisposition => {
    const disposition = dispositionByResultId.get(resultId);
    if (disposition === undefined) {
      throw new Error(
        `Scientific disposition is missing for report result ${resultId}. `
        + 'The report alpha grid must match the analyzed result grid.',
      );
    }
    return disposition;
  };
  const labels = contextLabels(analysis, context);
  const shared = {
    quantity: 'apparent activation energy' as const,
    claimBoundary: APPARENT_EA_CLAIM_BOUNDARY,
    confidenceBoundary: REGRESSION_CI_CLAIM_BOUNDARY as typeof REGRESSION_CI_CLAIM_BOUNDARY,
    sample: labels.sample,
    process: labels.process,
    stage: labels.stage,
    atmosphere: labels.atmosphere,
  };
  const rows: ScientificResultRow[] = [];
  for (const method of analysis.methods) {
    for (const estimate of method.estimates) {
      const resultId = alphaResultId(method.method, estimate.alpha);
      const confidence = confidenceFromRegression(
        estimate.activationEnergyKJPerMol,
        estimate.regression,
      );
      rows.push({
        ...shared,
        resultId,
        method: method.method,
        resultType: 'isoconversional',
        formulaId: method.formulaId,
        alpha: estimate.alpha,
        activationEnergyKJPerMol: estimate.activationEnergyKJPerMol,
        confidence95LowerKJPerMol: confidence?.[0] ?? null,
        confidence95UpperKJPerMol: confidence?.[1] ?? null,
        n: estimate.regression.n,
        rawObservationCount: estimate.regression.rawObservationCount,
        residualDegreesOfFreedom: estimate.regression.residualDegreesOfFreedom,
        regressionInputAggregation: estimate.regression.inputAggregation,
        r2: estimate.regression.r2,
        slope: estimate.regression.slope,
        slopeStandardError: estimate.regression.slopeStandardError,
        status: method.status,
        disposition: dispositionFor(resultId),
      });
    }
  }
  const kissinger = analysis.kissinger;
  if (kissinger?.regression && kissinger.activationEnergyKJPerMol !== undefined) {
    const confidence = confidenceFromRegression(
      kissinger.activationEnergyKJPerMol,
      kissinger.regression,
    );
    rows.push({
      ...shared,
      resultId: 'KISSINGER:peak',
      method: 'KISSINGER',
      resultType: 'peak',
      formulaId: kissinger.formulaId,
      alpha: null,
      activationEnergyKJPerMol: kissinger.activationEnergyKJPerMol,
      confidence95LowerKJPerMol: confidence?.[0] ?? null,
      confidence95UpperKJPerMol: confidence?.[1] ?? null,
      n: kissinger.regression.n,
      rawObservationCount: kissinger.regression.rawObservationCount,
      residualDegreesOfFreedom: kissinger.regression.residualDegreesOfFreedom,
      regressionInputAggregation: kissinger.regression.inputAggregation,
      r2: kissinger.regression.r2,
      slope: kissinger.regression.slope,
      slopeStandardError: kissinger.regression.slopeStandardError,
      status: kissinger.status,
      disposition: dispositionFor('KISSINGER:peak'),
    });
  }
  return rows;
}

function canonicalUnit(mapping: ColumnMapping): string | null {
  switch (mapping.role) {
    case 'temperature':
      return 'K';
    case 'time':
      return 's';
    case 'mass':
      return 'mg';
    case 'massPercent':
      return '%';
    case 'alpha':
      return 'fraction';
    case 'dAlphaDt':
      return 'min^-1';
    case 'heatingRate':
      return 'K/min';
    default:
      return null;
  }
}

function conversionLabel(mapping: ColumnMapping): string {
  const target = canonicalUnit(mapping);
  if (!target) return 'identity / metadata';
  if (!mapping.unit) return `unspecified -> ${target}`;
  return mapping.unit === target ? `${target} -> ${target} (identity)` : `${mapping.unit} -> ${target}`;
}

function optionsForFile(
  options: ReportGenerationInput['ingestionOptions'],
  index: number,
): IngestionOptions | undefined {
  if (!options) return undefined;
  return Array.isArray(options) ? options[index] : (options as IngestionOptions);
}

function orderedSourceFileId(
  input: ReportGenerationInput | undefined,
  index: number,
  fileName: string,
): string | null {
  const identity = input?.sourceFiles?.[index];
  return identity?.name === fileName ? identity.sourceFileId : null;
}

function buildInputTables(input: ReportGenerationInput | undefined): ReportInputTable[] {
  return (input?.ingestion?.files ?? []).map((file, index) => {
    const fileOptions = optionsForFile(input?.ingestionOptions, index);
    const ignoredRoles = [...(fileOptions?.ignoredRoles ?? [])];
    return {
      sourceFileId: orderedSourceFileId(input, index, file.source.fileName),
      fileName: file.source.fileName,
      fileType: file.source.fileType,
      sheetName: file.source.sheetName ?? null,
      delimiter: file.source.delimiter ?? null,
      decimalSeparator: file.source.decimalSeparator ?? null,
      textEncoding: file.source.textEncoding ?? null,
      headerRow: file.source.headerRow ?? fileOptions?.headerRow ?? 0,
      tableKind: fileOptions?.tableKind ?? 'auto',
      ...(ignoredRoles.length > 0 ? { ignoredRoles } : {}),
      mappings: file.mappings.map((mapping) => ({
        role: mapping.role,
        sourceColumnIndex: mapping.columnIndex,
        sourceHeader: mapping.header,
        sourceUnit: mapping.unit ?? null,
        canonicalUnit: canonicalUnit(mapping),
        conversion: conversionLabel(mapping),
        confidence: mapping.confidence,
      })),
    };
  });
}

function recordsForRun(
  ingestion: BatchIngestionResult | undefined,
  runId: string,
  stageWindow: StageWindow | undefined,
): {
  records: NormalizedThermalRecord[];
  initialAnchor: ReportStageBoundaryAnchor | null;
  finalAnchor: ReportStageBoundaryAnchor | null;
} {
  const records = (ingestion?.records ?? [])
    .filter(
      (record) =>
        record.runId === runId &&
        record.temperatureKind === 'sample',
    );
  if (!stageWindow) {
    return { records, initialAnchor: null, finalAnchor: null };
  }
  const resolution = resolveStageWindowRecords(records, stageWindow);
  if (resolution.status === 'error') {
    throw new Error(
      `${resolution.code}: the stage window for ${runId} could not be resolved again for the report: ${resolution.message}`,
    );
  }
  const anchor = (
    boundary: StageBoundaryResolution,
  ): ReportStageBoundaryAnchor => ({
    temperatureCelsius: boundary.record.temperatureK - 273.15,
    method: boundary.method,
    sourceRows: [...boundary.sourceRows],
  });
  return {
    records: resolution.records,
    initialAnchor: anchor(resolution.start),
    finalAnchor: anchor(resolution.end),
  };
}

function buildMassNormalization(
  analysis: ActivationEnergyAnalysis,
  input: ReportGenerationInput | undefined,
): ReportMassNormalization[] {
  return analysis.preparedRuns.map((run) => {
    const resolved = recordsForRun(input?.ingestion, run.id, input?.stageWindow);
    const { records } = resolved;
    const directAlpha = records.length > 0 && records.every((record) => record.alpha !== undefined);
    const massMg = !directAlpha && records.length > 0 && records.every((record) => record.massMg !== undefined);
    const massPercent =
      !directAlpha && !massMg && records.length > 0 && records.every((record) => record.massPercent !== undefined);
    const values = directAlpha
      ? records.map((record) => record.alpha as number)
      : massMg
        ? records.map((record) => record.massMg as number)
        : massPercent
          ? records.map((record) => record.massPercent as number)
          : [];
    return {
      runId: run.id,
      alphaSource: directAlpha ? 'direct-alpha' : massMg || massPercent ? 'mass-normalized' : 'unknown',
      sourceQuantity: directAlpha ? 'alpha' : massMg ? 'massMg' : massPercent ? 'massPercent' : 'unknown',
      initialValue: values[0] ?? null,
      finalValue: values.at(-1) ?? null,
      stageWindowCelsius: input?.stageWindow
        ? [input.stageWindow.startCelsius, input.stageWindow.endCelsius]
        : null,
      initialAnchor: resolved.initialAnchor,
      finalAnchor: resolved.finalAnchor,
    };
  });
}

function inferredAlphaGrid(analysis: ActivationEnergyAnalysis): number[] {
  return [
    ...new Set(analysis.methods.flatMap((method) => method.estimates.map((estimate) => estimate.alpha))),
  ].sort((a, b) => a - b);
}

function temperatureAtAlphaMatrix(analysis: ActivationEnergyAnalysis): TemperatureAtAlphaRow[] {
  const byAlpha = new Map<number, Map<string, number>>();
  for (const method of analysis.methods) {
    for (const estimate of method.estimates) {
      const runs = byAlpha.get(estimate.alpha) ?? new Map<string, number>();
      for (const observation of estimate.observations) {
        if (!runs.has(observation.runId)) runs.set(observation.runId, observation.temperatureK);
      }
      byAlpha.set(estimate.alpha, runs);
    }
  }
  return [...byAlpha.entries()]
    .sort(([left], [right]) => left - right)
    .map(([alpha, runs]) => ({
      alpha,
      temperatures: [...runs.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([runId, temperatureK]) => ({ runId, temperatureK })),
    }));
}

function formulaDefinitions(analysis: ActivationEnergyAnalysis): ReportFormulaDefinition[] {
  const executed = [
    ...analysis.methods.map((method) => ({ method: method.method, formulaId: method.formulaId })),
    ...(analysis.kissinger
      ? [{ method: 'KISSINGER' as const, formulaId: analysis.kissinger.formulaId }]
      : []),
  ];
  return executed.map(({ method, formulaId }) => ({ method, formulaId, ...FORMULAS[method] }));
}

function directDerivativeFactor(unit: string): number {
  switch (unit) {
    case 'min^-1':
      return 1;
    case 's^-1':
      return 60;
    case '%/min':
      return 0.01;
    case '%/s':
      return 0.6;
    default:
      throw new Error(`Unsupported direct derivative unit in wide-series audit: ${unit}`);
  }
}

function massRateFactor(unit: string): number {
  switch (unit) {
    case 'mg/min':
    case 'fraction/min':
      return 1;
    case 'mg/s':
    case 'fraction/s':
      return 60;
    case 'g/min':
      return 1000;
    case 'g/s':
      return 60_000;
    case '%/min':
      return 0.01;
    case '%/s':
      return 0.6;
    default:
      throw new Error(`Unsupported mass-rate unit in wide-series audit: ${unit}`);
  }
}

function wideDerivativeFormula(definition: WideSeriesDefinition): string | null {
  const derivative = definition.derivative;
  if (!derivative) return null;
  if (derivative.semantic === 'dAlphaDt') {
    return `dAlphaDtPerMinute = sourceValue * ${directDerivativeFactor(derivative.unit)}`;
  }
  if (definition.signal.kind === 'alpha') {
    throw new Error('Wide-series report cannot apply a mass derivative to an alpha signal.');
  }
  const signalFactor =
    definition.signal.kind === 'mass'
      ? definition.signal.unit === 'g'
        ? 1000
        : 1
      : definition.signal.unit === '%'
        ? 0.01
        : 1;
  const rateFactor = massRateFactor(derivative.unit);
  const sign = derivative.semantic === 'massLossRate' ? '' : '-';
  const { initialValue, finalValue } = definition.signal.alphaReference;
  return (
    `dAlphaDtPerMinute = ${sign}sourceValue * ${rateFactor} / ` +
    `((${initialValue} - ${finalValue}) * ${signalFactor})`
  );
}

function reportWideSeriesDefinition(
  definition: WideSeriesDefinition,
): ReportWideSeriesDefinition {
  const derivative = definition.derivative;
  return {
    seriesId: definition.seriesId,
    runId: definition.runId,
    temperature: { ...definition.temperature },
    signal: {
      kind: definition.signal.kind,
      columnIndex: definition.signal.columnIndex,
      unit: definition.signal.unit,
      alphaReference:
        definition.signal.kind === 'alpha'
          ? null
          : { ...definition.signal.alphaReference, source: 'manual' },
    },
    derivative: derivative
      ? {
          semantic: derivative.semantic,
          semanticSource: 'manual',
          valueColumnIndex: derivative.valueColumnIndex,
          unit: derivative.unit,
          temperatureColumn: derivative.temperatureColumn
            ? { ...derivative.temperatureColumn }
            : null,
          canonicalOutput: 'dAlphaDtPerMinute',
          canonicalConversionFormula: wideDerivativeFormula(definition) as string,
        }
      : null,
    heatingRate: {
      ...definition.heatingRate,
      canonicalKPerMinute:
        definition.heatingRate.unit.endsWith('/s')
          ? definition.heatingRate.value * 60
          : definition.heatingRate.value,
      source: 'manual',
    },
    context: { ...definition.context, source: 'manual' },
  };
}

function reportWideSeriesFile(
  audit: WideSeriesIngestionAudit,
  sourceFiles: readonly ReportSourceFileIdentity[],
): ReportWideSeriesFileAudit {
  const explicitIdentity = audit.source.sourceFileId
    ? sourceFiles.find(({ sourceFileId }) => sourceFileId === audit.source.sourceFileId)
    : undefined;
  const matchingIdentities = sourceFiles.filter(({ name }) => name === audit.source.fileName);
  return {
    layout: 'wide-series',
    source: {
      sourceFileId:
        explicitIdentity?.name === audit.source.fileName
          ? explicitIdentity.sourceFileId
          : matchingIdentities.length === 1
            ? matchingIdentities[0].sourceFileId
            : null,
      fileName: audit.source.fileName,
      fileType: audit.source.fileType,
      sheetName: audit.source.sheetName ?? null,
    },
    headerRow: audit.headerRow,
    headerSourceRow: audit.headerSourceRow,
    headers: [...audit.headers],
    decimalSeparator: audit.decimalSeparator,
    alphaGrid: [...audit.alphaGrid],
    series: audit.series.map(reportWideSeriesDefinition),
    rawObservationCount: audit.rawObservationCount,
    projectedPointCount: audit.projectedPointCount,
    branches: audit.branches.map((branch) => ({
      ...branch,
      targetAlphaRange: [...branch.targetAlphaRange],
      selectedAlphaRange: [...branch.selectedAlphaRange],
    })),
    excludedPopulatedColumns: audit.excludedPopulatedColumns.map((column) => ({
      columnIndex: column.columnIndex,
      sourceHeader: column.sourceHeader,
      populatedRowCount: column.populatedRowCount,
      firstSourceRow: column.firstSourceRow,
      lastSourceRow: column.lastSourceRow,
    })),
    scopeConfirmed: audit.scopeConfirmed,
    points: audit.points.map((point) => ({
      ...point,
      sourceRows: [...point.sourceRows],
      derivativeSourceRows: [...(point.derivativeSourceRows ?? [])],
    })),
  };
}

export function buildReportReproducibility(
  analysis: ActivationEnergyAnalysis,
  input?: ReportGenerationInput,
): ReportReproducibility {
  const inferred = inferredAlphaGrid(analysis);
  const requested = input?.analysisConfiguration?.alphaGrid;
  const selectedMethods =
    input?.analysisConfiguration?.methods ?? analysis.methods.map((method) => method.method);
  return {
    coreMathVersion: CORE_MATH_VERSION,
    formulaSetVersion: FORMULA_SET_VERSION,
    volatileFields: REPORT_VOLATILE_FIELDS,
    canonicalUnits: {
      temperature: 'K',
      heatingRate: 'K/min',
      time: 'min',
      alpha: 'fraction',
      activationEnergy: 'kJ/mol',
      derivative: '1/min',
    },
    configuration: {
      alphaGrid: [...(requested ?? inferred)],
      selectedMethods: [...selectedMethods],
      includeKissinger:
        input?.analysisConfiguration?.includeKissinger ?? Boolean(analysis.kissinger),
      minR2Warning: input?.analysisConfiguration?.minR2Warning ?? 0.98,
      stageWindowCelsius: input?.stageWindow
        ? [input.stageWindow.startCelsius, input.stageWindow.endCelsius]
        : null,
    },
    inputTables: buildInputTables(input),
    preprocessing: {
      temperatureOrdering: 'ascending',
      alphaInterpolation: 'piecewise-linear',
      smoothing: 'none',
      derivativeSources: analysis.preparedRuns.map((run) => ({
        runId: run.id,
        source: run.derivativeSource,
      })),
      massNormalization: buildMassNormalization(analysis, input),
      wideSeriesFiles: (input?.ingestion?.wideSeriesAudit ?? []).map((audit) =>
        reportWideSeriesFile(audit, input?.sourceFiles ?? []),
      ),
    },
    alphaGrid: [...(requested ?? inferred)],
    commonAlphaRange: analysis.eligibility.commonAlphaRange ?? null,
    temperatureAtAlphaMatrix: temperatureAtAlphaMatrix(analysis),
    formulas: formulaDefinitions(analysis),
  };
}

function explicitSourceFileId(provenance: RecordProvenance): string | undefined {
  const value = (provenance as RecordProvenance & { readonly sourceFileId?: unknown })
    .sourceFileId;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function boundSourceFileId(
  provenance: RecordProvenance,
  sourceFiles: readonly ReportSourceFileIdentity[],
  orderedIdentity?: ReportSourceFileIdentity,
): string | null {
  const explicit = explicitSourceFileId(provenance);
  if (explicit) {
    const match = sourceFiles.find(({ sourceFileId }) => sourceFileId === explicit);
    return match?.name === provenance.fileName ? explicit : null;
  }
  if (orderedIdentity?.name === provenance.fileName) return orderedIdentity.sourceFileId;
  const filenameMatches = sourceFiles.filter(({ name }) => name === provenance.fileName);
  return filenameMatches.length === 1 ? filenameMatches[0].sourceFileId : null;
}

function sourceCandidates(
  ingestion: BatchIngestionResult | undefined,
  sourceFiles: readonly ReportSourceFileIdentity[],
): SourceCandidate[] {
  if (!ingestion) return [];
  const candidates: SourceCandidate[] = [];
  const seenRows = new Set<object>();
  const addCurve = (
    record: NormalizedThermalRecord,
    orderedIdentity?: ReportSourceFileIdentity,
  ) => {
    candidates.push({
      runId: record.runId,
      temperatureK: record.temperatureK,
      alpha: record.alpha,
      kind: 'curve' as const,
      provenance: record.provenance,
      sourceFileId: boundSourceFileId(record.provenance, sourceFiles, orderedIdentity),
    });
    seenRows.add(record);
  };
  const addTAlphaBeta = (
    row: TAlphaBetaRow,
    orderedIdentity?: ReportSourceFileIdentity,
  ) => {
    candidates.push({
      runId: row.runId,
      temperatureK: row.temperatureK,
      alpha: row.alpha,
      kind: 't-alpha-beta' as const,
      provenance: row.provenance,
      sourceFileId: boundSourceFileId(row.provenance, sourceFiles, orderedIdentity),
    });
    seenRows.add(row);
  };
  const addBetaTp = (
    row: BetaTpRow,
    orderedIdentity?: ReportSourceFileIdentity,
  ) => {
    candidates.push({
      runId: row.runId,
      temperatureK: row.peakTemperatureK,
      kind: 'beta-tp' as const,
      provenance: row.provenance,
      sourceFileId: boundSourceFileId(row.provenance, sourceFiles, orderedIdentity),
      peakEvidence: {
        peakResolved: row.peakResolved ?? null,
        peakQuality: row.peakQuality ?? null,
        peakSourceSignal: row.peakSourceSignal ?? null,
        peakAnalystConfirmed: row.peakAnalystConfirmed ?? null,
        peakAmbiguous: row.peakAmbiguous ?? null,
      },
    });
    seenRows.add(row);
  };

  // The aggregate collections are the caller-visible batch contract and may
  // deliberately contain audited clones (for example, legacy-gap probes).
  // Prefer them while retaining ordered per-file fallbacks for older batches.
  ingestion.records.forEach((record) => {
    if (!seenRows.has(record)) addCurve(record);
  });
  ingestion.tables.tAlphaBeta.forEach((row) => {
    if (!seenRows.has(row)) addTAlphaBeta(row);
  });
  ingestion.tables.betaTp.forEach((row) => {
    if (!seenRows.has(row)) addBetaTp(row);
  });
  ingestion.files.forEach((file, index) => {
    const orderedIdentity = sourceFiles[index];
    file.records.forEach((record) => {
      if (!seenRows.has(record)) addCurve(record, orderedIdentity);
    });
    file.tables.tAlphaBeta.forEach((row) => {
      if (!seenRows.has(row)) addTAlphaBeta(row, orderedIdentity);
    });
    file.tables.betaTp.forEach((row) => {
      if (!seenRows.has(row)) addBetaTp(row, orderedIdentity);
    });
  });

  const unique = new Map<string, SourceCandidate>();
  for (const candidate of candidates) {
    const key = [
      candidate.runId,
      candidate.kind,
      candidate.temperatureK,
      candidate.alpha ?? '',
      candidate.sourceFileId ?? '',
      candidate.provenance.fileName,
      candidate.provenance.sheetName ?? '',
      candidate.provenance.sourceRow,
      (candidate.provenance.sourceRows ?? []).join(','),
      (candidate.provenance.derivativeSourceRows ?? []).join(','),
      candidate.peakEvidence?.peakResolved ?? '',
      candidate.peakEvidence?.peakQuality ?? '',
      candidate.peakEvidence?.peakSourceSignal ?? '',
      candidate.peakEvidence?.peakAnalystConfirmed ?? '',
      candidate.peakEvidence?.peakAmbiguous ?? '',
    ].join('|');
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()];
}

function sourceReference(
  candidate: SourceCandidate,
  contribution: SourceRowReference['contribution'],
  sourceRow = candidate.provenance.sourceRow,
): SourceRowReference {
  return {
    sourceFileId: candidate.sourceFileId,
    fileName: candidate.provenance.fileName,
    sheetName: candidate.provenance.sheetName ?? null,
    sourceRow,
    contribution,
    columnMappings: (candidate.provenance.columnMappings ?? []).map((mapping) => ({
      ...mapping,
    })),
  };
}

function exactContributions(
  rows: readonly number[],
  derivative: boolean,
): SourceRowReference['contribution'][] {
  if (rows.length <= 1) return [derivative ? 'derivative-exact' : 'exact'];
  return rows.map((_, index) => {
    if (index === 0) {
      return derivative ? 'derivative-interpolation-lower' : 'interpolation-lower';
    }
    if (index === rows.length - 1) {
      return derivative ? 'derivative-interpolation-upper' : 'interpolation-upper';
    }
    return derivative ? 'derivative-exact' : 'exact';
  });
}

function candidateReferences(
  candidate: SourceCandidate,
  includeDerivative: boolean,
  outerContribution?: 'interpolation-lower' | 'interpolation-upper',
): SourceRowReference[] {
  const primaryRows =
    candidate.provenance.sourceRows && candidate.provenance.sourceRows.length > 0
      ? candidate.provenance.sourceRows
      : [candidate.provenance.sourceRow];
  const primaryContributions = outerContribution
    ? primaryRows.map(() => outerContribution)
    : exactContributions(primaryRows, false);
  const references = primaryRows.map((sourceRow, index) =>
    sourceReference(candidate, primaryContributions[index], sourceRow),
  );
  if (!includeDerivative) return references;

  const derivativeRows = candidate.provenance.derivativeSourceRows ?? [];
  const derivativeContributions = outerContribution
    ? derivativeRows.map(() =>
        outerContribution === 'interpolation-lower'
          ? 'derivative-interpolation-lower' as const
          : 'derivative-interpolation-upper' as const,
      )
    : exactContributions(derivativeRows, true);
  return [
    ...references,
    ...derivativeRows.map((sourceRow, index) =>
      sourceReference(candidate, derivativeContributions[index], sourceRow),
    ),
  ];
}

function resolveSourceRows(
  observation: MethodObservation,
  resultType: ScientificResultRow['resultType'],
  method: MethodName,
  candidates: readonly SourceCandidate[],
): Pick<ObservationTrace, 'peakEvidence' | 'sourceResolution' | 'sourceRows'> {
  const kindCandidates = candidates
    .filter(
      (candidate) =>
        candidate.runId === observation.runId &&
        (resultType === 'peak' ? candidate.kind === 'beta-tp' : candidate.kind !== 'beta-tp'),
    )
    .sort((a, b) => a.temperatureK - b.temperatureK);
  const tolerance = Math.max(1, Math.abs(observation.temperatureK)) * 1e-10;
  const exact = kindCandidates.find(
    (candidate) => Math.abs(candidate.temperatureK - observation.temperatureK) <= tolerance,
  );
  if (exact) {
    const primaryRows =
      exact.provenance.sourceRows && exact.provenance.sourceRows.length > 0
        ? exact.provenance.sourceRows
        : [exact.provenance.sourceRow];
    return {
      peakEvidence: exact.peakEvidence ?? null,
      sourceResolution: primaryRows.length === 1 ? 'exact' : 'interpolated',
      sourceRows: candidateReferences(exact, method === 'FRIEDMAN'),
    };
  }
  const lower = [...kindCandidates]
    .reverse()
    .find((candidate) => candidate.temperatureK < observation.temperatureK);
  const upper = kindCandidates.find((candidate) => candidate.temperatureK > observation.temperatureK);
  if (lower && upper) {
    return {
      peakEvidence: null,
      sourceResolution: 'interpolated',
      sourceRows: [
        ...candidateReferences(
          lower,
          method === 'FRIEDMAN',
          'interpolation-lower',
        ),
        ...candidateReferences(
          upper,
          method === 'FRIEDMAN',
          'interpolation-upper',
        ),
      ],
    };
  }
  return { peakEvidence: null, sourceResolution: 'unresolved', sourceRows: [] };
}

function diagnosticsForResult(
  diagnostics: readonly Diagnostic[],
  method: MethodName,
  alpha: number | null,
): Diagnostic[] {
  const exclusionCodes = new Set([
    'AMBIGUOUS_ALPHA_CROSSING',
    'FRIEDMAN_NON_POSITIVE_RATE',
    'KISSINGER_PEAK_OUTSIDE_RUN_RANGE',
    'OVERLAPPING_PEAKS',
  ]);
  return diagnostics.filter(
    (diagnostic) =>
      exclusionCodes.has(diagnostic.code) &&
      (!diagnostic.method || diagnostic.method === method) &&
      (diagnostic.alpha === undefined || alpha === null || diagnostic.alpha === alpha),
  );
}

function exclusionsForResult(
  resultId: string,
  method: MethodName,
  alpha: number | null,
  diagnostics: readonly Diagnostic[],
): ExclusionTrace[] {
  const unique = new Map<string, ExclusionTrace>();
  for (const diagnostic of diagnosticsForResult(diagnostics, method, alpha)) {
    for (const runId of diagnostic.runIds ?? []) {
      const exclusion: ExclusionTrace = {
        resultId,
        runId,
        decision: 'excluded',
        reasonCode: diagnostic.code,
        reason: diagnostic.message,
        severity: diagnostic.severity,
      };
      const key = `${runId}|${diagnostic.code}|${diagnostic.message}`;
      if (!unique.has(key)) unique.set(key, exclusion);
    }
  }
  return [...unique.values()];
}

function traceObservations(
  result: ScientificResultRow,
  observations: readonly MethodObservation[],
  regression: RegressionResult,
  candidates: readonly SourceCandidate[],
): ObservationTrace[] {
  return observations.map((observation, index) => {
    const source = resolveSourceRows(
      observation,
      result.resultType,
      result.method,
      candidates,
    );
    const predictedY = regression.intercept + regression.slope * observation.x;
    return {
      observationId: `${result.resultId}:observation:${index + 1}`,
      resultId: result.resultId,
      runId: observation.runId,
      regressionInputGroupId: `beta:${heatingRateKey(observation.heatingRateKPerMinute)}`,
      decision: 'included',
      heatingRateKPerMinute: observation.heatingRateKPerMinute,
      temperatureK: observation.temperatureK,
      dAlphaDtPerMinute: observation.dAlphaDtPerMinute ?? null,
      x: observation.x,
      y: observation.y,
      predictedY,
      residual: observation.y - predictedY,
      ...source,
    };
  });
}

export function buildReportTraceability(
  analysis: ActivationEnergyAnalysis,
  results: readonly ScientificResultRow[],
  input?: ReportGenerationInput,
): ReportTraceability {
  const candidates = sourceCandidates(input?.ingestion, input?.sourceFiles ?? []);
  const resultLinks: ResultTrace[] = [];
  const observationLinks: ObservationTrace[] = [];
  const allDiagnostics = [...analysis.refusals, ...analysis.warnings];

  for (const method of analysis.methods) {
    const methodDiagnostics = [...allDiagnostics, ...method.refusals, ...method.warnings];
    for (const estimate of method.estimates) {
      const resultId = alphaResultId(method.method, estimate.alpha);
      const result = results.find((candidate) => candidate.resultId === resultId);
      if (!result) continue;
      const observations = traceObservations(
        result,
        estimate.observations,
        estimate.regression,
        candidates,
      );
      observationLinks.push(...observations);
      resultLinks.push({
        resultId,
        method: method.method,
        resultType: 'isoconversional',
        alpha: estimate.alpha,
        formulaId: method.formulaId,
        includedObservationIds: observations.map((observation) => observation.observationId),
        regressionInputGroupIds: estimate.regression.inputGroups.map((group) => group.groupId),
        exclusions: exclusionsForResult(
          resultId,
          method.method,
          estimate.alpha,
          methodDiagnostics,
        ),
      });
    }
  }

  const kissinger = analysis.kissinger;
  if (kissinger?.regression && kissinger.activationEnergyKJPerMol !== undefined) {
    const result = results.find((candidate) => candidate.resultId === 'KISSINGER:peak');
    if (result) {
      const observations = traceObservations(
        result,
        kissinger.observations,
        kissinger.regression,
        candidates,
      );
      observationLinks.push(...observations);
      resultLinks.push({
        resultId: result.resultId,
        method: 'KISSINGER',
        resultType: 'peak',
        alpha: null,
        formulaId: kissinger.formulaId,
        includedObservationIds: observations.map((observation) => observation.observationId),
        regressionInputGroupIds: kissinger.regression.inputGroups.map((group) => group.groupId),
        exclusions: exclusionsForResult(
          result.resultId,
          'KISSINGER',
          null,
          [...allDiagnostics, ...kissinger.refusals, ...kissinger.warnings],
        ),
      });
    }
  }

  const gaps: TraceabilityGap[] = [];
  if (!input?.ingestion && observationLinks.length > 0) {
    gaps.push({
      code: 'INPUT_AUDIT_UNAVAILABLE',
      message: 'Normalized ingestion provenance was not supplied to the report generator.',
    });
  }
  for (const observation of observationLinks) {
    if (observation.sourceResolution === 'unresolved') {
      gaps.push({
        code: 'SOURCE_ROW_UNRESOLVED',
        observationId: observation.observationId,
        message: `No source-row contributor could be resolved for ${observation.observationId}.`,
      });
    }
    if (
      observation.sourceRows.length > 0 &&
      observation.sourceRows.some((source) => source.columnMappings.length === 0)
    ) {
      gaps.push({
        code: 'SOURCE_MAPPING_UNAVAILABLE',
        observationId: observation.observationId,
        message: `Source-column mapping and source-unit provenance is unavailable for ${observation.observationId}.`,
      });
    }
    if (
      observation.sourceRows.length > 0 &&
      observation.sourceRows.some((source) => source.sourceFileId === null)
    ) {
      gaps.push({
        code: 'SOURCE_FILE_IDENTITY_UNAVAILABLE',
        observationId: observation.observationId,
        message:
          `A source-row contributor for ${observation.observationId} could not be bound to a unique hash-derived sourceFileId.`,
      });
    }
  }
  return { resultLinks, observationLinks, gaps };
}

export function buildScientificBoundary(
  analysis: ActivationEnergyAnalysis,
  context: ContextLike,
): {
  quantity: 'apparent activation energy';
  statement: string;
  regressionConfidenceInterval: typeof REGRESSION_CI_CLAIM_BOUNDARY;
  contextLabels: ReportContextLabels;
} {
  return {
    quantity: 'apparent activation energy',
    statement: APPARENT_EA_CLAIM_BOUNDARY,
    regressionConfidenceInterval: REGRESSION_CI_CLAIM_BOUNDARY,
    contextLabels: contextLabels(analysis, context),
  };
}
