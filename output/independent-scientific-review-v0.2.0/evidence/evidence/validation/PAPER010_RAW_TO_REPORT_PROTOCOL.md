# Paper010 locked-release raw-to-report technical reproduction protocol

## Purpose and evidence status

This protocol tests the already-built, SHA-locked offline release with genuine
Paper010-derived experimental data in direct local macOS Google Chrome. A
successful run has exactly this status:

`LOCAL_TECHNICAL_REAL_DATA_REPRODUCTION_NOT_INDEPENDENT_REVIEW`

It is technical reproduction evidence. It does not close independent
scientific review, Windows 11, Ubuntu, or usability gates.

Parallels and other virtual-machine platform emulation are outside this
protocol. The runner is restricted to direct local macOS, rejects CI, launches
the installed Google Chrome binary, and makes no Windows or Ubuntu claim.

## Immutable inputs

The runner verifies these locks before opening Chrome:

- `release/Activation-Energy-Studio-v0.2.0.html` against
  `release/SHA256SUMS.txt`.
- Official raw Paper010 S2 workbook, publication-diagnostic S4/S5 workbooks,
  deterministic derived CSV, independent Decimal reference, and the
  standard-library-only oracle against `tests/fixtures/real/manifest.json`.
- Cross-links from the Decimal reference back to the raw source, derived CSV,
  and oracle hashes.

The runner never builds or modifies the release. A changed input hash is a hard
failure.

## Scientific configuration

- Sample: `Rhubarb (RH)`
- Atmosphere: `Simulated air (N2:O2=4:1)`
- Heating rates: 5, 10, and 20 K/min
- Alpha grid: 0.05 through 0.80 in 0.05 increments (16 points)
- Methods: FWO, KAS, Starink, and Friedman
- Expected visible/exported output: 64 isoconversional result rows
- Friedman derivative: supplied `dAlpha/dt [1/min]`; numerical replacement is
  not accepted
- Kissinger: excluded from the analysis and handled as negative evidence

Every energy, confidence-interval endpoint, transformed x/y value, fitted value,
residual, slope, intercept, SSE, R², residual standard error, slope standard
error, slope confidence endpoint, and method mean is compared with the locked
Decimal reference under the tolerances preregistered in the fixture manifest.

Published Paper010 values remain context, not an oracle. The retained
publication comparison must remain
`not_reproduced_from_raw_without_undocumented_preprocessing`.

## Kissinger fail-closed rule

The official S2 global RH DTG maxima are:

| Heating rate (K/min) | Global maximum temperature (°C) | -DTG (%/min) |
| ---: | ---: | ---: |
| 5 | 481.538 | 2.51699 |
| 10 | 295.414 | 4.21304 |
| 20 | 218.626 | 8.20831 |

These global maxima switch physical stages and do not establish a same-stage
β–Tp series. The runner must create a negative-evidence record with
`REFUSED_NO_SAME_STAGE_PEAK_SERIES`, must set
`automaticKissingerResultEmitted=false`, and must not store a Kissinger Ea
value. Same-stage peak windows require a separate scientific justification.

## Browser procedure

The command is:

```sh
node scripts/run-paper010-raw-to-report.mjs \
  --output evidence/validation/paper010-raw-to-report-v0.2.0-local
```

An explicit system Chrome path may be supplied with
`--browser-executable`. The output directory must be new or empty.

The runner performs two independent browser passes. Each pass:

1. opens the locked single-file release through `file:`;
2. switches Chrome to offline mode;
3. sets alpha start/end/step to 0.05/0.80/0.05;
4. uploads the locked derived Paper010 CSV;
5. verifies 64 visible rows, 16 per method, and zero peak/Kissinger rows;
6. exports JSON, CSV, and PDF through the real UI download buttons;
7. captures a full-page PNG and file-only HAR/equivalent request ledger;
8. verifies exported JSON against the Decimal oracle and the CSV against JSON;
9. validates PDF/PNG containers and Chrome download byte counts.

Any external or unsupported network attempt fails the run. A success manifest
is written only after both passes finish.

## Determinism and retained artifacts

The two reports must be byte-equivalent after removing only the declared
volatile `generatedAt` field and stably ordering JSON keys. CSV files must be
byte-for-byte identical. PDF, screenshot, HAR, and raw network files are
individually SHA-256 locked but are not required to match across passes because
they may contain runtime metadata.

The output contains:

- `PAPER010_RAW_TO_REPORT_MANIFEST.json`
- `paper010-kissinger-negative-evidence.json`
- `pass-1/` and `pass-2/`, each containing report JSON, result CSV, report PDF,
  final-state PNG, raw network capture JSON, and offline HAR.

The manifest must retain:

- the exact release/input hashes;
- browser identity and direct local macOS execution path;
- oracle comparison summary and preregistered tolerances;
- exact canonical report and CSV determinism hashes;
- artifact byte counts and SHA-256 hashes;
- `technicalCheckOnly=true`;
- `independentScientificReviewComplete=false`;
- `platformGateClosed=false`;
- `externalScientificGatesClosed=false`.

The retained bundle is rechecked without writing any file:

```sh
node scripts/run-paper010-raw-to-report.mjs \
  --check evidence/validation/paper010-raw-to-report-v0.2.0-local
```

This mode recomputes the current release/input/implementation locks, enforces
the exact path-safe artifact set, rehashes every file, repeats JSON/CSV/oracle,
HAR, PDF, PNG, Kissinger, and two-pass determinism validation, and rejects
missing, extra, substituted, or byte-tampered artifacts.

## Acceptance and rejection

Technical acceptance requires all of the following:

- exact locked inputs and release;
- two complete Google Chrome passes;
- 64 JSON, CSV, and visible isoconversional results;
- all locked Decimal comparisons within preregistered tolerances;
- identical canonical scientific JSON and identical CSV across passes;
- no Kissinger output;
- no external/unsupported network attempt;
- valid retained PDF and screenshot artifacts;
- the exact bounded evidence status stated above.

Partial files without the final manifest are failed diagnostics, not evidence.
Independent reviewer adjudication and the separate platform/usability protocols
remain required after technical acceptance.
