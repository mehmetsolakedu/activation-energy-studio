interface DiagnosticCopy {
  problem: string;
  risk: string;
  action: string;
}

const COPY: Readonly<Record<string, DiagnosticCopy>> = {
  UNKNOWN_TEMPERATURE_UNIT: {
    problem: 'The temperature unit is unknown.',
    risk: 'The Kelvin conversion cannot be verified, so the regression slope and apparent Ea may be incorrect.',
    action: 'Select °C or K for the temperature column.',
  },
  UNKNOWN_HEATING_RATE_UNIT: {
    problem: 'The heating-rate unit is unknown.',
    risk: 'An incorrect beta unit mis-scales logarithmic and derivative terms in the method equations.',
    action: 'Select K/min, °C/min, K/s, or °C/s for the heating rate.',
  },
  COOLING_UNSUPPORTED: {
    problem: 'The heating rate is zero or negative, which indicates cooling or an isothermal program.',
    risk: 'The isoconversional equations in this release require a positive linear heating ramp.',
    action: 'Load runs recorded at a positive constant beta and analyze cooling data separately.',
  },
  INSUFFICIENT_DISTINCT_HEATING_RATES: {
    problem: 'Fewer than three distinct positive heating rates are available.',
    risk: 'The isoconversional regression slope cannot be established reliably.',
    action: 'Provide at least three distinct beta runs for the same sample, atmosphere, and stage.',
  },
  TOO_FEW_HEATING_RATES: {
    problem: 'The method has too few heating rates.',
    risk: 'A two-point slope provides scientifically inadequate uncertainty information.',
    action: 'Provide at least three distinct positive heating rates.',
  },
  NO_COMMON_ALPHA_RANGE: {
    problem: 'The runs do not share a common alpha range.',
    risk: 'Temperatures cannot be compared at the same conversion level.',
    action: 'Select the same reaction stage and confirm that every run covers an overlapping conversion interval.',
  },
  NON_MONOTONIC_ALPHA: {
    problem: 'Alpha decreases at one or more points.',
    risk: 'Automatic branch selection may associate a conversion level with the wrong temperature.',
    action: 'Correct the baseline, mass direction, or stage selection and separate multistage regions.',
  },
  ALPHA_OUT_OF_RANGE: {
    problem: 'Alpha contains values outside the 0–1 interval.',
    risk: 'The conversion definition or percent/fraction unit may be incorrect.',
    action: 'Confirm the alpha unit and correct the conversion anchors when necessary.',
  },
  STAGE_WINDOW_REQUIRED: {
    problem: 'No reaction-stage window was selected for conversion from raw mass.',
    risk: 'Using whole-curve endpoints may combine multiple physical processes as one reaction.',
    action: 'Enter the stage start and end temperatures in the scientific-context section.',
  },
  INVALID_STAGE_WINDOW: {
    problem: 'The stage-temperature window is invalid.',
    risk: 'Invalid boundaries leave the reaction anchors undefined and may mix different physical regions.',
    action: 'Enter two finite temperatures with the start lower than the end.',
  },
  STAGE_WINDOW_NOT_BRACKETED: {
    problem: 'One or both stage boundaries are not bracketed by measured temperatures.',
    risk: 'Extrapolation or silent clipping would make the m0/mf anchors dependent on the sampling grid.',
    action: 'Choose a narrower window bracketed by measured points in every run.',
  },
  INCONSISTENT_MASS_QUANTITY: {
    problem: 'Absolute mass and mass-percentage rows are mixed within one run.',
    risk: 'Normalizing different quantities as one signal invalidates alpha and apparent Ea.',
    action: 'Use one complete mass column and unit for each run.',
  },
  INCONSISTENT_CONTEXT: {
    problem: 'The runs do not share the same sample, atmosphere, or reaction stage.',
    risk: 'Combining different physical processes in one regression makes the apparent Ea uninterpretable.',
    action: 'Analyze only runs from the same experimental context together.',
  },
  NONLINEAR_HEATING_UNSUPPORTED: {
    problem: 'The measured temperature-time ramp differs from the declared constant beta by more than 2%.',
    risk: 'This release assumes a constant linear heating ramp.',
    action: 'Use the linear-ramp region or select a method designed for programmed temperature.',
  },
  TARGET_ALPHA_OUTSIDE_COMMON_RANGE: {
    problem: 'The requested alpha level is not common to every run.',
    risk: 'Regressing an incomplete set of runs compromises cross-method comparisons.',
    action: 'Limit interpretation to the reported common range or provide data with broader overlap.',
  },
  INSUFFICIENT_RECIPROCAL_TEMPERATURE_SPREAD: {
    problem: 'The reciprocal-temperature values are too close to define a numerically reliable slope.',
    risk: 'A nearly singular regression can show a high R² while producing an arbitrarily large apparent activation energy.',
    action: 'Use heating-rate runs with resolvable temperature separation and report instrument temperature uncertainty when available.',
  },
  LOW_R2: {
    problem: 'The regression R² is below the quality threshold.',
    risk: 'A single-slope kinetic relationship may not explain the data adequately.',
    action: 'Inspect the raw curves, stage boundaries, and influential runs, and report the result as limited evidence.',
  },
  LIMITED_HEATING_RATES: {
    problem: 'Only three distinct heating rates are available.',
    risk: 'Calculation is possible, but slope uncertainty remains weakly constrained.',
    action: 'Add independent runs, preferably over a wider heating-rate range.',
  },
  MULTISTEP_EA_VARIATION: {
    problem: 'Ea(alpha) varies strongly across conversion.',
    risk: 'A single mean Ea may conceal multistage behavior.',
    action: 'Report the Ea(alpha) profile with its method and alpha range; do not present one value as a material constant.',
  },
  POSSIBLE_MULTISTEP_EA_VARIATION: {
    problem: 'Ea(alpha) variation suggests possible multistage behavior.',
    risk: 'A single mean value may obscure a change in the controlling process.',
    action: 'Inspect the stage boundaries and Ea(alpha) profile and limit interpretation to the selected interval.',
  },
  FRIEDMAN_NUMERICAL_DERIVATIVE: {
    problem: 'The Friedman method uses a numerical derivative.',
    risk: 'Differentiation amplifies noise and can increase apparent-Ea scatter.',
    action: 'Inspect derivative quality and compare the result with integral methods.',
  },
  INVALID_PROVIDED_DERIVATIVE: {
    problem: 'The supplied dAlpha/dt series is incomplete or contains non-finite values.',
    risk: 'Silently substituting a numerical derivative would change the user input and its provenance.',
    action: 'Provide finite dAlpha/dt values at every point or remove the derivative column explicitly.',
  },
  NUMERICAL_DERIVATIVE: {
    problem: 'The derivative was estimated numerically from raw data.',
    risk: 'Sampling frequency and noise can affect the Friedman result.',
    action: 'Compare Friedman with FWO, KAS, and Starink, and retain the derivative source in the report.',
  },
  KISSINGER_PEAK_MISSING: {
    problem: 'No beta–Tp peak-temperature data are available for Kissinger analysis.',
    risk: 'Conversion temperatures on a curve cannot substitute for peak temperature.',
    action: 'Load a separate beta–Tp table or do not report a Kissinger result.',
  },
  KISSINGER_PEAK_UNRESOLVED: {
    problem: 'One or more beta–Tp rows lack an explicit resolved peak identity.',
    risk: 'An unresolved shoulder or event switch can make different heating rates refer to different physical processes.',
    action: 'Resolve one common physical peak at every heating rate or omit the Kissinger result.',
  },
  KISSINGER_PEAK_BOUNDARY: {
    problem: 'One or more selected peaks lie at a temperature-window boundary.',
    risk: 'A boundary value does not establish an interior local rate maximum.',
    action: 'Extend or correct the measured stage window and verify an interior peak with observations on both sides.',
  },
  KISSINGER_PEAK_QUALITY_UNVERIFIED: {
    problem: 'Peak quality is missing, unknown, shoulder-like, or otherwise not clear-interior.',
    risk: 'A high-R² Kissinger line can still combine unresolved or multistep peak shifts.',
    action: 'Classify every peak as clear-interior using the source curve, or do not calculate Kissinger Ea.',
  },
  KISSINGER_PEAK_SIGNAL_UNVERIFIED: {
    problem: 'The signal used to select the peak is not recorded.',
    risk: 'A temperature maximum from the wrong signal is not a defensible reaction-rate peak.',
    action: 'Record whether Tp came from positive mass-loss rate, positive dAlpha/dt, or a documented external beta–Tp table.',
  },
  KISSINGER_PEAK_UNCONFIRMED: {
    problem: 'The analyst has not explicitly confirmed the peak evidence.',
    risk: 'Imported labels alone cannot establish that the same physical event was selected at every heating rate.',
    action: 'Inspect the source evidence and explicitly confirm all beta–Tp rows before calculation.',
  },
  TOO_FEW_KISSINGER_PEAKS: {
    problem: 'Fewer than three independent beta–Tp pairs are available.',
    risk: 'The peak-shift regression slope is insufficiently constrained.',
    action: 'Provide verified peak temperatures at three or more distinct heating rates.',
  },
  INVALID_HEATING_RATE: {
    problem: 'A heating rate cannot be converted to a finite positive value.',
    risk: 'The logarithmic terms in the isoconversional and Kissinger equations are undefined.',
    action: 'Correct the heating-rate value and unit and provide a positive constant beta.',
  },
  UNKNOWN_TIME_UNIT: {
    problem: 'The time unit is unknown.',
    risk: 'Direct dAlpha/dt calculation is not traceable without a verified time scale.',
    action: 'Select seconds or minutes, or retain the temperature-derived limitation explicitly.',
  },
  INVALID_TIME_SERIES: {
    problem: 'The mapped time series is incomplete or contains non-finite values.',
    risk: 'Silently falling back to temperature-based differentiation could bypass measured-ramp validation.',
    action: 'Provide a finite time value at every point or remove the time mapping explicitly.',
  },
  WIDE_PROJECTED_DERIVATIVE_MISSING: {
    problem: 'A projected wide-series run is missing its complete derivative values or derivative source-row provenance.',
    risk: 'Recalculating dAlpha/dt from the target-alpha projection would make the Friedman result depend on the reporting grid.',
    action: 'Re-import the original wide-series file so the derivative is calculated from retained raw observations before alpha projection.',
  },
  TIME_NOT_INCREASING: {
    problem: 'Time is not strictly increasing in acquisition order.',
    risk: 'A direct dAlpha/dt derivative is unreliable.',
    action: 'Correct the time column and acquisition order or report the temperature-based derivative limitation.',
  },
  TOO_FEW_POINTS: {
    problem: 'A run contains fewer than three usable measurement points.',
    risk: 'Conversion range, interpolation, and derivative estimates cannot be established reliably.',
    action: 'Provide at least three valid points in acquisition order, preferably the complete raw curve.',
  },
  NON_FINITE_VALUE: {
    problem: 'A required field contains NaN, infinity, or a value that cannot be parsed as a number.',
    risk: 'Unit conversion, interpolation, or regression becomes undefined.',
    action: 'Correct the source cell or export settings and reload finite numeric values.',
  },
  TEMPERATURE_NOT_INCREASING: {
    problem: 'Temperature is not strictly increasing in acquisition order.',
    risk: 'A single heating ramp and unique T_alpha interpolation cannot be established.',
    action: 'Verify the acquisition order and program; do not sort cooling or segmented data into an artificial ramp.',
  },
  ALPHA_SOURCE_MISSING: {
    problem: 'The run has neither a complete alpha column nor a complete mass signal.',
    risk: 'Conversion progress, T_alpha, and Ea(alpha) cannot be calculated.',
    action: 'Provide complete alpha data or select a mass column with stage-specific m0 and mf values.',
  },
  MASS_REFERENCE_REQUIRED: {
    problem: 'Explicit m0 and mf references were not provided for the selected stage.',
    risk: 'Automatic whole-curve endpoints may mix stages and change alpha normalization.',
    action: 'Define m0 and mf from documented start and end boundaries for the selected stage.',
  },
  MASS_NORMALIZATION_INVALID: {
    problem: 'The mass references do not define a valid alpha normalization.',
    risk: 'A zero or inconsistent mass difference makes conversion undefined or reverses its direction.',
    action: 'Confirm that m0 and mf are finite, distinct, and physically consistent with the stage.',
  },
  INVALID_ALPHA_ANCHORS: {
    problem: 'The selected mass anchors are invalid or outside the stage.',
    risk: 'Equal, non-finite, reversed, or unstable anchors compromise the entire alpha scale.',
    action: 'Select finite, distinct, physically consistent anchors within the measured stage.',
  },
  ALPHA_NOT_MONOTONIC: {
    problem: 'Alpha is not monotonically increasing across the selected stage.',
    risk: 'The inverse T_alpha interpolation is not unique.',
    action: 'Verify stage selection, signal direction, and normalization without concealing the issue by sorting or excessive smoothing.',
  },
  ALPHA_RANGE_EMPTY: {
    problem: 'The run has no usable conversion interval.',
    risk: 'No common alpha target or corresponding T_alpha can be compared.',
    action: 'Provide a raw curve that spans a measurable conversion change within the selected stage.',
  },
  AMBIGUOUS_ALPHA_CROSSING: {
    problem: 'The requested alpha occurs at multiple points across a temperature plateau.',
    risk: 'Selecting one arbitrary T_alpha would make the regression slope arbitrary.',
    action: 'Choose a common alpha outside the plateau or improve the stage definition or data resolution.',
  },
  DUPLICATE_RUN_ID: {
    problem: 'Multiple physical runs use the same run identifier.',
    risk: 'Source rows, heating rates, and run-level diagnostics may be mixed.',
    action: 'Assign a unique identifier to every physical run, including replicate measurements.',
  },
  DUPLICATE_HEATING_RATE: {
    problem: 'Multiple runs use the same heating rate.',
    risk: 'Treating replicates as independent regression points would inflate n and the degrees of freedom.',
    action: 'Keep them as labeled replicates; add distinct beta values to increase regression information.',
  },
  NARROW_HEATING_RATE_RANGE: {
    problem: 'The heating rates occupy a narrow range.',
    risk: 'Limited regression leverage can increase slope and apparent-Ea uncertainty.',
    action: 'Add independent beta values over a wider experimentally defensible range.',
  },
  NARROW_HEATING_RATE_SPAN: {
    problem: 'The highest heating rate is less than twice the lowest rate.',
    risk: 'A narrow beta span weakly constrains the regression slope.',
    action: 'Add independent runs that extend the lowest-to-highest beta ratio to at least two when feasible.',
  },
  INCONSISTENT_SAMPLE: {
    problem: 'Different sample identifiers are assigned to one regression.',
    risk: 'Material differences may be confounded with heating-rate effects.',
    action: 'Analyze each sample separately or correct the sample metadata from the source record.',
  },
  INCONSISTENT_ATMOSPHERE: {
    problem: 'Runs in one regression were measured under different atmospheres.',
    risk: 'Atmosphere can change the reaction pathway and apparent Ea.',
    action: 'Analyze each atmosphere separately or correct the source metadata.',
  },
  INCONSISTENT_STAGE: {
    problem: 'Different reaction stages are assigned to one regression.',
    risk: 'Combining T_alpha or Tp values from different physical events does not define one kinetic slope.',
    action: 'Separate runs by physical stage and do not regress across stages.',
  },
  AMBIGUOUS_STAGE: {
    problem: 'A common physical reaction stage cannot be assigned confidently to every run.',
    risk: 'T_alpha or Tp may not track the same process across overlapping or multistage events.',
    action: 'Select the stage using independent evidence or do not report the affected calculation.',
  },
  MISSING_CONTEXT_METADATA: {
    problem: 'Sample, atmosphere, or reaction-stage metadata are missing from one or more runs.',
    risk: 'Run comparability and experimental context cannot be audited completely.',
    action: 'Complete the metadata from experimental records or report the limitation and narrow the interpretation.',
  },
  INVALID_ALPHA_GRID: {
    problem: 'The requested alpha targets are not unique, finite, within 0–1, and inside the common conversion range.',
    risk: 'T_alpha and method regressions are undefined at invalid or inaccessible targets.',
    action: 'Select unique finite alpha targets inside the common conversion interval.',
  },
  REGRESSION_FAILED: {
    problem: 'The method regression could not be constructed numerically.',
    risk: 'Apparent Ea cannot be calculated without a valid slope.',
    action: 'Inspect usable rates, temperature or derivative values, common alpha range, and replicates; do not report a value.',
  },
  NON_POSITIVE_ACTIVATION_ENERGY: {
    problem: 'The calculated activation energy is zero or negative.',
    risk: 'The result cannot be interpreted as a conventional positive energy barrier.',
    action: 'Verify units, temperature direction, stage selection, and regression without changing the sign artificially.',
  },
  FRIEDMAN_DERIVATIVE_UNAVAILABLE: {
    problem: 'At least one required heating-rate run lacks a finite positive derivative at the requested alpha, so Friedman is refused there.',
    risk: 'The Friedman logarithm and same-alpha cross-rate comparison require every included run to contribute a finite positive dAlpha/dt value.',
    action: 'Provide verified finite positive derivative data at this alpha for every required run, with at least three distinct beta values overall.',
  },
  FRIEDMAN_NON_POSITIVE_RATE: {
    problem: 'At least one required heating-rate run has a non-positive derivative at the requested alpha, so Friedman is refused there.',
    risk: 'ln(dAlpha/dt) is undefined, and silently dropping a required run would change the cross-rate comparison.',
    action: 'Verify alpha monotonicity, time and beta units, and derivative noise; provide a positive value for every required run or do not report Friedman.',
  },
  KISSINGER_PEAK_OUTSIDE_RUN_RANGE: {
    problem: 'A Kissinger peak temperature lies outside the measured temperature range.',
    risk: 'An unobserved or incorrectly scaled Tp invalidates the peak-shift regression.',
    action: 'Correct the Tp unit and source record or select the measured peak without extrapolation.',
  },
  KISSINGER_COMPLEXITY_UNDERPOWERED: {
    problem: 'The Kissinger design has fewer than five rates or less than a five-fold rate span.',
    risk: 'Curvature and kinetic complexity are weakly tested, so a linear fit may appear deceptively adequate.',
    action: 'Add distinct beta values over a wider range and interpret the current result as a linear approximation.',
  },
  OVERLAPPING_PEAKS: {
    problem: 'Kissinger peaks overlap or their identities are ambiguous in one or more runs.',
    risk: 'The same physical peak cannot be shown to persist across heating rates.',
    action: 'Resolve and match the same stage independently at every rate or do not report Kissinger.',
  },
  NONPOSITIVE_APPARENT_EA: {
    problem: 'The method produced a zero or negative apparent Ea.',
    risk: 'The value cannot be interpreted as a conventional positive barrier and may indicate data or model incompatibility.',
    action: 'Inspect units, temperature direction, stage, and regression; do not take the absolute value.',
  },
  INGESTION_NOT_READY: {
    problem: 'Mapping is incomplete for one or more files.',
    risk: 'Calculation with an ambiguous column or unit can create a silent scientific error.',
    action: 'Complete and validate every required selection in the guided mapping interface.',
  },
  HEATING_RATE_MISSING: {
    problem: 'No heating rate was found for the run.',
    risk: 'The isoconversional equation cannot be constructed without beta.',
    action: 'Select a heating-rate column or enter the constant beta for the file.',
  },
  HEATING_RATE_CONFLICT: {
    problem: 'One run identifier contains multiple heating rates.',
    risk: 'The beta represented by that run is ambiguous.',
    action: 'Correct the run identifier or separate each heating rate into its own run.',
  },
  missing_curve_signal: {
    problem: 'No alpha, mass, or mass-percentage signal was found for the curve.',
    risk: 'Conversion progress cannot be calculated.',
    action: 'Select the correct signal column and unit in the mapping interface.',
  },
  invalid_numeric_value: {
    problem: 'A numeric cell could not be parsed.',
    risk: 'Mixed decimal conventions or text cells can disrupt the data sequence.',
    action: 'Correct the previewed cell and select the appropriate decimal separator.',
  },
  nonpositive_heating_rate: {
    problem: 'A heating rate is zero or negative.',
    risk: 'Logarithmic method terms are undefined.',
    action: 'Confirm the positive experimental heating rate and its unit.',
  },
  heating_rate_inferred_from_filename: {
    problem: 'The heating rate was inferred from an explicit value in the file name.',
    risk: 'An incorrect file name may label the run with the wrong beta.',
    action: 'Compare the inferred value with the experimental record and override it when necessary.',
  },
  xlsx_sheet_not_found: {
    problem: 'The selected XLSX worksheet was not found.',
    risk: 'An invalid sheet selection prevents deterministic data ingestion.',
    action: 'Select one of the available worksheets.',
  },
  unsupported_file_type: {
    problem: 'The file type is unsupported.',
    risk: 'Its contents cannot be parsed safely and deterministically.',
    action: 'Export the data as CSV, TSV, TXT, or an unencrypted XLSX workbook.',
  },
  text_decode_failed: {
    problem: 'The text-file encoding could not be decoded reliably.',
    risk: 'Corrupted headers or numbers can lead to incorrect mapping and scientific output.',
    action: 'Export the file as UTF-8, UTF-16 LE/BE, or Windows-1252 text.',
  },
};

export function diagnosticMessage(code: string, fallback: string): string {
  const copy = COPY[code];
  if (!copy) return fallback;
  return `Problem: ${copy.problem} Why it matters: ${copy.risk} Action: ${copy.action}`;
}

export function hasEnglishDiagnosticCopy(code: string): boolean {
  return code in COPY;
}
