export type RawCell = string | number | boolean | Date | null | undefined;

export type RawTable = readonly (readonly RawCell[])[];

export type ColumnRole =
  | 'temperature'
  | 'time'
  | 'mass'
  | 'massPercent'
  | 'alpha'
  | 'dAlphaDt'
  | 'heatingRate'
  | 'run'
  | 'sample'
  | 'atmosphere'
  | 'stage'
  | 'peakResolved'
  | 'peakQuality'
  | 'peakSourceSignal'
  | 'peakAnalystConfirmed'
  | 'peakAmbiguous';

export type TemperatureUnit = 'K' | 'C';
export type TimeUnit = 's' | 'min';
export type MassUnit = 'mg' | 'g';
export type MassPercentUnit = '%' | 'fraction';
export type AlphaUnit = 'fraction' | '%';
export type AlphaDerivativeUnit = 'min^-1' | 's^-1' | '%/min' | '%/s';
export type MassRateUnit =
  | 'mg/min'
  | 'mg/s'
  | 'g/min'
  | 'g/s'
  | '%/min'
  | '%/s'
  | 'fraction/min'
  | 'fraction/s';
export type HeatingRateUnit = 'K/min' | 'K/s' | 'C/min' | 'C/s';
export type AlphaDerivativeSource = 'provided' | 'temperature';

export type ColumnUnit =
  | TemperatureUnit
  | TimeUnit
  | MassUnit
  | MassPercentUnit
  | AlphaUnit
  | AlphaDerivativeUnit
  | MassRateUnit
  | HeatingRateUnit;

export type TemperatureKind = 'sample' | 'peak';
export type TableKind = 'auto' | 'curve' | 't-alpha-beta' | 'beta-tp';
export type TableLayout = 'long' | 'wide-series';
export type BetaTpPeakQuality =
  | 'clear-interior'
  | 'boundary'
  | 'shoulder'
  | 'multiple-overlapping'
  | 'unknown';
export type BetaTpSourceSignal =
  | 'positive-mass-loss-rate'
  | 'positive-dalpha-dt'
  | 'external-beta-tp-table';

export interface WideSeriesTemperatureColumn {
  /** Zero-based source column index. */
  columnIndex: number;
  unit: TemperatureUnit;
}

export interface WideSeriesAlphaReference {
  /** Initial mass or mass fraction in the same source unit as the mapped signal. */
  initialValue: number;
  /** Final mass or mass fraction in the same source unit as the mapped signal. */
  finalValue: number;
}

export type WideSeriesSignal =
  | {
      kind: 'alpha';
      columnIndex: number;
      unit: AlphaUnit;
    }
  | {
      kind: 'mass';
      columnIndex: number;
      unit: MassUnit;
      alphaReference: WideSeriesAlphaReference;
    }
  | {
      kind: 'massPercent';
      columnIndex: number;
      unit: MassPercentUnit;
      alphaReference: WideSeriesAlphaReference;
    };

export type WideSeriesDerivative =
  | {
      /** The source is already d(alpha)/dt. */
      semantic: 'dAlphaDt';
      valueColumnIndex: number;
      unit: AlphaDerivativeUnit;
      /** Omit only when the derivative shares the primary temperature rows. */
      temperatureColumn?: WideSeriesTemperatureColumn;
    }
  | {
      /** Positive values mean positive mass loss, -dm/dt. */
      semantic: 'massLossRate';
      valueColumnIndex: number;
      unit: MassRateUnit;
      temperatureColumn?: WideSeriesTemperatureColumn;
    }
  | {
      /** Signed dm/dt; negative values normally correspond to mass loss. */
      semantic: 'massChangeRate';
      valueColumnIndex: number;
      unit: MassRateUnit;
      temperatureColumn?: WideSeriesTemperatureColumn;
    };

export interface WideSeriesContext {
  sample: string;
  atmosphere: string;
  stage: string;
}

/**
 * One explicitly confirmed curve in a workbook where several runs are stored
 * side by side. Nothing in this contract is inferred from column position,
 * numeric magnitude, or filename.
 */
