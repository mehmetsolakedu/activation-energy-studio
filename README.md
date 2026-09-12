# Activation Energy Studio

Activation Energy Studio is an evidence-grounded, offline-first application for
apparent activation-energy analysis of multi-heating-rate thermoanalytical data.

The released v0.4.0 Research Preview presents a three-step workflow: upload data,
inspect and explicitly confirm the software interpretation, then calculate and
download a bounded scientific report. Its user interface and canonical
documentation use standard technical English. It includes Simple and Expert
modes, three one-click licensed real examples, advisory instrument profiles,
TG/DTG and stage preview, visible m0/mf anchors, and four exact scientific
dispositions:

- `REPORTABLE`
- `REPORTABLE_WITH_CAUTION`
- `CALCULATED_UNRELIABLE`
- `CALCULATION_REJECTED`

CSV/TSV/TXT/XLSX ingestion remains fail-closed for ambiguous columns, units,
decimal notation, header rows, workbook sheets, layouts, and physical stage.
FWO/OFW, KAS, Starink, Friedman, and separate β–Tp Kissinger outputs retain
Ea(alpha), regression diagnostics, provenance, regression-only confidence
intervals, and JSON/CSV/PDF exports. Its report schema is
`activation-energy-studio/project-report/v7`; the scientific calculation core
and formula set are `activation-energy-core/v3` and
`activation-energy-formulas/v1`.

The project is intentionally separate from the source-PDF corpus. Scientific
method eligibility, equations, warnings, and validation fixtures are derived
from the visually verified evidence chain under `../01_PDF_Evidence_Extraction`.
`evidence/corpus/CORPUS_INTEGRITY_LEDGER.json` hash-locks all 231 source PDF
records and their extraction coverage. It also preserves the important unit
boundary: these are 230 primary PDFs plus one supplementary PDF, not locally
verified evidence of 231 distinct Q1/Q2 articles.

## Release and historical disposition

Activation Energy Studio v0.4.0 is the current bounded Research Preview,
approved for public distribution by Mehmet Solak on 2026-09-12. Its canonical
repository is <https://github.com/mehmetsolakedu/activation-energy-studio> and
its canonical web entry point is
<https://mehmetsolak.cc/activation-energy-studio/>. The versioned v0.3.2 HTML
and its historical records remain immutable and separately identifiable.

The v0.4.0 release was promoted from frozen candidate commit
`7ea6575342c822eae609ba3d32a785dcb5a94b6e` after the end-to-end audit verdict
**CONDITIONAL PASS — SAFE RESEARCH PREVIEW WITH LISTED LIMITATIONS**. Promotion
changes are confined to release-state interface wording, documentation,
citation and package metadata, and their tests; scientific and calculation
code is unchanged from that audited candidate. The manifest records both the
audited-candidate identity and the exact released bytes.

This decision is supported by the hash-locked release, deterministic scientific
oracle lanes, real-data reproduction, complete automated verification, static
offline verification, and a fresh offline macOS/Chrome run of the frozen
candidate with retained JSON, CSV, PDF, screenshot, HAR, and raw CDP evidence.
It does not claim independent peer review, Windows/Linux validation,
cross-platform certification, observed human usability, validated-MVP status,
or regulatory fitness.

The separate external-validation workspace remains `EXTERNAL_OPEN /
OPTIONAL_EXTERNAL_EVIDENCE_NOT_COLLECTED`. Its reviewer, multi-OS, and
participant lanes are optional future work for stronger claims; they are not
requirements for closing or publishing this Research Preview. Local automation
and same-host simulation are never relabelled as external or human evidence.
See the generated
[`Research Preview closeout`](output/v0.3.2-solo-closeout/RESEARCH_PREVIEW_CLOSEOUT.md)
and its hash-bound full-check receipt.

## Local commands

```bash
npm ci
npm run dev
npm test
npm run package:v0.4.0
npm run verify:release-manifest:v0.3.2
npm run close:solo:v0.3.2
```

`npm run build` produces a self-contained offline HTML application in `dist/`.
`npm run package:v0.4.0` builds it, verifies the single-HTML offline boundary,
and writes the v0.4.0 Research Preview HTML,
manifest, checksum index, English documentation, legal files, and templates to
`release/v0.4.0/`. The package also includes the exact JSON report schema.
`npm run package:v0.3.2` and `npm run verify:release-manifest:v0.3.2` are
read-only aliases that verify the immutable historical v0.3.2 package; they do
not rebuild or overwrite it.
`npm run verify:offline` checks the fresh bundle statically.

