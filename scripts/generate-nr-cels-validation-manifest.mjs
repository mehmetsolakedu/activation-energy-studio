#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const FIXTURE_ROOT = path.resolve(
  PROJECT_ROOT,
  'tests/fixtures/real/nr-cels',
);
const EXPECTED_PATH = path.resolve(
  FIXTURE_ROOT,
  'oracle/expected-output.json',
);
const MANIFEST_PATH = path.resolve(
  FIXTURE_ROOT,
  'manifest/nr-cels-validation-manifest.json',
);

function fileLock(absolutePath, relativePath, role) {
  const bytes = readFileSync(absolutePath);
  return {
    path: relativePath,
    role,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function fixtureLock(relativePath, role) {
  return fileLock(
    path.resolve(FIXTURE_ROOT, relativePath),
    relativePath,
    role,
  );
}

function supportingLock(relativePath, role) {
  return fileLock(
    path.resolve(PROJECT_ROOT, relativePath),
    relativePath,
    role,
  );
}

export function buildNrCelsValidationManifest() {
  const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8'));
  const sourceFiles = [
    ...expected.source.archiveAudit.archives.map((archive) =>
      fixtureLock(
        `source/${archive.path}`,
        'immutable_official_zenodo_v1_archive',
      )),
    ...expected.source.curveAudits.map((curve) =>
      fixtureLock(
        `source/${curve.path}`,
        'exact_official_archive_member_composite_curve',
      )),
    ...expected.source.allKineticFiles.map((kinetic) =>
      fixtureLock(
        `source/${kinetic.path}`,
        'exact_official_archive_member_kinetic_export',
      )),
  ];
  const files = [
    ...sourceFiles,
    fixtureLock(
      'oracle/nr_cels_friedman_oracle.py',
      'independent_standard_library_decimal_oracle',
    ),
    fixtureLock(
      'oracle/expected-output.json',
      'byte_locked_independent_oracle_output',
    ),
    fixtureLock(
      'manual/nr-cels-adjudication.json',
      'manual_source_publication_and_production_adjudication',
    ),
  ];
  const supportingEvidence = [
    supportingLock(
      'evidence/validation/nr-cels/NR_CELS_VALIDATION.md',
      'validation_protocol_findings_and_reproduction_commands',
    ),
    supportingLock(
      'evidence/validation/nr-cels/source_file_manifest.csv',
      'human_readable_source_hash_and_semantic_manifest',
    ),
    supportingLock(
      'evidence/validation/nr-cels/friedman_reconstruction_summary.csv',
      'six_method_sample_summary_rows',
    ),
    supportingLock(
      'evidence/validation/nr-cels/friedman_all_alpha_comparison.csv',
      'all_546_independent_vs_deposited_alpha_rows',
    ),
    supportingLock(
      'scripts/run-nr-cels-friedman-oracle.mjs',
      'dedicated_isolated_oracle_runner',
    ),
    supportingLock(
      'scripts/generate-nr-cels-validation-evidence.mjs',
      'deterministic_evidence_generator_and_checker',
    ),
    supportingLock(
      'scripts/generate-nr-cels-validation-manifest.mjs',
      'deterministic_dedicated_manifest_generator_and_checker',
    ),
    supportingLock(
      'tests/nr-cels-source-integrity.test.mjs',
      'focused_archive_hash_encoding_header_and_grid_integrity_test',
    ),
    supportingLock(
      'tests/nr-cels-oracle-reproducibility.test.mjs',
      'focused_oracle_and_manual_adjudication_reproducibility_test',
    ),
    supportingLock(
      'tests/nr-cels-wide-production-oracle.test.ts',
      'wide_series_production_vs_independent_dtg_all_alpha_test',
    ),
  ];
  return {
    schema: 'activation-energy-studio/nr-cels-validation-manifest/v1',
    fixtureId: expected.fixtureId,
    classification: 'diagnostic-reconstruction-with-production-comparison',
    lockedAt: '2026-07-29',
    sourceMetadata: {
      datasetVersionDoi: expected.source.datasetVersionDoi,
      datasetVersionRecord: expected.source.datasetVersionRecord,
      datasetConceptDoi: expected.source.datasetConceptDoi,
      currentConceptLatestRecord: expected.source.currentConceptLatestRecord,
      currentConceptLatestContainsRawArchives:
        expected.source.conceptLatestContainsRawArchives,
      articleDoi: expected.source.articleDoi,
      license: expected.source.license,
      retainedCompositeCurveCount: expected.source.curveAudits.length,
      retainedKineticExportCount: expected.source.allKineticFiles.length,
      heatingRatesKPerMin: [2, 4, 6, 8, 10, 20],
      samplesPhr: [30, 45, 55],
      intentionallyUnretainedSingleRateMembers:
        expected.source.archiveAudit.intentionallyUnretainedSingleRateMembers,
    },
    validationContract: {
      alphaValues: expected.recipe.alphaValues,
      independentMethods: ['DEPOSITED_DTG', 'TG_LOCAL_LINEAR_7'],
      productionAcceptanceMethod: 'DEPOSITED_DTG',
      productionPath:
        'wide-series massPercent with explicit 100/minimum-TG anchors and signed deposited dTG as massChangeRate',
      productionAlphaComparisonCount: 273,
      productionComparisonTolerances: {
        energyAbsoluteKJPerMol: 2e-9,
        regressionSlopeAbsoluteK: 2e-7,
        regressionInterceptAbsolute: 2e-10,
        regressionRSquaredAbsolute: 2e-12,
        regressionN: 6,
      },
      depositedSeriesRmseUpperBoundsKJPerMol: {
        30: 4,
        45: 10,
        55: 10,
      },
      publicationValuesAreHardOracle: false,
      explicitRecipeOutputsAreHardOracle: true,
      noSortingExtrapolationMonotonicRepairOrSourceMutation: true,
    },
    expectedRmseVsDepositedKJPerMol: Object.fromEntries(
      Object.entries(expected.samples).map(([sample, result]) => [
        sample,
        Object.fromEntries(
          Object.entries(result.methods).map(([method, value]) => [
            method,
            value.summary.rmseVsPublishedKJPerMol,
          ]),
        ),
      ]),
    ),
    conceptDoiAdjudication:
      'Pin version record 16939440. The concept DOI currently resolves to article-only record 18176373 without the two source archives.',
    knownHumanProducedSourceIssues: [
      {
        code: 'DATASET_TITLE_FILLER_RANGE',
        disposition:
          'Metadata says 30-50 phr; article and retained files are 30, 45, and 55 phr.',
      },
      {
        code: 'NR_CELS_45_MAXIMUM_TRANSPOSED',
        disposition:
          'Publication 334.986 conflicts with deposited maximum 334.968 kJ/mol at alpha 0.68.',
      },
      {
        code: 'NR_CELS_30_MODEL_N_ROUNDING_OR_VERSION',
        disposition:
          'Publication model n=2.175 conflicts with deposited export n=2.176.',
      },
      {
        code: 'PROCESSED_RAW_EXPORTS',
        disposition:
          'Every curve is blank-subtracted and some TG/dTG columns are marked smoothed.',
      },
      {
        code: 'VARIABLE_TG_DTG_COLUMN_ORDER',
        disposition:
          'Resolve TG and dTG from exact headers; physical positions change across files.',
      },
    ],
    missingAuthorPipeline: expected.adjudication.missingAuthorPipeline,
    files,
    supportingEvidence,
    promotionRule:
      'This lane may support production regression only through the declared wide-series deposited-dTG semantics; exact Kinetics Neo raw-pipeline parity remains quarantined.',
    rebaselinePolicy:
      'Any source byte, archive member, header semantic, recipe, oracle, expected output, manual adjudication, test, or evidence change requires a written scientific reason and a fresh audit.',
  };
}

export function generateNrCelsValidationManifest({ check = false } = {}) {
  const output = `${JSON.stringify(
    buildNrCelsValidationManifest(),
    null,
    2,
  )}\n`;
  if (check) {
    let actual;
    try {
      actual = readFileSync(MANIFEST_PATH, 'utf8');
    } catch {
      actual = undefined;
    }
    if (actual !== output) {
      throw new Error('NR_CELS_VALIDATION_MANIFEST_MISMATCH');
    }
  } else {
    writeFileSync(MANIFEST_PATH, output, 'utf8');
  }
}

function isMainModule() {
  const entry = process.argv[1];
  return Boolean(entry)
    && pathToFileURL(path.resolve(entry)).href === import.meta.url;
}

if (isMainModule()) {
  const check = process.argv.includes('--check');
  const write = process.argv.includes('--write');
  if (check === write) {
    process.stderr.write('Use exactly one of --write or --check.\n');
    process.exitCode = 2;
  } else {
    try {
      generateNrCelsValidationManifest({ check });
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  }
}
