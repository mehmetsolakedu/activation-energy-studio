# Independent Scientific Review Protocol — v0.3.2

State: `UNSIGNED_AWAITING_INDEPENDENT_REVIEW`  
Acceptance gates: `AC-SCI-03`, `AC-VAL-05`  
Candidate: Activation Energy Studio v0.3.2

This protocol is an unsigned review instrument. Package integrity, automated
tests, and oracle agreement do not constitute independent scientific approval.

## 1. Reviewer eligibility

The reviewer must be a human with current experience in thermal analysis or
solid-state reaction kinetics. They must not have implemented the calculation
core, authored the validation fixtures, owned the product, or authored the
software/manuscript under review. They must disclose employment, supervisory,
coauthorship, financial, intellectual-property, consulting, and other possible
conflicts.

An AI agent, the product, or a member of the implementation team cannot sign
this review. Software may verify hashes and record completeness; it cannot
authenticate identity, expertise, observations, declarations, or a signature.

## 2. Stop conditions before observation

From the immutable handoff root, run:

```bash
node VERIFY_PACKAGE.mjs
```

Stop the review if verification fails. Record these values in the copied review
input before opening the application:

- release HTML SHA-256;
- release-manifest SHA-256;
- candidate-freeze SHA-256; and
- package-manifest SHA-256 from `PACKAGE_MANIFEST.sha256`.

Do not install dependencies or write observations inside the immutable handoff.
Copy `evidence/project` to a separate scratch directory for source/test work,
and keep all observed output in a separate `observed-review` directory.

## 3. Fixed review environment

Use a clean browser profile at 100% zoom. Record the operating system, browser
and version, locale, review start/end times in UTC, and whether the exact HTML
was opened through `file://`. Do not repair a refused input, suppress a warning,
or alter candidate bytes.

## 4. Required review cases

`REVIEW_CASES.json` is the machine-readable case index. Its expected
observations are audit targets, not forced verdicts. At minimum, review:

- `OAK_RAW`: raw licensed wide-series ingestion, FWO/KAS/Starink,
  source-observation provenance, and UI/PDF/CSV/JSON claim boundaries;
- `PAPER010_DERIVATIVE`: supplied-derivative Friedman alongside the integral
  methods and the retained publication-discrepancy boundary;
- `PAPER063_KISSINGER`: standalone publication-derived beta–Tp Kissinger,
  including whole-kelvin rounding and the absent separate-dataset licence;
- `SCI001_PARTIAL_TIME`: defective mapped time must fail closed;
- `SCI002_WIDE_DERIVATIVE`: derivative placement before target-alpha
  projection plus the malformed-adapter refusal;
- `LOW_R2` and `MULTISTEP`: diagnostics remain visible and attached; and
- `REFUSAL_R1` and `REFUSAL_R2`: a refused analysis cannot resemble a
  successful complete analysis.

For each UI/PDF/CSV/JSON decision, retain at least one exact relative evidence
path and SHA-256 outside the immutable package.

## 5. Optional deterministic prechecks

Automated prechecks are supporting evidence only. In a scratch copy of
`evidence/project`:

```bash
npm ci --ignore-scripts
npx vitest run \
  tests/scientific-blocker-regressions-v032.test.ts \
  tests/report-provenance-remediation.test.ts \
  tests/e2e-scientific.test.ts \
  tests/nr-cels-wide-production-oracle.test.ts

node --test \
  tests/paper010-oracle-reproducibility.test.mjs \
  tests/oak-oracle-reproducibility.test.mjs \
  tests/dryad-polyisoprene-oracle-reproducibility.test.mjs \
  tests/nr-cels-oracle-reproducibility.test.mjs \
  tests/coal-spt-paraffin-oracle-reproducibility.test.mjs
```

The Python oracle tests require a discoverable standard-library-capable Python
runtime. A skipped or unavailable runtime must be reported, not reclassified as
a pass.

## 6. AC-SCI-03 claim-boundary checklist

For UI, PDF, CSV, and JSON separately, record `PASS` or `FAIL` for all seven
items:

1. Results are labelled apparent activation energy.
2. Sample, process/stage, atmosphere, method, and conversion/peak context remain
   visible or machine-readable.
3. FWO, KAS, Starink, and Friedman are not presented as one immutable material
   constant.
4. Kissinger remains a separate peak result, not an `Ea(alpha)` point.
5. No result is described as proving a one-step mechanism.
6. Regression confidence intervals are not described as complete experimental
   uncertainty; excluded uncertainty sources remain explicit.
7. Refused or partial analyses cannot be mistaken for a successful complete
   analysis.

One failed surface keeps `AC-SCI-03` open.

## 7. AC-VAL-05 cross-method checklist

Record `PASS` or `FAIL` for all seven items:

1. FWO, KAS, Starink, and conditional Friedman are method-specific estimates on
   the same alpha basis.
2. Agreement is not called truth, proof, universal accuracy, or validation of a
   universal constant.
3. Divergence across methods or alpha remains visible; no average hides it.
4. Low-R2, derivative provenance, limited-rate, and multistep diagnostics remain
   attached to affected results.
5. Kissinger remains a single separate peak estimate.
6. Paper010 publication non-reproduction and its supplied-derivative boundary
   remain explicit; the nonstandard publication path is not silently accepted.
7. The reviewer states whether observations support only correct implementation
   and transparent comparison for the tested fixtures.

Any hidden divergence, pooled Kissinger result, truth claim, or suppressed
negative result is a release-stopping failure.

## 8. Required return and structural recording

Copy these files outside the package and complete them consistently:

- `SCIENTIFIC_REVIEW_INPUT_TEMPLATE.json`; and
- `INDEPENDENT_REVIEW_VERDICT_TEMPLATE.md` or a signed PDF derived from it.

Then run from the immutable handoff root:

```bash
node evidence/scripts/record-scientific-review.mjs \
  --package . \
  --input ../observed-review/review-input.json \
  --output ../observed-review/evidence-record.json
```

The recorder requires exactly 35 decisions, checks evidence hashes and decision
consistency, and rejects incomplete eligibility/signature fields. A successful
record remains
`STRUCTURALLY_VALIDATED_AWAITING_HUMAN_IDENTITY_AND_SIGNATURE_AUTHENTICITY_AUDIT`.
It does not close either gate. A separate human custodian must authenticate the
reviewer and signature before any gate disposition can be applied.

## 9. Candidate-change rule

Any change to a frozen release-package byte stops v0.3.2 review. Retain the
evidence as superseded and open a v0.3.3 remediation candidate. Never relabel
historical or automated evidence as an independent v0.3.2 observation.
