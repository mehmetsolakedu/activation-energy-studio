# Activation Energy Studio — Usability Validation Protocol

> Current technical-English revision derived from the immutable historical
> source [`../../USABILITY_VALIDATION_PROTOCOL.md`](../../USABILITY_VALIDATION_PROTOCOL.md).
> The source remains authoritative only for the byte-bound v0.2 evidence
> record; this revision governs the v0.3.1 English study workflow.

**Scope:** `AC-UX-01` through `AC-UX-04`  
**Protocol status:** `APPROVED DESIGN / NOT YET RUN`  
**Last updated:** 2026-07-18

This document is a test plan, not a completed usability study. No participant
session, screen recording, click count, or comprehension score existed at the
time of the protocol. The protocol alone therefore does not make any
`AC-UX-*` gate `PASS`.

## 1. Purpose and study design

The study measures whether a user who is not a specialist in activation-energy
methods can operate the software without entering formulas, understand
scientific refusals, distinguish `Ea(α)` from a single-peak Kissinger result,
and see mandatory warnings on both the primary result surface and in the PDF.

- **Design:** One-to-one moderated task testing. Each session retains separate,
  hashed screen and audio recordings. A screenshot or report PDF alone is not
  session evidence. A single-frame screenshot is optional supplementary
  evidence and cannot replace the required screen or audio recording.
- **Minimum sample:** **Five valid participants.** Invalid or incomplete
  sessions are replaced; unsuccessful sessions are not removed from the sample.
- **Estimated duration:** 35–45 minutes.
- **Environment:** The same-hash single-HTML release, a clean browser profile,
  100% zoom, networking disabled, and synthetic study files only. The recorder
  rejects any zoom value other than 100%.
- The moderator does not teach during tasks. Only neutral prompts such as
  “What do you see on the screen?” and “What do you plan to do next?” are
  permitted. Stating the correct control or corrective action counts as a
  **rescue**.

## 2. Participant criteria

Every participant must satisfy all of the following:

1. Be a student, researcher, technician, or engineer in a quantitative field
   such as engineering, science, agriculture, or environmental science.
2. Have experience opening CSV/XLSX files and reading basic plots and tables.
3. May have no TGA/DTG experience or only basic familiarity, but must not have
   routinely calculated FWO, KAS, Starink, Friedman, or Kissinger results during
   the preceding two years.
4. Must not have contributed to the product's code, design, or acceptance
   criteria.
5. Must be able to read the standard technical English used for scientific
   explanations in the v0.3.1 test interface.

At least two participants must previously have seen TGA data, and at least two
must have only general quantitative-data experience. Kinetic-method developers,
product developers, and people who have seen a previous participant's screen
are excluded.

## 3. Consent and privacy

Before the session, the following points are explained in writing and orally:
participation is voluntary; the participant may stop at any time without giving
a reason; the interface, not the participant, is being tested; screen and audio
will be recorded; only synthetic data will be used; and the participant must
not upload personal or organizational files.

- Identity information is retained in a separate consent file; the measurement
  record contains only the pseudonymous ID `P01`…`Pnn`.
- Email addresses, names, personal folders visible in screenshots, and
  sensitive data are excluded from the evidence package. The file chooser is
  fixed to the study directory before the session starts.
- Recordings remain on a local encrypted drive with cloud synchronization
  disabled.
- Raw audio and screen recordings are deleted 90 days after the final QA
  decision. De-identified scores, fixture/build hashes, and the decision summary
  may be retained as release evidence.
- A participant who does not consent to recording is not enrolled. A separate
  notes-only session does not count as evidence under this protocol.

## 4. Build and fixture freeze

Current test target:
`release/v0.3.1/Activation-Energy-Studio-v0.3.1.html`.

Before sessions begin, the coordinator creates `UX_FIXTURE_MANIFEST.json` and
freezes the build SHA-256, every fixture SHA-256, generation command/version,
and expected diagnostic codes. The deterministic manifest contains no volatile
timestamp; its creation time in UTC is stored separately in the coordinator
record. If the build or a fixture changes between sessions, results before and
after the change are not combined into one sample.