export interface WideSeriesDefinition {
  seriesId: string;
  runId: string;
  temperature: WideSeriesTemperatureColumn;
  signal: WideSeriesSignal;
  derivative?: WideSeriesDerivative;
  heatingRate: {
    value: number;
    unit: HeatingRateUnit;
  };
  context: WideSeriesContext;
}

export interface WideSeriesTableOptions {
  /** Zero-based row containing the headings used for source provenance. */
  headerRow: number;
  decimalSeparator: '.' | ',';
  series: readonly WideSeriesDefinition[];
}

export type WideSeriesDiagnosticCode =
  | 'WIDE_HEADER_ROW_INVALID'
  | 'WIDE_SERIES_REQUIRED'
  | 'WIDE_SERIES_ID_INVALID'
  | 'WIDE_RUN_ID_INVALID'
  | 'WIDE_CONTEXT_REQUIRED'
  | 'WIDE_HEATING_RATE_INVALID'
  | 'WIDE_COLUMN_OUT_OF_RANGE'
  | 'WIDE_COLUMN_CONFLICT'
  | 'WIDE_ALPHA_REFERENCE_INVALID'
  | 'WIDE_DERIVATIVE_SIGNAL_MISMATCH'
  | 'WIDE_INCOMPLETE_SIGNAL_ROW'
  | 'WIDE_TRAILING_INCOMPLETE_ROW_EXCLUDED'
  | 'WIDE_INVALID_NUMERIC_VALUE'
  | 'WIDE_NONPHYSICAL_TEMPERATURE'
  | 'WIDE_TEMPERATURE_NOT_INCREASING'
  | 'WIDE_INCOMPLETE_DERIVATIVE_ROW'
  | 'WIDE_DERIVATIVE_ORPHAN'
  | 'WIDE_DERIVATIVE_GRID_MISMATCH'
  | 'WIDE_NUMERICAL_DERIVATIVE_UNAVAILABLE'
  | 'WIDE_ALPHA_GRID_INVALID'
  | 'WIDE_ALPHA_UNREACHABLE'
  | 'WIDE_ALPHA_MULTIPLE_CROSSINGS'
  | 'WIDE_ALPHA_DOWNWARD_CROSSING'
  | 'WIDE_ALPHA_TOUCH_WITHOUT_CROSSING'
  | 'WIDE_SELECTED_BRANCH_NON_MONOTONIC'
  | 'WIDE_MASS_OUTSIDE_REFERENCE'
  | 'WIDE_MASS_REFERENCE_EXCURSION_OUTSIDE_BRANCH';

export interface WideSeriesDiagnostic {
  severity: 'error' | 'warning';
  code: WideSeriesDiagnosticCode;
  message: string;
  seriesId?: string;
  runId?: string;
  sourceRow?: number;
  columnIndex?: number;
  alpha?: number;
}

export interface WideSeriesSourceColumns {
  temperatureColumnIndex: number;
  signalColumnIndex: number;
  derivativeTemperatureColumnIndex?: number;
  derivativeValueColumnIndex?: number;
}

/**
 * A source observation after unit conversion but before alpha-branch
 * selection. `alpha` may lie outside [0, 1] outside the requested analysis
 * branch; such excursions are never passed to the scientific core.
 */
export interface WideSeriesSourceObservation {
  seriesId: string;
  runId: string;
  sourceRow: number;
  derivativeSourceRow?: number;
  temperatureK: number;
  alpha: number;
  dAlphaDtPerMinute?: number;
  /** Raw primary rows used for an unsmoothed temperature-based derivative. */
  numericalDerivativeSourceRows?: readonly number[];
  heatingRateKPerMin: number;
  signalKind: WideSeriesSignal['kind'];
  /** Canonical milligrams for mass or fraction for massPercent. */
  massValue?: number;
  massReference?: {
    initialValue: number;
    finalValue: number;
    unit: 'mg' | 'fraction';
  };
  rawSignalValue: number;
  rawDerivativeValue?: number;
  context: WideSeriesContext;
  sourceColumns: WideSeriesSourceColumns;
}

