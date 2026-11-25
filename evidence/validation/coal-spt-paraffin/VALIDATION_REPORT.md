# Coal–SPT–Paraffin bounded validation report

Validation date: 2026-07-29  
Local platform: macOS  
Status: **PASS — local technical raw-source-to-Decimal-oracle and
production-engine comparison**

This is a bounded nominal-10 mg paraffin validation. It is not an independent
experimental replication and does not validate coal, SPT, blends, peak-based
frequency factors, mechanisms, or thermodynamic results.

## Source lock

- Dataset DOI: <https://doi.org/10.17632/w22346frww.1>
- File:
  `TGA raw data of coal, SPT and paraffin at different masses.xlsx`
- File ID: `a5b6ce7f-dfcd-42b1-8181-e711e650e734`
- Bytes: `1,535,050`
- SHA-256:
  `0226a9f6eaa1fb1bdfc7e5713d2a5faed95d3ac2e8fd3154a66e981bbc4ead21`
- License: CC BY 4.0

The source hash returned by Mendeley Data and the local byte hash agree.
Version 1 was manually approved because version 2 is incomplete and contains
material/rate/replicate filename errors. See `MANUAL_ADJUDICATION.md` and
`v1-v2-adjudication.json`.

## Locked calculation

The independent Python-standard-library oracle:

1. opens the XLSX as OOXML without `openpyxl` or application imports;
2. validates the 40-sheet topology and exact nominal-10 mg sheets 17–24;
3. retains positive-mass numeric rows after `StartOfData`;
4. uses per-run first/last retained masses as `W0/Wf`;
5. projects alpha 0.1–0.8 by unique upward crossing;
6. converts positive DTG `%/min` to normalized `dAlpha/dt`;
7. emits 64 run-level observations;
8. averages two physical replicates in physical scale at each of four rates;
9. calculates every FWO, KAS, and Friedman transformed vector, OLS
   intermediate, confidence interval, and Ea with `Decimal(50)`.

The production path ingests the deterministic projected CSV through
`ingestThermalFiles`, builds eight supplied-derivative runs, and invokes the
unchanged production scientific core. Every comparison uses prospectively
locked binary64-versus-Decimal tolerances from the dedicated manifest.

## Results

| Method | Oracle mean Ea (kJ/mol) | Mean R² | Published mean (secondary) |
|---|---:|---:|---:|
| Friedman | 80.3049246142 | 0.9855313464 | 80.22 |
| KAS | 80.2545942322 | 0.9899765030 | 80.67 |
| FWO | 85.3446252183 | 0.9917758820 | 85.67 |

Maximum per-alpha oracle-to-publication differences are 0.5842 kJ/mol for
Friedman, 1.4927 for KAS, and 1.6013 for FWO. These comparisons are retained as
context only. The software acceptance oracle is the independent Decimal
reference.

## Verification executed

```text
node scripts/run-coal-spt-paraffin-oracle.mjs --project-root . --check
PASS

node --test tests/coal-spt-paraffin-oracle-reproducibility.test.mjs
4 tests passed

npx vitest run tests/coal-spt-paraffin-validation.test.ts
3 tests passed

npm run typecheck
PASS
```

The oracle tests additionally prove deterministic byte regeneration and
fail-closed rejection of source and derived-fixture tampering.

## Artifact hashes

| Artifact | SHA-256 |
|---|---|
| Projected CSV | `146dca7f870e8ab1c0d15449b19b0b1d0754c96c39aa7cbf65922e904a59e782` |
| Decimal expected output | `65731e5bc8b620bcac9b99d7b1944df9b4e00a5e31744a55c2a3de1b4fd28b3a` |
| Independent oracle | `8072703fb4188e6dc7ee0c6a68bddb91f372dc7812dffb2dee3bbadeac2a5604` |
| Portable oracle runner | `418fde84fb4d0d47e77e2df8e8f3f97adc1c0aa328dd498e293ee225581ede3f` |

## Remaining boundaries

- Hosted Linux and Windows runs remain pending.
- The generic raw-XLSX wide mapper cannot express the extra derivative
  normalization required when mass is in mg but DTG is initial-mass `%/min`;
  therefore the production comparison begins from the independently projected,
  hash-locked CSV.
- Publication copy errors, peak-temperature conflicts, and missing blend raw
  curves remain quarantined negative evidence.
