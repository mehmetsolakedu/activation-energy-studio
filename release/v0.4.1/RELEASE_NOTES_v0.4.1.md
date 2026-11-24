# Activation Energy Studio v0.4.1 Research Preview

Status: **released Research Preview; public distribution approved by Mehmet
Solak on 2026-11-23**. The canonical repository is
<https://github.com/mehmetsolakedu/activation-energy-studio> and the canonical
web entry point is <https://mehmetsolak.cc/activation-energy-studio/>. The
compiled single-file application `Activation-Energy-Studio-v0.4.1.html`
(2,562,747 bytes) has SHA-256
`553457455a666d288025ca2c3a44e091d11847d9a894fbc32eb2aa14c2bd98e2`. Historical
v0.4.0 and v0.3.2 (Zenodo DOI `10.5281/zenodo.21921403`) packages remain
immutable and separately identifiable.

## Scientific qualification and verification additions in v0.4.1

- **Interval-aware unreliability gate (`ACTIVATION_ENERGY_CI_INCLUDES_NONPOSITIVE`):**
  Any apparent activation-energy estimate whose two-sided 95% Student-t
  confidence interval reaches or crosses zero is classified as
  `CALCULATED_UNRELIABLE` even when pointwise `R^2` meets the configured
  threshold (at `df = 1`, excluding zero requires `R^2 > 0.99384`).
- **ICTAC-aligned cumulative integral variable-Ea warning (`INTEGRAL_METHOD_VARIABLE_EA_BIAS`):**
  Whenever relative profile variation across conversion reaches 10% or more
  (`POSSIBLE_MULTISTEP_EA_VARIATION` or `MULTISTEP_EA_VARIATION`), cumulative
  integral methods (FWO, KAS, and Starink, excluding differential Friedman)
  automatically emit `INTEGRAL_METHOD_VARIABLE_EA_BIAS` recommending comparison
  against differential Friedman or small-interval incremental integration.
- **Independent variable-kinetics RK4 ODE and Kissinger verification:**
  Added five independent fourth-order Runge-Kutta (RK4) ODE and statistical
  boundary-test scenarios (single-step constant control, moderate and strong
  parallel two-step reactions, consecutive two-step reactions, and three-rate
  zero-crossing CI override) plus a distinct five-rate Kissinger Decimal(50)
  peak-temperature benchmark (`df = 3`).
- **Interface wrapping and macOS cross-browser verification:**
  Fixed long diagnostic code wrapping in the Scientific Decision Summary and
  verified offline execution across Google Chrome 158.0.8127.37, Mozilla
  Firefox 159.0, and WebKit 27.2 on macOS (`darwin arm64`) with zero external
  network requests and zero console errors.

## Preserved foundations from v0.4.0

- Centered, scale-conditioned ordinary least squares with exact Student-t
  confidence limits, nonuniform three-point Lagrange derivatives, strict
  monotone temperature and time validation, bounded OOXML (`read-excel-file`
  9.3.10 + `fflate` 0.8.3) and delimited-text (`papaparse` 5.5.4) ingestion,
  `activation-energy-core/v3`, and `activation-energy-studio/project-report/v7`.
- Unchanged production dependency tree (33 locked packages, zero `npm audit
  --omit=dev` advisories at lock time).
