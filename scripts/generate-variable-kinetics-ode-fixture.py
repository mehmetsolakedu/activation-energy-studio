#!/usr/bin/env python3
"""Independent RK4 ODE and 50-digit Decimal fixtures for Activation Energy Studio v0.4.1.

This script uses only the Python standard library and never imports the application.
It generates:
1. Independent 50-digit Decimal Kissinger benchmark with distinct (beta, Tp) coordinates
   not shared with KAS.
2. Independent RK4 ODE non-isothermal kinetic trajectories for:
   - Scenario A: single-step constant kinetics (negative control, Ea = 120 kJ/mol)
   - Scenario B: two parallel first-order reactions with moderate Ea(alpha) variation (10-20%)
   - Scenario C: two parallel first-order reactions with strong Ea(alpha) variation (>20%)
   - Scenario D: two consecutive first-order reactions (A -> B -> C) with strong variation (>20%)
   (demonstrates cumulative integral bias when apparent activation energy varies across conversion).
"""

from __future__ import annotations

import json
import math
from decimal import Decimal, getcontext
from pathlib import Path

getcontext().prec = 50

R = 8.31446261815324
R_DEC = Decimal("8.31446261815324")
ALPHAS = [round(0.05 * i, 2) for i in range(1, 18)]  # 0.05..0.85
BETAS = [5.0, 10.0, 20.0, 40.0]


def arrhenius(A: float, E_kj: float, T: float) -> float:
    return A * math.exp(-(E_kj * 1000.0) / (R * T))


def rk4_single_step(beta: float, A: float, E_kj: float, T0: float = 300.0, Tmax: float = 1100.0, dT: float = 0.05):
    """Integrate d(alpha)/dT = (A/beta) * exp(-E/(RT)) * (1 - alpha)."""
    T = T0
    a = 0.0
    targets = list(ALPHAS)
    t_idx = 0
    out = {}

    def f(temp: float, alpha: float) -> float:
        return (arrhenius(A, E_kj, temp) / beta) * max(0.0, 1.0 - alpha)

    while T < Tmax and t_idx < len(targets):
        k1 = f(T, a)
        k2 = f(T + 0.5 * dT, a + 0.5 * dT * k1)
        k3 = f(T + 0.5 * dT, a + 0.5 * dT * k2)
        k4 = f(T + dT, a + dT * k3)
        a_next = min(1.0, a + (dT / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4))
        T_next = T + dT

        while t_idx < len(targets) and a <= targets[t_idx] <= a_next:
            frac = (targets[t_idx] - a) / (a_next - a) if a_next > a else 0.0
            T_star = T + frac * dT
            dadt = arrhenius(A, E_kj, T_star) * (1.0 - targets[t_idx])
            out[targets[t_idx]] = (T_star, dadt)
            t_idx += 1

        T, a = T_next, a_next

    if len(out) != len(targets):
        raise RuntimeError(f"Single-step integration incomplete for beta={beta}: got {len(out)}")
    return out