export interface WideSeriesDataset {
  source: IngestionSource;
  headerRow: number;
  headers: readonly string[];
  series: readonly WideSeriesDefinition[];
  observations: readonly WideSeriesSourceObservation[];
}

export interface WideSeriesNormalizationResult {
  status: 'ready' | 'error';
  dataset: WideSeriesDataset | null;
  diagnostics: WideSeriesDiagnostic[];
}

export interface WideSeriesProjectedPoint {
  seriesId: string;
  runId: string;
  alpha: number;
  temperatureK: number;
  dAlphaDtPerMinute?: number;
  dAlphaDtSource?: AlphaDerivativeSource;
  heatingRateKPerMin: number;
  context: WideSeriesContext;
  sourceRows: readonly [number] | readonly [number, number];
  derivativeSourceRows?: readonly number[];
}

export interface WideSeriesBranchSelection {
  seriesId: string;
  runId: string;
  sourceObservationCount: number;
  selectedObservationCount: number;
  startSourceRow: number;
  endSourceRow: number;
  targetAlphaRange: readonly [number, number];
  selectedAlphaRange: readonly [number, number];
}

export interface WideSeriesProjectionResult {
  status: 'ready' | 'error';
  projectedPoints: WideSeriesProjectedPoint[];
  branches: WideSeriesBranchSelection[];
  diagnostics: WideSeriesDiagnostic[];
}

export interface WideSeriesTableProjectionResult extends WideSeriesProjectionResult {
  dataset: WideSeriesDataset | null;
}

export interface ColumnMapping {
  role: ColumnRole;
  columnIndex: number;
  header: string;
  unit?: ColumnUnit;
  temperatureKind?: TemperatureKind;
  confidence: 'exact' | 'alias' | 'manual';
}

export interface ColumnCandidate {
  role: ColumnRole;
  columnIndex: number;
  header: string;
  unit?: ColumnUnit;
  temperatureKind?: TemperatureKind;
  confidence: number;
  reason: string;
}

export type MappingNeedKind =
  | 'column'
  | 'unit'
  | 'sheet'
  | 'header_row'
  | 'layout'
  | 'wide_series'
  | 'scope_confirmation'
  | 'decimal_separator'
  | 'table_kind';

export interface MappingNeed {
  kind: MappingNeedKind;
  role?: ColumnRole;
  message: string;
  candidateColumns?: number[];
  allowedValues?: string[];
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface IngestionDiagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  sourceFile?: string;
  sheetName?: string;
  row?: number;
  column?: number;
  header?: string;
  role?: ColumnRole;
  value?: string;
  suggestion?: string;
}

export type ColumnSelection =
  | number
  | string
  | {
      column: number | string;
      unit?: ColumnUnit;
      temperatureKind?: TemperatureKind;
    };

export interface IngestionDefaults {
  heatingRate?: {
    value: number;
    unit: HeatingRateUnit;
  };
  runId?: string;
  sample?: string;
  atmosphere?: string;
  stage?: string;
}

export interface IngestionOptions {
  /** Zero-based row containing column headings. */
  headerRow?: number;
  /** Explicit delimiter for delimited text. Leave undefined for structural detection. */
  delimiter?: ',' | ';' | '\t' | '|';
  /** Decimal separator. `auto` requires an unambiguous pattern in the data. */
  decimalSeparator?: 'auto' | '.' | ',';
  /** Excel sheet name or zero-based sheet index. Required when a workbook has multiple sheets. */
  sheet?: string | number;
  /** Explicit selections override automatic column detection for the specified roles. */
  columnMapping?: Partial<Record<ColumnRole, ColumnSelection>>;
  /** Optional roles deliberately excluded after inspecting the source header. */
  ignoredRoles?: readonly ColumnRole[];
  /** Declares the meaning of a two-column beta/temperature table. */
  tableKind?: TableKind;
  /** Physical row layout; `wide-series` requires explicit per-series mappings. */
  layout?: TableLayout;
  /** Explicit side-by-side series definitions for `wide-series` layout. */
  wideSeries?: readonly WideSeriesDefinition[];
  /** Alpha grid used to validate and project the selected monotone branch. */
  wideAlphaGrid?: readonly number[];
  /** Explicit confirmation that non-selected populated columns are outside scope. */
  wideScopeConfirmed?: boolean;
  defaults?: IngestionDefaults;
  /** Number of raw rows retained for safe UI preview. */
  previewRows?: number;
}

