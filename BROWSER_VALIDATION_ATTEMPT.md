# Real-browser Offline Validation Record

**Record date:** 2026-07-29  
**Current release:** `release/Activation-Energy-Studio-v0.2.0.html`  
**Current release SHA-256:** `ce716471586b098806007853992bed6601dfa359d53e59fe1b50c849d911dbb7`

**Schema-v4 migration status:** **CURRENT LOCAL RECAPTURE — the retained bundle
was regenerated from the active report contract and current locked release.**

This record separates a historical blocked browser attempt from the current
direct local macOS diagnostic. Neither event is a human-reviewed platform PASS.

## 1. Historical Codex in-app browser attempt

**Attempted release SHA-256:** `d204d06eedce80a36aefffd85ed8797962f8dd97c6711dec73e8f13a584849b7`  
**Outcome:** **NOT EXECUTED — local file navigation was blocked before the application loaded.**

The in-app browser rejected navigation to the local `file://` release under its
URL security policy. No application DOM, upload, analysis, chart, export, or
network behavior was reached. No prohibited workaround was attempted. This
historical event is neither evidence that the application fails offline nor
evidence that it succeeds.

## 2. Current direct local macOS Chrome diagnostic

**Execution environment:** direct local macOS host; no Parallels or VM  
**OS:** macOS 26.6, build `25G72`; Darwin 25.6.0; arm64  
**Browser:** real system Google Chrome `150.0.7871.187`, headless automation  
**Locale/runtime:** `tr-TR`; Europe/Istanbul; decimal comma; `file:`; `navigator.onLine=false`  
**Machine claim:** `LOCAL_AUTOMATED_DIAGNOSTIC_NOT_PLATFORM_EVIDENCE`  
**Retained bundle:** `evidence/platform/local-macos/v0.2.0-current-release/`

The fail-closed local CLI ran the current locked release and golden CSV through:

1. local `file://` page open under Chrome offline emulation;
2. embedded 11/11 scientific self-test and retained JSON download;
3. golden CSV upload and 36-row FWO/KAS/Starink/Friedman analysis;
4. JSON, CSV, and four-page PDF exports;
5. raw CDP capture converted to HAR;
6. full-page final-state PNG after resetting the sticky header to the page top.

The retained HAR contains one `file://` document request, zero external
requests, zero unsupported requests, and no HTTP(S), WebSocket, FTP, data, or
blob request. All seven action-timeline entries were verified for that run.
Its JSON, CSV, PDF, HAR, screenshot, and self-test records were generated from
the active schema-v4 release. This is current local automated evidence, while
the independent human and cross-platform boundaries below remain open.

Integrity anchors:

- bundle manifest SHA-256: `e4e0211f3f2137396e84aff7f07f94663dc60316d0ad0c66ba6f9fa008fc4c4e`
- local metadata SHA-256: `07e5c85bdcf9af12676e35b68da10e3abab9a55c7656d4236b79f91e862abc5d`
- HAR SHA-256: `e01d1049049d5093d76ffdaba0a1a83ba7023615301aa7c3a0adac0b416644ed`
- final PNG SHA-256: `6e35b7c29e87eeaea03970ec00d8f5e37b031cc7cf9d8a6ce4f18d3a13aec547`
- exported PDF SHA-256: `e5098916b365a45ecda4302153dc74ed360b26e6fa50c2a258ad553775ba2b98`

The integrity manifest hashes exactly ten retained payload files and is
rechecked by `npm run verify:local-macos-diagnostic`. It also verifies that the
copied HTML and golden CSV still match the current `release/SHA256SUMS.txt`.

### Harness QA history retained

The local harness failed closed twice before the current run. The first failure
showed only the combined offline/DOM error; the second retained the evaluated
runtime and exposed the actual defect: `[data-testid="numeric-results"]` had
incorrectly been required before analysis even though the application creates
that table only after analysis. The pre-analysis contract was corrected and a
regression test now excludes that selector from the page-open requirement.

The first clean run was then superseded because the full-page PNG placed the
sticky top bar at the browser's last scroll position. Resetting the page to the
top before capture produced the current clean PNG. A later clean run was
superseded once more when validation-source SHA locks were added. The
2026-07-27 source-locked bundle was then archived unchanged when the hosted
preflight and upload-receipt contracts changed the shared harness source. That
intermediate bundle was also archived unchanged when strict preflight byte
binding and GitHub provenance checks changed the same source again. The current
direct-macOS bundle was regenerated against the five-lane final scientific
build on 2026-07-29. The current metadata fails verification if the browser harness,
network contract, or local CLI source changes.

The unedited diagnostic directories are retained under
`evidence/platform/local-macos/` with `failed-*` or `superseded-*` names. They
are debugging/negative evidence only and are not members of the current
ten-file integrity manifest.

## Acceptance consequence

This is strong local automated runtime evidence for the current macOS/Chrome
combination. It is not a human-observed run, does not emit a recorder-compatible
`platform-run-input.*.draft.json`, and contains no hosted provenance. It cannot
close AC-PLAT-01 or AC-PLAT-02 and says nothing about Windows 11 or Ubuntu.
Parallels is not part of the validation plan; Windows and Ubuntu can close only
with genuine native or hosted records bound to this same locked release.

AC-PLAT-01 therefore remains PARTIAL pending human HAR/image/PDF inspection
under the normative protocol. AC-PLAT-02 remains NOT TESTED pending the real
GitHub-hosted macOS, Windows 11, and Ubuntu matrix on the same locked release.
