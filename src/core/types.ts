export type TemperatureUnit = "K" | "C" | "°C" | "unknown";
export type HeatingRateUnit =
  | "K/min"
  | "C/min"
  | "°C/min"
  | "K/s"
  | "C/s"
  | "°C/s"
  | "unknown";
export type TimeUnit = "s" | "min" | "unknown";

export type IsoConversionalMethod = "FWO" | "KAS" | "STARINK" | "FRIEDMAN";
export type MethodName = IsoConversionalMethod | "KISSINGER";
export type CalculationStatus = "success" | "partial" | "refused";
export type DiagnosticSeverity = "warning" | "refusal";

export type DiagnosticCode =
  | "UNKNOWN_TEMPERATURE_UNIT"
  | "UNKNOWN_HEATING_RATE_UNIT"
  | "INVALID_HEATING_RATE"
  | "COOLING_UNSUPPORTED"
  | "UNKNOWN_TIME_UNIT"
  | "INVALID_TIME_SERIES"
  | "TIME_NOT_INCREASING"
  | "NONLINEAR_HEATING_UNSUPPORTED"
  | "TOO_FEW_POINTS"
  | "NON_FINITE_VALUE"
  | "TEMPERATURE_NOT_INCREASING"
  | "ALPHA_SOURCE_MISSING"
  | "MASS_REFERENCE_REQUIRED"
  | "MASS_NORMALIZATION_INVALID"
  | "INVALID_ALPHA_ANCHORS"
  | "ALPHA_OUT_OF_RANGE"
  | "ALPHA_NOT_MONOTONIC"
  | "NON_MONOTONIC_ALPHA"
  | "ALPHA_RANGE_EMPTY"
  | "AMBIGUOUS_ALPHA_CROSSING"
  | "DUPLICATE_RUN_ID"
  | "TOO_FEW_HEATING_RATES"
  | "INSUFFICIENT_DISTINCT_HEATING_RATES"
  | "DUPLICATE_HEATING_RATE"
  | "LIMITED_HEATING_RATES"
  | "NARROW_HEATING_RATE_RANGE"
  | "NARROW_HEATING_RATE_SPAN"
  | "INCONSISTENT_SAMPLE"
  | "INCONSISTENT_ATMOSPHERE"
  | "INCONSISTENT_STAGE"
  | "INCONSISTENT_CONTEXT"
  | "AMBIGUOUS_STAGE"
  | "MISSING_CONTEXT_METADATA"
  | "NO_COMMON_ALPHA_RANGE"
  | "INVALID_ALPHA_GRID"
  | "TARGET_ALPHA_OUTSIDE_COMMON_RANGE"
  | "INSUFFICIENT_RECIPROCAL_TEMPERATURE_SPREAD"
  | "REGRESSION_FAILED"
  | "LOW_R2"
  | "NON_POSITIVE_ACTIVATION_ENERGY"
  | "FRIEDMAN_DERIVATIVE_UNAVAILABLE"
  | "FRIEDMAN_NON_POSITIVE_RATE"
  | "FRIEDMAN_NUMERICAL_DERIVATIVE"
  | "INVALID_PROVIDED_DERIVATIVE"
  | "NUMERICAL_DERIVATIVE"
  | "KISSINGER_PEAK_MISSING"
  | "KISSINGER_PEAK_UNRESOLVED"
  | "KISSINGER_PEAK_BOUNDARY"
  | "KISSINGER_PEAK_QUALITY_UNVERIFIED"
  | "KISSINGER_PEAK_SIGNAL_UNVERIFIED"
  | "KISSINGER_PEAK_UNCONFIRMED"
  | "KISSINGER_PEAK_OUTSIDE_RUN_RANGE"
  | "TOO_FEW_KISSINGER_PEAKS"
  | "KISSINGER_COMPLEXITY_UNDERPOWERED"
  | "OVERLAPPING_PEAKS"
  | "NONPOSITIVE_APPARENT_EA"
  | "MULTISTEP_EA_VARIATION"
  | "POSSIBLE_MULTISTEP_EA_VARIATION";

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly method?: MethodName;
  readonly runIds?: readonly string[];
  readonly alpha?: number;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * A raw point after column mapping. Units belong to the enclosing run.
 * `alpha` and `mass` are alternatives; if alpha is complete it takes priority.
 */
