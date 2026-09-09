# Platform Validation Protocol — Technical English Edition

> This is the standalone technical-English edition of the immutable v0.2
> protocol. The byte-bound historical source remains at
> [`PLATFORM_VALIDATION_PROTOCOL.md`](../../PLATFORM_VALIDATION_PROTOCOL.md).

**Status:** Prepared; a direct local macOS/Chrome automated diagnostic is retained, but the current locked release has not yet completed the human-reviewed macOS or real hosted Windows 11/macOS/Ubuntu 24.04 matrix required to close the gates.  
**Release under test:** `release/Activation-Energy-Studio-v0.2.0.html`  
**Acceptance gates:** AC-PLAT-01, AC-PLAT-02, AC-PLAT-03.

This protocol records evidence; its existence is not a platform PASS.

## Local diagnostic boundary

`scripts/run-local-macos-platform-diagnostic.mjs` runs the same locked golden
flow on a direct local macOS host without Parallels. It is intentionally not a
platform-run recorder: it accepts no hosted identity fields, refuses GitHub
Actions, emits no human observer confirmation, and creates no
`platform-run-input.*.draft.json`.

The current ten-file bundle is retained at
`evidence/platform/local-macos/v0.2.0-current-release/` with claim state
`LOCAL_AUTOMATED_DIAGNOSTIC_NOT_PLATFORM_EVIDENCE`. It proves that this exact
release completed the automated `file://` offline flow in the recorded local
Chrome runtime. It does not close AC-PLAT-01, substitute for human inspection,
or provide Windows 11/Ubuntu evidence. See `BROWSER_VALIDATION_ATTEMPT.md`.

## Fixed inputs and outputs

Use the exact release artifact listed in `release/SHA256SUMS.txt`. The fixed
golden input is `examples/synthetic_kas_150.csv`, SHA-256
`eeafd2d8a1dc11c385bc2906800b9b1d5647451a64cd400eafd50a83579f8b19`.
It contains four runs (5, 10, 20, 40 K/min), alpha 0.10–0.90, and is constructed
so KAS returns 150 kJ/mol. Use these exact context values on every platform:
project name `Platform golden`, sample `synthetic-kas`, process
`multi-rate thermal decomposition`, atmosphere `N2`, and stage
`supplied-alpha 0.10-0.90 window`. Leave the numeric stage-window controls blank
because alpha is supplied. Use the default alpha grid 0.10–0.90, all four
isoconversional methods, `min R^2 warning=0.98`, and no Kissinger result because
this fixture contains no beta–Tp table. Copy the input file unchanged; do not
re-export it through a spreadsheet app.

The locale-ingestion controls are the checked-in release files
`Platform-Locale-English-dot.csv`, `Platform-Locale-Turkish-comma.csv`, and
`Platform-Locale-Mixed-invalid.csv`. Their hashes are part of
`release/SHA256SUMS.txt`; do not reconstruct them by hand.

## In-app scientific self-test (preliminary evidence)

Before the manual upload/export path, click **Run scientific self-test**.
The self-test uses the embedded bytes of `synthetic_kas_150.csv` and the actual
CSV ingestion → adapter → scientific-core path. It must show `PASS`, 11/11
checks, input SHA-256
`eeafd2d8a1dc11c385bc2906800b9b1d5647451a64cd400eafd50a83579f8b19`, and
scientific-payload SHA-256
`2b53c8311cf5b4fda612a455d92e00a6e3b9eaa6ad24e293430af05ee4eae2ba`.
This value is not a direct JSON hash of the raw full-precision results. Raw
results are retained unchanged in the record. The hash contract converts Ea to
strings with six decimal places, R² to strings with twelve decimal places, and
α values and thresholds to strings with six decimal places, while preserving
categorical fields and array order exactly. This versioned canonicalization
eliminates the maximum observed last-bit difference of `1.4211e-13 kJ/mol`
between Chrome 150 and Node/jsdom without weakening the scientific content.
The locked v0.2.0 scientific-build fingerprint is
`38a8d33c1d1d90e361078ae98bb4721dee6442e16453166df4219bc69f29d0a7`.
Download **Platform evidence JSON** before closing the page. The JSON records the
browser runtime, scientific build fingerprint, method/formula contracts, all
36 exact Ea/r²/n results, individual checks, and the explicit
`NOT_CLOSED_BY_SELF_TEST` boundary.

