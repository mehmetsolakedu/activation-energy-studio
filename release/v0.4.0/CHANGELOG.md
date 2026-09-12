# Changelog

All notable user-facing changes are recorded here. This project follows
semantic versioning for packaged research-preview artifacts.

## 0.4.0 — 2026-09-12

### Fixed

- Replaced cancellation-prone regression arithmetic with centered,
  scale-conditioned ordinary least squares and exact Student-t confidence
  limits; reject nonpositive apparent activation energies and numerically
  under-resolved inverse-temperature spreads.
- Added nonuniform three-point derivatives, complete-run Friedman evidence,
  explicit Kissinger peak-evidence requirements, and fail-closed handling of
  invalid or ambiguous inputs.
- Hardened CSV, TSV, TXT, and XLSX ingestion, including bounded OOXML resource
  handling and rejection of macro-bearing or externally linked workbooks.
- Bound reports to source identities, analyzed revisions, scientific-core v3,
  report schema v7, and consistent JSON, CSV, and PDF provenance.
- Closed the audited production dependency advisory and added a production
  SBOM, dependency notices, and bundled license texts.

### Released

- Published v0.4.0 as a bounded Research Preview after the frozen end-to-end
  audit verdict **CONDITIONAL PASS — SAFE RESEARCH PREVIEW WITH LISTED
  LIMITATIONS**.
- Limited the post-audit promotion changes to release-state interface wording,
  documentation, citation and package metadata, and their tests; scientific
  and calculation code remains identical to frozen candidate commit
  `7ea6575342c822eae609ba3d32a785dcb5a94b6e`.
- Retained v0.3.2 and earlier byte-bound artifacts as immutable history.

## 0.3.2 — 2026-08-01

### Fixed

- Reject partially missing or non-finite mapped time series instead of
  silently substituting a temperature-derived time axis.
- Calculate raw wide-series Friedman derivatives on retained source
  observations before target-alpha interpolation, removing analysis-grid
  dependence from that path while retaining explicit numerical-derivative
  warnings.
- Bind asynchronous upload, example, mapping, analysis, and export operations
  to committed dataset revisions so stale completions cannot replace current
  state or unlock an invalid export.
- Bind every exported source row to a SHA-256-derived source-file identity, so
  distinct files with duplicate display names remain unambiguous.
- Include structured licensed-example source, extraction, transformation,
  precision, rounding, license-scope, and claim-limit provenance in JSON, CSV,
  and PDF reports.

### Preserved

- Scientific and provenance claim boundaries, including the Paper063
  article-derived-data and separate-dataset-license limitation.
- The byte-bound v0.3.1 release and all earlier release and validation evidence.

## 0.3.1 — 2026-08-01

### Changed

- Standardized the complete product interface, reports, diagnostics, examples,
  templates, and canonical documentation in technical English.
- Removed the Turkish interface path and bilingual wording from the current
  Research Preview.
- Moved the new English-only package into `release/v0.3.1/` so the byte-bound
  v0.3.0 release remains intact.
- Added English companion translations for immutable v0.2 scientific,
  validation, platform, and usability documents.

### Preserved

- Scientific-core equations, constants, formula identifiers, eligibility
  rules, diagnostic codes, and numerical behavior.
- The v0.3.0 offline HTML, manifest, checksums, and all historical validation
  evidence.

## 0.3.0 — 2026-07-30

### Added

- Simple and expert analysis modes with Turkish and English interface paths.
- Three one-click, licensed real-data examples:
  - four-rate Chilean Oak raw CSV for FWO, KAS, and Starink;
  - Paper010 official-DTG-derived supplied d(alpha)/dt for Friedman;
  - Paper063 article-derived beta-Tp values for a separate Kissinger result.
- Confirmation-gated suggestions for metadata-rich thermal TXT, generic XLSX,
  and guided fallback mapping.
- Bilingual five-minute quick starts, import templates, citation metadata,
  third-party attribution, support instructions, release notes, and a compact
  download page.
- Deterministic v0.3 packaging script with SHA-256 manifest and checksum index.

### Preserved

- Offline, single-HTML operation.
- The v0.2 scientific core, explicit unit/sign semantics, fail-closed
  ingestion, diagnostics, result exports, and provenance-rich PDF reporting.

### Scientific and release boundaries

- Results are method-, sample-, atmosphere-, stage-, preprocessing-, and
  conversion-range-specific apparent activation energies.
- Regression confidence intervals do not cover all experimental or model-form
  uncertainty.
- Paper063 is article-derived CC BY 4.0 content and has no separately licensed
  raw dataset.
- A generated manifest proves package byte integrity only. It does not replace
  scientific review, usability observation, or final-platform validation.

## 0.2.0

- Established the evidence-grounded scientific core, guided fail-closed
  ingestion, deterministic offline single-HTML build, JSON/CSV/PDF reporting,
  and bounded real-data validation lanes.
