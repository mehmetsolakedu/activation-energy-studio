# Activation Energy Studio v0.3.2 Scientific Remediation Addendum

Status: normative review input for the frozen v0.3.2 candidate.  
Independent-review state: `UNSIGNED_AWAITING_INDEPENDENT_REVIEW`.

This addendum narrows the scientific review to the behavior added while closing
`SCI-001` and `SCI-002`. It supplements the locked V1 scientific specification;
it does not declare either acceptance gate complete.

## SCI-001: mapped-time completeness

A mapped time series is usable only when every retained observation has a
finite time value. The implementation must behave as follows:

- a fully present, finite time series may be used for time-domain finite
  differences;
- a mapped series containing a missing, `NaN`, positive-infinite, or
  negative-infinite value must fail closed with `INVALID_TIME_SERIES`;
- the software must not silently replace a partially defective mapped time
  series with a temperature/heating-rate derivative; and
- the documented temperature/heating-rate fallback remains permitted only when
  time is absent for the entire retained series.

The independent reviewer must inspect the source and deterministic regression
case. A passing automated regression is supporting evidence, not a substitute
for the reviewer decision.

## SCI-002: derivative placement for raw wide series

When a raw wide series has no supplied `d(alpha)/dt`, the derivative used by
Friedman must be calculated on retained source observations before target-alpha
projection:

\[
\frac{d\alpha}{dt}=\beta\frac{\Delta\alpha}{\Delta T}.
\]

The projected derivative, derivative-source label, and source-row references
must travel together through normalization and analysis. Changing only the
target-alpha grid must not change the underlying source-observation derivative
definition.

A lower-level caller that preserves wide-projection provenance but discards the
projected derivative or source-row fields must fail closed with
`WIDE_PROJECTED_DERIVATIVE_MISSING`. It must not fall back to differentiating
the projected target-alpha grid.

The immutable v0.3.1 audit harness manually removed the new projection fields.
It remains useful as historical negative evidence, but it is not a positive
production-path closure test for v0.3.2. Review the current production ingestion
path and the explicit malformed-adapter refusal separately.

## Claim boundary

These changes support only a bounded implementation claim for the frozen
candidate and the retained fixtures. They do not establish universal physical
truth, a material constant, a reaction mechanism, complete experimental
uncertainty, or independent scientific approval.
