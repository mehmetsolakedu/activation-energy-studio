# MVP Acceptance Criteria and Completion Gates

> Technical English companion to the immutable historical source
> [`../../02_ACCEPTANCE_CRITERIA.md`](../../02_ACCEPTANCE_CRITERIA.md). The
> source remains authoritative for the byte-bound v0.2 evidence record.

**Status:** Normative v1.0  
**Date:** 2026-07-18  
**Parent objective:** [`../../../ULTIMATE_GOAL.md`](../../../ULTIMATE_GOAL.md)  
**Mission:** [`00_MISSION_LOCK.md`](00_MISSION_LOCK.md)  
**Scientific specification:** [`01_SCIENTIFIC_SPEC_V1.md`](01_SCIENTIFIC_SPEC_V1.md)

## 1. Acceptance rule

The MVP is complete only when current, rerunnable evidence exists for every
`P0` gate in this document. The existence of a test is not evidence for a
requirement outside the test's demonstrated coverage.

Every gate is recorded with one of the following statuses:

- `PASS`: the specified evidence exists and directly satisfies the criterion;
- `FAIL`: the evidence contradicts the criterion;
- `MISSING`: required evidence does not exist;
- `WEAK`: evidence is indirect or insufficient;
- `N/A`: permitted only with a justification explicitly allowed by this
  document.

The product is not a “validated MVP” while any `P0` gate is `MISSING`, `WEAK`,
or `FAIL`.

## 2. Completion-evidence package

The release candidate must produce the following machine-readable or
human-readable artifacts:

- test command and complete test summary;
- fixture manifest, license/source, SHA-256, and expected values;
- formula-level numerical-validation report;
- refusal/warning scenario-matrix result;
- real-raw-data cross-validation report;
- PDF/CSV/JSON consistency report;
- Windows, macOS, and Linux offline smoke-test reports;
- usability-walkthrough record;
- known-boundaries and open-issues list;
- release binary or bundle hashes.

Artifact file names may differ inside the implementation, but the release
checklist must provide the exact path and hash for each artifact.

## 3. Requirement-to-gate traceability matrix

| Parent-objective requirement | Evidence gates |
|---|---|
| CSV/XLSX import in a few guided actions | `AC-IO-*`, `AC-UX-*` |
| data-eligibility engine | `AC-EL-*`, `AC-RF-*` |
| FWO/KAS/Starink/Friedman | `AC-NUM-01..08` |
| separate Kissinger | `AC-NUM-09`, `AC-EL-08`, `AC-RF-12` |
| units, `α`, stage, and quality | `AC-IO-05`, `AC-ALPHA-*`, `AC-EL-*` |
| refusal under unsafe conditions | `AC-RF-*` |
| Ea(α), diagnostics, and uncertainty | `AC-REG-*`, `AC-REP-*` |
| reproducible PDF/CSV/JSON reports | `AC-REP-*` |
| synthetic, hand, and real-raw validation | `AC-VAL-*` |
| offline Windows/macOS/Linux operation | `AC-PLAT-*` |
| local evidence trail for 231 source-PDF records | `AC-SCI-*` |

## 4. P0 gates

### 4.1 Mission and scientific governance

#### AC-SCI-01 — Normative document set

**Criterion:** `00_MISSION_LOCK.md`, `01_SCIENTIFIC_SPEC_V1.md`, and
`02_ACCEPTANCE_CRITERIA.md` are present in the same release and link to each
other and to `../ULTIMATE_GOAL.md`.  
**Evidence:** Link checker and release manifest.  
**P0:** Yes.

#### AC-SCI-02 — Evidence trail

**Criterion:** For each of the five methods, report at least one implemented
method-matrix row and one rendered/quality visual or ready/extraction-note
path. A citation-only row cannot substitute for implementation evidence.  
**Evidence:** Automated traceability audit and manual spot check.  
**P0:** Yes.

#### AC-SCI-03 — Claim boundary