/**
 * Batch imports may reuse one schema for every file or provide one schema per
 * file in the same stable order as the `files` argument.
 */
export type BatchIngestionOptions = IngestionOptions | readonly IngestionOptions[];

export interface IngestionSource {
  /**
   * Immutable content identity in `sha256:<lowercase digest>` form. Browser
   * File ingestion always supplies it; direct in-memory table adapters may
   * omit it and downstream reports must expose that as a traceability gap.
   */
  sourceFileId?: string;
  fileName: string;
  fileType: 'csv' | 'tsv' | 'txt' | 'xlsx' | 'table';
  sheetName?: string;
  availableSheets?: string[];
  delimiter?: string;
  decimalSeparator?: '.' | ',';
  /** Zero-based source row actually used as the table header. */
  headerRow?: number;
  /** Deterministically detected browser-side decoding used for delimited text. */
  textEncoding?: 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';
}

/**
 * Exact source-column decision applied while producing a normalized row.
 *
 * `sourceUnit` is null only for unitless metadata columns (for example run or
 * sample identifiers). Numeric mappings retain their resolved input unit so a
 * downstream report can distinguish the source representation from canonical
 * values without re-running header inference.
 */
export interface ProvenanceColumnMapping {
  role: ColumnRole;
  sourceColumnIndex: number;
  sourceHeader: string;
  sourceUnit: ColumnUnit | null;
  confidence: ColumnMapping['confidence'];
}

export interface RecordProvenance {
  /** Hash-derived identity of the physical source file, when available. */
  sourceFileId?: string;
  fileName: string;
  sheetName?: string;
  /** One-based row in the source file. */
  sourceRow: number;
  /**
   * One or two one-based source rows contributing to an exact or linearly
   * interpolated wide-series point. Long-format records leave this undefined.
   */
  sourceRows?: number[];
  /**
   * One or two one-based derivative-grid rows contributing to the projected
   * d(alpha)/dt value. Kept separate because primary and derivative grids may
   * originate from distinct source columns.
   */
  derivativeSourceRows?: number[];
  /**
   * Present on rows created by the ingestion pipeline. Optional only so legacy
   * hand-built records remain readable; report generation exposes an explicit
   * traceability gap when this audit payload is unavailable.
   */
  columnMappings?: ProvenanceColumnMapping[];
  inferences?: ProvenanceInference[];
}

export interface ProvenanceInference {
  field: 'heatingRateKPerMin';
  source: 'filename';
  rawMatch: string;
  normalizedValue: number;
  normalizedUnit: 'K/min';
}

/**
 * Unit-normalized, method-agnostic intermediate row.
 *
 * Temperature is always kelvin, time seconds, mass milligrams, alpha a 0..1
 * fraction, massPercent 0..100, dAlpha/dt fraction per minute, and heating rate
 * kelvin per minute.
 */
export interface NormalizedThermalRecord {
  temperatureK: number;
  temperatureKind: TemperatureKind;
  timeSeconds?: number;
  massMg?: number;
  massPercent?: number;
  alpha?: number;
  dAlphaDtPerMinute?: number;
  /** Provenance for a complete precomputed derivative; omitted means provided. */
  dAlphaDtSource?: AlphaDerivativeSource;
  heatingRateKPerMin?: number;
  runId: string;
  sample?: string;
  atmosphere?: string;
  stage?: string;
  peakResolved?: boolean;
  peakQuality?: BetaTpPeakQuality;
  peakSourceSignal?: BetaTpSourceSignal;
  peakAnalystConfirmed?: boolean;
  peakAmbiguous?: boolean;
  provenance: RecordProvenance;
}

