# Activation Energy Studio

Activation Energy Studio is a self-contained, offline browser application for transparent apparent activation-energy analysis of multi-heating-rate thermoanalytical data.

Version `0.4.1` distributes a single-file offline HTML application (`release/v0.4.1/Activation-Energy-Studio-v0.4.1.html`, `2,562,990` bytes, SHA-256 `1993e1cff6c015603e4267a25bf060823eba444c54560cd65bbb42208d0c9a2d`) that runs locally in a desktop browser without installation or external network calls:

1. Import `.csv`, `.tsv`, `.txt`, or `.xlsx` multi-rate thermal-analysis files locally (`papaparse` `5.5.4`, `read-excel-file` `9.3.10`, and `fflate` `0.8.3`).
2. Inspect and confirm worksheet selection, header row, table layout (long table or side-by-side wide series), column roles, physical units, heating rates, stage anchors (`m0`, `mf`), experimental context, and excluded columns.
3. Evaluate four conversion-resolved isoconversional methods—Flynn–Wall–Ozawa (`FWO`), Kissinger–Akahira–Sunose (`KAS`), `Starink`, and `Friedman`—alongside a separate `Kissinger` peak-temperature (`beta`–`Tp`) pathway.
4. Qualify each conversion point, method, and overall analysis with one of four machine-coded scientific dispositions:
   - `REPORTABLE`
   - `REPORTABLE_WITH_CAUTION`
   - `CALCULATED_UNRELIABLE`
   - `CALCULATION_REJECTED`
5. Export coordinated `PDF`, `CSV`, and `JSON` reports conforming to schema `activation-energy-studio/project-report/v7` (`activation-energy-core/v3`, `activation-energy-formulas/v1`) with SHA-256 input hashes, transformed regression coordinates, exact Student-`t` 95% confidence limits, active diagnostic warnings, and source-row traceability.

## Highlights in v0.4.1

- **Interval-aware unreliability screening (`ACTIVATION_ENERGY_CI_INCLUDES_NONPOSITIVE`):** Apparent activation-energy point estimates whose two-sided 95% Student-`t` confidence interval reaches or crosses zero are classified `CALCULATED_UNRELIABLE` even when pointwise `R^2` exceeds the configured threshold (at `n = 3`, `df = 1`, excluding zero requires `R^2 > 0.99384`).
- **ICTAC-aligned cumulative integral bias warning (`INTEGRAL_METHOD_VARIABLE_EA_BIAS`):** Whenever relative variation across conversion reaches 10% or more (`POSSIBLE_MULTISTEP_EA_VARIATION` or `MULTISTEP_EA_VARIATION`), cumulative integral methods (`FWO`, `KAS`, and `Starink`) attach `INTEGRAL_METHOD_VARIABLE_EA_BIAS` recommending comparison against differential `Friedman` or small-interval incremental integration.
- **Six-layer verification suite:** Verified across automated unit and integration tests (`npm test`), independent 50-digit Python `Decimal` benchmarks (including a five-rate Kissinger peak benchmark, `df = 3`), five fourth-order Runge–Kutta (`RK4`) variable-kinetics ordinary-differential-equation (`ODE`) and confidence-interval boundary scenarios, two public thermoanalytical datasets (four-rate Chilean Oak pyrolysis and three-rate rhubarb combustion), and offline desktop browser runs across Google Chrome, Mozilla Firefox, and Safari/WebKit on macOS (`docs/verification-v0.4.1/`).

## Distribution and historical archives

- **Source repository:** <https://github.com/mehmetsolakedu/activation-energy-studio>
- **Web application:** <https://mehmetsolak.cc/activation-energy-studio/>
- **Scientific specification:** [`docs/SCIENTIFIC_SPECIFICATION.md`](docs/SCIENTIFIC_SPECIFICATION.md)
- **Current release package (`v0.4.1`):** [`release/v0.4.1/`](release/v0.4.1/) (`Activation-Energy-Studio-v0.4.1.html`, [`MANIFEST.v0.4.1.json`](release/v0.4.1/MANIFEST.v0.4.1.json), [`SHA256SUMS.v0.4.1.txt`](release/v0.4.1/SHA256SUMS.v0.4.1.txt), [`SBOM.production.cdx.json`](release/v0.4.1/SBOM.production.cdx.json), [`QUICK_START.md`](release/v0.4.1/QUICK_START.md), and [`RELEASE_NOTES_v0.4.1.md`](release/v0.4.1/RELEASE_NOTES_v0.4.1.md))
- **Verification logs and companion CSV tables (`v0.4.1`):** [`docs/verification-v0.4.1/`](docs/verification-v0.4.1/)
  - [`Supporting_Information.pdf`](docs/verification-v0.4.1/Supporting_Information.pdf)
  - [`macos-cross-browser-summary.json`](docs/verification-v0.4.1/macos-cross-browser-summary.json)
  - [`oak_v041_results.csv`](docs/verification-v0.4.1/oak_v041_results.csv)
  - [`oak_app_vs_decimal50_v041.csv`](docs/verification-v0.4.1/oak_app_vs_decimal50_v041.csv)
  - [`rhubarb_v041_results.csv`](docs/verification-v0.4.1/rhubarb_v041_results.csv)
  - [`source_data_identities_and_rights.csv`](docs/verification-v0.4.1/source_data_identities_and_rights.csv)
  - [`decimal50-parity-reference.json`](docs/verification-v0.4.1/decimal50-parity-reference.json)
- **Immutable historical packages:** Versioned packages in [`release/v0.4.0/`](release/v0.4.0/), [`release/v0.3.2/`](release/v0.3.2/) (archived on Zenodo at <https://doi.org/10.5281/zenodo.21921403>), and [`release/v0.3.1/`](release/v0.3.1/) remain hash-locked for historical reproducibility.

## Local development and verification

Requires Node.js `22.x` and `npm` `10.x`:

```bash
npm ci
npm run check
```

Individual commands:

- `npm run dev` — start the local Vite development server.
- `npm test` — execute the Vitest unit and integration test suite.
- `npm run typecheck` — run TypeScript static type checking.
- `npm run build` — compile TypeScript and bundle the single-file offline HTML application into `dist/index.html`.
- `npm run verify:offline` — verify that the compiled HTML contains inline code and styles with zero external network references.
- `npm run verify:release-manifest:v0.4.1` — verify the SHA-256 manifest and checksums of the `v0.4.1` release package.

## Licensing and third-party data

Activation Energy Studio source code and documentation are distributed under the [MIT License](LICENSE). Reported quantities are apparent activation energies defined within the documented sample, atmosphere, reaction stage, conversion domain, heating-rate design, and preprocessing settings.

Third-party public thermoanalytical datasets included in bundled examples, test benchmarks, and verification tables retain their original `CC BY 4.0` licenses and attributions as documented in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and [`docs/verification-v0.4.1/source_data_identities_and_rights.csv`](docs/verification-v0.4.1/source_data_identities_and_rights.csv). The MIT software license does not relicense third-party experimental data.
