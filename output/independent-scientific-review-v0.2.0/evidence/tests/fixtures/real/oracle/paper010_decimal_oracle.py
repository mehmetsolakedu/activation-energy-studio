#!/usr/bin/env python3
"""Independent Paper 010 real-data oracle.

This program intentionally imports only the Python standard library. It reads
the publisher-supplied XLSX as OOXML, derives the bounded RH
T-alpha-beta-d(alpha)/dt CSV, and evaluates KAS/FWO/Starink/Friedman with
Decimal arithmetic at precision 50. It never imports the application
implementation.

`--check` is read-only. Files are written only when `--emit-csv` and/or
`--emit-json` is supplied explicitly.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import posixpath
import re
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP, getcontext
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence
from zipfile import BadZipFile, ZipFile


DECIMAL_PRECISION = 50
getcontext().prec = DECIMAL_PRECISION

REFERENCE_SCHEMA_V1 = "activation-energy-studio/real-validation-reference/v1"
REFERENCE_SCHEMA_V2 = "activation-energy-studio/real-validation-reference/v2"
MANIFEST_SCHEMA_V2 = "activation-energy-studio/fixture-manifest/v2"

SOURCE_RELATIVE_PATH = (
    "tests/fixtures/real/source/paper010/pone.0173946.s002.xlsx"
)
PUBLICATION_TRANSFORM_RELATIVE_PATH = (
    "tests/fixtures/real/source/paper010/pone.0173946.s004.xlsx"
)
PUBLICATION_RESULT_RELATIVE_PATH = (
    "tests/fixtures/real/source/paper010/pone.0173946.s005.xlsx"
)
FIXTURE_RELATIVE_PATH = "tests/fixtures/real/paper010_rh_t_alpha_beta.csv"
REFERENCE_RELATIVE_PATH = "tests/fixtures/real/paper010_rh_reference.json"
MANIFEST_RELATIVE_PATH = "tests/fixtures/real/manifest.json"
IMPLEMENTATION_RELATIVE_PATH = (
    "tests/fixtures/real/oracle/paper010_decimal_oracle.py"
)

EXPECTED_SOURCE_SHA256 = (
    "d24e218dd8da9646312b122ddc892d1d338783ce2829877145fa298491d99b57"
)
EXPECTED_PUBLICATION_TRANSFORM_SHA256 = (
    "0bed9425e3b8a6195a540d0461f3fca5451d0039db5ccee7c1b7bfcaebaaabdd"
)
EXPECTED_PUBLICATION_RESULT_SHA256 = (
    "f74bc21563263ef43669c41937d842065683e615a4b8d30a6df422caadf89463"
)
EXPECTED_DERIVED_FIXTURE_SHA256 = (
    "a913d8111af91a4fa8a2fc3d1c8dd02ec0e216795dad9bfd77cff4912e76b27d"
)
SOURCE_DOI = "10.1371/journal.pone.0173946.s002"
SOURCE_SHEET = "Fig.2."
PUBLICATION_TRANSFORM_SHEET = "Fig4(A)"
PUBLICATION_RESULT_SHEET = "Fig5"
SOURCE_DATA_START_ROW = 4
SOURCE_SAMPLE = "Rhubarb (RH)"
SOURCE_ATMOSPHERE = "Simulated air (N2:O2=4:1)"

GAS_CONSTANT = Decimal("8.31446261815324")
FWO_SLOPE_COEFFICIENT = Decimal("1.052")
STARINK_SLOPE_COEFFICIENT = Decimal("1.0008")
STARINK_TEMPERATURE_EXPONENT = Decimal("1.92")
CELSIUS_OFFSET = Decimal("273.15")
STUDENT_T_95_DF1 = Decimal("12.706204736")
TEMPERATURE_QUANTUM_C = Decimal("0.000000001")
D_ALPHA_DT_QUANTUM_PER_MINUTE = Decimal("0.000000000001")
PERCENT_TO_FRACTION_DIVISOR = Decimal("100")
LEGACY_ENERGY_ABSOLUTE_TOLERANCE_KJ_PER_MOL = Decimal("0.000005")
EXPECTED_COMPARISON_TOLERANCES = {
    "alphaAbs": Decimal("5e-13"),
    "derivativeAbsPerMinute": Decimal("1e-12"),
    "transformedXYAbs": Decimal("1e-12"),
    "slopeAbsK": Decimal("1e-3"),
    "interceptAbs": Decimal("1e-6"),
    "rSquaredAbs": Decimal("1e-12"),
    "energyAbsKJPerMol": Decimal("5e-6"),
    "energyCiEndpointAbsKJPerMol": Decimal("5e-6"),
    "meanEnergyAbsKJPerMol": Decimal("5e-6"),
}
METHOD_FORMULA_IDS = {
    "FWO": "fwo_doyle_ln_1.052_v1",
    "KAS": "kas_ln_beta_over_t2_v1",
    "STARINK": "starink_ln_beta_over_t1.92_1.0008_v1",
    "FRIEDMAN": "friedman_ln_dalpha_dt_v1",
}
S4_X_COLUMNS = (
    "A",
    "C",
    "E",
    "G",
    "I",
    "K",
    "M",
    "O",
    "Q",
    "S",
    "U",
    "W",
    "Y",
    "AA",
    "AC",
    "AE",
)
S4_Y_COLUMNS = (
    "B",
    "D",
    "F",
    "H",
    "J",
    "L",
    "N",
    "P",
    "R",
    "T",
    "V",
    "X",
    "Z",
    "AB",
    "AD",
    "AF",
)

ALPHA_TARGETS = tuple(Decimal("0.05") * index for index in range(1, 17))


@dataclass(frozen=True)
class ColumnGroup:
    heating_rate: Decimal
    temperature_column: str
    mass_column: str
    dtg_temperature_column: str
    minus_dtg_percent_per_minute_column: str


COLUMN_GROUPS = (
    ColumnGroup(Decimal("5"), "A", "B", "G", "H"),
    ColumnGroup(Decimal("10"), "C", "D", "I", "J"),
    ColumnGroup(Decimal("20"), "E", "F", "K", "L"),
)

SPREADSHEET_NS = (
    "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
)
OFFICE_REL_NS = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
)
PACKAGE_REL_NS = (
    "http://schemas.openxmlformats.org/package/2006/relationships"
)
CELL_REFERENCE = re.compile(r"^([A-Z]+)([1-9][0-9]*)$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


class OracleError(RuntimeError):
    """A deterministic fail-closed oracle error."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class CurvePoint:
    source_row: int
    temperature_c: Decimal
    alpha: Decimal


@dataclass(frozen=True)
class DtgPoint:
    source_row: int
    temperature_c: Decimal
    minus_dtg_percent_per_minute: Decimal


@dataclass(frozen=True)
class Crossing:
    heating_rate: Decimal
    alpha: Decimal
    temperature_c: Decimal
    d_alpha_dt_per_minute: Decimal
    left_source_row: int
    right_source_row: int
    dtg_left_source_row: int
    dtg_right_source_row: int


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    try:
        return sha256_bytes(path.read_bytes())
    except FileNotFoundError as error:
        raise OracleError(
            "ORACLE_REQUIRED_FILE_MISSING",
            f"Required file does not exist: {path}",
        ) from error


def decimal_string(value: Decimal) -> str:
    if not value.is_finite():
        raise OracleError(
            "ORACLE_NONFINITE_DECIMAL",
            f"Non-finite Decimal cannot be serialized: {value}",
        )
    if value.is_zero():
        return "0"
    return format(value.normalize(), "f")


def fixed_decimal_string(value: Decimal, places: int) -> str:
    return format(value, f".{places}f")


def canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
            separators=(",", ": "),
        )
        + "\n"
    ).encode("utf-8")


def resolve_project_path(project_root: Path, candidate: str | Path) -> Path:
    path = Path(candidate)
    if not path.is_absolute():
        path = project_root / path
    return path.resolve()


def normalize_ooxml_target(target: str) -> str:
    portable = target.replace("\\", "/")
    if portable.startswith("/"):
        normalized = posixpath.normpath(portable.lstrip("/"))
    else:
        normalized = posixpath.normpath(posixpath.join("xl", portable))
    if (
        normalized == ".."
        or normalized.startswith("../")
        or not normalized.startswith("xl/")
    ):
        raise OracleError(
            "ORACLE_XLSX_RELATIONSHIP_INVALID",
            f"Unsafe workbook relationship target: {target}",
        )
    return normalized


def parse_xml(data: bytes, member: str) -> ET.Element:
    try:
        return ET.fromstring(data)
    except ET.ParseError as error:
        raise OracleError(
            "ORACLE_XLSX_XML_INVALID",
            f"Invalid XML in XLSX member {member}: {error}",
        ) from error