**Criterion:** UI, PDF, CSV, and JSON results state that values are apparent
and carry sample–process/stage–atmosphere–method context. They make no claim of
the “true/single activation energy of the material” or a single-stage
mechanism.  
**Evidence:** Snapshot/string audit and scientific-reviewer sign-off.  
**P0:** Yes.

#### AC-SCI-04 — Boundary for `A`

**Criterion:** V1 core results do not produce a mechanism-free final `A/ln A`
parameter from the intercept; the intercept is labelled only as a diagnostic.  
**Evidence:** Schema, UI, and PDF audit.  
**P0:** Yes.

### 4.2 File ingestion and normalized data

#### AC-IO-01 — CSV/TSV/XLSX

**Criterion:** Importing the same canonical fixture as `.csv`, `.tsv`, and a
single-worksheet `.xlsx` produces exactly equal normalized numeric records,
without tolerance.  
**Evidence:** Parameterized ingestion test.  
**P0:** Yes.

#### AC-IO-02 — Multi-worksheet selection

**Criterion:** An XLSX workbook with multiple worksheets returns
`needs_mapping` and `records=[]` until a worksheet is selected. After
selection, it produces only provenance-bearing records from that worksheet.  
**Evidence:** Fixture and unit/integration test.  
**P0:** Yes.

#### AC-IO-03 — Table-kind ambiguity

**Criterion:** A table containing only temperature and beta, without a peak
header, is not processed without explicit `tableKind`. Selection of `curve` or
`beta-tp` has a deterministic result.  
**Evidence:** Ambiguity fixture.  
**P0:** Yes.

#### AC-IO-04 — Required mapping

**Criterion:** A curve table cannot be `ready` without temperature, beta, and
at least one of alpha/mass/massPercent. Duplicate aliases, a unit without field
meaning, or mixed-decimal ambiguity produces `needs_mapping` and no partial
record.  
**Evidence:** Negative-fixture matrix.  
**P0:** Yes.

#### AC-IO-05 — Unit conversion

**Criterion:** K↔°C, s↔min, mg↔g, fraction↔%, K/s↔K/min, and °C/s↔K/min
pairs produce the same normalized values for the canonical fixture. Absolute
formula temperature is in K.  
**Tolerance:** Relative error `≤1×10⁻¹²` or machine precision for floating-point
conversion.  
**Evidence:** Unit-table test.  
**P0:** Yes.

#### AC-IO-06 — Provenance

**Criterion:** Every normalized row contains `fileName`, `sheetName` when
applicable, one-based `sourceRow`, `runId`, column mapping, and source unit.
Intermediate `TAlphaBetaRow` and `BetaTpRow` records retain provenance.  
**Evidence:** Schema assertion and round-trip test.  
**P0:** Yes.

#### AC-IO-07 — No partial calculation

**Criterion:** For any unresolved `needs_mapping` or error diagnostic,
normalized records, processed tables, and method results remain empty.  
**Evidence:** End-to-end negative tests.  
**P0:** Yes.

### 4.3 `α`, stage, and interpolation

#### AC-ALPHA-01 — `α` from mass

**Criterion:** For known `m0`, `mf`, and intermediate mass values,
`α=(m0−m)/(m0−mf)` matches the hand calculation; mass and mass percentage
produce the same result.  
**Tolerance:** `|Δα|≤1×10⁻¹²`.  
**Evidence:** Unit test and hand worksheet.  
**P0:** Yes.

#### AC-ALPHA-02 — Invalid anchor

**Criterion:** `m0=mf`, a non-finite anchor, reversed or indeterminate stage,
or an anchor inconsistent with context produces a hard refusal; no clipping or
imputation occurs.  
**Evidence:** Negative-fixture set.  
**P0:** Yes.

#### AC-ALPHA-03 — Monotonicity

**Criterion:** Decreasing temperature, nonmonotonic `α`, a run that would
require silent sorting, or an ambiguous plateau produces the defined refusal;
raw order is preserved.  
**Evidence:** Permuted/noisy fixtures.  
**P0:** Yes.

