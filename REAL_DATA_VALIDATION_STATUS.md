# Real-data validation status

**Audit date:** 2026-07-18; expanded real-data revalidation 2026-07-29  
**Scope:** Local files under `/Users/mehmetprom4/Desktop/Activation_Energy_Method`, followed by an official-publisher acquisition audit.  
**Status:** **FIVE OFFICIAL REAL-DATA EVIDENCE LANES PASS THEIR BOUNDED SOFTWARE/CORE CONTRACTS; PUBLICATION AND DATASET DISCREPANCIES ARE RETAINED AS NEGATIVE EVIDENCE.**

## Decision

The initial local-only audit correctly found no genuine raw curve file. The gate was then reopened against the official PLOS record for paper 010. All five advertised XLSX supporting files were available from the publisher and were downloaded unchanged.

- `tests/fixtures/real/source/paper010/pone.0173946.s002.xlsx` contains experimental multi-rate TG/DTG rows for rhubarb, moutan and burnet at 5, 10 and 20 °C/min.
- `scripts/derive_paper010_fixture.mjs` verifies the immutable source hash and creates a bounded 48-row RH T-alpha-dAlpha/dt-beta fixture from published weight and matching -DTG curves.
- `tests/fixtures/real/oracle/paper010_decimal_oracle.py` independently parses the XLSX as OOXML using only the Python standard library, regenerates the CSV byte-for-byte and computes complete KAS/FWO/Starink/equation-correct Friedman references with `Decimal(50)` without importing application source.
- `scripts/run-paper010-oracle.mjs` discovers `python3`, `python`, or Windows `py -3`, runs the oracle with isolated `-I -S` flags, and keeps `--check` read-only. This verification lane is portable and does not require Parallels.
- `tests/real-data-validation.test.ts` locks source, derived-data, oracle and expected-output hashes, verifies that all three runs use the supplied `dAlpha/dt`, and compares every alpha, transformed x/y vector, OLS intermediate, confidence interval, Ea and mean for all four methods through actual CSV ingestion, adaptation and the scientific core.
- `tests/paper010-oracle-reproducibility.test.mjs` verifies deterministic canonical-v2 regeneration and fail-closed rejection of source, fixture, reference, re-locked scientific-content, oracle-implementation and exact tolerance-policy tampering.
- No graph-digitized, canonical, manually transcribed or synthetic table was relabelled as experimental raw data.
- `tests/fixtures/real/paper063/` now adds a separate **publication-derived peak table** for paper 063. It transcribes only the five printed `beta`-`Tp` pairs and is explicitly locked as `isRawCurveData=false`, with no separate dataset licence. The focused production-path test is limited to standalone Kissinger implementation validation and does not broaden the Paper 010 raw-curve claim.

The software path matches the reproducibly generated independent Decimal reference. It does **not** reproduce the paper's Table 4 averages under the documented raw-data reduction. In particular, the equation-correct Friedman path gives 131.4393 kJ/mol while Table 4 reports 358.47 kJ/mol. The publication's S4 cells labelled `lnda/dt` closely track unlogged -DTG; using exact S2 raw -DTG as if it were already the logarithmic ordinate gives 357.7084 kJ/mol and correlation 0.99569 with S5. The stored rounded S4 coordinates give 348.7796 kJ/mol, so neither route is exact reproduction. Both remain negative diagnostics rather than valid Friedman preprocessing.

## Chilean Oak: second official raw-data lane

A second genuine raw-data lane uses the official Mendeley Data v2 deposit
`10.17632/gkhjh4v8tg.2` associated with article
`10.1016/j.indcrop.2025.121296`. Four immutable CSV exports provide Chilean Oak
measurements at 5, 10, 20 and 40 K/min under CC BY 4.0. Their source hashes,
row semantics, alpha crossings and data irregularities are locked in
`tests/fixtures/real/oak/manifest.json`.

