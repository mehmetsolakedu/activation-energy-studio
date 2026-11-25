import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REVIEW_PACKAGE_SCHEMA =
  'activation-energy-studio/independent-scientific-review-package/v1';
export const REVIEW_STATE = 'UNSIGNED_AWAITING_INDEPENDENT_REVIEW';
export const REVIEW_RELEASE_VERSION = '0.2.0';
export const DEFAULT_OUTPUT_RELATIVE_PATH =
  'output/independent-scientific-review-v0.2.0';
export const PACKAGE_MANIFEST_NAME = 'PACKAGE_MANIFEST.json';
export const PACKAGE_MANIFEST_SIDECAR_NAME = 'PACKAGE_MANIFEST.sha256';
export const VERDICT_TEMPLATE_NAME = 'INDEPENDENT_REVIEW_VERDICT_TEMPLATE.md';
export const STRUCTURED_INPUT_TEMPLATE_NAME =
  'SCIENTIFIC_REVIEW_INPUT_TEMPLATE.json';
export const PACKAGE_README_NAME = 'README.md';

const SCRIPT_RELATIVE_PATH = 'scripts/generate-scientific-review-package.mjs';
const RELEASE_MANIFEST_PATH = 'release/MANIFEST.v0.2.0.json';
const RELEASE_CHECKSUM_PATH = 'release/SHA256SUMS.txt';
const RELEASE_ARTIFACT_PATH = 'release/Activation-Energy-Studio-v0.2.0.html';
const REVIEW_PROTOCOL_PATH = 'SCIENTIFIC_REVIEW_SIGNOFF_PROTOCOL.md';
const REVIEW_RUNBOOK_PATH = 'SCIENTIFIC_REVIEW_RUNBOOK.md';
const REVIEW_RECORD_SCRIPT_PATH = 'scripts/record-scientific-review.mjs';
const REVIEW_RECORD_TEST_PATH =
  'tests/scientific-review-evidence-record.test.mjs';
const REAL_FIXTURE_ROOT = 'tests/fixtures/real';
const REAL_FIXTURE_MANIFEST_PATH = `${REAL_FIXTURE_ROOT}/manifest.json`;
const COMPLETE_FIXTURE_MANIFEST_PATH =
  'evidence/validation/FIXTURE_MANIFEST.v0.2.0.json';
const USABILITY_FIXTURE_ROOT = 'evidence/usability/v0.2.0';
const USABILITY_FIXTURE_MANIFEST_PATH =
  `${USABILITY_FIXTURE_ROOT}/UX_FIXTURE_MANIFEST.json`;
const REVIEW_CASE_FILES = Object.freeze([
  'UX01_four_run_mass_ambiguous.csv',
  'R1_two_rates.csv',
  'R2_no_common_alpha.csv',
  'R3_nonmonotonic_alpha.csv',
  'R4_context_conflict.csv',
  'R5_nonlinear_time.csv',
  'C1_peaks.tsv',
  'W1_three_rates.csv',
  'W2_synthetic_kas_150.csv',
  'W3_low_r2.csv',
  'W4_multistep.csv',
]);

const SOURCE_LOCK = Object.freeze({
  RELEASE_MANIFEST: 'release_manifest',
  REAL_FIXTURE_MANIFEST: 'real_fixture_manifest',
  PACKAGE_MANIFEST: 'review_package_manifest',
});

export const SCI_CHECKLIST_ITEMS = Object.freeze([
  'Results are labelled apparent/görünür activation energy.',
  'Sample, process or reaction stage, atmosphere, method, and conversion/peak context remain visible or machine-readable.',
  'FWO/KAS/Starink/Friedman values are not presented as a single immutable material constant.',
  'Kissinger is explicitly a separate peak result, not an `Ea(alpha)` point.',
  'No result is described as proving a one-step mechanism.',
  'Regression confidence intervals are not described as total experimental uncertainty; within-heating-rate replicate variability, calibration, anchor, baseline, and derivative-method uncertainty exclusions remain explicit.',
  'Refused or partial analyses cannot be visually mistaken for a successful complete analysis.',
]);

export const VAL_CHECKLIST_ITEMS = Object.freeze([
  'FWO, KAS, Starink, and conditional Friedman are shown as method-specific estimates on the same alpha basis.',
  'Numeric agreement is not called truth, proof, accuracy, or validation of a universal constant.',
  'Divergence across methods or alpha is retained and visible; no averaging hides it.',
  'Low-R2, supplied- versus numerical-derivative provenance, limited-rate, and multistep diagnostics remain attached to the affected result.',
  'Kissinger remains a single separate peak estimate and is not pooled with isoconversional curves.',
  "The failure to reproduce the publication's Table 4 averages from the accessible Paper 010 raw curves remains explicit, including the equation-correct Friedman versus S4 lnda/dt label/value inconsistency; the nonstandard publication path is not silently accepted as valid Friedman preprocessing.",
  'The reviewer states whether the observed synthetic and real-data patterns support only the bounded claim: correct implementation and transparent method comparison for the tested fixtures.',
]);

export const REVIEW_SURFACES = Object.freeze(['UI', 'PDF', 'CSV', 'JSON']);

