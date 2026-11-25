# Scientific Traceability Report

**Audit date:** 2026-07-18  
**Status:** **PASS — five implemented methods have an automatic evidence-chain audit and a repeated visual spot check.**

## Automatic audit

`npm run verify:scientific-traceability` fails closed unless every V1 method has all of the following:

- a non-citation, implemented row in `method_evidence_matrix.csv`;
- a non-empty rendered page or quality crop linked from `01_SCIENTIFIC_SPEC_V1.md`;
- a non-empty paper extraction note;
- a non-empty ready-for-synthesis finding;
- for Kissinger, the explicit quality-warning record.

The locked routes are:

| Software method | Corpus paper | Matrix class | Visual evidence |
|---|---:|---|---|
| FWO/OFW | 056 | `implemented` | `paper_056` p05 crop, Equation 6 |
| KAS | 002 | `implemented` | `paper_002` rendered p06, Equation 2 and Table 2 |
| Starink | 063 | `implemented` | `paper_063` p04 crop, Equation 12 |
| Friedman | 010 | `implemented` | `paper_010` rendered p05, Equations 11–12 |
| Kissinger | 064 | `implemented_reanalysis` | `paper_064` p02 crop, Equations 1–3 and applicability discussion |

## Manual visual spot check

The five linked visuals were reopened at original resolution on 2026-07-18. The following software-critical details were legible and consistent with the scientific specification:

- FWO uses natural `ln beta`, the Doyle constants `5.331` and `1.052`, and a `1/T` slope.
- KAS uses `ln(beta/T^2)` against `1/T`; the same page visibly reports conversion-resolved FWO/KAS results.
- Starink uses `ln(beta/T^1.92)` and the `1.0008` slope coefficient.
- Friedman explicitly gives `d alpha/dt = beta(d alpha/dT)` and the logarithmic differential form.
- Kissinger uses the separate peak-temperature transform `ln(beta/Tp^2)` and the source warns that peak conversion can vary with heating rate and conceal process complexity.

This PASS proves the implemented five-method evidence routes are present and non-citation-only. The separate corpus-integrity ledger accounts for 231 source PDF records (230 primary and one supplementary), but does not establish 231 distinct articles or verify Q1/Q2 status. Neither audit replaces numerical, platform, offline-runtime, or user validation.
