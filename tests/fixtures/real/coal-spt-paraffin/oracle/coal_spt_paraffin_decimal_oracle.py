#!/usr/bin/env python3
"""Independent Coal-SPT-Paraffin real-data validation oracle.

This program imports only the Python standard library. It reads the approved
Mendeley Data version-1 XLSX directly as OOXML, extracts the nominal-10 mg
paraffin sheets 17-24, projects alpha 0.1-0.8, and evaluates FWO, KAS, and
Friedman with Decimal arithmetic at precision 50.

The application implementation is never imported. ``--check`` is read-only;
files are written only when an explicit ``--emit-csv`` or ``--emit-json``
argument is supplied.
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

FIXTURE_ROOT_RELATIVE_PATH = "tests/fixtures/real/coal-spt-paraffin"
SOURCE_RELATIVE_PATH = (
    f"{FIXTURE_ROOT_RELATIVE_PATH}/source/"
    "TGA raw data of coal, SPT and paraffin at different masses.xlsx"
)
DERIVED_RELATIVE_PATH = (
    f"{FIXTURE_ROOT_RELATIVE_PATH}/paraffin10_t_alpha_beta.csv"
)
REFERENCE_RELATIVE_PATH = (
    f"{FIXTURE_ROOT_RELATIVE_PATH}/expected-output.json"
)
MANIFEST_RELATIVE_PATH = f"{FIXTURE_ROOT_RELATIVE_PATH}/manifest.json"
IMPLEMENTATION_RELATIVE_PATH = (
    f"{FIXTURE_ROOT_RELATIVE_PATH}/oracle/"
    "coal_spt_paraffin_decimal_oracle.py"
)

SOURCE_SHA256 = (
    "0226a9f6eaa1fb1bdfc7e5713d2a5faed95d3ac2e8fd3154a66e981bbc4ead21"
)
SOURCE_BYTES = 1_535_050
SOURCE_DATASET_DOI = "10.17632/w22346frww.1"
SOURCE_DATASET_FILE_ID = "a5b6ce7f-dfcd-42b1-8181-e711e650e734"
SOURCE_DATASET_LICENSE = "CC BY 4.0"
ARTICLE_DOI = "10.1016/j.fuel.2021.120305"
DATA_ARTICLE_DOI = "10.1016/j.dib.2021.107170"

REFERENCE_SCHEMA = (
    "activation-energy-studio/coal-spt-paraffin-reference/v1"
)
MANIFEST_SCHEMA = (
    "activation-energy-studio/coal-spt-paraffin-fixture-manifest/v1"
)
FIXTURE_ID = "coal-spt-paraffin-v1-paraffin10-alpha-01-08"

GAS_CONSTANT = Decimal("8.31446261815324")
FWO_COEFFICIENT = Decimal("1.052")
CELSIUS_OFFSET = Decimal("273.15")
T_CRITICAL_95_DF2 = Decimal("4.30265273")
TEMPERATURE_QUANTUM_C = Decimal("0.000000001")
DERIVATIVE_QUANTUM_PER_MINUTE = Decimal("0.000000000001")
ALPHA_TARGETS = tuple(Decimal(index) / Decimal(10) for index in range(1, 9))
METHODS = ("FWO", "KAS", "FRIEDMAN")
FORMULA_IDS = {
    "FWO": "fwo_doyle_ln_1.052_v1",
    "KAS": "kas_ln_beta_over_t2_v1",
    "FRIEDMAN": "friedman_ln_dalpha_dt_v1",
}

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


@dataclass(frozen=True)
class RunSpec:
    sheet_index: int
    sheet_name: str
    heating_rate: Decimal
    replicate: int
    raw_numeric_rows: int
    retained_positive_mass_rows: int

    @property
    def run_id(self) -> str:
        rate = int(self.heating_rate)
        return f"csp-paraffin10-beta{rate:02d}-rep{self.replicate}"


RUN_SPECS = (
    RunSpec(
        17,
        "Parafina py3ºC·min-1 (1)",
        Decimal("3"),
        1,
        420,
        303,
    ),
    RunSpec(
        18,
        "Parafina py3ºC·min-1 (2)",
        Decimal("3"),
        2,
        469,
        283,
    ),
    RunSpec(
        19,
        "Parafina py10ºC·min-1 (1)",
        Decimal("10"),
        1,
        469,
        336,
    ),
    RunSpec(
        20,
        "Parafina py10ºC·min-1 (2)",
        Decimal("10"),
        2,
        479,
        342,
    ),
    RunSpec(
        21,
        "Parafina py20ºC·min-1 (1)",
        Decimal("20"),
        1,
        465,
        465,
    ),
    RunSpec(
        22,
        "Parafina py20ºC·min-1 (2)",
        Decimal("20"),
        2,
        470,
        351,
    ),
    RunSpec(
        23,
        "Parafina py40ºC·min-1 (1)",
        Decimal("40"),
        1,
        1472,
        651,
    ),
    RunSpec(
        24,
        "Parafina py40ºC·min-1 (2)",
        Decimal("40"),
        2,
        644,
        644,
    ),
)


@dataclass(frozen=True)
class RawPoint:
    source_row: int
    time_minute: Decimal
    temperature_c: Decimal
    mass_mg: Decimal
    temperature_difference_c: Decimal
    derivative_weight_percent_per_minute: Decimal


@dataclass(frozen=True)
class RunCurve:
    spec: RunSpec
    points: tuple[RawPoint, ...]
    initial_mass_mg: Decimal
    final_mass_mg: Decimal


@dataclass(frozen=True)
class ProjectedPoint:
    run_id: str
    sheet_name: str
    sheet_index: int
    heating_rate: Decimal
    replicate: int
    alpha: Decimal
    temperature_c: Decimal
    d_alpha_dt_per_minute: Decimal
    left_source_row: int
    right_source_row: int
    interpolation_fraction: Decimal
    initial_mass_mg: Decimal
    final_mass_mg: Decimal


class OracleError(RuntimeError):
    """Deterministic fail-closed oracle error."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def fail(code: str, message: str) -> None:
    raise OracleError(code, message)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    try:
        return sha256_bytes(path.read_bytes())
    except FileNotFoundError:
        fail("ORACLE_REQUIRED_FILE_MISSING", f"Required file is missing: {path}")


