#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { unzipSync, zipSync } from 'fflate';

import {
  MANIFEST_RELATIVE_PATH as RELEASE_MANIFEST_RELATIVE_PATH,
  buildManifest as buildReleaseManifest,
  serializeManifest as serializeReleaseManifest,
} from './generate-release-manifest.mjs';
import {
  verifyReviewPackage,
} from './generate-scientific-review-package.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '0.2.0';
const KIT_NAME = `Activation-Energy-Studio-External-Validation-Kit-v${VERSION}`;
const OUTPUT_ROOT = resolve(PROJECT_ROOT, 'output');
const OUTPUT_DIR = resolve(OUTPUT_ROOT, `external-validation-kit-v${VERSION}`);
const ARCHIVE_PATH = resolve(OUTPUT_ROOT, `${KIT_NAME}.zip`);
const ARCHIVE_SHA_PATH = `${ARCHIVE_PATH}.sha256`;
const OWNER_FILE = '.external-validation-kit-owner.json';
const OWNER_SCHEMA = 'activation-energy-studio/external-validation-kit-owner/v1';
const MANIFEST_SCHEMA = 'activation-energy-studio/external-validation-kit/v1';
const PAYLOAD_CHECKSUM_INDEX_NAME = 'BUNDLE_PAYLOAD_SHA256SUMS.txt';
const PAYLOAD_CHECKSUM_INDEX_FORMAT = 'sha256-two-space-path-v1';
const RELEASE_RELATIVE_PATH = `release/Activation-Energy-Studio-v${VERSION}.html`;
const RELEASE_NAME = `Activation-Energy-Studio-v${VERSION}.html`;
const GOLDEN_RELATIVE_PATH = 'release/Platform-Golden-synthetic_kas_150.csv';
const GOLDEN_NAME = 'Platform-Golden-synthetic_kas_150.csv';
const FIXTURE_MANIFEST_RELATIVE_PATH =
  `evidence/usability/v${VERSION}/UX_FIXTURE_MANIFEST.json`;
const REVIEW_PACKAGE_RELATIVE_PATH =
  `output/independent-scientific-review-v${VERSION}`;
const FIXED_ZIP_TIME = new Date('1980-01-01T00:00:00.000Z');
const SHA_PLACEHOLDER = 'REPLACE_WITH_64_LOWERCASE_HEX_SHA256';

export const EXTERNAL_VALIDATION_KIT_PATHS = Object.freeze({
  projectRoot: PROJECT_ROOT,
  outputDirectory: OUTPUT_DIR,
  archive: ARCHIVE_PATH,
  archiveChecksum: ARCHIVE_SHA_PATH,
  archiveRoot: KIT_NAME,
});

const FILE_SOURCES = [
  {
    source: RELEASE_RELATIVE_PATH,
    destination: `01-platform/${RELEASE_NAME}`,
    role: 'locked_release',
  },
  {
    source: GOLDEN_RELATIVE_PATH,
    destination: `01-platform/${GOLDEN_NAME}`,
    role: 'platform_golden_input',
  },
  {
    source: 'release/Platform-Locale-English-dot.csv',
    destination: '01-platform/locale/Platform-Locale-English-dot.csv',
    role: 'platform_locale_fixture',
  },
  {
    source: 'release/Platform-Locale-Turkish-comma.csv',
    destination: '01-platform/locale/Platform-Locale-Turkish-comma.csv',
    role: 'platform_locale_fixture',
  },
  {
    source: 'release/Platform-Locale-Mixed-invalid.csv',
    destination: '01-platform/locale/Platform-Locale-Mixed-invalid.csv',
    role: 'platform_locale_fixture',
  },
  {
    source: 'release/MANIFEST.v0.2.0.json',
    destination: '00-shared/RELEASE_MANIFEST.v0.2.0.json',
    role: 'release_evidence_manifest',
  },
  {
    source: 'release/SHA256SUMS.txt',
    destination: '00-shared/RELEASE_SHA256SUMS.txt',
    role: 'release_checksum_ledger',
  },
  {
    source: 'release/SHA256SUMS.txt',
    destination: 'release/SHA256SUMS.txt',
    role: 'platform_recorder_compatibility_release_checksum',
  },
  {
    source: 'CURRENT_VALIDATION_STATUS.md',
    destination: '00-shared/CURRENT_VALIDATION_STATUS.md',
    role: 'current_claim_boundary',
  },
  {
    source: 'BROWSER_VALIDATION_ATTEMPT.md',
    destination: '00-shared/BROWSER_VALIDATION_ATTEMPT.md',
    role: 'browser_validation_record',
  },
  {
    source: 'PLATFORM_VALIDATION_PROTOCOL.md',
    destination: '01-platform/PLATFORM_VALIDATION_PROTOCOL.md',
    role: 'platform_protocol',
  },
  {
    source: 'PLATFORM_VALIDATION_PROTOCOL.md',
    destination: 'PLATFORM_VALIDATION_PROTOCOL.md',
    role: 'platform_recorder_compatibility_protocol',
  },
  {
    source: 'HOSTED_PLATFORM_VALIDATION.md',
    destination: '01-platform/HOSTED_PLATFORM_VALIDATION.md',
    role: 'hosted_platform_runbook',
  },
  {
    source: 'HOSTED_PLATFORM_VALIDATION.md',
    destination: '01-platform/hosted/README.md',
    role: 'hosted_platform_repository_readme',
  },
  {
    source: 'PLATFORM_VALIDATION_PROTOCOL.md',
    destination: '01-platform/hosted/PLATFORM_VALIDATION_PROTOCOL.md',
    role: 'hosted_platform_bundled_protocol',
  },
  {
    source: '.github/workflows/platform-validation.yml',
    destination: '01-platform/hosted/.github/workflows/platform-validation.yml',
    role: 'hosted_platform_workflow',
  },
  {
    source: '.gitattributes',
    destination: '01-platform/hosted/.gitattributes',
    role: 'hosted_platform_checkout_byte_policy',
  },
  {
    source: 'scripts/platform-hosted-ci.mjs',
    destination: '01-platform/hosted/scripts/platform-hosted-ci.mjs',
    role: 'hosted_platform_contract',
  },
  {
    source: 'scripts/run-hosted-platform-validation.mjs',
    destination: '01-platform/hosted/scripts/run-hosted-platform-validation.mjs',
    role: 'hosted_platform_browser_harness',
  },
  {
    source: 'scripts/write-hosted-workflow-preflight.mjs',
    destination:
      '01-platform/hosted/scripts/write-hosted-workflow-preflight.mjs',
    role: 'hosted_platform_early_failure_diagnostic_writer',
  },
  {
    source: 'scripts/run-local-macos-platform-diagnostic.mjs',
    destination:
      '01-platform/hosted/scripts/run-local-macos-platform-diagnostic.mjs',
    role: 'local_macos_browser_diagnostic',
  },
  {
    source: 'scripts/verify-local-macos-diagnostic.mjs',
    destination:
      '01-platform/hosted/scripts/verify-local-macos-diagnostic.mjs',
    role: 'local_macos_diagnostic_verifier',
  },
  {
    source: 'scripts/run-paper010-oracle.mjs',
    destination: '01-platform/hosted/scripts/run-paper010-oracle.mjs',
    role: 'hosted_platform_independent_paper010_oracle_runner',
  },
  {
    source: 'scripts/generate-fixture-manifest.mjs',
    destination: '01-platform/hosted/scripts/generate-fixture-manifest.mjs',
    role: 'hosted_platform_fixture_manifest_verifier',
  },
  {
    source: 'tests/hosted-platform-validation.test.mjs',
    destination: '01-platform/hosted/tests/hosted-platform-validation.test.mjs',
    role: 'hosted_platform_contract_test',
  },
  {
    source: 'evidence/validation/FIXTURE_MANIFEST.v0.2.0.json',
    destination:
      '01-platform/hosted/evidence/validation/FIXTURE_MANIFEST.v0.2.0.json',
    role: 'hosted_platform_fixture_integrity_manifest',
  },
  {
    source: 'package.json',
    destination: '01-platform/hosted/package.json',
    role: 'hosted_platform_package_contract',
  },
  {
    source: 'package-lock.json',
    destination: '01-platform/hosted/package-lock.json',
    role: 'hosted_platform_dependency_lock',
  },
  {
    source: RELEASE_RELATIVE_PATH,
    destination: `01-platform/hosted/release/${RELEASE_NAME}`,
    role: 'hosted_platform_locked_release',
  },
  {
    source: GOLDEN_RELATIVE_PATH,
    destination: `01-platform/hosted/release/${GOLDEN_NAME}`,
    role: 'hosted_platform_golden_input',
  },
  {
    source: 'release/SHA256SUMS.txt',
    destination: '01-platform/hosted/release/SHA256SUMS.txt',
    role: 'hosted_platform_release_checksums',
  },
  {
    source: 'USABILITY_VALIDATION_PROTOCOL.md',
    destination: '02-usability/USABILITY_VALIDATION_PROTOCOL.md',
    role: 'usability_protocol',
  },
  {
    source: 'SCIENTIFIC_REVIEW_SIGNOFF_PROTOCOL.md',
    destination: '03-scientific-review/SCIENTIFIC_REVIEW_SIGNOFF_PROTOCOL.md',
    role: 'scientific_review_protocol',
  },
  {
    source: 'SCIENTIFIC_REVIEW_RUNBOOK.md',
    destination: '03-scientific-review/SCIENTIFIC_REVIEW_RUNBOOK.md',
    role: 'scientific_review_runbook',
  },
  {
    source: 'EXTERNAL_EVIDENCE_ADJUDICATION_PROTOCOL.md',
    destination:
      '04-closeout/EXTERNAL_EVIDENCE_ADJUDICATION_PROTOCOL.md',
    role: 'external_evidence_adjudication_protocol',
  },
  {
    source:
      'governance/EXTERNAL_EVIDENCE_ADJUDICATION_INPUT.schema.json',
    destination:
      '04-closeout/EXTERNAL_EVIDENCE_ADJUDICATION_INPUT.schema.json',
    role: 'external_evidence_adjudication_input_schema',
  },
  {
    source:
      'governance/EXTERNAL_EVIDENCE_ADJUDICATION_INPUT_TEMPLATE.json',
    destination:
      '04-closeout/EXTERNAL_EVIDENCE_ADJUDICATION_INPUT_TEMPLATE.json',
    role: 'external_evidence_adjudication_input_template',
  },
  {
    source: 'scripts/create-platform-evidence-record.mjs',
    destination: 'tools/create-platform-evidence-record.mjs',
    role: 'platform_evidence_recorder',
  },
  {
    source: 'scripts/compare-scientific-reports.mjs',
    destination: 'tools/compare-scientific-reports.mjs',
    role: 'cross_platform_scientific_comparator',
  },
  {
    source: 'scripts/compare-scientific-reports.mjs',
    destination: 'scripts/compare-scientific-reports.mjs',
    role: 'platform_recorder_compatibility_comparator',
  },
  {
    source: 'scripts/create-platform-matrix-record.mjs',
    destination: 'tools/create-platform-matrix-record.mjs',
    role: 'three_platform_matrix_recorder',
  },
  {
    source: 'scripts/record-platform-human-review.mjs',
    destination: 'tools/record-platform-human-review.mjs',
    role: 'platform_human_review_recorder',
  },
  {
    source: 'scripts/write-hosted-workflow-preflight.mjs',
    destination: 'tools/write-hosted-workflow-preflight.mjs',
    role: 'platform_human_review_preflight_validator_dependency',
  },
  {
    source: 'scripts/record-usability-study.mjs',
    destination: 'tools/record-usability-study.mjs',
    role: 'usability_evidence_recorder',
  },
  {
    source: 'scripts/record-scientific-review.mjs',
    destination: 'tools/record-scientific-review.mjs',
    role: 'scientific_review_evidence_recorder',
  },
  {
    source: 'scripts/adjudicate-external-evidence.mjs',
    destination: 'tools/adjudicate-external-evidence.mjs',
    role: 'external_evidence_adjudication_recorder',
  },
];

