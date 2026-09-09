#!/usr/bin/env python3
"""Independent NR-CELS Friedman reconstruction oracle.

This oracle imports only the Python standard library. It never imports the
Activation Energy Studio implementation. It byte-locks the pinned Zenodo v1
archives and retained source exports, parses the variable TG/dTG column order,
and evaluates two explicitly declared Friedman reconstructions with Decimal
arithmetic at precision 50:

1. piecewise-linear interpolation of the deposited dTG export; and
2. a seven-point local-linear TG-versus-time derivative centred on the first
   row at or below the target mass.

Both recipes use m_i=100 mass% and m_f=min(observed TG) independently for each
heating-rate curve. Deposited Kinetics Neo values are diagnostic comparison
targets. They are not used to derive or accept either reconstruction.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, getcontext
from pathlib import Path
from typing import Any, Mapping, Sequence


getcontext().prec = 50

SCHEMA = "activation-energy-studio/nr-cels-friedman-reference/v1"
FIXTURE_ROOT = Path("tests/fixtures/real/nr-cels")
SOURCE_ROOT = FIXTURE_ROOT / "source"
EXPECTED_OUTPUT = FIXTURE_ROOT / "oracle/expected-output.json"
IMPLEMENTATION_PATH = (
    FIXTURE_ROOT / "oracle/nr_cels_friedman_oracle.py"
)

GAS_CONSTANT = Decimal("8.31446261815324")
CELSIUS_OFFSET = Decimal("273.15")
INITIAL_TG_PERCENT = Decimal("100")
LOCAL_LINEAR_HALF_WINDOW = 3
ALPHA_VALUES = tuple(
    Decimal(index) / Decimal(100) for index in range(5, 96)
)
HEATING_RATES = (2, 4, 6, 8, 10, 20)
SAMPLES = (30, 45, 55)
METHODS = (
    "DEPOSITED_DTG",
    "TG_LOCAL_LINEAR_7",
)

ARCHIVE_LOCKS = (
    {
        "path": "TG_DTG_DTA_data.zip",
        "zenodoKey": "TG_DTG_DTA_data.zip",
        "bytes": 293756,
        "sha256": (
            "7894a691297b9b8626ac40e73cd128d066820e64b884b82b59d121b0ccb7a26a"
        ),
        "entryCount": 20,
        "uncompressedBytes": 1065088,
        "downloadUrl": (
            "https://zenodo.org/api/records/16939440/files/"
            "TG_DTG_DTA_data.zip/content"
        ),
    },
    {
        "path": "Kinetic_data.zip",
        "zenodoKey": "Kinetic data.zip",
        "bytes": 9668,
        "sha256": (
            "021c2de122021dcab547af0fe5f27910b22a383e99fff6c58441af110d8756e0"
        ),
        "entryCount": 9,
        "uncompressedBytes": 19717,
        "downloadUrl": (
            "https://zenodo.org/api/records/16939440/files/"
            "Kinetic%20data.zip/content"
        ),
    },
)


def curve_lock(
    sample: int,
    rate: int,
    *,
    byte_count: int,
    sha256: str,
    rows: int,
    initial_mass_mg: str,
    first_temperature_c: int,
    last_temperature_c: int,
    tg_index: int,
    dtg_index: int,
    tg_smoothed: bool,
    dtg_smoothed: bool,
) -> dict[str, Any]:
    return {
        "sample": sample,
        "rate": rate,
        "file": f"NR-CELS {sample} {rate}Cmin.txt",
        "path": f"curves/NR-CELS {sample} {rate}Cmin.txt",
        "bytes": byte_count,
        "sha256": sha256,
        "dataRowCount": rows,
        "initialMassMg": initial_mass_mg,
        "firstTemperatureC": first_temperature_c,
        "lastTemperatureC": last_temperature_c,
        "tgIndex": tg_index,
        "dtgIndex": dtg_index,
        "tgSmoothed": tg_smoothed,
        "dtgSmoothed": dtg_smoothed,
    }


CURVE_LOCKS = (
    curve_lock(
        30, 2, byte_count=54394,
        sha256="0109fd6646211fe553441e152c25043aa6aacdb7668af2acd792796fc2dc70a0",
        rows=582, initial_mass_mg="10.479", first_temperature_c=21,
        last_temperature_c=602, tg_index=2, dtg_index=3,
        tg_smoothed=False, dtg_smoothed=False,
    ),
    curve_lock(
        30, 4, byte_count=53802,
        sha256="00183ea53b9323a779115aee8199f6a39cb18486a40f234e3ec93ccda5e5115c",
        rows=580, initial_mass_mg="10.119", first_temperature_c=21,
        last_temperature_c=600, tg_index=2, dtg_index=3,
        tg_smoothed=False, dtg_smoothed=False,
    ),
    curve_lock(
        30, 6, byte_count=53870,
        sha256="86b8ba0bd838fd1bd1d4218b16f08b0f6fb96745d243aea51d5fa768b64172fb",
        rows=582, initial_mass_mg="10.280", first_temperature_c=17,
        last_temperature_c=598, tg_index=2, dtg_index=3,
        tg_smoothed=False, dtg_smoothed=False,
    ),
    curve_lock(
        30, 8, byte_count=53106,
        sha256="98c2cb67c60958718390058b682bcde572bd6a9cb4e460c2daaf202dc7f37828",
        rows=576, initial_mass_mg="10.150", first_temperature_c=20,
        last_temperature_c=595, tg_index=2, dtg_index=3,
        tg_smoothed=False, dtg_smoothed=False,
    ),
    curve_lock(
        30, 10, byte_count=52176,
        sha256="5850c5a1fec67b6b386cae2420234326a3355488909d607083bc02db02d7dcdd",
        rows=573, initial_mass_mg="10.499", first_temperature_c=21,
        last_temperature_c=593, tg_index=2, dtg_index=3,
        tg_smoothed=False, dtg_smoothed=False,
    ),
    curve_lock(
        30, 20, byte_count=51914,
        sha256="4befa2fd9b994792f91e72cdfd14eaacdaef67ac4e8d8b51e213f374ed09e4ee",
        rows=561, initial_mass_mg="10.350", first_temperature_c=21,
        last_temperature_c=581, tg_index=2, dtg_index=3,
        tg_smoothed=False, dtg_smoothed=False,
    ),
    curve_lock(
        45, 2, byte_count=54652,
        sha256="aa9104eff3f5d3490be2db5602dce17bbf152183dd0a36bd8eb563333202f1af",
        rows=583, initial_mass_mg="10.440", first_temperature_c=21,
        last_temperature_c=603, tg_index=3, dtg_index=2,
        tg_smoothed=True, dtg_smoothed=True,
    ),
    curve_lock(
        45, 4, byte_count=53414,
        sha256="acd6630852f86043e155793728de46aded517818bf3dc8eccd096b0d84a91a36",
        rows=580, initial_mass_mg="10.370", first_temperature_c=21,
        last_temperature_c=600, tg_index=3, dtg_index=2,
        tg_smoothed=True, dtg_smoothed=True,
    ),
    curve_lock(
        45, 6, byte_count=53508,
        sha256="84cd9c4500e177763ae5771d0e6e6845d6f4168039383eb836b9416d351ec4fe",
        rows=578, initial_mass_mg="10.169", first_temperature_c=20,
        last_temperature_c=597, tg_index=3, dtg_index=2,
        tg_smoothed=True, dtg_smoothed=True,
    ),
    curve_lock(
        45, 8, byte_count=53394,
        sha256="072aeb453898c6dfe1dc8932309dbf699156e9860b1d19ba71becf01c24996d1",
        rows=575, initial_mass_mg="10.239", first_temperature_c=21,
        last_temperature_c=595, tg_index=2, dtg_index=3,
        tg_smoothed=False, dtg_smoothed=True,
    ),
    curve_lock(
        45, 10, byte_count=53058,
        sha256="924da81171f18685755cbb8c9ba5e2026472eda489311a8e203655a31c08d02c",
        rows=573, initial_mass_mg="10.359", first_temperature_c=20,
        last_temperature_c=592, tg_index=3, dtg_index=2,
        tg_smoothed=True, dtg_smoothed=True,
    ),
    curve_lock(
        45, 20, byte_count=51842,
        sha256="16dadb169872cc8f87371bc355b3c3877df6e203c9423d38f661f35689d7482e",
        rows=561, initial_mass_mg="9.999", first_temperature_c=21,
        last_temperature_c=581, tg_index=2, dtg_index=3,
        tg_smoothed=False, dtg_smoothed=False,
    ),
    curve_lock(
        55, 2, byte_count=54638,
        sha256="db0fbf1cbbcc2f8949b1611814c8efd63b9dd0b069b63c8001ad9d6664a2ae36",
        rows=584, initial_mass_mg="10.270", first_temperature_c=20,
        last_temperature_c=603, tg_index=3, dtg_index=2,
        tg_smoothed=True, dtg_smoothed=True,
    ),
    curve_lock(
        55, 4, byte_count=53764,
        sha256="72a9ff64066f55faf018be4dc5756311492a4f7076d76e88cb63f829a594b709",
        rows=580, initial_mass_mg="10.429", first_temperature_c=21,
        last_temperature_c=600, tg_index=3, dtg_index=2,
        tg_smoothed=True, dtg_smoothed=True,
    ),
    curve_lock(
        55, 6, byte_count=53592,
        sha256="6c7eca304b561e4a9f27cf39bd858944ed395f73a6ebc8251268ab553577b510",
        rows=578, initial_mass_mg="10.010", first_temperature_c=21,
        last_temperature_c=598, tg_index=3, dtg_index=2,
        tg_smoothed=True, dtg_smoothed=True,
    ),
    curve_lock(
        55, 8, byte_count=53344,
        sha256="4bde44892514b5aa0ed3774e5bfb66252baecab7671fd046ea7f16d28a9665b0",
        rows=576, initial_mass_mg="10.160", first_temperature_c=21,
        last_temperature_c=596, tg_index=2, dtg_index=3,
        tg_smoothed=False, dtg_smoothed=True,
    ),
    curve_lock(
        55, 10, byte_count=52684,
        sha256="88e3edb768b1add63afb3718c6b5edb3b2dff9defb5be8e1ed74c94247139156",
        rows=573, initial_mass_mg="10.520", first_temperature_c=21,
        last_temperature_c=593, tg_index=2, dtg_index=3,
        tg_smoothed=False, dtg_smoothed=True,
    ),
    curve_lock(
        55, 20, byte_count=51160,
        sha256="ced225e82004e331e1543626bf0699e4adc5350ffa811decbe92ad2eae9ae7d0",
        rows=562, initial_mass_mg="10.219", first_temperature_c=21,
        last_temperature_c=582, tg_index=2, dtg_index=3,
        tg_smoothed=False, dtg_smoothed=False,
    ),
)

KINETIC_LOCKS = (
    ("NR-CELS 30 Friedman.txt", 2333, "1ab874107fd29ab23d0e1b5f77e8c5750a6917756a577091457b208e1c7fa003"),
    ("NR-CELS 30 LogA Friedman.txt", 2265, "669db626152b746d2a99bc6de1c512d0f506e1065c2fd38c951ff8c9be442c7b"),
    ("NR-CELS 30 model based.txt", 2008, "a04fea0719a7854b6bf5ced9d09c6320301b31dbb977d5de0dbd2d0949504089"),
    ("NR-CELS 45 Friedman.txt", 2308, "b3ae45f05068acd91f5b958e50ac474b6d3831e8cb36c236a7c875d79e9f1d0d"),
    ("NR-CELS 45 LogA Friedman.txt", 2266, "9a0598defd40b40c78f7285e1f85fbc37f1df25dc13b8ea174940997deee46a2"),
    ("NR-CELS 45 model based.txt", 1987, "70dcdb0c4ac80627f88704eb6698d9f33e767becc55243314c71ab00353396b0"),
    ("NR-CELS 55 Friedman.txt", 2325, "45e7bb4989f0ca4aef8b6aae5f5d0a46b2149d456aa391ceea14735e89b99fdb"),
    ("NR-CELS 55 LogA Friedman.txt", 2266, "749530441201646900ebdc1d1079b615a9ddb8eea51b278094982f6082df147f"),
    ("NR-CELS 55 model based.txt", 1959, "4574b8e9c317c5035b789ecee72bb406cc892bfe5f8cdab31a174d30a92ea5b0"),
)


class OracleError(RuntimeError):
    """Fail-closed source, recipe, or arithmetic error."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class CurvePoint:
    data_index: int
    source_line: int
    time_seconds: Decimal
    temperature_c: Decimal
    tg_percent: Decimal
    dtg_percent_per_minute: Decimal
    heat_flow_microvolt: Decimal


