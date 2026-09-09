# v0.3.2 Independent Human Evidence Audit

This audit occurs only after the structural recorder succeeds. The recorder's
hash and threshold checks do not authenticate session content.

For every P01–P05 session, an auditor independent of study scoring must verify:

- the screen and audio files open and cover the declared session;
- the recording shows a live participant using the frozen v0.3.2 build;
- the participant ID, consent reference, environment, and timing are
  internally consistent;
- each R1–R5 and C1 timecode contains the retained verbatim response;
- scores match the audible response and no unrecorded coaching occurred;
- reported rescues, errors, and deviations were not removed;
- no recording or answer was generated, duplicated, substituted, or relabeled;
- each happy-path PDF hash identifies the export shown in the session; and
- no prohibited identity or sensitive data is present in the returned package.

For W1–W4, inspect each UI artifact and every page of each PDF. Record whether
the exact warning or an explicit equivalent is readable. Generic badges do not
count. Confirm all eight artifacts are distinct and match their hashes.

The signed audit must identify the auditor, date, inspected record/package
hashes, each accepted or rejected item, deviations, and final recommendation.
An auditor must not sign evidence they created or scored. Any unresolved
authenticity or content discrepancy keeps the relevant gate `EXTERNAL_OPEN` or
produces `FAIL`; it cannot be repaired by editing the observation record.
