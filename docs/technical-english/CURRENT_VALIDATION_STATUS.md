# Current Validation Status

> Technical English companion to the immutable historical source
> [`../../CURRENT_VALIDATION_STATUS.md`](../../CURRENT_VALIDATION_STATUS.md).
> The source remains authoritative for the byte-bound v0.2 evidence record.

> **Historical v0.2 validation snapshot.** This document does not define the
> v0.3.2 Research Preview disposition or project-closing requirements. For the
> current v0.3.2 decision, see the
> [`Research Preview closeout`](../../output/v0.3.2-solo-closeout/RESEARCH_PREVIEW_CLOSEOUT.md).
> Independent reviewer, multi-OS, and participant lanes are optional future
> work only if stronger external-validation claims are later pursued.

**Audit date:** 2026-07-29  
**Scope:** Evidence-based interim audit of the current MVP against the 72 P0
gates in `02_ACCEPTANCE_CRITERIA.md`  
**Overall decision:** **PARTIAL — the technical MVP candidate operates, but the
scientific release is not yet P0-validated.**

This audit is not a code-quality score. `PASS` is used only when the direct
evidence required by the criterion exists. Implemented source behavior without
the required fixture, exact-code assertion, independent comparison, platform
record, or user evidence is `PARTIAL`; absence of direct evidence is
`NOT TESTED`. These interim labels map to the normative taxonomy as follows:
`PARTIAL = WEAK` and `NOT TESTED = MISSING`. **Only PASS closes a gate.**

## 1. Validation summary

| Status | Gate count |
|---|---:|
| PASS | 64 |
| PARTIAL | 6 |
| NOT TESTED | 2 |
| **Total** | **72** |

### Positive technical evidence

- `npm run check` completed the historical v0.2 technical chain: type checking;
  384/384 tests in 63 Vitest files; 15/15 independent Paper010, 2/2 Oak,
  5/5 Dryad Polyisoprene, 8/8 NR–CELS, and 4/4 Coal–SPT–Paraffin
  oracle/integrity tests; 24/24 Paper010 raw-to-report tamper/verifier tests;
  fixture, platform, warning-evidence, offline-verifier, traceability, review,
  external-kit, P0-ledger, release-verification, known-issue, and sign-off
  governance suites; the five-method trace; the 231-PDF corpus ledger; five
  official real-data locks; the production build; and the static offline gate.
- The deterministic release manifest locks 225 evidence files, including the
  direct-macOS integrity manifest, warning-visibility evidence, real-Chrome
  Paper010 package, five official real-data/oracle/hand-adjudication chains,
  Paper063 article-derived peak verification, external-adjudication contract,
  and local/hosted runner-verifier-test contracts. Manifest generation,
  freshness, and tamper regressions passed 3/3.
- The exact P0 evidence ledger binds all 72 gates to unique IDs, paths, and
  SHA-256 values: 64 `PROVEN` and 8 `EXTERNAL_OPEN`. Six known issues remain;
  three open major P0 external-evidence issues keep
  `validatedMvpEligible=false`. Structural sign-off validation does not prove a
  human identity or signature.
- The locked v0.2 single-file bundle is `1,261,018` bytes with SHA-256
  `ce716471586b098806007853992bed6601dfa359d53e59fe1b50c849d911dbb7`.
- Guided mapping binds per-file temperature, signal, heating-rate, explicit
  conversion-rate columns, units, decimal separator, table type, zero-based
  header row, ignored-column roles, default beta, and XLSX worksheet to renewed
  ingestion validation. Aggregation cannot proceed while any batch member is
  unresolved. UTF-8, UTF-16 LE/BE, and Windows-1252 TXT decoding and physical
  blank-row provenance are deterministic. Mapping changes invalidate prior
  analysis and export. Generic DTG, `dm/dt`, `mg/min`, and `K/min` are not
  silently interpreted as `dα/dt`.
- Static offline verification confirms one HTML file, no external-resource
  reference, and no recognized network API in 32 first-party source/style
  files. This does not substitute for a runtime zero-request record. A
  self-calibrating jsdom guard separately records zero network attempts for
  ambiguous-import and real multi-rate analysis/export paths; this is not a
  real-browser network log or OS record.
