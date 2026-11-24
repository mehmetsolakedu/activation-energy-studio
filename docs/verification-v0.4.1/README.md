# Activation Energy Studio v0.4.1 Verification Summary

This directory records the cross-engine browser verification log and links the
automated verification assets for `Activation-Energy-Studio-v0.4.1.html`
(2,562,747 bytes; SHA-256
`553457455a666d288025ca2c3a44e091d11847d9a894fbc32eb2aa14c2bd98e2`).

## Included v0.4.1 verification assets

- `docs/verification-v0.4.1/macos-cross-browser-summary.json`: structured offline
  execution log on macOS (`darwin arm64`) across Google Chrome 158.0.8127.37
  (Blink/V8), Mozilla Firefox 159.0 (Gecko/SpiderMonkey), and WebKit 27.2
  (WebKit/JavaScriptCore), verifying zero external network requests, zero
  console errors, 11/11 built-in self-test checks, direct binary `.xlsx` upload
  via `read-excel-file` 9.3.10 and `fflate` 0.8.3, and deterministic PDF, CSV,
  and JSON exports on the Chilean Oak (51 results) and rhubarb supplied-rate
  (16 Friedman results) workflows.
- `scripts/run-cross-browser-v0.4.1.mjs`: Playwright runner reproducing the
  three-engine offline browser verification workflow.
- `scripts/generate-variable-kinetics-ode-fixture.py` and
  `tests/fixtures/audit-v041/variable-kinetics-and-kissinger-fixtures.json`:
  50-digit Python `Decimal` and fourth-order Runge-Kutta (RK4) generator and
  reference fixture covering five variable-kinetics ODE and `df = 1`
  confidence-interval boundary scenarios plus an independent five-rate Kissinger
  peak-temperature benchmark (`E_peak = 127.6758987740 kJ mol^-1`, `df = 3`).
- `tests/disposition-variable-kinetics-v041.test.ts` and
  `tests/revision-v041-parity.test.ts`: automated Vitest suites verifying the
  disposition rules, `INTEGRAL_METHOD_VARIABLE_EA_BIAS`,
  `ACTIVATION_ENERGY_CI_INCLUDES_NONPOSITIVE`, Chilean Oak grid and threshold
  sensitivities, and rhubarb direct-XLSX anchor sensitivity.

## Explicit runtime boundary

Browser runs in `macos-cross-browser-summary.json` were executed on macOS
(`darwin arm64`) by the sole author (Mehmet Solak). Windows and Linux browser
executions were not performed for v0.4.1 and are not claimed by this record.