The expected numeric envelopes are FWO 152.000–152.500, KAS
149.999–150.001, Starink 150.250–150.310, and conditional Friedman
150.250–150.380 kJ/mol at nine alpha values, with four observations per
regression and r² ≥ 0.9999995. These method-specific envelopes are a software
fixture contract, not experimental accuracy claims and not permission to pool
the four methods into one material constant.

The current `platform-run-input/v1` CLI independently requires the eight
retained artifacts below, including `selfTestJson`; the self-test JSON does not replace the exported
report, HAR, screenshot, or observer confirmations. A self-test `PASS` is
preliminary runtime evidence only. A self-test `FAIL` is fail-closed and
prevents a platform PASS until investigated and repeated on the same release.

For each operating system, retain:

- OS edition/build, CPU architecture, browser name/version;
- release SHA-256 and every input SHA-256;
- a HAR 1.2 browser network log covering page open, upload, analysis, and all
  three exports, with creator/version, at least one page, non-negative load
  timings, and at least one retained local-page request;
- the downloaded `activation-energy-platform-self-test-v0.2.0-pass.json`;
- exported JSON, CSV, and PDF;
- a PNG/JPEG/WebP screen capture of at least 1,024 bytes and 640×360 pixels,
  showing final status, methods, common alpha range, and warnings;
- observer name, UTC start/end time, and any deviation from this protocol.

The recorder validates the screenshot container, byte size, and dimensions, but
does not interpret its visible content. A human must inspect the retained image
or screen recording before either platform gate can close.

## Machine-readable retained-run record

After one operating-system run is complete, create a run-input JSON at the
platform evidence root and keep captured bytes under `retained/<os>/`. The
excerpt below follows the generated external-kit's Windows 11 layout. All
artifact paths are confined relative paths from that JSON. Every `sha256` is
the tester's independently recorded full-file SHA-256, not a placeholder
generated by the evidence command.

```json
{
  "schemaVersion": "activation-energy-studio/platform-run-input/v1",
  "runId": "gha-windows11-9000-1",
  "observer": {
    "name": "Tester name",
    "organization": "Optional organization"
  },
  "startedAt": "2026-07-18T10:00:00.000Z",
  "endedAt": "2026-07-18T10:10:00.000Z",
  "environment": {
    "os": {
      "family": "windows11",
      "edition": "Windows 11 Pro",
      "build": "26100.4652",
      "architecture": "arm64"
    },
    "runtime": {
      "documentProtocol": "file:",
      "onlineStateDuringRun": false,
      "userAgent": "full navigator.userAgent value",
      "javascriptEngine": "browser-reported engine/version"
    },
    "browser": {
      "name": "Google Chrome (headless)",
      "version": "full version",
      "engine": "Chromium full version",
      "navigatorLanguage": "en-US",
      "navigatorLanguages": ["en-US", "tr-TR"]
    },
    "locale": {
      "osLocale": "en-US",
      "timeZone": "Europe/Istanbul",
      "decimalSeparator": "."
    }
  },
  "protocol": {
    "offlineMode": true,
    "declaredExternalRequestAttempts": 0,
    "networkCapture": {
      "format": "HAR",
      "complete": true,
      "capturedWhileOffline": true,
      "covers": [
        "page-open",
        "upload",
        "analysis",
        "json-export",
        "csv-export",
        "pdf-export"
      ]
    },
    "operatorConfirmations": {
      "releaseAndInputHashesChecked": true,
      "contextValuesRecorded": true,
      "analysisCompleted": true,
      "allExportsSaved": true,
      "networkLogSavedBeforeReconnect": true
    },
    "deviations": []
  },
  "artifacts": {
    "release": { "path": "Activation-Energy-Studio-v0.2.0.html", "sha256": "64 hexadecimal characters" },
    "goldenInput": { "path": "Platform-Golden-synthetic_kas_150.csv", "sha256": "64 hexadecimal characters" },
    "selfTestJson": { "path": "retained/windows11/activation-energy-platform-self-test-v0.2.0-pass.json", "sha256": "64 hexadecimal characters" },
    "reportJson": { "path": "retained/windows11/platform-golden.json", "sha256": "64 hexadecimal characters" },
    "reportCsv": { "path": "retained/windows11/platform-golden-results.csv", "sha256": "64 hexadecimal characters" },
    "reportPdf": { "path": "retained/windows11/platform-golden-report.pdf", "sha256": "64 hexadecimal characters" },
    "networkHar": { "path": "retained/windows11/network.har", "sha256": "64 hexadecimal characters" },
    "screenshot": { "path": "retained/windows11/final-state.png", "sha256": "64 hexadecimal characters" }
  }
}
```

