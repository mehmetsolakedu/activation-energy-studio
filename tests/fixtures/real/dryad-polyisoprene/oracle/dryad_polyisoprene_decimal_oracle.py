#!/usr/bin/env python3
"""Independent Dryad polyisoprene activation-energy oracle.

This is a python-standard-library-only implementation. It never imports the
application. It byte-locks the official Dryad archive and exact extracted
LPI-01 weight/DTG files, projects explicitly defined conversion crossings,
and evaluates FWO, KAS, and Friedman with Decimal arithmetic.

Publication values are diagnostic comparisons, not derivation inputs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, getcontext
from pathlib import Path
from typing import Any, Mapping, Sequence


getcontext().prec = 50

SCHEMA = "activation-energy-studio/dryad-polyisoprene-real-reference/v1"
FIXTURE_ID = "dryad-polyisoprene-lpi01-v2-alpha-020-080"
IMPLEMENTATION_PATH = Path(
    "tests/fixtures/real/dryad-polyisoprene/oracle/"
    "dryad_polyisoprene_decimal_oracle.py"
)
EXPECTED_OUTPUT = Path(
    "tests/fixtures/real/dryad-polyisoprene/expected-output.json"
)
SOURCE_DIRECTORY = Path(
    "tests/fixtures/real/dryad-polyisoprene/source"
)

GAS_CONSTANT = Decimal("8.3142")
FWO_COEFFICIENT = Decimal("1.052")
CELSIUS_OFFSET = Decimal("273.15")
MINIMUM_CROSSING_TEMPERATURE_C = Decimal("250")
ALPHA_VALUES = tuple(
    Decimal("0.2") + Decimal("0.1") * index for index in range(7)
)
HEATING_RATES = (2, 5, 10, 15)
METHODS = ("FWO", "KAS", "FRIEDMAN")

ARCHIVE_LOCK = {
    "file": "Data.zip",
    "bytes": 1947167,
    "sha256": "6f98106f149567647b58edd8667cc899438a1ac5642c24b9a294655115e3295c",
    "dryadFileId": 188033,
    "dryadVersionId": 42617,
    "entryCount": 70,
    "regularFileCount": 64,
}

SOURCE_LOCKS = (
    {
        "rate": 2,
        "weightFile": "33L_2'C Weight (%).txt",
        "weightArchivePath": "Data/LPI-01/33L_2'C Weight (%).txt",
        "weightBytes": 252172,
        "weightSha256": "abf2c56ccec7b7e3989ad0357edb5a897e527fda367925330f05ff7c1ad425af",
        "derivativeFile": "33L_2'C Derivative Weight (%).txt",
        "derivativeArchivePath": (
            "Data/LPI-01/33L_2'C Derivative Weight (%).txt"
        ),
        "derivativeBytes": 274577,
        "derivativeSha256": "2a8e3024dce9b4f37fdc5a32dd664d9b57ff3862b4e7eab21281e2eba9c25bac",
        "rowCount": 17100,
    },
    {
        "rate": 5,
        "weightFile": "33L_5'C Weight (%).txt",
        "weightArchivePath": "Data/LPI-01/33L_5'C Weight (%).txt",
        "weightBytes": 100246,
        "weightSha256": "7ce0576b2d33be7fb8ad8a25c242b83d42ba578324a51db4906f3ae09b7c583d",
        "derivativeFile": "33L_5'C Derivative Weight (%).txt",
        "derivativeArchivePath": (
            "Data/LPI-01/33L_5'C Derivative Weight (%).txt"
        ),
        "derivativeBytes": 106238,
        "derivativeSha256": "d858215e949e3d5dc09c53cf2243ab356eca447a2b6132da954da7add32acce5",
        "rowCount": 6840,
    },
    {
        "rate": 10,
        "weightFile": "33L_10'C Weight (%).txt",
        "weightArchivePath": "Data/LPI-01/33L_10'C Weight (%).txt",
        "weightBytes": 50044,
        "weightSha256": "f94cc7a6457b307e18eb2fbb6ca26147c8af982953385786dc90853127467eea",
        "derivativeFile": "33L_10'C Derivative Weight (%).txt",
        "derivativeArchivePath": (
            "Data/LPI-01/33L_10'C Derivative Weight (%).txt"
        ),
        "derivativeBytes": 51132,
        "derivativeSha256": "2bd08267207c857f50930273e3791c37e444afd3d3583d2d9f215cf2e351c3ae",
        "rowCount": 3420,
    },
    {
        "rate": 15,
        "weightFile": "33L_15'C Weight (%).txt",
        "weightArchivePath": "Data/LPI-01/33L_15'C Weight (%).txt",
        "weightBytes": 33407,
        "weightSha256": "eada2b303bf40f5b431f032657bdb71794f3984540df54e649a38a43db3a5c18",
        "derivativeFile": "33L_15'C Derivative Weight (%).txt",
        "derivativeArchivePath": (
            "Data/LPI-01/33L_15'C Derivative Weight (%).txt"
        ),
        "derivativeBytes": 34185,
        "derivativeSha256": "72555dfdfdd19de144cc66003ccf3ff9c05cb1132acf8b4eb6280c84deeb9ca7",
        "rowCount": 2280,
    },
)

SWAP_SOURCE_LOCKS = (
    {
        "sample": "HBPI-01",
        "weightArchivePath": "Data/HBPI-01/31B 15'C weight (%).txt",
        "weightSha256": "ac5ecf20ec1e49d997ae4b9d6751ec263f97ea3ca4172e6679915c65900c7863",
        "derivativeArchivePath": (
            "Data/HBPI-01/31B 15'C derivative weight (%).txt"
        ),
        "derivativeSha256": "c34448e7f75742ad1f0aa13b1f95f91d448706c134b7952e26b8b90d06782a0d",
        "paper": {
            "temperatureAt20PercentMassLossC": Decimal("388"),
            "temperatureAt50PercentMassLossC": Decimal("427"),
            "peakTemperatureC": Decimal("444"),
            "residueAt580CPercent": Decimal("1.3"),
        },
    },
    {
        "sample": "HBPI-03",
        "weightArchivePath": "Data/HBPI-03/30B 15'C weight (%).txt",
        "weightSha256": "e46e568728ae600afa0d21a9a8f90f7f94a29c302f1a6081e1b2e295306e16b1",
        "derivativeArchivePath": (
            "Data/HBPI-03/30B 15'C derivative weight (%).txt"
        ),
        "derivativeSha256": "a7e100136ad5f2226ef01f66ef0cc26a3f1975406f96f30207d88b8fa2d46814",
        "paper": {
            "temperatureAt20PercentMassLossC": Decimal("353"),
            "temperatureAt50PercentMassLossC": Decimal("417"),
            "peakTemperatureC": Decimal("446"),
            "residueAt580CPercent": Decimal("1.1"),
        },
    },
)

PUBLISHED_MEANS = {
    "FWO": Decimal("319"),
    "KAS": Decimal("324"),
    "FRIEDMAN": Decimal("330"),
}


class OracleError(RuntimeError):
    """Fail-closed source or arithmetic error."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Point:
    source_row: int
    temperature_c: Decimal
    value: Decimal


