# Hosted Platform Validation

This profile replaces the planned local Parallels route with retained
GitHub-hosted real-browser evidence. It is an execution and evidence-capture
route, not a platform PASS declaration.

## Separate direct-macOS diagnostic

The local command below is deliberately separate from the hosted CLI:

```text
node scripts/run-local-macos-platform-diagnostic.mjs --output evidence/platform/local-macos/v0.2.0-current-release
```

It accepts no `--os` or `--runner-label`, refuses GitHub Actions, never calls
the hosted runner-identity validator, never emits hosted workflow provenance,
and never creates `platform-run-input.*.draft.json`. It reuses only the
browser golden-flow implementation and labels every success
`LOCAL_AUTOMATED_DIAGNOSTIC_NOT_PLATFORM_EVIDENCE`.

The current direct macOS/Chrome run and its ten-file SHA-256 integrity manifest
are recorded in `BROWSER_VALIDATION_ATTEMPT.md`. This local route is useful
technical evidence, but it does not replace the hosted three-OS matrix or the
human review required by the platform protocol.

## Fixed runner matrix

The workflow uses explicit runner labels so that a moving `*-latest` alias
cannot silently change the operating-system target.

| Runner label | Recorder OS family | Node architecture | Required target |
|---|---|---|---|
| `ubuntu-24.04` | `ubuntu` | `x64` | Ubuntu 24.04 x64 hosted VM |
| `macos-15` | `macos` | `arm64` | macOS 15 hosted VM |
| `windows-11-arm` | `windows11` | `arm64` | Windows 11 ARM64 hosted VM |

`windows-latest` is intentionally excluded because it is a Windows Server
runner, not Windows 11 evidence. There is no Windows Server fallback in this
matrix. `windows-11-arm` is the fixed GitHub-hosted Windows 11 ARM64 label and
is currently documented by GitHub as public preview. Availability must be
confirmed before a run. Runner images can still be revised under a fixed label,
so every run must retain the actual OS edition/build, architecture, `ImageOS`,
`ImageVersion`, and browser version reported at execution time.

The matrix also passes the declared Node architecture to `actions/setup-node`
and to the harness. A mismatch with `process.arch` fails closed. Hosted browser
discovery accepts only the exact canonical system Google Chrome installation:
the fixed `/Applications` app on macOS, the fixed `/usr/bin` or official
`/opt/google/chrome` executable on Linux, and the exact Chrome executable below
the declared Windows `ProgramFiles`, `PROGRAMFILES(X86)`, or `LOCALAPPDATA`
root. Both the supplied path and its realpath must satisfy that contract;
suffix-matching paths under `/tmp` or another arbitrary root are rejected.
Chromium fallbacks are forbidden. The expected Chrome major is
commit-controlled at `150`. Any other major fails the run, while the exact
observed four-component Chrome version and runner `ImageVersion` remain in the
retained metadata.

The workflow is
`.github/workflows/platform-validation.yml`, is manual
(`workflow_dispatch`), uses `fail-fast: false`, and runs each matrix member even
if another member fails.

The external validation kit copies a self-contained repository seed under
`01-platform/hosted/`. Its contents—not the enclosing kit directory—must be
placed at the root of the chosen GitHub repository. Copy hidden entries too:
`.github/` contains the workflow and `.gitattributes` preserves LF text bytes
while treating XLSX fixtures as binary. The seed contains the complete
recursive `tests/fixtures/` tree, its retained integrity manifest, the
independent Paper 010 oracle, the hosted contract test, the browser harness,
the locked release/input, and the package lock required by every workflow
command. The kit test executes all three pre-browser workflow commands from a
fresh seed copy, so a missing transitive file fails packaging before handoff.

## Network boundary

GitHub Actions needs network access to check out the repository, provision
Node.js `22.22.3`, run `npm ci`, and upload the retained artifacts. Those setup
and handoff operations are outside the scientific browser-run interval.

During the validation interval, the harness must:

1. launch the real browser against the locked local HTML through `file://`;
2. put the browser context into offline mode before opening the application,
   repeat the offline command after the `file://` navigation, and verify
   `navigator.onLine === false` before the self-test;
3. capture the page and every attached descendant target, failing closed on an
   unobserved or unsupported target;
4. retain UTC and monotonic action markers across page open, upload, analysis,
   and all three exports;