From a full repository checkout, validate the retained set and write its
deterministic record:

```bash
npm run record:platform-evidence -- \
  --manifest evidence/platform/platform-run-input.windows11.json \
  --output evidence/platform/retained/windows11/evidence-record.json
```

From the generated external-validation-kit root, run the packaged owner-side
tool instead:

```bash
node tools/create-platform-evidence-record.mjs \
  --manifest 01-platform/platform-run-input.windows11.json \
  --output 01-platform/retained/windows11/evidence-record.json
```

The command fails before writing the record when metadata is missing; any
declared hash differs; the release or golden-input hash differs from
`release/SHA256SUMS.txt`; JSON context/configuration differs from this protocol;
the self-test is not the exact 11/11 PASS boundary/input/payload/build record or
falls outside the run interval; CSV rows differ from JSON results; the
screenshot container/size/dimensions are invalid; the HAR lacks creator,
page/timing/local-entry evidence; or the HAR contains any HTTP(S)/WebSocket
request. Its canonical scientific JSON SHA-256 is computed by
`compare-scientific-reports.mjs`. A successfully created record is
evidence for **one retained run only** and explicitly does not mark AC-PLAT-01 or
AC-PLAT-02 as PASS. OS, browser, runtime, locale, and operator-confirmation
fields remain observer-declared and are labelled as such in the output; the CLI
checks their completeness and internal consistency but does not independently
attest the tester's machine identity.

## One controlled run per platform

1. Verify the HTML and fixture hashes before opening the app.
2. Disconnect networking or set the browser network condition to **Offline**.
3. Clear the browser network log, preserve it, and open the local HTML file.
4. Run the in-app scientific self-test, confirm 11/11 `PASS`, download its JSON,
   and keep the page-open network log running. Do not infer a platform PASS from
   this preliminary record.
5. Load the fixed four-run fixture. Confirm mapping/units; do not change data.
6. Enter the exact project/sample/process/atmosphere/stage context and analysis
   configuration listed above; record a screenshot of those values.
7. Run all eligible methods. Confirm FWO, KAS, Starink and conditional Friedman;
   keep Kissinger separate and run it only when the fixed beta-Tp fixture is present.
8. Export JSON, CSV, and PDF. Save the network log before reconnecting.
9. Record HTTP(S)/WebSocket request attempts. The required value is **0**;
   the initial local `file://` document is not an external network request.
10. Record the browser's effective language (`navigator.language`) and preferred
   language list. Run the locale-ingestion controls once with browser/OS locale
   `en-US` and once with `tr-TR`: the English-dot and Turkish-comma files must
   normalize to the same canonical row. In both locale settings the mixed file
   must remain fail-closed, including after an explicit comma-decimal choice.
   Retain screenshots and the normalized-row/error JSON. The full golden
   scientific report comparison still uses the exact fixed context above.