- The platform recorder validates the retained release/input/self-test/
  JSON/CSV/PDF/HAR/screenshot set and refuses output unless the 11 self-tests,
  exact input/payload/build hashes, nonempty timed HAR, zero external requests,
  real image dimensions, four methods, KAS golden value, and JSON↔CSV equality
  all pass. Raw full-precision values are retained. Versioned canonical
  cross-platform payload SHA-256 is
  `2b53c8311cf5b4fda612a455d92e00a6e3b9eaa6ad24e293430af05ee4eae2ba`;
  scientific build fingerprint is
  `38a8d33c1d1d90e361078ae98bb4721dee6442e16453166df4219bc69f29d0a7`.
- The three-platform matrix and human-review recorders are fail-closed and bind
  runner provenance, HAR/network, screenshot/UI, PDF visual quality,
  JSON–CSV–PDF consistency, OS/architecture, and deviation decisions to
  retained hashes. They do not authenticate reviewers or automatically close
  gates. No real hosted OS matrix had yet been recorded.
- External-evidence adjudication binds scientific, platform, and usability
  records plus separate signed human audits to one release SHA and emits only
  `HUMAN_ADJUDICATED_PASS`, `FAIL`, or `REMAINS_OPEN` for the eight external
  gates. It always retains `softwareAuthenticatedIdentity=false`,
  `acceptanceGatesAutomaticallyApplied=false`, and `validatedMvp=false`.
- An opt-in real-Chrome Worker regression passed 1/1 and blocked the paused
  Worker request before it reached localhost. This proves the narrow network
  boundary, not the complete application flow or three-OS platform gate.
- The in-application self-test exercises embedded CSV→ingestion→adapter→core
  across four methods and nine alpha levels and checks formula IDs, the
  `R²`/`n` envelope, scientific-payload SHA, and portable build fingerprint.
  Its record is explicitly `NOT_CLOSED_BY_SELF_TEST`.
- A direct native macOS CLI ran the complete locked golden flow in system
  Chrome 150 with `file:`, `navigator.onLine=false`, 11/11 self-tests, 36 rows
  across four methods, JSON/CSV/four-page PDF, CDP-to-HAR, and a full-page PNG.
  The HAR contains one local document request and no external or unsupported
  request. The record remains
  `LOCAL_AUTOMATED_DIAGNOSTIC_NOT_PLATFORM_EVIDENCE`; it does not close
  AC-PLAT-01 or AC-PLAT-02.
- The accessible result table exposes method, result type, alpha or peak, Ea,
  regression-only 95% CI, `R²`, distinct-rate `nβ`, raw count, `df=nβ−2`, and
  status. Replicates at the same beta are averaged on the physical scale into
  one equally weighted OLS point, with raw contributions retained. Report
  schema v4/core-math v2 carries full JSON/CSV precision and result→beta-group
  →raw-observation→file/sheet/sourceRow/mapping/unit traceability. Two reports
  match after allowlisting only `generatedAt` as volatile.
- Scientific traceability automatically verifies implemented matrix,
  render/crop, extraction-note, and ready-finding routes for all five methods;
  all five equation images were manually checked again at original resolution.
- The corpus ledger binds 231 unique source PDFs totaling 803,823,114 bytes:
  230 primary PDFs plus one supplement associated with `paper_008`. It retains
  the 30 blank-ID rows and missing 011–013 IDs in the raw method matrix while
  establishing nondestructive 10+10+10 derived assignments. Separate-article
  count and Q1/Q2 status remain `NOT_VERIFIED`.
- The schema-v4 QA PDF is byte-current and all four A4 pages were rendered and
  visually inspected for clipping, overlap, tables, plots, Kissinger separation,
  preprocessing, diagnostics, and traceability.
- The usability-preparation bundle locks 11 fixtures. Automated UI paths cover
  the mass-to-alpha guided workflow in 11 semantic activations, the real
  two-worksheet XLSX workflow in seven activations, and a standalone four-rate
  beta–Tp route without fabricating curves. The fail-closed study recorder can
  bind consent, exact 100% zoom, screen/audio hashes, task timecodes, 40% blind
  second scoring, and predefined thresholds, but cannot authenticate people or
  media content.