const DIRECTORY_SOURCES = [
  {
    source: 'tests/fixtures',
    destination: '01-platform/hosted/tests/fixtures',
    role: 'hosted_platform_locked_fixture',
  },
  {
    source: `evidence/usability/v${VERSION}`,
    destination: '02-usability/fixtures',
    role: 'frozen_usability_fixture',
  },
  {
    source: REVIEW_PACKAGE_RELATIVE_PATH,
    destination: '03-scientific-review/package',
    role: 'independent_scientific_review_package',
  },
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function toPosix(path) {
  return path.split(sep).join('/');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function assertRegularFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`${label} is missing or is not a regular file: ${path}`);
  }
}

function walkFiles(directory) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`Required source directory is missing: ${directory}`);
  }
  const result = [];
  const visit = (current) => {
    for (const name of readdirSync(current).sort()) {
      const path = resolve(current, name);
      const stat = statSync(path);
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile()) result.push(path);
      else throw new Error(`Unsupported source entry: ${path}`);
    }
  };
  visit(directory);
  return result;
}

function addPayload(map, destination, bytes, role, sourcePath = null) {
  if (!destination || destination.startsWith('/') || destination.includes('..')) {
    throw new Error(`Unsafe kit destination: ${destination}`);
  }
  if (map.has(destination)) throw new Error(`Duplicate kit destination: ${destination}`);
  map.set(destination, {
    bytes: Buffer.from(bytes),
    role,
    sourcePath,
  });
}

function releaseLock() {
  const releasePath = resolve(PROJECT_ROOT, RELEASE_RELATIVE_PATH);
  const goldenPath = resolve(PROJECT_ROOT, GOLDEN_RELATIVE_PATH);
  const fixtureManifestPath = resolve(PROJECT_ROOT, FIXTURE_MANIFEST_RELATIVE_PATH);
  assertRegularFile(releasePath, 'Release');
  assertRegularFile(goldenPath, 'Golden input');
  assertRegularFile(fixtureManifestPath, 'Usability fixture manifest');
  const releaseBytes = readFileSync(releasePath);
  const goldenBytes = readFileSync(goldenPath);
  const fixtureManifestBytes = readFileSync(fixtureManifestPath);
  const fixtureManifest = JSON.parse(fixtureManifestBytes.toString('utf8'));
  const releaseSha256 = sha256(releaseBytes);
  const releaseManifestPath = resolve(PROJECT_ROOT, 'release/MANIFEST.v0.2.0.json');
  assertRegularFile(releaseManifestPath, 'Release evidence manifest');
  const releaseManifest = JSON.parse(readFileSync(releaseManifestPath, 'utf8'));
  if (
    releaseManifest.release?.artifact !== RELEASE_RELATIVE_PATH ||
    releaseManifest.release?.bytes !== releaseBytes.length ||
    releaseManifest.release?.sha256 !== releaseSha256
  ) {
    throw new Error('Release evidence manifest does not lock the current release bytes.');
  }
  if (fixtureManifest.release?.sha256 !== releaseSha256) {
    throw new Error(
      `${FIXTURE_MANIFEST_RELATIVE_PATH} is stale for ${RELEASE_RELATIVE_PATH}.`,
    );
  }
  return {
    release: {
      path: RELEASE_RELATIVE_PATH,
      bytes: releaseBytes.length,
      sha256: releaseSha256,
    },
    goldenInput: {
      path: GOLDEN_RELATIVE_PATH,
      bytes: goldenBytes.length,
      sha256: sha256(goldenBytes),
    },
    fixtureManifest: {
      path: FIXTURE_MANIFEST_RELATIVE_PATH,
      bytes: fixtureManifestBytes.length,
      sha256: sha256(fixtureManifestBytes),
    },
  };
}

export function assertUpstreamValidationCurrent({
  projectRoot = PROJECT_ROOT,
  buildRelease = buildReleaseManifest,
  verifyReview = verifyReviewPackage,
  reviewOutputPath = resolve(projectRoot, REVIEW_PACKAGE_RELATIVE_PATH),
} = {}) {
  const releaseManifestPath = resolve(
    projectRoot,
    RELEASE_MANIFEST_RELATIVE_PATH,
  );
  assertRegularFile(releaseManifestPath, 'Release evidence manifest');
  const expectedReleaseManifest = serializeReleaseManifest(
    buildRelease(projectRoot),
  );
  const actualReleaseManifest = readFileSync(releaseManifestPath, 'utf8');
  if (actualReleaseManifest !== expectedReleaseManifest) {
    throw new Error(
      'Release evidence manifest is stale for the current source evidence.',
    );
  }
  verifyReview(projectRoot, reviewOutputPath);
}

const HOSTED_PLATFORM_ARTIFACT_FILENAMES = Object.freeze({
  hostedRunMetadata: 'hosted-run-metadata.json',
  hostedWorkflowPreflight: 'hosted-workflow-preflight.json',
  hostedUploadReceipt: 'hosted-upload-receipt.json',
  selfTestJson: 'activation-energy-platform-self-test-v0.2.0-pass.json',
  reportJson: 'platform-golden.json',
  reportCsv: 'platform-golden-results.csv',
  reportPdf: 'platform-golden-report.pdf',
  networkHar: 'network.har',
  screenshot: 'final-state.png',
});