@dataclass(frozen=True)
class Projection:
    alpha: Decimal
    heating_rate: Decimal
    temperature_c: Decimal
    temperature_k: Decimal
    d_alpha_dt_per_minute: Decimal
    left_source_row: int
    right_source_row: int
    fraction: Decimal


def fail(code: str, message: str) -> None:
    raise OracleError(code, message)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


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


def parse_decimal(raw: str, source: str, row: int) -> Decimal:
    try:
        value = Decimal(raw)
    except InvalidOperation as error:
        raise OracleError(
            "ORACLE_SOURCE_NUMBER_INVALID",
            f"{source} row {row} contains a non-numeric value.",
        ) from error
    if not value.is_finite():
        fail(
            "ORACLE_SOURCE_NUMBER_INVALID",
            f"{source} row {row} contains a non-finite value.",
        )
    return value


def validate_raw_text(
    raw: bytes,
    source: str,
    expected_sha256: str,
    expected_bytes: int | None = None,
) -> None:
    if expected_bytes is not None and len(raw) != expected_bytes:
        fail("ORACLE_SOURCE_SIZE_MISMATCH", f"{source} byte count changed.")
    if sha256_bytes(raw) != expected_sha256:
        fail("ORACLE_SOURCE_HASH_MISMATCH", f"{source} SHA-256 changed.")
    if not raw.endswith(b"\r\n"):
        fail("ORACLE_SOURCE_LINE_ENDING_MISMATCH", f"{source} must end in CRLF.")
    if raw.replace(b"\r\n", b"").find(b"\n") >= 0:
        fail(
            "ORACLE_SOURCE_LINE_ENDING_MISMATCH",
            f"{source} contains a bare LF.",
        )