@dataclass(frozen=True)
class ProjectedObservation:
    sample: int
    heating_rate: int
    alpha: Decimal
    temperature_c: Decimal
    d_alpha_dt_per_minute: Decimal
    target_tg_percent: Decimal
    final_tg_percent: Decimal
    left_index: int
    right_index: int
    interpolation_fraction: Decimal
    derivative_window: tuple[int, int] | None


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


def parse_decimal(
    raw: str,
    *,
    file_name: str,
    source_line: int,
    column_name: str,
) -> Decimal:
    try:
        value = Decimal(raw.replace(",", "."))
    except InvalidOperation as error:
        raise OracleError(
            "ORACLE_SOURCE_NUMBER_INVALID",
            (
                f"{file_name} line {source_line} column {column_name} "
                "is not a decimal-comma number."
            ),
        ) from error
    if not value.is_finite():
        fail(
            "ORACLE_SOURCE_NUMBER_INVALID",
            f"{file_name} line {source_line} column {column_name} is non-finite.",
        )
    return value


def locked_bytes(project_root: Path, relative_path: Path, lock: Mapping[str, Any]) -> bytes:
    path = project_root / SOURCE_ROOT / relative_path
    try:
        raw = path.read_bytes()
    except FileNotFoundError as error:
        raise OracleError(
            "ORACLE_SOURCE_MISSING",
            f"Required NR-CELS source is missing: {path}",
        ) from error
    if len(raw) != lock["bytes"]:
        fail("ORACLE_SOURCE_SIZE_MISMATCH", f"{relative_path} byte count changed.")
    if sha256_bytes(raw) != lock["sha256"]:
        fail("ORACLE_SOURCE_HASH_MISMATCH", f"{relative_path} SHA-256 changed.")
    return raw


