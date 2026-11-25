# Activation Energy Studio v0.3.2 External-Gate Acceptance Criteria

Candidate SHA-256:
`4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8`

These criteria are the version-specific operational profile for the eight P0
external gates inherited by v0.3.2. They retain the existing thresholds while
binding all evidence to the current technical-English release. Historical
v0.2.0 or v0.3.1 evidence may inform a review but cannot close a v0.3.2 gate.

## Evidence rules shared by every lane

- Evidence must reference the exact candidate hash above.
- A real reviewer, participant, observer, or target-device run must be
  attributable through a non-placeholder identity or environment record.
- Every retained artifact must have a relative path, byte size, and SHA-256.
- A template, generated fixture, simulated human answer, or self-attestation by
  the implementation agent cannot close an external gate.
- Human identity and signature authenticity remain separate from structural
  validation and require independent verification.
- A missing, contradictory, stale, relabelled, or hash-mismatched artifact
  keeps the affected gate open or makes the submitted record invalid.
- Any remediation that changes a release-package byte stops v0.3.2 validation
  and requires a separately versioned v0.3.3 candidate.

## Independent scientific-review lane

### AC-SCI-03 — Claim boundary

An eligible independent thermal-analysis or solid-state-kinetics reviewer must
inspect all 28 prespecified UI, PDF, CSV, JSON, diagnostic, and documentation
surfaces. Every item must state or preserve the bounded interpretation of
apparent activation energy and the relevant sample, process/stage, atmosphere,
method, conversion range, and preprocessing context. No surface may assert a
true, unique, context-free material constant or a demonstrated mechanism.

PASS requires all 28 unique decisions to be PASS, each linked to retained
hash-bound evidence and a substantive reviewer comment. One failed or missing
surface keeps AC-SCI-03 open or produces FAIL/REVISION_REQUIRED.

### AC-VAL-05 — Cross-method interpretation

The same reviewer must inspect all seven prespecified cases covering FWO, KAS,
Starink, Friedman, and the separate Kissinger result. Agreement must not be
called truth; divergence must remain visible; equation, approximation,
derivative-source, conversion-range, and regression-only uncertainty boundaries
must be clear. Kissinger must remain a separate single-peak result and must not
be substituted for `Ea(alpha)`.

PASS requires all seven unique decisions to be PASS with hash-bound evidence
and substantive comments. The gate remains open or becomes
FAIL/REVISION_REQUIRED if any case is missing, contradicted, or unsupported.

### Reviewer and signature requirement

The reviewer must not have implemented the calculation core or authored the
validation fixtures. The retained record must include name, affiliation,
expertise reference, conflict declarations, review time range, separate gate
dispositions, overall verdict, and a signed verdict artifact. Accepted
signature methods are PAdES, PGP detached signature, Minisign detached
signature, institutional-email attestation retained as an artifact, or a wet
signature with an independent identity check.

## Cross-platform offline-runtime lane

### AC-PLAT-01 — Offline execution

On each retained target-platform run, the candidate must be opened through
`file://` with browser networking disabled. The same golden workflow must load
the fixture, confirm interpretation, run eligible methods, render results, and
export PDF, CSV, and reproducible JSON. The in-app scientific self-test must
pass. Runtime external-network request count must be zero.

PASS requires, for every target OS, a hash-bound environment record, runtime
log, network capture, final-state screenshot, self-test JSON, and all three
exports. Browser launch alone, static HTML inspection, or a local substitute for
another OS does not close AC-PLAT-01.

### AC-PLAT-02 — Operating-system matrix

The exact candidate and golden fixture must run on all three distinct targets:

- Windows 11;
- a supported macOS release; and
- Ubuntu 22.04 or later.

Each record must contain actual OS edition/build, architecture, browser name and
version, locale, runner identity, and collection timestamps. The canonical
scientific numeric content of reproducible JSON must be identical across the
three runs; PDF and CSV must pass their structural and scientific comparison
contracts. A named platform reviewer must inspect each final-state screenshot,
network record, and export set before issuing the matrix disposition.

PASS requires the exact three-OS set, no duplicate or relabelled environment,
all source records valid, all numeric comparisons equal, and the independent
human matrix review PASS.

## Five-user observed-usability lane

All sessions must use the exact v0.3.2 candidate and the versioned v0.3.2 study
fixtures. Participants must be real, distinct, previously unexposed to the
study fixtures, able to read standard technical English, and not project
contributors. Moderation, screen/audio evidence, timestamps, hashes, and rescue
events must be retained. Five valid participants are required.

### AC-UX-01 — Guided happy path

Every participant must complete the prepared four-run TGA workflow without
formula entry or moderator rescue: upload, confirm mapping/units, confirm
sample-stage context, run all eligible methods, and export/open the PDF.

PASS requires 5/5 correct PDFs in at most five macro stages, median semantic
application activations no greater than 12, and no participant above 15.

### AC-UX-02 — Comprehensible scientific refusals

Every participant must encounter all five prespecified refusal cases. Without
the moderator explaining the diagnostic, the participant answers: what is the
problem, why is it scientifically risky, and what should be corrected before
continuing.

PASS requires correct problem and correction statements in all 25
participant-case combinations, at least 90% of the 75 total rubric dimensions,
and no refusal case below 80%. Required second-rater records and media/timecode
links must validate.

### AC-UX-03 — Result-type distinction

On the first unaided response, every valid participant must state all four
prespecified distinctions between an `Ea(alpha)` curve and a single-peak
Kissinger `Ea`: they are different result types, use different inputs, answer
different bounded questions, and neither substitutes for the other.

PASS requires all rubric elements from all 5/5 participants. A 4/5 result is
FAIL.

### AC-UX-04 — Warning visibility

A named human observer must inspect both the primary result surface and the
exported PDF for `LIMITED_HEATING_RATES`, `LOW_R2`, `NUMERICAL_DERIVATIVE`, and
`MULTISTEP_EA_VARIATION`. The UI screenshot, PDF, rendered PDF page, observation
record, and hashes must come from the same candidate and case run.

PASS requires the complete 4 warnings by 2 surfaces matrix, 8/8 cells, with no
warning confined to a tooltip, log, generic badge, or unrendered data field.

## Final decision

- **GO eligibility:** all eight gates PASS from genuine evidence; all lane
  records, independent authenticity checks, and required release-role signoffs
  validate; candidate bytes remain unchanged; no blocking known issue remains.
- **NO-GO:** any confirmed gate failure, unresolved blocker requiring a package
  change, integrity mismatch, or adverse independent-review verdict.
- **EXTERNAL-OPEN:** collection or authentic human/device evidence remains
  incomplete. Collection tooling and technically valid templates alone do not
  change this state.