def parse_export(
    raw: bytes,
    source: str,
    expected_rows: int | None = None,
) -> tuple[list[Point], dict[str, Any]]:
    try:
        decoded = raw.decode("latin-1")
    except UnicodeDecodeError as error:
        raise OracleError(
            "ORACLE_SOURCE_ENCODING_MISMATCH",
            f"{source} is not Latin-1.",
        ) from error
    records = decoded.splitlines()
    if len(records) < 4 or not records[0].startswith("Filename:\t"):
        fail("ORACLE_SOURCE_PREAMBLE_MISMATCH", f"{source} preamble changed.")
    if records[1] != "":
        fail("ORACLE_SOURCE_PREAMBLE_MISMATCH", f"{source} blank line changed.")
    header = records[2].split("\t")
    if len(header) != 2 or header[0] != "Temperature (°C)":
        fail("ORACLE_SOURCE_HEADER_MISMATCH", f"{source} temperature header changed.")
    points: list[Point] = []
    for source_row, record in enumerate(records[3:], start=4):
        cells = record.split("\t")
        if len(cells) != 2:
            fail(
                "ORACLE_SOURCE_LAYOUT_MISMATCH",
                f"{source} row {source_row} is not a two-column record.",
            )
        points.append(
            Point(
                source_row=source_row,
                temperature_c=parse_decimal(cells[0], source, source_row),
                value=parse_decimal(cells[1], source, source_row),
            )
        )
    if expected_rows is not None and len(points) != expected_rows:
        fail("ORACLE_SOURCE_ROW_COUNT_MISMATCH", f"{source} row count changed.")
    non_increasing = sum(
        right.temperature_c <= left.temperature_c
        for left, right in zip(points, points[1:])
    )
    return points, {
        "file": source,
        "header": header,
        "instrumentSource": records[0].removeprefix("Filename:\t"),
        "rowCount": len(points),
        "firstTemperatureC": points[0].temperature_c,
        "lastTemperatureC": points[-1].temperature_c,
        "minimumTemperatureC": min(point.temperature_c for point in points),
        "maximumTemperatureC": max(point.temperature_c for point in points),
        "firstValue": points[0].value,
        "lastValue": points[-1].value,
        "minimumValue": min(point.value for point in points),
        "maximumValue": max(point.value for point in points),
        "nonIncreasingTemperatureStepCount": non_increasing,
    }


def verify_archive(project_root: Path) -> tuple[zipfile.ZipFile, dict[str, Any]]:
    archive_path = project_root / SOURCE_DIRECTORY / str(ARCHIVE_LOCK["file"])
    try:
        archive_bytes = archive_path.read_bytes()
    except FileNotFoundError as error:
        raise OracleError(
            "ORACLE_ARCHIVE_MISSING",
            f"Required Dryad archive is missing: {archive_path}",
        ) from error
    if len(archive_bytes) != ARCHIVE_LOCK["bytes"]:
        fail("ORACLE_ARCHIVE_SIZE_MISMATCH", "Data.zip byte count changed.")
    if sha256_bytes(archive_bytes) != ARCHIVE_LOCK["sha256"]:
        fail("ORACLE_ARCHIVE_HASH_MISMATCH", "Data.zip SHA-256 changed.")
    archive = zipfile.ZipFile(archive_path)
    entries = archive.infolist()
    regular = [entry for entry in entries if not entry.is_dir()]
    if (
        len(entries) != ARCHIVE_LOCK["entryCount"]
        or len(regular) != ARCHIVE_LOCK["regularFileCount"]
    ):
        fail("ORACLE_ARCHIVE_LAYOUT_MISMATCH", "Data.zip entry count changed.")
    bad = archive.testzip()
    if bad is not None:
        fail("ORACLE_ARCHIVE_CRC_MISMATCH", f"Archive CRC failure: {bad}")
    return archive, {
        **ARCHIVE_LOCK,
        "archivePath": str(SOURCE_DIRECTORY / str(ARCHIVE_LOCK["file"])),
        "crcCheck": "passed",
    }


