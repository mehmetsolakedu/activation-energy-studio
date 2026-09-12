# Activation Energy Studio v0.4.0 audit candidate

Status: **complete local candidate package; not externally released**. These
notes do not constitute a deployment, journal update, Zenodo deposit, or
publication approval. v0.4.0 is a major corrective candidate because the audit
changed scientific refusal rules, numerical calculations, parser behavior,
report provenance, and dependency closure. The historical v0.3.2 bytes and DOI
identity must not be relabeled as v0.4.0.

## Scientific and numerical corrections

- Replaced cancellation-prone ordinary least-squares arithmetic with centered,
  scale-conditioned regression and exact Student-t confidence limits.
- Added fail-closed conditioning checks for insufficient inverse-temperature
  spread and non-finite regression state.
- Enforced positive apparent activation energy. Nonpositive or non-finite
  estimates are refusals and do not leak an Ea, standard error, or interval.
- Treat confidence intervals that reach or cross zero as calculated but
  unreliable rather than reportable.
- Added nonuniform three-point derivatives for irregular temperature and time
  grids, with strict axis and time validation.
- Made Friedman require valid positive derivative evidence from every retained
  heating-rate run at each conversion level.
- Added an explicit Kissinger beta-Tp evidence contract. Curve-derived peaks
  must be strict interior maxima; imported peak tables remain a separate
  workflow.
- Bound the corrected implementation to scientific-core v3, report schema v7,
  an independent exact oracle, synthetic/mechanistic checks, metamorphic tests,
  and mutation tests.

The implemented integral-method constants remain FWO 1.052, Starink 1.0008
with exponent 1.92, and the standard KAS formulation. Reported activation
energies remain *apparent* values conditional on sample, atmosphere, stage,
preprocessing, method, and selected conversion range.

## Import, state, and export corrections

- Hardened CSV, TSV, TXT, and XLSX parsing with strict numeric grammar,
  worksheet ambiguity handling, formula-cell refusal, and bounded archive,
  worksheet, row, column, and cell resources.
- Added fail-closed rejection of VBA-bearing OOXML and external workbook/link
  relationships, even when the file is named `.xlsx`.
- Added fixed 64-file, 128 MiB aggregate, and four-worker batch ceilings.
  Byte-identical inputs raise a review warning but are not silently
  deduplicated because experimental identity requires context.
- Corrected valid XLSX ingestion when both optional `styles.xml` and
  `sharedStrings.xml` are absent by updating `read-excel-file` to 9.3.10.
- Reset stale analysis state after input or mapping changes and bound exports to
  the exact analyzed revision.
- Added report lineage and source identities to JSON, CSV, and PDF outputs.
- Neutralized spreadsheet-formula prefixes in CSV and improved long PDF value
  wrapping.

## Dependency, privacy, and licensing changes

- Declared `fflate` as a direct production dependency for bounded OOXML archive
  inspection.
- Updated and re-locked the dependency tree, including DOMPurify 3.4.15 and
  Vitest 4.1.11; the recorded full and production npm audit snapshots contain
  zero known advisories at audit time.
- Added a lockfile-derived CycloneDX production SBOM, complete production
  dependency notices, and bundled license texts. The `worker-f` license file is
  an explicitly labeled curated fallback matching its declared MIT license.
- Retained a static no-network/offline verifier. It is evidence about the
  reviewed bundle, not a promise about every future browser or operating system.

## Known interpretation boundaries

- The inverse-temperature spread floor is a numerical-conditioning guard, not
  an instrument-specific metrological acceptance threshold.
- Regression intervals do not cover every experimental or model-form source of
  uncertainty, including thermal lag.
- Generic DTG is not automatically direct `d(alpha)/dt`; sign, units, mass
  reference, and transformation must be confirmed.
- Paper063 beta-Tp values are article-derived at printed 1 K resolution; no
  separate raw-dataset license was identified.

## Dependency security snapshot

The audit initially identified the moderate-severity DOMPurify advisory
[GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7)
in the transitive production dependency closure. The candidate now pins
DOMPurify 3.4.15 through an npm override. A fresh
`npm audit --omit=dev --json` check against the resulting lockfile reported
zero production advisories. The pre-fix response, remediation record, and
post-fix response remain in the audit evidence package. This is a time-bounded
registry result, not a timeless claim that the software is vulnerability-free.

External release remains blocked until all of the following are true:

1. the independent oracle, synthetic ODE, controlled-noise, real-data,
   metamorphic, adversarial, mutation, browser, offline, export, and manuscript
   consistency gates are complete;
2. no P0 or P1 finding remains open and no critical test is skipped;
3. the candidate single-file HTML is reproduced from the frozen reviewed
   source and the manifest/checksums cover every packaged file;
4. manuscript numbers, figures, method descriptions, and software-version
   references are regenerated against that same frozen candidate;
5. Mehmet Solak explicitly approves each external publication, deployment,
   journal re-upload, or Zenodo action.

The historical v0.3.2 artifact remains immutable and separately identifiable.
