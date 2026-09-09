# Independent Scientific Review Sign-off Protocol — Technical English Edition

> This is the standalone technical-English edition of the immutable v0.2
> protocol. The byte-bound historical source remains at
> [`SCIENTIFIC_REVIEW_SIGNOFF_PROTOCOL.md`](../../SCIENTIFIC_REVIEW_SIGNOFF_PROTOCOL.md).

**Status:** Prepared, not yet executed by an independent reviewer.  
**Acceptance gates:** AC-SCI-03 and AC-VAL-05.  
**Boundary:** This document is a review instrument; its existence is not a scientific sign-off.

## Reviewer eligibility

The reviewer must be a human with current experience in thermal analysis or
solid-state reaction kinetics and must not have implemented the calculation
core or authored the validation fixtures. The reviewer must additionally
declare that they:

- are not the product owner or a manuscript/software author;
- have no project employment, direct supervisory, or dependent reporting
  relationship that can influence the verdict;
- have no recent coauthorship relationship with the project team that is left
  undisclosed;
- have no financial or intellectual-property interest in the result;
- have no undisclosed paid consulting or review influence;
- have no other undisclosed conflict of interest.

The retained sign-off must state the reviewer's name, affiliation, public
professional profile, relevant expertise and evidence of that expertise,
independence statement, conflict-of-interest statement, all eligibility
declarations, UTC review interval, review OS/browser/locale, and the exact
release/manifest hashes reviewed. An AI agent or the software itself cannot issue the independent sign-off.
The software can require and preserve these declarations; it cannot authenticate the identity or determine whether a declaration is truthful.

## Locked review package

Review the exact artifacts indexed by `release/MANIFEST.v0.2.0.json` and verified by `release/SHA256SUMS.txt`. At minimum, retain:

- the release HTML and checksum ledger;
- `00_MISSION_LOCK.md`, `01_SCIENTIFIC_SPEC_V1.md`, and `02_ACCEPTANCE_CRITERIA.md`;
- `SCIENTIFIC_TRACEABILITY_REPORT.md` and `NUMERICAL_VALIDATION_REPORT.md`;
- the deterministic schema-v4 QA PDF, JSON Schema, and report-contract tests;
- the independent hand worksheet and synthetic layer-2 fixture;
- the immutable real-data manifest, independent four-method Decimal reference,
  official supplied-DTG provenance, and `REAL_DATA_VALIDATION_STATUS.md`
  negative publication-reproduction result;
- the separately labelled Paper 063 publication-derived β–Tp fixture,
  provenance, retained Kissinger reference and production-path verification,
  without treating it as raw-curve evidence.

Any hash mismatch invalidates the review until the reviewer explicitly accepts a newly generated manifest and restarts the affected checks.

After the release manifest is final, create and verify the portable, explicitly
unsigned package with:

```bash
npm run review:package
npm run verify:scientific-review-package
```

The generated directory is `output/independent-scientific-review-v0.2.0/`.
Its initial state must remain `UNSIGNED_AWAITING_INDEPENDENT_REVIEW`; the
generator and software are not permitted to populate reviewer identity,
decisions, signature, or a PASS verdict.

## AC-SCI-03 claim-boundary audit

For UI, PDF, CSV, and JSON separately, record PASS/FAIL with an evidence location for every item:

1. Results are labelled as apparent activation energy.
2. Sample, process or reaction stage, atmosphere, method, and conversion/peak context remain visible or machine-readable.
3. FWO/KAS/Starink/Friedman values are not presented as a single immutable material constant.
4. Kissinger is explicitly a separate peak result, not an `Ea(alpha)` point.
5. No result is described as proving a one-step mechanism.
6. Regression confidence intervals are not described as total experimental uncertainty; within-heating-rate replicate variability, calibration, anchor, baseline, and derivative-method uncertainty exclusions remain explicit.
7. Refused or partial analyses cannot be visually mistaken for a successful complete analysis.

One failed surface keeps AC-SCI-03 open.

## AC-VAL-05 cross-method interpretation audit

Inspect both the locked synthetic report and the real Paper 010-derived validation path, including the stdlib-only Decimal(50) oracle:

1. FWO, KAS, Starink, and conditional Friedman are shown as method-specific estimates on the same alpha basis.
2. Numeric agreement is not called truth, proof, accuracy, or validation of a universal constant.
3. Divergence across methods or alpha is retained and visible; no averaging hides it.
4. Low-R2, supplied- versus numerical-derivative provenance, limited-rate, and multistep diagnostics remain attached to the affected result.
5. Kissinger remains a single separate peak estimate and is not pooled with isoconversional curves.
6. The failure to reproduce the publication's Table 4 averages from the accessible Paper 010 raw curves remains explicit, including the equation-correct Friedman versus S4 lnda/dt label/value inconsistency; the nonstandard publication path is not silently accepted as valid Friedman preprocessing.
7. The reviewer states whether the observed synthetic and real-data patterns support only the bounded claim: correct implementation and transparent method comparison for the tested fixtures.

Any hidden divergence, pooled Kissinger value, truth claim, or suppressed negative result is a release-stopping FAIL.

## Required retained decision record

The reviewer must return both:

1. a human-readable signed Markdown or PDF verdict; and
2. a structured JSON input conforming to
   `activation-energy-studio/scientific-review-input/v1`.

The structured record contains:

| Field | Required value |
|---|---|
| Release SHA-256 | Exact value from `release/SHA256SUMS.txt` |
| Release-manifest SHA-256 | Hash over `release/MANIFEST.v0.2.0.json` |
| Review-package-manifest SHA-256 | Exact value from `PACKAGE_MANIFEST.sha256` |
| Reviewer identity/expertise/eligibility/conflict | All required fields and declarations completed |
| AC-SCI-03 | Exact 28 unique IDs; each has PASS/FAIL, case ID, one or more retained evidence paths with SHA-256, and a non-empty comment |
| AC-VAL-05 | Exact 7 unique IDs; each has PASS/FAIL, case ID, one or more retained evidence paths with SHA-256, and a non-empty comment |
| Separate gate dispositions | `PASS`, `FAIL`, or `REVISION_REQUIRED`, consistent with the item decisions |
| Overall verdict | `PASS`, `FAIL`, or `REVISION_REQUIRED`, consistent with both gate dispositions |
| Signed verdict artifact | Relative path, SHA-256, accepted verification method/reference, and UTC signature time |

Accepted signature methods are `PADES_DIGITAL_SIGNATURE`,
`PGP_DETACHED_SIGNATURE`, `MINISIGN_DETACHED_SIGNATURE`,
`INSTITUTIONAL_EMAIL_ATTESTATION`, and
`WET_SIGNATURE_WITH_INDEPENDENT_IDENTITY_CHECK`.

From the project root, with the reviewer input and all retained evidence kept
outside the immutable package, run:

```bash
npm run record:scientific-review -- \
  --package output/independent-scientific-review-v0.2.0 \
  --input evidence/scientific-review/observed/review-input.json \
  --output evidence/scientific-review/observed/evidence-record.json
```

From a transferred package root, the same check is portable:

```bash
node evidence/scripts/record-scientific-review.mjs \
  --package . \
  --input ../observed-review/review-input.json \
  --output ../observed-review/evidence-record.json
```

The recorder rejects missing, duplicate, unknown, or `NOT_REVIEWED` decisions;
path traversal; empty or hash-mismatched evidence; release/manifest lock drift;
invalid review/signature time order; ineligible or contradictory
conflict-of-interest declarations; absent or unsupported signature evidence;
and a gate/overall PASS that contradicts item decisions. It derives
AC-SCI-03 and AC-VAL-05 dispositions separately.

The output state remains
`STRUCTURALLY_VALIDATED_AWAITING_HUMAN_IDENTITY_AND_SIGNATURE_AUTHENTICITY_AUDIT`.
Structural validation does not authenticate the reviewer, declarations,
scientific observations, institutional message, or legal/cryptographic
signature validity and does not automatically change either acceptance gate.
Only an all-item independent PASS within a gate, followed by human identity and
signature-authenticity verification, may make that gate eligible for PASS.
Missing identity, hashes, evidence locations, decisions, signature, or human
authenticity verification keeps the affected gate open.
