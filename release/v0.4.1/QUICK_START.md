# Activation Energy Studio v0.4.1 — Five-Minute Quick Start

Activation Energy Studio is a single self-contained HTML file requiring no installer or server. Open `Activation-Energy-Studio-v0.4.1.html` in a current Chrome, Edge, Firefox, or Safari browser.

## 1. Choose a bundled example or import data

For an initial walkthrough, select **Simple mode** and one of the bundled public examples:

- **Chilean Oak:** four raw TGA CSV files; FWO, KAS, and Starink across `alpha = 0.05–0.85`.
- **Rhubarb combustion:** supplied `d(alpha)/dt` derived from official TG and `-DTG` curves; Friedman across `alpha = 0.05–0.80`.
- **XPS pyrolysis peaks:** five-rate `beta–Tp` peak-temperature table; separate Kissinger pathway.

For your own datasets, import `.csv`, `.tsv`, `.txt`, or `.xlsx` files. Select separate heating-rate files together. Macro-enabled `.xlsm` workbooks, external workbook links, and formula cells are rejected automatically.

## 2. Review and confirm data interpretation

In the mapping view, verify temperature, mass or `alpha`, `d(alpha)/dt` or DTG semantics, heating rates, units, sample, atmosphere, and reaction stage. Header-based suggestions remain provisional until confirmed by the analyst. Confirm sign, units, and stage anchors (`m0`, `mf`) before running calculations.

Partially missing or non-increasing mapped time series are rejected. When Friedman is requested without a supplied derivative, the software computes a nonuniform three-point finite-difference derivative on retained observations and records the derivative source.

## 3. Run analysis and inspect dispositions

Inspect the scientific disposition before quoting numerical estimates:

1. **REPORTABLE**
2. **REPORTABLE WITH CAUTION**
3. **CALCULATED BUT UNRELIABLE**
4. **CALCULATION REJECTED**

Review active diagnostics, regression plots, residuals, heating-rate counts, and confidence intervals. Nonpositive apparent activation energies are rejected, and any point whose 95% confidence interval reaches or crosses zero is classified as `CALCULATED BUT UNRELIABLE`.

## 4. Export synchronized records

Export the JSON provenance record, CSV numeric table, and PDF summary together. Each report binds input SHA-256 digests, column mappings, configuration options, core and schema identifiers, dispositions, and source-row links.

## Analytical scope

Reported quantities are apparent activation energies conditional on sample, atmosphere, reaction stage, method, preprocessing, and conversion range. Regression confidence intervals represent conditional post-aggregation regression scatter rather than total experimental uncertainty.

Verify package checksums with `SHA256SUMS.v0.4.1.txt`. For bug reports, see `SUPPORT.md` or contact <mailto:mehmetsolak@siirt.edu.tr?subject=Activation%20Energy%20Studio%20v0.4.1%20bug%20report>.
