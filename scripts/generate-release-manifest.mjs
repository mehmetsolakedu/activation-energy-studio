#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const MANIFEST_SCHEMA = 'activation-energy-studio/release-evidence-manifest/v1';
export const RELEASE_VERSION = '0.2.0';
export const RELEASE_ARTIFACT_PATH = 'release/Activation-Energy-Studio-v0.2.0.html';
export const MANIFEST_RELATIVE_PATH = 'release/MANIFEST.v0.2.0.json';

export const EVIDENCE_FILES = Object.freeze([
  {
    path: RELEASE_ARTIFACT_PATH,
    role: 'release_html',
    category: 'release_artifact',
  },
  {
    path: '00_MISSION_LOCK.md',
    role: 'mission_lock',
    category: 'normative_document',
  },
  {
    path: '01_SCIENTIFIC_SPEC_V1.md',
    role: 'scientific_specification',
    category: 'normative_document',
  },
  {
    path: '02_ACCEPTANCE_CRITERIA.md',
    role: 'acceptance_criteria',
    category: 'normative_document',
  },
  {
    path: '../ULTIMATE_GOAL.md',
    role: 'parent_goal',
    category: 'governance',
  },
  {
    path: 'REAL_DATA_VALIDATION_GOAL.md',
    role: 'real_data_validation_goal',
    category: 'governance',
  },
  {
    path: 'CURRENT_VALIDATION_STATUS.md',
    role: 'current_validation_status',
    category: 'validation_report',
  },
  {
    path: 'SCIENTIFIC_TRACEABILITY_REPORT.md',
    role: 'scientific_traceability_report',
    category: 'validation_report',
  },
  {
    path: 'evidence/corpus/CORPUS_INTEGRITY_LEDGER.json',
    role: 'corpus_integrity_ledger',
    category: 'corpus_source_lock',
  },
  {
    path: '../01_PDF_Evidence_Extraction/00_Start_Here/paper_processing_order.csv',
    role: 'corpus_processing_order',
    category: 'corpus_source_lock',
  },
  {
    path: '../01_PDF_Evidence_Extraction/05_Canonical_Evidence_Table/activation_energy_evidence.csv',
    role: 'corpus_canonical_evidence_table',
    category: 'corpus_source_lock',
  },
  {
    path: '../01_PDF_Evidence_Extraction/06_Method_Evidence_Matrix/method_evidence_matrix.csv',
    role: 'corpus_method_evidence_matrix',
    category: 'corpus_source_lock',
  },
  {
    path: 'NUMERICAL_VALIDATION_REPORT.md',
    role: 'independent_numerical_validation_report',
    category: 'validation_report',
  },
  {
    path: 'SCIENTIFIC_REVIEW_SIGNOFF_PROTOCOL.md',
    role: 'scientific_review_signoff_protocol',
    category: 'validation_protocol',
  },
  {
    path: 'SCIENTIFIC_REVIEW_RUNBOOK.md',
    role: 'scientific_review_runbook',
    category: 'validation_protocol',
  },
  {
    path: 'PDF_REPORT_VISUAL_QA.md',
    role: 'pdf_visual_qa_report',
    category: 'validation_report',
  },
  {
    path: 'REAL_DATA_VALIDATION_STATUS.md',
    role: 'real_data_validation_status',
    category: 'validation_report',
  },
  {
    path: 'evidence/validation/REAL_DATA_VALIDATION_FINAL_REPORT.md',
    role: 'real_data_validation_final_report',
    category: 'validation_report',
  },
  {
    path: 'evidence/validation/oak-local/OAK_LOCAL_VALIDATION_REPORT.md',
    role: 'oak_real_data_validation_report',
    category: 'validation_report',
  },
  {
    path: 'evidence/validation/oak-publication-audit/OAK_PUBLICATION_AUDIT.md',
    role: 'oak_publication_forensic_audit',
    category: 'scientific_negative_evidence',
  },
  {
    path: 'evidence/validation/oak-publication-audit/publication_table3_targets.csv',
    role: 'oak_publication_table3_transcription',
    category: 'scientific_negative_evidence',
  },
  {
    path: 'evidence/validation/oak-publication-audit/independent_standard_reproduction.csv',
    role: 'oak_independent_standard_reproduction',
    category: 'scientific_negative_evidence',
  },
  {
    path: 'evidence/validation/oak-publication-audit/factor_1_052_forensic_test.csv',
    role: 'oak_fwo_coefficient_forensic_test',
    category: 'scientific_negative_evidence',
  },
  {
    path: 'evidence/validation/oak-publication-audit/source_file_manifest.csv',
    role: 'oak_publication_source_file_manifest',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'SECOND_RAW_DATASET_SEARCH.md',
    role: 'second_raw_dataset_acquisition_audit',
    category: 'validation_report',
  },
  {
    path: 'OFFLINE_BUNDLE_VERIFICATION.md',
    role: 'offline_bundle_verification_report',
    category: 'validation_report',
  },
  {
    path: 'BROWSER_VALIDATION_ATTEMPT.md',
    role: 'real_browser_validation_attempt',
    category: 'validation_report',
  },
  {
    path: 'PLATFORM_VALIDATION_PROTOCOL.md',
    role: 'platform_validation_protocol',
    category: 'validation_protocol',
  },
  {
    path: 'HOSTED_PLATFORM_VALIDATION.md',
    role: 'hosted_platform_validation_runbook',
    category: 'validation_protocol',
  },
  {
    path: 'EXTERNAL_EVIDENCE_ADJUDICATION_PROTOCOL.md',
    role: 'external_evidence_adjudication_protocol',
    category: 'validation_protocol',
  },
  {
    path: '.github/workflows/platform-validation.yml',
    role: 'hosted_platform_validation_workflow',
    category: 'validation_automation',
  },
  {
    path: 'USABILITY_VALIDATION_PROTOCOL.md',
    role: 'usability_validation_protocol',
    category: 'validation_protocol',
  },
  {
    path: 'WARNING_VISIBILITY_VISUAL_QA.md',
    role: 'warning_visibility_visual_qa_report',
    category: 'validation_report',
  },
  {
    path: 'evidence/usability/v0.2.0/UX_FIXTURE_MANIFEST.json',
    role: 'usability_fixture_manifest',
    category: 'validation_fixture_lock',
  },
  {
    path: 'evidence/usability/v0.2.0/warning-visibility-current/WARNING_VISIBILITY_EVIDENCE.json',
    role: 'warning_visibility_evidence_manifest',
    category: 'usability_runtime_evidence_lock',
  },
  {
    path: 'evidence/usability/v0.2.0/warning-visibility-current/WARNING_VISIBILITY_EVIDENCE.sha256',
    role: 'warning_visibility_evidence_sidecar',
    category: 'usability_runtime_evidence_lock',
  },
  {
    path: 'evidence/validation/FIXTURE_MANIFEST.v0.2.0.json',
    role: 'complete_fixture_manifest',
    category: 'validation_fixture_lock',
  },
  {
    path: 'evidence/governance/P0_EVIDENCE_MAP.v0.2.0.json',
    role: 'p0_evidence_mapping_contract',
    category: 'governance_contract',
  },
  {
    path: 'governance/KNOWN_ISSUES.json',
    role: 'severity_tagged_known_issues_ledger',
    category: 'governance_ledger',
  },
  {
    path: 'governance/KNOWN_ISSUES.schema.json',
    role: 'known_issues_json_schema',
    category: 'governance_contract',
  },
  {
    path: 'governance/RELEASE_SIGNOFF_INPUT.schema.json',
    role: 'five_role_release_signoff_input_schema',
    category: 'governance_contract',
  },
  {
    path: 'governance/EXTERNAL_EVIDENCE_ADJUDICATION_INPUT.schema.json',
    role: 'external_evidence_adjudication_input_schema',
    category: 'governance_contract',
  },
  {
    path: 'evidence/platform/local-macos/v0.2.0-current-release/LOCAL_MACOS_DIAGNOSTIC_MANIFEST.json',
    role: 'local_macos_diagnostic_integrity_manifest',
    category: 'platform_runtime_evidence_lock',
  },
  {
    path: 'tests/fixtures/real/manifest.json',
    role: 'real_fixture_manifest',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/oracle/paper010_decimal_oracle.py',
    role: 'independent_real_oracle_implementation',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/README.md',
    role: 'real_fixture_provenance',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/oak/manifest.json',
    role: 'oak_real_fixture_manifest',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/oak/oracle/oak_decimal_oracle.py',
    role: 'oak_independent_decimal_oracle',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/oak/expected-output.json',
    role: 'oak_independent_expected_output',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/oak/manual/alpha-0.50-hand-check.json',
    role: 'oak_independent_manual_check',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/oak/source/TGA-Oak-5Kmin-1.csv',
    role: 'oak_5kmin_official_raw_source',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/oak/source/TGA-Oak-10Kmin-1.csv',
    role: 'oak_10kmin_official_raw_source',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/oak/source/TGA-Oak-20Kmin-1.csv',
    role: 'oak_20kmin_official_raw_source',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/oak/source/TGA-Oak-40Kmin-1.csv',
    role: 'oak_40kmin_official_raw_source',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/nr-cels/source/TG_DTG_DTA_data.zip',
    role: 'nr_cels_official_tg_dtg_dta_archive',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/nr-cels/source/Kinetic_data.zip',
    role: 'nr_cels_official_kinetic_archive',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/nr-cels/manifest/nr-cels-validation-manifest.json',
    role: 'nr_cels_validation_manifest',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/nr-cels/oracle/nr_cels_friedman_oracle.py',
    role: 'nr_cels_independent_decimal_oracle',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/nr-cels/oracle/expected-output.json',
    role: 'nr_cels_independent_expected_output',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/nr-cels/manual/nr-cels-adjudication.json',
    role: 'nr_cels_manual_adjudication',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'evidence/validation/nr-cels/NR_CELS_VALIDATION.md',
    role: 'nr_cels_validation_report',
    category: 'validation_report',
  },
  {
    path: 'evidence/validation/nr-cels/source_file_manifest.csv',
    role: 'nr_cels_source_file_manifest',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'evidence/validation/nr-cels/friedman_reconstruction_summary.csv',
    role: 'nr_cels_friedman_reconstruction_summary',
    category: 'validation_report',
  },
  {
    path: 'evidence/validation/nr-cels/friedman_all_alpha_comparison.csv',
    role: 'nr_cels_friedman_all_alpha_comparison',
    category: 'validation_report',
  },
  {
    path: 'scripts/run-nr-cels-friedman-oracle.mjs',
    role: 'nr_cels_independent_oracle_launcher',
    category: 'validation_automation',
  },
  {
    path: 'scripts/generate-nr-cels-validation-evidence.mjs',
    role: 'nr_cels_validation_evidence_generator',
    category: 'validation_automation',
  },
  {
    path: 'scripts/generate-nr-cels-validation-manifest.mjs',
    role: 'nr_cels_validation_manifest_generator',
    category: 'validation_automation',
  },
  {
    path: 'tests/nr-cels-source-integrity.test.mjs',
    role: 'nr_cels_source_integrity_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/nr-cels-oracle-reproducibility.test.mjs',
    role: 'nr_cels_oracle_reproducibility_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/nr-cels-wide-production-oracle.test.ts',
    role: 'nr_cels_wide_production_oracle_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/fixtures/real/dryad-polyisoprene/source/Data.zip',
    role: 'dryad_polyisoprene_official_archive',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/dryad-polyisoprene/manifest.json',
    role: 'dryad_polyisoprene_validation_manifest',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/dryad-polyisoprene/oracle/dryad_polyisoprene_decimal_oracle.py',
    role: 'dryad_polyisoprene_independent_decimal_oracle',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/dryad-polyisoprene/expected-output.json',
    role: 'dryad_polyisoprene_independent_expected_output',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/dryad-polyisoprene/manual/hbpi-table3-swap-adjudication.json',
    role: 'dryad_polyisoprene_manual_adjudication',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'evidence/validation/dryad-polyisoprene/DRYAD_POLYISOPRENE_VALIDATION.md',
    role: 'dryad_polyisoprene_validation_report',
    category: 'validation_report',
  },
  {
    path: 'evidence/validation/dryad-polyisoprene/independent_oracle_summary.csv',
    role: 'dryad_polyisoprene_independent_oracle_summary',
    category: 'validation_report',
  },
  {
    path: 'evidence/validation/dryad-polyisoprene/publication_table4_targets.csv',
    role: 'dryad_polyisoprene_publication_table4_targets',
    category: 'scientific_negative_evidence',
  },
  {
    path: 'evidence/validation/dryad-polyisoprene/source_file_manifest.csv',
    role: 'dryad_polyisoprene_source_file_manifest',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'evidence/validation/dryad-polyisoprene/table3_swap_adjudication.csv',
    role: 'dryad_polyisoprene_table3_swap_adjudication',
    category: 'scientific_negative_evidence',
  },
  {
    path: 'scripts/run-dryad-polyisoprene-oracle.mjs',
    role: 'dryad_polyisoprene_independent_oracle_launcher',
    category: 'validation_automation',
  },
  {
    path: 'tests/dryad-polyisoprene-oracle-reproducibility.test.mjs',
    role: 'dryad_polyisoprene_oracle_reproducibility_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/dryad-polyisoprene-production-core.test.ts',
    role: 'dryad_polyisoprene_production_core_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/fixtures/real/coal-spt-paraffin/source/TGA raw data of coal, SPT and paraffin at different masses.xlsx',
    role: 'coal_spt_paraffin_official_archive',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/coal-spt-paraffin/manifest.json',
    role: 'coal_spt_paraffin_validation_manifest',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/coal-spt-paraffin/paraffin10_t_alpha_beta.csv',
    role: 'coal_spt_paraffin_projected_fixture',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/coal-spt-paraffin/oracle/coal_spt_paraffin_decimal_oracle.py',
    role: 'coal_spt_paraffin_independent_decimal_oracle',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/coal-spt-paraffin/expected-output.json',
    role: 'coal_spt_paraffin_independent_expected_output',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'evidence/validation/coal-spt-paraffin/MANUAL_ADJUDICATION.md',
    role: 'coal_spt_paraffin_manual_adjudication',
    category: 'scientific_negative_evidence',
  },
  {
    path: 'evidence/validation/coal-spt-paraffin/v1-v2-adjudication.json',
    role: 'coal_spt_paraffin_version_adjudication',
    category: 'scientific_negative_evidence',
  },
  {
    path: 'evidence/validation/coal-spt-paraffin/VALIDATION_REPORT.md',
    role: 'coal_spt_paraffin_validation_report',
    category: 'validation_report',
  },
  {
    path: 'scripts/run-coal-spt-paraffin-oracle.mjs',
    role: 'coal_spt_paraffin_independent_oracle_launcher',
    category: 'validation_automation',
  },
  {
    path: 'tests/coal-spt-paraffin-oracle-reproducibility.test.mjs',
    role: 'coal_spt_paraffin_oracle_reproducibility_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/coal-spt-paraffin-validation.test.ts',
    role: 'coal_spt_paraffin_production_validation_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/fixtures/real/paper063/paper063_kissinger_peaks.csv',
    role: 'publication_peak_fixture',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/paper063/provenance.json',
    role: 'publication_peak_fixture_provenance',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/real/paper063/expected-output.json',
    role: 'publication_peak_kissinger_reference',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/hand/activation_energy_hand_worksheet.json',
    role: 'independent_hand_worksheet_fixture',
    category: 'scientific_fixture_lock',
  },
  {
    path: 'tests/fixtures/synthetic/layer2_validation.json',
    role: 'synthetic_layer2_fixture',
    category: 'validation_fixture',
  },
  {
    path: 'tests/fixtures/alpha/alpha-safety.ts',
    role: 'alpha_safety_fixture',
    category: 'validation_fixture',
  },
  {
    path: 'examples/synthetic_kas_150.csv',
    role: 'report_qa_input_fixture',
    category: 'validation_fixture',
  },
  {
    path: 'release/Platform-Locale-English-dot.csv',
    role: 'platform_locale_english_fixture',
    category: 'validation_fixture',
  },
  {
    path: 'release/Platform-Locale-Turkish-comma.csv',
    role: 'platform_locale_turkish_fixture',
    category: 'validation_fixture',
  },
  {
    path: 'release/Platform-Locale-Mixed-invalid.csv',
    role: 'platform_locale_mixed_invalid_fixture',
    category: 'validation_fixture',
  },
  {
    path: 'tests/runtime-offline-app.test.tsx',
    role: 'jsdom_runtime_offline_guard',
    category: 'verification_test',
  },
  {
    path: 'tests/helpers/minimal-ooxml.ts',
    role: 'minimal_ooxml_app_fixture_builder',
    category: 'validation_fixture_builder',
  },
  {
    path: 'tests/result-type-comprehension.test.tsx',
    role: 'result_type_comprehension_surface_verification',
    category: 'verification_test',
  },
  {
    path: 'src/alphaGrid.ts',
    role: 'explicit_alpha_grid_contract',
    category: 'scientific_configuration',
  },
  {
    path: 'tests/alpha-grid.test.ts',
    role: 'explicit_alpha_grid_contract_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/app-alpha-grid-flow.test.tsx',
    role: 'explicit_alpha_grid_app_flow_verification',
    category: 'verification_test',
  },
  {
    path: 'src/components/ScientificResultsTable.tsx',
    role: 'numeric_results_table_surface',
    category: 'user_interface_contract',
  },
  {
    path: 'tests/io-derivative-ingestion.test.ts',
    role: 'direct_derivative_ingestion_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/app-derivative-mapping-flow.test.tsx',
    role: 'direct_derivative_app_mapping_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/integration.test.ts',
    role: 'integration_adapter_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/e2e-scientific.test.ts',
    role: 'end_to_end_scientific_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/diagnostic-copy-coverage.test.ts',
    role: 'diagnostic_copy_coverage_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/usability-fixture-bundle.test.ts',
    role: 'usability_fixture_bundle_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/platform-evidence-app-integration.test.ts',
    role: 'platform_evidence_app_integration_verification',
    category: 'verification_test',
  },
  {
    path: 'src/report/stage.ts',
    role: 'report_stage_resolution',
    category: 'report_contract',
  },
  {
    path: 'tests/report-stage-label.test.ts',
    role: 'report_stage_resolution_verification',
    category: 'verification_test',
  },
  {
    path: 'src/platformSelfTest.ts',
    role: 'runtime_scientific_self_test',
    category: 'runtime_verification_tool',
  },
  {
    path: 'src/components/PlatformSelfTestPanel.tsx',
    role: 'runtime_scientific_self_test_surface',
    category: 'runtime_verification_tool',
  },
  {
    path: 'tests/platform-self-test.test.ts',
    role: 'runtime_scientific_self_test_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/platform-self-test-ui.test.tsx',
    role: 'runtime_scientific_self_test_ui_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/usability-study-evidence-record.test.mjs',
    role: 'usability_study_evidence_record_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/corpus-integrity-ledger.test.mjs',
    role: 'corpus_integrity_ledger_verification',
    category: 'verification_test',
  },
  {
    path: 'src/report/project-report.schema.json',
    role: 'project_report_json_schema',
    category: 'report_contract',
  },
  {
    path: 'tests/report-contract.test.ts',
    role: 'report_contract_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/helpers/report-fixture.ts',
    role: 'schema_v4_report_qa_fixture',
    category: 'report_fixture',
  },
  {
    path: 'tests/report.test.ts',
    role: 'pdf_pagination_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/report-qa-artifact.test.ts',
    role: 'pdf_qa_artifact_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/regression-ci-boundary-contract.test.tsx',
    role: 'regression_ci_boundary_contract_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/io-locale-matrix.test.ts',
    role: 'io_unit_locale_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/io-direct-acceptance.test.ts',
    role: 'io_direct_acceptance_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/alpha-safety-acceptance.test.ts',
    role: 'alpha_safety_acceptance_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/numerical-acceptance-matrix.test.ts',
    role: 'numerical_acceptance_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/hand-worksheet-validation.test.ts',
    role: 'independent_hand_worksheet_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/refusal-matrix.test.ts',
    role: 'refusal_matrix_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/eligibility-direct-gaps.test.ts',
    role: 'eligibility_direct_acceptance_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/global-refusal-contract.test.ts',
    role: 'global_refusal_contract_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/synthetic-layer2-validation.test.ts',
    role: 'synthetic_layer2_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/real-data-validation.test.ts',
    role: 'real_data_decimal_reference_verification',
    category: 'verification_test',
  },
  {
    path: 'scripts/run-oak-oracle.mjs',
    role: 'oak_independent_oracle_launcher',
    category: 'validation_automation',
  },
  {
    path: 'tests/oak-oracle-reproducibility.test.mjs',
    role: 'oak_independent_oracle_reproducibility_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/oak-source-integrity.test.ts',
    role: 'oak_official_source_integrity_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/oak-raw-wide-series.test.ts',
    role: 'oak_raw_production_path_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/oak-manual-adjudication.test.ts',
    role: 'oak_manual_adjudication_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/paper063-kissinger-validation.test.ts',
    role: 'publication_peak_kissinger_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/paper010-oracle-reproducibility.test.mjs',
    role: 'independent_real_oracle_reproducibility_verification',
    category: 'verification_test',
  },
  {
    path: 'evidence/validation/PAPER010_RAW_TO_REPORT_PROTOCOL.md',
    role: 'paper010_locked_release_raw_to_report_protocol',
    category: 'validation_protocol',
  },
  {
    path: 'scripts/run-paper010-raw-to-report.mjs',
    role: 'paper010_locked_release_raw_to_report_runner',
    category: 'validation_automation',
  },
  {
    path: 'tests/paper010-raw-to-report.test.mjs',
    role: 'paper010_locked_release_raw_to_report_verification',
    category: 'verification_test',
  },
  {
    path: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/PAPER010_RAW_TO_REPORT_MANIFEST.json',
    role: 'paper010_raw_to_report_evidence_manifest',
    category: 'real_browser_validation_evidence',
  },
  {
    path: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/paper010-kissinger-negative-evidence.json',
    role: 'paper010_kissinger_stage_ambiguity_negative_evidence',
    category: 'scientific_negative_evidence',
  },
  {
    path: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-1/paper010-raw-to-report.json',
    role: 'paper010_pass1_reproducible_json',
    category: 'real_browser_validation_evidence',
  },
  {
    path: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-1/paper010-raw-to-report-results.csv',
    role: 'paper010_pass1_results_csv',
    category: 'real_browser_validation_evidence',
  },
  {
    path: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-1/paper010-raw-to-report-report.pdf',
    role: 'paper010_pass1_report_pdf',
    category: 'real_browser_validation_evidence',
  },
  {
    path: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-1/paper010-final-state.png',
    role: 'paper010_pass1_final_ui_screenshot',
    category: 'real_browser_validation_evidence',
  },
  {
    path: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-1/paper010-network-capture.json',
    role: 'paper010_pass1_raw_network_capture',
    category: 'real_browser_validation_evidence',
  },
  {
    path: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-1/paper010-offline.har',
    role: 'paper010_pass1_offline_har',
    category: 'real_browser_validation_evidence',
  },
  {
    path: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-2/paper010-raw-to-report.json',
    role: 'paper010_pass2_reproducible_json',
    category: 'real_browser_validation_evidence',
  },
  {
    path: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-2/paper010-raw-to-report-results.csv',
    role: 'paper010_pass2_results_csv',
    category: 'real_browser_validation_evidence',
  },
  {
    path: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-2/paper010-raw-to-report-report.pdf',
    role: 'paper010_pass2_report_pdf',
    category: 'real_browser_validation_evidence',
  },
  {
    path: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-2/paper010-final-state.png',
    role: 'paper010_pass2_final_ui_screenshot',
    category: 'real_browser_validation_evidence',
  },
  {
    path: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-2/paper010-network-capture.json',
    role: 'paper010_pass2_raw_network_capture',
    category: 'real_browser_validation_evidence',
  },
  {
    path: 'evidence/validation/paper010-raw-to-report-v0.2.0-local/pass-2/paper010-offline.har',
    role: 'paper010_pass2_offline_har',
    category: 'real_browser_validation_evidence',
  },
  {
    path: 'tests/fixture-manifest.test.mjs',
    role: 'complete_fixture_manifest_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/provided-derivative-failclosed.test.ts',
    role: 'provided_derivative_failclosed_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/replicate-regression-contract.test.ts',
    role: 'replicate_regression_contract_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/warning-visibility-contract.test.tsx',
    role: 'warning_visibility_contract_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/warning-visibility-evidence.test.mjs',
    role: 'warning_visibility_evidence_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/scientific-traceability.test.mjs',
    role: 'scientific_traceability_test',
    category: 'verification_test',
  },
  {
    path: 'tests/platform-evidence-record.test.mjs',
    role: 'platform_evidence_record_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/platform-matrix-record.test.mjs',
    role: 'platform_matrix_record_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/platform-human-review-record.test.ts',
    role: 'platform_human_review_record_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/hosted-platform-validation.test.mjs',
    role: 'hosted_platform_validation_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/local-macos-platform-diagnostic.test.mjs',
    role: 'local_macos_diagnostic_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/scientific-review-evidence-record.test.mjs',
    role: 'scientific_review_record_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/external-validation-kit.test.mjs',
    role: 'external_validation_kit_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/scientific-review-package.test.mjs',
    role: 'scientific_review_package_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/release-manifest.test.mjs',
    role: 'release_manifest_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/p0-evidence-ledger.test.mjs',
    role: 'p0_evidence_ledger_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/release-verification-record.test.mjs',
    role: 'release_verification_record_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/known-issues-governance.test.mjs',
    role: 'known_issues_governance_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/release-signoff-record.test.mjs',
    role: 'five_role_release_signoff_verification',
    category: 'verification_test',
  },
  {
    path: 'tests/external-evidence-adjudication.test.mjs',
    role: 'external_evidence_adjudication_verification',
    category: 'verification_test',
  },
  {
    path: 'scripts/verify-offline-bundle.mjs',
    role: 'offline_bundle_verifier',
    category: 'verification_tool',
  },
  {
    path: 'scripts/verify-scientific-traceability.mjs',
    role: 'scientific_traceability_verifier',
    category: 'verification_tool',
  },
  {
    path: 'scripts/compare-scientific-reports.mjs',
    role: 'cross_platform_report_comparator',
    category: 'verification_tool',
  },
  {
    path: 'scripts/platform-hosted-ci.mjs',
    role: 'hosted_platform_ci_contract',
    category: 'verification_tool',
  },
  {
    path: 'scripts/run-hosted-platform-validation.mjs',
    role: 'hosted_platform_browser_harness',
    category: 'validation_automation',
  },
  {
    path: 'scripts/write-hosted-workflow-preflight.mjs',
    role: 'hosted_platform_early_failure_diagnostic_writer',
    category: 'validation_automation',
  },
  {
    path: 'scripts/run-local-macos-platform-diagnostic.mjs',
    role: 'local_macos_browser_diagnostic',
    category: 'validation_automation',
  },
  {
    path: 'scripts/verify-local-macos-diagnostic.mjs',
    role: 'local_macos_diagnostic_verifier',
    category: 'verification_tool',
  },
  {
    path: 'scripts/capture-warning-visibility-evidence.mjs',
    role: 'warning_visibility_evidence_capture',
    category: 'validation_automation',
  },
  {
    path: 'scripts/create-platform-evidence-record.mjs',
    role: 'platform_evidence_recorder',
    category: 'provenance_tool',
  },
  {
    path: 'scripts/create-platform-matrix-record.mjs',
    role: 'platform_matrix_recorder',
    category: 'provenance_tool',
  },
  {
    path: 'scripts/record-platform-human-review.mjs',
    role: 'platform_human_review_recorder',
    category: 'provenance_tool',
  },
  {
    path: 'scripts/record-platform-human-review.d.mts',
    role: 'platform_human_review_recorder_types',
    category: 'governance_contract',
  },
  {
    path: 'scripts/record-usability-study.mjs',
    role: 'usability_study_evidence_recorder',
    category: 'provenance_tool',
  },
  {
    path: 'scripts/record-scientific-review.mjs',
    role: 'scientific_review_record_generator',
    category: 'provenance_tool',
  },
  {
    path: 'scripts/p0-evidence-ledger.mjs',
    role: 'p0_evidence_ledger_generator',
    category: 'provenance_tool',
  },
  {
    path: 'scripts/record-release-verification.mjs',
    role: 'release_verification_run_recorder',
    category: 'provenance_tool',
  },
  {
    path: 'scripts/generate-known-issues.mjs',
    role: 'known_issues_ledger_generator',
    category: 'provenance_tool',
  },
  {
    path: 'scripts/record-release-signoff.mjs',
    role: 'five_role_release_signoff_recorder',
    category: 'provenance_tool',
  },
  {
    path: 'scripts/adjudicate-external-evidence.mjs',
    role: 'external_evidence_adjudication_recorder',
    category: 'provenance_tool',
  },
  {
    path: 'scripts/generate-external-validation-kit.mjs',
    role: 'external_validation_kit_generator',
    category: 'provenance_tool',
  },
  {
    path: 'scripts/derive_paper010_fixture.mjs',
    role: 'real_fixture_derivation',
    category: 'provenance_tool',
  },
  {
    path: 'scripts/run-paper010-oracle.mjs',
    role: 'independent_real_oracle_launcher',
    category: 'verification_tool',
  },
  {
    path: 'scripts/generate-fixture-manifest.mjs',
    role: 'complete_fixture_manifest_generator',
    category: 'provenance_tool',
  },
  {
    path: 'scripts/generate-corpus-integrity-ledger.mjs',
    role: 'corpus_integrity_ledger_generator',
    category: 'provenance_tool',
  },
  {
    path: 'scripts/generate-usability-fixtures.mjs',
    role: 'usability_fixture_generator',
    category: 'provenance_tool',
  },
  {
    path: 'scripts/generate-scientific-review-package.mjs',
    role: 'scientific_review_package_generator',
    category: 'provenance_tool',
  },
  {
    path: 'scripts/generate-report-qa.mjs',
    role: 'pdf_qa_artifact_generator',
    category: 'verification_tool',
  },
  {
    path: 'output/pdf/activation-energy-report-schema-v4-qa.pdf',
    role: 'schema_v4_pdf_qa_artifact',
    category: 'visual_qa_artifact',
  },
  {
    path: 'release/Platform-Golden-synthetic_kas_150.csv',
    role: 'platform_golden_fixture',
    category: 'validation_fixture',
  },
  {
    path: 'release/SHA256SUMS.txt',
    role: 'release_checksum_index',
    category: 'release_integrity',
  },
  {
    path: 'release/README.md',
    role: 'release_readme',
    category: 'release_documentation',
  },
  {
    path: 'package.json',
    role: 'npm_package_contract',
    category: 'build_integrity',
  },
  {
    path: 'package-lock.json',
    role: 'npm_dependency_lock',
    category: 'build_integrity',
  },
  {
    path: '.node-version',
    role: 'node_runtime_lock',
    category: 'build_integrity',
  },
  {
    path: '.gitattributes',
    role: 'source_control_line_ending_policy',
    category: 'build_integrity',
  },
  {
    path: '.gitignore',
    role: 'source_control_ignore_policy',
    category: 'build_integrity',
  },
  {
    path: 'scripts/generate-release-manifest.mjs',
    role: 'release_manifest_generator',
    category: 'provenance_tool',
  },
  {
    path: 'vite.config.ts',
    role: 'scientific_build_fingerprint_definition',
    category: 'build_integrity',
  },
]);