The byte-bound v0.2 and v0.3.0 artifacts remain unchanged as historical
evidence. English companion translations for immutable v0.2 technical
documents are indexed in `docs/technical-english/README.md`.

The longer commands and evidence paths below describe the retained v0.2
validation/governance system. Those immutable records remain historical
provenance; they are not silently relabelled as v0.3 evidence. `npm run check`
runs that broader legacy-aware suite, including the current application and
contract regressions; fifteen
independent Paper 010, two Oak, five Dryad, eight NR–CELS and four
Coal–SPT–Paraffin oracle/integrity tests; 24 Paper 010 raw-to-report
tamper/verifier tests; seven recursive fixture-manifest tests;
eleven single-platform recorder tests, five three-platform matrix tests,
23 platform human-review recorder tests, 27 default
hosted-platform technical passes plus one deliberate real-Chrome Worker skip
(28/28 technical passes in the opt-in run),
five direct-local-macOS diagnostic/verifier tests, four offline-verifier
regressions, six warning-evidence tamper/boundary tests, two
scientific-traceability tests, 25
structured-review recorder tests, fourteen review-package tests and six
external-kit tests, ten external-evidence adjudication tests, plus twelve
P0-ledger/release-verification and fifteen
known-issue/release-signoff governance tests. It also runs the five-method
traceability audit, 231-PDF
corpus integrity ledger, all five official real-data fixture locks,
deterministic validation-kit
check, build, and static offline gate.
`npm run verify:scientific-traceability` independently checks the implemented
method-matrix/render/note/finding routes. A current direct-macOS/Chrome
automated zero-external-request bundle is retained as technical evidence;
human-reviewed macOS and real hosted Windows/macOS/Linux evidence remain
optional gates only for stronger external-validation claims.

`npm run corpus:ledger` regenerates the non-destructive corpus integrity ledger;
`npm run verify:corpus-ledger` verifies its source hashes, 001–231 coverage,
231 PDF hashes, the known 30-row blank-ID defect and deterministic derived
assignments for paper 011–013. Q1/Q2 remains explicitly `NOT_VERIFIED` when no
authoritative quartile ledger exists.

`npm run qa:pdf` regenerates the deterministic schema-v6 report used
for text, pagination, plot, and all-page visual QA. The regular test suite also
checks that the committed PDF is byte-current with its fixture and generator.

The reviewer, multi-OS, and participant commands below are retained as optional
stronger-scope validation infrastructure. They are not required to distribute
or close the v0.3.2 Research Preview.

`npm run fixtures:usability` regenerates the locked eleven-file input bundle
for the `UX-v0.3.1` English study; `npm run verify:usability-fixtures` checks
its current release/input hashes and exact refusal/warning targets. `npm run
capture:warning-visibility` runs W1–W4 through the locked v0.3.1 English release
in offline real Chrome and retains four UI
screenshots, four exported PDFs, every rendered PDF page, case records and a
SHA-256 manifest; `npm run verify:warning-visibility` and
`npm run test:warning-visibility-evidence` enforce the 8/8 technical matrix and
reject any automated claim of human review or usability-gate closure. A named
human visual observer is required only if an observed-human usability claim is
later pursued under the
[current English usability protocol](docs/technical-english/USABILITY_VALIDATION_PROTOCOL.md).
`npm run record:platform-evidence -- --manifest
<run-input.json> --output <evidence-record.json>` creates one fail-closed
OS/browser record from eight retained artefacts, including the in-app self-test,
non-empty timed HAR, real-dimension screenshot and three exports. After three
real runs, `npm run record:platform-matrix` requires exactly
macOS/Windows 11/Ubuntu records with common release/input/build/scientific hashes
and zero external requests; its output still awaits human evidence review.
`npm run record:platform-human-review -- --input
<platform-human-review-input.json> --output
<platform-human-review-record.json>` then binds the matrix, all three source
records, runner provenance and retained HAR/screenshot/PDF/JSON/CSV bytes to
seven explicit human decisions per operating system. Its successful output is
only structurally validated: the software does not authenticate the reviewer
and does not mark AC-PLAT-01 or AC-PLAT-02 PASS.
After real participant sessions, `npm run record:usability-study -- --manifest
<study-input.json> --output <evidence-record.json>` validates consent references,
de-identification, `UX-v0.3.1` identity, technical-English reading eligibility,
exact 100% zoom, screen/audio recording hashes and task
timecodes, deterministic 40% blind second scoring and the prespecified UX
thresholds; it cannot manufacture or authenticate human evidence.
After all three real lanes return,
`npm run record:external-evidence-adjudication -- --input
<completed-adjudication-input.json> --output
<external-evidence-adjudication-record.json>` binds their exact records to
separate signed human audits and derives the eight external-gate candidates.
Its `TECHNICAL_OK` output never authenticates identity, applies a gate, edits a
known issue, or declares a validated MVP; see
`EXTERNAL_EVIDENCE_ADJUDICATION_PROTOCOL.md`.
The in-app self-test JSON is preliminary runtime evidence only and explicitly
cannot replace the retained HAR, screenshot, exports, or three-platform exact
comparison required by the
[English edition of the retained v0.2 platform protocol](docs/technical-english/PLATFORM_VALIDATION_PROTOCOL.md).
Its full-precision numeric payload is retained unchanged. The cross-runtime
payload lock is computed separately with the versioned field policy recorded in
the JSON: Ea uses 6 decimal places, R² uses 12, alpha/threshold values use 6,
and categorical fields plus array order remain exact. The recorder independently
recomputes this canonical hash; this removes only the five measured Chrome
150-versus-Node last-bit Ea differences (maximum `1.4211e-13 kJ/mol`).