def decimal_string(value: Decimal) -> str:
    if not value.is_finite():
        fail("ORACLE_NONFINITE_DECIMAL", f"Cannot serialize {value}.")
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


def resolve_project_path(project_root: Path, path: str | Path) -> Path:
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = project_root / candidate
    return candidate.resolve()


def parse_xml(data: bytes, member: str) -> ET.Element:
    try:
        return ET.fromstring(data)
    except ET.ParseError as error:
        fail(
            "ORACLE_XLSX_XML_INVALID",
            f"Invalid XML in XLSX member {member}: {error}",
        )


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
        fail(
            "ORACLE_XLSX_RELATIONSHIP_INVALID",
            f"Unsafe workbook relationship target: {target}",
        )
    return normalized


def workbook_sheet_members(archive: ZipFile) -> list[tuple[str, str]]:
    workbook_member = "xl/workbook.xml"
    relationship_member = "xl/_rels/workbook.xml.rels"
    try:
        workbook = parse_xml(archive.read(workbook_member), workbook_member)
        relationships = parse_xml(
            archive.read(relationship_member),
            relationship_member,
        )
    except KeyError as error:
        fail(
            "ORACLE_XLSX_STRUCTURE_INVALID",
            f"Required XLSX member is missing: {error}",
        )

    relation_targets: dict[str, str] = {}
    for relation in relationships.findall(
        f"{{{PACKAGE_REL_NS}}}Relationship"
    ):
        relation_id = relation.attrib.get("Id")
        target = relation.attrib.get("Target")
        if relation_id and target:
            relation_targets[relation_id] = normalize_ooxml_target(target)

    sheets = workbook.find(f"{{{SPREADSHEET_NS}}}sheets")
    if sheets is None:
        fail("ORACLE_XLSX_STRUCTURE_INVALID", "Workbook has no sheets.")
    relationship_attribute = f"{{{OFFICE_REL_NS}}}id"
    result: list[tuple[str, str]] = []
    for sheet in sheets.findall(f"{{{SPREADSHEET_NS}}}sheet"):
        name = sheet.attrib.get("name")
        relationship_id = sheet.attrib.get(relationship_attribute)
        if (
            not name
            or not relationship_id
            or relationship_id not in relation_targets
        ):
            fail(
                "ORACLE_XLSX_RELATIONSHIP_INVALID",
                "Every worksheet must have a valid name and relationship.",
            )
        result.append((name, relation_targets[relationship_id]))
    return result


def shared_strings(archive: ZipFile) -> list[str]:
    member = "xl/sharedStrings.xml"
    if member not in archive.namelist():
        return []
    root = parse_xml(archive.read(member), member)
    return [
        "".join(
            element.text or ""
            for element in item.iter(f"{{{SPREADSHEET_NS}}}t")
        )
        for item in root.findall(f"{{{SPREADSHEET_NS}}}si")
    ]


def cell_value(
    cell: ET.Element,
    strings: Sequence[str],
) -> Decimal | str | None:
    reference = cell.attrib.get("r", "")
    if cell.find(f"{{{SPREADSHEET_NS}}}f") is not None:
        fail(
            "ORACLE_XLSX_LAYOUT_MISMATCH",
            f"Formula cells are not allowed in locked input: {reference}",
        )
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(
            element.text or ""
            for element in cell.iter(f"{{{SPREADSHEET_NS}}}t")
        )
    value_element = cell.find(f"{{{SPREADSHEET_NS}}}v")
    if value_element is None or value_element.text is None:
        return None
    raw = value_element.text
    if cell_type == "s":
        try:
            return strings[int(raw)]
        except (ValueError, IndexError):
            fail(
                "ORACLE_XLSX_LAYOUT_MISMATCH",
                f"Invalid shared-string index in {reference}.",
            )
    if cell_type in {None, "n"}:
        try:
            value = Decimal(raw)
        except InvalidOperation:
            fail(
                "ORACLE_XLSX_LAYOUT_MISMATCH",
                f"Invalid numeric value in {reference}.",
            )
        if not value.is_finite():
            fail(
                "ORACLE_XLSX_LAYOUT_MISMATCH",
                f"Non-finite numeric value in {reference}.",
            )
        return value
    if cell_type in {"str", "b"}:
        return raw
    fail(
        "ORACLE_XLSX_LAYOUT_MISMATCH",
        f"Unsupported OOXML cell type {cell_type!r} in {reference}.",
    )


