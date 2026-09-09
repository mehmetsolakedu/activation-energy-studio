# Real-Data Scientific Validation Objective

> Technical English companion to the immutable historical source
> [`../../REAL_DATA_VALIDATION_GOAL.md`](../../REAL_DATA_VALIDATION_GOAL.md).
> The source remains authoritative for the byte-bound v0.2 evidence record.

**Start date:** 2026-07-29  
**Platform boundary:** Parallels will not be used. Local validation will run on
native macOS; platform portability will be tested on GitHub-hosted macOS,
Ubuntu, and Windows 11 runners.

## Objective prompt

Scientifically validate Activation Energy Studio against real TGA/DTG datasets
with published results. For the Chilean Oak, NR–CELS, Dryad Polyisoprene, and
Coal–SPT–Paraffin datasets:

1. Lock the official source URL or DOI, dataset version, license, downloaded
   file name, byte size, and SHA-256 digest.
2. Record the raw-file semantics explicitly: temperature, time, heating rate,
   mass/TG, DTG, derivative sign, and derivative time unit.
3. For lanes that calculate conversion as `α=(m0-m)/(m0-mf)`, make `m0`, `mf`,
   the reaction stage, and temperature window visible. Do not silently perform
   sorting, smoothing, baseline correction, clipping, interpolation, or branch
   selection.
4. For eligible methods, produce alpha-specific Ea, regression inputs, slopes,
   `R²`, and summary values using both the production software and an
   independent reference calculator that does not import application code.
5. Compare these results with published values using predefined tolerances. Do
   not treat a publication table alone as truth or as an oracle.
6. For every discrepancy, recalculate at least one selected point from the raw
   measurement by hand or through a second independent calculation path. Audit
   Kelvin/Celsius conversion, `β` units, DTG sign, minutes/seconds, logarithm
   base, method coefficient, `α` definition, stage/baseline/smoothing,
   rounding, and possible transcription errors.
7. Classify the evidence using exactly one of these four dispositions:
   `SOFTWARE_ERROR`, `PREPROCESSING_OR_PROTOCOL_DIFFERENCE`,
   `PUBLICATION_OR_DATA_ISSUE`, or `UNRESOLVED_UNCERTAINTY`.
8. If a software error is found, correct the code, add a regression test, and
   rerun the complete validation chain against the same final build.
9. In the final decision, state explicitly which claims passed, which remain
   diagnostic only, and which external human/platform gates remain open.

## Acceptance criterion

At least one official raw dataset must demonstrate end-to-end agreement from
the source file through production ingestion, the scientific core, an
independent oracle, and a hand check. Complete agreement is not mandatory for
the other datasets, but the source of every difference must be reported with
an honest, reproducible, evidence-bound disposition. The possibility of an
error in a human-authored article or data file must always be tested as a real
hypothesis; no result may be fitted to the publication.

## Universality boundary

This validation may establish implementation accuracy for the tested methods,
formulas, versions, and data-reduction paths. By itself, it does not establish
universal scientific accuracy for every material, instrument, preprocessing
protocol, or computer.