def worksheet_member_for_name(archive: ZipFile, sheet_name: str) -> str:
    workbook_member = "xl/workbook.xml"
    relationship_member = "xl/_rels/workbook.xml.rels"
    try:
        workbook = parse_xml(
            archive.read(workbook_member),
            workbook_member,
        )
        relationships = parse_xml(
            archive.read(relationship_member),
            relationship_member,
        )
    except KeyError as error:
        raise OracleError(
            "ORACLE_XLSX_STRUCTURE_INVALID",
            f"Required XLSX member is missing: {error}",
        ) from error

    relation_targets: dict[str, str] = {}
    for relation in relationships.findall(f"{{{PACKAGE_REL_NS}}}Relationship"):
        relation_id = relation.attrib.get("Id")
        target = relation.attrib.get("Target")
        if relation_id and target:
            relation_targets[relation_id] = normalize_ooxml_target(target)

    matching_members: list[str] = []
    sheets = workbook.find(f"{{{SPREADSHEET_NS}}}sheets")
    if sheets is None:
        raise OracleError(
            "ORACLE_XLSX_STRUCTURE_INVALID",
            "Workbook has no sheets collection.",
        )
    relationship_id_attribute = f"{{{OFFICE_REL_NS}}}id"
    for sheet in sheets.findall(f"{{{SPREADSHEET_NS}}}sheet"):
        if sheet.attrib.get("name") != sheet_name:
            continue
        relationship_id = sheet.attrib.get(relationship_id_attribute)
        if not relationship_id or relationship_id not in relation_targets:
            raise OracleError(
                "ORACLE_XLSX_RELATIONSHIP_INVALID",
                f"Worksheet {sheet_name!r} has no valid relationship.",
            )
        matching_members.append(relation_targets[relationship_id])

    if len(matching_members) != 1:
        raise OracleError(
            "ORACLE_WORKSHEET_NOT_FOUND",
            (
                f"Expected exactly one worksheet named {sheet_name!r}; "
                f"found {len(matching_members)}."
            ),
        )
    return matching_members[0]


def read_requested_ooxml_cells(
    source_path: Path,
    sheet_name: str,
    requested_references: Iterable[str],
) -> dict[str, Decimal | str]:
    requested = set(requested_references)
    try:
        with ZipFile(source_path) as archive:
            worksheet_member = worksheet_member_for_name(
                archive,
                sheet_name,
            )
            worksheet = parse_xml(
                archive.read(worksheet_member),
                worksheet_member,
            )
            shared_strings: list[str] = []
            shared_member = "xl/sharedStrings.xml"
            if shared_member in archive.namelist():
                shared_root = parse_xml(
                    archive.read(shared_member),
                    shared_member,
                )
                for item in shared_root.findall(
                    f"{{{SPREADSHEET_NS}}}si"
                ):
                    shared_strings.append(
                        "".join(
                            element.text or ""
                            for element in item.iter(
                                f"{{{SPREADSHEET_NS}}}t"
                            )
                        )
                    )
    except BadZipFile as error:
        raise OracleError(
            "ORACLE_XLSX_INVALID",
            f"Source is not a valid XLSX ZIP archive: {source_path}",
        ) from error
    except KeyError as error:
        raise OracleError(
            "ORACLE_XLSX_STRUCTURE_INVALID",
            f"Publication diagnostic worksheet member is missing: {error}",
        ) from error

    values: dict[str, Decimal | str] = {}
    for cell in worksheet.findall(
        f".//{{{SPREADSHEET_NS}}}sheetData/"
        f"{{{SPREADSHEET_NS}}}row/"
        f"{{{SPREADSHEET_NS}}}c"
    ):
        reference = cell.attrib.get("r", "")
        if reference not in requested:
            continue
        if reference in values:
            raise OracleError(
                "ORACLE_XLSX_LAYOUT_MISMATCH",
                f"Duplicate publication diagnostic cell: {reference}",
            )
        if cell.find(f"{{{SPREADSHEET_NS}}}f") is not None:
            raise OracleError(
                "ORACLE_XLSX_LAYOUT_MISMATCH",
                (
                    "Formula cell is not allowed in publication "
                    f"diagnostic data: {reference}"
                ),
            )
        cell_type = cell.attrib.get("t")
        value_element = cell.find(f"{{{SPREADSHEET_NS}}}v")
        if value_element is None or value_element.text is None:
            raise OracleError(
                "ORACLE_XLSX_LAYOUT_MISMATCH",
                f"Publication diagnostic cell is empty: {reference}",
            )
        raw = value_element.text
        if cell_type in {None, "n"}:
            try:
                value: Decimal | str = Decimal(raw)
            except InvalidOperation as error:
                raise OracleError(
                    "ORACLE_XLSX_LAYOUT_MISMATCH",
                    (
                        "Invalid publication diagnostic numeric value "
                        f"in {reference}."
                    ),
                ) from error
            if not value.is_finite():
                raise OracleError(
                    "ORACLE_XLSX_LAYOUT_MISMATCH",
                    (
                        "Non-finite publication diagnostic value in "
                        f"{reference}."
                    ),
                )
        elif cell_type == "s":
            try:
                value = shared_strings[int(raw)]
            except (ValueError, IndexError) as error:
                raise OracleError(
                    "ORACLE_XLSX_LAYOUT_MISMATCH",
                    f"Invalid shared-string index in {reference}.",
                ) from error
        else:
            raise OracleError(
                "ORACLE_XLSX_LAYOUT_MISMATCH",
                (
                    f"Unsupported cell type {cell_type!r} in "
                    f"publication diagnostic cell {reference}."
                ),
            )
        values[reference] = value

    missing = sorted(requested - set(values))
    if missing:
        raise OracleError(
            "ORACLE_XLSX_LAYOUT_MISMATCH",
            (
                "Publication diagnostic cells are missing: "
                + ", ".join(missing)
            ),
        )
    return values


def read_source_cells(source_path: Path) -> dict[tuple[str, int], Decimal]:
    try:
        with ZipFile(source_path) as archive:
            worksheet_member = worksheet_member_for_name(
                archive,
                SOURCE_SHEET,
            )
            try:
                worksheet = parse_xml(
                    archive.read(worksheet_member),
                    worksheet_member,
                )
            except KeyError as error:
                raise OracleError(
                    "ORACLE_XLSX_STRUCTURE_INVALID",
                    f"Worksheet member is missing: {worksheet_member}",
                ) from error
    except BadZipFile as error:
        raise OracleError(
            "ORACLE_XLSX_INVALID",
            f"Source is not a valid XLSX ZIP archive: {source_path}",
        ) from error

    cells: dict[tuple[str, int], Decimal] = {}
    for row in worksheet.findall(
        f".//{{{SPREADSHEET_NS}}}sheetData/"
        f"{{{SPREADSHEET_NS}}}row"
    ):
        row_text = row.attrib.get("r")
        if row_text is None or not row_text.isdigit():
            raise OracleError(
                "ORACLE_XLSX_LAYOUT_MISMATCH",
                "Every source worksheet row must have a numeric row index.",
            )
        row_number = int(row_text)
        if row_number < SOURCE_DATA_START_ROW:
            continue

        for cell in row.findall(f"{{{SPREADSHEET_NS}}}c"):
            reference = cell.attrib.get("r", "")
            match = CELL_REFERENCE.fullmatch(reference)
            if not match:
                raise OracleError(
                    "ORACLE_XLSX_LAYOUT_MISMATCH",
                    f"Invalid cell reference in source worksheet: {reference!r}",
                )
            column = match.group(1)
            cell_row = int(match.group(2))
            if cell_row != row_number:
                raise OracleError(
                    "ORACLE_XLSX_LAYOUT_MISMATCH",
                    (
                        f"Cell {reference} conflicts with containing row "
                        f"{row_number}."
                    ),
                )
            if column not in {
                "A",
                "B",
                "C",
                "D",
                "E",
                "F",
                "G",
                "H",
                "I",
                "J",
                "K",
                "L",
            }:
                continue
            if cell.find(f"{{{SPREADSHEET_NS}}}f") is not None:
                raise OracleError(
                    "ORACLE_XLSX_LAYOUT_MISMATCH",
                    f"Formula cell is not allowed in source data: {reference}",
                )
            cell_type = cell.attrib.get("t")
            if cell_type not in {None, "n"}:
                raise OracleError(
                    "ORACLE_XLSX_LAYOUT_MISMATCH",
                    (
                        f"Non-numeric cell type {cell_type!r} is not allowed "
                        f"in source data cell {reference}."
                    ),
                )
            value_element = cell.find(f"{{{SPREADSHEET_NS}}}v")
            if value_element is None or value_element.text is None:
                raise OracleError(
                    "ORACLE_XLSX_LAYOUT_MISMATCH",
                    f"Source data cell has no numeric value: {reference}",
                )
            try:
                value = Decimal(value_element.text)
            except InvalidOperation as error:
                raise OracleError(
                    "ORACLE_XLSX_LAYOUT_MISMATCH",
                    f"Invalid numeric value in source cell {reference}.",
                ) from error
            if not value.is_finite():
                raise OracleError(
                    "ORACLE_XLSX_LAYOUT_MISMATCH",
                    f"Non-finite value in source cell {reference}.",
                )
            key = (column, row_number)
            if key in cells:
                raise OracleError(
                    "ORACLE_XLSX_LAYOUT_MISMATCH",
                    f"Duplicate source cell: {reference}",
                )
            cells[key] = value

    if len(cells) != 6864:
        raise OracleError(
            "ORACLE_XLSX_LAYOUT_MISMATCH",
            (
                "Expected 6864 numeric cells in Fig.2. columns A:L from "
                f"row {SOURCE_DATA_START_ROW}; found {len(cells)}."
            ),
        )
    return cells


def build_curve(
    cells: Mapping[tuple[str, int], Decimal],
    group: ColumnGroup,
) -> tuple[CurvePoint, ...]:
    row_numbers = sorted(
        {
            row
            for column, row in cells
            if column in {group.temperature_column, group.mass_column}
        }
    )
    curve: list[CurvePoint] = []
    for row in row_numbers:
        temperature = cells.get((group.temperature_column, row))
        mass_percent = cells.get((group.mass_column, row))
        if temperature is None or mass_percent is None:
            raise OracleError(
                "ORACLE_XLSX_LAYOUT_MISMATCH",
                (
                    f"Incomplete {group.temperature_column}:"
                    f"{group.mass_column} source pair at row {row}."
                ),
            )
        if temperature <= 0:
            continue
        curve.append(
            CurvePoint(
                source_row=row,
                temperature_c=temperature,
                alpha=Decimal(1) - mass_percent / Decimal(100),
            )
        )

    if len(curve) < 2:
        raise OracleError(
            "ORACLE_XLSX_LAYOUT_MISMATCH",
            (
                f"Heating rate {decimal_string(group.heating_rate)} has "
                "fewer than two usable source points."
            ),
        )
    for left, right in zip(curve, curve[1:]):
        if not left.temperature_c < right.temperature_c:
            raise OracleError(
                "ORACLE_XLSX_LAYOUT_MISMATCH",
                (
                    "Source temperatures must be strictly increasing for "
                    f"heating rate {decimal_string(group.heating_rate)}; "
                    f"rows {left.source_row} and {right.source_row} violate "
                    "that requirement."
                ),
            )
    return tuple(curve)


