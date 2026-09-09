# Activation Energy Software — MVP Mission Lock

> Technical English companion to the immutable historical source
> [`../../00_MISSION_LOCK.md`](../../00_MISSION_LOCK.md). The source remains
> authoritative for the byte-bound v0.2 evidence record.

**Document status:** Normative v1.0  
**Date:** 2026-07-18  
**Parent objective:** [`../../../ULTIMATE_GOAL.md`](../../../ULTIMATE_GOAL.md)  
**Scientific contract:** [`01_SCIENTIFIC_SPEC_V1.md`](01_SCIENTIFIC_SPEC_V1.md)  
**Completion gates:** [`02_ACCEPTANCE_CRITERIA.md`](02_ACCEPTANCE_CRITERIA.md)

## 1. Locked primary objective

Develop a validated MVP, grounded in an evidence corpus built from 231 local
source-PDF records, that runs offline on Windows, macOS, and Linux and enables
a non-specialist to load multi-heating-rate TGA/DTG CSV or XLSX data through a
short guided workflow and calculate **scientifically traceable apparent
activation energy**.

The corpus unit is specifically a **PDF record**. The current integrity ledger
confirms 230 primary PDFs and one supplementary PDF (`paper_009`) associated
with the `paper_008` publication. Therefore, neither “231 separate articles”
nor “Q1/Q2 for every record” is a software claim unless a local journal-
quartile ledger is established.

The MVP covers:

- FWO/OFW, KAS, and Starink for conversion-dependent `Eα`;
- conditional Friedman when derivative data are adequate;
- Kissinger, presented separately and explicitly as a peak method;
- data eligibility, unit, conversion `α`, reaction-stage, and quality checks;
- refusal to calculate when the analysis is unsafe or indeterminate;
- `Eα`, regression diagnostics, regression uncertainty, and reproducible PDF,
  CSV, and JSON reports;
- numerical validation using synthetic data, hand calculations, and accessible
  real raw data.

## 2. The problem being solved

Users are not expected to know the equation, logarithm base, Kelvin conversion,
conversion-temperature mapping, or slope coefficient. The software transforms
this error-prone workflow into an auditable calculation chain:

`file → column/unit mapping → context and stage check → α → common α range → method eligibility → regression → apparent Ea → diagnostics → report`

The product is not merely a formula calculator that returns a number. It is a
decision-support tool that verifies whether a method has the required inputs
and makes the scientific boundaries visible.

## 3. Target users

- Researchers, engineers, and students who have TGA/DTG instrument output but
  are not specialists in kinetic methods;
- expert users who need to reproduce, audit, or submit the calculation for peer
  review;
- laboratories that require an offline, data-private working environment.

The software does not declare the “correct mechanism” on the user's behalf. It
suggests eligible methods, performs the calculations, explains the boundaries,
and retains the decision trail.

## 4. V1 input contract

### 4.1 Curve analysis

The primary V1 input is a set of non-isothermal TGA/DTG curves recorded at at
least three distinct positive, approximately constant heating rates under the
same sample, process, atmosphere, and stage context.

Supported files:

- `.csv` and `.tsv`;
- `.xlsx`; when a workbook contains multiple worksheets, the user explicitly
  selects the worksheet.

Required quantities:

- temperature and its unit;
- heating rate and its unit, supplied as a column or explicit metadata for the
  file or run;
- direct `α` **or** mass/mass percentage;
- preferably `dα/dt` for Friedman; otherwise, sufficient sampling to derive a
  numerical derivative from the time or temperature axis;
- run identity and sample, atmosphere, and reaction-stage context.

### 4.2 Kissinger peak analysis

Kissinger accepts a `Tp/Tmax` value for each heating rate, with all values
assigned to the same physical event. Peak overlap or uncertainty about stage
assignment stops the automated calculation.

## 5. V1 output contract

Each analysis produces:

- a normalized-data summary that preserves input-file, row, and column
  provenance;
- an `eligible`, `eligible with warnings`, or `refused` decision and reason code
  for each method;
- `Eα(α)` for FWO, KAS, Starink, and Friedman when eligible;
- a separate single-peak apparent `Ea` result for Kissinger;
- the points used, slope, intercept, residuals, SSE, `R²`, residual standard
  error, slope standard error, and 95% Student-t confidence interval for every
  regression;
- units, logarithm base, `α` range, derivative source, excluded observations,
  and all warnings;
- a human-readable PDF, tidy CSV, and fully reproducible JSON report.

The result must not be labelled as the context-free “activation energy of the
material.” The minimum label is:

> Apparent activation energy for [sample] — [process/stage] — [atmosphere] — [method] — [α range or Tp]

## 6. Immutable scientific principles

1. **Apparent-energy principle:** The output is labelled `apparent Ea`; it is
   not presented as a single immutable material constant.
2. **Unit principle:** Temperature in kinetic equations is expressed in
   Kelvin. Ambiguous units are never inferred.
3. **Logarithm principle:** Every formula states its logarithm base explicitly;
   the base-10 and natural-log forms of FWO are not mixed.
4. **Context principle:** Different samples, atmospheres, or physical stages are
   never silently combined in one regression.
