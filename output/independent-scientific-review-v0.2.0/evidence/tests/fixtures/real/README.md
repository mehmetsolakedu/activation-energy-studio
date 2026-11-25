# Real-data and publication-derived validation lanes

## Paper 010 raw-curve validation lane

## Source and licence

- Article: https://doi.org/10.1371/journal.pone.0173946
- Official supporting file used for the fixture: https://doi.org/10.1371/journal.pone.0173946.s002
- Source workbook: `source/paper010/pone.0173946.s002.xlsx`
- Source worksheet/range: `Fig.2.`, RH TG/DTG panels A/B, columns A:L
- Sample: rhubarb (RH)
- Atmosphere: simulated air, N2:O2 = 4:1, 60 mL/min
- Heating program: room temperature to 600 °C at 5, 10 and 20 °C/min
- Licence: the PLOS article and its supporting information are published under CC BY 4.0; attribution is retained through the DOI and hashes below.

The five official supporting workbooks were downloaded unchanged on 2026-07-18:

| File | SHA-256 |
|---|---|
| `pone.0173946.s001.xlsx` | `04d0ac81d6d62cd49510a5a02ba2b6013161c200e0e6c7fbf41957d7cf552e69` |
| `pone.0173946.s002.xlsx` | `d24e218dd8da9646312b122ddc892d1d338783ce2829877145fa298491d99b57` |
| `pone.0173946.s003.xlsx` | `c93910520215959e7aa2c745db2d079c7da5e8396a78fd4537ff060b8b257793` |
| `pone.0173946.s004.xlsx` | `0bed9425e3b8a6195a540d0461f3fca5451d0039db5ccee7c1b7bfcaebaaabdd` |
| `pone.0173946.s005.xlsx` | `f74bc21563263ef43669c41937d842065683e615a4b8d30a6df422caadf89463` |

Raw workbooks are immutable validation sources. They are not rewritten by the derivation script.

## Deterministic reduction

Run `npm run derive:paper010` to regenerate `paper010_rh_t_alpha_beta.csv`. The script:

1. refuses to proceed unless the S2 workbook hash matches;
2. selects RH temperature/weight pairs A:B, C:D and E:F and matching
   temperature/-DTG pairs G:H, I:J and K:L;
3. assigns the published heating rates 5, 10 and 20 °C/min in that order;
4. drops Excel zero-padding rows with temperature <= 0;
5. calculates the initial-normalized mass-loss fraction as
   `alpha = 1 - weightPercent/100` (not a final-residue-normalized stage
   conversion);
6. linearly interpolates the first crossing of alpha 0.05 to 0.80 in 0.05 steps;
7. linearly interpolates the official positive `-DTG [%/min]` ordinate at each
   `T_alpha`, then converts it to `dAlpha/dt [1/min]` by dividing by 100;
8. refuses any non-positive target derivative instead of taking an absolute
   value or clipping it; and
9. writes 48 provenance-bounded T-alpha-dAlpha/dt-beta rows without smoothing
   or outlier removal.

All 48 target derivatives are positive. Derived fixture SHA-256:
`a913d8111af91a4fa8a2fc3d1c8dd02ec0e216795dad9bfd77cff4912e76b27d`.

`manifest.json` schema v2 locks the official source, derived fixture,
independent expected output, independent oracle implementation, and every
predeclared comparison tolerance. Rebaselining requires a scientific release
note and an independently recalculated reference.

## Independent numerical reference

`oracle/paper010_decimal_oracle.py` parses the official XLSX directly as OOXML
using only the Python standard library and computes the canonical
`paper010_rh_reference.json` with 50-digit Decimal arithmetic. It never imports
the application implementation. Run:

```bash
npm run verify:paper010-oracle
npm run test:paper010-oracle
```

The Node launcher probes `python3`, `python`, and Windows `py -3`, then invokes
the oracle with isolated `-I -S` flags. The oracle regenerates the derived CSV
byte-for-byte and independently calculates direct ordinary least squares:

- KAS: `x=1/T`, `y=ln(beta/T^2)`, `Ea=-slope*R`;
- FWO: `x=1/T`, `y=ln(beta)`, `Ea=-slope*R/1.052`;
- Starink: `x=1/T`, `y=ln(beta/T^1.92)`,
  `Ea=-slope*R/1.0008`;
- Friedman: `x=1/T`, `y=ln(dAlpha/dt)`, `Ea=-slope*R`, conditional
  on the official supplied -DTG path above;
- `R=8.31446261815324 J mol^-1 K^-1`.

Locked hashes:

- oracle implementation: `d9ae629d26d183bda53c11875dfe3e8a5bd1e59150a2fb149864f8df31f8eeb2`;
- canonical Decimal reference: `956617949a4f2b1ddf29d672c946fda6fea48dd33a0536d69fbf24f5aa863e68`.

The independent raw-data means over alpha 0.05-0.80 are 131.0216 kJ/mol
(KAS), 133.8459 kJ/mol (FWO), 131.3079 kJ/mol (Starink), and
131.4393 kJ/mol (equation-correct Friedman). The publication reports 106.28,
110.36, and 358.47 kJ/mol for KAS, FWO, and Friedman; Starink is not reported.
The raw-data reconstruction therefore does **not** reproduce the publication
averages under the explicit reduction above.