const CLAIM_BOUNDARIES = Object.freeze([
  {
    id: 'apparent_activation_energy',
    statement: 'Outputs are sample-, process/stage-, atmosphere-, method-, and conversion-range-specific apparent activation energies; they are not a single immutable material constant or proof of a one-step mechanism.',
    evidence: [
      '00_MISSION_LOCK.md',
      '01_SCIENTIFIC_SPEC_V1.md',
      '02_ACCEPTANCE_CRITERIA.md',
      'src/report/project-report.schema.json',
      'tests/report-contract.test.ts',
    ],
  },
  {
    id: 'regression_only_uncertainty',
    statement: 'Reported confidence intervals cover post-aggregation regression scatter only and exclude within-heating-rate replicate variability, calibration, anchor, baseline, derivative-method, and other experimental or model-form uncertainty.',
    evidence: [
      '01_SCIENTIFIC_SPEC_V1.md',
      '02_ACCEPTANCE_CRITERIA.md',
      'src/report/project-report.schema.json',
      'tests/regression-ci-boundary-contract.test.tsx',
      'PDF_REPORT_VISUAL_QA.md',
    ],
  },
  {
    id: 'real_data_reproduction',
    statement: 'Five official real-data lanes now match application-independent high-precision references within declared method and preprocessing boundaries. Paper 010 raw XLSX reproduces its Decimal(50) software oracle while retaining the unreproduced publication Table 4/S4 Friedman inconsistency. Chilean Oak Mendeley v2 raw CSV reproduces a separate Decimal(50) oracle plus an independently entered alpha=0.50 hand check; Oak FWO matches Table 3, KAS strongly indicates misapplication of the FWO-only 1.052 coefficient, and Friedman retains an unresolved publication/preprocessing discrepancy. NR-CELS pinned Zenodo v1 TG/dTG archives reproduce the deposited-dTG Friedman oracle through the production wide-series path while proprietary Kinetics Neo preprocessing remains diagnostic only. Dryad LPI-01 official traces reproduce FWO/KAS/Friedman references while the HBPI-01/HBPI-03 Table 3 cross-sample cells are quarantined. Coal-SPT-paraffin Mendeley v1 nominal-10 mg replicates reproduce grouped FWO/KAS/Friedman references while incomplete/mislabeled v2 and copied publication cells remain quarantined. Publication values are comparison evidence, never hard-coded truth, and these bounded lanes do not establish universal material or preprocessing validity.',
    evidence: [
      'REAL_DATA_VALIDATION_GOAL.md',
      'evidence/validation/REAL_DATA_VALIDATION_FINAL_REPORT.md',
      'REAL_DATA_VALIDATION_STATUS.md',
      'evidence/validation/oak-local/OAK_LOCAL_VALIDATION_REPORT.md',
      'evidence/validation/oak-publication-audit/OAK_PUBLICATION_AUDIT.md',
      'SECOND_RAW_DATASET_SEARCH.md',
      'tests/fixtures/real/manifest.json',
      'tests/fixtures/real/oracle/paper010_decimal_oracle.py',
      'tests/paper010-oracle-reproducibility.test.mjs',
      'tests/real-data-validation.test.ts',
      'tests/fixtures/real/oak/manifest.json',
      'tests/fixtures/real/oak/oracle/oak_decimal_oracle.py',
      'tests/oak-oracle-reproducibility.test.mjs',
      'tests/oak-raw-wide-series.test.ts',
      'tests/oak-manual-adjudication.test.ts',
      'tests/fixtures/real/nr-cels/source/TG_DTG_DTA_data.zip',
      'tests/fixtures/real/nr-cels/source/Kinetic_data.zip',
      'tests/fixtures/real/nr-cels/manifest/nr-cels-validation-manifest.json',
      'tests/fixtures/real/nr-cels/oracle/nr_cels_friedman_oracle.py',
      'tests/fixtures/real/nr-cels/oracle/expected-output.json',
      'tests/fixtures/real/nr-cels/manual/nr-cels-adjudication.json',
      'evidence/validation/nr-cels/NR_CELS_VALIDATION.md',
      'tests/nr-cels-oracle-reproducibility.test.mjs',
      'tests/nr-cels-wide-production-oracle.test.ts',
      'tests/fixtures/real/dryad-polyisoprene/source/Data.zip',
      'tests/fixtures/real/dryad-polyisoprene/manifest.json',
      'tests/fixtures/real/dryad-polyisoprene/oracle/dryad_polyisoprene_decimal_oracle.py',
      'tests/fixtures/real/dryad-polyisoprene/expected-output.json',
      'tests/fixtures/real/dryad-polyisoprene/manual/hbpi-table3-swap-adjudication.json',
      'evidence/validation/dryad-polyisoprene/DRYAD_POLYISOPRENE_VALIDATION.md',
      'tests/dryad-polyisoprene-oracle-reproducibility.test.mjs',
      'tests/dryad-polyisoprene-production-core.test.ts',
      'tests/fixtures/real/coal-spt-paraffin/source/TGA raw data of coal, SPT and paraffin at different masses.xlsx',
      'tests/fixtures/real/coal-spt-paraffin/manifest.json',
      'tests/fixtures/real/coal-spt-paraffin/oracle/coal_spt_paraffin_decimal_oracle.py',
      'tests/fixtures/real/coal-spt-paraffin/expected-output.json',
      'evidence/validation/coal-spt-paraffin/MANUAL_ADJUDICATION.md',
      'evidence/validation/coal-spt-paraffin/VALIDATION_REPORT.md',
      'tests/coal-spt-paraffin-oracle-reproducibility.test.mjs',
      'tests/coal-spt-paraffin-validation.test.ts',
    ],
  },
  {
    id: 'offline_scope',
    statement: 'Static one-file verification and jsdom guards are supplemented by a current direct-macOS real-Chrome automated run: file: document load, navigator.onLine=false, one retained local document request, zero external requests, and JSON/CSV/PDF/PNG artifacts are hash-locked. This is local automated technical evidence only; it is not a human-reviewed platform record and does not prove Windows 11 or Ubuntu behavior.',
    evidence: [
      'OFFLINE_BUNDLE_VERIFICATION.md',
      'scripts/verify-offline-bundle.mjs',
      'tests/runtime-offline-app.test.tsx',
      'BROWSER_VALIDATION_ATTEMPT.md',
      'evidence/platform/local-macos/v0.2.0-current-release/LOCAL_MACOS_DIAGNOSTIC_MANIFEST.json',
      'scripts/verify-local-macos-diagnostic.mjs',
      'tests/local-macos-platform-diagnostic.test.mjs',
    ],
  },
  {
    id: 'platform_scope',
    statement: 'The current release completed the separately labelled direct-macOS/Chrome automated golden flow with retained self-test, exports, CDP-derived HAR, screenshot, and an exact integrity manifest. The human-review recorder, comparator, three-OS matrix recorder, and fixed GitHub-hosted workflow remain prepared but NOT YET RUN across all target systems; the local diagnostic does not replace human HAR/image/PDF review and does not establish Windows 11, macOS, or Ubuntu platform PASS.',
    evidence: [
      'CURRENT_VALIDATION_STATUS.md',
      'PLATFORM_VALIDATION_PROTOCOL.md',
      'HOSTED_PLATFORM_VALIDATION.md',
      '.github/workflows/platform-validation.yml',
      'BROWSER_VALIDATION_ATTEMPT.md',
      'scripts/compare-scientific-reports.mjs',
      'scripts/platform-hosted-ci.mjs',
      'scripts/run-hosted-platform-validation.mjs',
      'scripts/write-hosted-workflow-preflight.mjs',
      'scripts/run-local-macos-platform-diagnostic.mjs',
      'scripts/verify-local-macos-diagnostic.mjs',
      'scripts/create-platform-evidence-record.mjs',
      'scripts/create-platform-matrix-record.mjs',
      'scripts/record-platform-human-review.mjs',
      'tests/platform-evidence-record.test.mjs',
      'tests/platform-matrix-record.test.mjs',
      'tests/platform-human-review-record.test.ts',
      'tests/hosted-platform-validation.test.mjs',
      'tests/local-macos-platform-diagnostic.test.mjs',
      'tests/platform-evidence-app-integration.test.ts',
      'src/platformSelfTest.ts',
      'tests/platform-self-test.test.ts',
      'tests/platform-self-test-ui.test.tsx',
      'evidence/platform/local-macos/v0.2.0-current-release/LOCAL_MACOS_DIAGNOSTIC_MANIFEST.json',
      'release/Platform-Golden-synthetic_kas_150.csv',
      'release/Platform-Locale-English-dot.csv',
      'release/Platform-Locale-Turkish-comma.csv',
      'release/Platform-Locale-Mixed-invalid.csv',
    ],
  },
  {
    id: 'usability_scope',
    statement: 'The 11-fixture study bundle, 11-activation guided PDF path, full technical-English diagnostic copy, warning visibility, separate Ea(alpha)/Kissinger surface, exact 100% zoom, screen/audio recording hashes, task timecodes, and seeded blind second-rating selection are contract-tested, but the independent n=5 protocol is NOT YET RUN; media structure checks are not observed human comprehension or recording-content evidence.',
    evidence: [
      'CURRENT_VALIDATION_STATUS.md',
      'USABILITY_VALIDATION_PROTOCOL.md',
      'evidence/usability/v0.2.0/UX_FIXTURE_MANIFEST.json',
      'scripts/generate-usability-fixtures.mjs',
      'scripts/record-usability-study.mjs',
      'tests/usability-fixture-bundle.test.ts',
      'tests/result-type-comprehension.test.tsx',
      'tests/diagnostic-copy-coverage.test.ts',
      'tests/runtime-offline-app.test.tsx',
      'tests/warning-visibility-contract.test.tsx',
      'tests/usability-study-evidence-record.test.mjs',
    ],
  },
  {
    id: 'scientific_review_scope',
    statement: 'The independent sign-off protocol, runbook, hash-locked unsigned package, exact 35-decision structured template, and fail-closed review recorder verify evidence hashes, decision completeness, COI declarations, dispositions, and signed-artifact structure. They do not authenticate reviewer identity or signature; no qualified external reviewer has signed it, so AC-SCI-03 and AC-VAL-05 remain PARTIAL.',
    evidence: [
      'CURRENT_VALIDATION_STATUS.md',
      'SCIENTIFIC_REVIEW_SIGNOFF_PROTOCOL.md',
      'SCIENTIFIC_REVIEW_RUNBOOK.md',
      'scripts/record-scientific-review.mjs',
      'tests/scientific-review-evidence-record.test.mjs',
      'scripts/generate-scientific-review-package.mjs',
      'tests/scientific-review-package.test.mjs',
    ],
  },
  {
    id: 'release_governance_scope',
    statement: 'The release-governance layer deterministically maps all 72 P0 criteria to current hash-bound technical evidence, preserves 64 PROVEN and eight EXTERNAL_OPEN dispositions, records severity-tagged known issues, captures the exact npm run check log, and requires five role-specific signatures. A separate fail-closed adjudication recorder now binds the three returned external-evidence lanes and exactly eight human gate decisions without authenticating identity, applying gates, editing known issues, or declaring a validated MVP. Open platform, reviewer, and usability evidence still blocks validated-MVP eligibility.',
    evidence: [
      '02_ACCEPTANCE_CRITERIA.md',
      'CURRENT_VALIDATION_STATUS.md',
      'EXTERNAL_EVIDENCE_ADJUDICATION_PROTOCOL.md',
      'evidence/governance/P0_EVIDENCE_MAP.v0.2.0.json',
      'governance/KNOWN_ISSUES.json',
      'governance/KNOWN_ISSUES.schema.json',
      'governance/RELEASE_SIGNOFF_INPUT.schema.json',
      'governance/EXTERNAL_EVIDENCE_ADJUDICATION_INPUT.schema.json',
      'scripts/p0-evidence-ledger.mjs',
      'scripts/record-release-verification.mjs',
      'scripts/generate-known-issues.mjs',
      'scripts/record-release-signoff.mjs',
      'scripts/adjudicate-external-evidence.mjs',
      'tests/p0-evidence-ledger.test.mjs',
      'tests/release-verification-record.test.mjs',
      'tests/known-issues-governance.test.mjs',
      'tests/release-signoff-record.test.mjs',
      'tests/external-evidence-adjudication.test.mjs',
    ],
  },
  {
    id: 'external_validation_handoff_scope',
    statement: 'The deterministic external-validation ZIP packages locked inputs, protocols, fail-closed templates, native hash helpers, recorders, and the unsigned review package. Generating or structurally verifying the kit is logistics evidence only; it does not prove that any OS run, human session, or independent review occurred.',
    evidence: [
      'CURRENT_VALIDATION_STATUS.md',
      'scripts/generate-external-validation-kit.mjs',
      'tests/external-validation-kit.test.mjs',
      'PLATFORM_VALIDATION_PROTOCOL.md',
      'USABILITY_VALIDATION_PROTOCOL.md',
      'SCIENTIFIC_REVIEW_SIGNOFF_PROTOCOL.md',
      'EXTERNAL_EVIDENCE_ADJUDICATION_PROTOCOL.md',
    ],
  },
  {
    id: 'corpus_scope',
    statement: 'The local evidence base contains 231 hash-locked source PDF records: 230 primary PDFs and one supplementary PDF. Exact 001-231 extraction accounting and a non-destructive repair ledger for 30 blank method-matrix IDs are verified; 231 distinct articles and per-item Q1/Q2 status are NOT locally verified.',
    evidence: [
      '00_MISSION_LOCK.md',
      'SCIENTIFIC_TRACEABILITY_REPORT.md',
      'evidence/corpus/CORPUS_INTEGRITY_LEDGER.json',
      '../01_PDF_Evidence_Extraction/00_Start_Here/paper_processing_order.csv',
      '../01_PDF_Evidence_Extraction/05_Canonical_Evidence_Table/activation_energy_evidence.csv',
      '../01_PDF_Evidence_Extraction/06_Method_Evidence_Matrix/method_evidence_matrix.csv',
      'scripts/generate-corpus-integrity-ledger.mjs',
      'tests/corpus-integrity-ledger.test.mjs',
      'scripts/verify-scientific-traceability.mjs',
      'tests/scientific-traceability.test.mjs',
    ],
  },
  {
    id: 'release_completion_scope',
    statement: 'This artifact is a serious working research MVP, not a fully P0-validated scientific release and not evidence that it works on every computer.',
    evidence: [
      '00_MISSION_LOCK.md',
      '02_ACCEPTANCE_CRITERIA.md',
      'CURRENT_VALIDATION_STATUS.md',
      'governance/KNOWN_ISSUES.json',
    ],
  },
]);

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function requiredCapture(text, pattern, description) {
  const match = text.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Could not extract ${description}.`);
  }
  return match[1].trim();
}

function extractStatus(projectRoot) {
  const currentPath = path.resolve(projectRoot, 'CURRENT_VALIDATION_STATUS.md');
  const realDataPath = path.resolve(projectRoot, 'REAL_DATA_VALIDATION_STATUS.md');
  const offlinePath = path.resolve(projectRoot, 'OFFLINE_BUNDLE_VERIFICATION.md');
  const current = readFileSync(currentPath, 'utf8');
  const realData = readFileSync(realDataPath, 'utf8');
  const offline = readFileSync(offlinePath, 'utf8');
  const platformProtocol = readFileSync(
    path.resolve(projectRoot, 'PLATFORM_VALIDATION_PROTOCOL.md'),
    'utf8',
  );
  const usabilityProtocol = readFileSync(
    path.resolve(projectRoot, 'USABILITY_VALIDATION_PROTOCOL.md'),
    'utf8',
  );

  const gateCount = (label) => Number(requiredCapture(
    current,
    new RegExp(`\\|\\s*(?:\\*\\*)?${label.replace(' ', '\\s+')}(?:\\*\\*)?\\s*\\|\\s*\\*?\\*?(\\d+)`),
    `${label} P0 gate count`,
  ));

  const pass = gateCount('PASS');
  const partial = gateCount('PARTIAL');
  const notTested = gateCount('NOT TESTED');
  const total = gateCount('Toplam');
  if (pass + partial + notTested !== total) {
    throw new Error(
      `P0 gate counts are inconsistent: ${pass} + ${partial} + ${notTested} != ${total}.`,
    );
  }

  if (!/static offline-bundle PASS/i.test(offline)) {
    throw new Error('Offline verification report does not contain the expected static PASS boundary.');
  }
  if (
    !/a direct local macOS\/Chrome automated diagnostic is retained/i.test(
      platformProtocol,
    ) ||
    !/has not yet completed the human-reviewed macOS or real hosted Windows 11\/macOS\/Ubuntu 24\.04 matrix required to close the gates/i.test(
      platformProtocol,
    )
  ) {
    throw new Error(
      'Platform protocol no longer separates the retained local diagnostic from the open human/hosted matrix boundary.',
    );
  }
  if (!/NOT YET RUN/i.test(usabilityProtocol)) {
    throw new Error('Usability protocol no longer records the expected NOT YET RUN boundary.');
  }

  const auditDate = requiredCapture(
    current,
    /^\*\*[^*\r\n]+:\*\*\s*(\d{4}-\d{2}-\d{2})/m,
    'current-validation audit date',
  );
  const verdict = requiredCapture(
    current,
    /^\*\*[^*\r\n]+:\*\*\s*\*\*((?:PARTIAL|PASS|FAIL)[^\r\n]+?)\*\*/m,
    'current-validation verdict',
  );
  const realDataDecision = requiredCapture(
    realData,
    /\*\*Status:\*\*\s*\*\*([^\r\n]+?)\*\*/,
    'real-data validation decision',
  );

  return {
    releaseClassification: 'PARTIAL_RESEARCH_MVP',
    fullyP0ValidatedScientificRelease: false,
    currentValidation: {
      auditDate,
      verdict,
      p0Gates: {
        pass,
        partial,
        notTested,
        total,
      },
      source: 'CURRENT_VALIDATION_STATUS.md',
    },
    realData: {
      decision: realDataDecision,
      softwareValidation: 'PASS',
      exactPublicationTableReproduction: 'NOT_ACHIEVED',
      source: 'REAL_DATA_VALIDATION_STATUS.md',
    },
    offline: {
      staticBundle: 'PASS',
      jsdomAppPathGuard: 'PRESENT_NOT_REAL_BROWSER_PROOF',
      runtimeZeroRequest:
        'PROVEN_LOCAL_AUTOMATED_MACOS_NOT_HUMAN_REVIEWED',
      sources: [
        'OFFLINE_BUNDLE_VERIFICATION.md',
        'BROWSER_VALIDATION_ATTEMPT.md',
        'evidence/platform/local-macos/v0.2.0-current-release/LOCAL_MACOS_DIAGNOSTIC_MANIFEST.json',
      ],
    },
    platforms: {
      protocol: 'PREPARED_HOSTED_MATRIX_NOT_YET_RUN',
      macOS: 'LOCAL_AUTOMATED_DIAGNOSTIC_NOT_PLATFORM_PASS',
      windows11: 'NOT_TESTED',
      ubuntu24_04: 'NOT_TESTED',
      sources: [
        'CURRENT_VALIDATION_STATUS.md',
        'PLATFORM_VALIDATION_PROTOCOL.md',
      ],
    },
    independentUsability: {
      status: 'PROTOCOL_APPROVED_NOT_YET_RUN',
      sources: [
        'CURRENT_VALIDATION_STATUS.md',
        'USABILITY_VALIDATION_PROTOCOL.md',
      ],
    },
  };
}

function evidenceEntry(projectRoot, descriptor) {
  const absolutePath = path.resolve(projectRoot, descriptor.path);
  if (!existsSync(absolutePath)) {
    throw new Error(`Required release evidence is missing: ${descriptor.path}`);
  }
  const stats = statSync(absolutePath);
  if (!stats.isFile()) {
    throw new Error(`Required release evidence is not a file: ${descriptor.path}`);
  }
  const bytes = readFileSync(absolutePath);
  return {
    path: descriptor.path,
    role: descriptor.role,
    category: descriptor.category,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

function verifyReleaseChecksumIndex(projectRoot, evidence) {
  const checksumPath = path.resolve(projectRoot, 'release/SHA256SUMS.txt');
  const checksumIndex = readFileSync(checksumPath, 'utf8');
  if (checksumIndex.includes(MANIFEST_RELATIVE_PATH)
      || checksumIndex.includes(path.basename(MANIFEST_RELATIVE_PATH))) {
    throw new Error('release/SHA256SUMS.txt must not hash the manifest because the manifest hashes SHA256SUMS.txt.');
  }

  for (const role of ['release_html', 'platform_golden_fixture']) {
    const entry = evidence.find((candidate) => candidate.role === role);
    if (!entry) throw new Error(`Missing checksum-index evidence role: ${role}`);
    const expectedLine = `${entry.sha256}  ${path.basename(entry.path)}`;
    if (!checksumIndex.split(/\r?\n/).includes(expectedLine)) {
      throw new Error(`release/SHA256SUMS.txt is stale or missing: ${expectedLine}`);
    }
  }
}

export function buildManifest(projectRoot) {
  const resolvedRoot = path.resolve(projectRoot);
  const evidence = EVIDENCE_FILES.map((descriptor) => evidenceEntry(resolvedRoot, descriptor));
  verifyReleaseChecksumIndex(resolvedRoot, evidence);
  const releaseArtifact = evidence.find((entry) => entry.role === 'release_html');
  if (!releaseArtifact) {
    throw new Error('Release artifact descriptor is missing.');
  }

  return {
    schema: MANIFEST_SCHEMA,
    release: {
      name: 'Activation Energy Studio',
      version: RELEASE_VERSION,
      artifact: releaseArtifact.path,
      bytes: releaseArtifact.bytes,
      sha256: releaseArtifact.sha256,
    },
    status: extractStatus(resolvedRoot),
    claimBoundaries: CLAIM_BOUNDARIES,
    evidence,
    generation: {
      generator: 'scripts/generate-release-manifest.mjs',
      command: 'node scripts/generate-release-manifest.mjs',
      checkCommand: 'node scripts/generate-release-manifest.mjs --check',
      deterministic: true,
      generatedAtOmitted: true,
      hashAlgorithm: 'sha256',
      hashInput: 'raw_file_bytes',
      evidenceOrdering: 'fixed_by_generator',
      manifestPath: MANIFEST_RELATIVE_PATH,
      selfHashExcluded: true,
      excludedFromHashSet: [MANIFEST_RELATIVE_PATH],
      circularityRule: 'release/SHA256SUMS.txt is hashed by this manifest and therefore must not list this manifest',
    },
  };
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function parseArguments(argv) {
  const defaultProjectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const options = {
    projectRoot: defaultProjectRoot,
    output: null,
    check: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--project-root') {
      options.projectRoot = path.resolve(requireValue(argv, ++index, argument));
    } else if (argument === '--output') {
      options.output = requireValue(argv, ++index, argument);
    } else if (argument === '--check') {
      options.check = true;
    } else if (argument === '--help' || argument === '-h') {
      printHelp();
      return null;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage: node scripts/generate-release-manifest.mjs [options]

Options:
  --project-root <path>  Project root (default: parent of scripts/)
  --output <path>        Output path, relative to project root or absolute
                         (default: ${MANIFEST_RELATIVE_PATH})
  --check                Verify that the existing manifest is byte-current
  -h, --help             Show this help

The manifest hashes its evidence inputs but deliberately excludes itself.
No generation timestamp is recorded, so identical inputs produce identical bytes.
`);
}

function runCli(argv) {
  const options = parseArguments(argv);
  if (!options) return;

  const outputPath = path.resolve(
    options.projectRoot,
    options.output ?? MANIFEST_RELATIVE_PATH,
  );
  const manifest = buildManifest(options.projectRoot);
  const serialized = serializeManifest(manifest);

  if (options.check) {
    if (!existsSync(outputPath)) {
      console.error(`FAIL RELEASE_MANIFEST_MISSING ${outputPath}`);
      process.exitCode = 1;
      return;
    }
    const existing = readFileSync(outputPath, 'utf8');
    if (existing !== serialized) {
      console.error(`FAIL RELEASE_MANIFEST_STALE ${outputPath}`);
      process.exitCode = 1;
      return;
    }
    console.log(`PASS RELEASE_MANIFEST_CURRENT ${outputPath}`);
    console.log(`RELEASE_HTML_SHA256 ${manifest.release.sha256}`);
    return;
  }

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serialized, 'utf8');
  console.log(`WROTE RELEASE_MANIFEST ${outputPath}`);
  console.log(`RELEASE_HTML_SHA256 ${manifest.release.sha256}`);
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(`ERROR RELEASE_MANIFEST_GENERATION ${error.message}`);
    process.exitCode = 1;
  }
}
