# Activation Energy Studio v0.3.0 research preview

Release date: 2026-07-30

## What is new / Yenilikler

- Turkish and English interface paths with simple and expert modes.
- Guided CSV/TSV/TXT/XLSX mapping with confirmation-gated profile suggestions.
- Three one-click licensed real-data examples covering:
  - raw multi-rate TG for FWO, KAS, and Starink;
  - supplied d(alpha)/dt for Friedman;
  - a separate beta-Tp table for Kissinger.
- Four explicit publication decisions with reasons and a next-experiment path:
  `REPORTABLE`, `REPORTABLE_WITH_CAUTION`, `CALCULATED_UNRELIABLE`, and
  `CALCULATION_REJECTED` (with exact Turkish interface equivalents).
- Bilingual five-minute quick starts, templates, legal/citation material,
  support route, and deterministic SHA-256 release packaging.
- Offline single-HTML operation remains the primary distribution.

## Real-example provenance

1. Chilean Oak raw CSV: Mendeley Data v2,
   <https://doi.org/10.17632/gkhjh4v8tg.2>, CC BY 4.0.
2. Paper010 rhubarb derived supplied d(alpha)/dt: official PLOS ONE S2,
   <https://doi.org/10.1371/journal.pone.0173946.s002>, CC BY 4.0.
3. Paper063 XPS beta-Tp table:
   <https://doi.org/10.3390/ma13245595>, article CC BY 4.0.
   **There is no separately deposited raw dataset or separate dataset
   license.** The five values are article-derived at the printed 1 K
   resolution.

Full attribution and transformation disclosures are in
`THIRD_PARTY_NOTICES.md`.

## Compatibility and offline scope

- Input: CSV, TSV, TXT, and unencrypted XLSX.
- Text decoding: UTF-8, UTF-16 LE/BE, and Windows-1252.
- Output: JSON, CSV, and PDF.
- Runtime: a modern desktop browser; no server or network is required after
  downloading the package.

`MANIFEST.v0.3.0.json` and `SHA256SUMS.v0.3.0.txt` bind the exact packaged
bytes. They prove integrity, not scientific validity on an unreviewed dataset.

## Known boundaries

- Apparent activation energy is conditional on sample, atmosphere, physical
  stage, preprocessing, method, and conversion range.
- Generic DTG is not silently reinterpreted as direct d(alpha)/dt.
- Repeated measurements at one heating rate do not create independent rates.
- Paper010's equation-correct Friedman path retains a documented discrepancy
  from published S5/Table 4 values.
- Paper063 validates only the separate Kissinger path.
- Human scientific review and task-based usability observation remain distinct
  from automated tests and package integrity.

## Upgrade

Keep v0.2 exports for provenance. Open the v0.3 HTML separately, rerun the
analysis, and compare JSON configuration, warnings, retained observations, and
method results before replacing any prior report.