The Friedman discrepancy is especially important. S4 cells labelled
`lnda/dt` closely track unlogged -DTG values: their RMSE against exact S2 raw
`-DTG` is 0.0432, versus 2.3622 against `ln(-DTG)` and 6.7151 against
`ln(dAlpha/dt)`. Using exact S2 raw -DTG as if it were already the logarithmic
ordinate gives a nonstandard mean of 357.7084 kJ/mol and correlation 0.99569
with the S5 series; S5's arithmetic mean is 358.4650 kJ/mol. The stored,
rounded S4 coordinates give 348.7796 kJ/mol and do not exactly reproduce S5.
These paths are retained only as negative publication-reproduction
diagnostics; neither is accepted as the equation-correct Friedman oracle. The
KAS/FWO S4 plotting-table reconstruction is likewise closer to Table 4,
pointing to undocumented, rounded, or inconsistent preprocessing.

The software validation claim is consequently bounded: the browser ingestion
and scientific core must match all four independent Decimal references for the
explicit, hashed reduction. This validates the tested software pathway, not a
universal material constant, the publication's preprocessing, or total
experimental uncertainty.

## Chilean Oak Mendeley v2 raw-curve lane

- Dataset: <https://doi.org/10.17632/gkhjh4v8tg.2>
- Article: <https://doi.org/10.1016/j.indcrop.2025.121296>
- Licence: CC BY 4.0
- Sample: untreated Chilean Oak (*Nothofagus obliqua*)
- Rates: 5, 10, 20 and 40 K/min under N2

`oak/source/` retains the four official CSV files byte-for-byte. The fixture
manifest locks their SHA-256 values, sizes, UTF-8 BOM and CRLF representation.
`.gitattributes` marks them `-text`, so a Windows checkout cannot silently
rewrite the source bytes.

The production path uses an explicit one-series wide mapping for each file:

- `Temperature (°C)` is converted with `+273.15`;
- `Conversion, α` is a fraction;
- supplied `dα/dt (min-1)` is used for Friedman;
- alpha 0.05 through 0.85 is projected at 0.05 spacing;
- each target must have exactly one upward and zero downward crossings.

This explicit projection is necessary because the author-derived alpha columns
contain small nonmonotonic fluctuations. Every locked target nevertheless has
one unambiguous upward crossing. The importer performs no sorting, smoothing,
extrapolation or source-file rewrite and retains both contributing source rows.

The source audit found several human-produced inconsistencies which are tested
rather than silently accepted:

- the redundant Kelvin column is `T_C+273.00`, not `T_C+273.15`;
- the column labelled `1/T (K-1)` stores approximately `1000/T`;
- the 10 K/min export contains delimiter-only tail rows and one isolated
  post-data cell at physical source row 4802;
- article and dataset metadata disagree on N2 flow (20 versus 40).

The post-data cell is retained in the immutable CSV and excluded only with the
visible `WIDE_TRAILING_INCOMPLETE_ROW_EXCLUDED` warning. Blank export rows are
retained during parsing so provenance continues to refer to physical source
row 4802 rather than a compressed row number.

`oak/oracle/oak_decimal_oracle.py` imports only the Python standard library and
uses `Decimal(50)`. It independently validates the source hashes, projects all
68 points, and locks every FWO/KAS/Friedman transformed vector, OLS result and
Ea. The equation-correct means for the declared 17-point validation grid are:

| Method | Mean Ea (kJ/mol) | Sample SD (kJ/mol) | Mean adjusted R² |
|---|---:|---:|---:|
| FWO | 176.995499 | 6.756732 | 0.9992062 |
| KAS | 176.104695 | 6.617790 | 0.9991312 |
| Friedman | 177.506511 | 8.303183 | 0.9976574 |

An independent GNU `bc` scale-50 calculation at alpha 0.50 checks all four
interpolations and three regressions without importing either the application
or Decimal oracle. Run:

```bash
npm run verify:oak-oracle
npm run test:oak-oracle
npm test -- tests/oak-source-integrity.test.ts \
  tests/oak-manual-adjudication.test.ts \
  tests/oak-raw-wide-series.test.ts
```

Publication values remain a separate comparison, not the oracle. The reported
Oak FWO value is reproduced closely by the author-Kelvin path. The reported
KAS value is consistent to the printed tenth with also applying FWO's
method-specific `1.052` coefficient to KAS, where the article's own KAS
equation contains no such coefficient. Friedman shows a related signal but
has unresolved derivative/smoothing ambiguity. KAS, Friedman, every `±` value,
and exact average adjusted R² are therefore quarantined as hard acceptance
targets. Full adjudication is in
`evidence/validation/oak-publication-audit/OAK_PUBLICATION_AUDIT.md`.

The lane remains `gold-candidate`: local macOS tests pass, while actual
GitHub-hosted Linux and Windows executions are still pending. Parallels is not
part of the validation design.

## NR–CELS Zenodo v1 raw TXT lane