Generate and verify the normative study copies and manifest deterministically:

```bash
npm run fixtures:usability
npm run verify:usability-fixtures
```

The current lock is
`evidence/usability/v0.3.1/UX_FIXTURE_MANIFEST.json`. At study start, the
coordinator copies that directory into a read-only study package. A manually
edited fixture is not accepted into the same study revision.

The primary source `examples/synthetic_kas_150.csv` is not experimental data.
It contains four conditions at 5, 10, 20, and 40 K/min. The following study
copies are generated deterministically without modifying the source:

| ID | Study file and exact generation rule | Expected target |
|---|---|---|
| UX01 | `study_bundle/UX01_four_run_mass_ambiguous.csv`: remove `Alpha [0-1]` from the source; set the header exactly to `Temperature,Mass percent,Heating rate,Run,Sample,Atmosphere`; preserve every other cell. | Guided four-condition happy path; temperature=`°C`, mass=`%`, β=`K/min`, stage=`300–380 °C`. |
| R1 | `study_bundle/R1_two_rates.csv`: retain only source rows with β=5 or 10 and preserve the original header. | `INSUFFICIENT_DISTINCT_HEATING_RATES` |
| R2 | `study_bundle/R2_no_common_alpha.csv`: retain the first three source rows for each β; set alpha to `.10,.20,.30` for β=5, `.40,.50,.60` for β=10, `.70,.80,.90` for β=20, and `.80,.90,.95` for β=40; preserve other cells. | `NO_COMMON_ALPHA_RANGE` |
| R3 | `study_bundle/R3_nonmonotonic_alpha.csv`: copy the source and change only the β=40, α=.60 cell to `.45`. | `NON_MONOTONIC_ALPHA` |
| R4 | `study_bundle/R4_context_conflict.csv`: copy the source and set `Sample` to `synthetic-other` in β=40 rows. | `INCONSISTENT_CONTEXT` |
| R5 | `study_bundle/R5_nonlinear_time.csv`: add `Time [min]`; within each run write `0,1,…,8` by row order; preserve other cells. | `NONLINEAR_HEATING_UNSUPPORTED` |
| C1 | `study_bundle/C1_peaks.tsv`: use the four β–Tp rows below; each Tp is the exact Kelvin conversion of the °C temperature at α=0.50 for the same β in the source. Load it with the unchanged source in UX03. | Separate `Ea(α)` and Kissinger results |
| W1 | `study_bundle/W1_three_rates.csv`: retain only source rows with β=5,10,20. | `LIMITED_HEATING_RATES` |
| W2 | Unmodified `examples/synthetic_kas_150.csv`. | `NUMERICAL_DERIVATIVE` |
| W3 | `study_bundle/W3_low_r2.csv`: center temperatures for β=`5,10,20,40` are `600,700,620,760 K`; each run contains `(α,T)` rows `(.4,T-5),(.5,T),(.6,T+5)`; run=`noisy-β`, sample=`synthetic-noisy`, atmosphere=`N2`. | `LOW_R2` |
| W4 | `study_bundle/W4_multistep.csv`: copy the source; for rows with α≥.60, add `0,5,15,35 °C` to temperature for β=5,10,20,40 respectively. | `MULTISTEP_EA_VARIATION` |

Contents of `C1_peaks.tsv`:

```text
beta [K/min]\tTp [K]\trun\tsample\tatmosphere
5\t589.582119\tbeta-5\tsynthetic-kas\tN2
10\t602.381849\tbeta-10\tsynthetic-kas\tN2
20\t615.731123\tbeta-20\tsynthetic-kas\tN2
40\t629.665286\tbeta-40\tsynthetic-kas\tN2
```

Earlier draft C1 values lay outside the measured curve ranges and were refused
with `KISSINGER_PEAK_OUTSIDE_RUN_RANGE`. That negative precheck is retained.
Before human sessions began, the C1 rule was revised to use in-source α=0.50
temperatures and the fixture hash was relocked.

Before human sessions, automated prechecks must demonstrate that each R/W file
can be imported and produces its stated target code. A fixture that fails to
produce its target is not corrected silently; it requires a new hash and
manifest revision.