def load_lpi_sources(
    project_root: Path,
    archive: zipfile.ZipFile,
) -> tuple[dict[int, dict[str, list[Point]]], list[dict[str, Any]]]:
    runs: dict[int, dict[str, list[Point]]] = {}
    audits: list[dict[str, Any]] = []
    for lock in SOURCE_LOCKS:
        rate = int(lock["rate"])
        pair: dict[str, list[Point]] = {}
        pair_audit: dict[str, Any] = {
            "heatingRateKPerMin": rate,
            "rowCount": lock["rowCount"],
        }
        for kind in ("weight", "derivative"):
            file_key = f"{kind}File"
            archive_key = f"{kind}ArchivePath"
            bytes_key = f"{kind}Bytes"
            hash_key = f"{kind}Sha256"
            local_path = (
                project_root
                / SOURCE_DIRECTORY
                / "lpi-01"
                / str(lock[file_key])
            )
            try:
                raw = local_path.read_bytes()
            except FileNotFoundError as error:
                raise OracleError(
                    "ORACLE_SOURCE_MISSING",
                    f"Required source is missing: {local_path}",
                ) from error
            validate_raw_text(
                raw,
                str(lock[file_key]),
                str(lock[hash_key]),
                int(lock[bytes_key]),
            )
            archive_raw = archive.read(str(lock[archive_key]))
            if raw != archive_raw:
                fail(
                    "ORACLE_EXTRACTED_SOURCE_MISMATCH",
                    f"{lock[file_key]} differs from official Data.zip.",
                )
            points, audit = parse_export(
                raw,
                str(lock[file_key]),
                int(lock["rowCount"]),
            )
            pair[kind] = points
            pair_audit[kind] = {
                "file": audit["file"],
                "bytes": lock[bytes_key],
                "sha256": lock[hash_key],
                "archivePath": lock[archive_key],
                "equalsOfficialArchiveEntry": True,
                "firstTemperatureC": audit["firstTemperatureC"],
                "lastTemperatureC": audit["lastTemperatureC"],
                "firstValue": audit["firstValue"],
                "lastValue": audit["lastValue"],
                "minimumValue": audit["minimumValue"],
                "maximumValue": audit["maximumValue"],
                "nonIncreasingTemperatureStepCount": (
                    audit["nonIncreasingTemperatureStepCount"]
                ),
            }
        weight = pair["weight"]
        derivative = pair["derivative"]
        for weight_point, derivative_point in zip(weight, derivative):
            if weight_point.temperature_c != derivative_point.temperature_c:
                fail(
                    "ORACLE_PAIRED_TEMPERATURE_MISMATCH",
                    f"rate {rate} weight/DTG temperatures differ.",
                )
        runs[rate] = pair
        audits.append(pair_audit)
    return runs, audits