Target environments are Windows 11, the supported macOS release, and Ubuntu
22.04 or newer. For the release gate, only the fixed GitHub-hosted matrix below
is admissible. A direct/local run or another VM may be retained as diagnostic
evidence, but it cannot replace a hosted source record or the three-OS matrix.

### Hosted GitHub Actions profile

Parallels is not a prerequisite for this protocol. The approved hosted matrix
uses only the following fixed GitHub runner labels and recorder families:

| Runner label | Recorder OS family |
|---|---|
| `ubuntu-24.04` | `ubuntu` |
| `macos-15` | `macos` |
| `windows-11-arm` | `windows11` |

Do not replace these labels with `ubuntu-latest`, `macos-latest`, or
`windows-latest`. In particular, `windows-latest` is a Windows Server image and
must not be recorded as Windows 11. There is no Windows Server fallback in the
required matrix. A fixed runner label does not freeze its underlying image, so
the retained environment record must include the actual OS edition/build,
architecture, runner label, `ImageOS`, `ImageVersion`, and browser version
observed during the run. GitHub currently documents `windows-11-arm` as public
preview; label availability is therefore a pre-run prerequisite, not an
assumption.

The manual `workflow_dispatch` definition is
`.github/workflows/platform-validation.yml`. It pins the three supporting
GitHub actions to immutable commit SHA values, uses Node.js `22.22.3`, lockfile
installation through `npm ci`, `fail-fast: false`, and explicitly fixes the
Node architecture to `x64` on Ubuntu and `arm64` on macOS/Windows. The harness
refuses a mismatch with the running Node process. It invokes:

```text
node scripts/run-hosted-platform-validation.mjs --os <family> --runner-label <label> --node-arch <arm64|x64> --output output/hosted-platform/<family>
```

Repository checkout, Node/dependency setup, and artifact upload may use the
network before or after the controlled browser interval. During the scientific
run, however, the browser must be offline and the locked release must be opened
through `file://`; the browser capture must be finalized before the workflow
uploads artifacts. This is browser-scoped offline evidence, not a claim that
the Actions runner or control plane was physically disconnected.

Each matrix job first runs the opt-in real Chrome Worker integration probe with
the production discovery/configuration helpers. Hosted discovery permits only
the exact platform system installation path and its approved realpath:
macOS `/Applications`, Linux `/usr/bin` or the official `/opt/google/chrome`
root, and the exact Windows executable below `ProgramFiles`,
`PROGRAMFILES(X86)`, or `LOCALAPPDATA`. A lookalike suffix below `/tmp` or
another arbitrary root is rejected. The expected major is commit-controlled at
`150`, and a product/major/path mismatch fails closed.
The exact observed Chrome patch version and runner `ImageVersion` remain in the
retained run metadata.

The workflow uploads available retained evidence and failure diagnostics with a
commit-pinned `actions/upload-artifact` v6 action even when a matrix job fails.
Missing output is an upload error, retention is requested for 90 days, and the
10-minute Worker-probe plus 35-minute browser-step timeouts stay inside the
60-minute job boundary to leave setup margin and time for that upload.
The harness reapplies offline mode after local navigation, monitors attached
descendant targets, records page/iframe offline emulation separately from
pre-resume Worker/SharedWorker external-protocol blocking, retains action
markers, and requires Chrome download completion plus stable bytes. Every hosted result remains
`AUTOMATED_RUN_EVIDENCE_AWAITING_HUMAN_REVIEW`. A green workflow, a valid
one-run evidence record, or a matching three-OS matrix does not close
AC-PLAT-01 or AC-PLAT-02. The raw network capture, visible
screenshot/recording, exported PDF/CSV/JSON, and declared runner/OS/browser
identity still require human review under the PASS rule below.