function hostedUploadReceiptTemplate(osFamily) {
  return {
    schemaVersion:
      'activation-energy-studio/github-actions-artifact-receipt/v1',
    provider: 'GitHub Actions',
    repository: 'REPLACE_WITH_OWNER_SLASH_REPOSITORY',
    workflow: 'Hosted Platform Validation',
    runId: 'REPLACE_WITH_GITHUB_RUN_ID',
    runAttempt: 'REPLACE_WITH_GITHUB_RUN_ATTEMPT',
    commitSha: 'REPLACE_WITH_40_LOWERCASE_HEX_COMMIT_SHA',
    artifactId: 'REPLACE_WITH_POSITIVE_DECIMAL_ARTIFACT_ID',
    artifactName:
      `REPLACE_WITH_hosted-platform-${osFamily}-RUN_ID-RUN_ATTEMPT`,
    artifactUrl: 'REPLACE_WITH_EXACT_ACTIONS_UPLOAD_ARTIFACT_URL',
    artifactDigest: 'REPLACE_WITH_64_LOWERCASE_HEX_UPLOAD_ARTIFACT_DIGEST',
    capturedAtUtc: 'REPLACE_WITH_ISO_8601_UTC_TIMESTAMP',
    claimBoundary:
      'DECLARED_GITHUB_ACTIONS_UPLOAD_OUTPUT_NOT_AUTHENTICATED_BY_SOFTWARE',
  };
}

function platformTemplate(
  lock,
  {
    platformSlug = null,
    osFamily = 'REPLACE_WITH_macos_windows11_or_ubuntu',
    osEdition = 'REPLACE_WITH_EXACT_EDITION',
  } = {},
) {
  const retainedDirectory = platformSlug ? `retained/${platformSlug}` : 'retained';
  const retained = (fileName) => ({
    path: `${retainedDirectory}/${fileName}`,
    sha256: SHA_PLACEHOLDER,
  });
  return {
    schemaVersion: 'activation-energy-studio/platform-run-input/v1',
    runId: `REPLACE-${platformSlug ?? 'platform'}-YYYYMMDD-golden-01`,
    observer: {
      name: 'REPLACE_WITH_REAL_OBSERVER',
      organization: 'REPLACE_WITH_ORGANIZATION',
    },
    startedAt: 'REPLACE_WITH_ISO_8601_START',
    endedAt: 'REPLACE_WITH_ISO_8601_END',
    environment: {
      os: {
        family: osFamily,
        edition: osEdition,
        build: 'REPLACE_WITH_EXACT_BUILD',
        architecture: 'REPLACE_WITH_ARCHITECTURE',
      },
      runtime: {
        documentProtocol: 'file:',
        onlineStateDuringRun: false,
        userAgent: 'REPLACE_WITH_FULL_USER_AGENT',
        javascriptEngine: 'REPLACE_WITH_ENGINE_AND_VERSION',
      },
      browser: {
        name: 'REPLACE_WITH_BROWSER',
        version: 'REPLACE_WITH_BROWSER_VERSION',
        engine: 'REPLACE_WITH_ENGINE_AND_VERSION',
        navigatorLanguage: 'REPLACE_WITH_NAVIGATOR_LANGUAGE',
        navigatorLanguages: ['REPLACE_WITH_NAVIGATOR_LANGUAGES'],
      },
      locale: {
        osLocale: 'REPLACE_WITH_OS_LOCALE',
        timeZone: 'REPLACE_WITH_TIME_ZONE',
        decimalSeparator: 'REPLACE_WITH_DOT_OR_COMMA',
      },
    },
    protocol: {
      offlineMode: true,
      declaredExternalRequestAttempts: 0,
      networkCapture: {
        format: 'HAR',
        complete: true,
        capturedWhileOffline: true,
        covers: [
          'page-open',
          'upload',
          'analysis',
          'json-export',
          'csv-export',
          'pdf-export',
        ],
      },
      operatorConfirmations: {
        releaseAndInputHashesChecked: false,
        contextValuesRecorded: false,
        analysisCompleted: false,
        allExportsSaved: false,
        networkLogSavedBeforeReconnect: false,
      },
      deviations: [],
    },
    artifacts: {
      release: {
        path: RELEASE_NAME,
        sha256: lock.release.sha256,
      },
      goldenInput: {
        path: GOLDEN_NAME,
        sha256: lock.goldenInput.sha256,
      },
      selfTestJson: retained(HOSTED_PLATFORM_ARTIFACT_FILENAMES.selfTestJson),
      reportJson: retained(HOSTED_PLATFORM_ARTIFACT_FILENAMES.reportJson),
      reportCsv: retained(HOSTED_PLATFORM_ARTIFACT_FILENAMES.reportCsv),
      reportPdf: retained(HOSTED_PLATFORM_ARTIFACT_FILENAMES.reportPdf),
      networkHar: retained(HOSTED_PLATFORM_ARTIFACT_FILENAMES.networkHar),
      screenshot: retained(HOSTED_PLATFORM_ARTIFACT_FILENAMES.screenshot),
    },
  };
}

const PLATFORM_HUMAN_REVIEW_DECISION_IDS = Object.freeze([
  'HAR_NETWORK',
  'SCREENSHOT_UI',
  'PDF_VISUAL_QA',
  'JSON_CSV_PDF_CONSISTENCY',
  'RUNNER_OS_ARCH_IDENTITY',
  'DEVIATIONS',
]);

function platformHumanReviewTemplate() {
  const platformReview = (osFamily) => {
    const retainedDirectory = `retained/${osFamily}`;
    const retained = (fileName) => ({
      path: `${retainedDirectory}/${fileName}`,
      sha256: SHA_PLACEHOLDER,
    });
    return {
      osFamily,
      runId: `REPLACE_WITH_${osFamily.toUpperCase()}_RUN_ID`,
      sourceRecordSha256: SHA_PLACEHOLDER,
      startedAtUtc: 'REPLACE_WITH_ISO_8601_REVIEW_START',
      endedAtUtc: 'REPLACE_WITH_ISO_8601_REVIEW_END',
      artifacts: {
        hostedRunMetadata: retained(
          HOSTED_PLATFORM_ARTIFACT_FILENAMES.hostedRunMetadata,
        ),
        hostedWorkflowPreflight: retained(
          HOSTED_PLATFORM_ARTIFACT_FILENAMES.hostedWorkflowPreflight,
        ),
        hostedUploadReceipt: retained(
          HOSTED_PLATFORM_ARTIFACT_FILENAMES.hostedUploadReceipt,
        ),
        reportJson: retained(HOSTED_PLATFORM_ARTIFACT_FILENAMES.reportJson),
        reportCsv: retained(HOSTED_PLATFORM_ARTIFACT_FILENAMES.reportCsv),
        reportPdf: retained(HOSTED_PLATFORM_ARTIFACT_FILENAMES.reportPdf),
        networkHar: retained(HOSTED_PLATFORM_ARTIFACT_FILENAMES.networkHar),
        screenshot: retained(HOSTED_PLATFORM_ARTIFACT_FILENAMES.screenshot),
      },
      decisions: PLATFORM_HUMAN_REVIEW_DECISION_IDS.map((id) => ({
        id,
        reviewStatus: 'NOT_REVIEWED',
        decision: 'FAIL',
        reviewedEvidenceSha256: [SHA_PLACEHOLDER],
        comment: 'REPLACE_WITH_PERSONAL_HUMAN_REVIEW_COMMENT',
        ...(id === 'DEVIATIONS' ? { deviationAssessments: [] } : {}),
      })),
    };
  };
  return {
    schemaVersion: 'activation-energy-studio/platform-human-review-input/v1',
    reviewId: 'REPLACE_WITH_PLATFORM_HUMAN_REVIEW_ID',
    locks: {
      matrix: {
        path: 'retained/platform-matrix-record.json',
        sha256: SHA_PLACEHOLDER,
      },
      sourceRecords: ['macos', 'windows11', 'ubuntu'].map((osFamily) => ({
        osFamily,
        path: `retained/${osFamily}/evidence-record.json`,
        sha256: SHA_PLACEHOLDER,
      })),
    },
    reviewer: {
      name: 'REPLACE_WITH_REAL_REVIEWER_NAME',
      affiliation: 'REPLACE_WITH_REVIEWER_AFFILIATION',
      professionalProfile: 'REPLACE_WITH_PUBLIC_PROFESSIONAL_PROFILE',
      role: 'Independent platform evidence reviewer',
      relevantExperience: 'REPLACE_WITH_RELEVANT_PLATFORM_OR_SCIENTIFIC_QA_EXPERIENCE',
      declarations: {
        personallyReviewedAllReferencedEvidence: false,
        understandsIdentityIsNotAuthenticatedBySoftware: false,
        understandsAcceptanceGatesAreNotAutomaticallyClosed: false,
      },
    },
    review: {
      startedAtUtc: 'REPLACE_WITH_ISO_8601_START',
      endedAtUtc: 'REPLACE_WITH_ISO_8601_END',
      recordedAtUtc: 'REPLACE_WITH_ISO_8601_RECORD_TIME',
      environment: {
        operatingSystem: 'REPLACE_WITH_REVIEW_WORKSTATION_OS',
        browser: 'REPLACE_WITH_REVIEW_BROWSER_AND_VERSION',
        locale: 'REPLACE_WITH_REVIEW_LOCALE',
      },
    },
    platformReviews: ['macos', 'windows11', 'ubuntu'].map(platformReview),
    reviewerMatrixDisposition: 'FAIL',
  };
}

