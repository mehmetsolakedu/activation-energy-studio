# Independent Scientific Review Runbook

**State:** Prepared test procedure; no independent observation or sign-off has
yet been recorded.

This runbook fixes the cases used to complete AC-SCI-03 and AC-VAL-05. It does
not prescribe a PASS. The reviewer must record what the locked release actually
does and use `FAIL` when an expected scientific boundary is absent, hidden, or
misleading.

## 1. Verify the transferred package

From the package root:

```bash
node evidence/scripts/generate-scientific-review-package.mjs \
  --project-root evidence --output .. --check
```

Record the release, release-manifest, and review-package-manifest hashes before
opening the application. A mismatch stops the review.

## 2. Fixed review context

Use a clean browser profile at 100% zoom and record the OS, browser version, and
locale. For curve cases use:

- project: `Scientific independent review v0.2.0`;
- sample: the value already present in the fixture;
- process/stage: `synthetic mass-loss review; fixture-defined alpha window`;
- atmosphere: the value already present in the fixture;
- isoconversional methods: FWO, KAS, Starink, and conditional Friedman;
- alpha grid: the common fixture alpha range without extrapolation.

Do not manually suppress warnings or repair a refused case.

## 3. Locked cases

Paths below are relative to the transferred package root.

| Case | Files | Required use | Expected target, not a forced verdict |
|---|---|---|---|
| `W2_C1` | `evidence/evidence/usability/v0.2.0/study_bundle/W2_synthetic_kas_150.csv` + `C1_peaks.tsv` | Main UI/PDF/CSV/JSON audit; four isoconversional methods plus separate Kissinger | `NUMERICAL_DERIVATIVE` remains visible; Kissinger is a separate peak result |
| `W3` | `evidence/evidence/usability/v0.2.0/study_bundle/W3_low_r2.csv` | Partial/diagnostic export audit | `LOW_R2` remains attached to affected results and exports |
| `W4` | `evidence/evidence/usability/v0.2.0/study_bundle/W4_multistep.csv` | Cross-alpha divergence audit | `MULTISTEP_EA_VARIATION` remains visible; no averaging hides divergence |
| `R1` | `evidence/evidence/usability/v0.2.0/study_bundle/R1_two_rates.csv` | Refusal-state audit | `INSUFFICIENT_DISTINCT_HEATING_RATES`; no successful export is implied |
| `R2` | `evidence/evidence/usability/v0.2.0/study_bundle/R2_no_common_alpha.csv` | Independent refusal confirmation | `NO_COMMON_ALPHA_RANGE`; no extrapolated result is produced |
| `PAPER010` | `evidence/tests/fixtures/real/paper010_rh_t_alpha_beta.csv`; S4 `pone.0173946.s004.xlsx`; S5 `pone.0173946.s005.xlsx` in the same retained source tree | Real-data KAS/FWO/Starink/Friedman comparison and negative publication-method audit at alpha 0.05–0.80 | All four per-alpha paths follow the independent Decimal reference; Friedman uses official supplied -DTG; S2-raw/S4/S5 diagnostic remains explicitly nonstandard |
| `PAPER063` | `evidence/tests/fixtures/real/paper063/paper063_kissinger_peaks.csv` plus its `provenance.json`, `expected-output.json`, and production-path test | Standalone Kissinger calculation from five publication-printed β–Tp pairs | Ea and R² follow the retained independent reference; the evidence stays labelled publication-derived, whole-kelvin rounded, non-raw, and without a separate dataset licence |

The complete R1–R5, W1–W4, C1, and UX01 bundle and its SHA-256 manifest are
retained so the reviewer may inspect additional refusal/warning cases. The
Paper 010 independently checks KAS, FWO, Starink, and the equation-correct
Friedman implementation for this explicit, hashed reduction. It is not
universal experimental ground truth and does not cover Kissinger. Its Friedman
result is conditional on the official supplied -DTG path; the publication's
nonstandard S4 label/value behavior remains negative evidence. Separate
Kissinger interpretation is assessed with `W2_C1`; `PAPER063` adds a separate
publication-derived numerical check of the standalone peak formula, while
`PAPER010` assesses the four-method raw-data software path and retained
publication discrepancy. `PAPER063` is not a second raw-curve dataset and
cannot broaden the alpha-dependent validation claim.
`SECOND_RAW_DATASET_SEARCH.md` preserves the negative acquisition audit and
classifies a second qualifying raw dataset as an open P1 robustness target, not
as evidence that closes either scientific-review gate.

## 4. Evidence capture

Keep evidence outside the immutable package. Suggested portable paths:

```text
observed-review/
  review-input.json
  signed/signed-verdict.pdf
  W2_C1/ui.png
  W2_C1/report.pdf
  W2_C1/results.csv
  W2_C1/results.json
  W3/ui.png
  W3/report.pdf
  W3/results.csv
  W3/results.json
  W4/ui.png
  W4/report.pdf
  W4/results.csv
  W4/results.json
  R1/refusal.png
  R2/refusal.png
  PAPER010/ui.png
  PAPER010/report.pdf
  PAPER010/results.csv
  PAPER010/results.json
```

Every decision must cite at least one retained relative path and its exact
SHA-256. For AC-SCI-03 item 7:

- UI evidence must show the explicit R1/R2 refusal and unavailable successful
  export path;
- PDF/CSV/JSON evidence must use W3 or W4 to show that a partial/warned analysis
  remains machine- and human-readable rather than looking complete;
- the reviewer comment must distinguish “no artifact is allowed for a refused
  analysis” from “a partial artifact exists with attached diagnostics.”

## 5. Decision mapping

- `AC-SCI-03-{UI,PDF,CSV,JSON}-01` through `-06`: primarily `W2_C1`.
- `AC-SCI-03-UI-07`: `R1` and/or `R2`.
- `AC-SCI-03-{PDF,CSV,JSON}-07`: `W3` and/or `W4`, with the UI refusal evidence
  referenced when explaining why a fully refused analysis has no export.
- `AC-VAL-05-01` through `-05` and `-07`: `W2_C1`, supplemented by `W3`/`W4`.
- `AC-VAL-05-06`: `PAPER010` plus
  `evidence/REAL_DATA_VALIDATION_STATUS.md` and the independent reference JSON.

The mapping identifies the minimum auditable case; it does not replace the
reviewer's scientific judgment.

## 6. Complete and validate the record

Copy `SCIENTIFIC_REVIEW_INPUT_TEMPLATE.json` and
`INDEPENDENT_REVIEW_VERDICT_TEMPLATE.md` outside the package. Complete and sign
both representations consistently, then run:

```bash
node evidence/scripts/record-scientific-review.mjs \
  --package . \
  --input ../observed-review/review-input.json \
  --output ../observed-review/evidence-record.json
```

The resulting structural PASS does not authenticate the reviewer or signature
and does not automatically close AC-SCI-03 or AC-VAL-05. The human evidence
custodian must verify identity, expertise, conflict declarations, and the
signature/attestation before applying either gate disposition.