def read_archives(project_root: Path) -> dict[str, Any]:
    audits: list[dict[str, Any]] = []
    members_by_archive: dict[str, dict[str, bytes]] = {}
    for lock in ARCHIVE_LOCKS:
        raw = locked_bytes(project_root, Path(str(lock["path"])), lock)
        archive_path = project_root / SOURCE_ROOT / str(lock["path"])
        with zipfile.ZipFile(archive_path) as archive:
            bad_member = archive.testzip()
            if bad_member is not None:
                fail(
                    "ORACLE_ARCHIVE_CRC_MISMATCH",
                    f"{lock['path']} failed CRC at {bad_member}.",
                )
            infos = [item for item in archive.infolist() if not item.is_dir()]
            if len(infos) != lock["entryCount"]:
                fail(
                    "ORACLE_ARCHIVE_INVENTORY_MISMATCH",
                    f"{lock['path']} entry count changed.",
                )
            uncompressed = sum(item.file_size for item in infos)
            if uncompressed != lock["uncompressedBytes"]:
                fail(
                    "ORACLE_ARCHIVE_INVENTORY_MISMATCH",
                    f"{lock['path']} uncompressed byte count changed.",
                )
            members = {item.filename: archive.read(item.filename) for item in infos}
        members_by_archive[str(lock["path"])] = members
        audits.append(
            {
                **lock,
                "sha256": sha256_bytes(raw),
                "memberNames": sorted(members),
            }
        )

    tg_members = members_by_archive["TG_DTG_DTA_data.zip"]
    kinetic_members = members_by_archive["Kinetic_data.zip"]
    for lock in CURVE_LOCKS:
        retained = locked_bytes(project_root, Path(str(lock["path"])), lock)
        if tg_members.get(str(lock["file"])) != retained:
            fail(
                "ORACLE_ARCHIVE_MEMBER_MISMATCH",
                f"{lock['path']} is not byte-identical to its official ZIP member.",
            )
    for name, byte_count, digest in KINETIC_LOCKS:
        lock = {"bytes": byte_count, "sha256": digest}
        retained = locked_bytes(project_root, Path("kinetic") / name, lock)
        if kinetic_members.get(name) != retained:
            fail(
                "ORACLE_ARCHIVE_MEMBER_MISMATCH",
                f"kinetic/{name} is not byte-identical to its official ZIP member.",
            )

    retained_curve_names = {str(lock["file"]) for lock in CURVE_LOCKS}
    omitted = sorted(set(tg_members) - retained_curve_names)
    if omitted != ["CEL 10Cmin.txt", "CELS 10Cmin.txt"]:
        fail(
            "ORACLE_ARCHIVE_INVENTORY_MISMATCH",
            "The intentionally unretained single-rate CEL/CELS member set changed.",
        )
    return {
        "archives": audits,
        "retainedCurveCount": len(CURVE_LOCKS),
        "retainedKineticCount": len(KINETIC_LOCKS),
        "intentionallyUnretainedSingleRateMembers": omitted,
    }