Parallels is not required for the three-platform evidence route. The manual
`.github/workflows/platform-validation.yml` workflow pins `macos-15`,
`ubuntu-24.04`, and `windows-11-arm`, then drives the installed system Chrome
through the locked `file://` golden flow. Workflow actions are commit-pinned;
Node architecture is fixed and checked against `process.arch`, only the
platform Google Chrome installation at the commit-controlled major is accepted,
and missing retained output makes artifact upload fail.
The harness reapplies offline mode after local navigation, monitors attached
descendant targets, waits for Chrome-completed stable downloads, and retains raw
CDP events, an action-marked HAR, screenshot, self-test, JSON/CSV/PDF exports,
runner provenance, and a draft recorder manifest. That draft always remains
`AUTOMATED_RUN_EVIDENCE_AWAITING_HUMAN_REVIEW`: its observer is a rejected
placeholder and every operator confirmation is `false`. A real GitHub
repository/remote and subsequent human evidence review are still required;
local preparation or a green workflow is not a platform PASS. See
`HOSTED_PLATFORM_VALIDATION.md`.

For a direct local Mac, `npm run validate:local-macos-diagnostic -- --output
<new-empty-directory>` runs the same locked golden flow in the installed Google
Chrome without hosted provenance. The current ten-file result is retained under
`evidence/platform/local-macos/v0.2.0-current-release/`; `npm run
verify:local-macos-diagnostic` checks every payload hash and confirms that the
copied release/input still match `release/SHA256SUMS.txt`. The command refuses
GitHub Actions, emits no hosted draft, and labels the result
`LOCAL_AUTOMATED_DIAGNOSTIC_NOT_PLATFORM_EVIDENCE`; it does not close either
platform gate.
The v0.3.2 solo closeout additionally retains a fresh twelve-file run of the
exact candidate under
`evidence/solo-closure/v0.3.2/local-macos-diagnostic/`. That run establishes
local macOS/Chrome execution and the offline boundary only; it is not evidence
of Windows, Linux, independent review, or observed-human usability.
The retained v0.2 independent-review package is immutable historical evidence.
`npm run review:package`, `npm run test:scientific-review-package`, and
`npm run verify:scientific-review-package` now perform read-only verification
through the package's embedded v0.2 checker; they do not rebuild it from the
v0.3.2 source tree. `npm run record:scientific-review` structurally verifies the returned 35
decisions, evidence hashes, independence/COI declarations, separate gate
dispositions and signed artefact. Neither command authenticates the reviewer or
signature, and neither can turn AC-SCI-03 or AC-VAL-05 into PASS alone.

Release governance is also fail-closed. `npm run p0:evidence-ledger` materializes
the exact 72-gate path/hash map without upgrading the eight externally open
gates. `npm run known-issues` regenerates the severity-tagged issue ledger;
three open major P0 external-evidence issues currently keep
`validatedMvpEligible=false`; that stronger validated-MVP state does not block
the bounded Research Preview verdict. For a future institutional sign-off,
`npm run release-signoff:template` prepares five roles—math, data/I/O, thermal
analysis, QA and product owner—and
`npm run record:release-signoff` validates their decisions and byte locks
without authenticating identities or signatures. After all byte-producing work
is frozen, `npm run record:release-verification -- --execute --output-dir
<new-directory> --run-id <id>` runs the exact `npm run check` command and emits
a hash-bound log, summary and sidecar as a post-check closeout record.