const REFUSALS = {
  R1: 'INSUFFICIENT_DISTINCT_HEATING_RATES',
  R2: 'NO_COMMON_ALPHA_RANGE',
  R3: 'NON_MONOTONIC_ALPHA',
  R4: 'INCONSISTENT_CONTEXT',
  R5: 'NONLINEAR_HEATING_UNSUPPORTED',
};

const WARNINGS = {
  W1: 'LIMITED_HEATING_RATES',
  W2: 'NUMERICAL_DERIVATIVE',
  W3: 'LOW_R2',
  W4: 'MULTISTEP_EA_VARIATION',
};

function participantTemplate(lock, participantNumber) {
  const id = `P${String(participantNumber).padStart(2, '0')}`;
  const screenRecordingSha256 = 'REPLACE_WITH_SCREEN_RECORDING_SHA256';
  const audioRecordingSha256 = 'REPLACE_WITH_AUDIO_RECORDING_SHA256';
  const recordingTimecode = () => ({
    screenRecordingSha256,
    audioRecordingSha256,
    startSeconds: 0,
    endSeconds: 0,
  });
  return {
    schemaVersion: 'activation-energy-studio/usability-participant-record/v1',
    studyId: 'UX-v0.2.0-YYYYMMDD',
    participantId: id,
    eligibility: {
      eligible: false,
      quantitativeField: false,
      csvXlsxAndPlotLiteracy: false,
      tgaExperience: 'REPLACE_WITH_none_or_basic',
      routineKineticsLastTwoYears: false,
      productContributor: false,
      turkishScientificReading: false,
      priorParticipantExposure: false,
      excludedReason: null,
    },
    consent: {
      version: 'UX-CONSENT-v1',
      signedAt: 'REPLACE_WITH_ISO_8601_TIME',
      recording: false,
      signedConsentReference: 'REPLACE_WITH_NON_PII_CONSENT_REFERENCE',
    },
    environment: {
      os: 'REPLACE_WITH_OS',
      browser: 'REPLACE_WITH_BROWSER_AND_VERSION',
      zoomPercent: 100,
      networkOff: true,
    },
    build: {
      path: `../01-platform/${RELEASE_NAME}`,
      bytes: lock.release.bytes,
      sha256: lock.release.sha256,
    },
    fixtureManifestSha256: lock.fixtureManifest.sha256,
    happyPath: {
      startedAt: 'REPLACE_WITH_ISO_8601_START',
      endedAt: 'REPLACE_WITH_ISO_8601_END',
      completed: false,
      macroDecisionCount: null,
      semanticUiActivations: null,
      rawPointerClicks: null,
      osPickerClicks: null,
      rescues: 0,
      formulaUsed: false,
      exportPath: `retained/${id}-report.pdf`,
      exportSha256: SHA_PLACEHOLDER,
      openedSuccessfully: false,
    },
    refusals: Object.entries(REFUSALS).map(([fixtureId, targetCode]) => ({
      fixtureId,
      targetCode,
      visible: false,
      problemScore: 0,
      riskScore: 0,
      actionScore: 0,
      verbatimAnswer: '',
      recordingTimecode: recordingTimecode(),
    })),
    comprehension: {
      verbatimAnswer: '',
      score: 0,
      hintGiven: false,
      rubric: {
        notSameResult: false,
        eaAlphaIsConversionProfile: false,
        kissingerIsPeakSpecific: false,
        notInterchangeable: false,
      },
      recordingTimecode: recordingTimecode(),
    },
    deviations: [],
    evidence: [
      {
        kind: 'screen-recording',
        path: `retained/${id}-screen-recording.mp4`,
        sha256: screenRecordingSha256,
      },
      {
        kind: 'audio-recording',
        path: `retained/${id}-audio-recording.wav`,
        sha256: audioRecordingSha256,
      },
    ],
    observer: 'REPLACE_WITH_OBSERVER_ID',
    scoredAt: 'REPLACE_WITH_ISO_8601_TIME',
  };
}

function deterministicSecondRaterScenarioIds(seed, scenarioIds, count) {
  return [...scenarioIds]
    .map((scenarioId) => ({
      scenarioId,
      digest: sha256(Buffer.from(`${seed}\0${scenarioId}`, 'utf8')),
    }))
    .sort(
      (left, right) =>
        left.digest.localeCompare(right.digest) ||
        left.scenarioId.localeCompare(right.scenarioId),
    )
    .slice(0, count)
    .map(({ scenarioId }) => scenarioId);
}

function usabilityStudyTemplate(lock) {
  const selectionSeed = 'UX-v0.2.0-external-kit-second-rater-v1';
  const allScenarioIds = Array.from({ length: 5 }, (_, index) =>
    Object.keys(REFUSALS).map(
      (fixtureId) => `P${String(index + 1).padStart(2, '0')}:${fixtureId}`,
    ),
  ).flat();
  const selectedScenarioIds = deterministicSecondRaterScenarioIds(
    selectionSeed,
    allScenarioIds,
    10,
  );
  const secondRaterRatings = selectedScenarioIds.map((scenarioId) => {
    const [participantId, fixtureId] = scenarioId.split(':');
    return {
      participantId,
      fixtureId,
      blind: true,
      raterId: 'REPLACE_WITH_SECOND_RATER_ID',
      problemScore: 0,
      riskScore: 0,
      actionScore: 0,
    };
  });
  const warningMatrix = [];
  for (const [fixtureId, targetCode] of Object.entries(WARNINGS)) {
    for (const surface of ['UI', 'PDF']) {
      const extension = surface === 'UI' ? 'png' : 'pdf';
      warningMatrix.push({
        fixtureId,
        targetCode,
        surface,
        visible: false,
        evidence: {
          path: `retained/warnings/${fixtureId}-${surface}.${extension}`,
          sha256: SHA_PLACEHOLDER,
        },
      });
    }
  }
  return {
    schemaVersion: 'activation-energy-studio/usability-study-input/v1',
    studyId: 'UX-v0.2.0-YYYYMMDD',
    studyVersion: 'UX-v0.2.0',
    evidenceOrigin: 'observed-human-sessions',
    fixtureManifest: {
      path: 'fixtures/UX_FIXTURE_MANIFEST.json',
      sha256: lock.fixtureManifest.sha256,
    },
    build: {
      path: `../01-platform/${RELEASE_NAME}`,
      sha256: lock.release.sha256,
    },
    participantRecords: [
      'participants/P01.json',
      'participants/P02.json',
      'participants/P03.json',
      'participants/P04.json',
      'participants/P05.json',
    ],
    excludedSessions: [],
    secondRaterSelection: {
      seed: selectionSeed,
      method: 'SHA256_SEEDED_ASC_V1',
      selectedScenarioIds,
    },
    secondRaterRatings,
    warningMatrix,
    coordinator: {
      observerId: 'REPLACE_WITH_COORDINATOR_ID',
      finalizedAt: 'REPLACE_WITH_ISO_8601_TIME',
      declarationAccepted: false,
      signedRecordReference: 'REPLACE_WITH_NON_PII_SIGNOFF_REFERENCE',
    },
  };
}