def read_curve(
    project_root: Path,
    lock: Mapping[str, Any],
) -> tuple[list[CurvePoint], dict[str, Any]]:
    raw = locked_bytes(project_root, Path(str(lock["path"])), lock)
    if not raw.startswith(b"\xff\xfe"):
        fail("ORACLE_SOURCE_ENCODING_MISMATCH", f"{lock['file']} lost UTF-16LE BOM.")
    encoded_crlf = b"\r\x00\n\x00"
    if not raw.endswith(encoded_crlf):
        fail("ORACLE_SOURCE_LINE_ENDING_MISMATCH", f"{lock['file']} must end in CRLF.")
    if b"\n\x00" in raw.replace(encoded_crlf, b""):
        fail("ORACLE_SOURCE_LINE_ENDING_MISMATCH", f"{lock['file']} contains bare LF.")

    try:
        text = raw.decode("utf-16")
    except UnicodeDecodeError as error:
        raise OracleError(
            "ORACLE_SOURCE_ENCODING_MISMATCH",
            f"{lock['file']} is not valid UTF-16LE.",
        ) from error
    lines = text.splitlines()
    header_index = next(
        (index for index, line in enumerate(lines) if line.startswith("Time(s)\t")),
        None,
    )
    if header_index is None:
        fail("ORACLE_SOURCE_HEADER_MISMATCH", f"{lock['file']} has no data header.")
    header = lines[header_index].split("\t")
    if len(header) != 5:
        fail("ORACLE_SOURCE_HEADER_MISMATCH", f"{lock['file']} must have five columns.")
    expected_prefixes = {
        0: "Time(s)",
        1: "Sample Temperature(°C)",
        int(lock["tgIndex"]): "TG ",
        int(lock["dtgIndex"]): "dTG",
        4: "HeatFlow ",
    }
    for index, prefix in expected_prefixes.items():
        if not header[index].startswith(prefix):
            fail(
                "ORACLE_SOURCE_HEADER_MISMATCH",
                f"{lock['file']} column {index + 1} no longer begins {prefix!r}.",
            )
    tg_header = header[int(lock["tgIndex"])]
    dtg_header = header[int(lock["dtgIndex"])]
    if "|-b" not in tg_header:
        fail(
            "ORACLE_SOURCE_HEADER_MISMATCH",
            f"{lock['file']} lost its blank-subtraction marker.",
        )
    if ("|s" in tg_header) is not bool(lock["tgSmoothed"]):
        fail(
            "ORACLE_SOURCE_HEADER_MISMATCH",
            f"{lock['file']} TG smoothing marker changed.",
        )
    if ("|s" in dtg_header) is not bool(lock["dtgSmoothed"]):
        fail(
            "ORACLE_SOURCE_HEADER_MISMATCH",
            f"{lock['file']} dTG smoothing marker changed.",
        )

    initial_mass_matches = re.findall(
        r" Initial Mass : ([0-9]+,[0-9]+) mg",
        "\n".join(lines[:header_index]),
    )
    if not initial_mass_matches:
        fail("ORACLE_SOURCE_METADATA_MISMATCH", f"{lock['file']} lacks initial mass.")
    initial_masses = {
        parse_decimal(
            value,
            file_name=str(lock["file"]),
            source_line=1,
            column_name="Initial Mass",
        )
        for value in initial_mass_matches
    }
    expected_mass = Decimal(str(lock["initialMassMg"]))
    if initial_masses != {expected_mass}:
        fail(
            "ORACLE_SOURCE_METADATA_MISMATCH",
            f"{lock['file']} initial-mass metadata changed.",
        )

    points: list[CurvePoint] = []
    for line_index, line in enumerate(lines[header_index + 1 :], start=header_index + 2):
        if not line:
            continue
        cells = line.split("\t")
        if len(cells) != 5:
            fail(
                "ORACLE_SOURCE_LAYOUT_MISMATCH",
                f"{lock['file']} line {line_index} no longer has five fields.",
            )
        values = [
            parse_decimal(
                cell,
                file_name=str(lock["file"]),
                source_line=line_index,
                column_name=header[index],
            )
            for index, cell in enumerate(cells)
        ]
        points.append(
            CurvePoint(
                data_index=len(points),
                source_line=line_index,
                time_seconds=values[0],
                temperature_c=values[1],
                tg_percent=values[int(lock["tgIndex"])],
                dtg_percent_per_minute=values[int(lock["dtgIndex"])],
                heat_flow_microvolt=values[4],
            )
        )

    if len(points) != lock["dataRowCount"]:
        fail(
            "ORACLE_SOURCE_LAYOUT_MISMATCH",
            f"{lock['file']} data-row count changed.",
        )
    if points[0].temperature_c != Decimal(lock["firstTemperatureC"]):
        fail(
            "ORACLE_SOURCE_LAYOUT_MISMATCH",
            f"{lock['file']} first temperature changed.",
        )
    if points[-1].temperature_c != Decimal(lock["lastTemperatureC"]):
        fail(
            "ORACLE_SOURCE_LAYOUT_MISMATCH",
            f"{lock['file']} last temperature changed.",
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
                f"{lock['file']} time is not strictly increasing.",
            )

    minimum_index, minimum_point = min(
        enumerate(points),
        key=lambda item: item[1].tg_percent,
    )
    audit = {
        **lock,
        "columnHeaders": header,
        "columnOrder": [
            "time_s",
            "temperature_c",
            "tg_percent" if lock["tgIndex"] == 2 else "dtg_percent_per_minute",
            "dtg_percent_per_minute" if lock["dtgIndex"] == 3 else "tg_percent",
            "heat_flow_microvolt",
        ],
        "encoding": "UTF-16LE with BOM",
        "lineEndings": "CRLF",
        "delimiter": "tab",
        "decimalSeparator": "comma",
        "blankSubtracted": True,
        "firstTGPercent": points[0].tg_percent,
        "lastTGPercent": points[-1].tg_percent,
        "minimumTGPercent": minimum_point.tg_percent,
        "minimumTGDataIndex": minimum_index,
        "maximumTGPercent": max(point.tg_percent for point in points),
        "minimumDTGPercentPerMinute": min(
            point.dtg_percent_per_minute for point in points
        ),
    }
    return points, audit


