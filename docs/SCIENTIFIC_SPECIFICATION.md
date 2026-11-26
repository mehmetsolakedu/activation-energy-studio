# Scientific Computation Specification (`activation-energy-core/v3`)

This specification defines the mathematical formulations, input validation rules, numerical differentiation, regression conditioning, and reproducibility schema implemented in Activation Energy Studio version 0.4.1 (`activation-energy-core/v3` and report schema `activation-energy-studio/project-report/v7`). Historical release packages (`v0.2.0` through `v0.4.0`) remain preserved under their original manifests.

## 1. Supported files and bounded ingestion

Supported tabular input extensions are `.csv`, `.tsv`, `.txt`, and `.xlsx` (including whitespace-delimited text tables). Macro-enabled `.xlsm` workbooks are rejected. Any `.xlsx` archive containing VBA modules, external workbook link parts, external relationships, or formula cells (even when cached values are present) is rejected prior to kinetic parsing.

One import batch is bounded to 64 files, 128 MiB aggregate declared bytes, and four concurrent parsing workers. Byte-identical source files generate an explicit warning rather than automatic deduplication so that experimental identity remains analyst-confirmed.

## 2. Numerical derivatives on irregular grids

When Friedman analysis evaluates a numerical derivative, the software applies a nonuniform three-point Lagrange finite-difference formula at interior observations and the corresponding nonuniform three-point one-sided formula at endpoints (reverting to a two-point difference only for two-point series). A strictly increasing, finite time axis is used directly when available; otherwise a strictly increasing, finite temperature axis is differentiated and scaled by the confirmed positive heating rate. Partially missing, non-finite, or non-increasing axes are rejected without smoothing or imputation.

## 3. Friedman complete-run requirement

At each target conversion `alpha`, every retained run must contribute a finite `T_alpha` and a finite, positive `d(alpha)/dt`. If any run lacks a valid positive derivative at that `alpha`, the Friedman calculation at that conversion is rejected with `FRIEDMAN_DERIVATIVE_UNAVAILABLE` rather than dropping individual runs. At least three distinct positive heating rates are required after replicate aggregation.

## 4. Regression, confidence intervals, and variable-Ea integral warnings

Ordinary least squares (OLS) is evaluated with centered, scale-conditioned arithmetic and compensated summation. Regressions failing the versioned inverse-temperature spread floor or producing non-finite quantities are rejected.

Two-sided 95% slope and apparent activation-energy confidence intervals use exact Student-`t` critical quantiles for `df = n - 2`. Whenever a two-sided 95% confidence interval reaches or crosses zero apparent activation energy (`ACTIVATION_ENERGY_CI_INCLUDES_NONPOSITIVE`), the estimate is classified as `CALCULATED_UNRELIABLE`. Whenever relative profile variation across conversion reaches 10% or more (`POSSIBLE_MULTISTEP_EA_VARIATION` or `MULTISTEP_EA_VARIATION`), cumulative integral methods (`FWO`, `KAS`, and `Starink`) attach `INTEGRAL_METHOD_VARIABLE_EA_BIAS` recommending comparison against differential `Friedman` or small-interval incremental integration.

## 5. Method equations and nonpositive estimates

The five implemented linearizations are:

- FWO: `ln(beta)` against `1/T_alpha`, with
  `Ea [kJ/mol] = -R*slope/(1.052*1000)`;
- KAS: `ln(beta/T_alpha^2)` against `1/T_alpha`, with
  `Ea [kJ/mol] = -R*slope/1000`;
- Starink: `ln(beta/T_alpha^1.92)` against `1/T_alpha`, with
  `Ea [kJ/mol] = -R*slope/(1.0008*1000)`;
- Friedman: `ln(d(alpha)/dt)` against `1/T_alpha`, with
  `Ea [kJ/mol] = -R*slope/1000`;
- Kissinger: `ln(beta/Tp^2)` against `1/Tp`, with
  `Ea [kJ/mol] = -R*slope/1000`, in its separate peak-temperature pathway.

Here `R = 8.31446261815324 J mol^-1 K^-1`; division by 1000 converts joules per mole to kilojoules per mole. The FWO relation uses the classical Doyle slope factor `1.052`, and Starink uses temperature exponent `1.92` with slope factor `1.0008`.

For every method, a nonnegative fitted slope or nonpositive apparent `Ea` is rejected with `NONPOSITIVE_APPARENT_EA` without emitting numerical `Ea`, standard error, or confidence-interval fields.

## 6. Kissinger peak-temperature pathway

Imported `beta-Tp` tables require confirmed same-stage peak temperatures under consistent sample, atmosphere, stage, and positive linear-heating metadata. Curve-derived `Tp` requires a unique interior rate maximum for each run; boundary extrema, unresolved shoulders, cooling segments, nonlinear heating, or fewer than three distinct heating rates are rejected.

## 7. Reproducibility record

Every exported report records input SHA-256 digests, column mappings, canonical unit conversions, method and formula identifiers, thresholds, active warnings and rejections, scientific dispositions, `activation-energy-core/v3`, and `activation-energy-studio/project-report/v7`. JSON serves as the primary machine-readable provenance record, accompanied by synchronized CSV and PDF exports.
