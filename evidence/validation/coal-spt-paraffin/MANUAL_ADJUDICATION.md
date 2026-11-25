# Coal–SPT–Paraffin manual adjudication

Audit date: 2026-07-29

Decision: **approved for a bounded nominal-10 mg paraffin validation lane using
Mendeley Data version 1**.

This decision does not treat the publication as an exact numerical oracle and
does not extend to coal, SPT, or blend results.

## Primary source decision

- Dataset: `TG data`, DOI
  <https://doi.org/10.17632/w22346frww.1>.
- Related latest deposit: <https://doi.org/10.17632/w22346frww.2>.
- Article: <https://doi.org/10.1016/j.fuel.2021.120305>.
- Data article: <https://doi.org/10.1016/j.dib.2021.107170>.
- Dataset license: CC BY 4.0.
- Selected source file ID:
  `a5b6ce7f-dfcd-42b1-8181-e711e650e734`.
- Selected source SHA-256:
  `0226a9f6eaa1fb1bdfc7e5713d2a5faed95d3ac2e8fd3154a66e981bbc4ead21`.

Version 1 is retained because it has 40 populated physical-run sheets.
Version 2 has a 32-populated-sheet core workbook plus standalone files whose
union still lacks three version-1 runs. Several standalone filenames identify
the wrong material, rate, or replicate. The machine-readable comparison is in
`v1-v2-adjudication.json`.

## Bounded sample and run identity

Only workbook sheets 17–24 are in scope:

| Sheet | Physical run |
|---|---|
| `Parafina py3ºC·min-1 (1)` | nominal-10 mg paraffin, 3 K/min, replicate 1 |
| `Parafina py3ºC·min-1 (2)` | nominal-10 mg paraffin, 3 K/min, replicate 2 |
| `Parafina py10ºC·min-1 (1)` | nominal-10 mg paraffin, 10 K/min, replicate 1 |
| `Parafina py10ºC·min-1 (2)` | nominal-10 mg paraffin, 10 K/min, replicate 2 |
| `Parafina py20ºC·min-1 (1)` | nominal-10 mg paraffin, 20 K/min, replicate 1 |
| `Parafina py20ºC·min-1 (2)` | nominal-10 mg paraffin, 20 K/min, replicate 2 |
| `Parafina py40ºC·min-1 (1)` | nominal-10 mg paraffin, 40 K/min, replicate 1 |
| `Parafina py40ºC·min-1 (2)` | nominal-10 mg paraffin, 40 K/min, replicate 2 |

Identity is confirmed from the version-1 workbook topology, internal `Sample =
parafina` metadata, `Sig1`–`Sig5` headings, and the stated rate in the sheet
name. The selected version-1 names are internally consistent; the version-2
names are not accepted as authoritative.

## Locked reduction

1. Begin after the literal `StartOfData`.
2. Retain numeric rows with time ≥ 0, temperature ≥ 0, and mass > 0 in source
   acquisition order.
3. Use the first retained mass as `W0` and last retained positive mass as `Wf`.
4. Calculate `alpha = (W0-Wt)/(W0-Wf)`.
5. Require one upward and zero downward crossings at alpha 0.1 through 0.8.
6. Interpolate temperature and the supplied derivative linearly using the same
   mass-conversion bracket. Do not smooth, sort, or extrapolate.
7. Treat positive `Deriv. Weight [%/min]` as positive mass loss and calculate
   `dAlpha/dt = (DTG/100)/(1-Wf/W0)`.
8. Convert Celsius with exactly `+273.15`.
9. Average replicate temperature and derivative in physical scale within each
   rate before logarithms. Each of the four rates contributes one equal-weight
   OLS input.
10. Calculate FWO, KAS, and Friedman with
    `R = 8.31446261815324 J mol^-1 K^-1`.

The source has small pre-ramp temperature fluctuations and some traces continue
into negative balance drift after paraffin volatilization. Those rows remain in
the immutable workbook. They are not sorted or repaired; the explicit positive
mass rule and selected alpha branch define the bounded reduction.

## Why the production path uses a projected CSV

The workbook stores mass in mg but its derivative as percent of initial mass
per minute. The generic wide-series importer can independently map those units,
but it has no raw-XLSX option for the required additional
`1/(1-Wf/W0)` derivative normalization. Directly declaring the percent signal
as mg/min would be dimensionally incorrect.

The independent standard-library oracle therefore produces a deterministic
64-row `T-alpha-dAlpha/dt-beta` CSV. The production test ingests that locked CSV
through the public ingestion and adapter APIs and compares all transformed
inputs, regression intermediates, confidence intervals, and activation
energies with the independent Decimal reference.

## Publication comparison policy

Fuel Table 4 reports nominal-10 mg paraffin means of:

| Friedman | KAS | FWO |
|---:|---:|---:|
| 80.22 | 80.67 | 85.67 kJ/mol |

These are secondary contextual checks. They are not acceptance values because:

- Data Brief copies the nominal-10 mg per-alpha rows into its 1.8 mg section.
- Its 5 mg section copies coal values.
- Fuel and Data Brief disagree on paraffin peak temperature.
- Endpoint, smoothing, and replicate preprocessing are not completely stated.

If the production engine agrees with the independent oracle but differs from a
printed value, classify the difference as publication/preprocessing evidence,
not automatically as a software defect.

## Exclusions

- Coal and SPT are multistep and have less secure endpoint choices.
- Coal 3 K/min has Q600/purge-flow metadata rather than the derivative channel
  reported for the other runs.
- Raw blend curves are absent.
- Frequency factor, peak-temperature, mechanism, and thermodynamic tables are
  not validation targets.

## Rebaseline rule

Any change to source version, hash, sheet set, row filter, mass anchors,
conversion, derivative normalization, replicate treatment, alpha grid,
temperature offset, gas constant, or method equation requires:

1. a written scientific reason;
2. regeneration by the independent oracle;
3. review of all source-row links and transformed vectors; and
4. a new adjudication record rather than silent expected-value replacement.