An application-independent Python-standard-library `Decimal(50)` oracle reads
the raw CSV bytes directly, selects one upward crossing for each alpha from
0.05 through 0.85, linearly interpolates source Celsius and supplied
`dα/dt (min^-1)`, converts temperature with `+273.15`, and calculates every
FWO, KAS and Friedman transformed vector, OLS intermediate, confidence
interval and Ea. The production path ingests the four official CSV files,
projects 68 alpha-rate observations, builds four runs and agrees with that
reference inside prospectively locked binary64-versus-Decimal tolerances.

A separate GNU `bc` scale-50 worksheet, entered from the eight raw bracketing
rows at alpha 0.50 without importing application or oracle code, independently
gives FWO `184.9117987`, KAS `184.1930731`, and Friedman
`188.9234052 kJ/mol`, with R² values `0.9991457527`, `0.9990684521`, and
`0.9997183588`.

The source itself contains human/export irregularities that are preserved
rather than repaired: its Kelvin column uses `+273.00`; the heading
`1/T (K-1)` actually describes approximately `1000/T`; the 10 K/min CSV has an
isolated one-cell artifact at physical row 4,802 after its complete data; and
dataset/article gas-flow metadata disagree. Production ingestion excludes only
that post-data incomplete row with the visible
`WIDE_TRAILING_INCOMPLETE_ROW_EXCLUDED` warning. The same defect inside the
measurement region remains a hard error.

The corrected-K means are FWO `176.9954989`, KAS `176.1046951`, and Friedman
`177.5065108 kJ/mol`. Article Table 3 reports `176.9`, `167.3`, and
`168.2 kJ/mol`. The authors' `+273.00` Kelvin path reproduces FWO at printed
precision. Dividing standard KAS by the FWO-only Doyle coefficient `1.052`
gives `167.3146716`, which rounds exactly to the published KAS value. This is
strong evidence of a publication/method-application error, not a reason to
change the standard KAS implementation. The same scaling brings Friedman near
but not exactly to the reported mean, while the article's own Figure 6
narrative is compatible with an unscaled high Friedman peak; Friedman is
therefore classified as an unresolved publication/preprocessing discrepancy.

The full adjudication is retained in
`evidence/validation/oak-local/OAK_LOCAL_VALIDATION_REPORT.md`; the separate
publication forensic record and its source tables are under
`evidence/validation/oak-publication-audit/`.

## NR–CELS: raw UTF-16 TG/dTG production lane

The pinned Zenodo version DOI `10.5281/zenodo.16939440` supplies two official
archives for the NR–CELS study associated with
`10.1016/j.ecmx.2025.101513`. The concept DOI is not used because it currently
resolves to a later article-only record without the raw archives. Eighteen
UTF-16LE instrument exports cover NR–CELS 30, 45 and 55 phr at six rates
(2–20 K/min); their TG/dTG physical column positions vary and are therefore
locked file by file.

The accepted production path maps TG as `massPercent` with explicit
100/minimum-TG anchors and signed deposited dTG as `massChangeRate`. It
projects 546 observations and reproduces all 273 independent Decimal Friedman
Ea values plus n, slope, intercept and R². No isotonic repair, sorting or
numerical derivative fallback is used. The independent deposited-dTG means are
244.1924, 265.0257 and 260.4823 kJ/mol for 30/45/55 phr.

The deposited Kinetics Neo means are 245.3158, 270.1748 and 263.3849 kJ/mol.
RMSE is 3.63/9.51/9.93 kJ/mol, with the largest differences at α=0.05.
Because the proprietary baseline/smoothing settings and project file were not
deposited, these are classified as transparent preprocessing/protocol
differences rather than software failures. Separate human-produced issues are
quarantined: 334.986 versus 334.968 kJ/mol, reaction order 2.175 versus 2.176,
and dataset metadata saying 30–50 phr although the files are 30/45/55 phr.
Full evidence is in
`evidence/validation/nr-cels/NR_CELS_VALIDATION.md`.