function readme(lock) {
  return `# Activation Energy Studio — External Validation Kit v${VERSION}

This archive is a deterministic handoff for three evidence lanes:

1. real offline runs on Windows, macOS, and Ubuntu;
2. an observed five-person non-expert usability study;
3. an independent scientific review.

It is **not** proof that any of those lanes passed. Templates are deliberately
incomplete and fail closed until real retained evidence replaces every
\`REPLACE_...\` value.

## Locked release

- File: \`01-platform/${RELEASE_NAME}\`
- Bytes: ${lock.release.bytes}
- SHA-256: \`${lock.release.sha256}\`
- Golden input SHA-256: \`${lock.goldenInput.sha256}\`

## Lane 1 — platform

Follow \`01-platform/PLATFORM_VALIDATION_PROTOCOL.md\`. The approved
Parallels-free automation route is documented in
\`01-platform/HOSTED_PLATFORM_VALIDATION.md\`; its repository seed is under
\`01-platform/hosted/\`. A direct Mac may also run
\`node scripts/run-local-macos-platform-diagnostic.mjs --output <new-empty-directory>\`
inside that seed, but its explicit local-only status is technical preparation,
not the returned human-reviewed macOS record. Setup and artifact transfer may use the GitHub Actions
network, but the scientific browser interval must begin in offline mode before
the locked \`file://\` page opens. An unsupported manual exploratory run must
keep the computer offline for that same interval, but it remains diagnostic and
cannot replace the fixed GitHub-hosted matrix. Save the hosted workflow
preflight, hosted-run metadata, self-test JSON, complete HAR, raw browser-event
log, final-state screenshot, and all three exports. Copy each downloaded hosted artifact directory's contents
into the matching \`01-platform/retained/<os>/\` directory without renaming or
editing any file. Then copy each
\`platform-run-input.<os>.template.json\` to
\`platform-run-input.<os>.json\`, replace all placeholders with observed values
and hashes. After the upload step completes, copy the matching
\`retained/<os>/hosted-upload-receipt.template.json\` to
\`hosted-upload-receipt.json\` and record the exact Actions artifact ID, name,
URL, digest, run identity, commit, and capture time. This declared receipt is
hash-bound by the human-review recorder but is not authenticated by the
software. Return the entire \`01-platform\` directory. The singular
\`platform-run-input.template.json\` is only a generic field-shape reference;
it is not an input to the required three-record matrix.

The same release and golden-input hashes must be used on Windows 11, supported
macOS, and Ubuntu 24.04. Hosted automation remains
\`AUTOMATED_RUN_EVIDENCE_AWAITING_HUMAN_REVIEW\`; one run, three green jobs, or
a draft manifest never closes the three-platform gate without human review.
After the owner creates the three source records and deterministic matrix,
copy \`platform-human-review-input.template.json\` to
\`platform-human-review-input.json\`. A named human reviewer must personally
inspect all six decision surfaces for every operating system, bind each
decision to the retained bytes, and record any deviation. The resulting
\`platform-human-review-record.json\` is structurally validated only: the
recorder neither authenticates the reviewer nor applies an acceptance-gate
PASS.

## Lane 2 — usability

Only observed human sessions are admissible. Follow
\`02-usability/USABILITY_VALIDATION_PROTOCOL.md\`. Do not put names, email
addresses, or other direct identifiers in participant JSON. Five eligible
participants, consent references, retained evidence, the full R1–R5 task set,
screen and audio recording timecodes, the W1–W4 UI/PDF matrix, and the
deterministically selected blinded second-rating sample are required.
Templates default to non-passing values; record what was observed.

Return the entire \`02-usability\` directory. Generated or synthetic participant
records are rejected by the recorder.

## Lane 3 — independent scientific review

Send \`03-scientific-review/package\` unchanged to an independent thermal
analysis/kinetics reviewer. The reviewer follows
\`03-scientific-review/SCIENTIFIC_REVIEW_SIGNOFF_PROTOCOL.md\` and completes the
verdict template inside the package. Project contributors and AI systems may
not sign.

## Owner adjudication — after all three lanes return

The owner must not translate a recorder result directly into an acceptance-gate
PASS. Follow
\`04-closeout/EXTERNAL_EVIDENCE_ADJUDICATION_PROTOCOL.md\`. A separate
independent human adjudicator for each lane reviews the actual retained content,
identity and signature evidence, produces a distinct signed audit artifact, and
completes a copy of
\`04-closeout/EXTERNAL_EVIDENCE_ADJUDICATION_INPUT_TEMPLATE.json\`.

The adjudication recorder derives exactly the eight external-gate dispositions
but always retains \`softwareAuthenticatedIdentity=false\`,
\`acceptanceGatesAutomaticallyApplied=false\`, and \`validatedMvp=false\`.
No completed adjudication record is included in this kit.

## Integrity and return

- \`BUNDLE_MANIFEST.json\` hashes every payload file.
- \`BUNDLE_MANIFEST.sha256\` hashes the manifest.
- \`${PAYLOAD_CHECKSUM_INDEX_NAME}\` is hash- and count-bound by the manifest and
  lists every file in \`BUNDLE_MANIFEST.files\`.
- macOS/Linux: run \`sh VERIFY-LOCKS.sh\`; it verifies the manifest chain and
  every listed payload without Node.js or jq.
- Windows PowerShell: run \`.\\VERIFY-LOCKS.ps1\`; it independently loops over
  every \`BUNDLE_MANIFEST.files\` entry.
- \`RETURN-CHECKLIST.md\` lists the exact retained files.
- Node.js is not required merely to run the HTML or collect raw evidence.
  The project owner runs the supplied tools after the returned files arrive.

## Owner closeout commands

\`\`\`text
node tools/create-platform-evidence-record.mjs --manifest <run-input.json> --output <evidence-record.json>
node tools/create-platform-matrix-record.mjs --record <macos-record.json> --record <windows11-record.json> --record <ubuntu-record.json> --output <platform-matrix-record.json>
node tools/record-platform-human-review.mjs --input <platform-human-review-input.json> --output <platform-human-review-record.json>
node tools/record-usability-study.mjs --manifest <study-input.json> --output <usability-evidence-record.json>
node tools/record-scientific-review.mjs --package <03-scientific-review/package> --input <completed-structured-review.json> --output <scientific-review-evidence-record.json>
node tools/adjudicate-external-evidence.mjs --input <completed-adjudication-input.json> --output <new-adjudication-record.json>
\`\`\`

These commands verify structure and retained bytes. They do not authenticate a
human identity, consent, recording content, or signature.

Do not rename or edit locked release, fixture, protocol, manifest, or reviewer
package files. Any deviation must be recorded, not silently repaired.
`;
}

function returnChecklist() {
  return `# External validation return checklist

## Platform — repeat separately on Windows, macOS, and Ubuntu

- [ ] one root-level \`platform-run-input.<os>.json\` copied from the matching
      OS-specific template
- [ ] untouched hosted artifact bytes staged under the matching
      \`retained/<os>/\` directory, plus GitHub run URL/ID/commit SHA
- [ ] \`retained/<os>/hosted-run-metadata.json\` with fixed runner, image,
      architecture, browser and GitHub Actions provenance
- [ ] \`retained/<os>/hosted-workflow-preflight.json\` retained; on an early
      workflow failure it is diagnostic-only and does not count as a platform run
- [ ] \`retained/<os>/hosted-upload-receipt.json\` copied from its template and
      filled with the exact upload artifact ID, name, URL, SHA-256 digest, run
      identity, commit, and capture time
- [ ] \`retained/<os>/raw-cdp-events.json\` retained with the HAR
- [ ] \`retained/<os>/evidence-record.json\` created by the owner-side recorder
- [ ] locked release HTML, unchanged
- [ ] locked golden CSV, unchanged
- [ ] \`retained/<os>/activation-energy-platform-self-test-v0.2.0-pass.json\`
- [ ] \`retained/<os>/platform-golden.json\`
- [ ] \`retained/<os>/platform-golden-results.csv\`
- [ ] \`retained/<os>/platform-golden-report.pdf\`
- [ ] \`retained/<os>/network.har\` covering open through all exports
- [ ] \`retained/<os>/final-state.png\`
- [ ] exact OS/browser/locale metadata and real observer declaration
- [ ] after three valid records: one deterministic \`platform-matrix-record.json\`
- [ ] one completed root-level \`platform-human-review-input.json\`, copied from
      \`platform-human-review-input.template.json\`
- [ ] a named human reviewer personally inspected all six decision surfaces
      for Windows, macOS, and Ubuntu and bound every decision to retained hashes
- [ ] one owner-generated \`platform-human-review-record.json\`; treat it as
      structurally validated, not as authenticated identity or automatic gate PASS

## Usability — one retained cohort

- [ ] five eligible participant JSON records
- [ ] five non-PII consent references
- [ ] retained PDF, screen recording, and audio recording evidence for every
      participant
- [ ] optional participant screenshots, if supplied, retained only as hashed
      supplementary evidence; they never replace either required recording
- [ ] observed R1–R5 verbatim answers and scores
- [ ] R1–R5 and C1 answers bound to exact screen/audio timecode ranges
- [ ] Ea(alpha) versus Kissinger verbatim answer and four-part rubric
- [ ] exact seeded ten-scenario blind second-rater sample (40% of 25 scenarios)
- [ ] all eight W1–W4 × UI/PDF evidence cells
- [ ] completed coordinator declaration and study input JSON

## Independent scientific review

- [ ] package manifest hash checked before review
- [ ] all 35 required verdict decisions completed
- [ ] reviewer independence/competence declared
- [ ] dated reviewer identity, signature, and final decision retained
- [ ] no project contributor or AI signature

## Owner adjudication — only after all three lanes return

- [ ] one completed copy of the closeout input template with no placeholders
- [ ] exact SHA-256 locks for the release, acceptance criteria, and all three
      lane records
- [ ] one distinct independent human audit plus one distinct signed audit
      artifact for each lane
- [ ] exact content and authenticity decisions for all eight external gates
- [ ] \`TECHNICAL_OK\` treated only as structural consistency, never automatic
      gate application or a validated-MVP declaration
- [ ] candidate release manifest left immutable; any later closeout manifest
      created as a separate downstream artifact

Missing evidence remains missing. Do not replace real observations with
generated, inferred, reconstructed, or synthetic records.
`;
}