def read_kinetic_series(
    project_root: Path,
    sample: int,
) -> tuple[dict[Decimal, tuple[Decimal, Decimal]], dict[str, Any]]:
    name = f"NR-CELS {sample} Friedman.txt"
    lock_tuple = next(item for item in KINETIC_LOCKS if item[0] == name)
    lock = {"bytes": lock_tuple[1], "sha256": lock_tuple[2]}
    raw = locked_bytes(project_root, Path("kinetic") / name, lock)
    if raw.startswith(b"\xef\xbb\xbf"):
        fail("ORACLE_KINETIC_ENCODING_MISMATCH", f"{name} unexpectedly has a BOM.")
    if not raw.endswith(b"\r\n") or b"\n" in raw.replace(b"\r\n", b""):
        fail("ORACLE_KINETIC_LINE_ENDING_MISMATCH", f"{name} must use CRLF.")
    text = raw.decode("utf-8")
    series: dict[Decimal, tuple[Decimal, Decimal]] = {}
    for source_line, line in enumerate(text.splitlines(), start=1):
        cells = line.split("\t")
        if len(cells) < 3 or re.fullmatch(r"0,\d{2}", cells[0]) is None:
            continue
        alpha = parse_decimal(
            cells[0],
            file_name=name,
            source_line=source_line,
            column_name="Conversion",
        )
        energy = parse_decimal(
            cells[1],
            file_name=name,
            source_line=source_line,
            column_name="Ea",
        )
        error = parse_decimal(
            cells[2],
            file_name=name,
            source_line=source_line,
            column_name="±Error",
        )
        series[alpha] = (energy, error)
    expected_grid = {
        Decimal(index) / Decimal(100) for index in range(1, 100)
    }
    if set(series) != expected_grid:
        fail(
            "ORACLE_KINETIC_GRID_MISMATCH",
            f"{name} no longer contains alpha 0.01 through 0.99.",
        )
    selected = {alpha: series[alpha] for alpha in ALPHA_VALUES}
    energies = [selected[alpha][0] for alpha in ALPHA_VALUES]
    mean = sum(energies, Decimal(0)) / Decimal(len(energies))
    population_sd = (
        sum((value - mean) ** 2 for value in energies)
        / Decimal(len(energies))
    ).sqrt()
    maximum = max(energies)
    maximum_alpha = ALPHA_VALUES[energies.index(maximum)]
    return selected, {
        "file": name,
        "path": f"kinetic/{name}",
        "bytes": lock["bytes"],
        "sha256": lock["sha256"],
        "fullAlphaCount": len(series),
        "selectedAlphaCount": len(selected),
        "selectedMeanKJPerMol": mean,
        "selectedPopulationStandardDeviationKJPerMol": population_sd,
        "selectedMaximumKJPerMol": maximum,
        "selectedMaximumAlpha": maximum_alpha,
    }