export interface ThermalPoint {
  readonly temperature: number;
  readonly time?: number;
  readonly mass?: number;
  readonly alpha?: number;
  /** Optional externally calculated derivative, explicitly expressed per minute. */
  readonly dAlphaDtPerMinute?: number;
  /**
   * Provenance for a complete precomputed derivative series. Omitted values are
   * treated as externally provided for backward compatibility. `temperature`
   * identifies an unsmoothed derivative calculated upstream from retained raw
   * alpha/temperature observations before target-alpha projection.
   */
  readonly dAlphaDtSource?: "provided" | "temperature";
}

export interface MassReference {
  readonly initialMass: number;
  readonly finalMass: number;
}

export interface ThermalRun {
  readonly id: string;
  readonly heatingRate: number;
  readonly heatingRateUnit: HeatingRateUnit;
  readonly temperatureUnit: TemperatureUnit;
  readonly timeUnit?: TimeUnit;
  readonly points: readonly ThermalPoint[];
  readonly massReference?: MassReference;
  /** Peak temperature in `temperatureUnit`, when independently selected. */
  readonly peakTemperature?: number;
  /** True when peak identity/overlap has not been resolved by the user. */
  readonly peakAmbiguous?: boolean;
  /** Explicit analyst assertion that one peak identity has been resolved. */
  readonly peakResolved?: boolean;
  readonly peakQuality?: KissingerPeakQuality;
  readonly peakSourceSignal?: KissingerPeakSourceSignal;
  readonly peakAnalystConfirmed?: boolean;
  readonly sampleId?: string;
  readonly atmosphere?: string;
  readonly stage?: string;
}

export type DerivativeSource = "provided" | "time" | "temperature" | "unavailable";

export interface PreparedPoint {
  readonly temperatureK: number;
  readonly alpha: number;
  readonly timeMinutes?: number;
  readonly dAlphaDtPerMinute?: number;
}

export interface PreparedRun {
  readonly id: string;
  readonly heatingRateKPerMinute: number;
  readonly points: readonly PreparedPoint[];
  readonly derivativeSource: DerivativeSource;
  readonly peakTemperatureK?: number;
  readonly peakAmbiguous?: boolean;
  readonly peakResolved?: boolean;
  readonly peakQuality?: KissingerPeakQuality;
  readonly peakSourceSignal?: KissingerPeakSourceSignal;
  readonly peakAnalystConfirmed?: boolean;
  readonly sampleId?: string;
  readonly atmosphere?: string;
  readonly stage?: string;
}

export interface MassNormalizationOptions {
  readonly initialMass: number;
  readonly finalMass: number;
}

export interface PreparationResult {
  readonly runs: readonly PreparedRun[];
  readonly refusals: readonly Diagnostic[];
  readonly warnings: readonly Diagnostic[];
}

export interface RunPreparationResult {
  readonly run?: PreparedRun;
  readonly refusals: readonly Diagnostic[];
  readonly warnings: readonly Diagnostic[];
}

export type RegressionInputAggregation =
  | "none"
  | "arithmetic-mean-physical-scale-by-heating-rate";

export interface RegressionInputGroup {
  readonly groupId: string;
  readonly sourceRunIds: readonly string[];
  readonly replicateCount: number;
  readonly aggregation:
    | "single-run"
    | "arithmetic-mean-physical-scale-by-heating-rate";
  readonly heatingRateKPerMinute: number;
  readonly temperatureK: number;
  readonly dAlphaDtPerMinute?: number;
  readonly x: number;
  readonly y: number;
  readonly temperatureSampleStandardDeviationK: number | null;
  readonly derivativeSampleStandardDeviationPerMinute?: number | null;
}