def read_selected_sheets(
    source_path: Path,
) -> dict[str, dict[tuple[str, int], Decimal | str]]:
    try:
        with ZipFile(source_path) as archive:
            members = workbook_sheet_members(archive)
            if len(members) != 40:
                fail(
                    "ORACLE_XLSX_LAYOUT_MISMATCH",
                    f"Expected 40 worksheets; found {len(members)}.",
                )
            expected_names = [spec.sheet_name for spec in RUN_SPECS]
            actual_names = [
                members[spec.sheet_index - 1][0] for spec in RUN_SPECS
            ]
            if actual_names != expected_names:
                fail(
                    "ORACLE_XLSX_LAYOUT_MISMATCH",
                    "Nominal-10 mg paraffin worksheets 17-24 changed.",
                )
            strings = shared_strings(archive)
            output: dict[
                str,
                dict[tuple[str, int], Decimal | str],
            ] = {}
            for spec in RUN_SPECS:
                name, member = members[spec.sheet_index - 1]
                worksheet = parse_xml(archive.read(member), member)
                values: dict[tuple[str, int], Decimal | str] = {}
                for cell in worksheet.findall(
                    f".//{{{SPREADSHEET_NS}}}sheetData/"
                    f"{{{SPREADSHEET_NS}}}row/"
                    f"{{{SPREADSHEET_NS}}}c"
                ):
                    reference = cell.attrib.get("r", "")
                    match = CELL_REFERENCE.fullmatch(reference)
                    if not match:
                        fail(
                            "ORACLE_XLSX_LAYOUT_MISMATCH",
                            f"Invalid source cell reference: {reference!r}.",
                        )
                    value = cell_value(cell, strings)
                    if value is None:
                        continue
                    key = (match.group(1), int(match.group(2)))
                    if key in values:
                        fail(
                            "ORACLE_XLSX_LAYOUT_MISMATCH",
                            f"Duplicate source cell: {reference}.",
                        )
                    values[key] = value
                output[name] = values
            return output
    except BadZipFile:
        fail(
            "ORACLE_XLSX_INVALID",
            f"Source is not a valid XLSX archive: {source_path}",
        )
    except KeyError as error:
        fail(
            "ORACLE_XLSX_STRUCTURE_INVALID",
            f"Required worksheet member is missing: {error}",
        )


def require_text(
    cells: Mapping[tuple[str, int], Decimal | str],
    column: str,
    row: int,
    expected: str,
) -> None:
    actual = cells.get((column, row))
    if actual != expected:
        fail(
            "ORACLE_XLSX_LAYOUT_MISMATCH",
            f"{column}{row} must equal {expected!r}; found {actual!r}.",
        )


def require_decimal(
    cells: Mapping[tuple[str, int], Decimal | str],
    column: str,
    row: int,
) -> Decimal:
    value = cells.get((column, row))
    if not isinstance(value, Decimal):
        fail(
            "ORACLE_XLSX_LAYOUT_MISMATCH",
            f"{column}{row} must contain a numeric value.",
        )
    return value


def build_curve(
    spec: RunSpec,
    cells: Mapping[tuple[str, int], Decimal | str],
) -> RunCurve:
    require_text(cells, "A", 6, "Sample")
    sample = cells.get(("B", 6))
    if not isinstance(sample, str) or sample.strip().lower() != "parafina":
        fail(
            "ORACLE_XLSX_LAYOUT_MISMATCH",
            f"{spec.sheet_name}: sample metadata is not 'parafina'.",
        )
    for column, row, expected in (
        ("A", 21, "Sig1"),
        ("B", 21, "Time"),
        ("C", 21, "(min)"),
        ("A", 22, "Sig2"),
        ("B", 22, "Temperature"),
        ("C", 22, "(°C)"),
        ("A", 23, "Sig3"),
        ("B", 23, "Weight"),
        ("C", 23, "(mg)"),
        ("A", 25, "Sig5"),
        ("B", 25, "Deriv."),
        ("C", 25, "Weight"),
        ("D", 25, "(%/min)"),
        ("A", 30, "StartOfData"),
    ):
        require_text(cells, column, row, expected)

    populated_rows = sorted(
        row
        for column, row in cells
        if row >= 31 and column in {"A", "B", "C", "D", "E"}
    )
    source_rows = sorted(set(populated_rows))
    numeric_rows: list[RawPoint] = []
    for row in source_rows:
        values = tuple(
            require_decimal(cells, column, row)
            for column in ("A", "B", "C", "D", "E")
        )
        numeric_rows.append(
            RawPoint(
                source_row=row,
                time_minute=values[0],
                temperature_c=values[1],
                mass_mg=values[2],
                temperature_difference_c=values[3],
                derivative_weight_percent_per_minute=values[4],
            )
        )
    if len(numeric_rows) != spec.raw_numeric_rows:
        fail(
            "ORACLE_XLSX_LAYOUT_MISMATCH",
            (
                f"{spec.sheet_name}: expected {spec.raw_numeric_rows} raw "
                f"numeric rows; found {len(numeric_rows)}."
            ),
        )

    retained = tuple(
        point
        for point in numeric_rows
        if (
            point.time_minute >= 0
            and point.temperature_c >= 0
            and point.mass_mg > 0
        )
    )
    if len(retained) != spec.retained_positive_mass_rows:
        fail(
            "ORACLE_XLSX_LAYOUT_MISMATCH",
            (
                f"{spec.sheet_name}: expected "
                f"{spec.retained_positive_mass_rows} retained positive-mass "
                f"rows; found {len(retained)}."
            ),
        )
    initial_mass = retained[0].mass_mg
    final_mass = retained[-1].mass_mg
    if not initial_mass > final_mass >= 0:
        fail(
            "ORACLE_MASS_REFERENCE_INVALID",
            f"{spec.sheet_name}: invalid initial/final mass anchors.",
        )
    return RunCurve(
        spec=spec,
        points=retained,
        initial_mass_mg=initial_mass,
        final_mass_mg=final_mass,
    )