## 5. AC-UX-01 — Five-decision-stage happy path

The moderator reads this task verbatim in English:

> “Create an activation-energy analysis from this synthetic four-condition TGA
> file. Temperature is in °C, mass is in percent, and heating rate is in K/min.
> The sample is `synthetic-kas`, the atmosphere is N2, and the mass-loss stage
> to analyze is 300–380 °C. Set the project name to `UX01 Four Run` and the
> process to `synthetic mass loss`. Run the eligible methods and export the PDF
> report. Do not use a formula or external calculator.”

The expected macro-decision path contains only:

1. Upload `UX01_four_run_mass_ambiguous.csv`.
2. Confirm column mapping and three units.
3. Confirm sample/atmosphere information and the `300–380 °C` stage context.
4. Select **Run eligible methods**.
5. Export the **PDF report** and confirm that the file opens.

Any other settings page, method-selection decision, formula entry, data
correction, or error recovery counts as an additional macro stage.

### Counting rules

- **Macro decision:** One of the five purposes above. Column and unit selections
  within the same panel are one macro stage but are also recorded as separate
  atomic decisions.
- **Semantic UI activation:** One file selection/drop, one select-value change,
  completing and leaving one text field, or activating one button. Keystrokes
  are not counted.
- **Raw pointer click:** Every actual click/tap visible in the screen recording
  is counted separately. Native-select and OS differences affect this count, so
  the passing threshold uses semantic activations.
- OS interactions in the file chooser are recorded separately as
  `os_picker_clicks` and excluded from the application count.
- Undo, incorrect selections, repeat changes to the same control, and every
  action after a rescue all count and are never subtracted.

## 6. AC-UX-02 — Five scientific-refusal messages

Every participant sees all R1–R5 cases. To reduce order effects, use cyclic
order: P01=`R1…R5`, P02=`R2…R5,R1`, …, P05=`R5,R1…R4`.

The participant runs each file. When the target refusal appears, the moderator
asks these three questions verbatim without explaining the code name:

1. “What is the problem?”
2. “Why is this scientifically risky?”
3. “What would you correct in the data or analysis context before continuing?”

Each response is scored independently in three dimensions:
`0=incorrect/empty`, `1=consistent with the interface text`. Merely reciting the
code is insufficient. One rater scores all responses; a blind second rater
scores at least 40% of randomly selected records, and disagreements are
recorded. Each R1–R5 observation carries the retained screen- and audio-
recording SHA-256 values for the same participant and a recording interval with
`startSeconds < endSeconds`. This interval lets a human auditor locate the
free-text response in the recording.

The second-rater sample across five participants × five refusal cases is not
selected manually after the fact. The manifest contains a `seed`,
`method=SHA256_SEEDED_ASC_V1`, and ten scenario IDs. For each `Pnn:Rn` ID,
calculate `SHA256(UTF-8(seed + NUL + scenarioId))`; sort by increasing digest
and then increasing scenario ID for ties; select the first 10 of 25 records.
The recorder recomputes this list exactly and rejects second ratings outside it.

## 7. AC-UX-03 — `Ea(α)` versus Kissinger comprehension

The participant loads the unchanged primary source together with
`C1_peaks.tsv` and runs the analysis. With both results visible, the moderator
asks verbatim:

> “Are the `Ea(α)` curve and the single-peak Kissinger Ea value on the screen two
> presentations of the same result? Which conversion or physical event does
> each represent, and can they be reported interchangeably?”

A fully correct response includes all four elements: (a) they are not the same
result; (b) `Ea(α)` is a curve from multi-rate comparisons at fixed conversion
levels and may vary with alpha; (c) Kissinger is one peak-specific value derived
from the β–Tp shift of the same physical stage; and (d) the results are not
interchangeable. No hint or second attempt is permitted. The first C1 response
is also bound to exact screen/audio hashes and a positive-length
`startSeconds`–`endSeconds` interval.

## 8. AC-UX-04 — Warning visibility