5. accept each download only after Chrome reports its GUID as `completed` and
   the final file size is stable before hashing;
6. close the browser and finalize the capture before artifact upload.

Chrome's Worker target does not support the same offline-emulation command as a
page. The harness therefore records the mechanism per target: page/iframe
sessions receive offline network emulation, while Worker/SharedWorker sessions
are paused and configured with explicit `http`, `https`, `ws`, `wss`, and
`ftp` blocking before resume. A blocked attempt remains an observed
`requestWillBeSent`/`loadingFailed` event and fails the zero-external-request
contract; it is not silently discarded.

Before the full golden-flow harness, every matrix job runs the opt-in real
Chrome Worker integration probe with
`AES_RUN_REAL_CHROME_WORKER_INTEGRATION=1`. The probe uses the same
cross-platform Google Chrome discovery and the same commit-controlled major
contract as the hosted harness. It must observe the paused Worker request,
Chrome's blocked failure, and zero hits at the local probe endpoint.

Accordingly, this profile proves browser-scoped offline execution. It does not
claim that the GitHub-hosted runner or the Actions control plane was physically
disconnected from the internet.

## Workflow command and retained output

The workflow pins checkout, Node setup, and artifact upload actions to immutable
commit SHA values, records those values in the run provenance, installs the
lockfile-resolved dependencies with `npm ci`, and invokes:

```text
node scripts/run-hosted-platform-validation.mjs --os <family> --runner-label <label> --node-arch <arm64|x64> --output output/hosted-platform/<family>
```

The output directory must contain the run diagnostics and every retained
artifact required by `PLATFORM_VALIDATION_PROTOCOL.md`. The workflow executes
the commit-pinned `actions/upload-artifact` v6 action under `always()`, with a
90-day retention request, so available diagnostics are uploaded after both
successful and failed validation attempts. Missing output is an upload error,
not a warning and never evidence of a completed run. The browser validation
step has its own 35-minute timeout and the Worker probe has a 10-minute timeout
inside the 60-minute job boundary. This leaves a bounded setup margin and time
for the `always()` diagnostic upload path.

Immediately after checkout—and before Node provisioning, `npm ci`, the oracle,
fixture verification, or the Worker probe—the workflow writes
`hosted-workflow-preflight.json` into the OS output directory. This immutable
record is retained if an early step fails, and the browser harness requires its
target mapping to match the current matrix before it starts. On a successful
run, the hosted metadata binds the preflight file by path, byte count, and
SHA-256. Its claim state is
`WORKFLOW_STARTED_DIAGNOSTIC_NOT_PLATFORM_EVIDENCE`: it is failure
diagnostics, not proof that the browser run completed and never closes a gate.
Because this record is deliberately written before `actions/setup-node`, its
`runtime.nodeArchitecture` describes only the bootstrap Node executable already
present on the runner and may differ from the declared target architecture.
That limited meaning is locked by
`runtime.nodeArchitectureScope=BOOTSTRAP_NODE_BEFORE_SETUP_NODE_MAY_DIFFER_FROM_DECLARED_TARGET`.
The declared target and `RUNNER_ARCH` still have to match the fixed matrix; the
post-setup browser metadata separately has to match the configured Node target.

The upload action's artifact ID, name, archive digest, and URL are produced only
after the bundle has been uploaded. They therefore cannot be embedded
recursively inside that same bundle. For each OS, copy
`hosted-upload-receipt.template.json` to `hosted-upload-receipt.json`, enter
those exact upload outputs plus the matching run/commit identity, and retain it
beside the downloaded artifact. The human-review recorder hash-binds and
cross-checks this declared receipt; it does not independently authenticate
GitHub or the person who captured it.

Every machine-produced result has this claim state:

`AUTOMATED_RUN_EVIDENCE_AWAITING_HUMAN_REVIEW`

Neither a green Actions job nor three matching automated reports closes
AC-PLAT-01 or AC-PLAT-02. Before either gate can pass, a human reviewer must:

- inspect each raw network capture and confirm that it spans the declared
  browser-run interval and contains no external request attempt;
- inspect each retained screen image or recording for final status, methods,
  common alpha range, warnings, and offline state;
- verify OS, architecture, runner image, browser/runtime identity, and workflow
  provenance against the external Actions handoff;