export interface TAlphaBetaRow {
  temperatureK: number;
  alpha: number;
  heatingRateKPerMin: number;
  runId: string;
  sample?: string;
  atmosphere?: string;
  stage?: string;
  provenance: RecordProvenance;
}

export interface BetaTpRow {
  heatingRateKPerMin: number;
  peakTemperatureK: number;
  runId: string;
  sample?: string;
  atmosphere?: string;
  stage?: string;
  peakResolved?: boolean;
  peakQuality?: BetaTpPeakQuality;
  peakSourceSignal?: BetaTpSourceSignal;
  peakAnalystConfirmed?: boolean;
  peakAmbiguous?: boolean;
  provenance: RecordProvenance;
}

export interface ProcessedTables {
  tAlphaBeta: TAlphaBetaRow[];
  betaTp: BetaTpRow[];
}

export interface WideSeriesPopulatedColumnProfile {
  /** Zero-based source column index. */
  columnIndex: number;
  header: string;
  populatedRowCount: number;
  /** One-based first and last populated source rows below the selected header. */
  firstSourceRow: number;
  lastSourceRow: number;
}

export interface WideSeriesExcludedColumnAudit {
  /** Zero-based source column index. */
  columnIndex: number;
  sourceHeader: string;
  populatedRowCount: number;
  firstSourceRow: number;
  lastSourceRow: number;
}

export interface WideSeriesProjectedPointAudit {
  seriesId: string;
  runId: string;
  alpha: number;
  sourceRows: number[];
  derivativeSourceRows?: number[];
}

/**
 * JSON-serializable audit trail for an explicitly mapped side-by-side table.
 * It records the raw-table scope and every source-row contributor without
 * copying the full workbook into the analysis result.
 */
export interface WideSeriesIngestionAudit {
  layout: 'wide-series';
  source: {
    sourceFileId?: string;
    fileName: string;
    fileType: IngestionSource['fileType'];
    sheetName?: string;
  };
  /** Zero-based index used by the importer and its one-based source-row form. */
  headerRow: number;
  headerSourceRow: number;
  headers: string[];
  decimalSeparator: '.' | ',';
  alphaGrid: number[];
  series: WideSeriesDefinition[];
  rawObservationCount: number;
  projectedPointCount: number;
  branches: WideSeriesBranchSelection[];
  excludedPopulatedColumns: WideSeriesExcludedColumnAudit[];
  scopeConfirmed: boolean;
  points: WideSeriesProjectedPointAudit[];
}

export type IngestionStatus = 'ready' | 'needs_mapping' | 'error';

export interface IngestionResult {
  status: IngestionStatus;
  source: IngestionSource;
  headers: string[];
  preview: RawCell[][];
  mappings: ColumnMapping[];
  candidates: ColumnCandidate[];
  mappingNeeds: MappingNeed[];
  diagnostics: IngestionDiagnostic[];
  /** Empty whenever unresolved mapping needs or error diagnostics remain. */
  records: NormalizedThermalRecord[];
  tables: ProcessedTables;
  /**
   * Full-sheet column population profile for a selected wide-series header.
   * Computed from every row below the header, never from the truncated preview.
   */
  populatedColumns?: WideSeriesPopulatedColumnProfile[];
  /** Present only for a successfully projected `wide-series` import. */
  wideSeriesAudit?: WideSeriesIngestionAudit;
}

export interface BatchIngestionResult {
  status: IngestionStatus;
  files: IngestionResult[];
  diagnostics: IngestionDiagnostic[];
  records: NormalizedThermalRecord[];
  tables: ProcessedTables;
  /** One entry per successfully projected wide-series file in this batch. */
  wideSeriesAudit?: WideSeriesIngestionAudit[];
}

export interface ColumnDetectionResult {
  mappings: ColumnMapping[];
  candidates: ColumnCandidate[];
  needs: MappingNeed[];
}