function platformRetainedReadme() {
  return `# Retained platform run evidence

Keep each run input manifest at the \`01-platform\` root and its captured bytes
in the matching retained subdirectory:

\`\`\`text
platform-run-input.macos.json       -> retained/macos/
platform-run-input.windows11.json   -> retained/windows11/
platform-run-input.ubuntu.json      -> retained/ubuntu/
platform-human-review-input.json    -> retained platform matrix and all three runs
\`\`\`

Copy the matching OS-specific template before editing it. Do not move the
manifest into the retained subdirectory: artifact paths are resolved relative
to the manifest, and the supplied paths intentionally point from the
\`01-platform\` root into \`retained/<os>/\`.
Copy the contents of each downloaded hosted artifact into that matching
subdirectory without renaming or editing the files. The generic singular
\`platform-run-input.template.json\` is a field-shape reference only and must
not replace the three OS-specific manifests.

Do not merge or overwrite runs. Each retained subdirectory must contain:

- \`evidence-record.json\` after the project owner runs the supplied recorder
- \`hosted-run-metadata.json\`
- \`hosted-workflow-preflight.json\`
- \`hosted-upload-receipt.json\`, copied from the adjacent template only after
  the GitHub upload step reports its artifact ID, name, URL, and digest
- \`activation-energy-platform-self-test-v0.2.0-pass.json\`
- \`platform-golden.json\`
- \`platform-golden-results.csv\`
- \`platform-golden-report.pdf\`
- \`network.har\`
- \`raw-cdp-events.json\`
- \`final-state.png\`

Open the locked HTML directly from the local filesystem. The document protocol
must be \`file:\`; localhost or any HTTP server is not an accepted substitute.
Capture one HAR from opening the file through completion of all exports, and do
not close the browser before the final-state screenshot.

The recorder validates structure, hashes, local-only requests, and declared
environment metadata. It does not judge screenshot content or authenticate the
observer. A human must inspect the screenshot and confirm the real OS, browser,
locale, and observed workflow. The later human-review recorder also checks that
\`hosted-workflow-preflight.json\` is the exact file bound by hosted metadata
(path, byte count, and SHA-256), validates its target/environment schema, and
cross-checks it against the run provenance. It checks that
\`hosted-upload-receipt.json\` agrees with the hosted run provenance and includes
both preflight and receipt hashes in \`RUNNER_OS_ARCH_IDENTITY\`; the receipt is
still declared, not software authentication of GitHub or the reviewer. Keep the
original retained bytes unchanged.
After all three source records exist, create the matrix, complete
\`01-platform/platform-human-review-input.json\` from its template, and have a
named human personally review the HAR/network behavior, screenshot/UI,
PDF visual quality, JSON/CSV/PDF consistency, runner identity, and deviations
on every operating system. AC-PLAT-03 locale safety remains governed by its
separate automated matrix; the ordinary golden CSV is not mixed-decimal
human-review evidence.

From the validation-kit root, the owner-side recorder commands are:

\`\`\`text
node tools/create-platform-evidence-record.mjs --manifest 01-platform/platform-run-input.macos.json --output 01-platform/retained/macos/evidence-record.json
node tools/create-platform-evidence-record.mjs --manifest 01-platform/platform-run-input.windows11.json --output 01-platform/retained/windows11/evidence-record.json
node tools/create-platform-evidence-record.mjs --manifest 01-platform/platform-run-input.ubuntu.json --output 01-platform/retained/ubuntu/evidence-record.json
node tools/create-platform-matrix-record.mjs --record 01-platform/retained/macos/evidence-record.json --record 01-platform/retained/windows11/evidence-record.json --record 01-platform/retained/ubuntu/evidence-record.json --output 01-platform/retained/platform-matrix-record.json
node tools/record-platform-human-review.mjs --input 01-platform/platform-human-review-input.json --output 01-platform/platform-human-review-record.json
\`\`\`

The human-review recorder validates the declared structure and byte bindings.
It does not authenticate the reviewer and does not convert the platform gate
to PASS.
`;
}

function posixLockVerifier() {
  return `#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MANIFEST_RELATIVE='BUNDLE_MANIFEST.json'
MANIFEST_CHECKSUM_RELATIVE='BUNDLE_MANIFEST.sha256'
INDEX_RELATIVE='${PAYLOAD_CHECKSUM_INDEX_NAME}'

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

check_file() {
  expected=$1
  relative_path=$2
  actual=$(hash_file "$ROOT/$relative_path")
  if [ "$actual" != "$expected" ]; then
    printf 'FAIL %s expected=%s actual=%s\n' "$relative_path" "$expected" "$actual" >&2
    exit 1
  fi
  printf 'PASS %s %s\n' "$relative_path" "$actual"
}

manifest_field() {
  field=$1
  awk -v field="$field" '
    /"payloadChecksumIndex"[[:space:]]*:/ { in_index = 1; next }
    in_index && $0 ~ ("\\\"" field "\\\"[[:space:]]*:") {
      value = $0
      sub(/^[^:]*:[[:space:]]*/, "", value)
      sub(/,[[:space:]]*$/, "", value)
      gsub(/^"|"$/, "", value)
      print value
      exit
    }
    in_index && /^[[:space:]]*}/ { exit }
  ' "$ROOT/$MANIFEST_RELATIVE"
}

set -- $(cat "$ROOT/$MANIFEST_CHECKSUM_RELATIVE")
if [ "$#" -ne 2 ] || [ "$2" != "$MANIFEST_RELATIVE" ]; then
  printf 'FAIL %s has an invalid checksum record\n' "$MANIFEST_CHECKSUM_RELATIVE" >&2
  exit 1
fi
check_file "$1" "$MANIFEST_RELATIVE"

index_path=$(manifest_field path)
index_algorithm=$(manifest_field algorithm)
index_format=$(manifest_field format)
index_count=$(manifest_field entryCount)
index_sha256=$(manifest_field sha256)

if [ "$index_path" != "$INDEX_RELATIVE" ] ||
   [ "$index_algorithm" != "SHA-256" ] ||
   [ "$index_format" != "${PAYLOAD_CHECKSUM_INDEX_FORMAT}" ]; then
  printf 'FAIL manifest payload checksum index metadata is invalid\n' >&2
  exit 1
fi
case "$index_count" in
  ''|*[!0-9]*) printf 'FAIL manifest payload entry count is invalid\n' >&2; exit 1 ;;
esac
case "$index_sha256" in
  ''|*[!0-9a-f]*) printf 'FAIL manifest payload index SHA-256 is invalid\n' >&2; exit 1 ;;
esac
if [ "\${#index_sha256}" -ne 64 ]; then
  printf 'FAIL manifest payload index SHA-256 is invalid\n' >&2
  exit 1
fi

check_file "$index_sha256" "$INDEX_RELATIVE"
actual_count=$(awk 'END { print NR }' "$ROOT/$INDEX_RELATIVE")
if [ "$actual_count" != "$index_count" ]; then
  printf 'FAIL %s expected-count=%s actual-count=%s\n' \
    "$INDEX_RELATIVE" "$index_count" "$actual_count" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$ROOT" && sha256sum -c "$INDEX_RELATIVE")
else
  (cd "$ROOT" && shasum -a 256 -c "$INDEX_RELATIVE")
fi
printf 'PASS BUNDLE_PAYLOADS count=%s\n' "$actual_count"
`;
}

function powershellLockVerifier() {
  return `$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ManifestRelative = 'BUNDLE_MANIFEST.json'
$ManifestChecksumRelative = 'BUNDLE_MANIFEST.sha256'
$IndexRelative = '${PAYLOAD_CHECKSUM_INDEX_NAME}'

function Test-LockedFile {
  param(
    [Parameter(Mandatory = $true)][string]$Expected,
    [Parameter(Mandatory = $true)][string]$RelativePath
  )
  if ([System.IO.Path]::IsPathRooted($RelativePath)) {
    throw "FAIL unsafe absolute payload path: $RelativePath"
  }
  $RootPrefix = [System.IO.Path]::GetFullPath($Root) + [System.IO.Path]::DirectorySeparatorChar
  $Path = [System.IO.Path]::GetFullPath((Join-Path $Root $RelativePath))
  if (-not $Path.StartsWith($RootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "FAIL payload path escapes kit root: $RelativePath"
  }
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "FAIL payload is missing: $RelativePath"
  }
  if ($Expected -notmatch '^[0-9a-f]{64}$') {
    throw "FAIL expected SHA-256 is invalid for $RelativePath"
  }
  $Actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Actual -ne $Expected) {
    throw "FAIL $RelativePath expected=$Expected actual=$Actual"
  }
  Write-Output "PASS $RelativePath $Actual"
}

$ManifestChecksum = Get-Content -LiteralPath (Join-Path $Root $ManifestChecksumRelative) -Raw
if ($ManifestChecksum -notmatch '^([0-9a-f]{64})  BUNDLE_MANIFEST\\.json\\r?\\n?$') {
  throw "FAIL $ManifestChecksumRelative has an invalid checksum record"
}
Test-LockedFile -Expected $Matches[1] -RelativePath $ManifestRelative

$Manifest = Get-Content -LiteralPath (Join-Path $Root $ManifestRelative) -Raw | ConvertFrom-Json
$Index = $Manifest.payloadChecksumIndex
if ($null -eq $Index -or
    $Index.path -ne $IndexRelative -or
    $Index.algorithm -ne 'SHA-256' -or
    $Index.format -ne '${PAYLOAD_CHECKSUM_INDEX_FORMAT}') {
  throw 'FAIL manifest payload checksum index metadata is invalid'
}
Test-LockedFile -Expected ([string]$Index.sha256) -RelativePath ([string]$Index.path)

$Entries = @($Manifest.files)
if ($Entries.Count -ne [int]$Index.entryCount) {
  throw "FAIL manifest payload count mismatch expected=$($Index.entryCount) actual=$($Entries.Count)"
}
$IndexLines = @(Get-Content -LiteralPath (Join-Path $Root $IndexRelative))
if ($IndexLines.Count -ne $Entries.Count) {
  throw "FAIL $IndexRelative line count mismatch expected=$($Entries.Count) actual=$($IndexLines.Count)"
}
for ($Position = 0; $Position -lt $Entries.Count; $Position += 1) {
  $Entry = $Entries[$Position]
  $ExpectedIndexLine = "$($Entry.sha256)  $($Entry.path)"
  if ($IndexLines[$Position] -ne $ExpectedIndexLine) {
    throw "FAIL $IndexRelative differs from manifest at entry $Position"
  }
  Test-LockedFile -Expected ([string]$Entry.sha256) -RelativePath ([string]$Entry.path)
}
Write-Output "PASS BUNDLE_PAYLOADS count=$($Entries.Count)"
`;
}