- The independent Paper010 `Decimal(50)` oracle reopens official S2/S4/S5 XLSX
  files without application imports, recreates the 48-row fixture byte for
  byte, and calculates every KAS/FWO/Starink/equation-correct Friedman
  transformation, OLS diagnostic, CI, and Ea. Equation-correct Friedman is
  `131.4393 kJ/mol`, whereas S5 reports `358.4650`; nonstandard paths that
  approach the published value remain negative publication-methodology
  evidence, not valid Friedman calculations.
- Two offline real-Chrome Paper010 raw-to-report passes projected 1,716 raw
  observations to 48 target points and produced 64 UI/JSON/CSV results per
  pass. Canonical JSON and CSV hashes matched exactly across passes; local-only
  HAR, five-page PDFs, and full-page PNGs were retained. Kissinger correctly
  refused the absent same-stage beta–Tp series. The package remains local
  technical reproduction, not independent review.
- The Chilean Oak, NR–CELS, Dryad Polyisoprene, Coal–SPT–Paraffin, and Paper063
  lanes retain official bytes, version/license/hash, explicit transformations,
  independent `Decimal(50)` or second-method checks, and production or bounded-
  core comparison. Publication discrepancies were not fitted away: coefficient
  errors, proprietary preprocessing gaps, swapped sample rows, version/label
  defects, and article-derived whole-kelvin peak data remain explicit negative
  evidence.
- The scientific-review package binds 116 artifacts and stays
  `UNSIGNED_AWAITING_INDEPENDENT_REVIEW`; structural success can be only
  `STRUCTURALLY_VALIDATED_AWAITING_HUMAN_IDENTITY_AND_SIGNATURE_AUTHENTICITY_AUDIT`.
  The deterministic external-validation kit similarly cannot prove that
  external work, identity validation, or gate closure occurred.

## 2. P0 gate matrix

### 2.1 Mission and scientific governance

| Gate | Status | Evidence or remaining gap |
|---|---|---|
| AC-SCI-01 | PASS | Nine-way link audit verifies the three normative documents and parent objective; the deterministic v0.2 manifest binds all four bytes/hashes. |
| AC-SCI-02 | PASS | Automated audit verifies implemented non-citation matrix rows for five methods and 16 evidence paths; manual visual spot checks are recorded. The corpus ledger binds all 231 PDF records without claiming 231 separate papers or Q1/Q2 status. |
| AC-SCI-03 | PARTIAL | Shared claim boundaries appear in UI/PDF and machine-readable exports. The review package and 35-decision recorder are fail-closed, but independent reviewer identity, signature authenticity, and sign-off remain unverified. |
| AC-SCI-04 | PASS | The core produces no final `A/ln A`; intercept remains a regression diagnostic. |

### 2.2 Ingestion and normalized data

| Gate | Status | Evidence or remaining gap |
|---|---|---|
| AC-IO-01 | PASS | Canonical CSV, TSV, and real minimal OOXML records match exactly. |
| AC-IO-02 | PASS | A real two-worksheet OOXML workbook fails closed before selection and retains correct worksheet/row provenance after selection. |
| AC-IO-03 | PASS | Generic temperature+beta requires mapping; explicit `beta-tp` and `curve` choices are deterministic. |
| AC-IO-04 | PASS | Bare units, duplicates, mixed decimals, and signal-free curves fail closed with empty records/tables. |
| AC-IO-05 | PASS | Fourteen unit-column variants and four default-rate variants agree within relative `1e-12`. |
| AC-IO-06 | PASS | CSV and OOXML records retain file/sheet/row/run and typed source mapping through intermediate rows and report round trips. Missing legacy mapping produces a visible gap. |
| AC-IO-07 | PASS | Unresolved, invalid, and mixed valid/invalid batches remain fail-closed throughout I/O, adapter, UI, and exports. |

### 2.3 Alpha, stage, and interpolation

