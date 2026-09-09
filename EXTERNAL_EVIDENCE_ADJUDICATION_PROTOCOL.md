# External Evidence Adjudication Protocol

**Status:** Prepared, not executed. No real adjudication record exists.  
**Release claim:** Technical candidate only; 64 P0 criteria are `PROVEN` and
eight external criteria remain open.  
**Virtualization:** Parallels is not used or required.

## Purpose

The platform, usability, and scientific recorders verify retained bytes and
calculate lane-specific technical dispositions. They deliberately do not
authenticate people, declarations, observations, consent, or signatures and
they never apply an acceptance-gate `PASS`.

`scripts/adjudicate-external-evidence.mjs` is the fail-closed bridge for the
evidence returned from those three lanes. It binds the exact release,
acceptance criteria, lane records, independent human audit reports, and signed
audit artifacts. It records a human adjudication candidate for each of the
eight external gates:

- scientific: `AC-SCI-03`, `AC-VAL-05`;
- platform: `AC-PLAT-01`, `AC-PLAT-02`;
- usability: `AC-UX-01`, `AC-UX-02`, `AC-UX-03`, `AC-UX-04`.

`AC-PLAT-03` is not part of this external set. Its English-dot,
Turkish-comma, and mixed-decimal refusal contract is independently proven by
the automated locale matrix named in the P0 evidence ledger.

## Parallels-free evidence route

The only accepted three-platform production-evidence route for this release
uses the fixed GitHub-hosted matrix:

- Ubuntu 24.04, x64;
- macOS 15, arm64;
- Windows 11 ARM, arm64.

The direct local macOS run remains a technical diagnostic. Neither it nor a
green hosted job is a human-reviewed platform `PASS`.

## Required lane inputs

Every lane must provide:

1. the actual recorder output and its SHA-256;
2. an independent human content/authenticity audit and its SHA-256;
3. a distinct signed-audit artifact and its SHA-256;
4. a named human adjudicator, organization, professional reference,
   independence and conflict-of-interest declarations;
5. a bounded UTC review interval and signature time;
6. one decision for every gate in that lane, with an exact evidence reference
   and rationale.

All paths are relative to the completed input file. Absolute paths, traversal,
symlink escape, missing bytes, hash mismatch, placeholders, duplicated gates,
unknown gates, wrong lane schemas, contradictory platform eligibility, or a
release mismatch fail before output is written.

## Dispositions

The recorder derives only:

- `HUMAN_ADJUDICATED_PASS`: the lane technical result and human content
  decision are `PASS`, and the signed human authenticity decision is
  `VERIFIED`;
- `FAIL`: any retained technical failure, human content failure, or failed
  authenticity decision;
- `REMAINS_OPEN`: required human content or authenticity work is not yet
  verified.

Even an eight-of-eight candidate retains:

```text
softwareAuthenticatedIdentity=false
acceptanceGatesAutomaticallyApplied=false
validatedMvp=false
```

`TECHNICAL_OK` means only that the bytes and declared human adjudication are
structurally consistent. It is not an acceptance-gate result.

## Command

Copy
`governance/EXTERNAL_EVIDENCE_ADJUDICATION_INPUT_TEMPLATE.json` to a new
working file outside immutable evidence packages, replace every placeholder
from the real retained evidence, and run:

```text
node scripts/adjudicate-external-evidence.mjs \
  --input <completed-input.json> \
  --output <new-adjudication-record.json>
```

For a fail-closed release-readiness assertion:

```text
node scripts/adjudicate-external-evidence.mjs \
  --input <completed-input.json> \
  --output <new-adjudication-record.json> \
  --assert-all-pass
```

The assertion exits nonzero and writes no output unless all eight derived
dispositions are `HUMAN_ADJUDICATED_PASS`.

## Immutable closeout dependency order

The candidate evidence manifest used to issue the external review package and
validation kit becomes immutable once those materials leave the project. It
must not be regenerated after evidence returns.

The cycle-free future order is:

```text
immutable candidate manifest
  -> scientific review package
  -> external validation kit
  -> three returned lane records
  -> external adjudication record
  -> separate P0 closeout ledger
  -> separate known-issues closeout snapshot
  -> separate final validation snapshot
  -> closeout-v2 five-role sign-off
  -> independent signer-authenticity verification
  -> final closeout evidence manifest
```

The final closeout manifest must be a new artifact. It must not replace or
rewrite the candidate manifest that the returned evidence already locks.
Until real records return, none of the adjudication or downstream closeout
artifacts is generated and the current eight gates remain open.