def local_linear_slope(
    points: Sequence[CurvePoint],
    centre_index: int,
) -> tuple[Decimal, tuple[int, int]]:
    left_index = max(0, centre_index - LOCAL_LINEAR_HALF_WINDOW)
    right_index = min(
        len(points) - 1,
        centre_index + LOCAL_LINEAR_HALF_WINDOW,
    )
    window = points[left_index : right_index + 1]
    x = tuple(point.time_seconds / Decimal(60) for point in window)
    y = tuple(point.tg_percent for point in window)
    regression = ordinary_least_squares(x, y, required_count=None)
    return regression["slope"], (left_index, right_index)


def project_observation(
    sample: int,
    rate: int,
    points: Sequence[CurvePoint],
    alpha: Decimal,
    method: str,
) -> ProjectedObservation:
    final_tg = min(point.tg_percent for point in points)
    span = INITIAL_TG_PERCENT - final_tg
    if span <= 0:
        fail("ORACLE_CONVERSION_SPAN_INVALID", f"NR-CELS {sample} {rate} span invalid.")
    target_tg = INITIAL_TG_PERCENT - alpha * span
    crossing_pair: tuple[int, CurvePoint, CurvePoint] | None = None
    for index in range(1, len(points)):
        left = points[index - 1]
        right = points[index]
        if left.tg_percent > target_tg and right.tg_percent <= target_tg:
            crossing_pair = (index, left, right)
            break
    if crossing_pair is None:
        fail(
            "ORACLE_ALPHA_CROSSING_MISSING",
            f"NR-CELS {sample} {rate} has no downward crossing at alpha={alpha}.",
        )
    right_index, left, right = crossing_pair
    denominator = right.tg_percent - left.tg_percent
    if denominator == 0:
        fail(
            "ORACLE_ALPHA_CROSSING_INVALID",
            f"NR-CELS {sample} {rate} crossing has equal TG values.",
        )
    fraction = (target_tg - left.tg_percent) / denominator
    temperature_c = (
        left.temperature_c
        + fraction * (right.temperature_c - left.temperature_c)
    )
    derivative_window: tuple[int, int] | None = None
    if method == "DEPOSITED_DTG":
        d_tg_dt = (
            left.dtg_percent_per_minute
            + fraction
            * (
                right.dtg_percent_per_minute
                - left.dtg_percent_per_minute
            )
        )
    elif method == "TG_LOCAL_LINEAR_7":
        d_tg_dt, derivative_window = local_linear_slope(points, right_index)
    else:
        fail("ORACLE_METHOD_UNKNOWN", f"Unknown reconstruction method: {method}")
    d_alpha_dt = -d_tg_dt / span
    if d_alpha_dt <= 0:
        fail(
            "ORACLE_DERIVATIVE_NONPOSITIVE",
            (
                f"NR-CELS {sample} {rate} alpha={alpha} method={method} "
                "has nonpositive dα/dt."
            ),
        )
    return ProjectedObservation(
        sample=sample,
        heating_rate=rate,
        alpha=alpha,
        temperature_c=temperature_c,
        d_alpha_dt_per_minute=d_alpha_dt,
        target_tg_percent=target_tg,
        final_tg_percent=final_tg,
        left_index=left.data_index,
        right_index=right.data_index,
        interpolation_fraction=fraction,
        derivative_window=derivative_window,
    )


