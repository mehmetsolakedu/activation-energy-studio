# Second raw dataset acquisition audit

**Audit date:** 2026-07-27; live repository addenda 2026-07-28 and 2026-07-29  
**Scope:** the 231-record local evidence corpus, followed by bounded checks of
official publisher/Europe PMC supplementary packages.  
**Original bounded-audit decision:** **NO SECOND QUALIFYING RAW DATASET WAS
FOUND IN THE LOCAL CORPUS OR THE OFFICIAL PACKAGES CHECKED BELOW.**  
**Current external-repository decision:** **FOUR ADDITIONAL OFFICIAL DATASETS
ARE NOW INTEGRATED UNDER BOUNDED CONTRACTS; THE H100 CANDIDATE BELOW REMAINS
UNINTEGRATED.**

## Claim boundary

This is a P1 robustness search, not an unmet P0 acceptance gate.
`AC-VAL-04` requires at least one accessible, licensed, multi-rate raw dataset;
the publisher-supplied Paper 010 workbook already satisfies that requirement.
Paper 063 remains a publication-derived standalone Kissinger test and is not
raw-curve evidence.

A qualifying second dataset must expose machine-readable row-wise experimental
curves for at least three heating rates, with traceable source, reuse
permission, sample/atmosphere/stage metadata, and enough information to derive
or verify conversion and (for Friedman) its rate. Plot images, digitized curves,
publication tables, fitted parameters, and “available on request” statements do
not meet this contract.

## 2026-07-29 integration addendum

The earlier “Paper 010 only” conclusion is superseded for the broader external
repository scope. Four additional official sources now have dedicated
version/hash locks, independent references and manual publication/data
adjudication:

- Chilean Oak Mendeley v2: four raw CSV curves and a complete
  CSV→wide-series→core Decimal-oracle path;
- NR–CELS Zenodo version `16939440`: 18 raw UTF-16 TG/dTG curves and a complete
  wide-series Friedman production/oracle path;
- Dryad Polyisoprene v2: split Weight/DTG raw streams and a bounded
  raw-projection→production-core comparison;
- Coal–SPT–Paraffin Mendeley v1: an official 40-sheet workbook, with a bounded
  paraffin replicate projection and production ingestion/core comparison.

Their precise claim boundaries are recorded in
`REAL_DATA_VALIDATION_STATUS.md` and `tests/fixtures/real/README.md`. This does
not retroactively alter the original finding that the local 231-PDF tree did
not itself contain those machine-readable source files.

## Live external-repository addendum

