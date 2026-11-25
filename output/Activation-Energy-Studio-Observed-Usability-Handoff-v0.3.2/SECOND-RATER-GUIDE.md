# v0.3.2 Blind Second-Rater Guide

The recorder deterministically selects ten of the 25 P01–P05 × R1–R5 scenarios
using `SHA256_SEEDED_ASC_V1`. Do not replace, reorder, or supplement that list
after seeing primary scores.

For each selected timecoded response, score independently:

- problem: `1` only when the participant correctly describes the observed data
  or analysis problem;
- risk: `1` only when the scientific consequence is stated consistently with
  the interface explanation; and
- action: `1` only when a scientifically valid correction is proposed.

Merely reading a code name is insufficient. The second rater must be blind to
the primary scores and must not be the primary observer for that scenario.
Record the rater ID and all three binary scores. Do not resolve disagreement by
overwriting either score; the recorder reports exact agreement separately.
