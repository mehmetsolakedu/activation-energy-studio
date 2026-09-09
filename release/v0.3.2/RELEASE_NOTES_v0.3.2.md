# Activation Energy Studio v0.3.2 Research Preview

Release date: 2026-08-01

## Remediated release blockers

### SCI-001 — invalid mapped time series

Partially missing or non-finite mapped time values now fail closed. A complete
absence of time remains eligible for the explicitly reported temperature and
heating-rate fallback; an incomplete time series is no longer silently mixed
with that fallback.

### SCI-002 — Friedman raw-series derivative placement

For a raw wide series without supplied `d(alpha)/dt`, the numerical derivative
is calculated on retained source observations before target-alpha
interpolation. This removes analysis-grid dependence from that production path.
The numerical source and warning remain explicit; no supplied derivative is
invented.

### STATE-001 — stale asynchronous completion

Upload, bundled-example, and mapping operations use revision-bound,
latest-operation-wins commits. A slower obsolete completion cannot replace the
newer selected dataset.

### STATE-002 — stale mapping or export snapshot

Mapping edits during asynchronous application invalidate that completion.
Analysis and export are bound to the exact committed dataset and mapping
revision, and an export is refused if the revision changes while file hashes
are being calculated.

### EXP-001 — duplicate-filename provenance ambiguity

Source files receive SHA-256-derived identities that propagate through
ingestion, normalized records, report input tables, and observation source-row
references. Different bytes with the same display filename remain distinct.
Unavailable or ambiguous identity produces an explicit traceability gap.

### EXP-002 — licensed-example export provenance

JSON, CSV, and PDF exports now include structured licensed-example provenance:
citation, source DOI or URL, license scope, source type, extraction and
transformation steps, printed precision, rounding, separate-dataset-license
boundary, and claim limits. Coverage includes Chilean Oak, Paper010, and
Paper063.

## Package and compatibility

- Input: CSV, TSV, TXT, and unencrypted XLSX.
- Output: JSON, CSV, and PDF.
- Runtime: a current desktop browser; no server or network connection is
  required after the package is downloaded.
- `project-report.schema.json` defines the v0.3.2 reproducible JSON contract.
- `MANIFEST.v0.3.2.json` and `SHA256SUMS.v0.3.2.txt` bind the exact package
  bytes.

## Preserved boundaries

- Outputs remain apparent activation energies conditional on sample,
  atmosphere, physical stage, preprocessing, method, and conversion range.
- Regression confidence intervals remain regression-only uncertainty.
- Generic DTG is not silently reinterpreted as direct `d(alpha)/dt`.
- Paper063 remains an article-derived, whole-kelvin `beta–Tp` transcription. It
  has no separately deposited raw dataset or separate dataset license and
  validates only the separate Kissinger path.
- Automated regression, oracle, offline, export, and integrity gates do not
  replace independent scientific review, observed usability, or real hosted
  platform evidence.

## Upgrade

Retain earlier exports and release artifacts for provenance. Open the v0.3.2
HTML separately, rerun the analysis, and compare JSON configuration, source
identities, warnings, retained observations, provenance, and method results
before replacing a prior report.