def build_dtg_curve(
    cells: Mapping[tuple[str, int], Decimal],
    group: ColumnGroup,
) -> tuple[DtgPoint, ...]:
    row_numbers = sorted(
        {
            row
            for column, row in cells
            if column
            in {
                group.dtg_temperature_column,
                group.minus_dtg_percent_per_minute_column,
            }
        }
    )
    curve: list[DtgPoint] = []
    for row in row_numbers:
        temperature = cells.get((group.dtg_temperature_column, row))
        minus_dtg = cells.get(
            (group.minus_dtg_percent_per_minute_column, row)
        )
        if temperature is None or minus_dtg is None:
            raise OracleError(
                "ORACLE_XLSX_LAYOUT_MISMATCH",
                (
                    f"Incomplete {group.dtg_temperature_column}:"
                    f"{group.minus_dtg_percent_per_minute_column} "
                    f"source pair at row {row}."
                ),
            )
        if temperature <= 0:
            continue
        curve.append(
            DtgPoint(
                source_row=row,
                temperature_c=temperature,
                minus_dtg_percent_per_minute=minus_dtg,
            )
        )

    if len(curve) < 2:
        raise OracleError(
            "ORACLE_XLSX_LAYOUT_MISMATCH",
            (
                f"Heating rate {decimal_string(group.heating_rate)} has "
                "fewer than two usable -DTG source points."
            ),
        )
    for left, right in zip(curve, curve[1:]):
        if not left.temperature_c < right.temperature_c:
            raise OracleError(
                "ORACLE_XLSX_LAYOUT_MISMATCH",
                (
                    "-DTG source temperatures must be strictly increasing "
                    f"for heating rate {decimal_string(group.heating_rate)}; "
                    f"rows {left.source_row} and {right.source_row} violate "
                    "that requirement."
                ),
            )
    return tuple(curve)


def interpolate_d_alpha_dt(
    curve: Sequence[DtgPoint],
    group: ColumnGroup,
    temperature_c: Decimal,
) -> tuple[Decimal, int, int]:
    for left, right in zip(curve, curve[1:]):
        if left.temperature_c <= temperature_c <= right.temperature_c:
            fraction = (
                (temperature_c - left.temperature_c)
                / (right.temperature_c - left.temperature_c)
            )
            minus_dtg = (
                left.minus_dtg_percent_per_minute
                + fraction
                * (
                    right.minus_dtg_percent_per_minute
                    - left.minus_dtg_percent_per_minute
                )
            )
            derivative = (
                minus_dtg / PERCENT_TO_FRACTION_DIVISOR
            ).quantize(
                D_ALPHA_DT_QUANTUM_PER_MINUTE,
                rounding=ROUND_HALF_UP,
            )
            if not derivative.is_finite() or derivative <= 0:
                raise OracleError(
                    "ORACLE_FRIEDMAN_DERIVATIVE_INVALID",
                    (
                        "Interpolated d(alpha)/dt must be finite and "
                        "positive for Friedman; found "
                        f"{decimal_string(derivative)} at "
                        f"{decimal_string(temperature_c)} degC and "
                        f"{decimal_string(group.heating_rate)} K/min."
                    ),
                )
            return derivative, left.source_row, right.source_row
    raise OracleError(
        "ORACLE_DTG_INTERPOLATION_NOT_FOUND",
        (
            "No -DTG interpolation bracket for "
            f"{decimal_string(temperature_c)} degC at "
            f"{decimal_string(group.heating_rate)} K/min."
        ),
    )


def first_crossing(
    curve: Sequence[CurvePoint],
    dtg_curve: Sequence[DtgPoint],
    group: ColumnGroup,
    target_alpha: Decimal,
) -> Crossing:
    for left, right in zip(curve, curve[1:]):
        if (
            left.alpha <= target_alpha <= right.alpha
            and left.alpha != right.alpha
        ):
            fraction = (
                (target_alpha - left.alpha)
                / (right.alpha - left.alpha)
            )
            temperature = (
                left.temperature_c
                + fraction * (right.temperature_c - left.temperature_c)
            )
            temperature = temperature.quantize(
                TEMPERATURE_QUANTUM_C,
                rounding=ROUND_HALF_UP,
            )
            (
                derivative,
                dtg_left_source_row,
                dtg_right_source_row,
            ) = interpolate_d_alpha_dt(
                dtg_curve,
                group,
                temperature,
            )
            return Crossing(
                heating_rate=group.heating_rate,
                alpha=target_alpha,
                temperature_c=temperature,
                d_alpha_dt_per_minute=derivative,
                left_source_row=left.source_row,
                right_source_row=right.source_row,
                dtg_left_source_row=dtg_left_source_row,
                dtg_right_source_row=dtg_right_source_row,
            )
    raise OracleError(
        "ORACLE_ALPHA_CROSSING_NOT_FOUND",
        (
            f"No first crossing for alpha={decimal_string(target_alpha)} at "
            f"heating rate {decimal_string(group.heating_rate)} K/min."
        ),
    )


def derive_crossings(
    cells: Mapping[tuple[str, int], Decimal],
) -> tuple[Crossing, ...]:
    crossings: list[Crossing] = []
    for group in COLUMN_GROUPS:
        curve = build_curve(cells, group)
        dtg_curve = build_dtg_curve(cells, group)
        for alpha in ALPHA_TARGETS:
            crossings.append(
                first_crossing(curve, dtg_curve, group, alpha)
            )
    if len(crossings) != 48:
        raise OracleError(
            "ORACLE_DERIVATION_COUNT_MISMATCH",
            f"Expected 48 derived observations; found {len(crossings)}.",
        )
    return tuple(crossings)


def derived_csv_bytes(crossings: Sequence[Crossing]) -> bytes:
    header = (
        "Temperature [°C]",
        "Alpha [0-1]",
        "dAlpha/dt [1/min]",
        "Mass percent [%]",
        "Heating rate [K/min]",
        "Run",
        "Sample",
        "Atmosphere",
    )
    rows = [",".join(header)]
    for crossing in crossings:
        rate = decimal_string(crossing.heating_rate)
        rows.append(
            ",".join(
                (
                    fixed_decimal_string(crossing.temperature_c, 9),
                    fixed_decimal_string(crossing.alpha, 2),
                    fixed_decimal_string(
                        crossing.d_alpha_dt_per_minute,
                        12,
                    ),
                    fixed_decimal_string(
                        Decimal(100) * (Decimal(1) - crossing.alpha),
                        2,
                    ),
                    rate,
                    f"paper010-rh-{rate}",
                    SOURCE_SAMPLE,
                    SOURCE_ATMOSPHERE,
                )
            )
        )
    return ("\n".join(rows) + "\n").encode("utf-8")


def ordinary_least_squares(
    x_values: Sequence[Decimal],
    y_values: Sequence[Decimal],
) -> dict[str, Any]:
    if len(x_values) != len(y_values) or len(x_values) != 3:
        raise OracleError(
            "ORACLE_REGRESSION_INPUT_INVALID",
            "Paper 010 oracle OLS requires exactly three paired inputs.",
        )
    count = Decimal(len(x_values))
    mean_x = sum(x_values, Decimal(0)) / count
    mean_y = sum(y_values, Decimal(0)) / count
    sxx = sum((value - mean_x) ** 2 for value in x_values)
    sxy = sum(
        (x_value - mean_x) * (y_value - mean_y)
        for x_value, y_value in zip(x_values, y_values)
    )
    syy = sum((value - mean_y) ** 2 for value in y_values)
    if sxx <= 0 or syy <= 0:
        raise OracleError(
            "ORACLE_REGRESSION_DEGENERATE",
            "Paper 010 transformed OLS inputs are degenerate.",
        )
    slope = sxy / sxx
    intercept = mean_y - slope * mean_x
    fitted = tuple(intercept + slope * value for value in x_values)
    residuals = tuple(
        observed - predicted
        for observed, predicted in zip(y_values, fitted)
    )
    sse = sum((value ** 2 for value in residuals), Decimal(0))
    residual_standard_error = sse.sqrt()
    slope_standard_error = residual_standard_error / sxx.sqrt()
    margin = STUDENT_T_95_DF1 * slope_standard_error
    return {
        "n": 3,
        "residualDegreesOfFreedom": 1,
        "x": [decimal_string(value) for value in x_values],
        "y": [decimal_string(value) for value in y_values],
        "slope": decimal_string(slope),
        "intercept": decimal_string(intercept),
        "fitted": [decimal_string(value) for value in fitted],
        "residuals": [decimal_string(value) for value in residuals],
        "sse": decimal_string(sse),
        "rSquared": decimal_string(Decimal(1) - sse / syy),
        "residualStandardError": decimal_string(
            residual_standard_error
        ),
        "slopeStandardError": decimal_string(slope_standard_error),
        "slopeConfidence95": [
            decimal_string(slope - margin),
            decimal_string(slope + margin),
        ],
    }