| Gate | Status | Evidence or remaining gap |
|---|---|---|
| AC-ALPHA-01 | PASS | Independent worksheet and mass/mass-percentage paths reproduce `[0,0.5,1]` within `1e-12`. |
| AC-ALPHA-02 | PASS | Equal, non-finite, reversed, indeterminate, and out-of-stage anchors produce global `INVALID_ALPHA_ANCHORS`. |
| AC-ALPHA-03 | PASS | Acquisition order is preserved; decreasing temperature/alpha and ambiguous target plateaus fail closed. |
| AC-ALPHA-04 | PASS | Exact default grid and all invalid/valid overrides are tested. |
| AC-ALPHA-05 | PASS | Common intersection, analytical linear interpolation, and extrapolation prohibition are tested within `1e-9 K`. |
| AC-ALPHA-06 | PASS | Context conflicts and multiple/overlapping peak candidates produce exact global refusals; no first-peak shortcut exists. |

### 2.4 Method eligibility and refusal

| Gate | Status | Evidence or remaining gap |
|---|---|---|
| AC-EL-01 | PASS | 2/3/4-rate and replicate matrices directly test four isoconversional methods and Kissinger; same-rate replicates form one physical-scale OLS point. |
| AC-EL-02 | PASS | Duplicate, narrow-span, and underpowered-Kissinger branches have exact-code fixtures; `nβ/df` do not inflate. |
| AC-EL-03 | PASS | Zero/negative beta and measured nonlinear heating above 2% produce hard refusals and no results. |
| AC-EL-04 | PASS | Unknown units, non-finite critical data, no common alpha, ambiguous stage, and context inconsistency have exact codes and zero results. |
| AC-EL-05 | PASS | Alpha-specific coverage preserves eligible alpha results while refusing ambiguous targets. |
| AC-EL-06 | PASS | Supplied/time/temperature derivative paths, unit conversions, positive-rate filtering, and fail-closed partial/non-finite supplied series are directly tested. Generic DTG is not auto-accepted. |
| AC-EL-07 | PASS | Configuration states `smoothing: none`; derivative source is retained and independent reports are deterministic outside permitted volatile fields. |
| AC-EL-08 | PASS | Separate peak results and all duplicate/overlap/ambiguous/missing-peak refusal paths are tested, including a standalone beta–Tp application flow. |

### 2.5 Formula and numerical accuracy

| Gate | Status | Evidence or remaining gap |
|---|---|---|
| AC-NUM-01 | PASS | Noise-free FWO and exact natural-log formula metadata are locked. |
| AC-NUM-02 | PASS | Exact cross-base conversion, rounded `0.4567` bound, and invalid `ln+0.4567` trap are tested. |
| AC-NUM-03 | PASS | KAS known-`E` fixture passes. |
| AC-NUM-04 | PASS | Starink exponent and coefficient are independently locked. |
| AC-NUM-05 | PASS | Supplied-derivative Friedman known-`E` fixture passes. |
| AC-NUM-06 | PASS | Independent hand fixture locks three derivative paths and one-sided endpoints; 140 kJ/mol agrees within `8 × Number.EPSILON` relative. |
| AC-NUM-07 | PASS | Separate IDs, objects, and numeric transformations prove method independence. |
| AC-NUM-08 | PASS | Celsius and Kelvin inputs agree; calculation always uses `1/T`. |
| AC-NUM-09 | PASS | Kissinger known-slope fixture yields a peak result with `alpha=null`. |
| AC-NUM-10 | PASS | Finite nonpositive Ea remains visible with the exact warning. |

### 2.6 Regression and uncertainty

| Gate | Status | Evidence or remaining gap |
|---|---|---|
| AC-REG-01 | PASS | Independent hand values match slope, intercept, residuals, SSE, `R²`, residual SE, slope SE, and CI. |
| AC-REG-02 | PASS | Independent Decimal worksheets verify Student-t calculations for n=3/4/5 and replicate aggregation for every method. |
| AC-REG-03 | PASS | UI and all exports state the regression-only boundary and list excluded uncertainty sources. |
| AC-REG-04 | PASS | Finite low-`R²` results are retained with `LOW_R2`. |
| AC-REG-05 | PASS | Insufficient n, constant x/y, and non-finite fits refuse without NaN/infinite outputs. |
| AC-REG-06 | PASS | Constructed profiles separate 10–20% and >20% variation without claiming a one-stage mechanism. |