def project_alpha(
    weight: Sequence[Point],
    derivative: Sequence[Point],
    alpha: Decimal,
    heating_rate: Decimal,
) -> Projection:
    initial_weight = weight[0].value
    final_weight = weight[-1].value
    denominator = initial_weight - final_weight
    if denominator <= 0:
        fail("ORACLE_CONVERSION_DENOMINATOR_INVALID", "w0-wf must be positive.")
    target_weight = initial_weight - alpha * denominator
    crossings: list[int] = []
    for index, (left, right) in enumerate(zip(weight, weight[1:])):
        if (
            left.temperature_c >= MINIMUM_CROSSING_TEMPERATURE_C
            and left.value >= target_weight
            and right.value <= target_weight
        ):
            crossings.append(index)
    if not crossings:
        fail(
            "ORACLE_ALPHA_CROSSING_MISSING",
            f"rate {heating_rate}, alpha {alpha} has no downward crossing.",
        )
    index = crossings[0]
    left = weight[index]
    right = weight[index + 1]
    delta_weight = right.value - left.value
    if delta_weight == 0:
        fail("ORACLE_ALPHA_CROSSING_FLAT", "Crossing segment has no weight change.")
    fraction = (target_weight - left.value) / delta_weight
    temperature_c = left.temperature_c + fraction * (
        right.temperature_c - left.temperature_c
    )
    derivative_value = derivative[index].value + fraction * (
        derivative[index + 1].value - derivative[index].value
    )
    d_alpha_dt = -derivative_value / denominator
    if d_alpha_dt <= 0:
        fail(
            "ORACLE_FRIEDMAN_RATE_NONPOSITIVE",
            f"rate {heating_rate}, alpha {alpha} has non-positive dα/dt.",
        )
    return Projection(
        alpha=alpha,
        heating_rate=heating_rate,
        temperature_c=temperature_c,
        temperature_k=temperature_c + CELSIUS_OFFSET,
        d_alpha_dt_per_minute=d_alpha_dt,
        left_source_row=left.source_row,
        right_source_row=right.source_row,
        fraction=fraction,
    )


def linear_regression(
    x_values: Sequence[Decimal],
    y_values: Sequence[Decimal],
) -> dict[str, Decimal | int | list[Decimal]]:
    if len(x_values) != len(y_values) or len(x_values) < 3:
        fail("ORACLE_REGRESSION_INPUT_INVALID", "Regression input is invalid.")
    count = Decimal(len(x_values))
    mean_x = sum(x_values) / count
    mean_y = sum(y_values) / count
    sxx = sum((value - mean_x) ** 2 for value in x_values)
    if sxx == 0:
        fail("ORACLE_REGRESSION_SINGULAR", "Regression x values are singular.")
    slope = sum(
        (x_value - mean_x) * (y_value - mean_y)
        for x_value, y_value in zip(x_values, y_values)
    ) / sxx
    intercept = mean_y - slope * mean_x
    fitted = [intercept + slope * value for value in x_values]
    residuals = [
        observed - predicted
        for observed, predicted in zip(y_values, fitted)
    ]
    sse = sum(value**2 for value in residuals)
    sst = sum((value - mean_y) ** 2 for value in y_values)
    if sst == 0:
        fail("ORACLE_REGRESSION_RESPONSE_CONSTANT", "Regression y is constant.")
    return {
        "n": len(x_values),
        "x": list(x_values),
        "y": list(y_values),
        "slope": slope,
        "intercept": intercept,
        "fitted": fitted,
        "residuals": residuals,
        "sse": sse,
        "rSquared": Decimal(1) - sse / sst,
    }


def method_record(
    method: str,
    projected: Sequence[Projection],
) -> dict[str, Any]:
    temperatures = [point.temperature_k for point in projected]
    rates = [point.heating_rate for point in projected]
    inverse_temperatures = [Decimal(1) / value for value in temperatures]
    if method == "FWO":
        transformed = [value.ln() for value in rates]
        formula = "x=1/T_K; y=ln(beta_K_per_min); Ea=-slope*R/(1.052*1000)"
        divisor = FWO_COEFFICIENT
    elif method == "KAS":
        transformed = [
            (rate / temperature**2).ln()
            for rate, temperature in zip(rates, temperatures)
        ]
        formula = "x=1/T_K; y=ln(beta_K_per_min/T_K^2); Ea=-slope*R/1000"
        divisor = Decimal(1)
    elif method == "FRIEDMAN":
        transformed = [
            point.d_alpha_dt_per_minute.ln() for point in projected
        ]
        formula = "x=1/T_K; y=ln(dalpha/dt_per_min); Ea=-slope*R/1000"
        divisor = Decimal(1)
    else:
        fail("ORACLE_METHOD_UNKNOWN", f"Unknown method: {method}")
    regression = linear_regression(inverse_temperatures, transformed)
    energy = (
        -Decimal(regression["slope"]) * GAS_CONSTANT / divisor / Decimal(1000)
    )
    return {
        "alpha": projected[0].alpha,
        "activationEnergyKJPerMol": energy,
        "regression": {
            "n": regression["n"],
            "slope": regression["slope"],
            "rSquared": regression["rSquared"],
        },
        "_formula": formula,
    }