The retained v0.2 external-validation kit is also immutable historical
evidence. `npm run validation:kit`, `npm run test:validation-kit`, and
`npm run verify:validation-kit` are intentionally read-only aliases that verify
the archive sidecar, internal manifests, and all 397 payload hashes. They do not
regenerate or relabel the v0.2 package as v0.3.2. The kit remains a historical
handoff mechanism, not evidence that external work occurred.

`npm run derive:paper010` reproducibly regenerates the bounded real-data
validation fixture from the immutable official PLOS S2 workbook.
The application can set the explicit `0.05–0.80`/`0.05` alpha grid and therefore
emit all 16 conversion levels for each of the four isoconversional methods
instead of truncating this fixture to the conservative default grid.
`npm run verify:paper010-raw-to-report` checks the retained two-pass real-Chrome
offline UI→JSON/CSV/PDF reproduction package, including 64 results per pass,
1,604 high-precision oracle comparisons per pass, exact cross-pass scientific
JSON/CSV determinism, local-only HARs, screenshots, five-page PDFs, and the
fail-closed Kissinger refusal. Its status is deliberately
`LOCAL_TECHNICAL_REAL_DATA_REPRODUCTION_NOT_INDEPENDENT_REVIEW`.
`npm run verify:paper010-oracle` independently reopens the official S2, S4,
and S5 XLSX files with Python standard-library OOXML parsing, regenerates the
same 48-row CSV byte-for-byte,
and recomputes every KAS/FWO/Starink/equation-correct Friedman transformed
value, OLS diagnostic, confidence interval, and Ea using `Decimal(50)`.
Friedman uses the official RH -DTG columns converted from `%/min` to
`dAlpha/dt [1/min]`; all 48 target rates are positive and enter the application
as supplied derivatives. The oracle never imports application source; its
launcher discovers `python3`, `python`, or Windows `py -3`, so this validation
path does not require Parallels. Source/oracle/reference hashes, exact
predeclared tolerances, the initial-normalized mass-loss alpha definition, and
the equation-correct versus nonstandard publication-reproduction diagnostic
are locked under
`tests/fixtures/real/` and documented in
`REAL_DATA_VALIDATION_STATUS.md`.

The separate `tests/fixtures/real/paper063/` lane locks five beta–Tp values
printed in paper 063 and compares the production standalone Kissinger result
with an independently retained reference. It yields 194.4543302994671 kJ/mol
with R² 0.9991522617128968. This is explicitly a publication-derived,
whole-kelvin peak table, not instrument-exported TGA/DTG curves; it has no
separate dataset licence and does not satisfy the P1 second-raw-curve target.

Four further official raw-data lanes are now locked beside Paper 010:
Chilean Oak, NR–CELS, Dryad Polyisoprene and Coal–SPT–Paraffin. Each lane
retains source version/licence/hash, explicit preprocessing semantics, an
application-independent `Decimal(50)` reference and a production-path or
bounded-core comparison. Publication mismatches are not fitted away: Oak's
apparent KAS coefficient error, NR–CELS proprietary preprocessing gap,
Dryad's swapped Table 3 sample rows and Coal's dataset/version labelling
issues remain classified negative evidence. See the
[English final report](evidence/validation/REAL_DATA_VALIDATION_FINAL_REPORT.en.md)
and `REAL_DATA_VALIDATION_STATUS.md`.

`npm run fixtures:manifest` regenerates the recursive SHA-256 inventory for all
79 files under `tests/fixtures`; `npm run verify:fixture-manifest` rejects any
added, removed, changed, symlinked, or otherwise untracked fixture before the
release chain can pass.

The current technical-English project scope and completion gates are defined in
[`00_MISSION_LOCK.md`](docs/technical-english/00_MISSION_LOCK.md),
[`01_SCIENTIFIC_SPEC_V1.md`](docs/technical-english/01_SCIENTIFIC_SPEC_V1.md),
and [`02_ACCEPTANCE_CRITERIA.md`](docs/technical-english/02_ACCEPTANCE_CRITERIA.md).
Their root v0.2 counterparts remain immutable historical evidence.