### 2.7 Refusal and warning scenarios

| Gate | Status | Evidence or remaining gap |
|---|---|---|
| AC-RF-01 | PASS | Unknown temperature/rate units have exact codes and zero results. |
| AC-RF-02 | PASS | Two distinct rates refuse with `INSUFFICIENT_DISTINCT_HEATING_RATES`. |
| AC-RF-03 | PASS | Exactly three rates retain results with `LIMITED_HEATING_RATES`. |
| AC-RF-04 | PASS | Duplicate rates remain non-independent and emit `DUPLICATE_HEATING_RATE`. |
| AC-RF-05 | PASS | Disjoint conversion ranges emit `NO_COMMON_ALPHA_RANGE`. |
| AC-RF-06 | PASS | Sample, atmosphere, and stage conflicts emit `INCONSISTENT_CONTEXT`. |
| AC-RF-07 | PASS | Decreasing T/alpha refuses without modifying input order or values. |
| AC-RF-08 | PASS | Cooling and nonlinear heating refuse with no results. |
| AC-RF-09 | PASS | Friedman refusal is alpha-specific when positive derivatives leave fewer than three rates. |
| AC-RF-10 | PASS | Low-`R²` finite fits remain with exact warning. |
| AC-RF-11 | PASS | Positive-slope results remain with exact nonpositive-Ea warning. |
| AC-RF-12 | PASS | Overlapping and ambiguous peaks refuse Kissinger without regression/Ea. |

### 2.8 Reports and reproducibility

| Gate | Status | Evidence or remaining gap |
|---|---|---|
| AC-REP-01 | PASS | Checked-in schema v4/core-math v2 validates the full fixture report and all required configuration, unit, provenance, formula, aggregation, result, and traceability fields. |
| AC-REP-02 | PASS | JSON and tidy CSV derive from one full-precision table and match field for field. |
| AC-REP-03 | PASS | Deterministic four-page PDF is byte-current and visually checked; this does not close experimental, platform, or user gates. |
| AC-REP-04 | PASS | Independent reports are identical after removing only allowlisted `generatedAt`; CSV bytes match. |
| AC-REP-05 | PASS | Automated traversal links each result to formula, inclusion decisions, and actual source contributors; gaps remain visible. |

### 2.9 Validation-data layers

| Gate | Status | Evidence or remaining gap |
|---|---|---|
| AC-VAL-01 | PASS | Noise-free known-`E` tests pass for all five methods. |
| AC-VAL-02 | PASS | Controlled noise, low `R²`, multistep Ea, missing range, nonpositive derivative, and invalid units exercise exact paths. |
| AC-VAL-03 | PASS | Independent Decimal worksheet locks full transformations, OLS, SE, and CI for four isoconversional methods and Kissinger. |
| AC-VAL-04 | PASS | Five official raw-data lanes retain source/version/license/hash and independent oracles. Production or bounded-core paths reproduce their references; discrepancies remain explicit negative evidence. Paper063 is a separate non-raw peak lane. |
| AC-VAL-05 | PARTIAL | Methods and Kissinger are separated and the review recorder is fail-closed, but the independent cross-method scientific audit, reviewer identity, and authentic signature remain absent. |
| AC-VAL-06 | PASS | Separate and recursive manifests bind 79 fixture files totaling 10,771,318 bytes and reject addition, deletion, mutation, symlinks, or unjustified rebaselining. |

### 2.10 Offline and platform operation

| Gate | Status | Evidence or remaining gap |
|---|---|---|
| AC-PLAT-01 | PARTIAL | Static and jsdom gates pass; a direct macOS/Chrome full offline flow retains seven actions, four methods × nine alpha values, three exports, zero-external-request HAR, PNG, and four-page PDF in a ten-file hash manifest. Real hosted execution and independent human HAR/visual/PDF review remain absent. |
| AC-PLAT-02 | NOT TESTED | Fixed macOS/Ubuntu/Windows 11 ARM workflow and matrix tooling are ready and fail closed, but real hosted evidence records and their three-way numeric diff do not exist. |
| AC-PLAT-03 | PASS | English-dot and Turkish-comma numeric fixtures agree exactly; mixed formats fail closed. This is historical locale evidence, not a claim that v0.3.1 is bilingual. |
| AC-PLAT-04 | PASS | Static audit finds no external resource or network/telemetry API, and product copy states that data remain local. Runtime evidence is tracked separately. |