function usabilityConsentForm() {
  return `# UX-CONSENT-v1 — observed usability session consent

This form must be reviewed against the coordinator's institutional ethics and
data-protection requirements before recruitment. It is not an ethics approval.

## Study

- Purpose: evaluate whether a non-expert can use Activation Energy Studio and
  correctly understand its warnings and result types.
- Activities: one guided task, five refusal scenarios, one comprehension
  question, and short follow-up questions.
- Expected duration: 30–45 minutes.
- Retained evidence: screen recording, audio recording, task timing, clicks,
  de-identified answers, and exported report.
- Foreseeable burden: normal computer-use effort and possible frustration.
- Participation is voluntary. The participant may stop without penalty.

Names, email addresses, signatures, and contact details must be stored outside
the analytical JSON. The JSON uses only P01–P05 identifiers. The coordinator
records a non-identifying consent reference in the study data.

## Consent choices

- [ ] I have read the study information and had an opportunity to ask questions.
- [ ] I voluntarily agree to participate.
- [ ] I agree to screen recording.
- [ ] I agree to audio recording.
- [ ] I understand that I may stop the session at any time.

Participant name/signature (stored separately): ______________________________

Date/time: ____________________  Consent reference: ___________________________

Coordinator/witness: __________________________
`;
}

function usabilityScreeningForm() {
  return `# Recruitment and eligibility screen

Store this form separately from analytical participant JSON. Transfer only the
P01–P05 identifier and protocol-defined eligibility fields.

- Assigned participant ID: __________
- Works/studies in a quantitative field: [ ] yes [ ] no
- Can inspect CSV/XLSX tables and basic plots: [ ] yes [ ] no
- TGA experience: [ ] none [ ] basic [ ] advanced/routine
- Routine kinetics work during the last two years: [ ] yes [ ] no
- Contributor to Activation Energy Studio: [ ] yes [ ] no
- Can read standard technical English instructions: [ ] yes [ ] no
- Previously exposed to these study fixtures/tasks: [ ] yes [ ] no

Eligible only when the exact criteria in \`USABILITY_VALIDATION_PROTOCOL.md\`
are satisfied. Exclusions and repeat sessions must remain traceable; do not
discard an inconvenient or failed first session.
`;
}

function moderatorScript() {
  return `# Moderator script — read without scientific coaching

## Before recording

1. Confirm eligibility and the separately stored UX-CONSENT-v1 form.
2. Assign P01–P05. Do not put direct identifiers in JSON.
3. Set browser zoom to exactly 100%, disconnect the network, verify the locked
   build hash, and start both screen and audio recording.
4. State: “This study evaluates the software, not you. If you become unsure,
   describe your reasoning aloud; I will not provide methodological or formula
   guidance.”

## Happy path

Provide only UX01 and say:

> Calculate the apparent activation-energy profile from this file and save a
> PDF report that opens successfully. Use your own judgment for every decision
> requested by the software.

Record start/end time, semantic activations, raw clicks, OS-picker clicks,
rescues, formula use, PDF path/hash, and whether the PDF opened.

## Refusal tasks

Use the cyclic order below. Ask the same three questions for every case:
“What is the problem?”, “Why does it matter?”, and “What should you do?”

| Participant | Order |
|---|---|
| P01 | R1 → R2 → R3 → R4 → R5 |
| P02 | R2 → R3 → R4 → R5 → R1 |
| P03 | R3 → R4 → R5 → R1 → R2 |
| P04 | R4 → R5 → R1 → R2 → R3 |
| P05 | R5 → R1 → R2 → R3 → R4 |

Record each task's video/audio start and end time plus the first verbatim answer.

## Comprehension task

Show C1 and ask, before any hint:

> Are the Ea(α) profile and the Kissinger peak result equivalent? What does
> each represent, and may they be reported interchangeably?

Capture the first verbatim answer and its recording time range. Do not repair
the answer before scoring. Record any deviation immediately.
`;
}

function secondRaterGuide() {
  return `# Blind second-rater guide

The second rater must not see the first rater's scores. Use the frozen refusal
target code and the participant's verbatim answer/recording only.

For each selected scenario, score independently:

- problemScore = 1 only when the blocking problem is correctly identified;
- riskScore = 1 only when the scientific consequence is correctly explained;
- actionScore = 1 only when a safe next action is given.

Record rater ID, scenario ID, scores, time, and signed reference. Do not change
the participant's answer. At least 10 of the 25 participant × refusal scenarios
must receive a blind second score. Selection provenance must be retained.
`;
}

