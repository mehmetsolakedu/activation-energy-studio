# Scientific Calculation Specification v1

> Technical English companion to the immutable historical source
> [`../../01_SCIENTIFIC_SPEC_V1.md`](../../01_SCIENTIFIC_SPEC_V1.md). The source
> remains authoritative for the byte-bound v0.2 evidence record.

**Status:** Normative MVP contract  
**Date:** 2026-07-18  
**Mission:** [`00_MISSION_LOCK.md`](00_MISSION_LOCK.md)  
**Acceptance gates:** [`02_ACCEPTANCE_CRITERIA.md`](02_ACCEPTANCE_CRITERIA.md)

## 1. Purpose and normative language

This document defines the scientific and numerical behavior of the MVP that
calculates apparent activation energy from TGA/DTG data. `MUST`, `MUST NOT`,
`REFUSES`, and `PRODUCES` are normative terms.

Each rule carries one of the following source classifications:

- **[K] Evidence-backed:** Supported by an implemented method, rendered
  equation, method recommendation, or quality warning in the local corpus.
- **[M] Engineering safeguard:** An explicitly selected safeguard that makes
  the MVP deterministic and safe, but is not stated by the corpus as a
  universal threshold. It must be versioned and tested.
- **[K+M]:** The corpus supports the scientific requirement; the exact software
  behavior or threshold is an MVP decision.

An `[M]` threshold must not be reported as a law of nature.

## 2. Evidence authority and traceability

Scientific claims depend on the following chain, not on one CSV cell:

`source PDF → rendered page/quality crop → extraction note → quality warning → ready finding → canonical evidence → method matrix`

Normative source paths for this document:

- [`../../../ULTIMATE_GOAL.md`](../../../ULTIMATE_GOAL.md)
- [`../../../01_PDF_Evidence_Extraction/05_Canonical_Evidence_Table/activation_energy_evidence.csv`](../../../01_PDF_Evidence_Extraction/05_Canonical_Evidence_Table/activation_energy_evidence.csv)
- [`../../../01_PDF_Evidence_Extraction/06_Method_Evidence_Matrix/method_evidence_matrix.csv`](../../../01_PDF_Evidence_Extraction/06_Method_Evidence_Matrix/method_evidence_matrix.csv)
- [`../../../01_PDF_Evidence_Extraction/04_Paper_Extraction_Notes`](../../../01_PDF_Evidence_Extraction/04_Paper_Extraction_Notes)
- [`../../../01_PDF_Evidence_Extraction/07_Quality_Checks`](../../../01_PDF_Evidence_Extraction/07_Quality_Checks)
- [`../../../01_PDF_Evidence_Extraction/08_Ready_For_Methodology_Synthesis`](../../../01_PDF_Evidence_Extraction/08_Ready_For_Methodology_Synthesis)

Formula-verification packages:

| Method or boundary | Visual or rendered evidence | Structured or interpreted evidence |
|---|---|---|
| FWO natural-log Doyle form | [`paper_056 p05 crop`](../../../01_PDF_Evidence_Extraction/07_Quality_Checks/paper_056_quality_crops/p05_fwo_cr_sce_eq6_9.png) | [`paper_056 extraction notes`](../../../01_PDF_Evidence_Extraction/04_Paper_Extraction_Notes/paper_056_extraction_notes.md), [`ready findings`](../../../01_PDF_Evidence_Extraction/08_Ready_For_Methodology_Synthesis/paper_056_ready_findings.md) |
| KAS | [`paper_002 rendered p06`](../../../01_PDF_Evidence_Extraction/02_Rendered_Pages/paper_002/page-06.png) | `paper_id=002`, KAS row in the method matrix |
| Starink | [`paper_063 p04 crop`](../../../01_PDF_Evidence_Extraction/07_Quality_Checks/paper_063_quality_crops/paper_063_p04_evidence.png) | [`paper_063 extraction notes`](../../../01_PDF_Evidence_Extraction/04_Paper_Extraction_Notes/paper_063_extraction_notes.md) |
| Friedman | [`paper_010 rendered p05`](../../../01_PDF_Evidence_Extraction/02_Rendered_Pages/paper_010/page-05.png) | `paper_id=010`, Friedman row in the method matrix |
| Kissinger and its assumptions | [`paper_064 p02 crop`](../../../01_PDF_Evidence_Extraction/07_Quality_Checks/paper_064_quality_crops/paper_064_p02_evidence.png) | [`paper_064 extraction notes`](../../../01_PDF_Evidence_Extraction/04_Paper_Extraction_Notes/paper_064_extraction_notes.md), [`quality warnings`](../../../01_PDF_Evidence_Extraction/07_Quality_Checks/paper_064_quality_warnings.md) |
| Multistep behavior and `Eα` variation | rendered p03–p07 trail | [`paper_057 extraction notes`](../../../01_PDF_Evidence_Extraction/04_Paper_Extraction_Notes/paper_057_extraction_notes.md), [`quality warnings`](../../../01_PDF_Evidence_Extraction/07_Quality_Checks/paper_057_quality_warnings.md) |