export const REVIEW_ARTIFACTS = Object.freeze([
  {
    role: 'release_html',
    sourcePath: RELEASE_ARTIFACT_PATH,
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Executable one-file application used for the UI and export review.',
  },
  {
    role: 'release_checksum_index',
    sourcePath: RELEASE_CHECKSUM_PATH,
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Published release-artifact checksum ledger.',
  },
  {
    role: 'release_evidence_manifest',
    sourcePath: RELEASE_MANIFEST_PATH,
    sourceLock: SOURCE_LOCK.PACKAGE_MANIFEST,
    purpose: 'Source release evidence manifest whose exact hash must be cited by the reviewer.',
  },
  {
    role: 'mission_lock',
    sourcePath: '00_MISSION_LOCK.md',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Product and scientific claim boundary.',
  },
  {
    role: 'scientific_specification',
    sourcePath: '01_SCIENTIFIC_SPEC_V1.md',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Implemented equations, inputs, outputs, and method conditions.',
  },
  {
    role: 'acceptance_criteria',
    sourcePath: '02_ACCEPTANCE_CRITERIA.md',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Normative AC-SCI-03 and AC-VAL-05 gate definitions.',
  },
  {
    role: 'scientific_review_protocol',
    sourcePath: REVIEW_PROTOCOL_PATH,
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Independent reviewer eligibility, checklist, and verdict rules.',
  },
  {
    role: 'scientific_review_runbook',
    sourcePath: REVIEW_RUNBOOK_PATH,
    sourceLock: SOURCE_LOCK.PACKAGE_MANIFEST,
    purpose: 'Locked case-to-decision execution and retained-evidence runbook.',
  },
  {
    role: 'scientific_review_record_generator',
    sourcePath: REVIEW_RECORD_SCRIPT_PATH,
    sourceLock: SOURCE_LOCK.PACKAGE_MANIFEST,
    purpose: 'Fail-closed structured signed-review evidence recorder.',
  },
  {
    role: 'scientific_review_record_verification',
    sourcePath: REVIEW_RECORD_TEST_PATH,
    sourceLock: SOURCE_LOCK.PACKAGE_MANIFEST,
    purpose: 'Decision-set, hash, eligibility, path, time, signature, and disposition rejection tests.',
  },
  {
    role: 'scientific_review_package_generator',
    sourcePath: SCRIPT_RELATIVE_PATH,
    sourceLock: SOURCE_LOCK.PACKAGE_MANIFEST,
    purpose: 'Deterministic package generator and fail-closed integrity checker.',
  },
  {
    role: 'scientific_review_package_verification',
    sourcePath: 'tests/scientific-review-package.test.mjs',
    sourceLock: SOURCE_LOCK.PACKAGE_MANIFEST,
    purpose: 'Determinism, unsigned-state, source-lock, and tamper-rejection tests.',
  },
  {
    role: 'scientific_traceability_report',
    sourcePath: 'SCIENTIFIC_TRACEABILITY_REPORT.md',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Paper-to-method evidence-chain audit.',
  },
  {
    role: 'corpus_integrity_ledger',
    sourcePath: 'evidence/corpus/CORPUS_INTEGRITY_LEDGER.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: '231 PDF-file accounting, source hashes, supplementary boundary, matrix-ID correction ledger, and unverified-Q1/Q2 boundary.',
  },
  {
    role: 'corpus_integrity_ledger_generator',
    sourcePath: 'scripts/generate-corpus-integrity-ledger.mjs',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Deterministic fail-closed corpus accounting and source-lock generator.',
  },
  {
    role: 'corpus_integrity_ledger_verification',
    sourcePath: 'tests/corpus-integrity-ledger.test.mjs',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Corpus unit-boundary, 001-231 coverage, blank-ID correction, and Q1/Q2 refusal tests.',
  },
  {
    role: 'numerical_validation_report',
    sourcePath: 'NUMERICAL_VALIDATION_REPORT.md',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Independent hand-calculation and numerical validation record.',
  },
  {
    role: 'pdf_visual_qa_report',
    sourcePath: 'PDF_REPORT_VISUAL_QA.md',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Visual inspection record for the deterministic QA PDF.',
  },
  {
    role: 'real_data_validation_status',
    sourcePath: 'REAL_DATA_VALIDATION_STATUS.md',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Real-data validation and retained publication-reproduction negative result.',
  },
  {
    role: 'real_data_validation_goal',
    sourcePath: 'REAL_DATA_VALIDATION_GOAL.md',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Bounded five-lane official-real-data validation objective and acceptance criteria.',
  },
  {
    role: 'real_data_validation_final_report',
    sourcePath: 'evidence/validation/REAL_DATA_VALIDATION_FINAL_REPORT.md',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Final five-lane decision matrix, quantitative summary, adjudications, and open external gates.',
  },
  {
    role: 'second_raw_dataset_acquisition_audit',
    sourcePath: 'SECOND_RAW_DATASET_SEARCH.md',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Negative acquisition audit and explicit P1 boundary for a second machine-readable multi-rate raw-curve dataset.',
  },
  {
    role: 'severity_tagged_known_issues_ledger',
    sourcePath: 'governance/KNOWN_ISSUES.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Severity-tagged open issues, external review blocker, and validated-MVP eligibility boundary.',
  },
  {
    role: 'review_input_fixture',
    sourcePath: 'examples/synthetic_kas_150.csv',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Deterministic input used to exercise UI, PDF, CSV, and JSON surfaces.',
  },
  {
    role: 'review_case_manifest',
    sourcePath: USABILITY_FIXTURE_MANIFEST_PATH,
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Hash-locked R1-R5, W1-W4, C1, and UX01 review case inventory.',
  },
  {
    role: 'complete_fixture_manifest',
    sourcePath: COMPLETE_FIXTURE_MANIFEST_PATH,
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Recursive SHA-256 lock for every retained tests/fixtures input and expected output.',
  },
  ...REVIEW_CASE_FILES.map((fileName) => ({
    role: `review_case_${path.posix.parse(fileName).name.toLowerCase()}`,
    sourcePath: `${USABILITY_FIXTURE_ROOT}/study_bundle/${fileName}`,
    sourceLock: SOURCE_LOCK.PACKAGE_MANIFEST,
    purpose: `Reviewer-loadable warning/refusal/comprehension case ${fileName}.`,
  })),
  {
    role: 'schema_v4_pdf_qa_artifact',
    sourcePath: 'output/pdf/activation-energy-report-schema-v4-qa.pdf',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Deterministic PDF surface for claim-boundary inspection.',
  },
  {
    role: 'project_report_json_schema',
    sourcePath: 'src/report/project-report.schema.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Machine-readable JSON report contract.',
  },
  {
    role: 'report_contract_verification',
    sourcePath: 'tests/report-contract.test.ts',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'JSON, CSV, audit, and schema contract verification.',
  },
  {
    role: 'pdf_report_verification',
    sourcePath: 'tests/report.test.ts',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'PDF pagination, scientific content, warning, and traceability checks.',
  },
  {
    role: 'warning_visibility_contract_verification',
    sourcePath: 'tests/warning-visibility-contract.test.tsx',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Result-panel and PDF warning-code visibility checks.',
  },
  {
    role: 'regression_ci_boundary_contract_verification',
    sourcePath: 'tests/regression-ci-boundary-contract.test.tsx',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Regression-only confidence-interval boundary checks.',
  },
  {
    role: 'global_refusal_contract_verification',
    sourcePath: 'tests/global-refusal-contract.test.ts',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Fail-closed global refusal and no-partial-result contract checks.',
  },
  {
    role: 'provided_derivative_failclosed_verification',
    sourcePath: 'tests/provided-derivative-failclosed.test.ts',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Partial or non-finite supplied derivative refusal and no-silent-fallback checks.',
  },
  {
    role: 'replicate_regression_contract_verification',
    sourcePath: 'tests/replicate-regression-contract.test.ts',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Equal-weight heating-rate grouping, raw-n, n-beta, degrees-of-freedom, and provenance checks.',
  },
  {
    role: 'schema_v4_report_fixture',
    sourcePath: 'tests/helpers/report-fixture.ts',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Fixed report fixture used to generate the QA artifact.',
  },
  {
    role: 'pdf_qa_generator',
    sourcePath: 'scripts/generate-report-qa.mjs',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Deterministic QA PDF generator.',
  },
  {
    role: 'pdf_qa_artifact_verification',
    sourcePath: 'tests/report-qa-artifact.test.ts',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'QA PDF byte, metadata, pagination, and content checks.',
  },
  {
    role: 'independent_hand_worksheet_fixture',
    sourcePath: 'tests/fixtures/hand/activation_energy_hand_worksheet.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Application-independent Decimal worksheet values.',
  },
  {
    role: 'independent_hand_worksheet_verification',
    sourcePath: 'tests/hand-worksheet-validation.test.ts',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Application-versus-independent-worksheet acceptance checks.',
  },
  {
    role: 'synthetic_layer2_fixture',
    sourcePath: 'tests/fixtures/synthetic/layer2_validation.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Synthetic known-Ea and noise/stage test definitions.',
  },
  {
    role: 'synthetic_layer2_verification',
    sourcePath: 'tests/synthetic-layer2-validation.test.ts',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Layer-2 known-Ea, noise, and multistage checks.',
  },
  {
    role: 'real_fixture_manifest',
    sourcePath: REAL_FIXTURE_MANIFEST_PATH,
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Nested immutable real-data source/derivation/reference lock.',
  },
  {
    role: 'complete_fixture_manifest_generator',
    sourcePath: 'scripts/generate-fixture-manifest.mjs',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Deterministic recursive fixture inventory and fail-closed checker.',
  },
  {
    role: 'complete_fixture_manifest_verification',
    sourcePath: 'tests/fixture-manifest.test.mjs',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Changed, missing, added, symlink, and deterministic fixture-lock tests.',
  },
  {
    role: 'real_fixture_provenance',
    sourcePath: `${REAL_FIXTURE_ROOT}/README.md`,
    sourceLock: SOURCE_LOCK.PACKAGE_MANIFEST,
    purpose: 'Paper 010 DOI, licence, worksheet/range, reduction rule, hashes, and bounded claim.',
  },
  {
    role: 'real_fixture_derivation',
    sourcePath: 'scripts/derive_paper010_fixture.mjs',
    sourceLock: SOURCE_LOCK.PACKAGE_MANIFEST,
    purpose: 'Hash-refusing deterministic Paper 010 raw-XLSX to T-alpha-dAlpha/dt-beta derivation.',
  },
  {
    role: 'independent_real_oracle_launcher',
    sourcePath: 'scripts/run-paper010-oracle.mjs',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Parallels-free Python runtime discovery and isolated stdlib oracle launcher.',
  },
  {
    role: 'independent_real_oracle_implementation',
    sourcePath: `${REAL_FIXTURE_ROOT}/oracle/paper010_decimal_oracle.py`,
    sourceLock: SOURCE_LOCK.REAL_FIXTURE_MANIFEST,
    purpose: 'Independent stdlib-only Decimal(50) XLSX extraction and KAS/FWO/Starink/equation-correct Friedman reference implementation.',
  },
  {
    role: 'independent_real_oracle_reproducibility_verification',
    sourcePath: 'tests/paper010-oracle-reproducibility.test.mjs',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Determinism, exact canonical-v2 verification, runtime discovery, and tamper-refusal tests.',
  },
  {
    role: 'immutable_real_raw_source',
    sourcePath: `${REAL_FIXTURE_ROOT}/source/paper010/pone.0173946.s002.xlsx`,
    sourceLock: SOURCE_LOCK.REAL_FIXTURE_MANIFEST,
    purpose: 'Official Paper 010 raw supplementary workbook used for the RH validation path.',
  },
  {
    role: 'official_publication_transform_source',
    sourcePath: `${REAL_FIXTURE_ROOT}/source/paper010/pone.0173946.s004.xlsx`,
    sourceLock: SOURCE_LOCK.REAL_FIXTURE_MANIFEST,
    purpose: 'Official Paper 010 S4 transformed-coordinate workbook used only for the negative Friedman label/value diagnostic.',
  },
  {
    role: 'official_publication_result_source',
    sourcePath: `${REAL_FIXTURE_ROOT}/source/paper010/pone.0173946.s005.xlsx`,
    sourceLock: SOURCE_LOCK.REAL_FIXTURE_MANIFEST,
    purpose: 'Official Paper 010 S5 result workbook used as the publication-comparison reference, not as oracle input truth.',
  },
  {
    role: 'deterministic_real_derived_fixture',
    sourcePath: `${REAL_FIXTURE_ROOT}/paper010_rh_t_alpha_beta.csv`,
    sourceLock: SOURCE_LOCK.REAL_FIXTURE_MANIFEST,
    purpose: 'Deterministically derived T-alpha-dAlpha/dt-beta fixture.',
  },
  {
    role: 'independent_real_expected_output',
    sourcePath: `${REAL_FIXTURE_ROOT}/paper010_rh_reference.json`,
    sourceLock: SOURCE_LOCK.REAL_FIXTURE_MANIFEST,
    purpose: 'Independent four-method real-data reference with supplied-DTG provenance and explicit publication-method negative finding.',
  },
  {
    role: 'real_data_validation_verification',
    sourcePath: 'tests/real-data-validation.test.ts',
    sourceLock: SOURCE_LOCK.PACKAGE_MANIFEST,
    purpose: 'Immutable-source, derivation, expected-output, and negative-result checks.',
  },
  {
    role: 'nr_cels_official_tg_dtg_dta_archive',
    sourcePath: 'tests/fixtures/real/nr-cels/source/TG_DTG_DTA_data.zip',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Pinned official Zenodo v1 NR-CELS TG/dTG/DTA source archive.',
  },
  {
    role: 'nr_cels_official_kinetic_archive',
    sourcePath: 'tests/fixtures/real/nr-cels/source/Kinetic_data.zip',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Pinned official Zenodo v1 NR-CELS Kinetics Neo export archive.',
  },
  {
    role: 'nr_cels_validation_manifest',
    sourcePath: 'tests/fixtures/real/nr-cels/manifest/nr-cels-validation-manifest.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Source, header-semantics, oracle, manual-adjudication, and production-comparison lock.',
  },
  {
    role: 'nr_cels_independent_decimal_oracle',
    sourcePath: 'tests/fixtures/real/nr-cels/oracle/nr_cels_friedman_oracle.py',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Independent stdlib Decimal Friedman reconstruction oracle.',
  },
  {
    role: 'nr_cels_independent_expected_output',
    sourcePath: 'tests/fixtures/real/nr-cels/oracle/expected-output.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Locked 91-alpha deposited-dTG and seven-point reconstruction results.',
  },
  {
    role: 'nr_cels_manual_adjudication',
    sourcePath: 'tests/fixtures/real/nr-cels/manual/nr-cels-adjudication.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Concept-DOI trap, source semantics, publication discrepancies, and production-boundary adjudication.',
  },
  {
    role: 'nr_cels_validation_report',
    sourcePath: 'evidence/validation/nr-cels/NR_CELS_VALIDATION.md',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Bounded NR-CELS protocol, quantitative comparison, and reproduction commands.',
  },
  {
    role: 'nr_cels_independent_oracle_launcher',
    sourcePath: 'scripts/run-nr-cels-friedman-oracle.mjs',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Portable isolated launcher for the NR-CELS Decimal oracle.',
  },
  {
    role: 'nr_cels_oracle_reproducibility_verification',
    sourcePath: 'tests/nr-cels-oracle-reproducibility.test.mjs',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Byte reproducibility, independence, all-alpha, and adjudication checks.',
  },
  {
    role: 'nr_cels_wide_production_oracle_verification',
    sourcePath: 'tests/nr-cels-wide-production-oracle.test.ts',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'All-273-Ea and regression comparison through the public wide-series production path.',
  },
  {
    role: 'dryad_polyisoprene_official_archive',
    sourcePath: 'tests/fixtures/real/dryad-polyisoprene/source/Data.zip',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Official Dryad v2 archive containing the retained LPI-01 Weight and DTG traces.',
  },
  {
    role: 'dryad_polyisoprene_validation_manifest',
    sourcePath: 'tests/fixtures/real/dryad-polyisoprene/manifest.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Dryad source, recipe, oracle, publication-adjudication, and evidence lock.',
  },
  {
    role: 'dryad_polyisoprene_independent_decimal_oracle',
    sourcePath: 'tests/fixtures/real/dryad-polyisoprene/oracle/dryad_polyisoprene_decimal_oracle.py',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Independent stdlib Decimal FWO/KAS/Friedman reference implementation.',
  },
  {
    role: 'dryad_polyisoprene_independent_expected_output',
    sourcePath: 'tests/fixtures/real/dryad-polyisoprene/expected-output.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Locked seven-alpha Dryad LPI-01 reference results.',
  },
  {
    role: 'dryad_polyisoprene_manual_adjudication',
    sourcePath: 'tests/fixtures/real/dryad-polyisoprene/manual/hbpi-table3-swap-adjudication.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Manual HBPI-01/HBPI-03 Table 3 cross-sample adjudication.',
  },
  {
    role: 'dryad_polyisoprene_validation_report',
    sourcePath: 'evidence/validation/dryad-polyisoprene/DRYAD_POLYISOPRENE_VALIDATION.md',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Dryad validation protocol, results, limitations, and publication quarantine.',
  },
  {
    role: 'dryad_polyisoprene_independent_oracle_launcher',
    sourcePath: 'scripts/run-dryad-polyisoprene-oracle.mjs',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Portable isolated launcher for the Dryad Decimal oracle.',
  },
  {
    role: 'dryad_polyisoprene_oracle_reproducibility_verification',
    sourcePath: 'tests/dryad-polyisoprene-oracle-reproducibility.test.mjs',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Dryad oracle, manifest, and manual-adjudication reproducibility checks.',
  },
  {
    role: 'dryad_polyisoprene_production_core_verification',
    sourcePath: 'tests/dryad-polyisoprene-production-core.test.ts',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Production-core comparison for all 21 Dryad alpha-method records.',
  },
  {
    role: 'coal_spt_paraffin_official_archive',
    sourcePath: 'tests/fixtures/real/coal-spt-paraffin/source/TGA raw data of coal, SPT and paraffin at different masses.xlsx',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Official complete Mendeley v1 Coal-SPT-paraffin workbook.',
  },
  {
    role: 'coal_spt_paraffin_validation_manifest',
    sourcePath: 'tests/fixtures/real/coal-spt-paraffin/manifest.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Coal source, projection, oracle, tolerance, and version-adjudication lock.',
  },
  {
    role: 'coal_spt_paraffin_independent_decimal_oracle',
    sourcePath: 'tests/fixtures/real/coal-spt-paraffin/oracle/coal_spt_paraffin_decimal_oracle.py',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Independent stdlib Decimal workbook extraction and grouped-regression oracle.',
  },
  {
    role: 'coal_spt_paraffin_independent_expected_output',
    sourcePath: 'tests/fixtures/real/coal-spt-paraffin/expected-output.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Locked physical observations, group reductions, regressions, GA, and Ea results.',
  },
  {
    role: 'coal_spt_paraffin_manual_adjudication',
    sourcePath: 'evidence/validation/coal-spt-paraffin/MANUAL_ADJUDICATION.md',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Manual v1/v2 workbook-topology and publication-copy adjudication.',
  },
  {
    role: 'coal_spt_paraffin_validation_report',
    sourcePath: 'evidence/validation/coal-spt-paraffin/VALIDATION_REPORT.md',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Bounded paraffin validation result and publication-comparison report.',
  },
  {
    role: 'coal_spt_paraffin_independent_oracle_launcher',
    sourcePath: 'scripts/run-coal-spt-paraffin-oracle.mjs',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Portable isolated launcher for the Coal-SPT-paraffin Decimal oracle.',
  },
  {
    role: 'coal_spt_paraffin_oracle_reproducibility_verification',
    sourcePath: 'tests/coal-spt-paraffin-oracle-reproducibility.test.mjs',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Oracle byte reproducibility, source lock, and v1/v2 adjudication checks.',
  },
  {
    role: 'coal_spt_paraffin_production_validation_verification',
    sourcePath: 'tests/coal-spt-paraffin-validation.test.ts',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Production-core comparison of physical groups, regressions, GA, confidence bounds, and Ea.',
  },
  {
    role: 'paper010_locked_release_raw_to_report_protocol',
    sourcePath: 'evidence/validation/PAPER010_RAW_TO_REPORT_PROTOCOL.md',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Bounded direct-macOS real-Chrome protocol for the locked release and Paper 010 data.',
  },
  {
    role: 'paper010_locked_release_raw_to_report_runner',
    sourcePath: 'scripts/run-paper010-raw-to-report.mjs',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Fail-closed two-pass browser runner and read-only retained-bundle verifier.',
  },
  {
    role: 'paper010_locked_release_raw_to_report_verification',
    sourcePath: 'tests/paper010-raw-to-report.test.mjs',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Oracle, report, CSV, HAR, Kissinger refusal, tamper, missing-file and extra-file verification.',
  },
  {
    role: 'paper010_raw_to_report_evidence_manifest',
    sourcePath: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/PAPER010_RAW_TO_REPORT_MANIFEST.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Hash-bound two-pass local technical evidence with explicit not-independent-review status.',
  },
  {
    role: 'paper010_kissinger_stage_ambiguity_negative_evidence',
    sourcePath: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/paper010-kissinger-negative-evidence.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Retained refusal to construct a same-stage Kissinger series from stage-switching global maxima.',
  },
  {
    role: 'paper010_pass1_reproducible_json',
    sourcePath: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-1/paper010-raw-to-report.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'First real-Chrome full-precision report used for Decimal-oracle comparison.',
  },
  {
    role: 'paper010_pass1_results_csv',
    sourcePath: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-1/paper010-raw-to-report-results.csv',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'First real-Chrome strict CSV projection of the 64 JSON result rows.',
  },
  {
    role: 'paper010_pass1_report_pdf',
    sourcePath: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-1/paper010-raw-to-report-report.pdf',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'First real-Chrome five-page report retained for visual and cross-export review.',
  },
  {
    role: 'paper010_pass1_final_ui_screenshot',
    sourcePath: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-1/paper010-final-state.png',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'First real-Chrome full-page UI state showing the explicit 16-point grid and 64 results.',
  },
  {
    role: 'paper010_pass1_raw_network_capture',
    sourcePath: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-1/paper010-network-capture.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'First real-Chrome request ledger retained before offline-HAR adjudication.',
  },
  {
    role: 'paper010_pass1_offline_har',
    sourcePath: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-1/paper010-offline.har',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'First real-Chrome file-only HAR with zero external requests.',
  },
  {
    role: 'paper010_pass2_reproducible_json',
    sourcePath: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-2/paper010-raw-to-report.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Second real-Chrome report used for canonical scientific determinism.',
  },
  {
    role: 'paper010_pass2_results_csv',
    sourcePath: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-2/paper010-raw-to-report-results.csv',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Second real-Chrome CSV used for exact byte determinism.',
  },
  {
    role: 'paper010_pass2_report_pdf',
    sourcePath: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-2/paper010-raw-to-report-report.pdf',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Second real-Chrome five-page report retained and individually hash-locked.',
  },
  {
    role: 'paper010_pass2_final_ui_screenshot',
    sourcePath: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-2/paper010-final-state.png',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Second real-Chrome full-page UI state retained and individually hash-locked.',
  },
  {
    role: 'paper010_pass2_raw_network_capture',
    sourcePath: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-2/paper010-network-capture.json',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Second real-Chrome request ledger retained before offline-HAR adjudication.',
  },
  {
    role: 'paper010_pass2_offline_har',
    sourcePath: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-2/paper010-offline.har',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Second real-Chrome file-only HAR with zero external requests.',
  },
  {
    role: 'publication_peak_fixture',
    sourcePath: `${REAL_FIXTURE_ROOT}/paper063/paper063_kissinger_peaks.csv`,
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Paper 063 publication-derived beta–Tp pairs, explicitly not raw instrument curves.',
  },
  {
    role: 'publication_peak_fixture_provenance',
    sourcePath: `${REAL_FIXTURE_ROOT}/paper063/provenance.json`,
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'DOI, corpus-PDF hash, article licence, transcription rule, and non-raw claim boundary.',
  },
  {
    role: 'publication_peak_kissinger_reference',
    sourcePath: `${REAL_FIXTURE_ROOT}/paper063/expected-output.json`,
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Independent retained standalone Kissinger regression reference for the printed peaks.',
  },
  {
    role: 'publication_peak_kissinger_verification',
    sourcePath: 'tests/paper063-kissinger-validation.test.ts',
    sourceLock: SOURCE_LOCK.RELEASE_MANIFEST,
    purpose: 'Production Kissinger comparison and fail-closed publication-derived-data boundary checks.',
  },
]);