- Version DOI: <https://doi.org/10.5281/zenodo.16939440>
- Article: <https://doi.org/10.1016/j.ecmx.2025.101513>
- Licence: CC BY 4.0
- Samples: NR–CELS 30, 45 and 55 phr
- Rates: 2, 4, 6, 8, 10 and 20 K/min under Ar

`nr-cels/source/` retains both official ZIP archives, 18 UTF-16LE composite
TG/dTG curves and nine Kinetics Neo exports. The version DOI is mandatory:
the concept DOI currently resolves to a later article-only record without the
raw archives. TG and dTG physical column positions vary across the files, so
the dedicated manifest locks each header mapping instead of assuming a fixed
position.

The accepted production path uses explicit wide-series `massPercent` anchors
of 100 and the minimum observed TG, plus signed deposited dTG mapped as
`massChangeRate`. All 273 Friedman estimates, their n, slope, intercept and R²
match the independent Decimal oracle. No isotonic repair or numerical
derivative fallback participates. The article/Kinetics values remain
diagnostic because the proprietary baseline and smoothing pipeline was not
deposited; low-α differences reach about 16–28 kJ/mol. Two printed/deposited
last-digit conflicts and the dataset's “30–50 phr” versus actual 30/45/55 phr
metadata are quarantined as human-produced source issues.

```bash
npm run verify:nr-cels-oracle
npm run test:nr-cels-oracle
npx vitest run tests/nr-cels-wide-production-oracle.test.ts
```

## Dryad Polyisoprene LPI-01 lane

- Dataset: <https://doi.org/10.5061/dryad.0cfxpnvx2>, version 2
- Article: <https://doi.org/10.1098/rsos.190869>
- Licence: CC0 1.0
- Rates: 2, 5, 10 and 15 K/min under N2

`dryad-polyisoprene/source/Data.zip` and eight extracted Weight/Derivative
Weight traces are byte-locked. The declared first downward crossing recipe at
α=0.2–0.8 gives independent means of FWO 316.0424, KAS 321.1499 and Friedman
301.0240 kJ/mol. The production scientific core reproduces all 21 slopes and
R² values; Ea comparison explicitly adjusts only for the oracle's historical
`R=8.3142` versus the product's exact SI gas constant.

Paper Table 4 values 319/324/330 kJ/mol are diagnostic, not oracle values.
Manual reconstruction also shows that the HBPI-01 and HBPI-03 Table 3
T20/T50/residue cells follow the opposite sample's raw trace. Those cells are
classified as a publication/data problem rather than forcing the software to
match them.

```bash
npm run verify:dryad-oracle
npm run test:dryad-oracle
npx vitest run tests/dryad-polyisoprene-production-core.test.ts
```

## Coal–SPT–Paraffin Mendeley v1 lane

- Selected dataset: <https://doi.org/10.17632/w22346frww.1>
- Article: <https://doi.org/10.1016/j.fuel.2021.120305>
- Data article: <https://doi.org/10.1016/j.dib.2021.107170>
- Licence: CC BY 4.0

Version 1 is deliberately pinned because version 2 is fragmented, missing
three v1 runs and contains mislabeled standalone filenames. The bounded lane
uses only nominal-10 mg paraffin sheets 17–24: two replicates at 3, 10, 20 and
40 K/min. A standard-library OOXML/Decimal oracle projects 64 observations and
the production CSV→ingestion→adapter→core path matches every physical-scale
replicate group, transformed vector, OLS intermediate, confidence interval and
Ea.

Oracle means are Friedman 80.3049, KAS 80.2546 and FWO 85.3446 kJ/mol; the
publication's 80.22/80.67/85.67 values remain secondary context. Copied
publication sections, peak-temperature conflicts and absent blend raw curves
are retained as negative evidence.

```bash
npm run verify:coal-spt-paraffin-oracle
npm run test:coal-spt-paraffin-oracle
npx vitest run tests/coal-spt-paraffin-validation.test.ts
```

## Paper 063 publication-derived peak lane

`paper063/` is deliberately separate from the raw-curve lane above. It contains
the five beta–Tp pairs printed for XPS at 5, 20, 40, 60 and 80 K/min:
681, 707, 721, 731 and 737 K. The source is paper 063,
<https://doi.org/10.3390/ma13245595>; the corpus PDF SHA-256 is
`53ede19afffd9194d7c0800227646dacdb8256af652b01bd2579c8199402c9f2`.

The fixture, provenance record and independent reference are:

- `paper063/paper063_kissinger_peaks.csv`;
- `paper063/provenance.json`;
- `paper063/expected-output.json`.

`tests/paper063-kissinger-validation.test.ts` locks all three files and compares
the production standalone Kissinger path with a separately coded regression
and the retained 50-digit Decimal reference. The expected result is
194.4543302994671 kJ/mol with R² 0.9991522617128968, five distinct rates and
three residual degrees of freedom.

This is a transcription of rounded values printed in a CC BY 4.0 article. It is
not an instrument-exported TGA/DTG curve set, has no separate dataset licence,
cannot validate alpha-dependent FWO/KAS/Starink/Friedman calculations and does
not close the open requirement for a second genuinely raw dataset.
