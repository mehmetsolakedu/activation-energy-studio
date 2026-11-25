# Activation Energy Studio v0.3.2 — Observed Usability Handoff

This is an execution-ready package for `AC-UX-01` through `AC-UX-04`. It is not
a completed study. The package contains zero participant observations and must
remain `externalEvidenceComplete=false` until five genuine sessions and an
independent human evidence audit exist.

## Before recruitment

1. Run `node VERIFY-KIT.mjs` from the package root.
2. Confirm the reported candidate SHA-256 is
   `4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8`.
3. Confirm `STUDY_STATUS.json` says `READY_FOR_OBSERVED_SESSIONS_NOT_RUN` and
   participant count `0`.
4. Make a separate working copy. Do not write observations into the pristine
   handoff directory.
5. Recruit against `RECRUITMENT-SCREENING.md` and obtain the separate consent
   record described in `UX-CONSENT-v1.md`.

## During the study

- Use the package-local build and fixtures only.
- Follow `PROTOCOL.md` and `MODERATOR-SCRIPT.md` exactly.
- Retain separate full-session screen and audio recordings for P01–P05.
- Do not teach, remove failures, reuse media, or generate participant answers.

## Recording results

Replace the five participant templates with genuine de-identified records and
complete `study-input.template.json` as `study-input.json`. Keep identity data
outside this package. Run:

```bash
node tools/record-usability-study-v0.3.2.mjs \
  --manifest study-input.json \
  --output usability-evidence-record.json
```

The resulting record is still pending independent media/content audit. Even if
all automated threshold calculations read `PASS`, the recorder deliberately
reports `externalEvidenceComplete=false` and leaves all usability gates open.

Return every item listed in `RETURN-CHECKLIST.md`. Do not alter the frozen build,
fixture manifest, candidate freeze, or acceptance criteria.