const MODULE_PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function reviewError(code, message) {
  return new Error(`${code} ${message}`);
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

function portablePath(relativePath) {
  if (
    typeof relativePath !== 'string'
    || relativePath.length === 0
    || path.posix.isAbsolute(relativePath)
    || relativePath.split('/').includes('..')
  ) {
    throw reviewError('REVIEW_PACKAGE_UNSAFE_PATH', String(relativePath));
  }
  return relativePath;
}

function resolveInside(root, relativePath) {
  const portable = portablePath(relativePath);
  const resolved = path.resolve(root, ...portable.split('/'));
  const relative = path.relative(path.resolve(root), resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw reviewError('REVIEW_PACKAGE_PATH_ESCAPE', portable);
  }
  return resolved;
}

function readRequiredFile(projectRoot, sourcePath) {
  const filePath = resolveInside(projectRoot, sourcePath);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw reviewError('REVIEW_PACKAGE_SOURCE_MISSING', sourcePath);
  }
  return { filePath, bytes: readFileSync(filePath) };
}

function parseJsonFile(projectRoot, sourcePath) {
  const { bytes } = readRequiredFile(projectRoot, sourcePath);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw reviewError(
      'REVIEW_PACKAGE_SOURCE_JSON_INVALID',
      `${sourcePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function validateProtocol(projectRoot) {
  const { bytes } = readRequiredFile(projectRoot, REVIEW_PROTOCOL_PATH);
  const protocol = bytes.toString('utf8');
  const requiredBoundaryText = [
    '**Status:** Prepared, not yet executed by an independent reviewer.',
    '**Boundary:** This document is a review instrument; its existence is not a scientific sign-off.',
    'An AI agent or the software itself cannot issue the independent sign-off.',
    'The software can require and preserve these declarations; it cannot authenticate the identity or determine whether a declaration is truthful.',
    '`STRUCTURALLY_VALIDATED_AWAITING_HUMAN_IDENTITY_AND_SIGNATURE_AUTHENTICITY_AUDIT`',
    'Only an all-item independent PASS within a gate, followed by human identity and',
  ];
  for (const statement of [
    ...requiredBoundaryText,
    ...SCI_CHECKLIST_ITEMS,
    ...VAL_CHECKLIST_ITEMS,
  ]) {
    if (!protocol.includes(statement)) {
      throw reviewError(
        'REVIEW_PACKAGE_PROTOCOL_DRIFT',
        `Missing protocol statement: ${statement}`,
      );
    }
  }
}

function validateReleaseChecksumIndex(projectRoot, releaseManifest, releaseHash) {
  const checksum = readRequiredFile(projectRoot, RELEASE_CHECKSUM_PATH).bytes.toString('utf8');
  const expectedLine = `${releaseHash}  ${path.posix.basename(RELEASE_ARTIFACT_PATH)}`;
  if (!checksum.split(/\r?\n/u).includes(expectedLine)) {
    throw reviewError(
      'REVIEW_PACKAGE_RELEASE_CHECKSUM_MISMATCH',
      `Expected exact line in ${RELEASE_CHECKSUM_PATH}: ${expectedLine}`,
    );
  }
  if (
    releaseManifest.release?.artifact !== RELEASE_ARTIFACT_PATH
    || releaseManifest.release?.sha256 !== releaseHash
  ) {
    throw reviewError(
      'REVIEW_PACKAGE_RELEASE_METADATA_MISMATCH',
      `${RELEASE_MANIFEST_PATH} does not identify the locked release artifact/hash.`,
    );
  }
}

function validateRealFixtureManifest(projectRoot, realFixtureManifest) {
  if (!Array.isArray(realFixtureManifest.files)) {
    throw reviewError(
      'REVIEW_PACKAGE_REAL_MANIFEST_INVALID',
      `${REAL_FIXTURE_MANIFEST_PATH} has no files array.`,
    );
  }
  const entries = new Map(realFixtureManifest.files.map((entry) => [entry.path, entry]));
  const nested = REVIEW_ARTIFACTS.filter(
    ({ sourceLock }) => sourceLock === SOURCE_LOCK.REAL_FIXTURE_MANIFEST,
  );
  for (const descriptor of nested) {
    const nestedPath = descriptor.sourcePath.slice(`${REAL_FIXTURE_ROOT}/`.length);
    const entry = entries.get(nestedPath);
    if (!entry) {
      throw reviewError(
        'REVIEW_PACKAGE_REAL_MANIFEST_ENTRY_MISSING',
        `${descriptor.sourcePath} (${descriptor.role})`,
      );
    }
    const { filePath } = readRequiredFile(projectRoot, descriptor.sourcePath);
    const actual = sha256File(filePath);
    if (entry.sha256 !== actual) {
      throw reviewError(
        'REVIEW_PACKAGE_REAL_MANIFEST_HASH_MISMATCH',
        `${descriptor.sourcePath}: expected ${entry.sha256}, actual ${actual}`,
      );
    }
  }
}

function validateSourceLocks(projectRoot) {
  validateProtocol(projectRoot);
  const releaseManifest = parseJsonFile(projectRoot, RELEASE_MANIFEST_PATH);
  const realFixtureManifest = parseJsonFile(projectRoot, REAL_FIXTURE_MANIFEST_PATH);

  if (releaseManifest.release?.version !== REVIEW_RELEASE_VERSION) {
    throw reviewError(
      'REVIEW_PACKAGE_RELEASE_VERSION_MISMATCH',
      `Expected ${REVIEW_RELEASE_VERSION}, found ${releaseManifest.release?.version ?? 'missing'}.`,
    );
  }
  if (releaseManifest.status?.fullyP0ValidatedScientificRelease !== false) {
    throw reviewError(
      'REVIEW_PACKAGE_RELEASE_BOUNDARY_MISMATCH',
      'Unsigned review packaging requires fullyP0ValidatedScientificRelease=false.',
    );
  }
  const reviewBoundary = releaseManifest.claimBoundaries?.find(
    ({ id }) => id === 'scientific_review_scope',
  );
  if (
    !reviewBoundary
    || !/no qualified external reviewer has signed it/i.test(reviewBoundary.statement ?? '')
    || !/AC-SCI-03 and AC-VAL-05 remain PARTIAL/i.test(reviewBoundary.statement ?? '')
  ) {
    throw reviewError(
      'REVIEW_PACKAGE_UNSIGNED_BOUNDARY_MISSING',
      `${RELEASE_MANIFEST_PATH} must retain the unsigned AC-SCI-03/AC-VAL-05 boundary.`,
    );
  }

  const evidence = new Map(
    (releaseManifest.evidence ?? []).map((entry) => [entry.path, entry]),
  );
  for (const descriptor of REVIEW_ARTIFACTS) {
    if (descriptor.sourceLock !== SOURCE_LOCK.RELEASE_MANIFEST) continue;
    const entry = evidence.get(descriptor.sourcePath);
    if (!entry) {
      throw reviewError(
        'REVIEW_PACKAGE_RELEASE_MANIFEST_ENTRY_MISSING',
        `${descriptor.sourcePath} (${descriptor.role})`,
      );
    }
    const { filePath } = readRequiredFile(projectRoot, descriptor.sourcePath);
    const size = statSync(filePath).size;
    const hash = sha256File(filePath);
    if (entry.bytes !== size || entry.sha256 !== hash) {
      throw reviewError(
        'REVIEW_PACKAGE_RELEASE_MANIFEST_HASH_MISMATCH',
        `${descriptor.sourcePath}: manifest=${entry.sha256}/${entry.bytes}, actual=${hash}/${size}`,
      );
    }
  }

  const releaseHash = sha256File(resolveInside(projectRoot, RELEASE_ARTIFACT_PATH));
  validateReleaseChecksumIndex(projectRoot, releaseManifest, releaseHash);
  validateRealFixtureManifest(projectRoot, realFixtureManifest);

  return {
    releaseManifest,
    releaseManifestSha256: sha256File(resolveInside(projectRoot, RELEASE_MANIFEST_PATH)),
    releaseHash,
    checksumIndexSha256: sha256File(resolveInside(projectRoot, RELEASE_CHECKSUM_PATH)),
    realFixtureManifestSha256: sha256File(
      resolveInside(projectRoot, REAL_FIXTURE_MANIFEST_PATH),
    ),
  };
}

function artifactEntry(projectRoot, descriptor) {
  const { filePath } = readRequiredFile(projectRoot, descriptor.sourcePath);
  return {
    role: descriptor.role,
    sourcePath: descriptor.sourcePath,
    packagePath: `evidence/${descriptor.sourcePath}`,
    purpose: descriptor.purpose,
    sourceLock: descriptor.sourceLock,
    bytes: statSync(filePath).size,
    sha256: sha256File(filePath),
  };
}

function checklistRow(id, scope, itemNumber, statement) {
  return `| ${id} | ${scope} | ${itemNumber} | ${statement} | \`NOT_REVIEWED\` | [REQUIRED] | [REQUIRED] |`;
}

function expectedDecisionIds() {
  return [
    ...REVIEW_SURFACES.flatMap((surface) =>
      SCI_CHECKLIST_ITEMS.map(
        (_item, index) =>
          `AC-SCI-03-${surface}-${String(index + 1).padStart(2, '0')}`,
      ),
    ),
    ...VAL_CHECKLIST_ITEMS.map(
      (_item, index) => `AC-VAL-05-${String(index + 1).padStart(2, '0')}`,
    ),
  ];
}

export function renderStructuredInputTemplate(source) {
  const template = {
    schema: 'activation-energy-studio/scientific-review-input/v1',
    reviewId: '[REQUIRED_REVIEW_ID]',
    locks: {
      releaseSha256: source.releaseHash,
      releaseManifestSha256: source.releaseManifestSha256,
      packageManifestSha256: '[COPY_FROM_PACKAGE_MANIFEST_SHA256]',
    },
    reviewer: {
      name: '[REQUIRED]',
      affiliation: '[REQUIRED]',
      professionalProfile: '[REQUIRED_ORCID_OR_PUBLIC_PROFILE]',
      relevantExpertise: '[REQUIRED]',
      expertiseEvidence: '[REQUIRED]',
      independenceStatement: '[REQUIRED]',
      conflictOfInterestStatement: '[REQUIRED]',
      declarations: {
        isHumanReviewer: null,
        hasCurrentThermalAnalysisOrSolidStateKineticsExperience: null,
        isAiAgent: null,
        implementedCalculationCore: null,
        authoredValidationFixtures: null,
        isProductOwnerOrManuscriptAuthor: null,
        hasProjectEmploymentOrSupervisoryDependency: null,
        hasRecentCoauthorshipWithProjectTeam: null,
        hasFinancialOrIntellectualPropertyInterest: null,
        hasUndisclosedPaidConsultingOrReviewInfluence: null,
        hasOtherUndisclosedConflictOfInterest: null,
      },
    },
    review: {
      startedAtUtc: '[REQUIRED_ISO_UTC]',
      endedAtUtc: '[REQUIRED_ISO_UTC]',
      environment: {
        operatingSystem: '[REQUIRED]',
        browser: '[REQUIRED]',
        locale: '[REQUIRED]',
      },
    },
    decisions: expectedDecisionIds().map((id) => ({
      id,
      decision: 'NOT_REVIEWED',
      caseId: '[REQUIRED_CASE_ID]',
      evidence: [
        {
          path: '[REQUIRED_RELATIVE_EVIDENCE_PATH]',
          sha256: '[REQUIRED_SHA256]',
        },
      ],
      comment: '[REQUIRED_REVIEWER_COMMENT]',
    })),
    verdict: {
      gateDispositions: {
        'AC-SCI-03': 'NOT_REVIEWED',
        'AC-VAL-05': 'NOT_REVIEWED',
      },
      overallVerdict: 'NOT_REVIEWED',
      signedArtifact: {
        path: '[REQUIRED_RELATIVE_SIGNED_VERDICT_PATH]',
        sha256: '[REQUIRED_SHA256]',
      },
      signatureMethod: '[REQUIRED_ALLOWED_SIGNATURE_METHOD]',
      signatureVerificationReference: '[REQUIRED]',
      signatureUtc: '[REQUIRED_ISO_UTC]',
    },
  };
  return `${JSON.stringify(template, null, 2)}\n`;
}

export function renderVerdictTemplate(source) {
  const scienceRows = REVIEW_SURFACES.flatMap((surface) =>
    SCI_CHECKLIST_ITEMS.map((item, index) =>
      checklistRow(
        `AC-SCI-03-${surface}-${String(index + 1).padStart(2, '0')}`,
        surface,
        index + 1,
        item,
      ),
    ),
  );
  const validationRows = VAL_CHECKLIST_ITEMS.map((item, index) =>
    checklistRow(
      `AC-VAL-05-${String(index + 1).padStart(2, '0')}`,
      'Synthetic + Paper 010 real-data path',
      index + 1,
      item,
    ),
  );

  return `# Independent Scientific Review Decision — UNSIGNED TEMPLATE

> **STOP:** This is an unsigned, unexecuted template. It is not a scientific sign-off and does not change AC-SCI-03 or AC-VAL-05 from PARTIAL.

## Locked package identity

| Field | Locked or required value |
|---|---|
| Review-record state | \`${REVIEW_STATE}\` |
| Release artifact | \`${RELEASE_ARTIFACT_PATH}\` |
| Release SHA-256 | \`${source.releaseHash}\` |
| Source release manifest | \`${RELEASE_MANIFEST_PATH}\` |
| Source release manifest SHA-256 | \`${source.releaseManifestSha256}\` |
| Review-package manifest SHA-256 | [REQUIRED — copy from \`${PACKAGE_MANIFEST_SIDECAR_NAME}\`] |

## Independent reviewer identity

| Field | Reviewer entry |
|---|---|
| Name | [REQUIRED — blank in template] |
| Affiliation | [REQUIRED — blank in template] |
| Public professional profile / ORCID | [REQUIRED — blank in template] |
| Relevant thermal-analysis or solid-state-kinetics expertise | [REQUIRED — blank in template] |
| Evidence of relevant expertise | [REQUIRED — blank in template] |
| Human reviewer with current relevant experience | [REQUIRED TRUE — blank in template] |
| AI agent | [REQUIRED FALSE — blank in template] |
| Implemented calculation core | [REQUIRED FALSE — blank in template] |
| Authored validation fixtures | [REQUIRED FALSE — blank in template] |
| Product owner or manuscript/software author | [REQUIRED FALSE — blank in template] |
| Project employment/supervisory dependency | [REQUIRED FALSE — blank in template] |
| Recent coauthorship with project team | [REQUIRED FALSE — blank in template] |
| Financial or intellectual-property interest | [REQUIRED FALSE — blank in template] |
| Undisclosed paid consulting/review influence | [REQUIRED FALSE — blank in template] |
| Other undisclosed conflict | [REQUIRED FALSE — blank in template] |
| Independence statement | [REQUIRED — blank in template] |
| Conflict-of-interest declaration | [REQUIRED — blank in template] |
| Review start (UTC) | [REQUIRED — blank in template] |
| Review end (UTC) | [REQUIRED — blank in template] |
| Review OS / browser / locale | [REQUIRED — blank in template] |

## AC-SCI-03 surface-by-surface audit

Replace \`NOT_REVIEWED\` only with \`PASS\` or \`FAIL\`. No item or surface may be omitted.

| Decision ID | Surface | Item | Required scientific claim check | Decision | Evidence location | Reviewer comment |
|---|---|---:|---|---|---|---|
${scienceRows.join('\n')}

## AC-VAL-05 cross-method interpretation audit

Replace \`NOT_REVIEWED\` only with \`PASS\` or \`FAIL\`. The retained Paper 010 publication-reproduction negative result is mandatory evidence.

| Decision ID | Scope | Item | Required scientific interpretation check | Decision | Evidence location | Reviewer comment |
|---|---|---:|---|---|---|---|
${validationRows.join('\n')}

## Overall independent verdict

| Field | Reviewer entry |
|---|---|
| AC-SCI-03 disposition | \`UNSIGNED_NOT_REVIEWED\` — replace only with \`PASS\`, \`FAIL\`, or \`REVISION_REQUIRED\` |
| AC-VAL-05 disposition | \`UNSIGNED_NOT_REVIEWED\` — replace only with \`PASS\`, \`FAIL\`, or \`REVISION_REQUIRED\` |
| Overall verdict | \`UNSIGNED_NOT_REVIEWED\` — replace only with \`PASS\`, \`FAIL\`, or \`REVISION_REQUIRED\` |
| Signature | [REQUIRED — absent in template] |
| Signature method and verification reference | [REQUIRED — absent in template] |
| Signature time (UTC) | [REQUIRED — absent in template] |

## Completion rule

Copy this template and \`${STRUCTURED_INPUT_TEMPLATE_NAME}\` outside the immutable evidence package before completing them. Only an eligible independent reviewer may sign the verdict. Missing identity, independence, conflict declarations, locked hashes, any checklist decision, hashed evidence, comment, separate gate disposition, overall verdict, signature, verification reference, or UTC time leaves the affected gate open. A hash mismatch invalidates the review until a new package is explicitly accepted and affected checks are restarted. The structured recorder verifies completeness and consistency but cannot authenticate identity, declarations, observations, or signature validity and does not automatically close either gate.
`;
}

export function renderPackageReadme(source, artifactCount) {
  return `# Independent Scientific Review Package — UNSIGNED

**State:** \`${REVIEW_STATE}\`  
**Release:** Activation Energy Studio ${REVIEW_RELEASE_VERSION}  
**Acceptance gates:** AC-SCI-03 and AC-VAL-05 remain \`PARTIAL\`.

This is an immutable input package for a qualified external reviewer. Its existence, successful generation, or successful integrity check is not a scientific sign-off.

## Locked identities

- Release SHA-256: \`${source.releaseHash}\`
- Source release manifest SHA-256: \`${source.releaseManifestSha256}\`
- Fixed evidence artifacts: ${artifactCount}
- Required checklist decisions: ${REVIEW_SURFACES.length * SCI_CHECKLIST_ITEMS.length + VAL_CHECKLIST_ITEMS.length} (28 AC-SCI-03 surface decisions + 7 AC-VAL-05 decisions)

## Integrity check

From the project root, run:

\`\`\`sh
node ${SCRIPT_RELATIVE_PATH} --check
\`\`\`

From the root of a transferred review package, run the packaged checker without the original project:

\`\`\`sh
node evidence/${SCRIPT_RELATIVE_PATH} --project-root evidence --output .. --check
\`\`\`

The checker validates the exact package manifest, every copied artifact, generated template bytes, source release-manifest locks, the nested real-data manifest, and \`${PACKAGE_MANIFEST_SIDECAR_NAME}\`. Any mismatch is a failure.

## Independent review procedure

1. Confirm the reviewer satisfies \`evidence/${REVIEW_PROTOCOL_PATH}\`, including the expanded independence and conflict-of-interest declarations.
2. Record the release, source-manifest, and review-package-manifest SHA-256 values in the decision record.
3. Follow \`evidence/${REVIEW_RUNBOOK_PATH}\`; use the locked R/W/C cases and Paper 010 path to inspect UI, PDF, CSV, and JSON separately.
4. Inspect the hand worksheet, synthetic fixture, Paper 010 provenance/derivation/raw/derived/reference chain, scientific traceability, report contract, QA PDF, and retained negative result.
5. Copy \`${VERDICT_TEMPLATE_NAME}\` and \`${STRUCTURED_INPUT_TEMPLATE_NAME}\` outside this immutable package. Complete all 35 decisions, hashed evidence, comments, identity/declaration fields, separate gate dispositions, verdict, signed artifact, verification method/reference, and UTC times.
6. Run the packaged recorder:

\`\`\`sh
node evidence/${REVIEW_RECORD_SCRIPT_PATH} \\
  --package . \\
  --input ../observed-review/review-input.json \\
  --output ../observed-review/evidence-record.json
\`\`\`

7. Return the signed verdict and structured evidence record separately. Do not overwrite either unsigned template or claim a PASS from package generation alone.

The package checker verifies immutable inputs. The record generator verifies the returned record's structure, exact decision set, hashes, eligibility declarations, time order, signature-artifact presence, and disposition consistency. Neither tool authenticates reviewer identity, declarations, observations, or signature validity, creates a signature, or automatically changes either acceptance gate.
`;
}

export function serializePackageManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function buildReviewPackagePlan(projectRoot = MODULE_PROJECT_ROOT) {
  const resolvedRoot = path.resolve(projectRoot);
  const source = validateSourceLocks(resolvedRoot);
  const artifacts = REVIEW_ARTIFACTS.map((descriptor) =>
    artifactEntry(resolvedRoot, descriptor),
  );
  const readme = renderPackageReadme(source, artifacts.length);
  const verdictTemplate = renderVerdictTemplate(source);
  const structuredInputTemplate = renderStructuredInputTemplate(source);
  const generatedFiles = [
    {
      role: 'package_readme',
      packagePath: PACKAGE_README_NAME,
      bytes: Buffer.byteLength(readme),
      sha256: sha256Bytes(readme),
    },
    {
      role: 'unsigned_verdict_template',
      packagePath: VERDICT_TEMPLATE_NAME,
      bytes: Buffer.byteLength(verdictTemplate),
      sha256: sha256Bytes(verdictTemplate),
    },
    {
      role: 'unsigned_structured_review_input_template',
      packagePath: STRUCTURED_INPUT_TEMPLATE_NAME,
      bytes: Buffer.byteLength(structuredInputTemplate),
      sha256: sha256Bytes(structuredInputTemplate),
    },
  ];
  const manifest = {
    schema: REVIEW_PACKAGE_SCHEMA,
    packageVersion: REVIEW_RELEASE_VERSION,
    reviewState: REVIEW_STATE,
    acceptanceGates: {
      'AC-SCI-03': 'PARTIAL_AWAITING_INDEPENDENT_REVIEW',
      'AC-VAL-05': 'PARTIAL_AWAITING_INDEPENDENT_REVIEW',
    },
    boundary:
      'This package is an unsigned review input. Integrity PASS is not scientific sign-off and cannot close either acceptance gate.',
    lockedRelease: {
      name: source.releaseManifest.release.name,
      version: source.releaseManifest.release.version,
      artifact: RELEASE_ARTIFACT_PATH,
      bytes: statSync(resolveInside(resolvedRoot, RELEASE_ARTIFACT_PATH)).size,
      sha256: source.releaseHash,
      releaseManifestPath: RELEASE_MANIFEST_PATH,
      releaseManifestSha256: source.releaseManifestSha256,
      checksumIndexPath: RELEASE_CHECKSUM_PATH,
      checksumIndexSha256: source.checksumIndexSha256,
      realFixtureManifestPath: REAL_FIXTURE_MANIFEST_PATH,
      realFixtureManifestSha256: source.realFixtureManifestSha256,
    },
    reviewerEligibility: {
      required: true,
      humanReviewerRequired: true,
      currentRelevantExperienceRequired: true,
      independentFromCoreImplementation: true,
      independentFromValidationFixtureAuthorship: true,
      independentFromProductOwnershipAndAuthorship: true,
      noProjectEmploymentOrSupervisoryDependency: true,
      noRecentCoauthorshipWithProjectTeam: true,
      noFinancialOrIntellectualPropertyInterest: true,
      noUndisclosedPaidConsultingOrReviewInfluence: true,
      noOtherUndisclosedConflictOfInterest: true,
      aiAgentMaySign: false,
      requiredIdentityFields: [
        'name',
        'affiliation',
        'professionalProfile',
        'relevantExpertise',
        'expertiseEvidence',
        'independenceStatement',
        'conflictOfInterestStatement',
        'eligibilityDeclarations',
        'reviewStartUtc',
        'reviewEndUtc',
        'reviewEnvironment',
        'signature',
        'signatureMethod',
        'signatureVerificationReference',
        'signatureUtc',
      ],
    },
    checklist: {
      acSci03: {
        surfaces: REVIEW_SURFACES,
        itemsPerSurface: SCI_CHECKLIST_ITEMS.length,
        requiredDecisions: REVIEW_SURFACES.length * SCI_CHECKLIST_ITEMS.length,
      },
      acVal05: {
        scopes: ['locked synthetic report', 'Paper 010 real-data validation path'],
        requiredDecisions: VAL_CHECKLIST_ITEMS.length,
      },
      totalRequiredDecisions:
        REVIEW_SURFACES.length * SCI_CHECKLIST_ITEMS.length + VAL_CHECKLIST_ITEMS.length,
      initialDecision: 'NOT_REVIEWED',
      allowedCompletedItemDecisions: ['PASS', 'FAIL'],
      allowedGateDispositions: ['PASS', 'FAIL', 'REVISION_REQUIRED'],
      allowedOverallVerdicts: ['PASS', 'FAIL', 'REVISION_REQUIRED'],
      structuredInputSchema:
        'activation-energy-studio/scientific-review-input/v1',
      structuredEvidenceSchema:
        'activation-energy-studio/scientific-review-evidence-record/v1',
    },
    artifacts,
    generatedFiles,
    generation: {
      generator: SCRIPT_RELATIVE_PATH,
      command: `node ${SCRIPT_RELATIVE_PATH}`,
      checkCommand: `node ${SCRIPT_RELATIVE_PATH} --check`,
      deterministic: true,
      generatedAtOmitted: true,
      hashAlgorithm: 'sha256',
      hashInput: 'raw_file_bytes',
      artifactOrdering: 'fixed_by_generator',
      manifestPath: PACKAGE_MANIFEST_NAME,
      manifestHashSidecarPath: PACKAGE_MANIFEST_SIDECAR_NAME,
      manifestSelfHashExcluded: true,
      signedDecisionExcluded: true,
      signedDecisionRule:
        'The eligible reviewer returns a completed signed record outside this immutable package.',
      structuredRecordCommand:
        `node evidence/${REVIEW_RECORD_SCRIPT_PATH} --package . --input <review-input.json> --output <evidence-record.json>`,
      structuredRecordBoundary:
        'Structural validation cannot authenticate reviewer identity, declarations, observations, or signature validity and cannot automatically close either gate.',
    },
  };
  const serializedManifest = serializePackageManifest(manifest);
  const manifestSha256 = sha256Bytes(serializedManifest);
  const manifestSidecar = `${manifestSha256}  ${PACKAGE_MANIFEST_NAME}\n`;
  return {
    projectRoot: resolvedRoot,
    source,
    artifacts,
    readme,
    verdictTemplate,
    structuredInputTemplate,
    manifest,
    serializedManifest,
    manifestSha256,
    manifestSidecar,
  };
}

function resolveOutput(projectRoot, outputPath) {
  if (!outputPath) return resolveInside(projectRoot, DEFAULT_OUTPUT_RELATIVE_PATH);
  return path.resolve(outputPath);
}

function assertSafeOutput(projectRoot, outputPath) {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedOutput = path.resolve(outputPath);
  if (resolvedOutput === resolvedRoot || resolvedOutput === path.parse(resolvedOutput).root) {
    throw reviewError('REVIEW_PACKAGE_UNSAFE_OUTPUT', resolvedOutput);
  }
  const outputToProject = path.relative(resolvedOutput, resolvedRoot);
  if (
    outputToProject === ''
    || (!outputToProject.startsWith(`..${path.sep}`) && outputToProject !== '..' && !path.isAbsolute(outputToProject))
  ) {
    throw reviewError(
      'REVIEW_PACKAGE_OUTPUT_CONTAINS_PROJECT',
      `${resolvedOutput} contains ${resolvedRoot}`,
    );
  }
  for (const descriptor of REVIEW_ARTIFACTS) {
    const sourcePath = resolveInside(resolvedRoot, descriptor.sourcePath);
    const relativeSource = path.relative(resolvedOutput, sourcePath);
    if (
      relativeSource === ''
      || (!relativeSource.startsWith(`..${path.sep}`) && relativeSource !== '..' && !path.isAbsolute(relativeSource))
    ) {
      throw reviewError(
        'REVIEW_PACKAGE_OUTPUT_CONTAINS_SOURCE',
        `${resolvedOutput} contains ${descriptor.sourcePath}`,
      );
    }
  }
  if (existsSync(resolvedOutput)) {
    if (!statSync(resolvedOutput).isDirectory()) {
      throw reviewError('REVIEW_PACKAGE_OUTPUT_NOT_DIRECTORY', resolvedOutput);
    }
    const marker = path.join(resolvedOutput, PACKAGE_MANIFEST_NAME);
    let markerSchema;
    try {
      markerSchema = JSON.parse(readFileSync(marker, 'utf8')).schema;
    } catch {
      markerSchema = undefined;
    }
    if (markerSchema !== REVIEW_PACKAGE_SCHEMA) {
      throw reviewError(
        'REVIEW_PACKAGE_OUTPUT_NOT_OWNED',
        `${resolvedOutput} is not marked with ${REVIEW_PACKAGE_SCHEMA}.`,
      );
    }
  }
}

function writeTextFile(root, relativePath, content) {
  const destination = resolveInside(root, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, content, 'utf8');
}

export function generateReviewPackage(
  projectRoot = MODULE_PROJECT_ROOT,
  outputPath,
) {
  const plan = buildReviewPackagePlan(projectRoot);
  const resolvedOutput = resolveOutput(plan.projectRoot, outputPath);
  assertSafeOutput(plan.projectRoot, resolvedOutput);
  mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  const staging = mkdtempSync(`${resolvedOutput}.tmp-`);

  try {
    for (const artifact of plan.artifacts) {
      const source = resolveInside(plan.projectRoot, artifact.sourcePath);
      const destination = resolveInside(staging, artifact.packagePath);
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(source, destination);
    }
    writeTextFile(staging, PACKAGE_README_NAME, plan.readme);
    writeTextFile(staging, VERDICT_TEMPLATE_NAME, plan.verdictTemplate);
    writeTextFile(
      staging,
      STRUCTURED_INPUT_TEMPLATE_NAME,
      plan.structuredInputTemplate,
    );
    writeTextFile(staging, PACKAGE_MANIFEST_NAME, plan.serializedManifest);
    writeTextFile(staging, PACKAGE_MANIFEST_SIDECAR_NAME, plan.manifestSidecar);

    rmSync(resolvedOutput, { recursive: true, force: true });
    renameSync(staging, resolvedOutput);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }

  verifyReviewPackage(plan.projectRoot, resolvedOutput);
  return { ...plan, outputPath: resolvedOutput };
}

function listPackageFiles(root, prefix = '') {
  const directory = prefix ? resolveInside(root, prefix) : root;
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listPackageFiles(root, relative));
    else if (entry.isFile()) files.push(relative);
    else throw reviewError('REVIEW_PACKAGE_UNSUPPORTED_ENTRY', relative);
  }
  return files.sort();
}