def alpha_for(curve: RunCurve, point: RawPoint) -> Decimal:
    return (
        (curve.initial_mass_mg - point.mass_mg)
        / (curve.initial_mass_mg - curve.final_mass_mg)
    )


def project_target(
    curve: RunCurve,
    target: Decimal,
) -> ProjectedPoint:
    upward: list[tuple[RawPoint, RawPoint]] = []
    downward: list[tuple[RawPoint, RawPoint]] = []
    exact: list[RawPoint] = []
    for point in curve.points:
        if alpha_for(curve, point) == target:
            exact.append(point)
    for left, right in zip(curve.points, curve.points[1:]):
        left_alpha = alpha_for(curve, left)
        right_alpha = alpha_for(curve, right)
        if left_alpha < target < right_alpha:
            upward.append((left, right))
        elif left_alpha > target > right_alpha:
            downward.append((left, right))

    if exact:
        if len(exact) != 1 or upward or downward:
            fail(
                "ORACLE_ALPHA_CROSSING_AMBIGUOUS",
                (
                    f"{curve.spec.run_id} alpha={target} has an ambiguous "
                    "exact/crossing configuration."
                ),
            )
        left = right = exact[0]
        fraction = Decimal(0)
    else:
        if len(upward) != 1 or downward:
            fail(
                "ORACLE_ALPHA_CROSSING_AMBIGUOUS",
                (
                    f"{curve.spec.run_id} alpha={target} has "
                    f"{len(upward)} upward and {len(downward)} downward "
                    "crossings."
                ),
            )
        left, right = upward[0]
        left_alpha = alpha_for(curve, left)
        right_alpha = alpha_for(curve, right)
        fraction = (target - left_alpha) / (right_alpha - left_alpha)

    def interpolate(
        left_value: Decimal,
        right_value: Decimal,
    ) -> Decimal:
        return left_value + fraction * (right_value - left_value)

    temperature_c = interpolate(
        left.temperature_c,
        right.temperature_c,
    ).quantize(TEMPERATURE_QUANTUM_C, rounding=ROUND_HALF_UP)
    raw_dtg = interpolate(
        left.derivative_weight_percent_per_minute,
        right.derivative_weight_percent_per_minute,
    )
    normalized_span_fraction = (
        Decimal(1) - curve.final_mass_mg / curve.initial_mass_mg
    )
    derivative = (
        raw_dtg / Decimal(100) / normalized_span_fraction
    ).quantize(DERIVATIVE_QUANTUM_PER_MINUTE, rounding=ROUND_HALF_UP)
    if derivative <= 0:
        fail(
            "ORACLE_FRIEDMAN_DERIVATIVE_INVALID",
            (
                f"{curve.spec.run_id} alpha={target} produced non-positive "
                f"d(alpha)/dt={derivative}."
            ),
        )
    return ProjectedPoint(
        run_id=curve.spec.run_id,
        sheet_name=curve.spec.sheet_name,
        sheet_index=curve.spec.sheet_index,
        heating_rate=curve.spec.heating_rate,
        replicate=curve.spec.replicate,
        alpha=target,
        temperature_c=temperature_c,
        d_alpha_dt_per_minute=derivative,
        left_source_row=left.source_row,
        right_source_row=right.source_row,
        interpolation_fraction=fraction,
        initial_mass_mg=curve.initial_mass_mg,
        final_mass_mg=curve.final_mass_mg,
    )


def derive_points(
    source_path: Path,
) -> tuple[tuple[RunCurve, ...], tuple[ProjectedPoint, ...]]:
    sheets = read_selected_sheets(source_path)
    curves = tuple(
        build_curve(spec, sheets[spec.sheet_name]) for spec in RUN_SPECS
    )
    points = tuple(
        project_target(curve, alpha)
        for curve in curves
        for alpha in ALPHA_TARGETS
    )
    if len(points) != 64:
        fail(
            "ORACLE_DERIVATION_COUNT_MISMATCH",
            f"Expected 64 projected points; found {len(points)}.",
        )
    for curve in curves:
        projected = [
            point for point in points if point.run_id == curve.spec.run_id
        ]
        for left, right in zip(projected, projected[1:]):
            if not left.temperature_c < right.temperature_c:
                fail(
                    "ORACLE_SELECTED_BRANCH_NOT_INCREASING",
                    (
                        f"{curve.spec.run_id}: projected alpha-branch "
                        "temperature is not strictly increasing."
                    ),
                )
    return curves, points


def derived_csv_bytes(points: Sequence[ProjectedPoint]) -> bytes:
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
    for point in points:
        rows.append(
            ",".join(
                (
                    fixed_decimal_string(point.temperature_c, 9),
                    fixed_decimal_string(point.alpha, 1),
                    fixed_decimal_string(
                        point.d_alpha_dt_per_minute,
                        12,
                    ),
                    fixed_decimal_string(
                        Decimal(100) * (Decimal(1) - point.alpha),
                        1,
                    ),
                    decimal_string(point.heating_rate),
                    point.run_id,
                    "Commercial paraffin nominal 10 mg",
                    "N2",
                )
            )
        )
    return ("\n".join(rows) + "\n").encode("utf-8")


