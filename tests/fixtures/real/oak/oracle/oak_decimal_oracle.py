#!/usr/bin/env python3
"""Independent Chilean Oak activation-energy oracle.

The oracle imports only the Python standard library and never imports the
application. It validates the byte-locked Mendeley CSV files, projects the
unique upward alpha crossings at alpha=0.05..0.85, converts the source Celsius
column with the physical 273.15 offset, and evaluates FWO, KAS, and Friedman
with Decimal arithmetic at precision 50.

Publication values are emitted only as a diagnostic comparison. They are not
used to derive or accept the equation-correct expected results.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, getcontext
from pathlib import Path
from typing import Any, Mapping, Sequence


getcontext().prec = 50

SCHEMA = "activation-energy-studio/oak-real-validation-reference/v1"
SOURCE_DIRECTORY = Path("tests/fixtures/real/oak/source")
EXPECTED_OUTPUT = Path("tests/fixtures/real/oak/expected-output.json")
IMPLEMENTATION_PATH = Path(
    "tests/fixtures/real/oak/oracle/oak_decimal_oracle.py"
)

GAS_CONSTANT = Decimal("8.31446261815324")
FWO_COEFFICIENT = Decimal("1.052")
CELSIUS_OFFSET = Decimal("273.15")
AUTHOR_CELSIUS_OFFSET = Decimal("273")
ALPHA_TOLERANCE = Decimal("1e-10")
T_CRITICAL_95_DF2 = Decimal("4.30265273")

ALPHA_VALUES = tuple(
    Decimal("0.05") * index for index in range(1, 18)
)
METHODS = ("FWO", "KAS", "FRIEDMAN")
FORMULA_IDS = {
    "FWO": "fwo_doyle_ln_1.052_v1",
    "KAS": "kas_ln_beta_over_t2_v1",
    "FRIEDMAN": "friedman_ln_dalpha_dt_v1",
}

HEADERS = (
    "Temperature (°C)",
    "Temperature (K)",
    "1/T (K-1)",
    "Time (s)",
    "Time (min)",
    "Mass (mg)",
    "Conversion, α",
    "dα/dT (K-1)",
    "dα/dt (min-1)",
    "",
    "",
    "",
)

SOURCE_LOCKS = (
    {
        "rate": 5,
        "file": "TGA-Oak-5Kmin-1.csv",
        "bytes": 531531,
        "sha256": (
            "cdefb2f643e26562400d6313ed5bc2cfe02a500e36242651c42cdcccbd014608"
        ),
        "recordCount": 7202,
        "dataRowCount": 7200,
        "blankTailRowCount": 0,
        "partialTailRows": (),
        "downloadUrl": (
            "https://data.mendeley.com/public-files/datasets/gkhjh4v8tg/files/"
            "13989c91-eddd-4666-bfc2-a0caf6af0271/file_downloaded"
        ),
    },
    {
        "rate": 10,
        "file": "TGA-Oak-10Kmin-1.csv",
        "bytes": 309500,
        "sha256": (
            "ddf80f5e2252d77732207768be7c245a6e319349216d32eda7c208b6f6aed9a9"
        ),
        "recordCount": 7169,
        "dataRowCount": 3589,
        "blankTailRowCount": 3577,
        "partialTailRows": (
            {
                "sourceRow": 4802,
                "cells": ("0.001075402", "", "", "", "", "", "", "", "", "", "", ""),
            },
        ),
        "downloadUrl": (
            "https://data.mendeley.com/public-files/datasets/gkhjh4v8tg/files/"
            "4294db37-9db9-48f8-9563-11dd994ebde1/file_downloaded"
        ),
    },
    {
        "rate": 20,
        "file": "TGA-Oak-20Kmin-1.csv",
        "bytes": 137848,
        "sha256": (
            "37f8e355b086479c62e74181d0b2ade298c7bdd63bdb10238dcf566ed0ef8fa1"
        ),
        "recordCount": 1802,
        "dataRowCount": 1800,
        "blankTailRowCount": 0,
        "partialTailRows": (),
        "downloadUrl": (
            "https://data.mendeley.com/public-files/datasets/gkhjh4v8tg/files/"
            "aaad46fe-1c36-4cbf-a113-2cc6ef2c5746/file_downloaded"
        ),
    },
    {
        "rate": 40,
        "file": "TGA-Oak-40Kmin-1.csv",
        "bytes": 154524,
        "sha256": (
            "967ccc4aac128a5a980fd1eea9154220e846cba4b7e853f3046c08fbc22d10a8"
        ),
        "recordCount": 7189,
        "dataRowCount": 996,
        "blankTailRowCount": 6191,
        "partialTailRows": (),
        "downloadUrl": (
            "https://data.mendeley.com/public-files/datasets/gkhjh4v8tg/files/"
            "a22c48fc-3f26-4b4f-94d5-88140916a0f9/file_downloaded"
        ),
    },
)

PUBLISHED = {
    "FWO": {
        "meanKJPerMol": Decimal("176.9"),
        "spreadKJPerMol": Decimal("7"),
        "averageAdjustedRSquared": Decimal("0.9992"),
    },
    "KAS": {
        "meanKJPerMol": Decimal("167.3"),
        "spreadKJPerMol": Decimal("7"),
        "averageAdjustedRSquared": Decimal("0.9991"),
    },
    "FRIEDMAN": {
        "meanKJPerMol": Decimal("168.2"),
        "spreadKJPerMol": Decimal("9"),
        "averageAdjustedRSquared": Decimal("0.9982"),
    },
}


class OracleError(RuntimeError):
    """Fail-closed source or arithmetic error."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class SourcePoint:
    source_row: int
    temperature_c: Decimal
    temperature_k_author: Decimal
    inverse_temperature_stored: Decimal
    time_seconds: Decimal
    time_minutes_author: Decimal
    mass_mg: Decimal
    alpha: Decimal
    d_alpha_d_temperature: Decimal
    d_alpha_dt_per_minute: Decimal