This hosted profile cannot execute from an unconnected local directory. A real
run requires a GitHub repository/remote, GitHub Actions enabled, and access to
all three fixed runner labels. The full operator and review instructions are in
`HOSTED_PLATFORM_VALIDATION.md`.

## Hash and comparison commands

macOS/Linux artifact hash:

```bash
shasum -a 256 Activation-Energy-Studio-v0.2.0.html
```

Windows PowerShell artifact hash:

```powershell
Get-FileHash .\Activation-Energy-Studio-v0.2.0.html -Algorithm SHA256
```

After copying the three exported JSON reports to one machine, a full repository
checkout uses:

```bash
node scripts/compare-scientific-reports.mjs \
  evidence/platform/retained/macos/platform-golden.json \
  evidence/platform/retained/windows11/platform-golden.json \
  evidence/platform/retained/ubuntu/platform-golden.json
```

From the generated external-validation-kit root, use:

```bash
node tools/compare-scientific-reports.mjs \
  01-platform/retained/macos/platform-golden.json \
  01-platform/retained/windows11/platform-golden.json \
  01-platform/retained/ubuntu/platform-golden.json
```

The comparator removes only `generatedAt`, sorts object keys, applies **no
numeric tolerance**, prints each canonical SHA-256, and reports the first exact
difference. Project names, source hashes, formulas, diagnostics, and all numeric
values remain in scope.

After all three one-run evidence records validate, create the deterministic
platform matrix. A full repository checkout uses:

```bash
npm run record:platform-matrix -- \
  --record evidence/platform/retained/macos/evidence-record.json \
  --record evidence/platform/retained/windows11/evidence-record.json \
  --record evidence/platform/retained/ubuntu/evidence-record.json \
  --output evidence/platform/retained/platform-matrix-record.json
```

From the generated external-validation-kit root, use:

```bash
node tools/create-platform-matrix-record.mjs \
  --record 01-platform/retained/macos/evidence-record.json \
  --record 01-platform/retained/windows11/evidence-record.json \
  --record 01-platform/retained/ubuntu/evidence-record.json \
  --output 01-platform/retained/platform-matrix-record.json
```

The matrix requires the exact `macos`, `windows11`, and `ubuntu` set; distinct
run IDs and retained record files; common release, golden-input,
scientific-build, self-test-payload, and canonical scientific-report hashes; a
PASS self-test boundary; and zero external requests for every run. It preserves
`AWAITING_HUMAN_VISUAL_REVIEW` and explicitly does not assign a platform PASS.

## Hash-bound human platform review record

Parallels is not required for this review step. After the three hosted runs,
their one-run evidence records, and the deterministic matrix have been retained,
place one review-input JSON at a common evidence root. Every referenced path is
a portable relative path confined to the directory containing that input. Every
declared hash is a lowercase SHA-256 of the actual retained file.

The input uses
`activation-energy-studio/platform-human-review-input/v1` and has exactly these
top-level fields:

The following JSON is a field-shape excerpt. It becomes recorder-valid only
after `platformReviews` contains all three OS entries and each entry contains all
six decisions listed below.