#### AC-ALPHA-04 — Default grid

**Criterion:** Without an override, targets are exactly `0.10..0.90` with a
step of `0.10`. An override accepts only finite, unique values satisfying
`0<α<1`.  
**Evidence:** API/core unit tests.  
**P0:** Yes.

#### AC-ALPHA-05 — Common range and interpolation

**Criterion:** Every target lies in the common `α` intersection of all runs.
For a known piecewise-linear fixture, `Tα` matches the analytical value; no
extrapolation occurs outside the common range.  
**Tolerance:** `|ΔT|≤1×10⁻⁹ K`.  
**Evidence:** Interpolation golden tests.  
**P0:** Yes.

#### AC-ALPHA-06 — Stage homogeneity

**Criterion:** Conflicting sample, atmosphere, or stage metadata produces a
hard refusal for a single analysis. Multiple or overlapping DTG peaks are not
automatically treated as one stage.  
**Evidence:** Context/stage fixture matrix.  
**P0:** Yes.

### 4.4 Method eligibility and refusal

#### AC-EL-01 — Minimum independent heating-rate count

**Criterion:** Fewer than three distinct positive `β` values is a hard refusal
for all five methods. A replicate at the same rate is not a distinct rate.
Replicates sharing `β` are averaged arithmetically on the physical scales of
`β`, `Tα`/`Tp`, and Friedman `dα/dt`, contributing one equally weighted OLS
point; raw runs remain traceable and do not increase `nβ` or `df`. Exactly
three distinct rates produces `LIMITED_HEATING_RATES`.  
**Evidence:** Parameterized 2/3/4-rate tests and
`replicate-regression-contract.test.ts`.  
**P0:** Yes.

#### AC-EL-02 — Heating-rate span

**Criterion:** Duplicate beta produces `DUPLICATE_HEATING_RATE`;
`βmax/βmin<2` produces `NARROW_HEATING_RATE_SPAN`. For Kissinger, fewer than
five rates or a ratio below five produces
`KISSINGER_COMPLEXITY_UNDERPOWERED`.  
**Evidence:** Warning matrix.  
**P0:** Yes.

#### AC-EL-03 — Heating direction and program

**Criterion:** `β≤0` produces `COOLING_UNSUPPORTED`; within-run maximum
relative beta deviation above the default 2% produces
`NONLINEAR_HEATING_UNSUPPORTED`. No method result is created.  
**Evidence:** Cooling/nonlinear fixtures.  
**P0:** Yes.

#### AC-EL-04 — Global context refusal

**Criterion:** An unknown unit, inconsistent context, ambiguous stage, absent
common alpha, or non-finite critical data stops the associated analysis and
produces the exact reason code.  
**Evidence:** Refusal-table snapshot.  
**P0:** Yes.

#### AC-EL-05 — Integral-isoconversional eligibility

**Criterion:** FWO, KAS, and Starink produce no result at a target alpha unless
finite `Tα` is available from at least three distinct rates. Statuses at other
alpha values remain separate in the report.  
**Evidence:** Partial-alpha-coverage fixture.  
**P0:** Yes.

#### AC-EL-06 — Friedman eligibility

**Criterion:** User-supplied `dα/dt`, time finite-difference, and
`β dα/dT` paths are each tested. Numerical paths produce
`NUMERICAL_DERIVATIVE`. A partially missing or non-finite supplied derivative
series causes a hard refusal with `INVALID_PROVIDED_DERIVATIVE`; no numerical
fallback occurs. A finite nonpositive rate is excluded from the logarithm; the
alpha is refused when fewer than three usable distinct rates remain.  
**Evidence:** Derivative-fixture trio, negative-derivative fixture, and
`provided-derivative-failclosed.test.ts`.  
**P0:** Yes.

#### AC-EL-07 — No hidden smoothing