def interpolate_x(points: Sequence[Point], target: Decimal) -> Decimal:
    for left, right in zip(points, points[1:]):
        if left.temperature_c <= target <= right.temperature_c:
            delta = right.temperature_c - left.temperature_c
            if delta == 0:
                continue
            fraction = (target - left.temperature_c) / delta
            return left.value + fraction * (right.value - left.value)
    fail("ORACLE_TEMPERATURE_CROSSING_MISSING", f"T={target} is unavailable.")
    raise AssertionError("unreachable")


def threshold_temperature(
    points: Sequence[Point],
    target_weight: Decimal,
) -> Decimal:
    for left, right in zip(points, points[1:]):
        if (
            left.temperature_c >= MINIMUM_CROSSING_TEMPERATURE_C
            and left.value >= target_weight
            and right.value <= target_weight
        ):
            fraction = (target_weight - left.value) / (
                right.value - left.value
            )
            return left.temperature_c + fraction * (
                right.temperature_c - left.temperature_c
            )
    fail(
        "ORACLE_WEIGHT_THRESHOLD_MISSING",
        f"weight={target_weight} has no crossing.",
    )
    raise AssertionError("unreachable")


def table3_swap_adjudication(
    archive: zipfile.ZipFile,
) -> dict[str, Any]:
    samples: list[dict[str, Any]] = []
    for lock in SWAP_SOURCE_LOCKS:
        weight_raw = archive.read(str(lock["weightArchivePath"]))
        derivative_raw = archive.read(str(lock["derivativeArchivePath"]))
        validate_raw_text(
            weight_raw,
            str(lock["weightArchivePath"]),
            str(lock["weightSha256"]),
        )
        validate_raw_text(
            derivative_raw,
            str(lock["derivativeArchivePath"]),
            str(lock["derivativeSha256"]),
        )
        weight, _ = parse_export(
            weight_raw,
            str(lock["weightArchivePath"]),
            2280,
        )
        derivative, _ = parse_export(
            derivative_raw,
            str(lock["derivativeArchivePath"]),
            2280,
        )
        peak = min(derivative, key=lambda point: point.value)
        observed = {
            "temperatureAt20PercentMassLossC": threshold_temperature(
                weight, Decimal("80")
            ),
            "temperatureAt50PercentMassLossC": threshold_temperature(
                weight, Decimal("50")
            ),
            "peakTemperatureC": peak.temperature_c,
            "residueAt580CPercent": interpolate_x(weight, Decimal("580")),
        }
        samples.append(
            {
                "sample": lock["sample"],
                "heatingRateKPerMin": 15,
                "weightArchivePath": lock["weightArchivePath"],
                "weightSha256": lock["weightSha256"],
                "derivativeArchivePath": lock["derivativeArchivePath"],
                "derivativeSha256": lock["derivativeSha256"],
                "observedFromArchive": observed,
                "paperTable3": lock["paper"],
            }
        )
    by_sample = {item["sample"]: item for item in samples}
    return {
        "classification": "manual_review_expected_publication_row_swap",
        "finding": (
            "Paper Table 3 HBPI-01 and HBPI-03 T20/T50/residue values "
            "track the opposite sample's locked 15 K/min trace."
        ),
        "peakTemperatureColumnParticipatesInSwapFinding": False,
        "samples": samples,
        "crossComparison": {
            "hbpi01PaperVersusHbpi03Observed": {
                "paper": by_sample["HBPI-01"]["paperTable3"],
                "observed": by_sample["HBPI-03"]["observedFromArchive"],
            },
            "hbpi03PaperVersusHbpi01Observed": {
                "paper": by_sample["HBPI-03"]["paperTable3"],
                "observed": by_sample["HBPI-01"]["observedFromArchive"],
            },
        },
    }