```json
{
  "schemaVersion": "activation-energy-studio/platform-human-review-input/v1",
  "reviewId": "platform-human-review-2026-07-18",
  "locks": {
    "matrix": {
      "path": "platform-matrix-record.json",
      "sha256": "64 lowercase hexadecimal characters"
    },
    "sourceRecords": [
      {
        "osFamily": "macos",
        "path": "retained/macos/evidence-record.json",
        "sha256": "64 lowercase hexadecimal characters"
      },
      {
        "osFamily": "windows11",
        "path": "retained/windows11/evidence-record.json",
        "sha256": "64 lowercase hexadecimal characters"
      },
      {
        "osFamily": "ubuntu",
        "path": "retained/ubuntu/evidence-record.json",
        "sha256": "64 lowercase hexadecimal characters"
      }
    ]
  },
  "reviewer": {
    "name": "Real reviewer name",
    "affiliation": "Real affiliation",
    "professionalProfile": "Persistent professional-profile reference",
    "role": "Platform evidence reviewer",
    "relevantExperience": "Relevant QA and platform-review experience",
    "declarations": {
      "personallyReviewedAllReferencedEvidence": true,
      "understandsIdentityIsNotAuthenticatedBySoftware": true,
      "understandsAcceptanceGatesAreNotAutomaticallyClosed": true
    }
  },
  "review": {
    "startedAtUtc": "2026-07-18T11:00:00.000Z",
    "endedAtUtc": "2026-07-18T12:00:00.000Z",
    "recordedAtUtc": "2026-07-18T12:05:00.000Z",
    "environment": {
      "operatingSystem": "Reviewer workstation OS",
      "browser": "Reviewer browser and version",
      "locale": "Reviewer locale"
    }
  },
  "platformReviews": [
    {
      "osFamily": "macos",
      "runId": "exact runId from the macOS source record",
      "sourceRecordSha256": "exact SHA-256 of retained/macos/evidence-record.json",
      "startedAtUtc": "2026-07-18T11:00:00.000Z",
      "endedAtUtc": "2026-07-18T11:15:00.000Z",
      "artifacts": {
        "hostedRunMetadata": {
          "path": "retained/macos/hosted-run-metadata.json",
          "sha256": "64 lowercase hexadecimal characters"
        },
        "hostedWorkflowPreflight": {
          "path": "retained/macos/hosted-workflow-preflight.json",
          "sha256": "64 lowercase hexadecimal characters"
        },
        "hostedUploadReceipt": {
          "path": "retained/macos/hosted-upload-receipt.json",
          "sha256": "64 lowercase hexadecimal characters"
        },
        "networkHar": {
          "path": "retained/macos/network.har",
          "sha256": "64 lowercase hexadecimal characters"
        },
        "screenshot": {
          "path": "retained/macos/final-state.png",
          "sha256": "64 lowercase hexadecimal characters"
        },
        "reportPdf": {
          "path": "retained/macos/platform-golden-report.pdf",
          "sha256": "64 lowercase hexadecimal characters"
        },
        "reportJson": {
          "path": "retained/macos/platform-golden.json",
          "sha256": "64 lowercase hexadecimal characters"
        },
        "reportCsv": {
          "path": "retained/macos/platform-golden-results.csv",
          "sha256": "64 lowercase hexadecimal characters"
        }
      },
      "decisions": [
        {
          "id": "HAR_NETWORK",
          "reviewStatus": "REVIEWED",
          "decision": "PASS",
          "reviewedEvidenceSha256": [
            "exact source-record SHA-256",
            "exact hosted-metadata SHA-256",
            "exact HAR SHA-256"
          ],
          "comment": "Non-placeholder reviewer finding."
        }
      ]
    }
  ],
  "reviewerMatrixDisposition": "PASS"
}
```

`platformReviews` must contain one unique entry for each of `macos`,
`windows11`, and `ubuntu`; the example shows only the macOS shape. Each entry
must contain all eight artifacts shown above and exactly one `REVIEWED` decision
for each of these six IDs:

1. `HAR_NETWORK`
2. `SCREENSHOT_UI`
3. `PDF_VISUAL_QA`
4. `JSON_CSV_PDF_CONSISTENCY`
5. `RUNNER_OS_ARCH_IDENTITY`
6. `DEVIATIONS`

Locale/mixed-decimal behavior is not a platform human-review decision in this
record. AC-PLAT-03 is governed by its separate automated locale matrix and must
not be silently re-opened, duplicated, or claimed from the ordinary golden
report CSV. Supplementary locale observations may be retained as notes, but
they cannot be represented as a hash-bound decision unless dedicated locale
artifacts and a separate evidence contract are added.