**Criterion:** The V1 core does not smooth Friedman or any other method. The
same input produces the same derivative/output bit for bit or within the
defined floating-point tolerance, and the report states the derivative source.  
**Evidence:** Source/configuration audit and deterministic test.  
**P0:** Yes.

#### AC-EL-08 — Kissinger eligibility

**Criterion:** At least three distinct `β–Tp` pairs assigned to the same
physical peak are required. An ambiguous or overlapping peak or missing `Tp`
is a hard refusal; the peak result is not mixed into the isoconversional result
collection.  
**Evidence:** Beta–Tp integration tests.  
**P0:** Yes.

### 4.5 Formula and numerical accuracy

All noise-free formula tests use
`R=8.31446261815324 J mol⁻¹ K⁻¹`, `x=1/T[K]`, and canonical rate units.

#### AC-NUM-01 — FWO natural-log form

**Criterion:** `y=ln β`, `E=−Rb1/1.052`; formula metadata includes `−5.331`
and `−1.052E/(RT)`. A noise-free known-slope fixture returns the correct `E`.  
**Tolerance:** `max(1×10⁻⁶ kJ mol⁻¹, 1×10⁻⁸ relative)`.  
**P0:** Yes.

#### AC-NUM-02 — FWO logarithm-base trap

**Criterion:** Natural-log `1.052` and exact base-10 `1.052/ln(10)` reference
calculations match for the same fixture within AC-NUM-01 tolerance. The
publication-rounded `0.4567` is verified separately within `≤5×10⁻⁴` relative
coefficient/energy difference; the application cannot combine `ln` with
`0.4567`.  
**Evidence:** Explicit regression test.  
**P0:** Yes.

#### AC-NUM-03 — KAS

**Criterion:** `y=ln(β/Tα²)`, `E=−Rb1`. A noise-free fixture produces expected
`E` within AC-NUM-01 tolerance.  
**P0:** Yes.

#### AC-NUM-04 — Starink

**Criterion:** `y=ln(β/Tα^1.92)`, `E=−Rb1/1.0008`. A regression test prevents
the exponent and coefficient from being interchanged.  
**Tolerance:** Same as AC-NUM-01.  
**P0:** Yes.

#### AC-NUM-05 — Friedman

**Criterion:** `y=ln(dα/dt)`, `E=−Rb1`. A supplied-derivative fixture with
known `E` satisfies AC-NUM-01 tolerance.  
**P0:** Yes.

#### AC-NUM-06 — Friedman derivative equivalence

**Criterion:** For an analytical linear-`α` fixture, supplied derivative, time
finite difference, and `βdα/dT` paths produce the expected derivative and `E`
within the defined discretization tolerance. One-sided endpoint behavior is
locked to its golden value.  
**Tolerance:** Justified in the fixture manifest; machine precision for the
noise-free linear case.  
**P0:** Yes.

#### AC-NUM-07 — Method independence

**Criterion:** For the same `Tα–β` fixture, FWO, KAS, and Starink produce
separate results and diagnostics through their respective `y` transformations;
one method's result is not an alias of another.  
**Evidence:** Object-identity assertion and numeric snapshot.  
**P0:** Yes.

#### AC-NUM-08 — Kelvin and `1000/T` trap

**Criterion:** Converting a °C input to K produces the same `E` as direct K
input. Selecting `1000/T` for the plot does not change calculation `x=1/T`.  
**Evidence:** Paired-fixture test.  
**P0:** Yes.

#### AC-NUM-09 — Kissinger

**Criterion:** `y=ln(β/Tp²)`, `x=1/Tp`, `E=−Rb1`; a known-slope beta–Tp
fixture produces expected peak `Ea` within AC-NUM-01 tolerance.
`resultType=peak` and `alpha=null`.  
**P0:** Yes.

#### AC-NUM-10 — Nonpositive Ea

**Criterion:** If a positive slope produces finite `E≤0`, the result is not
silently deleted; it is retained with `NONPOSITIVE_APPARENT_EA`. No automatic
mechanistic explanation is produced for chemical TGA.  
**Evidence:** Positive-slope fixture.  
**P0:** Yes.