5. **Common-conversion principle:** Isoconversional regression is performed only
   at `α` values observed in every run; extrapolation is prohibited.
6. **Transparent-processing principle:** Sorting, correction, clipping,
   smoothing, deletion, or unit assumptions are never performed silently.
7. **Refusal principle:** Numerical computability is not equivalent to
   scientific eligibility. No number is produced when a critical condition is
   unmet.
8. **Method-separation principle:** The single peak-based Kissinger value is not
   presented as an isoconversional `Eα` curve.
9. **Uncertainty principle:** `R²` alone is not evidence of validity; regression
   uncertainty and residuals are reported.
10. **Traceability principle:** Every report is traceable to input rows,
    transformations, formula version, software version, and warning decisions.
11. **Mechanism boundary:** A reaction mechanism or `A` is not inferred from an
    FWO, KAS, Starink, or Friedman result alone.
12. **Local-execution principle:** Analysis and reporting require no network
    connection; user data do not leave the device by default.

## 7. V1 scope

### In scope

- CSV/TSV/XLSX import with explicit column and unit mapping;
- non-isothermal, positive, approximately linear multi-rate heating programs;
- stage-specific `α` calculation from mass or use of verified direct `α`;
- common `α` grid and linear interpolation;
- FWO/OFW, KAS, Starink, and conditional Friedman;
- separate Kissinger `β–Tp` analysis;
- OLS regression, 95% regression confidence intervals, and diagnostics;
- method-eligibility engine, warnings, and hard-refusal behavior;
- PDF, CSV, and JSON reports;
- validation with synthetic, hand-calculated, and real raw data;
- offline distribution for Windows, macOS, and Linux.

### Out of scope for V1

- DSC heat-flow and cooling/crystallization analyses;
- isothermal experiments and nonlinear temperature programs;
- Vyazovkin, Coats–Redfern, DAEM, master plots, deconvolution, and global model
  fitting;
- automated reaction-mechanism assignment;
- `A`, `ln A`, thermodynamic parameters, or lifetime estimates without
  demonstrated reliability;
- automated separation of overlapping peaks;
- raw-curve digitization from PDFs or graph images;
- cloud computation, user accounts, or mandatory telemetry;
- treating reported article values as ground truth or claiming recalculation
  when raw data are unavailable.

These exclusions are not removed from the long-term ecosystem objective; they
are deferred until the validated MVP is complete.

## 8. Definition of success and completion

The MVP is not complete merely because the interface opens or an example value
is produced. Every `P0` gate in
[`02_ACCEPTANCE_CRITERIA.md`](02_ACCEPTANCE_CRITERIA.md) must pass with evidence
artifacts.

Minimum completion evidence:

- formula and slope transformations for all five methods match independent
  reference calculations;
- the eligibility engine produces no result for any defined unsafe scenario;
- uncertainty and provenance fields are consistent across PDF, CSV, and JSON;
- synthetic, hand-calculated, and at least one accessible real-raw-data test
  pass;
- the same fixture runs without network access on Windows, macOS, and Linux;
- a non-specialist completes the target workflow without entering a formula;
- no open critical or major scientific defect or unresolved `P0` gate remains.

A `Technical PASS` is not equivalent to actual MVP completion. Numerical tests,
scientific review, three-platform offline smoke testing, and report
reproducibility gates must close independently.

## 9. Local evidence and governance trail

This document does not treat the corpus as a bibliometric census of the field.
The corpus supplies evidence for methods, equations, inputs/outputs, and failure
boundaries.

Live source audit on 2026-07-18: 231 source PDFs, 231 extraction-note files,
231 ready-finding files, 3,121 canonical-evidence rows, and 2,066 method-matrix
rows. These figures must be recomputed at release time; they are not fixed
application data.

Primary sources:

- parent objective: [`../../../ULTIMATE_GOAL.md`](../../../ULTIMATE_GOAL.md)
- processing order: [`../../../01_PDF_Evidence_Extraction/00_Start_Here/paper_processing_order.csv`](../../../01_PDF_Evidence_Extraction/00_Start_Here/paper_processing_order.csv)
- canonical evidence table: [`../../../01_PDF_Evidence_Extraction/05_Canonical_Evidence_Table/activation_energy_evidence.csv`](../../../01_PDF_Evidence_Extraction/05_Canonical_Evidence_Table/activation_energy_evidence.csv)
- method matrix: [`../../../01_PDF_Evidence_Extraction/06_Method_Evidence_Matrix/method_evidence_matrix.csv`](../../../01_PDF_Evidence_Extraction/06_Method_Evidence_Matrix/method_evidence_matrix.csv)
- ready findings: [`../../../01_PDF_Evidence_Extraction/08_Ready_For_Methodology_Synthesis`](../../../01_PDF_Evidence_Extraction/08_Ready_For_Methodology_Synthesis)
- quality warnings and visual evidence: [`../../../01_PDF_Evidence_Extraction/07_Quality_Checks`](../../../01_PDF_Evidence_Extraction/07_Quality_Checks)

The source PDFs and extraction corpus are read-only scientific inputs; the
software workspace does not modify them.
