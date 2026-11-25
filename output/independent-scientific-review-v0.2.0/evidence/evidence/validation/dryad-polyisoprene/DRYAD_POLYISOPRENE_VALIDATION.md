# Dryad polyisoprene LPI-01 validation lane

## Decision

This lane is a self-contained, prospective `gold-candidate` built from the
official Dryad version-2 archive. The independently computed LPI-01 FWO, KAS,
and Friedman values are hard regression targets for the recipe below. Values
printed in the associated paper are diagnostic comparisons only.

The archive and every extracted LPI-01 input are byte-locked. The Decimal
oracle also proves that each copied input is byte-identical to its entry in the
official archive before calculating any result.

## Provenance

- Dataset DOI: [10.5061/dryad.0cfxpnvx2](https://doi.org/10.5061/dryad.0cfxpnvx2)
- Dryad dataset version: 2
- Dryad version ID: `42617`
- Dryad file ID: `188033`
- Official artifact: `Data.zip`, 1,947,167 bytes
- Official artifact SHA-256:
  `6f98106f149567647b58edd8667cc899438a1ac5642c24b9a294655115e3295c`
- Dataset license: CC0 1.0
- Associated paper DOI:
  [10.1098/rsos.190869](https://doi.org/10.1098/rsos.190869)
- Sample: LPI-01; atmosphere: nitrogen; heating rates: 2, 5, 10, and
  15 K/min

`source_file_manifest.csv` records the exact eight extracted LPI-01 Weight and
Derivative Weight inputs. The archive has 70 entries, of which 64 are regular
files, and passes its ZIP CRC check.

## Locked calculation recipe

For each heating rate:

1. Preserve acquisition order and parse the Latin-1, CRLF instrument export.
2. Set `w0` to the first Weight (%) row and `wf` to the last Weight (%) row.
3. Calculate `alpha = (w0 - wt) / (w0 - wf)`.
4. At alpha 0.2 through 0.8 in increments of 0.1, select the first downward
   target-weight crossing whose left temperature is at least 250 °C.
5. Linearly interpolate temperature and the deposited DTG value on that same
   segment.
6. Convert temperature with `T_K = T_C + 273.15`.
7. Calculate `dalpha/dt = -DTG / (w0 - wf)`, in min^-1.
8. Run unweighted ordinary least squares across the four heating rates, using
   `R = 8.3142 J mol^-1 K^-1`.

The regressions are:

- FWO: `x=1/T`; `y=ln(beta)`; `Ea=-slope*R/(1.052*1000)`.
- KAS: `x=1/T`; `y=ln(beta/T^2)`; `Ea=-slope*R/1000`.
- Friedman: `x=1/T`; `y=ln(dalpha/dt)`; `Ea=-slope*R/1000`.

No smoothing, sorting, extrapolation, monotonic repair, endpoint substitution,
or source mutation is permitted.

## Expected means

| Method | Independent hard target (kJ/mol) | Paper Table 4 (kJ/mol) | Paper status |
|---|---:|---:|---|
| FWO | 316.04241736807292315856392679494452043995001789313 | 319 | diagnostic |
| KAS | 321.14992729701366067640249829557151699969387566379 | 324 | diagnostic |
| Friedman | 301.0239645361895217878312920772962725706329899783 | 330 | diagnostic |

The canonical JSON output retains every alpha-wise energy, slope, R-squared,
source audit, and adjudication value. The independent means are hard targets
for this exact recipe; agreement with rounded publication values is not an
acceptance gate.

## Production-core comparison

`tests/dryad-polyisoprene-production-core.test.ts` independently parses the
eight retained Latin-1/CRLF Weight and Derivative Weight exports, verifies
their hashes, repeats the declared first-downward-crossing projection and
passes the resulting four runs to the production scientific core. All 21
alpha-method records reproduce the Decimal oracle slopes and R² values within
the prospective binary64 tolerances.

The deposited oracle intentionally follows the article-era value
`R=8.3142 J mol^-1 K^-1`, while the product uses the exact SI molar gas
constant `8.31446261815324`. The test therefore compares slopes and R²
directly, and compares Ea only after applying the explicit
`R_product/R_oracle` ratio. It does not silently rewrite either convention.
This is a core-computation lane, not a direct browser-import claim: the
official Weight and DTG streams are separate files and their acquisition
temperatures contain repeated/decreasing rows, so feeding them as one strict
long table would be scientifically misleading.

## Publication adjudication

Paper Table 3 contains a reproducible HBPI-01/HBPI-03 cross-sample error at
15 K/min:

- HBPI-01 raw: T20 352.8633 °C, T50 416.2685 °C, DTG peak 444.94 °C,
  residue at 580 °C 1.135%.
- HBPI-03 raw: T20 388.02 °C, T50 426.7032 °C, DTG peak 444.48 °C,
  residue at 580 °C 1.33428%.

The HBPI-01 paper row's T20/T50/residue values (388/427/1.3) match HBPI-03,
and the HBPI-03 row's values (353/417/1.1) match HBPI-01, within the printed
precision. The peak-temperature cells are not evidence of the swap because
both raw peaks are near 444–445 °C and the printed 444/446 values do not map
cleanly. The decision is to accept the locked raw traces and quarantine the
affected paper cells.

## Caveats and quarantine boundaries

- Dryad supplies no README, author calculation workbook, transformation code,
  or replicate traces.
- The paper does not operationally define `w0`, `wf`, DTG smoothing, crossing
  choice, or its exact mean calculation. That is why Table 4 is diagnostic.
- The derivative export header is literally truncated at `%/m`. Treating the
  deposited values as percent per minute follows the paper and instrument
  context, but the source header alone does not spell out the final unit.
- Table 4 reports HBPI-02 KAS as 262 kJ/mol while the prose reports 264.
- Some archive traces have negative terminal weight and repeated or decreasing
  temperature rows. This lane does not silently repair them.
- Coats–Redfern input-run selection is unspecified and is not an oracle.
- Equation prose, symbol labels, and some figure captions contain additional
  typographic or stale-label signals; none are used as hard derivation inputs.
- The lane covers only LPI-01's three isoconversional methods under the locked
  recipe. It does not validate every sample or every analysis in the paper.

## Reproduction

Run the dedicated oracle and production-core tests:

```sh
npm run test:dryad-oracle
npx vitest run tests/dryad-polyisoprene-production-core.test.ts
```

Or invoke the isolated Python oracle through its dedicated runner:

```sh
npm run verify:dryad-oracle
```

Any source, recipe, oracle, expected-output, manual-adjudication, or evidence
hash change requires a written scientific reason and a fresh audit.
