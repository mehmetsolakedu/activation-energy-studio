# Activation Energy Studio v0.3.1 Research Preview

Release date: 2026-08-01

## Changes in v0.3.1

- Standardized the user interface, reports, diagnostics, included examples,
  templates, and current documentation in technical English.
- Retained Simple and Expert modes while removing the language switch and all
  bilingual presentation from the current package.
- Preserved the confirmation-gated CSV/TSV/TXT/XLSX import workflow and
  advisory instrument-profile behavior.
- Preserved the four scientific dispositions: `REPORTABLE`,
  `REPORTABLE_WITH_CAUTION`, `CALCULATED_UNRELIABLE`, and
  `CALCULATION_REJECTED`.
- Preserved the v0.3.0 scientific core and published that release unchanged as
  byte-bound history.

## Included real examples

1. Chilean Oak raw CSV: Mendeley Data v2,
   <https://doi.org/10.17632/gkhjh4v8tg.2>, CC BY 4.0.
2. Paper010 rhubarb supplied `dα/dt` derived from official PLOS ONE S2 data,
   <https://doi.org/10.1371/journal.pone.0173946.s002>, CC BY 4.0.
3. Paper063 XPS `β–Tp` table,
   <https://doi.org/10.3390/ma13245595>, article content under CC BY 4.0.
   **No separately deposited raw dataset or separate dataset license exists.**
   The five values are article-derived at the printed 1 K resolution.

Full attribution and transformation disclosures are provided in
`THIRD_PARTY_NOTICES.md`.

## Compatibility and offline operation

- Input: CSV, TSV, TXT, and unencrypted XLSX.
- Text decoding: UTF-8, UTF-16 LE/BE, and Windows-1252.
- Output: JSON, CSV, and PDF.
- Runtime: a current desktop browser; no server or network connection is
  required after the package is downloaded.

`MANIFEST.v0.3.1.json` and `SHA256SUMS.v0.3.1.txt` bind the exact packaged
bytes. They establish integrity, not scientific validity for an unreviewed
dataset.

## Known boundaries

- Apparent activation energy is conditional on sample, atmosphere, physical
  stage, preprocessing, method, and conversion range.
- Generic DTG is not silently reinterpreted as direct `dα/dt`.
- Repeated measurements at one heating rate do not constitute independent
  heating rates.
- The equation-correct Paper010 Friedman path retains a documented discrepancy
  from the published S5/Table 4 values.
- Paper063 validates only the separate Kissinger path.
- Human scientific review and task-based usability observation remain distinct
  from automated tests and package-integrity verification.

## Upgrade

Retain v0.2 and v0.3.0 exports for provenance. Open the v0.3.1 HTML separately,
rerun the analysis, and compare JSON configuration, warnings, retained
observations, and method results before replacing any prior report.