The corpus is not a census that establishes frequency of use across the field.
“Examples implemented in the corpus” and “methods used most often in the
field” are different claims.

## 3. Scientific basis and symbols

### 3.1 General rate equation

**[K]** Single-stage representation:

\[
\frac{d\alpha}{dt}=k(T)f(\alpha),\qquad
k(T)=A\exp\!\left(-\frac{E}{RT}\right)
\]

This equation does not permit the software to declare that a reaction is
actually single-stage. For a multistage process, the calculated quantity may
be an apparent `Eα` conditional on the method and conversion interval.

### 3.2 Symbols and canonical units

| Symbol | Meaning | Internal calculation unit |
|---|---|---|
| `T`, `Tα`, `Tp` | absolute temperature | K |
| `β=dT/dt` | positive heating rate | K min⁻¹ |
| `t` | time | min for core derivative calculations |
| `α` | extent of conversion | dimensionless, 0–1 |
| `dα/dt` | conversion rate | min⁻¹ |
| `E`, `Eα` | apparent activation energy | J mol⁻¹ internally; kJ mol⁻¹ in reports |
| `A` | pre-exponential factor | depends on the time unit |
| `R` | molar gas constant | `8.31446261815324 J mol⁻¹ K⁻¹` |

**[K+M]** Inputs may use °C or K and K s⁻¹, K min⁻¹, °C s⁻¹, or
°C min⁻¹. All kinetic calculations use the canonical units above. The
ingestion layer may normalize time to seconds while preserving provenance; the
core converts it to minutes before differentiation. Although temperature
differences in °C and K are equal, `T` in every kinetic equation is always in
Kelvin.

**[M]** The numerical value of a dimensional quantity inside a logarithm
depends on the selected unit. V1 uses K min⁻¹ for `β` and min⁻¹ for `dα/dt` in
every run and records that choice in the report. A constant unit conversion
does not change the slope or `E`, but it changes interpretation of the
intercept and `A`.

## 4. Input and data model

### 4.1 File and table types

**[M]** Supported file types are `.csv`, `.tsv`, and `.xlsx`.

- When an XLSX workbook contains multiple worksheets, no records are produced
  until `options.sheet` is selected.
- The table type is `curve` or `beta-tp`.
- An ambiguous table containing only temperature and `β` is not interpreted
  until the user selects `tableKind`.
- `β` together with a recognized `Tp`, `Tmax`, or peak-temperature header is a
  `beta-tp` candidate; context validation still applies.

### 4.2 Curve table

**[K+M]** Each run requires:

- temperature;
- a `β` column or explicit `β` metadata for the run or file;
- direct `α` **or** mass/mass percentage;
- preferably time or direct `dα/dt`;
- `runId`, `sample`, `atmosphere`, and `stage` metadata.

Accepted input units:

| Field | Accepted units |
|---|---|
| temperature | K, °C |
| time | s, min |
| mass | mg, g |
| mass percentage | %, fraction |
| `α` | fraction, % |
| `β` | K/min, K/s, °C/min, °C/s |