### 4.6 Regression and uncertainty

#### AC-REG-01 — OLS reference match

**Criterion:** `b0`, `b1`, residuals, SSE, `R²`, residual SE, and slope SE
match an independent trusted implementation or hand calculation.  
**Tolerance:** `1×10⁻¹⁰ relative`, or a conditioning-based tolerance justified
by the fixture.  
**P0:** Yes.

#### AC-REG-02 — Student-t confidence interval

**Criterion:** With `n=nβ` equally weighted distinct heating-rate groups and
`df=nβ−2`, the two-sided 95% slope CI and method-transformed `E CI` match an
independent reference. Replicate-run count does not increase `nβ` or `df`, and
the t-critical value for `nβ=3` is not replaced with a normal-distribution
coefficient.  
**Evidence:** `n=3,4,5` fixtures.  
**P0:** Yes.

#### AC-REG-03 — Regression-only label

**Criterion:** UI/PDF/JSON state that the CI covers only post-aggregation
regression scatter and does not cover same-`β` replicate variability,
calibration, anchor, baseline, or derivative-method uncertainty.  
**Evidence:** Report snapshot.  
**P0:** Yes.

#### AC-REG-04 — Low `R²`

**Criterion:** `LOW_R2` occurs below the default configuration value `0.98`; a
finite result is not deleted automatically. `R²` alone does not decide whether
a mechanism is valid.  
**Evidence:** Low-fit fixture.  
**P0:** Yes.

#### AC-REG-05 — Degenerate regression

**Criterion:** `Sxx=0`, `Syy=0`, `df<1`, or a non-finite regression causes a
hard refusal; no NaN or infinite report result is created.  
**Evidence:** Degenerate fixtures.  
**P0:** Yes.

#### AC-REG-06 — `Eα` variation diagnostic

**Criterion:** Over the principal common `α` interval,
`(Emax−Emin)/Emean` of 10–20% produces
`POSSIBLE_MULTISTEP_EA_VARIATION`; more than 20% produces
`MULTISTEP_EA_VARIATION`. Constant `Eα` is not described as proof of one stage.  
**Evidence:** Constructed-profile tests and report-wording audit.  
**P0:** Yes.

### 4.7 Refusal/warning scenario matrix

#### AC-RF-01..12

Each row requires a separate fixture and an exact-code assertion:

| ID | Scenario | Expected outcome |
|---|---|---|
| AC-RF-01 | unknown temperature or beta unit | `UNKNOWN_TEMPERATURE_UNIT` or `UNKNOWN_HEATING_RATE_UNIT`; no results |
| AC-RF-02 | two distinct beta values | `INSUFFICIENT_DISTINCT_HEATING_RATES`; no results |
| AC-RF-03 | exactly three distinct beta values | result plus `LIMITED_HEATING_RATES` |
| AC-RF-04 | duplicate-beta replicates | `DUPLICATE_HEATING_RATE`; one equally weighted point per β after physical-scale aggregation; raw replicates retained; `nβ` and `df` unchanged |
| AC-RF-05 | no common alpha | `NO_COMMON_ALPHA_RANGE`; no isoconversional result |
| AC-RF-06 | inconsistent sample/atmosphere/stage | `INCONSISTENT_CONTEXT`; no results |
| AC-RF-07 | nonmonotonic T or alpha | exact monotonicity refusal; no silent sorting or clipping |
| AC-RF-08 | cooling or nonlinear heating | exact refusal; no results |
| AC-RF-09 | nonpositive Friedman derivatives leave fewer than three rates | alpha-specific refusal |
| AC-RF-10 | low `R²` but finite fit | result retained plus `LOW_R2` |
| AC-RF-11 | positive slope | result retained plus `NONPOSITIVE_APPARENT_EA` |
| AC-RF-12 | overlapping or ambiguous Kissinger peak | `OVERLAPPING_PEAKS` or `AMBIGUOUS_STAGE`; no Kissinger result |

