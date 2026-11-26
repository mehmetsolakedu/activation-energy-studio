# Activation Energy Studio v0.4.1 Verification Summary and Companion Tables

This directory contains the cross-engine macOS browser verification log and companion CSV result tables for `Activation-Energy-Studio-v0.4.1.html` (`2,562,990` bytes; SHA-256 `1993e1cff6c015603e4267a25bf060823eba444c54560cd65bbb42208d0c9a2d`).

## Included v0.4.1 files

- `Supporting_Information.pdf`: companion 12-page Supporting Information document (`Tables S1`–`S9` and step-by-step reproduction procedures) for the `v0.4.1` manuscript.
- `macos-cross-browser-summary.json`: structured offline execution log on macOS across Google Chrome 158.0.8127.37 (Blink/V8), Mozilla Firefox 159.0 (Gecko/SpiderMonkey), and Safari/WebKit (AppleWebKit 605.1.15, JavaScriptCore), verifying zero external network requests, zero console errors, `11/11` built-in self-tests, the `51`-result Chilean Oak workflow, and direct binary `.xlsx` upload of the `64`-result rhubarb wide-series workflow with `PDF`, `CSV`, and `JSON` exports.
- `oak_v041_results.csv`: complete `51`-row `v0.4.1` Chilean Oak pyrolysis output table (`FWO`, `KAS`, and `Starink` across `alpha = 0.05` to `0.85`).
- `oak_app_vs_decimal50_v041.csv`: pointwise comparison of all `51` Chilean Oak `v0.4.1` estimates against an independent 50-digit Python `Decimal` implementation (`max |Delta Ea| <= 7.67e-13 kJ mol^-1`).
- `rhubarb_v041_results.csv`: complete `64`-row `v0.4.1` rhubarb direct-XLSX output table (`FWO`, `KAS`, `Starink`, and `Friedman` across `alpha = 0.05` to `0.80`, documenting `6/64` `REPORTABLE_WITH_CAUTION` and `58/64` `CALCULATED_UNRELIABLE` points under the `v0.4.1` positive 95% confidence-interval gate).
- `source_data_identities_and_rights.csv`: SHA-256 digests, byte sizes, DOIs, `CC BY 4.0` license links, and adaptation notices for the third-party experimental datasets.
- `decimal50-parity-reference.json`: 50-digit Python `Decimal` per-conversion reference table consumed by `../../tests/revision-v041-parity.test.ts`.

## Related verification scripts and suites

- `../../scripts/run-cross-browser-v0.4.1.mjs`: Playwright runner reproducing the three-engine offline browser verification workflow.
- `../../scripts/generate-variable-kinetics-ode-fixture.py` and `../../tests/fixtures/audit-v041/variable-kinetics-and-kissinger-fixtures.json`: 50-digit Python `Decimal` and fourth-order Runge–Kutta (`RK4`) generator and reference dataset covering five variable-kinetics ODE and `df = 1` confidence-interval boundary scenarios plus an independent five-rate Kissinger peak-temperature benchmark (`E_peak = 127.6758987740 kJ mol^-1`, `df = 3`).
- `../../tests/disposition-variable-kinetics-v041.test.ts` and `../../tests/revision-v041-parity.test.ts`: automated Vitest suites verifying the disposition rules, `INTEGRAL_METHOD_VARIABLE_EA_BIAS`, `ACTIVATION_ENERGY_CI_INCLUDES_NONPOSITIVE`, Chilean Oak grid and threshold sensitivities, and rhubarb direct-XLSX anchor sensitivity.