If a header does not state a unit, or if one header can map to more than one
field, the status is `needs_mapping` and the record list remains empty.
Decimal-separator, table-kind, and worksheet ambiguities are never resolved
silently.

Every normalized row carries:

- `fileName`;
- `sheetName`, when applicable;
- one-based `sourceRow`;
- `runId`;
- the applied column mapping and unit conversion.

### 4.3 Beta–Tp table

**[K]** Every row contains a positive `β` and a `Tp` convertible to Kelvin,
assigned to the same physical stage. `Tp` is the peak temperature associated
with a rate maximum or minimum in a DSC, DTA, or DTG signal. Because the V1
target is TGA/DTG, general DSC import is deferred from the product scope.

### 4.4 Context homogeneity

**[K]** Runs in one regression must belong to the same sample definition,
atmosphere, measured process, and selected reaction stage. Multiple DTG peaks
or a shoulder may indicate multistep behavior; a single visible peak is not
proof of a single-stage process.

**[M]** Conflicting metadata or unstable stage matching causes a hard refusal.
The user may resolve the conflict by explicitly creating a new, separate
analysis group; the software does not combine the data automatically.

## 5. Preprocessing, `α`, and mapping

### 5.1 Conversion from mass

For a selected mass-loss stage:

\[
\alpha(T)=\frac{m_0-m(T)}{m_0-m_f}
\]

Here, `m0` and `mf` are the starting and final masses of the selected stage.

**[K+M]** Stage boundaries and anchors are retained in the report. The
software does not use silent clipping to correct `m0=mf`, reversed direction,
non-finite values, nonphysical `α`, or nonmonotonic conversion. This equation
is not applied automatically to mass gain or mixed signals; those cases require
verified direct `α` or a separate future module.

### 5.2 Raw-data integrity

**[M]** V1:

- does not modify raw rows;
- does not silently sort temperature;
- does not silently delete duplicate rows;
- does not apply smoothing;
- does not impute missing values;
- does not clip `α` to `[0,1]`.

In each curve run, temperature must be strictly increasing, `α` must be
nondecreasing, and every used value must be finite. The permitted
floating-point tolerance is versioned in the application configuration and
recorded in the report.

### 5.3 Heating program

**[K]** V1 is designed for positive, linear heating. Cooling (`β≤0`) is not
supported for FWO, KAS, Starink, or Kissinger; paper 064 specifically shows
that cooling is invalid for Kissinger because of `ln β`.

**[M]** When a run contains row-level `β`, the run is refused with
`NONLINEAR_HEATING_UNSUPPORTED` if maximum relative deviation around the median
exceeds the default 2%. The threshold is visible in the configuration and
report; 2% is not a universal scientific boundary.

### 5.4 `α` grid and common range

**[M]** Default targets:

`α = 0.10, 0.20, …, 0.90`

The caller may supply only finite, unique targets for which `0<α<1`. Every
target must lie within the common range observed by all runs.

**[K+M]** `α=0.1–0.9` is the principal interpretation interval used to reduce
endpoint fluctuations; paper 057 recommends interpreting `Eα` variation over
this range. This does not imply that every dataset must cover 0.1–0.9.

For each run, `Tα` is determined by piecewise-linear interpolation between two
adjacent measurements on monotonic `α(T)`:

\[
T_\alpha=T_j+
\frac{\alpha-\alpha_j}{\alpha_{j+1}-\alpha_j}
(T_{j+1}-T_j)
\]

Extrapolation is prohibited. When `Tα` is non-unique for an exact plateau
target, the point is not fitted automatically; the software produces
`AMBIGUOUS_ALPHA_CROSSING`.

### 5.5 Friedman derivative

**[K+M]** Precedence for `dα/dt`:

1. user-supplied `dα/dt` with an explicit unit;
2. central finite difference when time is available, with one-sided differences
   at the endpoints;
3. when time is unavailable, central finite difference for `dα/dT` followed by
   `dα/dt=β(dα/dT)`, with one-sided differences at the endpoints.