**P0:** Every row.

### 4.8 Reports and reproducibility

#### AC-REP-01 — JSON completeness

**Criterion:** Every provenance, configuration, unit, formula-ID,
warning/refusal, fit, and observation field in Scientific Specification §9.1
passes schema validation.  
**Evidence:** JSON Schema and fixture validation.  
**P0:** Yes.

#### AC-REP-02 — CSV consistency

**Criterion:** Unrounded numeric result, CI, and diagnostic fields in tidy CSV
match JSON within the specified tolerance; Kissinger uses
`resultType=peak, alpha=null`.  
**Evidence:** Cross-format parser test.  
**P0:** Yes.

#### AC-REP-03 — PDF completeness

**Criterion:** The PDF includes input context, units, preprocessing,
eligibility, warnings/refusals, formula/version, `Eα` plot/table,
regression/CI, and a separate Kissinger section. Rendered pages contain no
clipped table or plot.  
**Evidence:** PDF text assertions and rendered visual QA of every page.  
**P0:** Yes.

#### AC-REP-04 — Determinism

**Criterion:** With the same application/core/schema version and the same
input/configuration, two runs produce exactly identical scientific numeric
JSON/CSV fields. Permitted volatile fields such as timestamp and report ID are
listed explicitly.  
**Evidence:** Double-run difference.  
**P0:** Yes.

#### AC-REP-05 — Round-trip audit

**Criterion:** Every raw regression contribution in the report is traceable to
its source file/sheet/sourceRow and `β` aggregation group; every `E` result is
traceable to its formula ID and inclusion/exclusion decision.  
**Evidence:** Automated provenance traversal.  
**P0:** Yes.

### 4.9 Validation-data layers

#### AC-VAL-01 — Synthetic noise-free data

**Criterion:** At least one known-`E` fixture for each of FWO, KAS, Starink,
Friedman, and Kissinger satisfies the AC-NUM tolerances.  
**P0:** Yes.

#### AC-VAL-02 — Synthetic robustness and refusal

**Criterion:** Controlled-noise, multistep `Eα`, low-`R²`, nonpositive-
derivative, missing-common-range, and invalid-unit fixtures exercise the
correct warning/refusal paths.  
**P0:** Yes.

#### AC-VAL-03 — Hand calculation

**Criterion:** FWO/KAS/Starink/Friedman at at least one fixed `α` and a
separate Kissinger set are verified through formula transformations in an
independent hand worksheet or notebook. The worksheet includes inputs,
intermediate `x/y`, slope, `E`, SE, and CI.  
**Tolerance:** AC-NUM/REG tolerances before display rounding.  
**P0:** Yes.

#### AC-VAL-04 — Accessible real-raw-data test

**Criterion:** For at least one real multi-rate raw TGA/DTG dataset, the source,
license or permission, download/local hash, sample/atmosphere/stage metadata,
and independent-reference result are recorded. Core results match the
reference within a predefined tolerance; a publication table alone is not
ground truth.  
**Tolerance:** Justified in the dataset manifest and locked before release; it
cannot be relaxed after inspecting the result.  
**P0:** Yes.

#### AC-VAL-05 — Cross-method interpretation

**Criterion:** The real/synthetic report shows differences among FWO, KAS,
Starink, and Friedman; agreement is not declared to be “truth,” and divergence
is not concealed. Kissinger remains separate as one value.  
**Evidence:** Scientific-reviewer audit.  
**P0:** Yes.

#### AC-VAL-06 — Fixture immutability

**Criterion:** Fixture and expected-output hashes are locked in a manifest.
They cannot change without a scientific release note and a rebaseline
justification.  
**P0:** Yes.

### 4.10 Offline and three-platform operation

#### AC-PLAT-01 — Offline execution

**Criterion:** After installation or bundle preparation, the complete golden
end-to-end flow passes with networking disabled during analysis, plotting, and
PDF/CSV/JSON export. Runtime network-request count is zero.  
**Evidence:** Network-denied test or log.  
**P0:** Yes.