def required_decimal_cell(
    cells: Mapping[str, Decimal | str],
    reference: str,
) -> Decimal:
    value = cells[reference]
    if not isinstance(value, Decimal):
        raise OracleError(
            "ORACLE_XLSX_LAYOUT_MISMATCH",
            f"Expected numeric publication diagnostic cell {reference}.",
        )
    return value


def required_text_cell(
    cells: Mapping[str, Decimal | str],
    reference: str,
    expected: str,
) -> None:
    value = cells[reference]
    if value != expected:
        raise OracleError(
            "ORACLE_XLSX_LAYOUT_MISMATCH",
            (
                f"Publication diagnostic cell {reference} must equal "
                f"{expected!r}; found {value!r}."
            ),
        )


def decimal_mean(values: Sequence[Decimal]) -> Decimal:
    if not values:
        raise OracleError(
            "ORACLE_PUBLICATION_DIAGNOSTIC_INVALID",
            "Cannot calculate a mean over an empty sequence.",
        )
    return sum(values, Decimal(0)) / Decimal(len(values))


def pearson_correlation(
    left: Sequence[Decimal],
    right: Sequence[Decimal],
) -> Decimal:
    if len(left) != len(right) or len(left) < 2:
        raise OracleError(
            "ORACLE_PUBLICATION_DIAGNOSTIC_INVALID",
            "Pearson correlation requires paired non-empty vectors.",
        )
    mean_left = decimal_mean(left)
    mean_right = decimal_mean(right)
    covariance_sum = sum(
        (
            (left_value - mean_left)
            * (right_value - mean_right)
        )
        for left_value, right_value in zip(left, right)
    )
    left_sum = sum(
        (value - mean_left) ** 2 for value in left
    )
    right_sum = sum(
        (value - mean_right) ** 2 for value in right
    )
    if left_sum <= 0 or right_sum <= 0:
        raise OracleError(
            "ORACLE_PUBLICATION_DIAGNOSTIC_INVALID",
            "Pearson correlation vectors are degenerate.",
        )
    return covariance_sum / (left_sum * right_sum).sqrt()


def root_mean_square_difference(
    left: Sequence[Decimal],
    right: Sequence[Decimal],
) -> Decimal:
    if len(left) != len(right) or not left:
        raise OracleError(
            "ORACLE_PUBLICATION_DIAGNOSTIC_INVALID",
            "RMSE requires paired non-empty vectors.",
        )
    return (
        sum(
            (left_value - right_value) ** 2
            for left_value, right_value in zip(left, right)
        )
        / Decimal(len(left))
    ).sqrt()


def build_friedman_publication_diagnostic(
    crossings: Sequence[Crossing],
    transform_source_path: Path,
    result_source_path: Path,
) -> dict[str, Any]:
    transform_references = {
        f"{column}2"
        for column in (*S4_X_COLUMNS, *S4_Y_COLUMNS)
    }
    transform_references.update(
        f"{column}{row}"
        for column in (*S4_X_COLUMNS, *S4_Y_COLUMNS)
        for row in (3, 4, 5)
    )
    transform_cells = read_requested_ooxml_cells(
        transform_source_path,
        PUBLICATION_TRANSFORM_SHEET,
        transform_references,
    )
    for x_column, y_column in zip(S4_X_COLUMNS, S4_Y_COLUMNS):
        required_text_cell(
            transform_cells,
            f"{x_column}2",
            "1/T",
        )
        required_text_cell(
            transform_cells,
            f"{y_column}2",
            "lnda/dt",
        )

    result_references = {"A3", "B3"}
    result_references.update(
        f"{column}{row}"
        for column in ("A", "B")
        for row in range(4, 20)
    )
    result_cells = read_requested_ooxml_cells(
        result_source_path,
        PUBLICATION_RESULT_SHEET,
        result_references,
    )
    required_text_cell(result_cells, "A3", "conversion")
    required_text_cell(result_cells, "B3", "E")
    publication_alphas = tuple(
        required_decimal_cell(result_cells, f"A{row}")
        for row in range(4, 20)
    )
    normalized_publication_alphas = tuple(
        value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        for value in publication_alphas
    )
    if (
        normalized_publication_alphas != ALPHA_TARGETS
        or any(
            abs(observed - expected) > Decimal("1e-12")
            for observed, expected in zip(
                publication_alphas,
                ALPHA_TARGETS,
            )
        )
    ):
        raise OracleError(
            "ORACLE_PUBLICATION_DIAGNOSTIC_INVALID",
            "S5 RH Friedman alpha grid does not match the oracle grid.",
        )
    publication_energies = tuple(
        required_decimal_cell(result_cells, f"B{row}")
        for row in range(4, 20)
    )

    by_alpha: dict[Decimal, list[Crossing]] = {
        alpha: [] for alpha in ALPHA_TARGETS
    }
    for crossing in crossings:
        by_alpha[crossing.alpha].append(crossing)
    for values in by_alpha.values():
        values.sort(key=lambda item: item.heating_rate)

    equation_correct_energies: list[Decimal] = []
    exact_raw_signal_energies: list[Decimal] = []
    stored_s4_energies: list[Decimal] = []
    stored_s4_ordinates: list[Decimal] = []
    exact_raw_ordinates: list[Decimal] = []
    records: list[dict[str, Any]] = []
    for index, alpha in enumerate(ALPHA_TARGETS):
        alpha_crossings = by_alpha[alpha]
        if len(alpha_crossings) != 3:
            raise OracleError(
                "ORACLE_PUBLICATION_DIAGNOSTIC_INVALID",
                (
                    "Expected three S2 observations for publication "
                    f"diagnostic alpha={decimal_string(alpha)}."
                ),
            )
        exact_x = tuple(
            Decimal(1)
            / (crossing.temperature_c + CELSIUS_OFFSET)
            for crossing in alpha_crossings
        )
        exact_d_alpha_dt = tuple(
            crossing.d_alpha_dt_per_minute
            for crossing in alpha_crossings
        )
        exact_raw_minus_dtg = tuple(
            value * PERCENT_TO_FRACTION_DIVISOR
            for value in exact_d_alpha_dt
        )
        correct_regression = ordinary_least_squares(
            exact_x,
            tuple(value.ln() for value in exact_d_alpha_dt),
        )
        exact_raw_regression = ordinary_least_squares(
            exact_x,
            exact_raw_minus_dtg,
        )
        s4_x_column = S4_X_COLUMNS[index]
        s4_y_column = S4_Y_COLUMNS[index]
        s4_x = tuple(
            required_decimal_cell(
                transform_cells,
                f"{s4_x_column}{row}",
            )
            for row in (3, 4, 5)
        )
        s4_y = tuple(
            required_decimal_cell(
                transform_cells,
                f"{s4_y_column}{row}",
            )
            for row in (3, 4, 5)
        )
        s4_regression = ordinary_least_squares(s4_x, s4_y)

        correct_energy = (
            -Decimal(correct_regression["slope"])
            * GAS_CONSTANT
            / Decimal(1000)
        )
        exact_raw_energy = (
            -Decimal(exact_raw_regression["slope"])
            * GAS_CONSTANT
            / Decimal(1000)
        )
        s4_energy = (
            -Decimal(s4_regression["slope"])
            * GAS_CONSTANT
            / Decimal(1000)
        )
        equation_correct_energies.append(correct_energy)
        exact_raw_signal_energies.append(exact_raw_energy)
        stored_s4_energies.append(s4_energy)
        stored_s4_ordinates.extend(s4_y)
        exact_raw_ordinates.extend(exact_raw_minus_dtg)
        records.append(
            {
                "alpha": decimal_string(alpha),
                "equationCorrectEnergyKJPerMol": decimal_string(
                    correct_energy
                ),
                "nonstandardExactRawSignalEnergyKJPerMol": (
                    decimal_string(exact_raw_energy)
                ),
                "nonstandardStoredS4EnergyKJPerMol": decimal_string(
                    s4_energy
                ),
                "publishedS5EnergyKJPerMol": decimal_string(
                    publication_energies[index]
                ),
                "s4StoredX": [
                    decimal_string(value) for value in s4_x
                ],
                "s4StoredLabeledLnDaDt": [
                    decimal_string(value) for value in s4_y
                ],
                "s2ExactMinusDtgPercentPerMinute": [
                    decimal_string(value)
                    for value in exact_raw_minus_dtg
                ],
            }
        )

    logged_raw_ordinates = [
        value.ln() for value in exact_raw_ordinates
    ]
    logged_fraction_ordinates = [
        (value / PERCENT_TO_FRACTION_DIVISOR).ln()
        for value in exact_raw_ordinates
    ]
    exact_raw_deltas = [
        calculated - published
        for calculated, published in zip(
            exact_raw_signal_energies,
            publication_energies,
        )
    ]
    stored_s4_deltas = [
        calculated - published
        for calculated, published in zip(
            stored_s4_energies,
            publication_energies,
        )
    ]
    return {
        "status": "PUBLICATION_REPRODUCTION_DIAGNOSTIC_NONSTANDARD",
        "diagnosticOnly": True,
        "acceptedAsEquationCorrectFriedman": False,
        "transformSource": {
            "path": PUBLICATION_TRANSFORM_RELATIVE_PATH,
            "sha256": EXPECTED_PUBLICATION_TRANSFORM_SHA256,
            "sheet": PUBLICATION_TRANSFORM_SHEET,
            "range": "A2:AF5",
        },
        "resultSource": {
            "path": PUBLICATION_RESULT_RELATIVE_PATH,
            "sha256": EXPECTED_PUBLICATION_RESULT_SHA256,
            "sheet": PUBLICATION_RESULT_SHEET,
            "range": "A3:B19",
        },
        "equationCorrectMeanKJPerMol": decimal_string(
            decimal_mean(equation_correct_energies)
        ),
        "nonstandardExactS2RawSignalMeanKJPerMol": decimal_string(
            decimal_mean(exact_raw_signal_energies)
        ),
        "nonstandardStoredS4MeanKJPerMol": decimal_string(
            decimal_mean(stored_s4_energies)
        ),
        "publishedS5MeanKJPerMol": decimal_string(
            decimal_mean(publication_energies)
        ),
        "correlationWithPublishedS5": {
            "equationCorrect": decimal_string(
                pearson_correlation(
                    equation_correct_energies,
                    publication_energies,
                )
            ),
            "nonstandardExactS2RawSignal": decimal_string(
                pearson_correlation(
                    exact_raw_signal_energies,
                    publication_energies,
                )
            ),
            "nonstandardStoredS4": decimal_string(
                pearson_correlation(
                    stored_s4_energies,
                    publication_energies,
                )
            ),
        },
        "rmseAgainstPublishedS5KJPerMol": {
            "equationCorrect": decimal_string(
                root_mean_square_difference(
                    equation_correct_energies,
                    publication_energies,
                )
            ),
            "nonstandardExactS2RawSignal": decimal_string(
                root_mean_square_difference(
                    exact_raw_signal_energies,
                    publication_energies,
                )
            ),
            "nonstandardStoredS4": decimal_string(
                root_mean_square_difference(
                    stored_s4_energies,
                    publication_energies,
                )
            ),
        },
        "meanDeltaFromPublishedS5KJPerMol": {
            "nonstandardExactS2RawSignal": decimal_string(
                decimal_mean(exact_raw_deltas)
            ),
            "nonstandardStoredS4": decimal_string(
                decimal_mean(stored_s4_deltas)
            ),
        },
        "s4LabeledOrdinateRmse": {
            "versusS2RawMinusDtgPercentPerMinute": decimal_string(
                root_mean_square_difference(
                    stored_s4_ordinates,
                    exact_raw_ordinates,
                )
            ),
            "versusLnS2RawMinusDtg": decimal_string(
                root_mean_square_difference(
                    stored_s4_ordinates,
                    logged_raw_ordinates,
                )
            ),
            "versusLnS2FractionPerMinute": decimal_string(
                root_mean_square_difference(
                    stored_s4_ordinates,
                    logged_fraction_ordinates,
                )
            ),
        },
        "inferenceBoundary": (
            "S4 cells labeled lnda/dt track the unlogged S2 -DTG "
            "ordinate far more closely than either logarithmic form. "
            "Using the exact S2 raw signal as if it were already the "
            "Friedman log ordinate nearly reproduces S5, but this "
            "nonstandard path is negative methodology evidence only."
        ),
        "records": records,
    }


