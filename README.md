# Activation Energy Studio

Activation Energy Studio is an offline-first browser application for transparent apparent activation-energy analysis of multi-heating-rate thermoanalytical data.

Version `0.4.1` provides a self-contained single-file HTML workflow (`release/v0.4.1/Activation-Energy-Studio-v0.4.1.html`, `2,562,747` bytes, SHA-256 `553457455a666d288025ca2c3a44e091d11847d9a894fbc32eb2aa14c2bd98e2`) that runs locally in a desktop browser without installation or network requests:

1. Import `.csv`, `.tsv`, `.txt`, or `.xlsx` multi-rate thermal-analysis files locally (`papaparse` `5.5.4`, `read-excel-file` `9.3.10`, and `fflate` `0.8.3`).
2. Inspect and explicitly confirm worksheet selection, header row, table layout (long table or side-by-side wide series), column roles, physical units, heating rates, stage anchors (`m0`, `mf`), experimental context, and excluded columns.
3. Evaluate four conversion-resolved isoconversional methods—Flynn–Wall–Ozawa (`FWO`), Kissinger–Akahira–Sunose (`KAS`), `Starink`, and `Friedman`—alongside an explicitly separate `Kissinger` peak-temperature (`beta`–`Tp`) pathway.
4. Qualify every conversion point, method, and overall analysis with one of four machine-coded scientific dispositions:
   - `REPORTABLE`
   - `REPORTABLE_WITH_CAUTION`
   - `CALCULATED_UNRELIABLE`
   - `CALCULATION_REJECTED`
5. Export coordinated `PDF`, `CSV`, and `JSON` reports conforming to schema `activation-energy-studio/project-report/v7` (`activation-energy-core/v3`, `activation-energy-formulas/v1`) with SHA-256 input hashes, transformed regression coordinates, exact Student-`t` 95% confidence limits, active diagnostic warnings, and source-row traceability.

## Scientific qualification highlights in v0.4.1

- **Interval-aware unreliability screening (`ACTIVATION_ENERGY_CI_INCLUDES_NONPOSITIVE`):** Any apparent activation-energy point estimate whose two-sided 95% Student-`t` confidence interval reaches or crosses zero is classified `CALCULATED_UNRELIABLE` even when pointwise `R^2` exceeds the configured threshold (at `n = 3`, `df = 1`, excluding zero requires `R^2 > 0.99384`).
- **ICTAC-aligned cumulative integral bias warning (`INTEGRAL_METHOD_VARIABLE_EA_BIAS`):** Whenever relative variation across conversion reaches 10% or more (`POSSIBLE_MULTISTEP_EA_VARIATION` or `MULTISTEP_EA_VARIATION`), cumulative integral methods (`FWO`, `KAS`, and `Starink`) emit `INTEGRAL_METHOD_VARIABLE_EA_BIAS` advising comparison against differential `Friedman` or small-interval incremental integration.
- **Six-layer verification suite:** Verified across `545` automated unit and integration tests in `85` repository test modules (`npm test`), independent 50-digit Python `Decimal` benchmarks (including a distinct five-rate Kissinger peak benchmark, `df = 3`), five fourth-order Runge–Kutta (`RK4`) variable-kinetics ordinary-differential-equation (`ODE`) and confidence-interval boundary scenarios, two public thermoanalytical datasets (four-rate Chilean Oak pyrolysis and three-rate rhubarb combustion), and offline desktop browser runs across Google Chrome, Mozilla Firefox, and WebKit on macOS (`docs/verification-v0.4.1/`).

## Distribution and historical archives

