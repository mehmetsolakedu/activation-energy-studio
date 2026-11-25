# Independent Numerical Validation Report

**Audit date:** 2026-07-18  
**Fixture:** `tests/fixtures/hand/activation_energy_hand_worksheet.json`  
**Status:** **PASS — independent hand/Decimal worksheet agrees with the application for alpha normalization, four isoconversional methods, separate Kissinger, and n=3/4/5 regression confidence limits.**

## Independence and arithmetic

Expected values were calculated outside the TypeScript core with Python `Decimal` arithmetic at precision 50. The worksheet imports no application source. It fixes `R=8.31446261815324 J mol^-1 K^-1`, uses OLS with an intercept, residual degrees of freedom `n-2`, and the checked Student-t 95% critical values.

For the shared n=4 thermal fixture, `beta=[5,10,20,40] K/min` and `T=[600,625,650,675] K`. Friedman additionally uses supplied `dalpha/dt=[0.001,0.0025,0.006,0.014] min^-1`. Kissinger uses the same temperatures as explicitly identified peak temperatures and remains a separate peak result.

| Method | y transform | slope | Ea (kJ/mol) | slope SE | 95% Ea CI (kJ/mol) |
|---|---|---:|---:|---:|---:|
| FWO | `ln beta` | -11218.60956149 | 88.66607398 | 278.53496818 | 79.19423152–98.13791644 |
| KAS | `ln(beta/T^2)` | -9947.07522598 | 82.70458513 | 262.75914771 | 73.30457493–92.10459533 |
| Starink | `ln(beta/T^1.92)` | -9997.93659940 | 83.06102130 | 263.39017905 | 73.64596847–92.47607413 |
| Friedman | `ln(dalpha/dt)` | -14239.70051150 | 118.39545760 | 176.72049201 | 112.07341537–124.71749982 |
| Kissinger peak | `ln(beta/Tp^2)` | -9947.07522598 | 82.70458513 | 262.75914771 | 73.30457493–92.10459533 |

The machine-readable fixture also locks every x/y value, intercept, R2, slope CI and energy CI. A parameterized acceptance test compares all of them without deriving expected values from the core.

## Friedman derivative-equivalence manifest

The same fixture separately locks four Arrhenius-consistent runs for the supplied derivative, time finite-difference and `beta*dalpha/dT` pathways. It records every target temperature, expected derivative, time increment and temperature increment. All three points in each linear-alpha run—including both one-sided endpoints—must match the expected derivative within `2e-14` relative-to-unit scale, a declared finite-difference cancellation allowance. The noise-free linear-case Ea must match 140 kJ/mol within `8 * Number.EPSILON` relative error after logarithm and OLS propagation. No smoothing is applied.

## n=3/4/5 transformed confidence limits

The KAS worksheet independently evaluates the same transform with three, four and five rates. Expected 95% Ea intervals are respectively `54.63251343–104.32335926`, `73.30457493–92.10459533`, and `78.29046522–93.59852332 kJ/mol`. This directly checks both Student-t degrees of freedom and slope-to-energy endpoint reversal.

## Alpha hand worksheet

For `m0=10`, `m=[10,8.5,7]`, and `mf=7`, direct substitution into `(m0-m)/(m0-mf)` gives `[0,0.5,1]`. Scaling the same values to mass percent `[100,85,70]` gives the identical alpha vector. Both paths are compared to the independent fixture at `1e-12` scale.

## FWO logarithm-base reconciliation

The natural-log coefficient `1.052` corresponds exactly to the base-10 coefficient `1.052/ln(10)=0.456877794962...`. The commonly printed `0.4567` is rounded and differs by about `3.89e-4` relative, so it cannot reproduce the natural-log result at a `1e-8` relative tolerance. The application uses the natural-log form and tests that it is never mixed with a base-10 slope. The published rounded coefficient is checked separately within an explicit `5e-4` bound and is not used as an exact computational constant.

All reported confidence intervals are regression-only uncertainty. They do not include experimental repeatability, baseline, stage-selection, interpolation, temperature calibration, or model-form uncertainty.
