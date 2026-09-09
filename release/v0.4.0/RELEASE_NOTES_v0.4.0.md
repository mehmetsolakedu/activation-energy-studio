# Activation Energy Studio v0.4.0 release candidate

Status: **unreleased audit candidate**. These notes do not constitute a
release, deployment, journal update, or Zenodo deposit.

v0.4.0 is reserved for material corrections identified by the end-to-end
scientific and software audit. The final notes must be completed from the
verified change ledger after all P0/P1 findings are closed. Expected candidate
change classes include numerical conditioning and refusal rules, irregular-grid
derivative handling, explicit beta-Tp peak-quality evidence, parser hardening,
state/provenance integrity, and export safety.

## Dependency security snapshot

The audit initially identified the moderate-severity DOMPurify advisory
[GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7)
in the transitive production dependency closure. The candidate now pins
DOMPurify 3.4.15 through an npm override. A fresh
`npm audit --omit=dev --json` check against the resulting lockfile reported
zero production advisories. The pre-fix response, remediation record, and
post-fix response remain in the audit evidence package. This is a time-bounded
registry result, not a timeless claim that the software is vulnerability-free.

Release is blocked until all of the following are true:

1. the independent oracle, synthetic ODE, controlled-noise, real-data,
   metamorphic, adversarial, mutation, browser, offline, export, and manuscript
   consistency gates are complete;
2. no P0 or P1 finding remains open and no critical test is skipped;
3. the final single-file HTML is reproduced from the reviewed source;
4. the final release manifest and SHA-256 checksum file cover every shipped
   artifact;
5. Mehmet Solak explicitly approves external publication or deployment.

The historical v0.3.2 artifact remains immutable and separately identifiable.
