# Activation Energy Studio v0.4.0 — Five-Minute Quick Start

The Research Preview application is one offline HTML file. It requires no installer
or server. Open `Activation-Energy-Studio-v0.4.0.html` in a current Chrome,
Edge, Firefox, or Safari browser.

## 1. Choose an example or import data

For a first analysis, select **Simple mode** and one bundled real example:

- **Chilean Oak:** four raw CSV files; FWO, KAS, and Starink;
  `alpha = 0.05–0.85`.
- **Paper010 rhubarb:** supplied `d(alpha)/dt` derived from official TG and DTG
  data; Friedman; `alpha = 0.05–0.80`.
- **Paper063 XPS:** a separate five-row `beta–Tp` table; Kissinger only.

For your own data, add CSV, TSV, whitespace-delimited TXT, or XLSX files. Select
all separate heating-rate files together. The `.xlsm` extension is not
supported. Never rename an untrusted macro-enabled workbook to `.xlsx`;
macro-bearing or externally linked OOXML content is rejected even under an
`.xlsx` name.

## 2. Confirm the interpretation

In the mapping card, verify temperature, mass or `alpha`, the meaning of
`d(alpha)/dt` or DTG, heating rate, units, sample, atmosphere, and physical
stage. A device profile is advisory and is never applied without confirmation.
Do not treat generic DTG as direct `d(alpha)/dt`; confirm sign, units, and mass
reference.

Partially missing or non-finite mapped time values are rejected. When a raw
wide series has no supplied derivative, the application calculates the
derivative on retained source observations before interpolation and records the
derivative source.

Confirm that the curve preview represents the intended decomposition stage and
conversion range. The application stops when units are unresolved, more than
one header or worksheet is plausible, stages overlap, or heating-rate evidence
is missing.

## 3. Analyze and review the disposition

Review the disposition card before any number:

1. **REPORTABLE**
2. **REPORTABLE WITH CAUTION**
3. **CALCULATED BUT UNRELIABLE**
4. **CALCULATION REJECTED**

Then inspect reasons, warnings, regressions, heating-rate count, derivative
source, and recommended next experiment. A nonpositive or non-finite apparent
activation energy is rejected without an Ea, standard error, or confidence
interval. An interval that reaches or crosses zero is not reportable.

## 4. Export one bound record

JSON is the reproducibility record, CSV is the numeric results table, and PDF
is the human-readable report. Export all three without changing input or
mapping, and retain them together. If the analyzed revision changes, rerun the
analysis before exporting.

Each report binds source-file identities, options, scientific-core and schema
versions, result dispositions, and export lineage. Licensed examples also
carry their source, extraction, transformation, precision, rounding,
license-scope, and claim-limit provenance.

## Scientific boundary

The output is not a universal material constant. Apparent activation energy
depends on sample, atmosphere, physical stage, method, preprocessing, and the
selected `alpha` range. Regression confidence intervals do not include every
experimental and model-form uncertainty, including thermal lag. The
inverse-temperature spread floor is a numerical guard, not a substitute for an
instrument-specific uncertainty study.

Verify package integrity with `SHA256SUMS.v0.4.0.txt`. Follow `SUPPORT.md` or
send a reproducible report to
<mailto:mehmetsolak@siirt.edu.tr?subject=Activation%20Energy%20Studio%20v0.4.0%20bug%20report>.