def sample_standard_deviation(values: Sequence[Decimal]) -> Decimal:
    if len(values) < 2:
        fail(
            "ORACLE_REPLICATE_GROUP_INVALID",
            "A replicate standard deviation requires at least two values.",
        )
    mean = sum(values, Decimal(0)) / Decimal(len(values))
    return (
        sum((value - mean) ** 2 for value in values)
        / Decimal(len(values) - 1)
    ).sqrt()


def heating_rate_key(rate: Decimal) -> str:
    integer_digits = len(str(abs(int(rate))))
    return format(rate, f".{15 - integer_digits}f")


def physical_groups(
    method: str,
    points: Sequence[ProjectedPoint],
) -> tuple[dict[str, Any], ...]:
    groups: list[dict[str, Any]] = []
    for rate in (Decimal("3"), Decimal("10"), Decimal("20"), Decimal("40")):
        contributions = sorted(
            [point for point in points if point.heating_rate == rate],
            key=lambda point: point.run_id,
        )
        if len(contributions) != 2:
            fail(
                "ORACLE_REPLICATE_GROUP_INVALID",
                f"Rate {rate} must have exactly two physical replicates.",
            )
        temperatures = tuple(
            point.temperature_c + CELSIUS_OFFSET
            for point in contributions
        )
        derivatives = tuple(
            point.d_alpha_dt_per_minute for point in contributions
        )
        temperature = sum(temperatures, Decimal(0)) / Decimal(2)
        derivative = sum(derivatives, Decimal(0)) / Decimal(2)
        x = Decimal(1) / temperature
        if method == "FWO":
            y = rate.ln()
        elif method == "KAS":
            y = (rate / temperature**2).ln()
        elif method == "FRIEDMAN":
            y = derivative.ln()
        else:
            fail("ORACLE_METHOD_UNKNOWN", f"Unknown method: {method}.")
        groups.append(
            {
                "groupId": f"beta:{heating_rate_key(rate)}",
                "sourceRunIds": [
                    point.run_id for point in contributions
                ],
                "replicateCount": 2,
                "aggregation": (
                    "arithmetic-mean-physical-scale-by-heating-rate"
                ),
                "heatingRateKPerMinute": rate,
                "temperatureK": temperature,
                **(
                    {"dAlphaDtPerMinute": derivative}
                    if method == "FRIEDMAN"
                    else {}
                ),
                "x": x,
                "y": y,
                "temperatureSampleStandardDeviationK": (
                    sample_standard_deviation(temperatures)
                ),
                **(
                    {
                        "derivativeSampleStandardDeviationPerMinute": (
                            sample_standard_deviation(derivatives)
                        )
                    }
                    if method == "FRIEDMAN"
                    else {}
                ),
            }
        )
    return tuple(groups)


def ols(
    x_values: Sequence[Decimal],
    y_values: Sequence[Decimal],
) -> dict[str, Any]:
    if len(x_values) != len(y_values) or len(x_values) != 4:
        fail(
            "ORACLE_REGRESSION_INPUT_INVALID",
            "Coal-SPT-Paraffin OLS requires four distinct rates.",
        )
    count = Decimal(4)
    mean_x = sum(x_values, Decimal(0)) / count
    mean_y = sum(y_values, Decimal(0)) / count
    sxx = sum((value - mean_x) ** 2 for value in x_values)
    sxy = sum(
        (x_value - mean_x) * (y_value - mean_y)
        for x_value, y_value in zip(x_values, y_values)
    )
    syy = sum((value - mean_y) ** 2 for value in y_values)
    if sxx <= 0 or syy <= 0:
        fail(
            "ORACLE_REGRESSION_INPUT_INVALID",
            "Transformed OLS inputs lack variation.",
        )
    slope = sxy / sxx
    intercept = mean_y - slope * mean_x
    fitted = tuple(intercept + slope * value for value in x_values)
    residuals = tuple(
        observed - predicted
        for observed, predicted in zip(y_values, fitted)
    )
    sse = sum((value**2 for value in residuals), Decimal(0))
    residual_standard_error = (sse / Decimal(2)).sqrt()
    slope_standard_error = residual_standard_error / sxx.sqrt()
    margin = T_CRITICAL_95_DF2 * slope_standard_error
    return {
        "n": 4,
        "rawObservationCount": 8,
        "residualDegreesOfFreedom": 2,
        "inputAggregation": (
            "arithmetic-mean-physical-scale-by-heating-rate"
        ),
        "x": tuple(x_values),
        "y": tuple(y_values),
        "slope": slope,
        "intercept": intercept,
        "fitted": fitted,
        "residuals": residuals,
        "sse": sse,
        "rSquared": Decimal(1) - sse / syy,
        "residualStandardError": residual_standard_error,
        "slopeStandardError": slope_standard_error,
        "slopeConfidence95": (
            slope - margin,
            slope + margin,
        ),
    }


def serialize_group(group: Mapping[str, Any]) -> dict[str, Any]:
    return {
        key: (
            decimal_string(value)
            if isinstance(value, Decimal)
            else value
        )
        for key, value in group.items()
    }