def ordinary_least_squares(
    x: Sequence[Decimal],
    y: Sequence[Decimal],
    *,
    required_count: int | None,
) -> dict[str, Any]:
    if len(x) != len(y) or len(x) < 2:
        fail("ORACLE_REGRESSION_INPUT_INVALID", "OLS input lengths are invalid.")
    if required_count is not None and len(x) != required_count:
        fail(
            "ORACLE_REGRESSION_INPUT_INVALID",
            f"OLS requires exactly {required_count} observations.",
        )
    count = Decimal(len(x))
    mean_x = sum(x, Decimal(0)) / count
    mean_y = sum(y, Decimal(0)) / count
    sxx = sum((value - mean_x) ** 2 for value in x)
    sxy = sum(
        (x_value - mean_x) * (y_value - mean_y)
        for x_value, y_value in zip(x, y)
    )
    syy = sum((value - mean_y) ** 2 for value in y)
    if sxx <= 0 or syy <= 0:
        fail("ORACLE_REGRESSION_INPUT_INVALID", "OLS lacks variation.")
    slope = sxy / sxx
    intercept = mean_y - slope * mean_x
    fitted = tuple(intercept + slope * value for value in x)
    residuals = tuple(
        observed - predicted for observed, predicted in zip(y, fitted)
    )
    sse = sum(value**2 for value in residuals)
    return {
        "n": len(x),
        "x": x,
        "y": y,
        "slope": slope,
        "intercept": intercept,
        "fitted": fitted,
        "residuals": residuals,
        "sse": sse,
        "rSquared": Decimal(1) - sse / syy,
    }


def calculate_record(
    alpha: Decimal,
    observations: Sequence[ProjectedObservation],
    published: tuple[Decimal, Decimal],
) -> dict[str, Any]:
    x = tuple(
        Decimal(1) / (point.temperature_c + CELSIUS_OFFSET)
        for point in observations
    )
    y = tuple(point.d_alpha_dt_per_minute.ln() for point in observations)
    regression = ordinary_least_squares(x, y, required_count=6)
    energy = -regression["slope"] * GAS_CONSTANT / Decimal(1000)
    published_energy, published_error = published
    delta = energy - published_energy
    return {
        "alpha": alpha,
        "activationEnergyKJPerMol": energy,
        "publishedActivationEnergyKJPerMol": published_energy,
        "publishedErrorKJPerMol": published_error,
        "deltaVsPublishedKJPerMol": delta,
        "absoluteDeltaVsPublishedKJPerMol": abs(delta),
        "regression": {
            "n": regression["n"],
            "slope": regression["slope"],
            "intercept": regression["intercept"],
            "rSquared": regression["rSquared"],
        },
    }