export function verifyReviewPackage(
  projectRoot = MODULE_PROJECT_ROOT,
  outputPath,
) {
  const plan = buildReviewPackagePlan(projectRoot);
  const resolvedOutput = resolveOutput(plan.projectRoot, outputPath);
  if (!existsSync(resolvedOutput) || !statSync(resolvedOutput).isDirectory()) {
    throw reviewError('REVIEW_PACKAGE_MISSING', resolvedOutput);
  }

  const manifestPath = resolveInside(resolvedOutput, PACKAGE_MANIFEST_NAME);
  if (!existsSync(manifestPath)) {
    throw reviewError('REVIEW_PACKAGE_MANIFEST_MISSING', manifestPath);
  }
  const actualManifest = readFileSync(manifestPath, 'utf8');
  if (actualManifest !== plan.serializedManifest) {
    throw reviewError(
      'REVIEW_PACKAGE_MANIFEST_STALE',
      `${PACKAGE_MANIFEST_NAME} does not match current locked sources.`,
    );
  }

  const sidecarPath = resolveInside(resolvedOutput, PACKAGE_MANIFEST_SIDECAR_NAME);
  if (!existsSync(sidecarPath) || readFileSync(sidecarPath, 'utf8') !== plan.manifestSidecar) {
    throw reviewError(
      'REVIEW_PACKAGE_MANIFEST_SIDECAR_MISMATCH',
      PACKAGE_MANIFEST_SIDECAR_NAME,
    );
  }

  for (const artifact of plan.artifacts) {
    const packageFile = resolveInside(resolvedOutput, artifact.packagePath);
    if (!existsSync(packageFile) || !statSync(packageFile).isFile()) {
      throw reviewError('REVIEW_PACKAGE_ARTIFACT_MISSING', artifact.packagePath);
    }
    const actualBytes = statSync(packageFile).size;
    const actualHash = sha256File(packageFile);
    if (actualBytes !== artifact.bytes || actualHash !== artifact.sha256) {
      throw reviewError(
        'REVIEW_PACKAGE_ARTIFACT_HASH_MISMATCH',
        `${artifact.packagePath}: expected ${artifact.sha256}/${artifact.bytes}, actual ${actualHash}/${actualBytes}`,
      );
    }
  }

  const generated = new Map([
    [PACKAGE_README_NAME, plan.readme],
    [VERDICT_TEMPLATE_NAME, plan.verdictTemplate],
    [STRUCTURED_INPUT_TEMPLATE_NAME, plan.structuredInputTemplate],
  ]);
  for (const [relativePath, expected] of generated) {
    const generatedPath = resolveInside(resolvedOutput, relativePath);
    if (!existsSync(generatedPath) || readFileSync(generatedPath, 'utf8') !== expected) {
      throw reviewError('REVIEW_PACKAGE_GENERATED_FILE_MISMATCH', relativePath);
    }
  }

  const expectedFiles = [
    PACKAGE_MANIFEST_NAME,
    PACKAGE_MANIFEST_SIDECAR_NAME,
    PACKAGE_README_NAME,
    VERDICT_TEMPLATE_NAME,
    STRUCTURED_INPUT_TEMPLATE_NAME,
    ...plan.artifacts.map(({ packagePath }) => packagePath),
  ].sort();
  const actualFiles = listPackageFiles(resolvedOutput);
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw reviewError(
      'REVIEW_PACKAGE_FILE_SET_MISMATCH',
      `expected ${expectedFiles.length} files, found ${actualFiles.length}`,
    );
  }

  return { ...plan, outputPath: resolvedOutput };
}

