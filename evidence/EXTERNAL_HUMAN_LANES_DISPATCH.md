# Activation Energy Studio — External Human Validation Dispatch

**Status:** The technical packages are ready; human observation, identity
verification, declarations, signatures, and external adjudication remain
incomplete. This document does not set any acceptance gate to `PASS`.

This dispatch keeps three human roles and three evidence lanes operationally
separate. Parallels is neither used nor required.

## 1. Platform evidence

ZIP to distribute:

`output/Activation-Energy-Studio-Platform-Human-Review-Handoff-Run-30461456446.zip`

SHA-256:

`c870c48725154d157729d4beb61003ca9688dd2dd27099d26964bcfc011163ac`

The recipient must verify the ZIP SHA-256 through a separate trusted channel,
extract the package, and run:

```bash
node VERIFY-LOCKS.mjs
```

The first named custodian must personally inspect the evidence from all three
operating systems, record the actual observer information, and document only
the five checks they performed in a working copy. The custodian then produces
a matrix from the three source records. A separate named reviewer must
personally inspect all 3 × 6 = 18 decision surfaces. Successful recorder output
does not authenticate identity or prove the accuracy of a declaration.

## 2. Independent scientific review

Immutable source package:

`output/independent-scientific-review-v0.2.0`

Package-manifest SHA-256:

`e7d8c252d3528f6599eb494f773b4778182beb22adcaf7f4c625d232ec39b565`

The same bytes are available at `03-scientific-review/package/` in the
external validation kit. Kit ZIP SHA-256:

`3eb58270b45dea380d5b62244127b8a4bf937220d01615a0217fd79d3714a4bf`

Important correction: do not follow the statement “verdict template inside
the package” in the root README of the external kit. The normative package
README and runbook are correct. Copy
`INDEPENDENT_REVIEW_VERDICT_TEMPLATE.md` and
`SCIENTIFIC_REVIEW_INPUT_TEMPLATE.json` **outside** the immutable package and
complete only those external working copies.

The reviewer must complete 28 `AC-SCI-03` and 7 `AC-VAL-05` decisions with the
actual evidence path and SHA-256, case identity, personal interpretation,
observation time, environment information, eligibility and conflict-of-interest
declarations, and a separate signed artifact.

The standard-library Decimal oracle for Paper 010 is portable and runnable
inside the package. The full browser-based raw-to-report checker requires the
local modules from a project checkout. Therefore, the transfer package must not
be described as a fully self-contained rerun of the complete application. The
scientific reviewer must see and account for this limitation.

Immutable scientific-package check:

```bash
node evidence/scripts/generate-scientific-review-package.mjs \
  --project-root evidence \
  --output .. \
  --check
```

## 3. Five-participant usability study

Source package:

`output/Activation-Energy-Studio-External-Validation-Kit-v0.2.0.zip`

Required subdirectory:

`02-usability/`

Complete the `P01`–`P05` templates for five actual participants only in
separate working copies. Participants must pass the eligibility screen and
recording consent. Do not place direct identifiers in participant JSON files.
Every valid session requires separate screen and audio recordings, SHA-256
values, time ranges, an observer record, and genuine task results.

The sample must include at least two participants with basic TGA experience and
at least two with only general numerical-data experience. Exclude routine users
of FWO, KAS, Starink, Friedman, or Kissinger calculations within the previous
two years, product developers, and anyone who observed an earlier session.

The acceptance thresholds are immutable:

- `AC-UX-01`: 5/5 without rescue; median semantic activations ≤12; none >15
- `AC-UX-02`: correct problem and correction for 25/25 cases; ≥90% overall
  across 75 dimensions; no rejection scenario below 80%
- `AC-UX-03`: 5/5 must answer 4/4 correctly on the first attempt; 4/5 is `FAIL`
- `AC-UX-04`: four warnings × UI/PDF = 8/8 named-human visual reviews

A second evaluator must blindly score a deterministic selection of 10 of the
25 rejection scenarios. Failed sessions remain in the sample. They may be
retained with a replacement identity only when a genuine technical-invalidity
reason is documented.

## 4. Required return package and closeout

Return each lane separately:

- platform: three completed run inputs, three source records, the matrix, the
  completed human-review input, the human-review record, and a separate signed
  audit
- science: the completed structured input, 35 decisions, a signed verdict, the
  evidence record, and a separate authenticity audit
- usability: five participant records, media and timecode locks, the study
  input, second-rater records, the usability evidence record, and a separate
  signed audit

The owner must not convert recorder output directly into a gate `PASS`. Each
lane requires a separate human content, identity, and signature audit followed
by the closeout defined in `EXTERNAL_EVIDENCE_ADJUDICATION_PROTOCOL.md`.

Open status after technical preparation:

- P0 ledger: `64/72 PROVEN`, `8 EXTERNAL_OPEN`
- validated-MVP eligibility: `false`
- platform `AC-PLAT-01/02`: `PARTIAL`
- science `AC-SCI-03`, `AC-VAL-05`: `PARTIAL`
- human usability `AC-UX-01`–`04`: open until the actual sessions are complete