def energy_from_slope(method: str, slope: Decimal) -> Decimal:
    if method == "FWO":
        coefficient = FWO_SLOPE_COEFFICIENT
    elif method == "STARINK":
        coefficient = STARINK_SLOPE_COEFFICIENT
    elif method in {"KAS", "FRIEDMAN"}:
        coefficient = Decimal(1)
    else:
        raise OracleError(
            "ORACLE_METHOD_UNSUPPORTED",
            f"Unsupported Paper 010 oracle method: {method}",
        )
    return -slope * GAS_CONSTANT / coefficient / Decimal(1000)


def method_record(
    method: str,
    alpha: Decimal,
    crossings: Sequence[Crossing],
) -> dict[str, Any]:
    temperatures_k = tuple(
        crossing.temperature_c + CELSIUS_OFFSET
        for crossing in crossings
    )
    x_values = tuple(Decimal(1) / value for value in temperatures_k)
    if method == "KAS":
        y_values = tuple(
            (
                crossing.heating_rate
                / (temperature_k * temperature_k)
            ).ln()
            for crossing, temperature_k in zip(
                crossings,
                temperatures_k,
            )
        )
    elif method == "FWO":
        y_values = tuple(
            crossing.heating_rate.ln()
            for crossing in crossings
        )
    elif method == "STARINK":
        y_values = tuple(
            crossing.heating_rate.ln()
            - STARINK_TEMPERATURE_EXPONENT * temperature_k.ln()
            for crossing, temperature_k in zip(
                crossings,
                temperatures_k,
            )
        )
    elif method == "FRIEDMAN":
        y_values = tuple(
            crossing.d_alpha_dt_per_minute.ln()
            for crossing in crossings
        )
    else:
        raise OracleError(
            "ORACLE_METHOD_UNSUPPORTED",
            f"Unsupported Paper 010 oracle method: {method}",
        )

    regression = ordinary_least_squares(x_values, y_values)
    slope = Decimal(regression["slope"])
    slope_confidence = tuple(
        Decimal(value)
        for value in regression["slopeConfidence95"]
    )
    energy = energy_from_slope(method, slope)
    energy_confidence = sorted(
        energy_from_slope(method, endpoint)
        for endpoint in slope_confidence
    )
    return {
        "alpha": decimal_string(alpha),
        "activationEnergyKJPerMol": decimal_string(energy),
        "energyConfidence95KJPerMol": [
            decimal_string(value)
            for value in energy_confidence
        ],
        "regression": regression,
    }


