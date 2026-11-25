# Activation Energy Studio v0.3.2 — Observed Usability Validation Protocol

**Scope:** `AC-UX-01` through `AC-UX-04`  
**Protocol state:** `APPROVED EXECUTION PACKAGE / NOT YET RUN`  
**Evidence state:** `EXTERNAL_OPEN`  
**Study language:** standard technical English

This protocol governs only the frozen Activation Energy Studio v0.3.2
candidate. It is a study design and execution package, not participant
evidence. At package generation, the retained participant count is zero, no
observed session has occurred, no comprehension response has been scored, and
no human evidence audit has been performed. Therefore none of the four
`AC-UX-*` gates is closed by this package.

## 1. Immutable study locks

The study is valid only while all of these locks remain byte-identical:

- Candidate HTML:
  `release/v0.3.2/Activation-Energy-Studio-v0.3.2.html`
- Candidate SHA-256:
  `4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8`
- Candidate bytes: `2503952`
- Candidate freeze:
  `output/v0.3.2-external-validation/CANDIDATE_FREEZE.json`
- Candidate-freeze SHA-256:
  `52aaaf58e3a0e9880ff72ca30aa8cef9566406860e5151ca0638e5c4a597b758`
- External-gate acceptance-criteria SHA-256:
  `7be35f2d7bba5135d7a530a8b7691ce59a9be0dcbe9c2762d3b40d9de6468f54`

Any release-package byte change stops v0.3.2 validation. Retain already
collected material as superseded evidence, open a v0.3.3 remediation candidate,
and repeat all applicable gates. Historical v0.3.1 sessions, fixtures, or
technical captures must never be relabeled as v0.3.2 observations.

## 2. Study design

- Use exactly five retained participants: `P01` through `P05`.
- Conduct one-to-one, live, moderated observation.
- Retain one complete screen recording and one separate complete audio
  recording for every participant.
- Use a clean browser profile at 100% zoom with networking disabled.
- Use only the frozen synthetic study inputs. Participants must not upload
  personal, institutional, or experimental data.
- The moderator may ask only neutral prompts such as “What do you see?” or
  “What do you plan to do next?” during task execution.
- Stating the correct control, interpretation, or corrective action counts as a
  rescue and must remain in the record.
- Unsuccessful valid sessions remain in the sample. A technical invalidation is
  retained in the excluded-session log with its reason and replacement ID.

The recorder requires exactly five retained records. It does not accept a
four-person partial cohort as v0.3.2 observed-study evidence.

## 3. Participant criteria

Every retained participant must:

1. work or study in a quantitative field;
2. be able to open CSV/XLSX data and read basic tables and plots;
3. have either no TGA experience or only basic familiarity;
4. not have routinely calculated FWO, KAS, Starink, Friedman, or Kissinger
   results during the preceding two years;
5. not have contributed to this product, protocol, or acceptance criteria;
6. be able to read standard technical English; and
7. not have seen another participant's session.

The five-person cohort must include at least two participants with basic TGA
familiarity and at least two with no TGA familiarity.

## 4. Consent and privacy

Obtain written recording consent before starting the session. Explain that the
interface is being tested, participation is voluntary, withdrawal is allowed,
and screen and audio will be recorded. Keep identity data in a separate consent
store. The evidence record contains pseudonymous IDs only.

Do not include names, email addresses, phone numbers, addresses, personal file
paths, or institutional data in the returned package. Keep recordings on an
encrypted local volume with cloud synchronization disabled. Follow the agreed
retention schedule and preserve only de-identified release evidence after raw
media deletion.

## 5. Frozen tasks

The fixture manifest contains eleven deterministic synthetic files:

| Task | Purpose | Expected result |
|---|---|---|
| UX01 | Guided four-run mass-to-alpha analysis and PDF export | Completed analysis without formula entry |
| R1 | Two heating rates | `INSUFFICIENT_DISTINCT_HEATING_RATES` |
| R2 | No common alpha range | `NO_COMMON_ALPHA_RANGE` |
| R3 | Non-monotonic alpha | `NON_MONOTONIC_ALPHA` |
| R4 | Conflicting sample context | `INCONSISTENT_CONTEXT` |
| R5 | Nonlinear time/temperature relation | `NONLINEAR_HEATING_UNSUPPORTED` |
| C1 | `Ea(α)` plus Kissinger peak result | Two distinct result types |
| W1 | Three heating rates | `LIMITED_HEATING_RATES` |
| W2 | Numerically derived rate | `NUMERICAL_DERIVATIVE` |
| W3 | Weak regression | `LOW_R2` |
| W4 | Multi-step variation | `MULTISTEP_EA_VARIATION` |

The stimuli are byte-identical to the v0.3.1 fixture design, but their expected
behavior is rechecked against the frozen v0.3.2 runtime. Reusing task-input
bytes does not reuse or relabel any historical observation.

## 6. AC-UX-01 — Guided happy path