def summarize(records: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    deltas = [record["deltaVsPublishedKJPerMol"] for record in records]
    energies = [record["activationEnergyKJPerMol"] for record in records]
    published = [
        record["publishedActivationEnergyKJPerMol"] for record in records
    ]
    count = Decimal(len(records))
    absolute = [abs(value) for value in deltas]
    maximum = max(absolute)
    maximum_index = absolute.index(maximum)
    return {
        "alphaCount": len(records),
        "meanActivationEnergyKJPerMol": sum(energies, Decimal(0)) / count,
        "meanPublishedActivationEnergyKJPerMol": (
            sum(published, Decimal(0)) / count
        ),
        "meanDeltaVsPublishedKJPerMol": sum(deltas, Decimal(0)) / count,
        "meanAbsoluteDeltaVsPublishedKJPerMol": (
            sum(absolute, Decimal(0)) / count
        ),
        "rmseVsPublishedKJPerMol": (
            sum(value**2 for value in deltas) / count
        ).sqrt(),
        "maximumAbsoluteDeltaVsPublishedKJPerMol": maximum,
        "maximumAbsoluteDeltaAlpha": records[maximum_index]["alpha"],
        "minimumActivationEnergyKJPerMol": min(energies),
        "maximumActivationEnergyKJPerMol": max(energies),
        "meanRSquared": (
            sum(
                record["regression"]["rSquared"] for record in records
            )
            / count
        ),
    }


def build_reference(project_root: Path) -> dict[str, Any]:
    archive_audit = read_archives(project_root)
    curves: dict[tuple[int, int], list[CurvePoint]] = {}
    curve_audits: list[dict[str, Any]] = []
    for lock in CURVE_LOCKS:
        points, audit = read_curve(project_root, lock)
        curves[(int(lock["sample"]), int(lock["rate"]))] = points
        curve_audits.append(audit)

    published_by_sample: dict[int, dict[Decimal, tuple[Decimal, Decimal]]] = {}
    kinetic_audits: list[dict[str, Any]] = []
    for sample in SAMPLES:
        series, audit = read_kinetic_series(project_root, sample)
        published_by_sample[sample] = series
        kinetic_audits.append(audit)

    samples: dict[str, Any] = {}
    for sample in SAMPLES:
        methods: dict[str, Any] = {}
        for method in METHODS:
            records: list[dict[str, Any]] = []
            for alpha in ALPHA_VALUES:
                observations = [
                    project_observation(
                        sample,
                        rate,
                        curves[(sample, rate)],
                        alpha,
                        method,
                    )
                    for rate in HEATING_RATES
                ]
                records.append(
                    calculate_record(
                        alpha,
                        observations,
                        published_by_sample[sample][alpha],
                    )
                )
            methods[method] = {
                "formulaId": "friedman_ln_dalpha_dt_v1",
                "records": records,
                "summary": summarize(records),
            }
        samples[str(sample)] = {
            "sampleId": f"NR-CELS {sample}",
            "heatingRatesKPerMin": HEATING_RATES,
            "methods": methods,
        }

    kinetic_files = [
        {
            "file": name,
            "path": f"kinetic/{name}",
            "bytes": byte_count,
            "sha256": digest,
        }
        for name, byte_count, digest in KINETIC_LOCKS
    ]
    return {
        "schema": SCHEMA,
        "fixtureId": "nr-cels-zenodo-v1-friedman-alpha-005-095",
        "classification": "diagnostic-reconstruction",
        "source": {
            "datasetVersionDoi": "10.5281/zenodo.16939440",
            "datasetVersionRecord": "https://zenodo.org/records/16939440",
            "datasetConceptDoi": "10.5281/zenodo.16939439",
            "currentConceptLatestRecord": "https://zenodo.org/records/18176373",
            "conceptLatestContainsRawArchives": False,
            "articleDoi": "10.1016/j.ecmx.2025.101513",
            "license": "CC-BY-4.0",
            "archiveAudit": archive_audit,
            "curveAudits": curve_audits,
            "kineticAudits": kinetic_audits,
            "allKineticFiles": kinetic_files,
        },
        "recipe": {
            "alphaValues": ALPHA_VALUES,
            "alphaGrid": "0.05 through 0.95 inclusive in 0.01 increments",
            "initialTGPercent": INITIAL_TG_PERCENT,
            "finalTGPercent": "minimum observed TG independently per curve",
            "conversion": "alpha=(100-TG)/(100-min(TG))",
            "crossingRule": (
                "first acquisition-order pair with left TG > target and "
                "right TG <= target; piecewise-linear temperature interpolation"
            ),
            "depositedDTG": (
                "piecewise-linear interpolation of deposited dTG on the "
                "selected crossing; dAlpha/dt=-dTG/(100-min(TG))"
            ),
            "tgLocalLinear7": (
                "OLS slope of TG versus time in minutes over data indices "
                "[right-crossing-index-3,right-crossing-index+3], clipped at "
                "bounds; slope is evaluated at the right crossing row and "
                "dAlpha/dt=-slope/(100-min(TG))"
            ),
            "temperature": "T_K=T_C+273.15",
            "regression": (
                "unweighted OLS of ln(dAlpha/dt) versus 1/T_K across six rates"
            ),
            "gasConstantJPerMolK": GAS_CONSTANT,
            "arithmetic": "Decimal",
            "decimalPrecision": getcontext().prec,
            "noSortingExtrapolationMonotonicRepairOrSourceMutation": True,
            "publicationValuesAreHardRawPipelineOracle": False,
            "explicitRecipeOutputsAreHardReproducibilityTargets": True,
        },
        "samples": samples,
        "adjudication": {
            "decision": (
                "accept_pinned_sources_and_explicit_recipe_oracles_"
                "quarantine_exact_kinetics_neo_parity"
            ),
            "conceptDoiTrap": (
                "Pin version DOI 10.5281/zenodo.16939440. The concept DOI "
                "currently resolves to article-only record 18176373."
            ),
            "missingAuthorPipeline": [
                "Kinetics Neo .kinx project",
                "smoothing algorithm/window/order",
                "blank curves",
                "conversion baseline and final-mass selection",
                "conversion interpolation settings",
                "definition and confidence level of exported ±Error",
            ],
            "publicationDiscrepancies": [
                {
                    "code": "NR_CELS_45_MAXIMUM_TRANSPOSED",
                    "publishedKJPerMol": "334.986",
                    "depositedSeriesMaximumKJPerMol": "334.968",
                    "depositedSeriesMaximumAlpha": "0.68",
                },
                {
                    "code": "NR_CELS_30_MODEL_N_ROUNDING_OR_VERSION",
                    "publishedAtoBReactionOrder": "2.175",
                    "depositedModelExportAtoBReactionOrder": "2.176",
                },
            ],
        },
        "oracle": {
            "dependencies": "python-standard-library-only",
            "importsApplicationSource": False,
            "implementationPath": IMPLEMENTATION_PATH.as_posix(),
        },
        "productionComparisonBoundary": {
            "supported": (
                "Wide-series ingestion can map TG to massPercent and signed "
                "deposited dTG to semantic massChangeRate with explicit "
                "100 and minimum-observed-TG mass anchors. Production Friedman "
                "is compared with DEPOSITED_DTG across all 91 alpha targets."
            ),
            "notClaimed": (
                "Exact Kinetics Neo parity is not claimed because author "
                "preprocessing settings and the .kinx project are not deposited."
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
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    project_root = Path(args.project_root).resolve()
    reference = build_reference(project_root)
    output = canonical_json_bytes(reference)

    output_path: Path | None = None
    if args.write:
        output_path = project_root / EXPECTED_OUTPUT
    elif args.emit_json:
        output_path = Path(args.emit_json)
        if not output_path.is_absolute():
            output_path = project_root / output_path
    if output_path is not None:
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
                    "Recomputed NR-CELS output differs from the locked JSON: "
                    f"computed={sha256_bytes(output)}, "
                    f"expected={sha256_bytes(expected)}"
                ),
            )

    if not args.quiet:
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