export interface RegressionResult {
  /** Number of equal-weight distinct-heating-rate inputs used by OLS. */
  readonly n: number;
  /** Number of valid run/peak observations before heating-rate grouping. */
  readonly rawObservationCount: number;
  readonly residualDegreesOfFreedom: number;
  readonly inputAggregation: RegressionInputAggregation;
  readonly inputGroups: readonly RegressionInputGroup[];
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly slope: number;
  readonly intercept: number;
  readonly fitted: readonly number[];
  readonly residuals: readonly number[];
  readonly sse: number;
  readonly r2: number;
  readonly residualStandardError: number;
  readonly slopeStandardError: number;
  readonly slopeConfidence95: readonly [number, number];
}

export interface MethodObservation {
  readonly runId: string;
  readonly heatingRateKPerMinute: number;
  readonly temperatureK: number;
  readonly x: number;
  readonly y: number;
  readonly dAlphaDtPerMinute?: number;
}

export interface AlphaActivationEnergyEstimate {
  readonly alpha: number;
  readonly activationEnergyKJPerMol: number;
  readonly regression: RegressionResult;
  readonly observations: readonly MethodObservation[];
}

export interface AlphaMethodResult {
  readonly method: IsoConversionalMethod;
  readonly resultType: "isoconversional";
  readonly formulaId: string;
  readonly status: CalculationStatus;
  readonly estimates: readonly AlphaActivationEnergyEstimate[];
  readonly refusals: readonly Diagnostic[];
  readonly warnings: readonly Diagnostic[];
}

export type KissingerPeakQuality =
  | "clear-interior"
  | "boundary"
  | "shoulder"
  | "multiple-overlapping"
  | "unknown";

export type KissingerPeakSourceSignal =
  | "positive-mass-loss-rate"
  | "positive-dalpha-dt"
  | "external-beta-tp-table";

export interface KissingerPeak {
  readonly runId: string;
  readonly heatingRateKPerMinute: number;
  readonly peakTemperatureK: number;
  readonly ambiguous?: boolean;
  readonly peakResolved?: boolean;
  readonly peakQuality?: KissingerPeakQuality;
  readonly sourceSignal?: KissingerPeakSourceSignal;
  readonly analystConfirmed?: boolean;
  readonly stage?: string;
}

export interface KissingerResult {
  readonly method: "KISSINGER";
  readonly resultType: "peak";
  readonly alpha: null;
  readonly formulaId: "kissinger_peak_ln_v1";
  readonly status: CalculationStatus;
  readonly activationEnergyKJPerMol?: number;
  readonly regression?: RegressionResult;
  readonly observations: readonly MethodObservation[];
  readonly refusals: readonly Diagnostic[];
  readonly warnings: readonly Diagnostic[];
}

export interface EligibilityResult {
  readonly eligible: boolean;
  readonly commonAlphaRange?: readonly [number, number];
  readonly distinctHeatingRates: number;
  readonly refusals: readonly Diagnostic[];
  readonly warnings: readonly Diagnostic[];
}

export interface MethodCalculationOptions {
  /** Finite inclusive threshold in [0, 1]; invalid direct-core values throw. */
  readonly minR2Warning?: number;
}

export interface AnalysisOptions extends MethodCalculationOptions {
  readonly alphaValues?: readonly number[];
  readonly methods?: readonly IsoConversionalMethod[];
  readonly includeKissinger?: boolean;
  /** Explicit beta-Tp observations for a standalone or independently mapped peak analysis. */
  readonly kissingerPeaks?: readonly KissingerPeak[];
}

export interface ActivationEnergyAnalysis {
  readonly status: CalculationStatus;
  readonly preparedRuns: readonly PreparedRun[];
  readonly eligibility: EligibilityResult;
  readonly methods: readonly AlphaMethodResult[];
  readonly kissinger?: KissingerResult;
  readonly refusals: readonly Diagnostic[];
  readonly warnings: readonly Diagnostic[];
  readonly constants: {
    readonly gasConstantJPerMolK: number;
  };
}