A supplied derivative column must be finite at every point or be removed
entirely. A partially missing supplied series, or one containing `NaN` or
infinite values, produces a hard refusal with
`INVALID_PROVIDED_DERIVATIVE`; defective user input is not silently replaced
with a numerical derivative.

V1 applies no smoothing. `NUMERICAL_DERIVATIVE` is mandatory when a numerical
derivative is used. At each `α`, a non-finite observation or an observation
with `dα/dt≤0` is excluded from the logarithm. The Friedman result at that `α`
is refused if fewer than three usable independent heating rates remain.

## 6. Method equations

For every regression:

\[
x_i=1/T_i\quad [K^{-1}],\qquad y_i=b_0+b_1x_i+\varepsilon_i
\]

**[M] Replicates at the same `β`:** The regression unit is a distinct heating
rate, not a physical-run count. For replicates sharing the same canonical `β`
key, `β`, `Tα` or `Tp`, and Friedman `dα/dt` are first averaged arithmetically
on their physical scales; method-specific `x/y` transformations are then
recomputed from those averages. Every distinct `β` contributes one equally
weighted OLS point. No automatic outlier deletion or replicate-count weighting
is applied. Raw runs, source identities, replicate counts, and within-group
descriptive dispersion remain in the audit trail.

`x=1000/T` may be used only as a display axis. The calculation engine uses
`x=1/T`, preventing a hidden factor-of-1000 scaling error.

### 6.1 FWO/OFW — natural-log Doyle form

**[K]** Form verified against rendered paper 056, p. 5:

\[
\ln\beta=
\ln\!\left(\frac{A E_\alpha}{R g(\alpha)}\right)
-5.331
-1.052\frac{E_\alpha}{RT_\alpha}
\]

Regression:

\[
y=\ln\beta,\qquad x=1/T_\alpha,\qquad
E_\alpha=-\frac{R}{1.052}b_1
\]

Publication-rounded base-10 form found in the corpus:

\[
\log_{10}\beta=C-0.4567\frac{E_\alpha}{RT_\alpha}
\]

The exact logarithm-base conversion coefficient is
`1.052/ln(10)=0.456877794962...`. The printed value `0.4567` is the
Doyle/literature rounding and differs from the exact coefficient by
approximately `3.89×10⁻⁴` relative.

**[M]** V1 implements only the natural-log form and records
`methodFormulaId=fwo_doyle_ln_1.052_v1`. The coefficient `0.4567` must not be
used with `ln` or as an exact cross-base equivalence constant. `-5.331` affects
the intercept but not the slope-derived `Eα`.

### 6.2 KAS — Kissinger–Akahira–Sunose

**[K]** Form verified against rendered paper 002, p. 6:

\[
\ln\!\left(\frac{\beta}{T_\alpha^2}\right)=
\ln\!\left(\frac{AR}{E_\alpha g(\alpha)}\right)
-\frac{E_\alpha}{RT_\alpha}
\]

Regression:

\[
y=\ln(\beta/T_\alpha^2),\qquad x=1/T_\alpha,\qquad
E_\alpha=-Rb_1
\]

The corpus contains typographic and algebraic variants of the intercept term.
**[M]** V1 calculates `Eα` only from the slope and does not derive `A` from the
intercept without selecting a mechanism `g(α)`.

### 6.3 Starink

**[K]** Form verified against rendered paper 063, p. 4:

\[
\ln\!\left(\frac{\beta}{T_\alpha^{1.92}}\right)=
\ln\!\left(\frac{A E_\alpha}{R g(\alpha)}\right)
-0.312
-1.0008\frac{E_\alpha}{RT_\alpha}
\]

Regression:

\[
y=\ln(\beta/T_\alpha^{1.92}),\qquad x=1/T_\alpha,\qquad
E_\alpha=-\frac{R}{1.0008}b_1
\]

`1.92` is the temperature exponent and `1.0008` is the slope-to-energy
coefficient; they are not interchangeable.

### 6.4 Friedman — differential isoconversional method

**[K]** At fixed `α`:

