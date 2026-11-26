# Changelog

All notable user-facing changes are recorded here.

## 0.4.1 — 2026-11-23

### Added and Improved

- Enforced interval-based unreliability screening (`ACTIVATION_ENERGY_CI_INCLUDES_NONPOSITIVE`) so apparent activation-energy estimates whose two-sided 95% Student-t confidence interval reaches or crosses zero are classified as `CALCULATED_UNRELIABLE` even when pointwise `R^2` exceeds the configured threshold.
- Added the `INTEGRAL_METHOD_VARIABLE_EA_BIAS` diagnostic warning to cumulative integral methods (FWO, KAS, and Starink, excluding differential Friedman) whenever relative profile variation reaches 10% or more (`POSSIBLE_MULTISTEP_EA_VARIATION` or `MULTISTEP_EA_VARIATION`), advising differential or incremental small-interval cross-checks in accordance with ICTAC guidance.
- Refined report-summary candidate selection so unreliable methods are never offered as reportable summary statements, and improved long diagnostic identifier wrapping in the interface.
- Added an independent five-rate Kissinger Decimal(50) benchmark (`df = 3`) and five fourth-order Runge–Kutta (RK4) variable-kinetics ODE and confidence-interval boundary scenarios.
- Verified offline execution on macOS across Google Chrome 158, Mozilla Firefox 159, and Safari/WebKit (`docs/verification-v0.4.1/`).

### Preserved

- Retained `release/v0.4.0/`, `release/v0.3.2/` (Zenodo DOI `10.5281/zenodo.21921403`), and earlier versioned packages as immutable historical archives.

## 0.4.0 — 2026-09-12

### Improved

- Implemented centered, scale-conditioned ordinary least squares with exact Student-t confidence limits; rejected nonpositive apparent activation energies and numerically under-resolved inverse-temperature spreads.
- Added nonuniform three-point Lagrange derivatives, complete-run Friedman checks, Kissinger peak-confirmation requirements, and strict input validation.
- Hardened CSV, TSV, TXT, and XLSX ingestion, including bounded OOXML archive inspection and rejection of macro-enabled, externally linked, or formula-bearing workbooks.
- Standardized reproducible exports on `activation-energy-core/v3` and report schema `activation-energy-studio/project-report/v7`, accompanied by a CycloneDX production SBOM and bundled third-party license texts.

## 0.3.2 — 2026-08-01

### Fixed

- Rejected partially missing or non-finite mapped time series rather than substituting a temperature-derived time axis.
- Calculated wide-series Friedman numerical derivatives on retained source observations prior to conversion interpolation.
- Bound asynchronous import, mapping, analysis, and export operations to dataset revisions and SHA-256 source-file identities.
- Included structured provenance for bundled public examples across JSON, CSV, and PDF exports.

## 0.3.1 — 2026-08-01

### Changed

- Standardized the interface, reports, diagnostics, bundled examples, templates, and documentation in technical English.
- Preserved `v0.3.0` as an immutable historical package.

## 0.3.0 — 2026-07-30

### Added

- Simple and Expert analysis modes, bundled licensed thermoanalytical examples, confirmation-gated column suggestions, import templates, citation metadata, and SHA-256 release manifests.

## 0.2.0

- Established the scientific calculation core, guided tabular ingestion, single-file offline HTML build, and synchronized JSON/CSV/PDF reporting.