def build_reference(
    crossings: Sequence[Crossing],
    source_sha256: str,
    fixture_sha256: str,
    implementation_sha256: str,
    friedman_publication_diagnostic: Mapping[str, Any],
) -> dict[str, Any]:
    by_alpha: dict[Decimal, list[Crossing]] = {
        alpha: [] for alpha in ALPHA_TARGETS
    }
    for crossing in crossings:
        by_alpha[crossing.alpha].append(crossing)
    for alpha, observations in by_alpha.items():
        observations.sort(key=lambda item: item.heating_rate)
        if [item.heating_rate for item in observations] != [
            group.heating_rate for group in COLUMN_GROUPS
        ]:
            raise OracleError(
                "ORACLE_DERIVATION_GROUP_MISMATCH",
                (
                    "Unexpected heating-rate group for alpha="
                    f"{decimal_string(alpha)}."
                ),
            )

    methods: dict[str, Any] = {}
    compatibility_expected: dict[str, list[str]] = {}
    compatibility_means: dict[str, str] = {}
    for method in ("KAS", "FWO", "STARINK", "FRIEDMAN"):
        records = [
            method_record(method, alpha, by_alpha[alpha])
            for alpha in ALPHA_TARGETS
        ]
        energies = [
            Decimal(record["activationEnergyKJPerMol"])
            for record in records
        ]
        mean_energy = (
            sum(energies, Decimal(0)) / Decimal(len(energies))
        )
        formulas = {
            "KAS": (
                "x=1/T_K; y=ln(beta/T_K^2); "
                "Ea=-slope*R/1000"
            ),
            "FWO": (
                "x=1/T_K; y=ln(beta); "
                "Ea=-slope*R/(1.052*1000)"
            ),
            "STARINK": (
                "x=1/T_K; y=ln(beta/T_K^1.92); "
                "Ea=-slope*R/(1.0008*1000)"
            ),
            "FRIEDMAN": (
                "x=1/T_K; y=ln(dAlpha/dt_per_minute); "
                "Ea=-slope*R/1000"
            ),
        }
        methods[method] = {
            "formulaId": METHOD_FORMULA_IDS[method],
            "formula": formulas[method],
            "records": records,
            "meanActivationEnergyKJPerMol": decimal_string(mean_energy),
            "validationStatus": (
                "official_s2_supplied_minus_dtg_conditional"
                if method == "FRIEDMAN"
                else "official_s2_raw_tg_decimal_oracle"
            ),
            **(
                {
                    "derivativeEstimatorId": (
                        "piecewise_linear_official_minus_dtg_v1"
                    ),
                    "derivativeUnit": "min^-1",
                    "applicationDerivativeSource": "provided",
                    "uncertaintyBoundary": (
                        "OLS confidence intervals exclude source DTG, "
                        "interpolation, preprocessing, and experimental "
                        "uncertainty."
                    ),
                }
                if method == "FRIEDMAN"
                else {}
            ),
        }
        compatibility_expected[method] = [
            record["activationEnergyKJPerMol"]
            for record in records
        ]
        compatibility_means[method] = decimal_string(mean_energy)

    observations_by_alpha = []
    for alpha in ALPHA_TARGETS:
        observations_by_alpha.append(
            {
                "alpha": decimal_string(alpha),
                "rates": [
                    {
                        "heatingRateKPerMin": decimal_string(
                            crossing.heating_rate
                        ),
                        "temperatureC": decimal_string(
                            crossing.temperature_c
                        ),
                        "temperatureK": decimal_string(
                            crossing.temperature_c + CELSIUS_OFFSET
                        ),
                        "dAlphaDtPerMinute": decimal_string(
                            crossing.d_alpha_dt_per_minute
                        ),
                        "leftSourceRow": crossing.left_source_row,
                        "rightSourceRow": crossing.right_source_row,
                        "dtgLeftSourceRow": (
                            crossing.dtg_left_source_row
                        ),
                        "dtgRightSourceRow": (
                            crossing.dtg_right_source_row
                        ),
                    }
                    for crossing in by_alpha[alpha]
                ],
            }
        )

    return {
        "schema": REFERENCE_SCHEMA_V2,
        "oracle": {
            "implementation": IMPLEMENTATION_RELATIVE_PATH,
            "implementationSha256": implementation_sha256,
            "language": "Python >=3.9",
            "dependencies": "standard-library-only",
            "isolatedExecutionFlags": ["-I", "-S"],
            "decimalPrecision": DECIMAL_PRECISION,
            "rounding": "ROUND_HALF_UP",
            "importsApplicationSource": False,
        },
        "source": {
            "doi": SOURCE_DOI,
            "path": SOURCE_RELATIVE_PATH,
            "sha256": source_sha256,
            "sheet": SOURCE_SHEET,
            "dataStartRow": SOURCE_DATA_START_ROW,
            "sample": SOURCE_SAMPLE,
            "atmosphere": SOURCE_ATMOSPHERE,
            "columnGroups": [
                {
                    "heatingRateKPerMin": decimal_string(
                        group.heating_rate
                    ),
                    "temperatureColumn": group.temperature_column,
                    "massPercentColumn": group.mass_column,
                    "dtgTemperatureColumn": (
                        group.dtg_temperature_column
                    ),
                    "minusDtgPercentPerMinuteColumn": (
                        group.minus_dtg_percent_per_minute_column
                    ),
                }
                for group in COLUMN_GROUPS
            ],
            "publicationDiagnosticSources": [
                {
                    "path": PUBLICATION_TRANSFORM_RELATIVE_PATH,
                    "sha256": (
                        EXPECTED_PUBLICATION_TRANSFORM_SHA256
                    ),
                    "sheet": PUBLICATION_TRANSFORM_SHEET,
                    "range": "A2:AF5",
                    "role": "labeled_transformed_ordinates",
                },
                {
                    "path": PUBLICATION_RESULT_RELATIVE_PATH,
                    "sha256": EXPECTED_PUBLICATION_RESULT_SHA256,
                    "sheet": PUBLICATION_RESULT_SHEET,
                    "range": "A3:B19",
                    "role": "published_friedman_results",
                },
            ],
        },
        "reduction": {
            "alphaDefinition": "1 - massPercent/100",
            "alphaSemanticLabel": (
                "initial-normalized mass-loss fraction"
            ),
            "stageNormalizedConversion": False,
            "crossingRule": (
                "first piecewise-linear upward crossing in ascending "
                "source temperature order"
            ),
            "alphaTargets": [
                decimal_string(value) for value in ALPHA_TARGETS
            ],
            "temperatureCQuantization": decimal_string(
                TEMPERATURE_QUANTUM_C
            ),
            "temperatureCRounding": "ROUND_HALF_UP",
            "derivativeRule": (
                "piecewise-linear interpolation of the official Fig.2. "
                "-DTG ordinate at quantized T_alpha; "
                "dAlpha/dt=(-DTG percent per minute)/100"
            ),
            "derivativeSourceColumns": "G:H, I:J, K:L",
            "derivativeInputUnit": "percent per minute",
            "derivativeOutputUnit": "min^-1",
            "derivativeSignConvention": (
                "published ordinate is -DTG, a positive mass-loss rate"
            ),
            "dAlphaDtPerMinuteQuantization": decimal_string(
                D_ALPHA_DT_QUANTUM_PER_MINUTE
            ),
            "dAlphaDtPerMinuteRounding": "ROUND_HALF_UP",
            "derivedFixturePath": FIXTURE_RELATIVE_PATH,
            "derivedFixtureSha256": fixture_sha256,
            "derivedRowCount": len(crossings),
        },
        "constants": {
            "gasConstantJPerMolK": decimal_string(GAS_CONSTANT),
            "fwoSlopeCoefficient": decimal_string(
                FWO_SLOPE_COEFFICIENT
            ),
            "starinkSlopeCoefficient": decimal_string(
                STARINK_SLOPE_COEFFICIENT
            ),
            "starinkTemperatureExponent": decimal_string(
                STARINK_TEMPERATURE_EXPONENT
            ),
            "celsiusOffsetK": decimal_string(CELSIUS_OFFSET),
            "studentT95Df1": decimal_string(STUDENT_T_95_DF1),
        },
        "observationsByAlpha": observations_by_alpha,
        "methods": methods,
        "publicationComparison": {
            "status": (
                "not_reproduced_from_raw_without_undocumented_"
                "preprocessing"
            ),
            "publishedMeansKJPerMol": {
                "FRIEDMAN": "358.47",
                "KAS": "106.28",
                "FWO": "110.36",
            },
            "unreportedByPublication": ["STARINK"],
            "friedmanDiagnostic": friedman_publication_diagnostic,
            "rawDataBoundary": (
                "The oracle uses official S2 TG and -DTG values directly "
                "and does not assume undocumented S4 transformations or "
                "preprocessing."
            ),
            "valuesAreContextNotOracle": True,
        },
        "replicateCoverage": (
            "One published curve per heating rate is identifiable in S2. "
            "The article reports duplicate experiments, but separate "
            "replicate curves are not identifiable in this workbook."
        ),
        # Compatibility vectors keep the application-side comparison small
        # while all transformed inputs and regression diagnostics remain in
        # `methods`.
        "sourceDoi": SOURCE_DOI,
        "sourceSha256": source_sha256,
        "derivedFixtureSha256": fixture_sha256,
        "heatingRatesKPerMin": [
            decimal_string(group.heating_rate)
            for group in COLUMN_GROUPS
        ],
        "alphaValues": [
            decimal_string(value) for value in ALPHA_TARGETS
        ],
        "gasConstantJPerMolK": decimal_string(GAS_CONSTANT),
        "expected": compatibility_expected,
        "expectedMeansKJPerMol": compatibility_means,
        "publishedMeansKJPerMol": {
            "FRIEDMAN": "358.47",
            "KAS": "106.28",
            "FWO": "110.36",
        },
        "publicationComparisonStatus": (
            "not_reproduced_from_raw_without_undocumented_preprocessing"
        ),
    }