export function buildExternalValidationKitPlan() {
  assertUpstreamValidationCurrent();
  const lock = releaseLock();
  const payload = new Map();

  for (const descriptor of FILE_SOURCES) {
    const source = resolve(PROJECT_ROOT, descriptor.source);
    assertRegularFile(source, descriptor.source);
    addPayload(
      payload,
      descriptor.destination,
      readFileSync(source),
      descriptor.role,
      descriptor.source,
    );
  }

  for (const descriptor of DIRECTORY_SOURCES) {
    const sourceDirectory = resolve(PROJECT_ROOT, descriptor.source);
    for (const source of walkFiles(sourceDirectory)) {
      const suffix = toPosix(relative(sourceDirectory, source));
      addPayload(
        payload,
        `${descriptor.destination}/${suffix}`,
        readFileSync(source),
        descriptor.role,
        `${descriptor.source}/${suffix}`,
      );
    }
  }

  addPayload(payload, 'README-FIRST.md', Buffer.from(readme(lock)), 'handoff_readme');
  addPayload(
    payload,
    'RETURN-CHECKLIST.md',
    Buffer.from(returnChecklist()),
    'return_checklist',
  );
  addPayload(
    payload,
    'VERIFY-LOCKS.sh',
    Buffer.from(posixLockVerifier()),
    'posix_lock_verifier',
  );
  addPayload(
    payload,
    'VERIFY-LOCKS.ps1',
    Buffer.from(powershellLockVerifier()),
    'powershell_lock_verifier',
  );
  addPayload(
    payload,
    '01-platform/platform-run-input.template.json',
    jsonBytes(platformTemplate(lock)),
    'platform_input_template',
  );
  for (const platform of [
    {
      slug: 'macos',
      family: 'macos',
      edition: 'macOS REPLACE_WITH_EXACT_VERSION',
    },
    {
      slug: 'windows11',
      family: 'windows11',
      edition: 'Windows 11 REPLACE_WITH_EXACT_EDITION',
    },
    {
      slug: 'ubuntu',
      family: 'ubuntu',
      edition: 'Ubuntu REPLACE_WITH_EXACT_VERSION',
    },
  ]) {
    addPayload(
      payload,
      `01-platform/platform-run-input.${platform.slug}.template.json`,
      jsonBytes(
        platformTemplate(lock, {
          platformSlug: platform.slug,
          osFamily: platform.family,
          osEdition: platform.edition,
        }),
      ),
      'platform_os_input_template',
    );
    addPayload(
      payload,
      `01-platform/retained/${platform.slug}/hosted-upload-receipt.template.json`,
      jsonBytes(hostedUploadReceiptTemplate(platform.family)),
      'platform_hosted_upload_receipt_template',
    );
  }
  addPayload(
    payload,
    '01-platform/platform-human-review-input.template.json',
    jsonBytes(platformHumanReviewTemplate()),
    'platform_human_review_input_template',
  );
  addPayload(
    payload,
    '01-platform/retained/README.md',
    Buffer.from(platformRetainedReadme()),
    'platform_retained_run_instructions',
  );
  addPayload(
    payload,
    '02-usability/study-input.template.json',
    jsonBytes(usabilityStudyTemplate(lock)),
    'usability_study_input_template',
  );
  addPayload(
    payload,
    '02-usability/UX-CONSENT-v1.md',
    Buffer.from(usabilityConsentForm()),
    'usability_consent_form',
  );
  addPayload(
    payload,
    '02-usability/RECRUITMENT-SCREENING.md',
    Buffer.from(usabilityScreeningForm()),
    'usability_screening_form',
  );
  addPayload(
    payload,
    '02-usability/MODERATOR-SCRIPT.md',
    Buffer.from(moderatorScript()),
    'usability_moderator_script',
  );
  addPayload(
    payload,
    '02-usability/SECOND-RATER-GUIDE.md',
    Buffer.from(secondRaterGuide()),
    'usability_second_rater_guide',
  );
  for (let participant = 1; participant <= 5; participant += 1) {
    const id = `P${String(participant).padStart(2, '0')}`;
    addPayload(
      payload,
      `02-usability/participants/${id}.template.json`,
      jsonBytes(participantTemplate(lock, participant)),
      'usability_participant_template',
    );
  }

  const entries = [...payload.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, item]) => ({
      path,
      bytes: item.bytes.length,
      sha256: sha256(item.bytes),
      role: item.role,
      sourcePath: item.sourcePath,
    }));
  const payloadChecksumIndexBytes = Buffer.from(
    entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join(''),
    'utf8',
  );
  const payloadChecksumIndex = {
    path: PAYLOAD_CHECKSUM_INDEX_NAME,
    algorithm: 'SHA-256',
    format: PAYLOAD_CHECKSUM_INDEX_FORMAT,
    entryCount: entries.length,
    bytes: payloadChecksumIndexBytes.length,
    sha256: sha256(payloadChecksumIndexBytes),
  };

  const manifest = {
    schemaVersion: MANIFEST_SCHEMA,
    kit: {
      name: KIT_NAME,
      version: VERSION,
      archiveRoot: KIT_NAME,
    },
    lockedRelease: lock.release,
    lockedGoldenInput: lock.goldenInput,
    evidenceState: {
      platform: 'PREPARED_AWAITING_REAL_WINDOWS_MACOS_UBUNTU_RUNS',
      usability: 'PREPARED_AWAITING_FIVE_OBSERVED_HUMAN_SESSIONS',
      scientificReview: 'UNSIGNED_AWAITING_INDEPENDENT_REVIEW',
      externalAdjudication:
        'PREPARED_AWAITING_THREE_RETURNED_LANES_AND_SIGNED_HUMAN_AUDITS',
    },
    claimBoundary:
      'This kit packages protocols and templates; it is not evidence that external validation occurred or passed.',
    payloadChecksumIndex,
    generation: {
      deterministic: true,
      generatedAtOmitted: true,
      fixedZipMtime: FIXED_ZIP_TIME.toISOString(),
    },
    files: entries,
  };
  const manifestBytes = jsonBytes(manifest);
  const manifestHashBytes = Buffer.from(
    `${sha256(manifestBytes)}  BUNDLE_MANIFEST.json\n`,
    'utf8',
  );
  addPayload(
    payload,
    PAYLOAD_CHECKSUM_INDEX_NAME,
    payloadChecksumIndexBytes,
    'bundle_payload_checksum_index',
  );
  addPayload(payload, 'BUNDLE_MANIFEST.json', manifestBytes, 'bundle_manifest');
  addPayload(
    payload,
    'BUNDLE_MANIFEST.sha256',
    manifestHashBytes,
    'bundle_manifest_checksum',
  );

  const zipInput = {};
  for (const [path, item] of [...payload.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    zipInput[`${KIT_NAME}/${path}`] = [
      new Uint8Array(item.bytes),
      { level: 6, mtime: FIXED_ZIP_TIME },
    ];
  }
  const archiveBytes = Buffer.from(zipSync(zipInput, { level: 6 }));

  return {
    lock,
    payload,
    manifest,
    manifestBytes,
    archiveBytes,
    archiveSha256: sha256(archiveBytes),
  };
}

function ownerBytes() {
  return jsonBytes({ schemaVersion: OWNER_SCHEMA, version: VERSION });
}

function assertOwnedOutput() {
  if (!existsSync(OUTPUT_DIR)) return;
  const marker = resolve(OUTPUT_DIR, OWNER_FILE);
  if (!existsSync(marker) || !readFileSync(marker).equals(ownerBytes())) {
    throw new Error(`Refusing to replace unowned output directory: ${OUTPUT_DIR}`);
  }
}

function expectedOutputFiles(plan) {
  const expected = new Map();
  for (const [path, item] of plan.payload) expected.set(path, item.bytes);
  expected.set(OWNER_FILE, ownerBytes());
  return expected;
}

function actualRelativeFiles(directory) {
  return walkFiles(directory).map((path) => toPosix(relative(directory, path))).sort();
}

function verifyArchive(plan) {
  assertRegularFile(ARCHIVE_PATH, 'External validation ZIP');
  const actualArchive = readFileSync(ARCHIVE_PATH);
  if (!actualArchive.equals(plan.archiveBytes)) {
    throw new Error(`External validation ZIP is stale: ${ARCHIVE_PATH}`);
  }
  assertRegularFile(ARCHIVE_SHA_PATH, 'External validation ZIP checksum');
  const expectedChecksum = `${plan.archiveSha256}  ${KIT_NAME}.zip\n`;
  if (readFileSync(ARCHIVE_SHA_PATH, 'utf8') !== expectedChecksum) {
    throw new Error(`External validation ZIP checksum is stale: ${ARCHIVE_SHA_PATH}`);
  }
  const unzipped = unzipSync(new Uint8Array(actualArchive));
  const expectedArchivePaths = [...plan.payload.keys()]
    .map((path) => `${KIT_NAME}/${path}`)
    .sort();
  const actualArchivePaths = Object.keys(unzipped).sort();
  if (JSON.stringify(actualArchivePaths) !== JSON.stringify(expectedArchivePaths)) {
    throw new Error('External validation ZIP file set does not match the manifest plan.');
  }
  for (const path of expectedArchivePaths) {
    const payloadPath = path.slice(KIT_NAME.length + 1);
    if (!Buffer.from(unzipped[path]).equals(plan.payload.get(payloadPath).bytes)) {
      throw new Error(`External validation ZIP payload mismatch: ${path}`);
    }
  }
}

export function verifyExternalValidationKit() {
  const plan = buildExternalValidationKitPlan();
  assertOwnedOutput();
  if (!existsSync(OUTPUT_DIR)) {
    throw new Error(`External validation kit directory is missing: ${OUTPUT_DIR}`);
  }
  const expected = expectedOutputFiles(plan);
  const actualPaths = actualRelativeFiles(OUTPUT_DIR);
  const expectedPaths = [...expected.keys()].sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error('External validation kit directory file set is stale.');
  }
  for (const path of expectedPaths) {
    if (!readFileSync(resolve(OUTPUT_DIR, path)).equals(expected.get(path))) {
      throw new Error(`External validation kit payload is stale: ${path}`);
    }
  }
  verifyArchive(plan);
  return plan;
}

export function generateExternalValidationKit() {
  const plan = buildExternalValidationKitPlan();
  assertOwnedOutput();
  if (existsSync(OUTPUT_DIR)) rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const [path, item] of plan.payload) {
    const destination = resolve(OUTPUT_DIR, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, item.bytes);
  }
  writeFileSync(resolve(OUTPUT_DIR, OWNER_FILE), ownerBytes());
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  writeFileSync(ARCHIVE_PATH, plan.archiveBytes);
  writeFileSync(
    ARCHIVE_SHA_PATH,
    `${plan.archiveSha256}  ${KIT_NAME}.zip\n`,
  );
  verifyExternalValidationKit();
  return plan;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    throw new Error('Usage: node scripts/generate-external-validation-kit.mjs [--check]');
  }
  const check = args[0] === '--check';
  const plan = check ? verifyExternalValidationKit() : generateExternalValidationKit();
  const verb = check
    ? 'TECHNICAL_OK EXTERNAL_VALIDATION_KIT_CURRENT'
    : 'TECHNICAL_OK EXTERNAL_VALIDATION_KIT_GENERATED';
  process.stdout.write(
    `${verb} files=${plan.payload.size} archiveSha256=${plan.archiveSha256} ` +
      `state=${Object.values(plan.manifest.evidenceState).join(',')}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`FAIL EXTERNAL_VALIDATION_KIT ${error.message}\n`);
    process.exitCode = 1;
  }
}
