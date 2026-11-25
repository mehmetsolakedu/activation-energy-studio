# Independent Scientific Review Package — UNSIGNED

**State:** `UNSIGNED_AWAITING_INDEPENDENT_REVIEW`  
**Release:** Activation Energy Studio 0.2.0  
**Acceptance gates:** AC-SCI-03 and AC-VAL-05 remain `PARTIAL`.

This is an immutable input package for a qualified external reviewer. Its existence, successful generation, or successful integrity check is not a scientific sign-off.

## Locked identities

- Release SHA-256: `ce716471586b098806007853992bed6601dfa359d53e59fe1b50c849d911dbb7`
- Source release manifest SHA-256: `c5af42f4d9acc6aaca507cc3037cd1a1b5be76892da78211493e5e178cac843a`
- Fixed evidence artifacts: 116
- Required checklist decisions: 35 (28 AC-SCI-03 surface decisions + 7 AC-VAL-05 decisions)

## Integrity check

From the project root, run:

```sh
node scripts/generate-scientific-review-package.mjs --check
```

From the root of a transferred review package, run the packaged checker without the original project:

```sh
node evidence/scripts/generate-scientific-review-package.mjs --project-root evidence --output .. --check
```

The checker validates the exact package manifest, every copied artifact, generated template bytes, source release-manifest locks, the nested real-data manifest, and `PACKAGE_MANIFEST.sha256`. Any mismatch is a failure.

## Independent review procedure

1. Confirm the reviewer satisfies `evidence/SCIENTIFIC_REVIEW_SIGNOFF_PROTOCOL.md`, including the expanded independence and conflict-of-interest declarations.
2. Record the release, source-manifest, and review-package-manifest SHA-256 values in the decision record.
3. Follow `evidence/SCIENTIFIC_REVIEW_RUNBOOK.md`; use the locked R/W/C cases and Paper 010 path to inspect UI, PDF, CSV, and JSON separately.
4. Inspect the hand worksheet, synthetic fixture, Paper 010 provenance/derivation/raw/derived/reference chain, scientific traceability, report contract, QA PDF, and retained negative result.
5. Copy `INDEPENDENT_REVIEW_VERDICT_TEMPLATE.md` and `SCIENTIFIC_REVIEW_INPUT_TEMPLATE.json` outside this immutable package. Complete all 35 decisions, hashed evidence, comments, identity/declaration fields, separate gate dispositions, verdict, signed artifact, verification method/reference, and UTC times.
6. Run the packaged recorder:

```sh
node evidence/scripts/record-scientific-review.mjs \
  --package . \
  --input ../observed-review/review-input.json \
  --output ../observed-review/evidence-record.json
```

7. Return the signed verdict and structured evidence record separately. Do not overwrite either unsigned template or claim a PASS from package generation alone.

The package checker verifies immutable inputs. The record generator verifies the returned record's structure, exact decision set, hashes, eligibility declarations, time order, signature-artifact presence, and disposition consistency. Neither tool authenticates reviewer identity, declarations, observations, or signature validity, creates a signature, or automatically changes either acceptance gate.