- **Canonical source repository:** <https://github.com/mehmetsolakedu/activation-energy-studio>
- **Web application entry point:** <https://mehmetsolak.cc/activation-energy-studio/>
- **Current release package (`v0.4.1`):** [`release/v0.4.1/`](release/v0.4.1/) (`Activation-Energy-Studio-v0.4.1.html`, [`MANIFEST.v0.4.1.json`](release/v0.4.1/MANIFEST.v0.4.1.json), [`SHA256SUMS.v0.4.1.txt`](release/v0.4.1/SHA256SUMS.v0.4.1.txt), [`SBOM.production.cdx.json`](release/v0.4.1/SBOM.production.cdx.json), [`QUICK_START.md`](release/v0.4.1/QUICK_START.md), and [`RELEASE_NOTES_v0.4.1.md`](release/v0.4.1/RELEASE_NOTES_v0.4.1.md))
- **Verification logs and companion CSV tables (`v0.4.1`):** [`docs/verification-v0.4.1/`](docs/verification-v0.4.1/)
  - [`macos-cross-browser-summary.json`](docs/verification-v0.4.1/macos-cross-browser-summary.json)
  - [`oak_v041_results.csv`](docs/verification-v0.4.1/oak_v041_results.csv)
  - [`oak_app_vs_decimal50_v041.csv`](docs/verification-v0.4.1/oak_app_vs_decimal50_v041.csv)
  - [`rhubarb_v041_results.csv`](docs/verification-v0.4.1/rhubarb_v041_results.csv)
  - [`source_data_identities_and_rights.csv`](docs/verification-v0.4.1/source_data_identities_and_rights.csv)
- **Immutable historical packages:** Versioned packages in [`release/v0.4.0/`](release/v0.4.0/), [`release/v0.3.2/`](release/v0.3.2/) (archived on Zenodo at <https://doi.org/10.5281/zenodo.21921403>), and [`release/v0.3.1/`](release/v0.3.1/) remain hash-locked for historical reproducibility. English companion specifications for retained historical documents are indexed in [`docs/technical-english/README.md`](docs/technical-english/README.md).

## Local development and verification commands

Requires Node.js `22.x` and `npm` `10.x`:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run verify:offline
npm run verify:fixture-manifest
npm run verify:release-manifest:v0.4.1
npm run verify:release-manifest:v0.4.0
npm run verify:release-manifest:v0.3.2
npm run verify:production-sbom
npm run verify:technical-english
```

- `npm run dev` starts the local Vite development server.
- `npm test` runs the `85` repository Vitest modules (`545` automated tests) in a clean checkout without network access.
- `npm run build` compiles TypeScript and bundles the single-file offline HTML application into `dist/index.html`, and `npm run verify:offline` statically verifies that the compiled HTML contains a single inline script and style block with zero external network references.
- `npm run verify:fixture-manifest` verifies recursive SHA-256 hashes across `tests/fixtures/` against [`evidence/validation/FIXTURE_MANIFEST.v0.2.0.json`](evidence/validation/FIXTURE_MANIFEST.v0.2.0.json).
- `npm run test:release-manifest` and `npm run verify:release-manifest:v0.4.1` verify the cryptographic manifest and checksums of the `v0.4.1` release package alongside historical release locks.

## Scope boundaries and licensing

Activation Energy Studio is open-source research software distributed under the [MIT License](LICENSE). It is not certified thermal-analysis instrument software, a process-safety qualification system, or a substitute for expert kinetic interpretation. Reported values are apparent activation energies valid strictly within the documented sample, atmosphere, reaction stage, conversion domain, heating-rate design, and preprocessing settings. Cross-engine browser verification for `v0.4.1` covers Google Chrome, Mozilla Firefox, and WebKit on macOS (`darwin arm64`) executed by the sole author; Windows and Linux browser runs were not performed for `v0.4.1`.

Third-party public thermoanalytical datasets included in test fixtures and companion verification tables retain their original `CC BY 4.0` licenses and attributions as documented in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and [`docs/verification-v0.4.1/source_data_identities_and_rights.csv`](docs/verification-v0.4.1/source_data_identities_and_rights.csv). The MIT software license does not relicense third-party experimental data.