This is a same-build visual audit by an observer, not a participant-opinion
measure. Run W1–W4 separately. For each target code:

1. It is visible on the primary result surface as explicit, scroll-accessible
   text or a label, not only in a tooltip, console, or log.
2. The PDF generated from the same analysis contains the code or an equivalent
   explicit warning in its body.
3. The UI screenshot, PDF, rendered PDF page, and their SHA-256 values are added
   to the evidence package.

Complete the eight-cell matrix of four codes × two surfaces. A generic
“Limited” badge alone does not count as target-code visibility.

### 8.1 Same-build technical pre-evidence

Regenerate and verify the machine-produced package for the locked release:

```bash
npm run capture:warning-visibility
npm run verify:warning-visibility
npm run test:warning-visibility-evidence
```

For every W1–W4 case, the package under
`evidence/usability/v0.3.1/warning-visibility-current/` retains a real
system-Chrome result-card PNG, the downloaded PDF, every rendered PDF page, a
case record, and the SHA-256 manifest. When the same code occurs at multiple
method/alpha locations, the UI/PDF presents a readable group and scope count;
raw findings remain in the JSON audit trail.

This automation provides only **8/8 technical surface evidence**. Manifest
`humanVisualReview.status` must remain `NOT_PERFORMED` and the gate-closure
field must remain `false`; tests reject even a rehashed fabricated human-PASS
label. AC-UX-04 does not pass until a named observer personally inspects the
PNG/PDF renderings and records all eight cells.

## 9. Prespecified passing thresholds

| Gate | PASS threshold |
|---|---|
| AC-UX-01 | All 5/5 participants produce the correct PDF without rescue or formula entry in at most five macro stages; median semantic application activations ≤12 and no participant >15. |
| AC-UX-02 | All five target refusals communicate problem/risk/remedy meaning in the UI; problem and correction are correctly stated in all 25 cases; total across 75 dimension scores ≥90%, and no refusal case <80%. |
| AC-UX-03 | **Every** valid participant satisfies all four rubric elements on the first response. Even 4/5 is FAIL. |
| AC-UX-04 | UI+PDF matrix is 8/8 for `LIMITED_HEATING_RATES`, `LOW_R2`, `NUMERICAL_DERIVATIVE`, and `MULTISTEP_EA_VARIATION`, with every evidence hash present. |

If a threshold is not met, the result is `FAIL`; “almost passed” or participant
removal cannot convert it to `PASS`. If a technical failure genuinely
invalidates a session, record the reason, timestamp, and retest ID explicitly;
do not delete the first record.

## 10. Evidence-record schema

Retain one JSON record and associated hashed artifacts for each participant:

```json
{
  "studyId": "UX-v0.3.1-YYYYMMDD",
  "participantId": "P01",
  "eligibility": {"eligible": true, "quantitativeField": true,
    "csvXlsxAndPlotLiteracy": true, "tgaExperience": "basic|none",
    "routineKineticsLastTwoYears": false, "productContributor": false,
    "technicalEnglishReading": true, "priorParticipantExposure": false,
    "excludedReason": null},
  "consent": {"version": "UX-CONSENT-v1", "signedAt": "ISO-8601",
    "recording": true, "signedConsentReference": "CONSENT-P01"},
  "environment": {"os": "...", "browser": "...", "zoomPercent": 100, "networkOff": true},
  "build": {"path": "release/v0.3.1/Activation-Energy-Studio-v0.3.1.html", "sha256": "..."},
  "fixtureManifestSha256": "...",
  "happyPath": {
    "startedAt": "ISO-8601", "endedAt": "ISO-8601", "completed": true,
    "macroDecisionCount": 5, "semanticUiActivations": 11, "rawPointerClicks": 14,
    "osPickerClicks": 0, "rescues": 0, "formulaUsed": false,
    "exportPath": "...", "exportSha256": "...", "openedSuccessfully": true
  },
  "refusals": [{"fixtureId": "R1", "targetCode": "...", "visible": true,
    "problemScore": 0, "riskScore": 0, "actionScore": 0, "verbatimAnswer": "...",
    "recordingTimecode": {"screenRecordingSha256": "...",
      "audioRecordingSha256": "...", "startSeconds": 120, "endSeconds": 150}}],
  "comprehension": {"verbatimAnswer": "...", "score": 0, "hintGiven": false,
    "rubric": {"notSameResult": false, "eaAlphaIsConversionProfile": false,
      "kissingerIsPeakSpecific": false, "notInterchangeable": false},
    "recordingTimecode": {"screenRecordingSha256": "...",
      "audioRecordingSha256": "...", "startSeconds": 360, "endSeconds": 410}},
  "deviations": [],
  "evidence": [
    {"kind": "screen-recording", "path": "P01-session.mp4", "sha256": "..."},
    {"kind": "audio-recording", "path": "P01-session.wav", "sha256": "..."},
    {"kind": "screenshot", "path": "P01-result.png", "sha256": "..."}
  ],
  "observer": "O01", "scoredAt": "ISO-8601"
}
```