def rk4_parallel_two_step(
    beta: float,
    w1: float,
    A1: float,
    E1_kj: float,
    A2: float,
    E2_kj: float,
    T0: float = 300.0,
    Tmax: float = 1200.0,
    dT: float = 0.05,
):
    """Integrate two independent parallel first-order reactions: alpha = w1*a1 + (1-w1)*a2."""
    w2 = 1.0 - w1
    T = T0
    a1, a2 = 0.0, 0.0
    targets = list(ALPHAS)
    t_idx = 0
    out = {}

    def derivs(temp: float, y1: float, y2: float):
        dy1 = (arrhenius(A1, E1_kj, temp) / beta) * max(0.0, 1.0 - y1)
        dy2 = (arrhenius(A2, E2_kj, temp) / beta) * max(0.0, 1.0 - y2)
        return dy1, dy2

    while T < Tmax and t_idx < len(targets):
        a_cur = w1 * a1 + w2 * a2
        k1_1, k1_2 = derivs(T, a1, a2)
        k2_1, k2_2 = derivs(T + 0.5 * dT, a1 + 0.5 * dT * k1_1, a2 + 0.5 * dT * k1_2)
        k3_1, k3_2 = derivs(T + 0.5 * dT, a1 + 0.5 * dT * k2_1, a2 + 0.5 * dT * k2_2)
        k4_1, k4_2 = derivs(T + dT, a1 + dT * k3_1, a2 + dT * k3_2)
        a1_n = min(1.0, a1 + (dT / 6.0) * (k1_1 + 2.0 * k2_1 + 2.0 * k3_1 + k4_1))
        a2_n = min(1.0, a2 + (dT / 6.0) * (k1_2 + 2.0 * k2_2 + 2.0 * k3_2 + k4_2))
        T_n = T + dT
        a_next = w1 * a1_n + w2 * a2_n

        while t_idx < len(targets) and a_cur <= targets[t_idx] <= a_next:
            frac = (targets[t_idx] - a_cur) / (a_next - a_cur) if a_next > a_cur else 0.0
            T_star = T + frac * dT
            a1_star = a1 + frac * (a1_n - a1)
            a2_star = a2 + frac * (a2_n - a2)
            r1 = arrhenius(A1, E1_kj, T_star) * max(0.0, 1.0 - a1_star)
            r2 = arrhenius(A2, E2_kj, T_star) * max(0.0, 1.0 - a2_star)
            dadt = w1 * r1 + w2 * r2
            out[targets[t_idx]] = (T_star, dadt)
            t_idx += 1

        T, a1, a2 = T_n, a1_n, a2_n

    if len(out) != len(targets):
        raise RuntimeError(f"Parallel integration incomplete for beta={beta}: got {len(out)}")
    return out


def rk4_consecutive_two_step(
    beta: float,
    w1: float,
    A1: float,
    E1_kj: float,
    A2: float,
    E2_kj: float,
    T0: float = 300.0,
    Tmax: float = 1200.0,
    dT: float = 0.05,
):
    """Integrate two consecutive first-order reactions A -> B -> C; alpha = w1*(1-xA) + (1-w1)*xC."""
    w2 = 1.0 - w1
    T = T0
    xA, xB, xC = 1.0, 0.0, 0.0
    targets = list(ALPHAS)
    t_idx = 0
    out = {}

    def derivs(temp: float, a: float, b: float):
        r1 = (arrhenius(A1, E1_kj, temp) / beta) * max(0.0, a)
        r2 = (arrhenius(A2, E2_kj, temp) / beta) * max(0.0, b)
        return -r1, r1 - r2, r2

    while T < Tmax and t_idx < len(targets):
        a_cur = w1 * (1.0 - xA) + w2 * xC
        k1 = derivs(T, xA, xB)
        k2 = derivs(T + 0.5 * dT, xA + 0.5 * dT * k1[0], xB + 0.5 * dT * k1[1])
        k3 = derivs(T + 0.5 * dT, xA + 0.5 * dT * k2[0], xB + 0.5 * dT * k2[1])
        k4 = derivs(T + dT, xA + dT * k3[0], xB + dT * k3[1])
        xA_n = max(0.0, xA + (dT / 6.0) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]))
        xB_n = max(0.0, xB + (dT / 6.0) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]))
        xC_n = min(1.0, xC + (dT / 6.0) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]))
        T_n = T + dT
        a_next = w1 * (1.0 - xA_n) + w2 * xC_n

        while t_idx < len(targets) and a_cur <= targets[t_idx] <= a_next:
            frac = (targets[t_idx] - a_cur) / (a_next - a_cur) if a_next > a_cur else 0.0
            T_star = T + frac * dT
            xA_s = xA + frac * (xA_n - xA)
            xB_s = xB + frac * (xB_n - xB)
            r1 = arrhenius(A1, E1_kj, T_star) * max(0.0, xA_s)
            r2 = arrhenius(A2, E2_kj, T_star) * max(0.0, xB_s)
            dadt = w1 * r1 + w2 * r2
            out[targets[t_idx]] = (T_star, dadt)
            t_idx += 1

        T, xA, xB, xC = T_n, xA_n, xB_n, xC_n

    if len(out) != len(targets):
        raise RuntimeError(f"Consecutive integration incomplete for beta={beta}: got {len(out)}")
    return out