def parse_json_file(path: Path, code: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise OracleError(
            "ORACLE_REQUIRED_FILE_MISSING",
            f"Required file does not exist: {path}",
        ) from error
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise OracleError(
            code,
            f"Invalid JSON file {path}: {error}",
        ) from error
    if not isinstance(value, dict):
        raise OracleError(code, f"Expected a JSON object in {path}.")
    return value


def validate_sha256(value: Any, label: str) -> str:
    if not isinstance(value, str) or not SHA256_PATTERN.fullmatch(value):
        raise OracleError(
            "ORACLE_MANIFEST_INVALID",
            f"{label} must be a 64-character lowercase SHA-256.",
        )
    return value


def manifest_entry_by_role(
    manifest: Mapping[str, Any],
    roles: Iterable[str],
    required: bool = True,
) -> Mapping[str, Any] | None:
    files = manifest.get("files")
    if not isinstance(files, list):
        raise OracleError(
            "ORACLE_MANIFEST_INVALID",
            "Fixture manifest must contain a files array.",
        )
    accepted = set(roles)
    matches = [
        entry
        for entry in files
        if isinstance(entry, dict) and entry.get("role") in accepted
    ]
    if len(matches) > 1:
        raise OracleError(
            "ORACLE_MANIFEST_INVALID",
            f"Fixture manifest repeats role(s): {sorted(accepted)}.",
        )
    if not matches:
        if required:
            raise OracleError(
                "ORACLE_MANIFEST_INVALID",
                f"Fixture manifest lacks role(s): {sorted(accepted)}.",
            )
        return None
    entry = matches[0]
    validate_sha256(entry.get("sha256"), f"{entry.get('role')} sha256")
    if not isinstance(entry.get("path"), str):
        raise OracleError(
            "ORACLE_MANIFEST_INVALID",
            f"{entry.get('role')} path must be a string.",
        )
    return entry


def expected_manifest_path(entry: Mapping[str, Any], expected: str) -> None:
    observed = str(entry["path"]).replace("\\", "/")
    if observed.startswith("tests/fixtures/real/"):
        observed = observed.removeprefix("tests/fixtures/real/")
    expected_nested = expected.removeprefix("tests/fixtures/real/")
    if observed != expected_nested:
        raise OracleError(
            "ORACLE_MANIFEST_INVALID",
            (
                f"Role {entry.get('role')} must point to "
                f"{expected_nested}; found {entry['path']}."
            ),
        )


def positive_decimal(value: Any, label: str) -> Decimal:
    try:
        result = Decimal(str(value))
    except InvalidOperation as error:
        raise OracleError(
            "ORACLE_MANIFEST_INVALID",
            f"{label} must be a finite positive decimal.",
        ) from error
    if not result.is_finite() or result <= 0:
        raise OracleError(
            "ORACLE_MANIFEST_INVALID",
            f"{label} must be a finite positive decimal.",
        )
    return result


def validate_comparison_tolerances(
    manifest: Mapping[str, Any],
) -> None:
    if manifest.get("schema") != MANIFEST_SCHEMA_V2:
        return
    tolerances = manifest.get("comparisonTolerances")
    if not isinstance(tolerances, dict):
        raise OracleError(
            "ORACLE_MANIFEST_INVALID",
            "Fixture manifest v2 must lock comparison tolerances.",
        )
    for key, expected in EXPECTED_COMPARISON_TOLERANCES.items():
        if key not in tolerances:
            raise OracleError(
                "ORACLE_MANIFEST_INVALID",
                f"Fixture manifest v2 lacks tolerance {key}.",
            )
        observed = positive_decimal(
            tolerances[key],
            f"comparison tolerance {key}",
        )
        if observed != expected:
            raise OracleError(
                "ORACLE_MANIFEST_INVALID",
                (
                    f"Comparison tolerance {key} must equal "
                    f"{decimal_string(expected)}; found "
                    f"{decimal_string(observed)}."
                ),
            )


def manifest_energy_tolerance(manifest: Mapping[str, Any]) -> Decimal:
    containers = [
        manifest.get("comparisonTolerances"),
        manifest.get("tolerances"),
    ]
    candidate_keys = (
        "energyAbsKJPerMol",
        "activationEnergyAbsoluteKJPerMol",
        "activationEnergyAbsKJPerMol",
    )
    for container in containers:
        if not isinstance(container, dict):
            continue
        for key in candidate_keys:
            if key in container:
                return positive_decimal(
                    container[key],
                    f"comparison tolerance {key}",
                )
    if manifest.get("schema") == MANIFEST_SCHEMA_V2:
        raise OracleError(
            "ORACLE_MANIFEST_INVALID",
            (
                "Fixture manifest v2 must lock an activation-energy "
                "absolute tolerance."
            ),
        )
    return LEGACY_ENERGY_ABSOLUTE_TOLERANCE_KJ_PER_MOL


def compare_decimal(
    actual: Decimal,
    expected: Decimal,
    tolerance: Decimal,
    label: str,
) -> None:
    difference = abs(actual - expected)
    if difference > tolerance:
        raise OracleError(
            "ORACLE_LEGACY_REFERENCE_MISMATCH",
            (
                f"{label} differs by {decimal_string(difference)}, above "
                f"tolerance {decimal_string(tolerance)}."
            ),
        )


def validate_legacy_reference(
    reference: Mapping[str, Any],
    computed_reference: Mapping[str, Any],
    tolerance: Decimal,
) -> None:
    if reference.get("schema") != REFERENCE_SCHEMA_V1:
        raise OracleError(
            "ORACLE_REFERENCE_MISMATCH",
            (
                "Expected reference schema v1 or v2; found "
                f"{reference.get('schema')!r}."
            ),
        )
    for key in ("sourceSha256", "derivedFixtureSha256"):
        if reference.get(key) != computed_reference.get(key):
            raise OracleError(
                "ORACLE_LEGACY_REFERENCE_MISMATCH",
                f"Legacy reference field {key} does not match the oracle.",
            )
    if reference.get("publicationComparisonStatus") != (
        "not_reproduced_from_raw_without_undocumented_preprocessing"
    ):
        raise OracleError(
            "ORACLE_LEGACY_REFERENCE_MISMATCH",
            "Legacy reference lost the publication-reproduction boundary.",
        )

    expected = reference.get("expected")
    expected_means = reference.get("expectedMeansKJPerMol")
    if not isinstance(expected, dict) or not isinstance(
        expected_means,
        dict,
    ):
        raise OracleError(
            "ORACLE_LEGACY_REFERENCE_MISMATCH",
            "Legacy reference lacks expected method vectors or means.",
        )
    computed_expected = computed_reference["expected"]
    computed_means = computed_reference["expectedMeansKJPerMol"]
    for method in ("KAS", "FWO"):
        observed_values = expected.get(method)
        oracle_values = computed_expected[method]
        if not isinstance(observed_values, list) or len(
            observed_values
        ) != len(oracle_values):
            raise OracleError(
                "ORACLE_LEGACY_REFERENCE_MISMATCH",
                f"Legacy {method} vector length does not match the oracle.",
            )
        for index, (observed, oracle) in enumerate(
            zip(observed_values, oracle_values)
        ):
            compare_decimal(
                Decimal(str(observed)),
                Decimal(oracle),
                tolerance,
                f"{method} alpha index {index}",
            )
        compare_decimal(
            Decimal(str(expected_means.get(method))),
            Decimal(computed_means[method]),
            tolerance,
            f"{method} mean",
        )


def load_and_validate_manifest(
    manifest_path: Path,
) -> tuple[dict[str, Any], dict[str, Mapping[str, Any] | None]]:
    manifest = parse_json_file(
        manifest_path,
        "ORACLE_MANIFEST_INVALID",
    )
    source_entry = manifest_entry_by_role(
        manifest,
        ("immutable_official_raw_source",),
    )
    publication_transform_entry = manifest_entry_by_role(
        manifest,
        ("official_publication_transform_source",),
        required=manifest.get("schema") == MANIFEST_SCHEMA_V2,
    )
    publication_result_entry = manifest_entry_by_role(
        manifest,
        ("official_publication_result_source",),
        required=manifest.get("schema") == MANIFEST_SCHEMA_V2,
    )
    fixture_entry = manifest_entry_by_role(
        manifest,
        ("deterministic_derived_fixture",),
    )
    reference_entry = manifest_entry_by_role(
        manifest,
        ("independent_expected_output",),
    )
    implementation_entry = manifest_entry_by_role(
        manifest,
        (
            "independent_reference_implementation",
            "independent_real_oracle_implementation",
            "independent_oracle_implementation",
        ),
        required=manifest.get("schema") == MANIFEST_SCHEMA_V2,
    )
    assert source_entry is not None
    assert fixture_entry is not None
    assert reference_entry is not None
    expected_manifest_path(source_entry, SOURCE_RELATIVE_PATH)
    if publication_transform_entry is not None:
        expected_manifest_path(
            publication_transform_entry,
            PUBLICATION_TRANSFORM_RELATIVE_PATH,
        )
    if publication_result_entry is not None:
        expected_manifest_path(
            publication_result_entry,
            PUBLICATION_RESULT_RELATIVE_PATH,
        )
    expected_manifest_path(fixture_entry, FIXTURE_RELATIVE_PATH)
    expected_manifest_path(reference_entry, REFERENCE_RELATIVE_PATH)
    if implementation_entry is not None:
        expected_manifest_path(
            implementation_entry,
            IMPLEMENTATION_RELATIVE_PATH,
        )
    validate_comparison_tolerances(manifest)
    manifest_energy_tolerance(manifest)
    return manifest, {
        "source": source_entry,
        "publication_transform": publication_transform_entry,
        "publication_result": publication_result_entry,
        "fixture": fixture_entry,
        "reference": reference_entry,
        "implementation": implementation_entry,
    }


def compute_oracle(
    source_path: Path,
    publication_transform_path: Path,
    publication_result_path: Path,
    implementation_path: Path,
) -> tuple[bytes, bytes, dict[str, Any], str]:
    source_sha256 = sha256_file(source_path)
    ensure_hash(
        source_sha256,
        EXPECTED_SOURCE_SHA256,
        "ORACLE_SOURCE_HASH_MISMATCH",
        "Official Paper 010 source SHA-256 mismatch",
    )
    publication_transform_sha256 = sha256_file(
        publication_transform_path
    )
    ensure_hash(
        publication_transform_sha256,
        EXPECTED_PUBLICATION_TRANSFORM_SHA256,
        "ORACLE_PUBLICATION_TRANSFORM_HASH_MISMATCH",
        "Official Paper 010 S4 SHA-256 mismatch",
    )
    publication_result_sha256 = sha256_file(publication_result_path)
    ensure_hash(
        publication_result_sha256,
        EXPECTED_PUBLICATION_RESULT_SHA256,
        "ORACLE_PUBLICATION_RESULT_HASH_MISMATCH",
        "Official Paper 010 S5 SHA-256 mismatch",
    )
    cells = read_source_cells(source_path)
    crossings = derive_crossings(cells)
    friedman_publication_diagnostic = (
        build_friedman_publication_diagnostic(
            crossings,
            publication_transform_path,
            publication_result_path,
        )
    )
    csv_bytes = derived_csv_bytes(crossings)
    fixture_sha256 = sha256_bytes(csv_bytes)
    ensure_hash(
        fixture_sha256,
        EXPECTED_DERIVED_FIXTURE_SHA256,
        "ORACLE_DERIVED_FIXTURE_MISMATCH",
        "Derived Paper 010 CSV SHA-256 mismatch",
    )
    implementation_sha256 = sha256_file(implementation_path)
    reference = build_reference(
        crossings,
        source_sha256,
        fixture_sha256,
        implementation_sha256,
        friedman_publication_diagnostic,
    )
    return (
        csv_bytes,
        canonical_json_bytes(reference),
        reference,
        source_sha256,
    )


def check_project(
    project_root: Path,
    source_path: Path,
    publication_transform_path: Path,
    publication_result_path: Path,
    fixture_path: Path,
    reference_path: Path,
    manifest_path: Path,
    project_implementation_path: Path,
    running_implementation_path: Path,
) -> dict[str, Any]:
    manifest, entries = load_and_validate_manifest(manifest_path)
    source_sha256 = sha256_file(source_path)
    source_entry = entries["source"]
    publication_transform_entry = entries["publication_transform"]
    publication_result_entry = entries["publication_result"]
    fixture_entry = entries["fixture"]
    reference_entry = entries["reference"]
    implementation_entry = entries["implementation"]
    assert source_entry is not None
    assert publication_transform_entry is not None
    assert publication_result_entry is not None
    assert fixture_entry is not None
    assert reference_entry is not None

    ensure_hash(
        source_sha256,
        EXPECTED_SOURCE_SHA256,
        "ORACLE_SOURCE_HASH_MISMATCH",
        "Official Paper 010 source SHA-256 mismatch",
    )
    ensure_hash(
        source_sha256,
        str(source_entry["sha256"]),
        "ORACLE_SOURCE_HASH_MISMATCH",
        "Source SHA-256 does not match fixture manifest",
    )
    publication_transform_sha256 = sha256_file(
        publication_transform_path
    )
    ensure_hash(
        publication_transform_sha256,
        EXPECTED_PUBLICATION_TRANSFORM_SHA256,
        "ORACLE_PUBLICATION_TRANSFORM_HASH_MISMATCH",
        "Official Paper 010 S4 SHA-256 mismatch",
    )
    ensure_hash(
        publication_transform_sha256,
        str(publication_transform_entry["sha256"]),
        "ORACLE_PUBLICATION_TRANSFORM_HASH_MISMATCH",
        "S4 SHA-256 does not match fixture manifest",
    )
    publication_result_sha256 = sha256_file(
        publication_result_path
    )
    ensure_hash(
        publication_result_sha256,
        EXPECTED_PUBLICATION_RESULT_SHA256,
        "ORACLE_PUBLICATION_RESULT_HASH_MISMATCH",
        "Official Paper 010 S5 SHA-256 mismatch",
    )
    ensure_hash(
        publication_result_sha256,
        str(publication_result_entry["sha256"]),
        "ORACLE_PUBLICATION_RESULT_HASH_MISMATCH",
        "S5 SHA-256 does not match fixture manifest",
    )

    project_implementation_sha256 = sha256_file(
        project_implementation_path
    )
    running_implementation_sha256 = sha256_file(
        running_implementation_path
    )
    if implementation_entry is not None:
        ensure_hash(
            project_implementation_sha256,
            str(implementation_entry["sha256"]),
            "ORACLE_IMPLEMENTATION_HASH_MISMATCH",
            "Oracle implementation does not match fixture manifest",
        )
        ensure_hash(
            running_implementation_sha256,
            project_implementation_sha256,
            "ORACLE_IMPLEMENTATION_HASH_MISMATCH",
            (
                "Running oracle differs from the project-locked "
                "implementation"
            ),
        )

    csv_bytes, reference_bytes, computed_reference, _ = compute_oracle(
        source_path,
        publication_transform_path,
        publication_result_path,
        running_implementation_path,
    )
    fixture_sha256 = sha256_file(fixture_path)
    ensure_hash(
        fixture_sha256,
        str(fixture_entry["sha256"]),
        "ORACLE_DERIVED_FIXTURE_MISMATCH",
        "Committed derived fixture does not match fixture manifest",
    )
    ensure_hash(
        fixture_path.read_bytes(),
        csv_bytes,
        "ORACLE_DERIVED_FIXTURE_MISMATCH",
        "Committed derived fixture bytes do not match the oracle",
    )

    reference_sha256 = sha256_file(reference_path)
    ensure_hash(
        reference_sha256,
        str(reference_entry["sha256"]),
        "ORACLE_REFERENCE_MISMATCH",
        "Committed reference does not match fixture manifest",
    )
    reference = parse_json_file(
        reference_path,
        "ORACLE_REFERENCE_MISMATCH",
    )
    reference_schema = reference.get("schema")
    if reference_schema == REFERENCE_SCHEMA_V2:
        ensure_hash(
            reference_path.read_bytes(),
            reference_bytes,
            "ORACLE_REFERENCE_MISMATCH",
            "Committed reference bytes do not match the Decimal oracle",
        )
        mode = "canonical_v2_exact"
    else:
        validate_legacy_reference(
            reference,
            computed_reference,
            manifest_energy_tolerance(manifest),
        )
        mode = "legacy_v1_semantic"

    return {
        "status": "PASS",
        "mode": mode,
        "sourceSha256": source_sha256,
        "publicationTransformSha256": publication_transform_sha256,
        "publicationResultSha256": publication_result_sha256,
        "derivedFixtureSha256": sha256_bytes(csv_bytes),
        "referenceSha256": reference_sha256,
        "implementationSha256": running_implementation_sha256,
        "rows": 48,
        "alphaRange": ["0.05", "0.8"],
        "heatingRatesKPerMin": ["5", "10", "20"],
        "methods": ["KAS", "FWO", "STARINK", "FRIEDMAN"],
        "friedmanDerivativeSource": (
            "official_s2_minus_dtg_piecewise_linear"
        ),
        "publicationDiagnosticStatus": (
            "PUBLICATION_REPRODUCTION_DIAGNOSTIC_NONSTANDARD"
        ),
        "projectRoot": str(project_root),
    }


def ensure_hash(
    actual: str | bytes,
    expected: str | bytes,
    code: str,
    label: str,
) -> None:
    if actual != expected:
        raise OracleError(
            code,
            f"{label}.",
        )


def write_explicit_output(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def argument_parser() -> argparse.ArgumentParser:
    default_project_root = Path(__file__).resolve().parents[4]
    parser = argparse.ArgumentParser(
        description=(
            "Independent stdlib/Decimal(50) Paper 010 oracle."
        )
    )
    parser.add_argument(
        "--project-root",
        default=str(default_project_root),
        help="Project root used to resolve default fixture paths.",
    )
    parser.add_argument(
        "--source",
        default=SOURCE_RELATIVE_PATH,
        help="Official Paper 010 S2 XLSX path.",
    )
    parser.add_argument(
        "--publication-transform-source",
        default=PUBLICATION_TRANSFORM_RELATIVE_PATH,
        help="Official Paper 010 S4 transformed-coordinate XLSX path.",
    )
    parser.add_argument(
        "--publication-result-source",
        default=PUBLICATION_RESULT_RELATIVE_PATH,
        help="Official Paper 010 S5 published-result XLSX path.",
    )
    parser.add_argument(
        "--fixture",
        default=FIXTURE_RELATIVE_PATH,
        help="Committed derived CSV path.",
    )
    parser.add_argument(
        "--reference",
        default=REFERENCE_RELATIVE_PATH,
        help="Committed expected-output JSON path.",
    )
    parser.add_argument(
        "--manifest",
        default=MANIFEST_RELATIVE_PATH,
        help="Real-data fixture manifest path.",
    )
    parser.add_argument(
        "--implementation",
        default=IMPLEMENTATION_RELATIVE_PATH,
        help="Project-locked oracle implementation path.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Read-only verification of the complete committed chain.",
    )
    parser.add_argument(
        "--emit-csv",
        help="Explicitly write the independently derived CSV here.",
    )
    parser.add_argument(
        "--emit-json",
        help="Explicitly write the canonical v2 Decimal reference here.",
    )
    return parser


def run(arguments: argparse.Namespace) -> dict[str, Any]:
    if not arguments.check and not arguments.emit_csv and not arguments.emit_json:
        raise OracleError(
            "ORACLE_ACTION_REQUIRED",
            "Choose --check, --emit-csv, and/or --emit-json.",
        )
    if arguments.check and (arguments.emit_csv or arguments.emit_json):
        raise OracleError(
            "ORACLE_ACTION_CONFLICT",
            "--check is read-only and cannot be combined with emit options.",
        )

    project_root = Path(arguments.project_root).resolve()
    source_path = resolve_project_path(project_root, arguments.source)
    publication_transform_path = resolve_project_path(
        project_root,
        arguments.publication_transform_source,
    )
    publication_result_path = resolve_project_path(
        project_root,
        arguments.publication_result_source,
    )
    fixture_path = resolve_project_path(project_root, arguments.fixture)
    reference_path = resolve_project_path(project_root, arguments.reference)
    manifest_path = resolve_project_path(project_root, arguments.manifest)
    project_implementation_path = resolve_project_path(
        project_root,
        arguments.implementation,
    )
    running_implementation_path = Path(__file__).resolve()

    if arguments.check:
        return check_project(
            project_root,
            source_path,
            publication_transform_path,
            publication_result_path,
            fixture_path,
            reference_path,
            manifest_path,
            project_implementation_path,
            running_implementation_path,
        )

    csv_bytes, reference_bytes, _, source_sha256 = compute_oracle(
        source_path,
        publication_transform_path,
        publication_result_path,
        running_implementation_path,
    )
    emit_paths = [
        resolve_project_path(project_root, candidate)
        for candidate in (arguments.emit_csv, arguments.emit_json)
        if candidate
    ]
    if len(set(emit_paths)) != len(emit_paths):
        raise OracleError(
            "ORACLE_EMIT_PATH_CONFLICT",
            "CSV and JSON outputs must use different paths.",
        )
    protected_paths = {
        source_path,
        publication_transform_path,
        publication_result_path,
        manifest_path,
        running_implementation_path,
        project_implementation_path,
    }
    for output_path in emit_paths:
        if output_path in protected_paths:
            raise OracleError(
                "ORACLE_EMIT_PATH_PROTECTED",
                f"Refusing to overwrite protected input: {output_path}",
            )

    if arguments.emit_csv:
        write_explicit_output(
            resolve_project_path(project_root, arguments.emit_csv),
            csv_bytes,
        )
    if arguments.emit_json:
        write_explicit_output(
            resolve_project_path(project_root, arguments.emit_json),
            reference_bytes,
        )
    return {
        "status": "EMITTED",
        "sourceSha256": source_sha256,
        "publicationTransformSha256": sha256_file(
            publication_transform_path
        ),
        "publicationResultSha256": sha256_file(
            publication_result_path
        ),
        "derivedFixtureSha256": sha256_bytes(csv_bytes),
        "referenceSha256": sha256_bytes(reference_bytes),
        "implementationSha256": sha256_file(
            running_implementation_path
        ),
        "rows": 48,
        "methods": ["KAS", "FWO", "STARINK", "FRIEDMAN"],
        "friedmanDerivativeSource": (
            "official_s2_minus_dtg_piecewise_linear"
        ),
        "publicationDiagnosticStatus": (
            "PUBLICATION_REPRODUCTION_DIAGNOSTIC_NONSTANDARD"
        ),
        "emittedCsv": (
            str(resolve_project_path(project_root, arguments.emit_csv))
            if arguments.emit_csv
            else None
        ),
        "emittedJson": (
            str(resolve_project_path(project_root, arguments.emit_json))
            if arguments.emit_json
            else None
        ),
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argument_parser()
    try:
        arguments = parser.parse_args(argv)
        result = run(arguments)
    except OracleError as error:
        print(
            json.dumps(
                {
                    "status": "FAIL",
                    "code": error.code,
                    "message": error.message,
                },
                ensure_ascii=False,
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 2
    except Exception as error:  # pragma: no cover - last-resort fail closed
        print(
            json.dumps(
                {
                    "status": "FAIL",
                    "code": "ORACLE_INTERNAL_ERROR",
                    "message": str(error),
                },
                ensure_ascii=False,
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 3

    print(
        json.dumps(
            result,
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