function parseCliArguments(argv) {
  const options = {
    projectRoot: MODULE_PROJECT_ROOT,
    outputArgument: undefined,
    outputPath: undefined,
    check: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') options.check = true;
    else if (argument === '--project-root') {
      const value = argv[index + 1];
      if (!value) throw reviewError('REVIEW_PACKAGE_ARGUMENT_MISSING', '--project-root');
      options.projectRoot = path.resolve(value);
      index += 1;
    } else if (argument === '--output') {
      const value = argv[index + 1];
      if (!value) throw reviewError('REVIEW_PACKAGE_ARGUMENT_MISSING', '--output');
      options.outputArgument = value;
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw reviewError('REVIEW_PACKAGE_UNKNOWN_ARGUMENT', argument);
    }
  }
  if (options.outputArgument) {
    options.outputPath = path.isAbsolute(options.outputArgument)
      ? options.outputArgument
      : path.resolve(options.projectRoot, options.outputArgument);
  }
  return options;
}

function usage() {
  return `Usage: node ${SCRIPT_RELATIVE_PATH} [options]

  --project-root <path>  Project root (default: script parent)
  --output <path>        Package directory (default: ${DEFAULT_OUTPUT_RELATIVE_PATH})
  --check                Verify current package bytes without writing
  --help                  Show this help

Generation and integrity PASS leave AC-SCI-03 and AC-VAL-05 PARTIAL.
Only an eligible independent reviewer's separately retained signed record can close them.`;
}

function runCli() {
  try {
    const options = parseCliArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const result = options.check
      ? verifyReviewPackage(options.projectRoot, options.outputPath)
      : generateReviewPackage(options.projectRoot, options.outputPath);
    const action = options.check ? 'CURRENT' : 'GENERATED';
    console.log(
      `TECHNICAL_OK SCIENTIFIC_REVIEW_PACKAGE_${action} ${result.outputPath} `
      + `manifestSha256=${result.manifestSha256} artifacts=${result.artifacts.length} `
      + `reviewState=${REVIEW_STATE} gates=PARTIAL`,
    );
  } catch (error) {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) runCli();
