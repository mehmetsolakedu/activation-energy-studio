# Scientific Computation Specification v1.1 Addendum

**Status:** Normative correction contract for the unreleased v0.4.0 audit
candidate  
**Date:** 2026-09-09  
**Base contract:** source-tree `01_SCIENTIFIC_SPEC_V1.md`, SHA-256
`d1679dfaf20b6d1ea8e2889abe88c4357fa1854d2172f42eeb90a8af2ad022e4`  
**Scope:** Only the clauses below supersede the immutable v1 contract. All
other v1 clauses remain in force.

This addendum must not be used to relabel or reinterpret historical v0.2.0,
v0.3.x, journal-submission, or Zenodo artifacts. It defines candidate behavior
only when the software identifies scientific core
`activation-energy-core/v3` and report schema
`activation-energy-studio/project-report/v7`.

## 1. Supported files and bounded ingestion

The supported value-only data extensions are `.csv`, `.tsv`, `.txt`, and
`.xlsx`. TXT may be tabular whitespace-delimited text. Macro-enabled `.xlsm`
is unsupported. An `.xlsx` package that contains or declares VBA, an external
link part, or an external relationship is rejected before workbook parsing.
Formula cells are rejected even when cached values are present.

One import batch is limited to 64 files, 128 MiB aggregate declared bytes, and
four concurrent ingestion workers. Per-file and OOXML resource ceilings remain
versioned in the source. Byte-identical sources are warned about, but are not
silently deduplicated or automatically treated as the same experiment because
that identity requires scientific context.

## 2. Numerical derivatives on irregular grids

When Friedman uses a numerical derivative, the candidate uses the nonuniform
three-point finite-difference formula at interior observations and the
corresponding nonuniform three-point one-sided formula at each endpoint. A
strictly increasing, finite time axis is used when available; otherwise a
strictly increasing, finite temperature axis is used and `d(alpha)/dt` is
obtained from the confirmed positive heating rate. Degenerate, non-finite, or
non-increasing axes are refusals. Smoothing and silent imputation remain
forbidden.

## 3. Friedman complete-run rule

For each target `alpha`, every required run in the analysis group is part of
the evidence contract. If any required run lacks finite `T_alpha` or finite,
strictly positive `d(alpha)/dt`, that complete Friedman result is rejected with
`FRIEDMAN_DERIVATIVE_UNAVAILABLE`. The implementation must not drop the invalid
run and regress the remainder. At least three distinct positive heating rates
are still required after valid replicate aggregation.

## 4. Regression and confidence intervals

OLS is evaluated with centered and scale-conditioned arithmetic. A regression
is refused when inverse-temperature spread does not pass the versioned
numerical floor or any fitted quantity is non-finite. That floor is an
engineering guard and is not an instrument-specific metrological threshold.

Two-sided 95% slope and apparent-activation-energy intervals use the exact
Student-t critical value for `df = n - 2`. If an otherwise calculated interval
reaches or crosses zero apparent activation energy, the result is
`CALCULATED_UNRELIABLE`, never reportable.

## 5. Method equations and nonpositive estimates

The exact candidate method definitions are:

- FWO: `ln(beta)` against `1/T_alpha`, with
  `Ea [kJ/mol] = -R*slope/(1.052*1000)`;
- KAS: `ln(beta/T_alpha^2)` against `1/T_alpha`, with
  `Ea [kJ/mol] = -R*slope/1000`;
- Starink: `ln(beta/T_alpha^1.92)` against `1/T_alpha`, with
  `Ea [kJ/mol] = -R*slope/(1.0008*1000)`;
- Friedman: `ln(d(alpha)/dt)` against `1/T_alpha`, with
  `Ea [kJ/mol] = -R*slope/1000`;
- Kissinger: `ln(beta/Tp^2)` against `1/Tp`, with
  `Ea [kJ/mol] = -R*slope/1000`, in its separate peak workflow.

Here `R = 8.31446261815324 J mol^-1 K^-1`; division by 1000 converts
joules per mole to kilojoules per mole. The candidate retains the versioned
Doyle FWO coefficient `1.052` used by the implementation and its locked
validation fixtures.

For every method, a nonnegative fitted slope or a transformed `Ea` that is not
finite and strictly positive is a hard refusal with
`NONPOSITIVE_APPARENT_EA`. A refused result must not expose numerical `Ea`,
standard error, or confidence-interval fields. This clause replaces the v1
instruction to retain nonpositive values as warnings.

## 6. Kissinger peak-evidence contract

Imported beta-Tp tables require explicit peak temperatures and the same
sample, atmosphere, physical stage, and positive linear-heating context.
Curve-derived `Tp` requires a unique strict interior rate extremum for each
run. Boundary peaks, shoulders, multiple or overlapping candidates, unknown
peak quality, cooling, nonlinear heating, or fewer than three distinct heating
rates are refusals. The application must not infer peak quality from a
temperature label alone.

## 7. Reproducibility boundary

Every export must bind the exact analyzed input and mapping revision, source
file identities, canonical units, method/formula identifiers, thresholds,
warnings/refusals, result disposition, scientific-core version, and report
schema. JSON is the canonical reproducibility record; CSV and PDF are derived
views that must agree with it. Regression intervals do not include all
experimental and model-form uncertainty, including thermal lag.