@dataclass(frozen=True)
class ProjectedPoint:
    alpha: Decimal
    heating_rate: Decimal
    temperature_c: Decimal
    temperature_k: Decimal
    temperature_k_author: Decimal
    d_alpha_dt_per_minute: Decimal
    left_source_row: int
    right_source_row: int
    fraction: Decimal


def fail(code: str, message: str) -> None:
    raise OracleError(code, message)


def decimal_string(value: Decimal) -> str:
    if not value.is_finite():
        fail("ORACLE_NONFINITE_DECIMAL", f"Cannot serialize {value}.")
    if value.is_zero():
        return "0"
    return format(value.normalize(), "f")


def serialize(value: Any) -> Any:
    if isinstance(value, Decimal):
        return decimal_string(value)
    if isinstance(value, dict):
        return {key: serialize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [serialize(item) for item in value]
    return value


def canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
    return (
        json.dumps(
            serialize(value),
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
            separators=(",", ": "),
        )
        + "\n"
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def parse_decimal(raw: str, file_name: str, source_row: int, column: int) -> Decimal:
    try:
        value = Decimal(raw)
    except InvalidOperation as error:
        raise OracleError(
            "ORACLE_SOURCE_NUMBER_INVALID",
            f"{file_name} row {source_row} column {column + 1} is not numeric.",
        ) from error
    if not value.is_finite():
        fail(
            "ORACLE_SOURCE_NUMBER_INVALID",
            f"{file_name} row {source_row} column {column + 1} is non-finite.",
        )
    return value


def read_source(
    project_root: Path,
    lock: Mapping[str, Any],
) -> tuple[list[SourcePoint], dict[str, Any]]:
    path = project_root / SOURCE_DIRECTORY / str(lock["file"])
    try:
        raw_bytes = path.read_bytes()
    except FileNotFoundError as error:
        raise OracleError(
            "ORACLE_SOURCE_MISSING",
            f"Required Oak source is missing: {path}",
        ) from error

    if len(raw_bytes) != lock["bytes"]:
        fail(
            "ORACLE_SOURCE_SIZE_MISMATCH",
            f"{lock['file']} byte count changed.",
        )
    actual_hash = sha256_bytes(raw_bytes)
    if actual_hash != lock["sha256"]:
        fail(
            "ORACLE_SOURCE_HASH_MISMATCH",
            f"{lock['file']} SHA-256 changed.",
        )
    if not raw_bytes.startswith(b"\xef\xbb\xbf"):
        fail("ORACLE_SOURCE_ENCODING_MISMATCH", f"{lock['file']} lost its UTF-8 BOM.")
    if not raw_bytes.endswith(b"\r\n"):
        fail("ORACLE_SOURCE_LINE_ENDING_MISMATCH", f"{lock['file']} must end in CRLF.")
    if raw_bytes.count(b"\r\n") != lock["recordCount"]:
        fail(
            "ORACLE_SOURCE_LINE_ENDING_MISMATCH",
            f"{lock['file']} CRLF record count changed.",
        )
    if raw_bytes.replace(b"\r\n", b"").find(b"\n") >= 0:
        fail(
            "ORACLE_SOURCE_LINE_ENDING_MISMATCH",
            f"{lock['file']} contains a bare LF.",
        )

    decoded = raw_bytes.decode("utf-8-sig")
    records = list(csv.reader(decoded.splitlines(), delimiter=";"))
    if len(records) != lock["recordCount"]:
        fail(
            "ORACLE_SOURCE_LAYOUT_MISMATCH",
            f"{lock['file']} record count changed.",
        )
    if any(len(record) != 12 for record in records):
        fail(
            "ORACLE_SOURCE_LAYOUT_MISMATCH",
            f"{lock['file']} no longer has exactly 12 semicolon fields per record.",
        )

    expected_preamble = (
        "Heat rate",
        "",
        "",
        str(lock["rate"]),
        "K·min-1",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
    )
    if tuple(records[0]) != expected_preamble:
        fail(
            "ORACLE_SOURCE_PREAMBLE_MISMATCH",
            f"{lock['file']} heat-rate preamble changed.",
        )
    if tuple(records[1]) != HEADERS:
        fail(
            "ORACLE_SOURCE_HEADER_MISMATCH",
            f"{lock['file']} headers changed.",
        )

    indexed_data_records = list(enumerate(records[2:], start=3))
    complete = [
        (source_row, record)
        for source_row, record in indexed_data_records
        if all(record[column] != "" for column in range(9))
    ]
    blank = [
        (source_row, record)
        for source_row, record in indexed_data_records
        if not any(cell.strip() for cell in record)
    ]
    partial = [
        (source_row, record)
        for source_row, record in indexed_data_records
        if any(cell.strip() for cell in record)
        and not all(record[column] != "" for column in range(9))
    ]
    if len(complete) != lock["dataRowCount"] or len(blank) != lock["blankTailRowCount"]:
        fail(
            "ORACLE_SOURCE_LAYOUT_MISMATCH",
            f"{lock['file']} complete/blank row counts changed.",
        )
    expected_partial = [
        (int(item["sourceRow"]), list(item["cells"]))
        for item in lock["partialTailRows"]
    ]
    if partial != expected_partial:
        fail(
            "ORACLE_SOURCE_LAYOUT_MISMATCH",
            f"{lock['file']} partial trailing rows changed.",
        )
    if complete and any(source_row > complete[-1][0] for source_row, _ in complete[:-1]):
        fail(
            "ORACLE_SOURCE_LAYOUT_MISMATCH",
            f"{lock['file']} complete row ordering is invalid.",
        )
    if complete and [source_row for source_row, _ in complete] != list(
        range(3, 3 + len(complete))
    ):
        fail(
            "ORACLE_SOURCE_LAYOUT_MISMATCH",
            f"{lock['file']} complete scientific rows are no longer contiguous.",
        )
    if complete and any(source_row <= complete[-1][0] for source_row, _ in blank + partial):
        fail(
            "ORACLE_SOURCE_LAYOUT_MISMATCH",
            f"{lock['file']} contains a blank or partial row inside scientific data.",
        )

    points: list[SourcePoint] = []
    for index, record in complete:
        if any(record[column] != "" for column in range(9, 12)):
            fail(
                "ORACLE_SOURCE_LAYOUT_MISMATCH",
                f"{lock['file']} row {index} unexpectedly populates a spare column.",
            )
        values = [
            parse_decimal(record[column], str(lock["file"]), index, column)
            for column in range(9)
        ]
        points.append(
            SourcePoint(
                source_row=index,
                temperature_c=values[0],
                temperature_k_author=values[1],
                inverse_temperature_stored=values[2],
                time_seconds=values[3],
                time_minutes_author=values[4],
                mass_mg=values[5],
                alpha=values[6],
                d_alpha_d_temperature=values[7],
                d_alpha_dt_per_minute=values[8],
            )
        )

    for left, right in zip(points, points[1:]):
        if not right.temperature_c > left.temperature_c:
            fail(
                "ORACLE_SOURCE_TEMPERATURE_ORDER",
                f"{lock['file']} temperature is not strictly increasing.",
            )
        if not right.time_seconds > left.time_seconds:
            fail(
                "ORACLE_SOURCE_TIME_ORDER",
                f"{lock['file']} time in seconds is not strictly increasing.",
            )

    alpha_decreases = [
        right.alpha - left.alpha
        for left, right in zip(points, points[1:])
        if right.alpha < left.alpha
    ]
    maximum_k_offset_error = max(
        abs(point.temperature_k_author - point.temperature_c - CELSIUS_OFFSET)
        for point in points
    )
    maximum_inverse_error = max(
        abs(
            point.inverse_temperature_stored
            - Decimal(1000) / point.temperature_k_author
        )
        for point in points
    )
    rate = Decimal(str(lock["rate"]))
    maximum_derivative_error = max(
        abs(point.d_alpha_dt_per_minute - rate * point.d_alpha_d_temperature)
        for point in points
    )

    branch = [
        point for point in points
        if Decimal("0.05") <= point.alpha <= Decimal("0.85")
    ]
    segment_relative_deviations = [
        abs(
            (
                (right.temperature_c - left.temperature_c)
                / ((right.time_seconds - left.time_seconds) / Decimal(60))
            )
            - rate
        )
        / rate
        for left, right in zip(branch, branch[1:])
    ]
    endpoint_rate = (
        (branch[-1].temperature_c - branch[0].temperature_c)
        / ((branch[-1].time_seconds - branch[0].time_seconds) / Decimal(60))
    )

    audit = {
        "file": lock["file"],
        "heatingRateKPerMin": rate,
        "bytes": lock["bytes"],
        "sha256": lock["sha256"],
        "downloadUrl": lock["downloadUrl"],
        "recordCount": len(records),
        "dataRowCount": len(points),
        "blankTailRowCount": len(blank),
        "partialTailRows": [
            {
                "sourceRow": source_row,
                "cells": record,
                "classification": "human_export_tail_artifact",
            }
            for source_row, record in partial
        ],
        "firstSourceRow": points[0].source_row,
        "lastSourceRow": points[-1].source_row,
        "firstAlpha": points[0].alpha,
        "lastAlpha": points[-1].alpha,
        "alphaDecreaseCount": len(alpha_decreases),
        "largestAlphaDecrease": min(alpha_decreases) if alpha_decreases else Decimal(0),
        "authorKelvinOffsetC": points[0].temperature_k_author - points[0].temperature_c,
        "maximumAuthorKelvinErrorVersus273_15K": maximum_k_offset_error,
        "inverseTemperatureSemantic": "1000/T_author_K",
        "sourceInverseTemperatureHeader": "1/T (K-1)",
        "maximumAbsStoredInverseTemperatureError": maximum_inverse_error,
        "maximumAbsDerivativeIdentityErrorPerMinute": maximum_derivative_error,
        "branchEndpointHeatingRateKPerMin": endpoint_rate,
        "branchMaximumSegmentHeatingRateRelativeError": max(
            segment_relative_deviations
        ),
    }
    return points, audit


def crossing(
    points: Sequence[SourcePoint],
    target: Decimal,
    heating_rate: Decimal,
) -> ProjectedPoint:
    exact = [
        point for point in points
        if abs(point.alpha - target) <= ALPHA_TOLERANCE
    ]
    upward: list[tuple[SourcePoint, SourcePoint]] = []
    downward: list[tuple[SourcePoint, SourcePoint]] = []
    for left, right in zip(points, points[1:]):
        if left.alpha < target < right.alpha:
            upward.append((left, right))
        elif left.alpha > target > right.alpha:
            downward.append((left, right))

    if exact:
        if len(exact) != 1:
            fail(
                "ORACLE_ALPHA_CROSSING_AMBIGUOUS",
                f"alpha={target} has {len(exact)} exact source matches.",
            )
        exact_point = exact[0]
        if upward or downward:
            fail(
                "ORACLE_ALPHA_CROSSING_AMBIGUOUS",
                f"alpha={target} has an exact match plus another crossing.",
            )
        return ProjectedPoint(
            alpha=target,
            heating_rate=heating_rate,
            temperature_c=exact_point.temperature_c,
            temperature_k=exact_point.temperature_c + CELSIUS_OFFSET,
            temperature_k_author=exact_point.temperature_k_author,
            d_alpha_dt_per_minute=exact_point.d_alpha_dt_per_minute,
            left_source_row=exact_point.source_row,
            right_source_row=exact_point.source_row,
            fraction=Decimal(0),
        )

    if len(upward) != 1 or downward:
        fail(
            "ORACLE_ALPHA_CROSSING_AMBIGUOUS",
            (
                f"alpha={target} has {len(upward)} upward and "
                f"{len(downward)} downward crossings."
            ),
        )
    left, right = upward[0]
    fraction = (target - left.alpha) / (right.alpha - left.alpha)

    def interpolate(left_value: Decimal, right_value: Decimal) -> Decimal:
        return left_value + fraction * (right_value - left_value)

    temperature_c = interpolate(left.temperature_c, right.temperature_c)
    return ProjectedPoint(
        alpha=target,
        heating_rate=heating_rate,
        temperature_c=temperature_c,
        temperature_k=temperature_c + CELSIUS_OFFSET,
        temperature_k_author=interpolate(
            left.temperature_k_author,
            right.temperature_k_author,
        ),
        d_alpha_dt_per_minute=interpolate(
            left.d_alpha_dt_per_minute,
            right.d_alpha_dt_per_minute,
        ),
        left_source_row=left.source_row,
        right_source_row=right.source_row,
        fraction=fraction,
    )


def ols(x: Sequence[Decimal], y: Sequence[Decimal]) -> dict[str, Any]:
    if len(x) != len(y) or len(x) != 4:
        fail("ORACLE_REGRESSION_INPUT_INVALID", "Oak OLS requires four rates.")
    n = Decimal(len(x))
    mean_x = sum(x, Decimal(0)) / n
    mean_y = sum(y, Decimal(0)) / n
    sxx = sum((value - mean_x) ** 2 for value in x)
    sxy = sum(
        (x_value - mean_x) * (y_value - mean_y)
        for x_value, y_value in zip(x, y)
    )
    syy = sum((value - mean_y) ** 2 for value in y)
    if sxx <= 0 or syy <= 0:
        fail("ORACLE_REGRESSION_INPUT_INVALID", "Oak OLS lacks variation.")
    slope = sxy / sxx
    intercept = mean_y - slope * mean_x
    fitted = tuple(intercept + slope * value for value in x)
    residuals = tuple(
        value - fitted_value for value, fitted_value in zip(y, fitted)
    )
    sse = sum(value**2 for value in residuals)
    r_squared = Decimal(1) - sse / syy
    residual_standard_error = (sse / Decimal(2)).sqrt()
    slope_standard_error = residual_standard_error / sxx.sqrt()
    margin = T_CRITICAL_95_DF2 * slope_standard_error
    return {
        "n": 4,
        "rawObservationCount": 4,
        "residualDegreesOfFreedom": 2,
        "inputAggregation": "none",
        "x": x,
        "y": y,
        "slope": slope,
        "intercept": intercept,
        "fitted": fitted,
        "residuals": residuals,
        "sse": sse,
        "rSquared": r_squared,
        "adjustedRSquared": (
            Decimal(1)
            - (Decimal(1) - r_squared) * Decimal(3) / Decimal(2)
        ),
        "residualStandardError": residual_standard_error,
        "slopeStandardError": slope_standard_error,
        "slopeConfidence95": (slope - margin, slope + margin),
    }


def method_record(
    method: str,
    alpha: Decimal,
    points: Sequence[ProjectedPoint],
    *,
    use_author_kelvin: bool = False,
    divide_non_fwo_by_doyle: bool = False,
) -> dict[str, Any]:
    temperatures = tuple(
        point.temperature_k_author if use_author_kelvin else point.temperature_k
        for point in points
    )
    x = tuple(Decimal(1) / value for value in temperatures)
    if method == "FWO":
        y = tuple(point.heating_rate.ln() for point in points)
        coefficient = FWO_COEFFICIENT
    elif method == "KAS":
        y = tuple(
            (point.heating_rate / temperature**2).ln()
            for point, temperature in zip(points, temperatures)
        )
        coefficient = (
            FWO_COEFFICIENT if divide_non_fwo_by_doyle else Decimal(1)
        )
    elif method == "FRIEDMAN":
        y = tuple(point.d_alpha_dt_per_minute.ln() for point in points)
        coefficient = (
            FWO_COEFFICIENT if divide_non_fwo_by_doyle else Decimal(1)
        )
    else:
        fail("ORACLE_METHOD_UNKNOWN", f"Unknown method: {method}")
    regression = ols(x, y)
    energy = -regression["slope"] * GAS_CONSTANT / coefficient / Decimal(1000)
    energy_ci = tuple(
        -endpoint * GAS_CONSTANT / coefficient / Decimal(1000)
        for endpoint in reversed(regression["slopeConfidence95"])
    )
    return {
        "alpha": alpha,
        "activationEnergyKJPerMol": energy,
        "activationEnergyConfidence95KJPerMol": energy_ci,
        "regression": regression,
    }


def summarize(records: Sequence[Mapping[str, Any]]) -> dict[str, Decimal]:
    energies = [record["activationEnergyKJPerMol"] for record in records]
    count = Decimal(len(energies))
    mean = sum(energies, Decimal(0)) / count
    sample_sd = (
        sum((value - mean) ** 2 for value in energies)
        / Decimal(len(energies) - 1)
    ).sqrt()
    mean_r_squared = (
        sum(
            record["regression"]["rSquared"]
            for record in records
        )
        / count
    )
    mean_adjusted_r_squared = (
        sum(
            record["regression"]["adjustedRSquared"]
            for record in records
        )
        / count
    )
    return {
        "count": Decimal(len(energies)),
        "meanKJPerMol": mean,
        "sampleStandardDeviationKJPerMol": sample_sd,
        "minimumKJPerMol": min(energies),
        "maximumKJPerMol": max(energies),
        "meanRSquared": mean_r_squared,
        "meanAdjustedRSquared": mean_adjusted_r_squared,
    }


def calculate_methods(
    projections: Mapping[Decimal, Sequence[ProjectedPoint]],
    *,
    use_author_kelvin: bool = False,
    divide_non_fwo_by_doyle: bool = False,
) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for method in METHODS:
        records = [
            method_record(
                method,
                alpha,
                projections[alpha],
                use_author_kelvin=use_author_kelvin,
                divide_non_fwo_by_doyle=divide_non_fwo_by_doyle,
            )
            for alpha in ALPHA_VALUES
        ]
        output[method] = {
            "formulaId": FORMULA_IDS[method],
            "records": records,
            "summary": summarize(records),
        }
    return output


def observation_record(point: ProjectedPoint) -> dict[str, Any]:
    return {
        "heatingRateKPerMin": point.heating_rate,
        "runId": f"oak-{decimal_string(point.heating_rate)}",
        "sourceRows": [point.left_source_row]
        if point.left_source_row == point.right_source_row
        else [point.left_source_row, point.right_source_row],
        "interpolationFraction": point.fraction,
        "temperatureC": point.temperature_c,
        "temperatureK": point.temperature_k,
        "temperatureKAuthor": point.temperature_k_author,
        "dAlphaDtPerMinute": point.d_alpha_dt_per_minute,
    }


def build_reference(project_root: Path) -> dict[str, Any]:
    source_points: dict[int, list[SourcePoint]] = {}
    source_audits: list[dict[str, Any]] = []
    for lock in SOURCE_LOCKS:
        points, audit = read_source(project_root, lock)
        source_points[int(lock["rate"])] = points
        source_audits.append(audit)

    projections: dict[Decimal, tuple[ProjectedPoint, ...]] = {}
    for alpha in ALPHA_VALUES:
        projections[alpha] = tuple(
            crossing(
                source_points[int(lock["rate"])],
                alpha,
                Decimal(str(lock["rate"])),
            )
            for lock in SOURCE_LOCKS
        )

    normative = calculate_methods(projections)
    author_standard = calculate_methods(
        projections,
        use_author_kelvin=True,
    )
    suspected_coefficient_path = calculate_methods(
        projections,
        use_author_kelvin=True,
        divide_non_fwo_by_doyle=True,
    )

    publication_diagnostics: dict[str, Any] = {}
    for method in METHODS:
        published = PUBLISHED[method]
        normative_summary = normative[method]["summary"]
        author_summary = author_standard[method]["summary"]
        suspected_summary = suspected_coefficient_path[method]["summary"]
        publication_diagnostics[method] = {
            "published": published,
            "equationCorrectCorrectedKelvin": normative_summary,
            "equationCorrectAuthorKelvin": author_summary,
            "authorKelvinWithFwoCoefficientAppliedToNonFwo": suspected_summary,
            "publishedMinusEquationCorrectCorrectedKelvinKJPerMol": (
                published["meanKJPerMol"]
                - normative_summary["meanKJPerMol"]
            ),
            "publishedMinusEquationCorrectAuthorKelvinKJPerMol": (
                published["meanKJPerMol"]
                - author_summary["meanKJPerMol"]
            ),
            "publishedMinusSuspectedCoefficientPathKJPerMol": (
                published["meanKJPerMol"]
                - suspected_summary["meanKJPerMol"]
            ),
        }

    return {
        "schema": SCHEMA,
        "fixtureId": "chilean-oak-mendeley-v2-alpha-005-085",
        "source": {
            "datasetTitle": (
                "Experimental data of a kinetic and thermodynamic study "
                "of Chilean Oak pyrolysis"
            ),
            "datasetDoi": "10.17632/gkhjh4v8tg.2",
            "datasetVersion": 2,
            "datasetLandingPage": "https://data.mendeley.com/datasets/gkhjh4v8tg/2",
            "datasetLicense": "CC BY 4.0",
            "articleDoi": "10.1016/j.indcrop.2025.121296",
            "sample": "Chilean Oak",
            "atmosphere": "N2",
            "heatingRatesKPerMin": [5, 10, 20, 40],
            "audits": source_audits,
        },
        "scientificPolicy": {
            "alphaGrid": "0.05 through 0.85 in 0.05 increments",
            "alphaGridSource": (
                "Prospectively locked 17-point validation grid inside the "
                "article's 0.01-0.85 whole-biomass range; it is not asserted "
                "to be the authors' undisclosed averaging grid."
            ),
            "crossingRule": (
                "exactly one upward crossing, zero downward crossings, "
                "piecewise-linear interpolation; no smoothing or extrapolation"
            ),
            "temperaturePolicy": (
                "Use source Celsius and add 273.15. The supplied Kelvin "
                "column uses +273.00 and is retained only for publication diagnostics."
            ),
            "derivativePolicy": (
                "Piecewise-linear interpolation of supplied dα/dt (min^-1)."
            ),
            "gasConstantJPerMolK": GAS_CONSTANT,
            "publicationValuesAreOracle": False,
        },
        "alphaValues": ALPHA_VALUES,
        "observationsByAlpha": [
            {
                "alpha": alpha,
                "rates": [
                    observation_record(point)
                    for point in projections[alpha]
                ],
            }
            for alpha in ALPHA_VALUES
        ],
        "methods": normative,
        "publicationComparison": {
            "articleTable": "Table 3",
            "diagnostics": publication_diagnostics,
            "candidateExplanation": (
                "FWO is reproduced by the author Kelvin column. KAS is "
                "reproduced to the reported tenth when the FWO-only 1.052 "
                "Doyle coefficient is also applied to KAS. This is a "
                "diagnostic hypothesis, not an accepted KAS implementation."
            ),
            "classification": "PUBLICATION_METHOD_APPLICATION_DISCREPANCY_CANDIDATE",
        },
        "oracle": {
            "arithmetic": "Decimal",
            "decimalPrecision": getcontext().prec,
            "dependencies": "python-standard-library-only",
            "importsApplicationSource": False,
            "implementationPath": IMPLEMENTATION_PATH.as_posix(),
        },
        "comparisonTolerances": {
            "alphaAbs": Decimal("5e-13"),
            "temperatureAbsK": Decimal("5e-10"),
            "derivativeAbsPerMinute": Decimal("5e-10"),
            "transformedXYAbs": Decimal("5e-10"),
            "slopeAbsK": Decimal("2e-3"),
            "interceptAbs": Decimal("2e-6"),
            "rSquaredAbs": Decimal("2e-11"),
            "energyAbsKJPerMol": Decimal("2e-5"),
            "energyCiEndpointAbsKJPerMol": Decimal("2e-5"),
            "meanEnergyAbsKJPerMol": Decimal("2e-5"),
            "justification": (
                "Prospective Decimal-versus-binary64 bounds, selected before "
                "application comparison and wider than source rounding propagation."
            ),
        },
    }


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--project-root",
        default=str(Path(__file__).resolve().parents[5]),
    )
    parser.add_argument("--emit-json")
    parser.add_argument("--check", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    project_root = Path(args.project_root).resolve()
    reference = build_reference(project_root)
    output = canonical_json_bytes(reference)

    if args.emit_json:
        output_path = Path(args.emit_json)
        if not output_path.is_absolute():
            output_path = project_root / output_path
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(output)

    if args.check:
        expected_path = project_root / EXPECTED_OUTPUT
        try:
            expected = expected_path.read_bytes()
        except FileNotFoundError as error:
            raise OracleError(
                "ORACLE_EXPECTED_OUTPUT_MISSING",
                f"Expected output is missing: {expected_path}",
            ) from error
        if output != expected:
            fail(
                "ORACLE_EXPECTED_OUTPUT_MISMATCH",
                (
                    "Recomputed Oak expected output differs from the locked JSON: "
                    f"computed={sha256_bytes(output)}, expected={sha256_bytes(expected)}"
                ),
            )

    if not args.emit_json:
        sys.stdout.buffer.write(output)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OracleError as error:
        print(
            json.dumps(
                {"status": "error", "code": error.code, "message": error.message},
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        raise SystemExit(2)
