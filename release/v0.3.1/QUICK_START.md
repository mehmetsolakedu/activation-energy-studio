# Activation Energy Studio v0.3.1 — Five-Minute Quick Start

The application is one offline HTML file. It requires no installer or
Parallels. Open `Activation-Energy-Studio-v0.3.1.html` in a current Chrome,
Edge, Firefox, or Safari browser.

## 1. Choose an example or import your data

For a first analysis, select **Simple mode** and one real example:

- **Chilean Oak:** four raw CSV files; FWO, KAS, and Starink;
  `α = 0.05–0.85`.
- **Paper010 rhubarb:** `dα/dt` derived from the official DTG data; Friedman;
  `α = 0.05–0.80`.
- **Paper063 XPS:** a separate `β–Tp` table; Kissinger only.

For your own data, add CSV, TSV, TXT, or XLSX files. Select all files together
when different heating rates are stored in separate files.

## 2. Confirm the interpretation

In the mapping card, verify temperature, mass or `α`, the meaning of `dα/dt` or
DTG, heating rate, units, sample, atmosphere, and physical stage. A device
profile is advisory and is **never applied without confirmation**. In
particular, do not treat a generic DTG column as direct `dα/dt`; confirm its
sign, unit, and mass references.

Confirm that the curve preview represents the intended decomposition stage and
conversion range. The application stops when units are unresolved, more than
one header or worksheet is plausible, stages overlap, or heating-rate evidence
is missing.

## 3. Analyze, review the disposition, and export

Run the method and review the disposition card first:

1. **REPORTABLE**
2. **REPORTABLE WITH CAUTION**
3. **CALCULATED BUT UNRELIABLE**
4. **CALCULATION REJECTED**

Then inspect the reasons, warnings, regressions, heating-rate count, and
recommended next experiment. JSON is the reproducibility record, CSV is the
numeric results table, and PDF is the human-readable project report. Retain all
three files together.

## Scientific boundary

The output is not a single immutable material constant. Apparent activation
energy depends on sample, atmosphere, physical stage, method, preprocessing,
and selected `α` range. Regression confidence intervals do not cover every
experimental and model-form uncertainty.

The Paper063 example is derived from CC BY 4.0 article content; there is no
separate raw dataset or separate dataset license.

Verify file integrity with `SHA256SUMS.v0.3.1.txt`. Follow `SUPPORT.md` or send a
reproducible bug report to
<mailto:mehmetsolak@siirt.edu.tr?subject=Activation%20Energy%20Studio%20v0.3.1%20bug%20report>.