- render and inspect each exported PDF and check the retained CSV/JSON/PDF set;
- record any deviation and complete the existing cross-platform comparison and
  matrix review.

The human platform record does not include a locale decision. AC-PLAT-03 is
governed by its separate automated locale matrix; the ordinary golden report
CSV is not mixed-decimal evidence. Optional locale observations may be retained
as notes, but cannot be promoted to a hash-bound platform-review PASS without a
dedicated artifact contract.

## Hash-bound human review handoff

No Parallels installation is needed. After the three hosted artifacts have been
downloaded, create the three one-run evidence records and the deterministic
matrix described in
[`PLATFORM_VALIDATION_PROTOCOL.md`](PLATFORM_VALIDATION_PROTOCOL.md). Then place
the human-review input and all referenced evidence under one common directory.
From a full repository checkout, run:

```bash
node scripts/record-platform-human-review.mjs \
  --input evidence/platform/platform-human-review-input.json \
  --output evidence/platform/platform-human-review-record.json
```

From the generated external-validation-kit root, use the owner-side packaged
tool instead:

```bash
node tools/record-platform-human-review.mjs \
  --input 01-platform/platform-human-review-input.json \
  --output 01-platform/platform-human-review-record.json
```

The minimal repository seed in `01-platform/hosted/` only runs the hosted
automation and returns its raw artifacts. Owner-side one-run, matrix, and human
review recorders intentionally run outside that seed; its bundled copy of this
protocol points to the exact validation-kit commands.

The input must lock the actual matrix file and exactly three actual source
records—one each for `macos`, `windows11`, and `ubuntu`—by path and lowercase
SHA-256. Each OS review must repeat its exact source-record hash and retain:

- `hostedRunMetadata`, including the GitHub Actions run URL, run ID/attempt,
  commit, fixed runner label/image, OS, and architecture;
- `hostedWorkflowPreflight`, the exact pre-browser diagnostic file whose path,
  byte count, and SHA-256 are bound by the hosted metadata;
- `hostedUploadReceipt`, containing the exact upload artifact ID, name, URL,
  digest, matching run/commit identity, and capture time;
- the raw network HAR, final screenshot, exported PDF, JSON, and CSV;
- review start/end UTC timestamps and all six decisions:
  `HAR_NETWORK`, `SCREENSHOT_UI`, `PDF_VISUAL_QA`,
  `JSON_CSV_PDF_CONSISTENCY`, `RUNNER_OS_ARCH_IDENTITY`,
  and `DEVIATIONS`;
- exact reviewed-evidence SHA-256 sets, non-placeholder comments, and one
  assessment for every retained deviation.

The recorder verifies the matrix bytes, recomputes that matrix from the actual
three source-record files, requires the exact `github.com` run URL, fixed
workflow/ref/action pins, validates and byte-binds the preflight file,
cross-checks the declared upload receipt, verifies runner/OS/architecture
identity, and binds every reviewed surface to the retained artifact bytes. The
`RUNNER_OS_ARCH_IDENTITY` decision must bind the source record, hosted metadata,
preflight, and upload-receipt hashes. A
missing, duplicated, unreviewed, placeholder, contradictory, failed-but-declared
passing, or hash-mismatched item cannot produce an eligible `PASS` disposition.
A coherent negative review is retained as `FAIL`.

This is a structural audit boundary, not identity authentication or gate
closure. Output state remains
`STRUCTURALLY_VALIDATED_REQUIRES_INDEPENDENT_AUTHENTICITY_AUDIT`, with
`acceptanceGateStatus: NOT_AUTOMATICALLY_APPLIED` and
`authenticityStatus: NOT_VERIFIED_BY_SOFTWARE`. Even when
`eligibleForHumanGateDisposition` is true, an independent authenticity and gate
decision is still required; the recorder never marks AC-PLAT-01 or AC-PLAT-02
`PASS`.

Independent scientific review and the five-person usability study remain
separate external gates. Headless browser automation also does not substitute
for observed human file-selection, click-flow, or report-comprehension evidence.

## Real execution prerequisite

The local files alone cannot create hosted evidence. A real run requires this
project to exist in a GitHub repository with a configured remote, GitHub Actions
enabled, and access to all three fixed runner labels. After that external
prerequisite is satisfied, start **Hosted Platform Validation** manually from
the Actions page and retain the complete workflow artifacts and run URL.
