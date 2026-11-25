# NR–CELS validation lane

## Decision

The pinned Zenodo v1 sources and the two declared independent Friedman reconstructions are accepted as reproducibility evidence. Exact Kinetics Neo raw-pipeline parity is quarantined because the author project and preprocessing settings were not deposited.

Production acceptance uses the public wide-series path with TG as `massPercent`, explicit 100 and minimum-observed-TG anchors, and signed deposited dTG as semantic `massChangeRate`. The production test compares all 91 α values for all three samples against `DEPOSITED_DTG`: Ea within 2×10⁻⁹ kJ/mol, slope within 2×10⁻⁷ K, intercept within 2×10⁻¹⁰, R² within 2×10⁻¹², and n exactly six. No monotonic repair or numerical-derivative fallback participates in this accepted path.

## Pinned source

- Version DOI: [10.5281/zenodo.16939440](https://doi.org/10.5281/zenodo.16939440)
- Version record: [Zenodo 16939440](https://zenodo.org/records/16939440)
- Article DOI: [10.1016/j.ecmx.2025.101513](https://doi.org/10.1016/j.ecmx.2025.101513)
- License: CC BY 4.0
- Retained scope: 18 composite curves at 2, 4, 6, 8, 10, and 20 K/min; nine kinetic exports
- Intentionally excluded from this lane: the single-rate CEL and CELS archive members

The concept DOI `10.5281/zenodo.16939439` is a provenance trap: it currently resolves to later record 18176373, which contains the article but not the two raw-data archives. Reproduction must pin version record 16939440.

## Independent recipes

1. `DEPOSITED_DTG`: initial TG = 100%; final TG = minimum observed TG independently per curve; first downward target-mass crossing; linear temperature and deposited-dTG interpolation; dα/dt = −dTG/(100−minimum TG).
2. `TG_LOCAL_LINEAR_7`: the same conversion and crossing policy, but dTG/dt is an OLS slope of TG versus time in a seven-row window centred on the right crossing row.

Both use T(K)=T(°C)+273.15, R=8.31446261815324 J mol⁻¹ K⁻¹, and unweighted OLS of ln(dα/dt) versus 1/T across six rates. Decimal precision is 50.

## Quantitative comparison

| Sample | Method | Independent mean Ea | Deposited mean Ea | RMSE | Maximum absolute delta |
|---|---:|---:|---:|---:|---:|
| NR-CELS 30 | DEPOSITED_DTG | 244.192434 | 245.315758 | 3.633607 | 16.426949 at α=0.05 |
| NR-CELS 30 | TG_LOCAL_LINEAR_7 | 244.337605 | 245.315758 | 2.830946 | 15.028834 at α=0.05 |
| NR-CELS 45 | DEPOSITED_DTG | 265.025736 | 270.174846 | 9.51413 | 27.093282 at α=0.05 |
| NR-CELS 45 | TG_LOCAL_LINEAR_7 | 265.411333 | 270.174846 | 6.192223 | 26.094245 at α=0.05 |
| NR-CELS 55 | DEPOSITED_DTG | 260.482301 | 263.384901 | 9.925696 | 28.056968 at α=0.05 |
| NR-CELS 55 | TG_LOCAL_LINEAR_7 | 260.725895 | 263.384901 | 5.157745 | 25.4074 at α=0.05 |

The largest deviations occur at low conversion and are consistent with undisclosed baseline, smoothing, endpoint, and interpolation choices. Deposited Kinetics Neo values remain diagnostic targets, not hard raw-pipeline oracles.

The prospective deposited-series RMSE bounds are 4 kJ/mol for NR-CELS 30 and 10 kJ/mol for NR-CELS 45 and 55. The locked values are below those bounds; these are comparison summaries, not evidence that the unpublished Kinetics Neo pipeline has been reproduced exactly.

## Manual adjudication

- NR-CELS 45: the article/table maximum 334.986 kJ/mol conflicts with the deposited-series maximum 334.968 kJ/mol at α=0.68.
- NR-CELS 30 model A→B: reaction order n is 2.175 in the paper and 2.176 in the deposited model export.
- Dataset title says 30–50 phr, while the article and files are 30, 45, and 55 phr.
- “Raw” curve exports are already blank-subtracted and are partly smoothed; TG and dTG column positions vary by file.

## Reproduction

```sh
node scripts/run-nr-cels-friedman-oracle.mjs --check
node scripts/generate-nr-cels-validation-evidence.mjs --check
node --test tests/nr-cels-source-integrity.test.mjs
node --test tests/nr-cels-oracle-reproducibility.test.mjs
npx vitest run tests/nr-cels-wide-production-oracle.test.ts
```

Any source byte, archive member, header semantic, recipe, expected output, manual adjudication, or evidence change requires a written scientific reason and a fresh audit.