Each participant requires one complete `screen-recording` and one complete
`audio-recording`. The example screenshot is optional supplementary evidence;
the recorder requires screen and audio recordings and does not accept a
screenshot in place of either. Screen recordings use
`.m4v/.mkv/.mov/.mp4/.webm` and are at least 64 KiB; audio recordings use
`.aac/.caf/.flac/.m4a/.mp3/.ogg/.wav` and are at least 16 KiB. The files must
have different SHA-256 values. Extensions and minimum sizes are coarse
integrity prechecks only; playability, duration, actual screen content, and
audible audio require human evidence review.

The study-level report also includes participant flow, excluded/incomplete
sessions, proportions and confidence intervals by AC, click distributions,
second-rater agreement, the eight-cell warning matrix, all deviations, and the
final `PASS/FAIL/NOT TESTED` decision. Personal names are excluded.

In addition to participant JSON paths, the study manifest carries the exact
build/fixture hash, excluded sessions, blind second ratings for at least 40% of
25 refusal scenarios, the exact deterministic `secondRaterSelection` list, the
hashed W1–W4 × UI/PDF eight-cell matrix, and the coordinator's signed-record
reference. Evaluate integrity and prespecified thresholds fail-closed:

```json
"secondRaterSelection": {
  "seed": "UX-v0.3.1-YYYYMMDD-second-rater-v1",
  "method": "SHA256_SEEDED_ASC_V1",
  "selectedScenarioIds": ["P03:R4", "P01:R2", "... exact 10 deterministic ID ..."]
}
```

```bash
npm run record:usability-study -- \
  --manifest evidence/usability/observed-study/study-input.json \
  --output evidence/usability/observed-study/evidence-record.json
```

`scripts/record-usability-study.mjs` rejects personal-identity fields, email
addresses, hash mismatches, incorrect fixture/build, missing consent, zoom
other than 100%, missing/identical/undersized/wrong-extension screen or audio
recordings, invalid R1–R5/C1 timecodes or timecodes bound to incorrect hashes,
nondeterministic second-rater selection, duplicate scenarios, and inadequate
blind second-rating coverage. The tool calculates thresholds but does not
decode media or verify playable duration, captured content, participant
identity, consent authenticity, or observer accuracy. Every record requires
human content audit; generated status therefore remains
`AUTOMATED_THRESHOLDS_RECORDED_AWAITING_HUMAN_EVIDENCE_AUDIT`.

## 11. Current state and closure rule

In addition to interface components and automated copy tests, the 11-file
fixture manifest has been frozen deterministically. UX01 guided selections,
R1–R5 exact refusals, W1–W4 exact warnings, and the revised C1 dual-result path
have passed real ingestion-to-core prechecks. The fail-closed recorder that
checks participant/cohort record integrity and prespecified thresholds is
tested. Independent participants have not been run, the comprehension question
has not been scored, and **UI/PDF recordings from human sessions have not been
collected.** The human-usability gates therefore remain open.

`CURRENT_VALIDATION_STATUS.md` may be updated only after signed consent records
exist through de-identified references, participant JSON records are complete,
screen/PDF evidence is hashed, and the prespecified thresholds above have been
calculated.
