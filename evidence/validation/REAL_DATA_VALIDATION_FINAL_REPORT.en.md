# Real-Data Scientific Validation — Final Verdict Report

**Date:** 2026-07-29  
**Objective:** `REAL_DATA_VALIDATION_GOAL.md`  
**Platform boundary:** Parallels was not used.

## Final verdict

No mathematical software defect conflicting with the independent oracles was
identified in the tested FWO, KAS, Starink, or Friedman equations or in the
regression core of Activation Energy Studio. Every hard production-core target
across the five official real-data lanes passed.

This finding does not mean that every published value is correct. On the
contrary, reconstruction from raw measurements exposed reproducible problems
in the publications and data packages. The software was not adjusted to force
agreement with those values.

The product verdict is **scientific core PASS with explicit limitations**. It
is not a claim of universal correctness for all TGA/DTG files or of a release
validated on every computer. The external gates for a real hosted three-OS
run, an independent scientific reviewer, and a usability study remain open.

## Data-lane decision matrix

| Lane | Hard software/oracle result | Publication comparison | Final classification |
|---|---|---|---|
| Paper 010 RH | The 16 α × KAS/FWO/Starink/Friedman production path matched the Decimal oracle | KAS/FWO, and especially Friedman, cannot be reconstructed from raw S2 as reported in Table 4 | Preprocessing/protocol difference plus a publication method/label problem |
| Chilean Oak | The 17 α × FWO/KAS/Friedman results matched the independent Decimal calculation and the separate α=0.50 `bc` calculation | FWO is close; the printed KAS value is reproduced exactly after applying the FWO-only 1.052 factor; Friedman is only approximate | KAS: publication/method-implementation problem; Friedman: unresolved publication/preprocessing uncertainty |
| NR–CELS | The 18 UTF-16 TG/dTG curves, 546 points, and 273 Friedman results matched the oracle for Ea, n, slope, intercept, and R² | Differences from the deposited Kinetics Neo values reach 16–28 kJ/mol at low α | Preprocessing/protocol difference caused by undocumented baseline/smoothing, plus minor publication/data transcription problems |
| Dryad LPI-01 | The 21 FWO/KAS/Friedman slope and R² records matched the production core | Table 4 is only approximate; the HBPI-01/HBPI-03 T20, T50, and residue cells follow the other sample's raw trace | Table 4: protocol uncertainty; Table 3: publication/data problem |
| Coal, nominal 10 mg paraffin | Two replicates × four rates; every physical grouping, conversion, OLS result, confidence interval, and all 24 Ea values matched the oracle | 80.22/80.67/85.67 kJ/mol are close to the oracle; v2 is incomplete and mislabeled | Production PASS; v2 and copied-table findings are publication/data problems |

## Quantitative summary

| Data | Method | Independent mean Ea (kJ/mol) | Printed/deposited counterpart |
|---|---|---:|---:|
| Oak | FWO | 176.9955 | 176.9 |
| Oak | KAS | 176.1047 | 167.3 |
| Oak | Friedman | 177.5065 | 168.2 |
| NR–CELS 30/45/55 | Friedman | 244.1924 / 265.0257 / 260.4823 | 245.3158 / 270.1748 / 263.3849 |
| Dryad LPI-01 | FWO / KAS / Friedman | 316.0424 / 321.1499 / 301.0240 | 319 / 324 / 330 |
| Coal paraffin | FWO / KAS / Friedman | 85.3446 / 80.2546 / 80.3049 | 85.67 / 80.67 / 80.22 |

The independent Paper 010 means are 131.0216 for KAS, 133.8459 for FWO,
131.3079 for Starink, and 131.4393 kJ/mol for the equation-correct Friedman
path. The RH values in the publication's Table 4 are 106.28, 110.36, and
358.47 kJ/mol, respectively. Those published values are not software oracles.

## Manual verification and publication/data adjudication

- The Oak α=0.50 point was reconstructed from eight raw bracketing rows with a
  separate GNU `bc` scale-50 calculation. The standard KAS result matched the
  Decimal oracle, not the publication value.
- An independent coefficient test showed that the printed Oak KAS value rounds
  exactly after the FWO-only `1.052` coefficient is incorrectly applied to KAS.
- Dryad HBPI-01/HBPI-03 values were recalculated directly from the official
  Weight/DTG traces as T20, T50, the DTG peak, and residue at 580 °C. Only the
  T20, T50, and residue fields were shown to follow the opposite row.
- Coal Mendeley v1 and v2 workbooks were compared manually at the workbook
  topology and physical-run identity levels. Version 1 was selected because it
  retains all 40 runs; the incomplete and incorrectly named v2 was quarantined.
- For NR–CELS, the deposited dTG path, the seven-point local-linear derivative
  reconstructed from TG, and the Kinetics Neo export were kept independent.
  Both raw reconstructions confirm the mid-α trend, but exact Kinetics parity
  is not claimed because the proprietary preprocessing was not published.

## Product issues identified and corrected

No defect was found in the scientific equations. The real-instrument data did,
however, expose product defects affecting ingestion and report traceability.
These were corrected and covered by regression tests:

1. Deterministic in-browser decoding and structural delimiter selection were
   added for `.txt`, UTF-16LE/BE, and Windows-1252 instrument exports.
2. The actual header row after a metadata preamble and the physical blank-line
   numbers are retained in source provenance.
3. Automatically detected time columns can be explicitly excluded, and an
   accepted mapping can be reopened for review.
4. Remapping to another column no longer carries the stale unit forward; the
   new unit must be confirmed.
5. Unapplied mapping edits cannot produce new provenance with stale results;
   analysis and export remain disabled until re-ingestion completes.
6. TXT `textEncoding` and zero-based `headerRow` fields were added to the JSON
   report contract, and the missing schema role for `stage` was corrected.
7. Experimental isotonic α correction was removed from the final product
   because independent review found that it could make supplied α/dαdt
   internally inconsistent. The accepted NR lane retains raw TG+dTG semantics.

## Evidence locations

- Oak: `evidence/validation/oak-local/` and
  `evidence/validation/oak-publication-audit/`
- NR–CELS: `evidence/validation/nr-cels/`
- Dryad: `evidence/validation/dryad-polyisoprene/`
- Coal: `evidence/validation/coal-spt-paraffin/`
- Machine-readable source/oracle locks: `tests/fixtures/real/`
- Complete fixture byte lock:
  `evidence/validation/FIXTURE_MANIFEST.v0.2.0.json`

## Open limitations

- Genuine GitHub-hosted Windows 11, macOS, and Ubuntu artifacts have not been
  produced; the workflow is ready and does not require Parallels.
- No independent scientific-reviewer signature or identity/signature
  authenticity audit is available.
- The five-participant non-expert usability study has not been conducted.
- Some instrument formats may be proprietary binaries; this release is limited
  to CSV, TSV, TXT, and XLSX.
- Activation-energy outputs are apparent values specific to the sample,
  atmosphere, reaction stage, method, and α range. They are not a single
  immutable material constant.