Every decision's `reviewedEvidenceSha256` set must equal the recorder-defined
set of actual source-record, hosted-metadata, and retained-artifact hashes for
that decision. `RUNNER_OS_ARCH_IDENTITY` additionally includes the exact
`hosted-workflow-preflight.json` and `hosted-upload-receipt.json` hashes. The
preflight file must be byte-identical to the hosted metadata descriptor and
must match the fixed runner, GitHub environment, workflow, run, commit, image,
runtime, and pre-run timestamp. The receipt must reproduce the GitHub
Actions artifact ID, name, URL, SHA-256 digest, run/attempt, repository,
workflow, commit, and a capture time after the run and before review. Its
explicit boundary is a declared upload output, not software authentication of
GitHub or the reviewer. `DEVIATIONS` additionally has a
`deviationAssessments` array with one item for every unique deviation in the
source record:

```json
{
  "deviation": "exact source-record deviation text",
  "disposition": "ACCEPTED_NON_MATERIAL",
  "comment": "Non-placeholder reviewer assessment."
}
```

The only other deviation disposition is `MATERIAL_FAILURE`; it requires the
`DEVIATIONS` decision and the derived matrix disposition to be `FAIL`. Any other
per-OS `FAIL` likewise prevents an overall `PASS`, but a coherent negative review
can still be recorded without losing the failure evidence.

Run the fail-closed recorder directly from a repository checkout:

```bash
node scripts/record-platform-human-review.mjs \
  --input evidence/platform/platform-human-review-input.json \
  --output evidence/platform/platform-human-review-record.json
```

From the generated external-validation-kit root, use the packaged dependency
and recorder instead:

```bash
node tools/record-platform-human-review.mjs \
  --input 01-platform/platform-human-review-input.json \
  --output 01-platform/platform-human-review-record.json
```

The recorder reads the actual matrix bytes and all three actual source-record
files, checks every declared SHA-256, and recomputes the deterministic matrix
from those source files. It also cross-checks each
`hosted-run-metadata.json` against the source record: exact GitHub origin and
run URL, fixed workflow/ref/action pins, hosted provenance, runner label, OS,
architecture, run ID/attempt, commit, run interval, browser runtime, locale,
and decimal separator. It also validates and byte-binds the retained workflow
preflight before verifying the HAR, screenshot, PDF, JSON, and CSV bytes
against both the review input and source-record hashes. Missing, duplicate,
unknown, placeholder, unreviewed, hash-mismatched, contradictory, or falsely
passing input fails before output is written.

A successful output from `record-platform-human-review.mjs` has record state
`STRUCTURALLY_VALIDATED_REQUIRES_INDEPENDENT_AUTHENTICITY_AUDIT`.
`eligibleForHumanGateDisposition` only reports whether the recorded decisions
are internally eligible for later human gate disposition. The output always
retains `acceptanceGateStatus: NOT_AUTOMATICALLY_APPLIED` and
`authenticityStatus: NOT_VERIFIED_BY_SOFTWARE`. The recorder does not
authenticate the named reviewer and never marks AC-PLAT-01, AC-PLAT-02, or any
other acceptance criterion `PASS`.

## PASS rule

AC-PLAT-01 can pass only when the full golden path succeeds offline and the
retained runtime log contains zero external requests. The in-app self-test must
also pass, but never closes AC-PLAT-01 by itself. AC-PLAT-02 can pass only
when all three environments use the same release/input hashes and the canonical
scientific JSON comparator and deterministic platform matrix pass. The raw HAR,
screen capture/recording, and observer-declared machine identity must still be
audited by a human. The English-dot, Turkish-comma, and fail-closed
mixed-decimal controls are retained in the platform handoff as supplementary
QA. They do not reopen AC-PLAT-03: that separate acceptance criterion is proven
by the hash-bound automated locale matrix and ambiguity-refusal tests named in
the P0 evidence ledger. Missing logs, artifacts, or human review keep
AC-PLAT-01/02 `NOT TESTED`/`PARTIAL`; they do not demote the independent
AC-PLAT-03 proof.