def serialize_regression(
    regression: Mapping[str, Any],
    groups: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    vector_fields = {
        "x",
        "y",
        "fitted",
        "residuals",
        "slopeConfidence95",
    }
    output: dict[str, Any] = {}
    for key, value in regression.items():
        if key in vector_fields:
            output[key] = [decimal_string(item) for item in value]
        elif isinstance(value, Decimal):
            output[key] = decimal_string(value)
        else:
            output[key] = value
    output["inputGroups"] = [
        serialize_group(group) for group in groups
    ]
    return output


def method_record(
    method: str,
    alpha: Decimal,
    points: Sequence[ProjectedPoint],
) -> dict[str, Any]:
    groups = physical_groups(method, points)
    regression = ols(
        tuple(group["x"] for group in groups),
        tuple(group["y"] for group in groups),
    )
    coefficient = FWO_COEFFICIENT if method == "FWO" else Decimal(1)
    energy = (
        -regression["slope"]
        * GAS_CONSTANT
        / coefficient
        / Decimal(1000)
    )
    energy_confidence = tuple(
        -endpoint * GAS_CONSTANT / coefficient / Decimal(1000)
        for endpoint in reversed(regression["slopeConfidence95"])
    )
    return {
        "alpha": decimal_string(alpha),
        "activationEnergyKJPerMol": decimal_string(energy),
        "energyConfidence95KJPerMol": [
            decimal_string(value) for value in energy_confidence
        ],
        "regression": serialize_regression(regression, groups),
    }


def summarize(records: Sequence[Mapping[str, Any]]) -> dict[str, str | int]:
    energies = tuple(
        Decimal(record["activationEnergyKJPerMol"]) for record in records
    )
    mean = sum(energies, Decimal(0)) / Decimal(len(energies))
    sample_sd = (
        sum((value - mean) ** 2 for value in energies)
        / Decimal(len(energies) - 1)
    ).sqrt()
    mean_r_squared = (
        sum(
            Decimal(record["regression"]["rSquared"])
            for record in records
        )
        / Decimal(len(records))
    )
    return {
        "count": len(records),
        "meanActivationEnergyKJPerMol": decimal_string(mean),
        "sampleStandardDeviationKJPerMol": decimal_string(sample_sd),
        "minimumActivationEnergyKJPerMol": decimal_string(min(energies)),
        "maximumActivationEnergyKJPerMol": decimal_string(max(energies)),
        "meanRSquared": decimal_string(mean_r_squared),
    }


def observation_record(point: ProjectedPoint) -> dict[str, Any]:
    return {
        "runId": point.run_id,
        "sheetName": point.sheet_name,
        "sheetIndex": point.sheet_index,
        "replicate": point.replicate,
        "heatingRateKPerMin": decimal_string(point.heating_rate),
        "sourceRows": (
            [point.left_source_row]
            if point.left_source_row == point.right_source_row
            else [point.left_source_row, point.right_source_row]
        ),
        "interpolationFraction": decimal_string(
            point.interpolation_fraction
        ),
        "temperatureC": decimal_string(point.temperature_c),
        "temperatureK": decimal_string(
            point.temperature_c + CELSIUS_OFFSET
        ),
        "dAlphaDtPerMinute": decimal_string(
            point.d_alpha_dt_per_minute
        ),
        "initialMassMg": decimal_string(point.initial_mass_mg),
        "finalMassMg": decimal_string(point.final_mass_mg),
    }


def publication_comparison(
    methods: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    published_means = {
        "FRIEDMAN": Decimal("80.22"),
        "KAS": Decimal("80.67"),
        "FWO": Decimal("85.67"),
    }
    published_per_alpha = {
        "FRIEDMAN": (
            "81.49",
            "80.48",
            "80.80",
            "80.63",
            "79.79",
            "78.59",
            "79.10",
            "80.87",
        ),
        "KAS": (
            "82.77",
            "80.85",
            "80.80",
            "81.19",
            "81.79",
            "79.34",
            "79.11",
            "79.49",
        ),
        "FWO": (
            "87.27",
            "85.61",
            "85.74",
            "86.21",
            "86.21",
            "84.67",
            "84.58",
            "85.04",
        ),
    }
    output: dict[str, Any] = {}
    for method in METHODS:
        expected_mean = Decimal(
            methods[method]["summary"][
                "meanActivationEnergyKJPerMol"
            ]
        )
        expected_values = tuple(
            Decimal(record["activationEnergyKJPerMol"])
            for record in methods[method]["records"]
        )
        printed_values = tuple(
            Decimal(value) for value in published_per_alpha[method]
        )
        output[method] = {
            "publishedMeanKJPerMol": decimal_string(
                published_means[method]
            ),
            "publishedPerAlphaKJPerMol": list(
                published_per_alpha[method]
            ),
            "oracleMeanKJPerMol": decimal_string(expected_mean),
            "publishedMinusOracleMeanKJPerMol": decimal_string(
                published_means[method] - expected_mean
            ),
            "maximumAbsolutePerAlphaDifferenceKJPerMol": decimal_string(
                max(
                    abs(printed - calculated)
                    for printed, calculated in zip(
                        printed_values,
                        expected_values,
                    )
                )
            ),
        }
    return {
        "status": "secondary_context_not_acceptance_oracle",
        "valuesAreContextNotOracle": True,
        "methods": output,
        "quarantinedPublicationIssues": [
            {
                "code": "DIB_PARAFFIN_1_8_COPIED_FROM_PARAFFIN_10",
                "detail": (
                    "Data Brief Table 2 repeats the paraffin-10 per-alpha "
                    "values under paraffin 1.8 mg."
                ),
            },
            {
                "code": "DIB_PARAFFIN_5_COPIED_FROM_COAL",
                "detail": (
                    "Data Brief Table 2 repeats coal per-alpha values under "
                    "paraffin 5 mg."
                ),
            },
            {
                "code": "PARAFFIN_10_TP_CONFLICT",
                "detail": (
                    "Data Brief reports 280.43 °C while Fuel Table 4 "
                    "reports 271 °C."
                ),
            },
            {
                "code": "TERNARY_GLOBAL_MEAN_CONFLICT",
                "detail": (
                    "Data Brief and Fuel report different C/SPT/P global "
                    "means."
                ),
            },
        ],
    }


def build_reference(
    project_root: Path,
    source_path: Path,
    implementation_path: Path,
) -> tuple[bytes, bytes, dict[str, Any]]:
    curves, points = derive_points(source_path)
    csv_bytes = derived_csv_bytes(points)
    by_alpha = {
        alpha: tuple(point for point in points if point.alpha == alpha)
        for alpha in ALPHA_TARGETS
    }
    methods: dict[str, Any] = {}
    for method in METHODS:
        records = [
            method_record(method, alpha, by_alpha[alpha])
            for alpha in ALPHA_TARGETS
        ]
        methods[method] = {
            "formulaId": FORMULA_IDS[method],
            "records": records,
            "summary": summarize(records),
        }
    reference: dict[str, Any] = {
        "schema": REFERENCE_SCHEMA,
        "fixtureId": FIXTURE_ID,
        "oracle": {
            "dependencies": "python-standard-library-only",
            "decimalPrecision": DECIMAL_PRECISION,
            "importsApplicationSource": False,
            "implementationPath": IMPLEMENTATION_RELATIVE_PATH,
            "implementationSha256": sha256_file(implementation_path),
        },
        "source": {
            "path": SOURCE_RELATIVE_PATH,
            "sha256": sha256_file(source_path),
            "bytes": source_path.stat().st_size,
            "datasetDoi": SOURCE_DATASET_DOI,
            "datasetVersion": 1,
            "datasetFileId": SOURCE_DATASET_FILE_ID,
            "datasetLicense": SOURCE_DATASET_LICENSE,
            "articleDoi": ARTICLE_DOI,
            "dataArticleDoi": DATA_ARTICLE_DOI,
            "sample": "Commercial paraffin nominal 10 mg",
            "atmosphere": "N2",
            "heatingRatesKPerMin": [3, 10, 20, 40],
            "replicatesPerRate": 2,
            "runAudits": [
                {
                    "runId": curve.spec.run_id,
                    "sheetIndex": curve.spec.sheet_index,
                    "sheetName": curve.spec.sheet_name,
                    "heatingRateKPerMin": decimal_string(
                        curve.spec.heating_rate
                    ),
                    "replicate": curve.spec.replicate,
                    "rawNumericRows": curve.spec.raw_numeric_rows,
                    "retainedPositiveMassRows": len(curve.points),
                    "firstSourceRow": curve.points[0].source_row,
                    "lastRetainedSourceRow": curve.points[-1].source_row,
                    "initialMassMg": decimal_string(
                        curve.initial_mass_mg
                    ),
                    "finalMassMg": decimal_string(curve.final_mass_mg),
                    "initialTemperatureC": decimal_string(
                        curve.points[0].temperature_c
                    ),
                    "finalRetainedTemperatureC": decimal_string(
                        curve.points[-1].temperature_c
                    ),
                }
                for curve in curves
            ],
        },
        "scientificPolicy": {
            "alphaGrid": "0.1 through 0.8 in 0.1 increments",
            "rowRule": (
                "After StartOfData retain numeric rows with time>=0, "
                "temperature>=0, and mass>0; do not sort source rows. Small "
                "pre-ramp temperature fluctuations remain in provenance, "
                "while the selected alpha 0.1-0.8 branch must increase."
            ),
            "conversionRule": "(W0-Wt)/(W0-Wf)",
            "massAnchorRule": (
                "W0 is the first retained positive mass and Wf the last "
                "retained positive mass in each physical replicate."
            ),
            "crossingRule": (
                "Exactly one upward and zero downward alpha crossings; "
                "piecewise-linear interpolation; no smoothing or "
                "extrapolation."
            ),
            "derivativeRule": (
                "The positive source Deriv. Weight [%/min] is -dm/dt on an "
                "initial-mass percentage basis. Convert to dAlpha/dt as "
                "(DTG/100)/(1-Wf/W0)."
            ),
            "replicateRule": (
                "At each alpha, arithmetic-mean temperature and derivative "
                "in physical scale within heating rate, followed by one "
                "equal-weight OLS input per distinct heating rate."
            ),
            "temperatureRule": "Use source Celsius plus exactly 273.15.",
            "gasConstantJPerMolK": decimal_string(GAS_CONSTANT),
            "publicationValuesAreOracle": False,
        },
        "alphaValues": [decimal_string(value) for value in ALPHA_TARGETS],
        "derivedFixture": {
            "path": DERIVED_RELATIVE_PATH,
            "sha256": sha256_bytes(csv_bytes),
            "rows": len(points),
        },
        "observationsByAlpha": [
            {
                "alpha": decimal_string(alpha),
                "observations": [
                    observation_record(point)
                    for point in by_alpha[alpha]
                ],
            }
            for alpha in ALPHA_TARGETS
        ],
        "methods": methods,
        "publicationComparison": publication_comparison(methods),
    }
    return csv_bytes, canonical_json_bytes(reference), reference


def validate_source_lock(source_path: Path) -> None:
    if source_path.stat().st_size != SOURCE_BYTES:
        fail(
            "ORACLE_SOURCE_SIZE_MISMATCH",
            (
                f"Expected source size {SOURCE_BYTES}; found "
                f"{source_path.stat().st_size}."
            ),
        )
    actual_hash = sha256_file(source_path)
    if actual_hash != SOURCE_SHA256:
        fail(
            "ORACLE_SOURCE_HASH_MISMATCH",
            f"Expected source SHA-256 {SOURCE_SHA256}; found {actual_hash}.",
        )


def parse_json_file(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text("utf-8"))
    except FileNotFoundError:
        fail("ORACLE_REQUIRED_FILE_MISSING", f"Required file is missing: {path}")
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        fail("ORACLE_JSON_INVALID", f"Invalid JSON at {path}: {error}")
    if not isinstance(value, dict):
        fail("ORACLE_JSON_INVALID", f"JSON root must be an object: {path}")
    return value


def verify_manifest(
    project_root: Path,
    manifest_path: Path,
) -> None:
    manifest = parse_json_file(manifest_path)
    if (
        manifest.get("schema") != MANIFEST_SCHEMA
        or manifest.get("fixtureId") != FIXTURE_ID
    ):
        fail(
            "ORACLE_MANIFEST_INVALID",
            "Manifest schema or fixtureId does not match the oracle.",
        )
    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        fail("ORACLE_MANIFEST_INVALID", "Manifest files must be non-empty.")
    for lock in files:
        if not isinstance(lock, dict):
            fail("ORACLE_MANIFEST_INVALID", "Invalid manifest file lock.")
        portable_path = lock.get("path")
        expected_hash = lock.get("sha256")
        expected_bytes = lock.get("bytes")
        if (
            not isinstance(portable_path, str)
            or not isinstance(expected_hash, str)
            or not SHA256_PATTERN.fullmatch(expected_hash)
            or not isinstance(expected_bytes, int)
            or expected_bytes < 0
        ):
            fail(
                "ORACLE_MANIFEST_INVALID",
                f"Invalid manifest lock: {lock!r}.",
            )
        path = resolve_project_path(
            project_root,
            f"{FIXTURE_ROOT_RELATIVE_PATH}/{portable_path}",
        )
        if path.stat().st_size != expected_bytes:
            fail(
                "ORACLE_MANIFEST_SIZE_MISMATCH",
                f"Manifest size mismatch for {portable_path}.",
            )
        if sha256_file(path) != expected_hash:
            fail(
                "ORACLE_MANIFEST_HASH_MISMATCH",
                f"Manifest hash mismatch for {portable_path}.",
            )


def compare_bytes(path: Path, expected: bytes, code: str) -> None:
    try:
        actual = path.read_bytes()
    except FileNotFoundError:
        fail("ORACLE_REQUIRED_FILE_MISSING", f"Required file is missing: {path}")
    if actual != expected:
        fail(code, f"Stored artifact does not match regeneration: {path}")


def write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def parse_arguments(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--source", default=SOURCE_RELATIVE_PATH)
    parser.add_argument("--implementation", default=IMPLEMENTATION_RELATIVE_PATH)
    parser.add_argument("--manifest", default=MANIFEST_RELATIVE_PATH)
    parser.add_argument("--derived", default=DERIVED_RELATIVE_PATH)
    parser.add_argument("--reference", default=REFERENCE_RELATIVE_PATH)
    parser.add_argument("--emit-csv")
    parser.add_argument("--emit-json")
    parser.add_argument("--check", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    arguments = parse_arguments(argv)
    project_root = Path(arguments.project_root).resolve()
    source_path = resolve_project_path(project_root, arguments.source)
    implementation_path = resolve_project_path(
        project_root,
        arguments.implementation,
    )
    validate_source_lock(source_path)
    csv_bytes, reference_bytes, reference = build_reference(
        project_root,
        source_path,
        implementation_path,
    )

    emitted = False
    if arguments.emit_csv:
        write_bytes(
            resolve_project_path(project_root, arguments.emit_csv),
            csv_bytes,
        )
        emitted = True
    if arguments.emit_json:
        write_bytes(
            resolve_project_path(project_root, arguments.emit_json),
            reference_bytes,
        )
        emitted = True

    if arguments.check:
        derived_path = resolve_project_path(project_root, arguments.derived)
        reference_path = resolve_project_path(
            project_root,
            arguments.reference,
        )
        compare_bytes(
            derived_path,
            csv_bytes,
            "ORACLE_DERIVED_FIXTURE_MISMATCH",
        )
        compare_bytes(
            reference_path,
            reference_bytes,
            "ORACLE_EXPECTED_OUTPUT_MISMATCH",
        )
        verify_manifest(
            project_root,
            resolve_project_path(project_root, arguments.manifest),
        )

    status = (
        "PASS"
        if arguments.check
        else "EMITTED"
        if emitted
        else "CALCULATED"
    )
    print(
        json.dumps(
            {
                "status": status,
                "fixtureId": FIXTURE_ID,
                "sourceSha256": SOURCE_SHA256,
                "derivedSha256": sha256_bytes(csv_bytes),
                "referenceSha256": sha256_bytes(reference_bytes),
                "oracleSha256": reference["oracle"][
                    "implementationSha256"
                ],
                "rows": 64,
                "meanActivationEnergyKJPerMol": {
                    method: reference["methods"][method]["summary"][
                        "meanActivationEnergyKJPerMol"
                    ]
                    for method in METHODS
                },
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OracleError as error:
        print(
            json.dumps(
                {
                    "status": "FAIL",
                    "code": error.code,
                    "message": error.message,
                },
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        raise SystemExit(2)