## Dryad Polyisoprene: split-stream raw/core lane

Dryad dataset version 2 (`10.5061/dryad.0cfxpnvx2`) supplies the official
CC0 `Data.zip` for article `10.1098/rsos.190869`. Eight byte-locked LPI-01
Weight/Derivative Weight exports at 2, 5, 10 and 15 K/min yield independent
means of FWO 316.0424, KAS 321.1499 and Friedman 301.0240 kJ/mol. The
production scientific core reproduces all 21 Decimal slopes and R² values;
Ea comparison explicitly accounts for the oracle's documented `R=8.3142`
versus the product's exact SI gas constant.

This is deliberately a core-comparison path, not a claim that the two separate
streams can be fed directly to the strict long-table UI: the raw temperatures
contain repeated/decreasing rows. Paper Table 4's 319/324/330 kJ/mol values
remain diagnostic because endpoints, crossing choice and smoothing are not
operationally disclosed. Manual raw-trace checks show that HBPI-01 and HBPI-03
Table 3 T20/T50/residue values follow the opposite sample; those cells are
classified as a publication/data problem. Full evidence is in
`evidence/validation/dryad-polyisoprene/DRYAD_POLYISOPRENE_VALIDATION.md`.

## Coal–SPT–Paraffin: version-adjudicated replicate lane

The Coal–SPT–Paraffin lane pins Mendeley Data version 1
(`10.17632/w22346frww.1`) rather than version 2 because manual workbook and
filename review shows that v2 is incomplete and mislabeled. The bounded sample
is nominal-10 mg commercial paraffin: two replicates at 3, 10, 20 and
40 K/min from sheets 17–24 of the official 40-sheet workbook.

A Python-standard-library OOXML/Decimal(50) oracle generates a deterministic
64-row projection. Production CSV ingestion, adapter and scientific core
match every replicate group, transformed vector, OLS intermediate, confidence
interval, per-α Ea and mean. Means are Friedman 80.3049, KAS 80.2546 and FWO
85.3446 kJ/mol; the publication's 80.22/80.67/85.67 values are close but
secondary. Copied publication sections, peak-temperature conflicts, absent
blend raw curves and v2 filename errors remain quarantined. Full evidence is
in `evidence/validation/coal-spt-paraffin/VALIDATION_REPORT.md`.

## Initial local audit before official acquisition

### File inventory

After excluding `02_Activation_Energy_Software`, `node_modules`, `.git`, and build directories, the relevant local extensions were:

| Extension | Count | Classification |
|---|---:|---|
| `.csv` | 83 | Canonical evidence tables, method matrices, audit/manifest/ledger files, and other derived project-control tables |
| `.txt` | 975 | PDF text extraction, selected text hits, reports, manifests, and metadata |
| `.zip` | 13 | Submission/archive packages containing derived evidence tables, figures, manifests, and nested submission bundles |
| `.xlsx`, `.xls`, `.ods` | 0 | No workbook available locally |
| `.tsv`, `.dat`, `.asc`, `.lvm`, `.sta` | 0 | No delimited or vendor-like curve export available locally |
| `.mat`, `.npy`, `.npz`, `.h5`, `.hdf5`, `.parquet` | 0 | No numerical binary dataset available locally |

All 83 CSV files were structurally profiled. Eleven are copies/versions of `activation_energy_evidence.csv`, eleven are method matrices, 38 are audit/manifest/mapping/ledger artifacts, and 23 are other derived project tables. The only header/name hit containing broad thermal-method terms was a method co-occurrence matrix, not a curve table.

A content-signature scan required all of the following before treating a text-like file as a candidate: temperature terminology, mass/weight terminology, heating-rate terminology, and repeated structured numeric rows. It found **zero** credible candidates among local CSV/TXT/DAT/ASC/LVM/STA files.

### Source-PDF attachment audit