def decimal_kissinger_oracle():
    """Independent 50-digit Decimal Kissinger benchmark with distinct 5-rate (beta, Tp) data."""
    betas = [Decimal("2"), Decimal("5"), Decimal("10"), Decimal("20"), Decimal("40")]
    tps = [
        Decimal("582.40"),
        Decimal("601.85"),
        Decimal("617.30"),
        Decimal("633.65"),
        Decimal("650.90"),
    ]
    xs = [Decimal(1) / tp for tp in tps]
    ys = [(b / (tp * tp)).ln() for b, tp in zip(betas, tps)]
    n = Decimal(len(xs))
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    syy = sum((y - my) ** 2 for y in ys)
    slope = sxy / sxx
    intercept = my - slope * mx
    sse = sum((y - (intercept + slope * x)) ** 2 for x, y in zip(xs, ys))
    r2 = Decimal(1) - sse / syy
    ea = -slope * R_DEC / Decimal(1000)
    se_slope = (sse / (n - Decimal(2)) / sxx).sqrt()
    t_crit_df3 = Decimal("3.182446305")
    margin = t_crit_df3 * se_slope
    slope_ci = [slope - margin, slope + margin]
    ea_ci = sorted([(-b) * R_DEC / Decimal(1000) for b in slope_ci])
    return {
        "description": "Independent 5-rate Kissinger peak benchmark with coordinates distinct from KAS",
        "heatingRatesKPerMinute": [str(b) for b in betas],
        "peakTemperaturesK": [str(t) for t in tps],
        "n": len(betas),
        "residualDegreesOfFreedom": len(betas) - 2,
        "slope": format(slope, ".15f"),
        "intercept": format(intercept, ".15f"),
        "r2": format(r2, ".15f"),
        "slopeStandardError": format(se_slope, ".15f"),
        "activationEnergyKJPerMol": format(ea, ".15f"),
        "confidence95KJPerMol": [format(v, ".15f") for v in ea_ci],
    }


def build_scenario(name: str, description: str, per_beta: dict):
    runs = []
    for beta in BETAS:
        pts = []
        for alpha in ALPHAS:
            T_star, dadt = per_beta[beta][alpha]
            pts.append(
                {
                    "alpha": alpha,
                    "temperatureK": round(T_star, 12),
                    "dAlphaDtPerMinute": float(f"{dadt:.15e}"),
                }
            )
        runs.append(
            {
                "id": f"{name}-beta-{int(beta)}",
                "heatingRateKPerMinute": beta,
                "points": pts,
            }
        )
    return {
        "name": name,
        "description": description,
        "alphaGrid": ALPHAS,
        "heatingRatesKPerMinute": BETAS,
        "runs": runs,
    }


def quick_ea_summary(scenario):
    """Diagnostic printout of Friedman vs KAS/FWO/Starink variation ratios."""
    out = {}
    for method in ("FWO", "KAS", "STARINK", "FRIEDMAN"):
        eas = []
        for idx, alpha in enumerate(ALPHAS):
            xs, ys = [], []
            for run in scenario["runs"]:
                b = run["heatingRateKPerMinute"]
                T = run["points"][idx]["temperatureK"]
                r = run["points"][idx]["dAlphaDtPerMinute"]
                xs.append(1.0 / T)
                if method == "FWO":
                    ys.append(math.log(b))
                elif method == "KAS":
                    ys.append(math.log(b / (T ** 2)))
                elif method == "STARINK":
                    ys.append(math.log(b / (T ** 1.92)))
                else:
                    ys.append(math.log(r))
            mx = sum(xs) / len(xs)
            my = sum(ys) / len(ys)
            slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
            coef = 1.052 if method == "FWO" else 1.0008 if method == "STARINK" else 1.0
            eas.append(-slope * R / (coef * 1000.0))
        mean_e = sum(eas) / len(eas)
        rel_range = (max(eas) - min(eas)) / abs(mean_e)
        out[method] = {
            "min": round(min(eas), 3),
            "max": round(max(eas), 3),
            "mean": round(mean_e, 3),
            "relRange": round(rel_range, 5),
        }
    return out