A current repository search identified
[Zenodo record 20777046](https://zenodo.org/records/20777046), DOI
`10.5281/zenodo.20777046`, published 2026-06-20 under CC BY 4.0. The `H100`
meadow-hay series contains real NETZSCH STA 449F3 TG exports in AIR(80/20) at
five nominal heating rates. It is not part of the 231-PDF local corpus: no DOI,
title, creator, `H100`, or record identifier match was found in the local PDF
names or structured extraction/matrix files.

| Nominal rate (K/min) | Source file | Data rows | SHA-256 |
|---:|---|---:|---|
| 2 | `ExpDat_1619 H100 2.csv` | 392 | `d335f2d94687141a5db5218420ae711cb72568c18055034de5634a193a213db6` |
| 5 | `ExpDat_1620 H100 5.csv` | 387 | `3748487e4bab9d92b221fefccac9ba30d601498c0b688517b73c528a0535c973` |
| 10 | `ExpDat_1618 H100 10.csv` | 390 | `f483fc827e0a3cb14f095f93ca1d7c70140b9912b92568039aa12b204786c4b0` |
| 15 | `ExpDat_1621 H100 15.csv` | 390 | `e539d9197882772383caa9f222700dfae695200328d4a870d603d0f7514894da` |
| 20 | `ExpDat_1622 H100 20.csv` | 387 | `20e805ee64f505650307efce8893e42eecd5ce3e1bb4553986a36924f634d43b` |

All five repository MD5 values matched the downloaded bytes. Each ANSI,
semicolon-delimited, decimal-comma file carries 37 metadata rows followed by
`Temp./°C; Time/min; Mass/%`; DTG is not supplied.

This candidate satisfies the P1 acquisition contract for source traceability,
reuse permission, real row-wise curves, five rates and atmosphere/instrument
metadata. It does **not** yet satisfy the integration/oracle contract:

- the air-combustion curves are multistage, so one global `m0–mf`
  normalization would be scientifically unsafe;
- the 2 K/min curve ends below zero reported mass and the 20 K/min curve retains
  a broad late-combustion residue, which makes endpoint selection consequential;
- observed time–temperature increments differ from the nominal program by more
  than 2% in places; retaining time must therefore trigger the existing
  `NONLINEAR_HEATING_UNSUPPORTED` boundary instead of silently discarding it;
- no supplied DTG exists, so Friedman could only be labelled
  `NUMERICAL_DERIVATIVE`;
- a provisional, rate-specific first-main-lobe window was identified, but its
  derivative threshold, stage identity and `α=0.20–0.80` common range still
  require sensitivity analysis and independent method review.

Therefore this H100 Zenodo series remains a qualified external P1 candidate
awaiting immutable acquisition, stage adjudication, preprocessing sensitivity
analysis, independent reference construction and full ingestion/core
validation. It is no longer correct to describe Paper 010 as the project's
only integrated real-data lane; the four 2026-07-29 integrations above now
provide additional bounded evidence.

## Official-package checks

All downloads below were inspected in a temporary directory and were not added
to the validation fixtures. SHA-256 values identify the exact packages
inspected.

| Priority | Corpus record / DOI | Experimental rates | Official package checked | Exact package result | Verdict |
|---|---|---|---|---|---|
| 1 | Paper 230 — `10.3390/polym18050666` | 5, 10, 15, 20 K/min | [Europe PMC supplementary endpoint](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12986969/supplementaryFiles), outer ZIP SHA-256 `9437eed89a259b030bbd707bce23acff71b44df8dcc10a889ccf28f25238f50e` | Nested `polymers-18-00666-s001.zip`, SHA-256 `000993bf2e1415d5aae49be61e678bea1a4638eef6a0efc1cb633d20be65eb5e`, contains exactly one 10-page PDF plus no CSV/XLSX/TXT curve table | Strongest author-contact target; official package is graphical/tabular supplementary evidence, not row-wise device data |
| 2 | Paper 228 — `10.3390/polym18010122` | 5, 10, 20, 40 °C/min | [Europe PMC supplementary endpoint](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12787760/supplementaryFiles), outer ZIP SHA-256 `4a13e1b05324b557aea3a56b520b35459086b246055c889f7ae83a622e778b63` | Nested `polymers-18-00122-s001.zip`, SHA-256 `7b5d62acf4736bf6457c1fe5bebc9346e6fa200926eb7d1d484590a019925499`, contains exactly one 1-page PDF and no numerical curve file | Strong second author-contact target; supplementary mechanism figure only |
| 3 | Paper 093 — `10.3390/ma14247564` | 5, 10, 15, 20 K/min in nitrogen and air | [Europe PMC supplementary endpoint](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC8704089/supplementaryFiles), outer ZIP SHA-256 `75fc1f806f8c0ce800e34e613ce4a2b2b4a20c2ebc85093ba1162fc45e0307b7` | Nested `materials-14-07564-s001.zip`, SHA-256 `09415f4c60b09fec53459bf641ed67c382ef426b7b06b66fe6010f0241c72c73`, contains exactly one 7-page PDF and no numerical curve file | Graphs/tables only; article states raw data are available on request |
| 4 | Paper 151 — `10.1088/2515-7620/ad16f2` | 5, 15, 25 °C/min | [Official DOI](https://doi.org/10.1088/2515-7620/ad16f2) and local publisher PDF | Data availability is by reasonable request; no directly downloadable, licensed row-wise curve file was identified | Contact-only candidate |
| Boundary | Paper 063 — `10.3390/ma13245595` | 5, 20, 40, 60, 80 K/min | [Publisher article](https://www.mdpi.com/1996-1944/13/24/5595) and local PDF | Five printed β–Tp pairs and plotted curves, but no instrument-exported T–mass/DTG rows or separate dataset licence | Retain only as publication-derived Kissinger validation |

Paper 025, 115, 149, and 150 were also screened as near-misses. Their available
materials contain figures, experimental descriptions, or kinetic-parameter
tables rather than a reusable multi-rate curve export. No DOI-linked DataCite
dataset record resolving this gap was identified in the original bounded
publisher/package search; the later Zenodo discovery above supersedes that
statement only for the broader live external-repository scope.

## Acquisition request

For the local-corpus lane, Paper 230 remains the first contact target. Request:

1. original exports for every 5/10/15/20 K/min run;
2. temperature, mass (or conversion), and DTG or `dα/dT` columns with units;
3. run-to-sample, atmosphere, stage, and instrument/program metadata;
4. an explicit reusable-data licence or written permission; and
5. a checksum or repository deposit that can be cited independently of email.

Paper 228 is the second contact target under the same contract. Until such a
file is obtained, no plot digitization or publication table may be relabelled as
a second local-corpus experimental raw-data validation lane. The external
Zenodo candidate must likewise not be relabelled as integrated validation until
the explicit scientific integration gates above are complete.