def build_reference(project_root: Path) -> dict[str, Any]:
    archive, archive_audit = verify_archive(project_root)
    try:
        runs, source_audits = load_lpi_sources(project_root, archive)
        projections: dict[Decimal, list[Projection]] = {}
        for alpha in ALPHA_VALUES:
            projections[alpha] = [
                project_alpha(
                    runs[rate]["weight"],
                    runs[rate]["derivative"],
                    alpha,
                    Decimal(rate),
                )
                for rate in HEATING_RATES
            ]
        methods: dict[str, Any] = {}
        for method in METHODS:
            records = [
                method_record(method, projections[alpha])
                for alpha in ALPHA_VALUES
            ]
            formula = str(records[0].pop("_formula"))
            for record in records[1:]:
                if record.pop("_formula") != formula:
                    fail(
                        "ORACLE_FORMULA_INCONSISTENT",
                        f"{method} formula changed between records.",
                    )
            mean_energy = sum(
                record["activationEnergyKJPerMol"] for record in records
            ) / Decimal(len(records))
            published = PUBLISHED_MEANS[method]
            methods[method] = {
                "formula": formula,
                "records": records,
                "meanActivationEnergyKJPerMol": mean_energy,
                "paperTable4MeanKJPerMol": published,
                "paperMinusIndependentKJPerMol": published - mean_energy,
                "publicationValueIsHardOracle": False,
            }
        swap = table3_swap_adjudication(archive)
    finally:
        archive.close()
    return {
        "schema": SCHEMA,
        "fixtureId": FIXTURE_ID,
        "classification": "gold-candidate",
        "source": {
            "datasetDoi": "10.5061/dryad.0cfxpnvx2",
            "datasetVersion": 2,
            "dryadVersionId": 42617,
            "articleDoi": "10.1098/rsos.190869",
            "license": "CC0-1.0",
            "sample": "LPI-01",
            "atmosphere": "N2",
            "heatingRatesKPerMin": list(HEATING_RATES),
        },
        "recipe": {
            "alphaValues": list(ALPHA_VALUES),
            "preserveAcquisitionOrder": True,
            "initialWeight": "first weight-percent row per run",
            "finalWeight": "last weight-percent row per run",
            "conversion": "alpha=(w0-wt)/(w0-wf)",
            "crossing": (
                "first downward target-weight crossing with left T_C>=250; "
                "piecewise-linear interpolation"
            ),
            "temperature": "T_K=T_C+273.15",
            "friedmanDerivative": (
                "piecewise-linear deposited DTG at the same crossing; "
                "dalpha/dt=-DTG/(w0-wf)"
            ),
            "regression": "unweighted ordinary least squares across four rates",
            "gasConstantJPerMolK": GAS_CONSTANT,
            "fwoCoefficient": FWO_COEFFICIENT,
            "noSmoothingSortingExtrapolationOrRepair": True,
        },
        "archiveAudit": archive_audit,
        "sourceAudits": source_audits,
        "methods": methods,
        "publicationAdjudication": swap,
        "knownLimitations": [
            "The archive has no README, transformation worksheet, or author code.",
            "There is one trace per sample and heating rate; no replicates.",
            "The paper does not operationally define w0/wf or derivative smoothing.",
            (
                "The derivative export header is truncated at %/m; interpreting "
                "the deposited values as percent per minute follows the paper "
                "and instrument context."
            ),
            "Some archive runs have negative terminal weight and repeated/decreasing T.",
            "Paper Table 4 gives HBPI-02 KAS as 262; prose gives 264 kJ/mol.",
            "Coats-Redfern input heating rate is unspecified and is not a hard oracle.",
        ],
    }


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--project-root", type=Path)
    return parser.parse_args(argv)


def default_project_root() -> Path:
    return Path(__file__).resolve().parents[5]


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    project_root = (
        args.project_root.resolve()
        if args.project_root is not None
        else default_project_root()
    )
    output = canonical_json_bytes(build_reference(project_root))
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
                "Independent recomputation differs from expected-output.json.",
            )
    sys.stdout.buffer.write(output)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OracleError as error:
        sys.stderr.write(
            json.dumps(
                {
                    "status": "FAIL",
                    "code": error.code,
                    "message": error.message,
                },
                sort_keys=True,
            )
            + "\n"
        )
        raise SystemExit(2)