All 231 PDFs in `01_PDF_Evidence_Extraction/01_Source_PDFs` were parsed successfully with PyPDF 6.11.0 and inspected for embedded attachments.

- 229 PDFs contained no attachment.
- `2017_10_1038_srep40535_Carbon_elimination_from_silicon_kerf_Thermogravimetric_analysis_and_mech.pdf` contained only `xmp` and `NPG_SREP_SREP40535.xmp` metadata attachments.
- `2021_10_1007_s11814_021_0870_9_Catalytic_pyrolysis_of_linear_low_density_polyethylene_using_recycled_co.pdf` contained only `SpringerOnline_0611_Acro7-8(High).joboptions`.
- No PDF contained CSV, XLSX, TXT, DAT, or other numerical data attachments.

## Candidate and near-miss classification

| Local path | What it contains | Column/data structure | Heating rates | Published Ea target | Verdict |
|---|---|---|---|---|---|
| `01_PDF_Evidence_Extraction/05_Canonical_Evidence_Table/activation_energy_evidence.csv` | Manually curated evidence database | Evidence IDs, source/method descriptions, printed equations/results, Ea strings, pages, warnings, availability notes | Textual values from many papers | Yes, many paper-reported targets | **Derived evidence table; not device data and not row-wise TGA curves** |
| `01_PDF_Evidence_Extraction/06_Method_Evidence_Matrix/method_evidence_matrix.csv` | Method-level synthesis matrix | Method class, inputs, outputs, equations, result summaries, warnings | Textual method inputs | Some summarized targets | **Derived synthesis; not experimental data** |
| `Deliverable1/04_Quantitative_Evidence_Synthesis/method_cooccurrence_matrix.csv` | Cross-paper method counts | One row per canonical method and co-occurrence columns | None | No row-wise validation target | **Aggregate matrix; false-positive thermal header hit** |
| `01_PDF_Evidence_Extraction/01_Source_PDFs/2017_10_1371_journal_pone_0173946_Thermal_analysis_during_partial_carbonizing_process_of_rhubarb_moutan_an.pdf` (paper 010) | Published article; the initial local tree omitted its XLSX supplements | Official S2 workbook now supplies row-wise temperature, weight and DTG series; S4 supplies transformed regression plotting values | 5, 10, 20 °C/min | KAS averages: RH 106.28, CO 120.59, SA 170.00 kJ/mol; OFW averages: RH 110.36, CO 123.90, SA 171.33 kJ/mol | **Acquired from the official PLOS DOI and used for the real-data validation lane** |
| `01_PDF_Evidence_Extraction/01_Source_PDFs/2020_10_3390_ma13245595_Pyrolysis_Kinetic_Properties_of_Thermal_Insulation_Waste_Extruded_Polyst.pdf` (paper 063) | Printed plots and result tables; exact DTG peak temperatures are stated in the article; no local supplement | No row-wise temperature–mass curves; publication-derived peak pairs only | 5, 20, 40, 60, 80 K/min; Tp 681, 707, 721, 731, 737 K | Starink average 200.2 kJ/mol; independent Kissinger calculation from printed peaks 194.4543 kJ/mol | **Used only as publication-derived standalone Kissinger validation; raw input remains absent** |
| `01_PDF_Evidence_Extraction/01_Source_PDFs/2020_10_3390_polym12081744_Energy_Utilization_of_Building_Insulation_Waste_Expanded_Polystyrene_Pyr.pdf` (paper 077) | Printed TG/DTG figures and peak-temperature table; no local supplement | Table 2 gives experimental N2 Tp = 671, 699, 735 K and air Tp = 628, 674, 710 K | 5, 20, 80 K/min | Paper reports kinetic-model/Ea results | **Potential published beta–Tp transcription test, but not genuine raw curve data; must not be labelled real-device validation** |
| `01_PDF_Evidence_Extraction/01_Source_PDFs/2017_10_1038_srep40535_supplementary_information.pdf` (paper 009) | Supplementary PDF with printed formulas/tables | No raw spectrum/curve repository or attached numerical table | Printed experimental context only | Printed results exist | **Supplementary document, not supplementary raw data** |