### 2.11 Usability

| Gate | Status | Evidence or remaining gap |
|---|---|---|
| AC-UX-01 | PARTIAL | Automated guided and real two-worksheet flows complete in 11 and seven semantic activations with zero jsdom network attempts. The five-participant non-specialist walkthrough is absent. |
| AC-UX-02 | PARTIAL | All 51 historical diagnostic codes have structured problem/risk/remedy copy, and fail-closed UI paths are visible. Real verbatim responses and human content review are absent. |
| AC-UX-03 | NOT TESTED | DOM tests distinguish numeric `Ea(α)` from Kissinger and the recorder requires linked screen/audio evidence, but no real unaided 4/4 participant record exists. |
| AC-UX-04 | PARTIAL | Same-build real-Chrome W1–W4 evidence covers 4 codes × UI/PDF = 8/8 cells with 27 hash-locked artifacts. It remains `LOCAL_AUTOMATED_8_OF_8_REQUIRES_HUMAN_VISUAL_REVIEW`; no named human observer has signed the cells. |

## 3. Historical v0.2 blockers for stronger validated-release claims

1. **Three operating systems:** Parallels is out of scope. The fixed
   GitHub-hosted workflow, system-Chrome harness, evidence recorder, and exact
   JSON comparator exist, but real Windows 11 ARM, macOS, and Ubuntu artifacts
   and their three-way scientific diff do not.
2. **Independent scientific review:** The hash-locked self-checking reviewer
   package is explicitly unsigned. Independent cross-method review and an
   authentic signed decision remain incomplete.
3. **Usability:** The 11-fixture bundle, automated guided paths, result-type
   distinction, cohort recorder, and 8/8 technical warning matrix exist. Named
   human visual review and the moderated n=5 non-specialist study remain absent.
4. **Runtime offline evidence:** A direct macOS/Chrome `file://` offline package
   with one local document request and zero external requests exists. It is not
   a human-observed platform record; hosted artifacts and subsequent independent
   HAR/visual/PDF review remain required.
5. **Independent real-data disposition:** Five official real-data/oracle lanes
   reproduce their defined production or bounded-core contracts. Publication
   differences remain classified as preprocessing/protocol difference,
   publication/data issue, or unresolved uncertainty, not fitted to printed
   values. External scientific review and signature remain required.
6. **Corpus publication identity:** Hash and extraction accounting covers 231
   PDFs, but these are 230 primary PDFs and one supplementary PDF. A claim of
   231 separate articles or record-level Q1/Q2 status requires a separate
   authoritative ledger.

## 4. Reproducible audit commands

```bash
cd /Users/mehmetprom4/Desktop/Activation_Energy_Method/02_Activation_Energy_Software
npm run check
npm run test:hosted-platform
npm run test:local-macos-diagnostic
npm run verify:local-macos-diagnostic
npm run verify:p0-evidence-ledger
npm run verify:known-issues
npm run verify:release-signoff-template
shasum -a 256 dist/index.html release/Activation-Energy-Studio-v0.2.0.html
cat release/SHA256SUMS.txt
file /Users/mehmetprom4/Downloads/yeni-aktivasyon-enerjisi-analizi-report.pdf
file /Users/mehmetprom4/Downloads/yeni-aktivasyon-enerjisi-analizi-results.csv
file /Users/mehmetprom4/Downloads/yeni-aktivasyon-enerjisi-analizi.json
```

**Conclusion:** v0.2.0 is a substantial and operational research MVP across
synthetic, hand-calculated, and real-data numerical layers, fail-closed guided
mapping, actionable diagnostics, and a direct macOS/Chrome offline technical
run. It must not be described as a “scientifically validated release that runs
on every computer” until all 72 P0 gates have direct evidence—especially the
real Windows 11/macOS/Ubuntu matrix, human HAR/visual review, and usability
gates.