\[
\ln\!\left(\frac{d\alpha}{dt}\right)_{\alpha,i}
=\ln[A_\alpha f(\alpha)]
-\frac{E_\alpha}{RT_{\alpha,i}}
\]

Equivalent rate under linear heating:

\[
\frac{d\alpha}{dt}=\beta\frac{d\alpha}{dT}
\]

Regression:

\[
y=\ln(d\alpha/dt),\qquad x=1/T_\alpha,\qquad
E_\alpha=-Rb_1
\]

**[K]** Friedman is more sensitive to derivatives and noise than integral
methods and is therefore conditional. A nonpositive rate has no defined
logarithm.

### 6.5 Kissinger — separate peak method

**[K]** General single-stage derivation:

\[
\ln\!\left(\frac{\beta}{T_p^2}\right)=
\ln\!\left[-\frac{AR}{E}f'(\alpha_p)\right]
-\frac{E}{RT_p}
\]

Slope form:

\[
y=\ln(\beta/T_p^2),\qquad x=1/T_p,\qquad E=-Rb_1
\]

**[K]** The result is one peak-specific apparent `Ea`, not `Eα(α)`. A linear
Kissinger plot is not proof of a single-stage process. Systematic variation of
`αp` with `β`, peak overlap, nonlinear heating, cooling, and ordinary melting
are important invalidity boundaries.

**[K+M]** At least three distinct heating rates are a hard numerical gate.
Papers 057 and 064 nevertheless state that at least five rates over a broad
range are needed to detect Kissinger nonlinearity. A calculation based on three
or four rates may be reported, but `KISSINGER_COMPLEXITY_UNDERPOWERED` is
mandatory.

### 6.6 Method-transformation table

| Method | `y` | `T` | `E` transformation | Output type |
|---|---|---|---|---|
| FWO | `ln β` | `Tα` | `-R b1/1.052` | `Eα` |
| KAS | `ln(β/Tα²)` | `Tα` | `-R b1` | `Eα` |
| Starink | `ln(β/Tα^1.92)` | `Tα` | `-R b1/1.0008` | `Eα` |
| Friedman | `ln(dα/dt)` | `Tα` | `-R b1` | `Eα` |
| Kissinger | `ln(β/Tp²)` | `Tp` | `-R b1` | one peak-specific `Ea` |

The result is calculated in J mol⁻¹ and reported in kJ mol⁻¹ after division by
1,000.

## 7. Regression and uncertainty

### 7.1 OLS

Ordinary least squares with an intercept is applied for each method and `α`:

\[
b_1=\frac{\sum_i(x_i-\bar{x})(y_i-\bar{y})}
{\sum_i(x_i-\bar{x})^2},\qquad
b_0=\bar{y}-b_1\bar{x}
\]

\[
e_i=y_i-(b_0+b_1x_i),\quad
SSE=\sum_i e_i^2,\quad
s=\sqrt{\frac{SSE}{n-2}}
\]

\[
SE(b_1)=\frac{s}{\sqrt{\sum_i(x_i-\bar{x})^2}},\qquad
R^2=1-\frac{SSE}{\sum_i(y_i-\bar{y})^2}
\]

`n≥3`, `df=n-2`, and `Σ(x−x̄)²>0` are mandatory.

### 7.2 Energy uncertainty

With method coefficient `c=1.052` for FWO, `c=1.0008` for Starink, and `c=1`
for the other methods:

\[
E=-\frac{R}{c}b_1,\qquad
SE(E)=\frac{R}{c}SE(b_1)
\]

Two-sided 95% regression-only confidence interval:

\[
CI_{95}(E)=E\pm t_{0.975,n_\beta-2}SE(E)
\]

**[M]** `nβ` is the number of equally weighted distinct heating-rate groups;
residual degrees of freedom are `nβ−2`. The report provides both the slope CI
and the transformed `E` CI. This interval covers post-aggregation regression
scatter. It does not claim to cover variability among replicates at the same
`β`, instrument calibration, stage-anchor selection, baseline choice, or
derivative-method uncertainty.

### 7.3 Diagnostics

Every fit must include:

- `nβ`, raw-run count, `df=nβ−2`, the replicate-aggregation policy, distinct
  `β` count, and rate span;
- `b0`, `b1`, `SE(b1)`, and the slope CI;
- `E`, `SE(E)`, and the `E` CI;
- `SSE`, residual standard error, and `R²`;
- `x`, `y`, predicted `y`, residual, and provenance for every observation;
- inclusion or exclusion status and its reason.

**[K+M]** `R²` is not evidence of physical correctness. The default warning
threshold is `R²<0.98`; the result is not deleted automatically. The threshold
is visible in the configuration and report.

## 8. Eligibility, refusal, and warning rules

### 8.1 Status semantics

- `ready`: no critical control problem.
- `ready_with_warnings`: a number can be calculated, but an interpretation
  boundary applies.
- `refused`: a scientific or numerical prerequisite is missing; no associated
  result is produced.

Ingestion status may be `ready|needs_mapping|error`. If any unresolved
`needs_mapping` or error remains, normalized records and all downstream tables
remain empty. Partial or silent calculation is prohibited.

### 8.2 Global hard refusals

| Code | Rule | Type |
|---|---|---|
| `AMBIGUOUS_TABLE_KIND` | curve/beta-tp distinction cannot be resolved | [M] |
| `MAPPING_REQUIRED` | required column or worksheet selection is ambiguous | [M] |
| `UNKNOWN_UNIT` | unit of T, β, α/mass, or time/derivative cannot be resolved | [K+M] |
| `NONFINITE_DATA` | a used quantity is NaN or infinite | [M] |
| `NON_MONOTONIC_TEMPERATURE` | curve temperature is not strictly increasing | [K+M] |
| `NONLINEAR_HEATING_UNSUPPORTED` | the V1 constant-β boundary is not met | [K+M] |
| `COOLING_UNSUPPORTED` | `β≤0` | [K] |
| `INSUFFICIENT_DISTINCT_HEATING_RATES` | fewer than three distinct positive β values | [K+M] |
| `INCONSISTENT_CONTEXT` | sample/atmosphere/process/stage conflict | [K] |
| `AMBIGUOUS_STAGE` | the same physical stage cannot be matched reliably | [K] |
| `INVALID_ALPHA_ANCHORS` | `m0=mf` or an invalid stage anchor | [K+M] |
| `NON_MONOTONIC_ALPHA` | `α` is nonmonotonic within the selected stage | [K+M] |
| `NO_COMMON_ALPHA_RANGE` | no target `α` is common to every run | [K] |

### 8.3 Method-specific hard refusals

- FWO/KAS/Starink: if finite `Tα` is unavailable from at least three distinct
  rates at a target `α`, only that method–`α` result is refused.
- Friedman: if finite, positive `dα/dt` is unavailable at a target `α` for at
  least three distinct rates, only that `α` result is refused.
- Kissinger: the result is refused if unique `Tp` values from the same stage are
  unavailable for at least three distinct rates, peak overlap or assignment is
  ambiguous, or heating is cooling or nonlinear.
- OLS: the result is refused when `Sxx=0`, `Syy=0`, `df<1`, or the fit is
  non-finite.

### 8.4 Mandatory warnings

| Code | Trigger | Behavior | Type |
|---|---|---|---|
| `LIMITED_HEATING_RATES` | exactly three distinct β values | retain result; emphasize CI and limited power | [M] |
| `DUPLICATE_HEATING_RATE` | replicate run at the same β | aggregate to one equally weighted regression point per β on the physical scale; retain raw replicates; do not increase `nβ` or `df` | [M] |
| `NARROW_HEATING_RATE_SPAN` | `βmax/βmin<2` | warn about low leverage | [M] |
| `KISSINGER_COMPLEXITY_UNDERPOWERED` | `<5` rates or `βmax/βmin<5` for Kissinger | prohibit a single-stage inference | [K+M] |
| `NUMERICAL_DERIVATIVE` | Friedman derivative from a finite difference | report derivative source and sampling boundary | [K+M] |
| `LOW_R2` | default `R²<0.98` | retain result; require residual and CI review | [M] |
| `NONPOSITIVE_APPARENT_EA` | `E≤0` | retain result; require an explanation in the chemical TGA context | [K+M] |
| `MULTISTEP_EA_VARIATION` | `(Emax−Emin)/Emean>0.20` over the principal `α=0.1–0.9` interval | do not reduce to one mean; warn about multistep behavior | [K+M] |
| `POSSIBLE_MULTISTEP_EA_VARIATION` | ratio of 10–20% | warn about borderline variation | [K] |
| `OVERLAPPING_PEAKS` | multiple or shouldered DTG peaks | refuse Kissinger or require manual stage confirmation | [K] |

The 10–20% variation reported in paper 057 is diagnostic guidance; constant
`Eα` is not proof of a single-stage process. A mean or median may be included
as a secondary summary but does not replace a variable `Eα` curve.

## 9. Output and reproducibility contract

### 9.1 JSON — authoritative machine-readable report

JSON includes at least:

- schema, application, core-math, and formula versions;
- UTC creation time;
- input-file SHA-256 and file/sheet/sourceRow provenance;
- column mapping and input-to-canonical unit conversions;
- sample/atmosphere/process/stage metadata;
- `m0`, `mf`, stage boundaries, or the direct-`α` source;
- `α` grid, common range, and `Tα` matrix;
- derivative source and all preprocessing configuration;
- eligibility decisions and refusal/warning codes;
- per-method formula ID, `x/y` points, fit, and uncertainty;
- a result type that separates Kissinger from isoconversional results;
- the reason for every excluded observation.

### 9.2 CSV

In tidy CSV, one row represents one `method × α` result. For Kissinger, `alpha`
is empty and `resultType=peak`. Numeric fields are written at full precision
before display rounding.

### 9.3 PDF

The PDF is human-readable but does not replace JSON. Minimum content:

- analysis identity and context label;
- input, unit, and preprocessing summary;
- eligibility decisions and visible warnings;
- `Eα` tables/plots and method comparison;
- regression plots, diagnostics, and confidence intervals;
- a separate Kissinger section;
- method formula, version, and local evidence trail;
- boundary statements for “regression-only uncertainty” and “apparent Ea.”

### 9.4 Boundary for `A`

**[K+M]** The V1 core-method report does not produce `A` or `ln A` as a final
scientific result. FWO/KAS/Starink intercepts depend on `g(α)` and the
approximation; the Friedman intercept depends on the `A f(α)` term; and the
Kissinger intercept depends on the `f′(αp)` assumption. The intercept is
retained as a regression diagnostic. An `A` module is deferred until an
explicit reaction model and separate validation are available.

## 10. Numerical-validation strategy

**[M]** Three independent classes of evidence are mandatory:

1. **Synthetic:** Noise-free and controlled-noise fixtures generated with
   known `E`, covering each method's slope transformation and refusal path.
2. **Hand-calculated:** At least one isoconversional `α` point and one
   Kissinger set verified row by row using an independent notebook,
   spreadsheet, or second implementation.
3. **Real raw data:** At least one accessible multi-rate raw TGA/DTG dataset
   with recorded license/source and hash, compared with an independent
   reference implementation.

`Ea` values available only in article plots or tables are not raw-data ground
truth. They are evidence for formulas, expected reporting, and methodological
boundaries.

Tolerances and completion artifacts are normative in
[`02_ACCEPTANCE_CRITERIA.md`](02_ACCEPTANCE_CRITERIA.md).

## 11. Versioning and change control

The scientific-specification minor or major version is incremented and golden
fixtures are rerun when any of the following changes:

- formula, coefficient, or logarithm base;
- `R` constant or internal unit;
- `α` generation or interpolation;
- derivative algorithm;
- hard-refusal or warning thresholds;
- regression or CI calculation;
- report schema or result-type semantics.

When a method changes because of new corpus evidence, the associated
`paper_id`, rendered page or crop, and quality warning are added to the change
record.