#### AC-PLAT-02 — Operating-system matrix

**Criterion:** The supported release bundle runs with the same golden fixtures
on Windows 11, a supported macOS release, and Ubuntu 22.04 or later; scientific
numeric JSON is identical.  
**Evidence:** Three independent machine/CI smoke logs and output hash/diff.  
**P0:** Yes.

#### AC-PLAT-03 — Locale safety

**Criterion:** Turkish/English locale and comma/dot decimal tests produce the
same canonical numeric result; an ambiguous mixed format is not interpreted
silently. This is a historical locale-safety requirement, not a statement that
the current product remains bilingual.  
**Evidence:** Locale matrix.  
**P0:** Yes.

#### AC-PLAT-04 — Privacy

**Criterion:** User data and reports do not leave the machine except through an
explicit user export; analytics and telemetry are disabled by default.  
**Evidence:** Network/static audit and privacy statement.  
**P0:** Yes.

### 4.11 Usability — measuring “a few clicks”

#### AC-UX-01 — Guided happy path

**Criterion:** For a prepared four-run TGA fixture, a non-specialist test user
requires no more than five decision steps and enters no formula: upload files,
confirm mapping/units, confirm sample-stage context, run all eligible methods,
and export the report.  
**Evidence:** Moderated walkthrough and click/decision count.  
**P0:** Yes.

#### AC-UX-02 — Comprehensible errors

**Criterion:** In at least five refusal scenarios, the historical Turkish-first
interface explains the problem, why it creates scientific risk, and how to
correct it; an error code alone is insufficient.  
**Evidence:** Usability review and copy snapshot.  
**P0:** Yes.

#### AC-UX-03 — Result distinction

**Criterion:** Every usability-test participant can correctly state from the
screen that an `Eα` curve and a single-peak Kissinger `Ea` are different result
types.  
**Evidence:** Task-comprehension question.  
**P0:** Yes.

#### AC-UX-04 — Warning visibility

**Criterion:** `LIMITED_HEATING_RATES`, `LOW_R2`, `NUMERICAL_DERIVATIVE`, and
multistep warnings are visible in the result card and exported report; they are
not confined to a log or tooltip.  
**Evidence:** UI/PDF snapshot.  
**P0:** Yes.

## 5. P1 gates deferred beyond the MVP without constraining the architecture

- Vyazovkin/flexible integral methods;
- Coats–Redfern and model-function Expert mode;
- DAEM, master plots, deconvolution, and global fitting;
- DSC, cooling, and isothermal workflows;
- reaction-model-aware `A/ln A`;
- baseline/smoothing sensitivity ensembles and broader uncertainty propagation;
- instrument-vendor template library;
- comprehensive WCAG audit and multilingual method guidance.

P1 items must not be presented as though P0 were complete, but the data model
and provenance schema must not prevent their future addition.

## 6. Scientific release-sign-off order

1. Math maintainer: formula IDs, units, logarithms, coefficients, and numerical
   fixtures.
2. Data/I/O maintainer: mapping, provenance, no-partial-calculation behavior,
   and locale handling.
3. Thermal-analysis reviewer: eligibility, stages, warnings, and claim
   boundaries.
4. QA: report consistency, determinism, refusal matrix, and platform matrix.
5. Product owner: few-action usability and offline/privacy behavior.

If any signature is absent, status is at most `technical candidate`; it cannot
be “validated MVP.”

## 7. Final completion audit

For every explicit requirement, the release owner records the authoritative
evidence path. The audit cannot stop at “the tests are green”:

- verify that the test actually covers the associated formula or threshold;
- demonstrate that the fixture's expected value was not generated by the same
  implementation;
- inspect the rendered PDF visually;
- verify real-raw-data permission/hash and the independent reference;
- verify that three-OS logs and offline network evidence match the current
  release hash;
- confirm that no scientific `critical` or `major` issue remains open.

The parent objective is not marked complete until every `P0` row is `PASS`.
