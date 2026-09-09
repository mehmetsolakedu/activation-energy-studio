#!/usr/bin/env python3
"""Verify the frozen large-df Student-t expansion evidence.

This script is a validation tool. It is not part of the application runtime.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy.stats import t


PROJECT_ROOT = Path(__file__).resolve().parent.parent
RECORD_PATH = (
    PROJECT_ROOT
    / "tests"
    / "fixtures"
    / "hand"
    / "student_t_critical_95_large_df_oracle.json"
)
NORMAL_0975 = 1.959963984540054


def production_expansion(degrees_of_freedom: np.ndarray) -> np.ndarray:
    """Evaluate the three correction terms in NBS AMS 55 formula 26.7.5."""

    z = NORMAL_0975
    v = degrees_of_freedom.astype(np.float64)
    z2 = z * z
    z3 = z2 * z
    z5 = z3 * z2
    z7 = z5 * z2
    return (
        z
        + (z3 + z) / (4.0 * v)
        + (5.0 * z5 + 16.0 * z3 + 3.0 * z) / (96.0 * v * v)
        + (3.0 * z7 + 19.0 * z5 + 17.0 * z3 - 15.0 * z)
        / (384.0 * v * v * v)
    )


def main() -> None:
    record = json.loads(RECORD_PATH.read_text(encoding="utf-8"))
    scan = record["independentIntegerScan"]
    first = int(scan["firstDegreesOfFreedom"])
    last = int(scan["lastDegreesOfFreedom"])
    degrees = np.arange(first, last + 1, dtype=np.int64)
    reference = t.ppf(float(record["probability"]), degrees)
    approximate = production_expansion(degrees)
    absolute = np.abs(approximate - reference)
    relative = absolute / np.abs(reference)
    maximum_index = int(np.argmax(absolute))

    actual = {
        "evaluatedIntegerPoints": int(degrees.size),
        "maximumObservedAbsoluteDifference": float(absolute[maximum_index]),
        "maximumObservedRelativeDifference": float(relative[maximum_index]),
        "maximumDifferenceDegreesOfFreedom": int(degrees[maximum_index]),
    }
    expected = {
        key: scan[key]
        for key in actual
    }
    for key, value in actual.items():
        target = expected[key]
        if isinstance(value, float):
            if not np.isclose(value, target, rtol=0.0, atol=5e-15):
                raise SystemExit(f"FAIL STUDENT_T_LARGE_DF_ORACLE {key}={value} expected={target}")
        elif value != target:
            raise SystemExit(f"FAIL STUDENT_T_LARGE_DF_ORACLE {key}={value} expected={target}")
    if actual["maximumObservedAbsoluteDifference"] > record["acceptanceBoundary"]["maximumAbsoluteDifference"]:
        raise SystemExit("FAIL STUDENT_T_LARGE_DF_ORACLE acceptance_boundary")

    print(
        "PASS STUDENT_T_LARGE_DF_ORACLE "
        f"points={actual['evaluatedIntegerPoints']} "
        f"max_abs={actual['maximumObservedAbsoluteDifference']:.16g} "
        f"at_df={actual['maximumDifferenceDegreesOfFreedom']}"
    )


if __name__ == "__main__":
    main()