Read this task verbatim:

> Create an activation-energy analysis from this synthetic four-condition TGA
> file. Temperature is in °C, mass is in percent, and heating rate is in K/min.
> The sample is `synthetic-kas`, the atmosphere is N2, and the mass-loss stage
> to analyze is 300–380 °C. Set the project name to `UX01 Four Run` and the
> process to `synthetic mass loss`. Run the eligible methods and export the PDF
> report. Do not use a formula or external calculator.

Count the five expected macro decisions: upload, confirm mapping and units,
confirm context and stage, run eligible methods, and export/open the PDF. Count
every semantic UI activation, pointer click, OS-picker interaction, rescue, and
formula use without subtracting errors or repeated actions.

## 7. AC-UX-02 — Scientific refusals

Each participant completes R1–R5 in cyclic order:

- P01: R1, R2, R3, R4, R5
- P02: R2, R3, R4, R5, R1
- P03: R3, R4, R5, R1, R2
- P04: R4, R5, R1, R2, R3
- P05: R5, R1, R2, R3, R4

For every visible refusal ask, without naming the diagnostic:

1. “What is the problem?”
2. “Why is this scientifically risky?”
3. “What would you correct in the data or analysis context before continuing?”

Retain the verbatim answer and score problem, risk, and action independently as
0 or 1. Bind every answer to the exact screen/audio hashes and a positive
recording timecode. A deterministic SHA-256 selection chooses exactly ten of
the 25 scenarios for blind second rating.

## 8. AC-UX-03 — Result-type comprehension

With both the `Ea(α)` curve and the Kissinger result visible, ask:

> Are the `Ea(α)` curve and the single-peak Kissinger Ea value on the screen two
> presentations of the same result? Which conversion or physical event does
> each represent, and can they be reported interchangeably?

Score the first response only. The four required elements are: the results are
not the same; `Ea(α)` is a fixed-conversion multi-rate profile; Kissinger is a
peak-specific value from the β–Tp shift; and the two are not interchangeable.
Retain the verbatim first response and its recording timecode. Do not provide a
hint or second attempt.

## 9. AC-UX-04 — Warning visibility

For W1–W4 retain eight distinct artifacts: one UI image and one generated PDF
per case. A named observer later inspects the UI image and rendered PDF pages
and records whether the exact warning or an explicit equivalent is visible.
Automation may check file types and hashes; it cannot substitute for visual
inspection. A generic status badge does not satisfy this criterion.

## 10. Prespecified thresholds

| Gate | Threshold |
|---|---|
| AC-UX-01 | 5/5 complete the correct PDF without rescue or formula entry in exactly five macro stages; median semantic activations ≤12; no participant >15. |
| AC-UX-02 | All 25 cases state the problem and corrective action correctly; total score across 75 dimensions ≥90%; no refusal fixture <80%; ten deterministic cases receive blind second rating. |
| AC-UX-03 | All 5/5 satisfy all four rubric elements on the first response; 4/5 is FAIL. |
| AC-UX-04 | All eight W1–W4 × UI/PDF cells are visually accepted with distinct retained evidence hashes. |

A missed threshold is `FAIL`, not “almost passed.” Negative findings remain in
the evidence package.

## 11. Fail-closed recorder controls

The v0.3.2 recorder rejects, among other conditions:

- the wrong build, candidate freeze, acceptance criteria, or fixture manifest;
- a `NOT_RUN` template or any origin other than observed human sessions;
- a cohort other than exact P01–P05;
- missing consent, ineligible participants, or non-100% zoom;
- non-cyclic R1–R5 order;
- missing, reused, identical, undersized, or unsupported recording artifacts;
- timecodes outside declared screen/audio durations;
- placeholder verbatim answers;
- manually altered second-rater selection or insufficient blind coverage;
- duplicate warning evidence, hash mismatches, or path escape;
- a declaration that generated participant evidence was used; and
- any attempt to apply the acceptance gate before independent evidence audit.

The recorder cannot decode or authenticate media, confirm participant identity,
verify consent authenticity, or prove that an answer was genuinely observed.
Its output always retains `externalEvidenceComplete=false`, human audit
`NOT_PERFORMED`, and all four gates `EXTERNAL_OPEN`.

## 12. Execution and closure

Verify the pristine handoff package before recruitment. Work from a separate
copy, replace templates with genuine observations, then run:

```bash
node tools/record-usability-study-v0.3.2.mjs \
  --manifest study-input.json \
  --output usability-evidence-record.json

node tools/record-usability-study-v0.3.2.mjs \
  --manifest study-input.json \
  --output usability-evidence-record.json \
  --check
```

After recording, an independent auditor must inspect every retained screen and
audio recording, verify warning UI/PDF content, confirm consent references and
session authenticity, and sign a separate human-evidence audit. External
adjudication may close a gate only after that audit and the prespecified
threshold calculation both pass. The package itself never authorizes release.