def main():
    # Scenario A: Single-step constant kinetics (Ea = 120 kJ/mol, A = 1e10 min^-1)
    scen_a = build_scenario(
        "single-step-control",
        "Single-step first-order ODE control (Ea = 120 kJ/mol, A = 1e10 min^-1); expects REPORTABLE with no variation warning.",
        {b: rk4_single_step(b, 1e10, 120.0) for b in BETAS},
    )

    # Scenario B: Two parallel first-order reactions with moderate (10-20%) Ea variation
    scen_b = build_scenario(
        "parallel-moderate-variation",
        "Two parallel first-order reactions (w1=0.5, E1=108 kJ/mol, A1=5e9 min^-1; w2=0.5, E2=126 kJ/mol, A2=5e10 min^-1); expects POSSIBLE_MULTISTEP_EA_VARIATION (10-20%) on all four methods and INTEGRAL_METHOD_VARIABLE_EA_BIAS on integral methods only.",
        {b: rk4_parallel_two_step(b, 0.5, 5e9, 108.0, 5e10, 126.0) for b in BETAS},
    )

    # Scenario C: Two parallel first-order reactions with strong (>20%) Ea variation (Muravyev et al. 2019 style)
    scen_c = build_scenario(
        "parallel-strong-variation",
        "Two parallel first-order reactions (w1=0.5, E1=80 kJ/mol, A1=1e7 min^-1; w2=0.5, E2=160 kJ/mol, A2=1e13 min^-1); expects MULTISTEP_EA_VARIATION (>20%), INTEGRAL_METHOD_VARIABLE_EA_BIAS on integral methods, and meanEaRecommended=false.",
        {b: rk4_parallel_two_step(b, 0.5, 1e7, 80.0, 1e13, 160.0) for b in BETAS},
    )

    # Scenario D: Two consecutive first-order reactions A -> B -> C with strong (>20%) variation
    scen_d = build_scenario(
        "consecutive-strong-variation",
        "Two consecutive first-order reactions A->B->C (w1=0.5, E1=80 kJ/mol, A1=1e7 min^-1; w2=0.5, E2=160 kJ/mol, A2=1e13 min^-1); expects MULTISTEP_EA_VARIATION (>20%) and INTEGRAL_METHOD_VARIABLE_EA_BIAS on integral methods.",
        {b: rk4_consecutive_two_step(b, 0.5, 1e7, 80.0, 1e13, 160.0) for b in BETAS},
    )

    payload = {
        "schema": "activation-energy-studio/variable-kinetics-and-kissinger-validation/v1",
        "independentKissingerDecimal50": decimal_kissinger_oracle(),
        "scenarios": {
            "singleStepControl": scen_a,
            "parallelModerateVariation": scen_b,
            "parallelStrongVariation": scen_c,
            "consecutiveStrongVariation": scen_d,
        },
        "diagnosticSummary": {
            "singleStepControl": quick_ea_summary(scen_a),
            "parallelModerateVariation": quick_ea_summary(scen_b),
            "parallelStrongVariation": quick_ea_summary(scen_c),
            "consecutiveStrongVariation": quick_ea_summary(scen_d),
        },
    }

    out_path = Path(__file__).resolve().parents[1] / "tests/fixtures/audit-v041/variable-kinetics-and-kissinger-fixtures.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload["independentKissingerDecimal50"], indent=2))
    print(json.dumps(payload["diagnosticSummary"], indent=2))


if __name__ == "__main__":
    main()
