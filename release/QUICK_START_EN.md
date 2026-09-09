# Activation Energy Studio v0.3 — five-minute quick start

The application is one offline HTML file. It needs no installer or Parallels.
Open `Activation-Energy-Studio-v0.3.0.html` in a current Chrome, Edge, Firefox,
or Safari browser.

## 1. Choose an example or your data

For a first run, choose **Simple mode** and one real example:

- **Chilean Oak:** four raw CSV files, FWO/KAS/Starink, alpha=0.05–0.85.
- **Paper010 rhubarb:** dAlpha/dt derived from official DTG, Friedman,
  alpha=0.05–0.80.
- **Paper063 XPS:** separate beta–Tp table, Kissinger only.

For your own data, drop CSV, TSV, TXT, or XLSX files. Select all files together
when heating rates are stored separately.

## 2. Confirm the preview

In the mapping card, check temperature, mass/alpha, dAlpha/dt or DTG meaning,
heating rate, units, sample, atmosphere, and physical stage. A device profile is
only a suggestion and is **never applied without confirmation**. In particular,
do not treat a generic DTG column as direct dAlpha/dt; confirm its sign, unit,
and mass references.

Confirm that the curve preview shows the intended decomposition stage and
conversion range. The application stops when units are unresolved, more than
one header/sheet is plausible, stages overlap, or heating-rate evidence is
missing.

## 3. Analyze, read the decision, export

Run the method and read the decision card first:

1. **REPORTABLE**
2. **REPORTABLE WITH CAUTION**
3. **CALCULATED BUT UNRELIABLE**
4. **CALCULATION REJECTED**

Then inspect the reasons, warnings, regressions, rate count, and recommended
next experiment. JSON is the reproducibility record, CSV is the numeric result
table, and PDF is the readable project report. Keep all three together.

## Scientific boundary

The output is not a single immutable material constant. Apparent activation
energy depends on sample, atmosphere, physical stage, method, preprocessing,
and selected alpha range. Regression confidence intervals do not cover every
experimental and model-form uncertainty.

The Paper063 example is derived from CC BY 4.0 article content; there is no
separate raw dataset or separate dataset license.

Verify file integrity with `SHA256SUMS.v0.3.0.txt`. Follow `SUPPORT.md` or
email a reproducible bug report to
<mailto:mehmetsolak@siirt.edu.tr?subject=Activation%20Energy%20Studio%20v0.3%20bug%20report>.