The canonical evidence database also records several papers whose data are available only “on request” and explicitly notes missing local supplemental files. Those statements do not create a locally reproducible validation dataset.

## Acquired evidence and result

The provenance ledger is `tests/fixtures/real/README.md`. Paper 010, Oak,
NR–CELS, Dryad Polyisoprene and Coal–SPT–Paraffin each have a dedicated
machine-readable manifest; the recursive
`evidence/validation/FIXTURE_MANIFEST.v0.2.0.json` locks every retained fixture
byte. Together they record the official DOI/version/licence, sample,
atmosphere, heating program, source/derived/reference/oracle hashes,
deterministic conversion rules, method formulas and prospective tolerances.

For RH over alpha 0.05-0.80, the explicit raw-data reduction gives independent means of 131.0216 kJ/mol (KAS), 133.8459 kJ/mol (FWO), 131.3079 kJ/mol (Starink), and 131.4393 kJ/mol (equation-correct Friedman). The complete application path reproduces every per-alpha reference value within the locked tolerances and records Friedman derivative provenance as `provided`. The paper reports 106.28, 110.36, and 358.47 kJ/mol for KAS, FWO, and Friedman; Starink is not reported.

Recalculation from the rounded S4 KAS/FWO plotting table gives approximately 103.92 and 107.95 kJ/mol, indicating undocumented or rounded preprocessing between S2 raw curves and Table 4. For Friedman, the canonical oracle now hash-locks S2, S4, and S5 and calculates three separate paths: equation-correct `ln(dAlpha/dt)` (131.4393), nonstandard exact S2 raw signal (357.7084), and stored S4 coordinates (348.7796), compared with S5's 358.4650 kJ/mol mean. S4 labelled ordinates are far closer to raw -DTG (RMSE 0.0432) than either log form. This is reproducible scientific negative evidence, not an accepted Friedman formula. The working alpha is also explicitly the initial-normalized mass-loss fraction `1-W/100`, not a final-residue-normalized stage conversion.

## Current gate assessment

- **PASS:** Paper 010 and Chilean Oak official raw-curve paths match independent
  Decimal references; Oak also matches a separately entered `bc` hand check.
- **PASS:** NR–CELS maps all 18 official UTF-16 TG/dTG files through the
  production wide-series route and matches 273 independent Friedman Ea and
  regression records.
- **PASS:** Coal nominal-10 mg paraffin projects eight official workbook runs,
  including physical-scale replicate aggregation, and matches every
  independent FWO/KAS/Friedman intermediate and result through production CSV
  ingestion.
- **PASS (bounded core lane):** Dryad LPI-01's split Weight/DTG streams match
  21 independent FWO/KAS/Friedman slope/R² records in the production
  scientific core; this is not claimed as direct strict long-table import.
- **PASS (separate, non-raw lane):** paper 063's five printed peak pairs exercise the production standalone Kissinger path against an independent calculation: Ea 194.4543303 kJ/mol, R² 0.9991523, five rates and three residual degrees of freedom. This is a publication-derived peak test, not raw-curve evidence.
- **NEGATIVE/PARTIAL:** exact reproduction of several publication tables is
  not achieved and is not forced. Findings include Paper 010's S4 Friedman
  label/value inconsistency, Oak's apparent KAS `1.052` misuse, NR's
  undisclosed proprietary preprocessing, Dryad's cross-sample Table 3 row
  error, and Coal dataset/publication copy and version-label errors.
- **P1 OPEN (robustness extension, not a P0 blocker):** further materials,
  instruments, stage-selection protocols and derivative pipelines remain
  valuable. Five bounded official datasets do not establish a universal
  material truth or justify calling the software correct for every possible
  TGA/DTG file.
