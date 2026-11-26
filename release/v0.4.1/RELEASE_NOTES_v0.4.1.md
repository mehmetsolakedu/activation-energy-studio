# Activation Energy Studio v0.4.1 — Release Notes

Release date: **2026-11-23** · Author: **Mehmet Solak**  
Repository: <https://github.com/mehmetsolakedu/activation-energy-studio>  
Web application: <https://mehmetsolak.cc/activation-energy-studio/>  

The compiled single-file offline application `Activation-Energy-Studio-v0.4.1.html` (2,562,990 bytes) has SHA-256 `1993e1cff6c015603e4267a25bf060823eba444c54560cd65bbb42208d0c9a2d`. Historical `v0.4.0` and `v0.3.2` (Zenodo DOI `10.5281/zenodo.21921403`) packages remain preserved as immutable archives.

## Key additions in v0.4.1

- **Interval-aware unreliability gate (`ACTIVATION_ENERGY_CI_INCLUDES_NONPOSITIVE`):**
  Apparent activation-energy estimates whose two-sided 95% Student-t confidence interval reaches or crosses zero are classified as `CALCULATED_UNRELIABLE` even when pointwise `R^2` meets the configured threshold (at `df = 1`, excluding zero requires `R^2 > 0.99384`).
- **ICTAC-aligned cumulative integral variable-Ea warning (`INTEGRAL_METHOD_VARIABLE_EA_BIAS`):**
  Whenever relative profile variation across conversion reaches 10% or more (`POSSIBLE_MULTISTEP_EA_VARIATION` or `MULTISTEP_EA_VARIATION`), cumulative integral methods (FWO, KAS, and Starink, excluding differential Friedman) attach `INTEGRAL_METHOD_VARIABLE_EA_BIAS` recommending comparison against differential Friedman or small-interval incremental integration.
- **Independent variable-kinetics RK4 ODE and Kissinger benchmarks:**
  Added five fourth-order Runge–Kutta (RK4) ODE and statistical boundary-test scenarios (single-step constant control, moderate and strong parallel two-step reactions, consecutive two-step reactions, and three-rate zero-crossing CI override) alongside a distinct five-rate Kissinger Decimal(50) peak-temperature benchmark (`df = 3`).
- **Decision-summary consistency and cross-browser verification:**
  Ensured unreliable methods are never offered as reportable summary statements, improved wrapping of long diagnostic identifiers, and verified offline execution across Google Chrome 158, Mozilla Firefox 159, and Safari/WebKit on macOS with zero external network requests and zero console errors.

## Core foundations

- Centered, scale-conditioned ordinary least squares with exact Student-t confidence limits, nonuniform three-point Lagrange derivatives, monotone temperature and time validation, bounded OOXML (`read-excel-file` 9.3.10 + `fflate` 0.8.3) and delimited-text (`papaparse` 5.5.4) ingestion, `activation-energy-core/v3`, and `activation-energy-studio/project-report/v7`.
- Locked production dependency tree (33 production packages, zero `npm audit --omit=dev` advisories).
