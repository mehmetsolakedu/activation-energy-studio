#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { unzipSync, zipSync } from 'fflate';

import { verifyExternalCandidateFreeze } from './verify-v0.3.2-external-candidate.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const VERSION = '0.3.2';
const KIT_NAME = `Activation-Energy-Studio-Platform-Validation-Kit-v${VERSION}`;
const OUTPUT_DIRECTORY = path.resolve(
  PROJECT_ROOT,
  'output/v0.3.2-external-validation/platform',
);
const KIT_DIRECTORY = path.resolve(OUTPUT_DIRECTORY, KIT_NAME);
const ARCHIVE_PATH = path.resolve(OUTPUT_DIRECTORY, `${KIT_NAME}.zip`);
const ARCHIVE_CHECKSUM_PATH = `${ARCHIVE_PATH}.sha256`;
const STATUS_PATH = path.resolve(
  OUTPUT_DIRECTORY,
  'PLATFORM_EXTERNAL_EVIDENCE_STATUS.json',
);
const OWNER_PATH = path.resolve(OUTPUT_DIRECTORY, '.platform-package-owner.json');
const OWNER_SCHEMA =
  'activation-energy-studio/platform-validation-package-owner/v1';
const FIXED_ZIP_TIME = new Date('1980-01-01T00:00:00.000Z');

const PLATFORM_SOURCES = [
  '.github/workflows/platform-validation-v032.yml',
  'examples/synthetic_kas_150.csv',
  'evidence/platform/v0.3.2/PLATFORM_INPUT_SHA256SUMS.txt',
  'evidence/platform/v0.3.2/PLATFORM_VALIDATION_PROTOCOL.md',
  'scripts/compare-scientific-reports-v032.mjs',
  'scripts/create-platform-evidence-record.mjs',
  'scripts/create-platform-evidence-record-v032.mjs',
  'scripts/create-platform-matrix-record.mjs',
  'scripts/platform-hosted-ci.mjs',
  'scripts/platform-hosted-ci-v032.mjs',
  'scripts/record-platform-human-review.mjs',
  'scripts/record-platform-human-review-v032.mjs',
  'scripts/run-hosted-platform-validation-core-v032.mjs',
  'scripts/run-hosted-platform-validation-v032.mjs',
  'scripts/run-local-macos-platform-diagnostic.mjs',
  'scripts/run-local-macos-platform-diagnostic-v032.mjs',
  'scripts/run-platform-tests-v032.mjs',
  'scripts/verify-local-macos-diagnostic-v032.mjs',
  'scripts/verify-v0.3.2-external-candidate.mjs',
  'scripts/write-hosted-workflow-preflight.mjs',
  'tests/hosted-platform-validation.test.mjs',
  'tests/hosted-platform-v032-contract.test.mjs',
  'tests/platform-evidence-record.test.mjs',
];

const KIT_PACKAGE = Object.freeze({
  name: 'activation-energy-studio-platform-validation-kit',
  version: VERSION,
  private: true,
  type: 'module',
  packageManager: 'npm@10.9.8',
  engines: Object.freeze({
    node: '22.22.3',
    npm: '10.9.8',
  }),
  description:
    'Self-contained v0.3.2 hosted platform validation and independent-review tooling.',
  scripts: Object.freeze({
    'verify:candidate': 'node scripts/verify-v0.3.2-external-candidate.mjs',
    'test:platform-evidence': 'node scripts/run-platform-tests-v032.mjs platform',
    'test:hosted-platform': 'node scripts/run-platform-tests-v032.mjs hosted',
    'record:platform-evidence': 'node scripts/create-platform-evidence-record-v032.mjs',
    'record:platform-matrix': 'node scripts/create-platform-matrix-record.mjs',
    'record:platform-human-review': 'node scripts/record-platform-human-review-v032.mjs',
    'validate:hosted-platform': 'node scripts/run-hosted-platform-validation-v032.mjs',
    'validate:local-macos-diagnostic': 'node scripts/run-local-macos-platform-diagnostic-v032.mjs',
  }),
  devDependencies: Object.freeze({
    'puppeteer-core': '25.3.0',
  }),
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function portable(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.resolve(PROJECT_ROOT, relativePath), 'utf8'));
}

function assertSafeRelative(relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/u).includes('..')
  ) {
    throw new Error(`Unsafe package source path: ${String(relativePath)}`);
  }
}

function prepareOutputDirectory() {
  if (existsSync(OUTPUT_DIRECTORY)) {
    if (!existsSync(OWNER_PATH)) {
      throw new Error(
        `Refusing to replace an unowned output directory: ${OUTPUT_DIRECTORY}`,
      );
    }
    const owner = JSON.parse(readFileSync(OWNER_PATH, 'utf8'));
    if (owner.schemaVersion !== OWNER_SCHEMA || owner.version !== VERSION) {
      throw new Error('Existing platform-package owner record is invalid.');
    }
    rmSync(OUTPUT_DIRECTORY, { recursive: true, force: true });
  }
  mkdirSync(KIT_DIRECTORY, { recursive: true });
  writeFileSync(
    OWNER_PATH,
    `${JSON.stringify({ schemaVersion: OWNER_SCHEMA, version: VERSION }, null, 2)}\n`,
  );
}

function copySource(relativePath) {
  assertSafeRelative(relativePath);
  const source = path.resolve(PROJECT_ROOT, relativePath);
  const destination = path.resolve(KIT_DIRECTORY, relativePath);
  if (!existsSync(source) || !statSync(source).isFile()) {
    throw new Error(`Package source is missing or not a file: ${relativePath}`);
  }
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

function templateFor(osFamily) {
  return {
    schemaVersion: 'activation-energy-studio/platform-run-input/v1',
    runId: `REPLACE_WITH_GENUINE_${osFamily.toUpperCase()}_RUN_ID`,
    observer: {
      name: 'REPLACE_WITH_REAL_OBSERVER_NAME',
      organization: 'REPLACE_WITH_REAL_ORGANIZATION_OR_REMOVE_FIELD',
    },
    startedAt: 'REPLACE_WITH_UTC_RUN_START',
    endedAt: 'REPLACE_WITH_UTC_RUN_END',
    environment: {
      os: {
        family: osFamily,
        edition: 'REPLACE_WITH_OBSERVED_OS_EDITION',
        build: 'REPLACE_WITH_OBSERVED_OS_BUILD',
        architecture: 'REPLACE_WITH_OBSERVED_ARCHITECTURE',
      },
      runtime: {
        documentProtocol: 'file:',
        onlineStateDuringRun: false,
        userAgent: 'REPLACE_WITH_OBSERVED_USER_AGENT',
        javascriptEngine: 'REPLACE_WITH_OBSERVED_ENGINE_VERSION',
      },
      browser: {
        name: 'Google Chrome (headless)',
        version: 'REPLACE_WITH_OBSERVED_BROWSER_VERSION',
        engine: 'REPLACE_WITH_OBSERVED_CHROMIUM_AND_V8_VERSIONS',
        navigatorLanguage: 'REPLACE_WITH_OBSERVED_NAVIGATOR_LANGUAGE',
        navigatorLanguages: ['REPLACE_WITH_OBSERVED_LANGUAGE_LIST'],
      },
      locale: {
        osLocale: 'REPLACE_WITH_OBSERVED_OS_LOCALE',
        timeZone: 'REPLACE_WITH_OBSERVED_TIME_ZONE',
        decimalSeparator: 'REPLACE_WITH_OBSERVED_DECIMAL_SEPARATOR',
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
        path: 'Activation-Energy-Studio-v0.3.2.html',
        sha256:
          '4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8',
      },
      goldenInput: {
        path: 'Platform-Golden-synthetic_kas_150.csv',
        sha256:
          'eeafd2d8a1dc11c385bc2906800b9b1d5647451a64cd400eafd50a83579f8b19',
      },
      selfTestJson: {
        path: 'activation-energy-platform-self-test-v0.3.2-pass.json',
        sha256: 'REPLACE_WITH_COMPUTED_SHA256',
      },
      reportJson: {
        path: 'platform-golden.json',
        sha256: 'REPLACE_WITH_COMPUTED_SHA256',
      },
      reportCsv: {
        path: 'platform-golden-results.csv',
        sha256: 'REPLACE_WITH_COMPUTED_SHA256',
      },
      reportPdf: {
        path: 'platform-golden-report.pdf',
        sha256: 'REPLACE_WITH_COMPUTED_SHA256',
      },
      networkHar: {
        path: 'network.har',
        sha256: 'REPLACE_WITH_COMPUTED_SHA256',
      },
      screenshot: {
        path: 'final-state.png',
        sha256: 'REPLACE_WITH_COMPUTED_SHA256',
      },
      rawCdpEvents: {
        path: 'raw-cdp-events.json',
        sha256: 'REPLACE_WITH_COMPUTED_SHA256',
      },
      hostedRunMetadata: {
        path: 'hosted-run-metadata.json',
        sha256: 'REPLACE_WITH_COMPUTED_SHA256',
      },
      hostedWorkflowPreflight: {
        path: 'hosted-workflow-preflight.json',
        sha256: 'REPLACE_WITH_COMPUTED_SHA256',
      },
      hostedUploadReceipt: {
        path: 'hosted-upload-receipt.json',
        sha256: 'REPLACE_WITH_COMPUTED_SHA256',
      },
    },
  };
}

function uploadReceiptTemplate(osFamily) {
  return {
    schemaVersion:
      'activation-energy-studio/github-actions-artifact-receipt/v1',
    provider: 'GitHub Actions',
    repository: 'REPLACE_WITH_OWNER_SLASH_REPOSITORY',
    workflow: 'Hosted Platform Validation v0.3.2',
    runId: 'REPLACE_WITH_GITHUB_RUN_ID',
    runAttempt: 'REPLACE_WITH_GITHUB_RUN_ATTEMPT',
    commitSha: 'REPLACE_WITH_40_LOWERCASE_HEX_COMMIT_SHA',
    artifactId: 'REPLACE_WITH_POSITIVE_DECIMAL_ARTIFACT_ID',
    artifactName:
      `REPLACE_WITH_hosted-platform-v0.3.2-${osFamily}-RUN_ID-RUN_ATTEMPT`,
    artifactUrl: 'REPLACE_WITH_EXACT_ACTIONS_UPLOAD_ARTIFACT_URL',
    artifactDigest: 'REPLACE_WITH_64_LOWERCASE_HEX_UPLOAD_ARTIFACT_DIGEST',
    capturedAtUtc: 'REPLACE_WITH_ISO_8601_UTC_TIMESTAMP',
    claimBoundary:
      'DECLARED_GITHUB_ACTIONS_UPLOAD_OUTPUT_NOT_AUTHENTICATED_BY_SOFTWARE',
  };
}

function writeGeneratedKitFiles() {
  const templatesDirectory = path.resolve(
    KIT_DIRECTORY,
    'evidence/platform/v0.3.2/templates',
  );
  mkdirSync(templatesDirectory, { recursive: true });
  for (const osFamily of ['macos', 'windows11', 'ubuntu']) {
    writeFileSync(
      path.resolve(templatesDirectory, `platform-run-input.${osFamily}.json`),
      `${JSON.stringify(templateFor(osFamily), null, 2)}\n`,
    );
    writeFileSync(
      path.resolve(
        templatesDirectory,
        `hosted-upload-receipt.${osFamily}.template.json`,
      ),
      `${JSON.stringify(uploadReceiptTemplate(osFamily), null, 2)}\n`,
    );
  }
  writeFileSync(
    path.resolve(KIT_DIRECTORY, 'README.md'),
    `# Activation Energy Studio Platform Validation Kit v0.3.2

This repository-bound kit executes and records genuine platform runs against
the exact candidate SHA-256
\`4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8\`.

Run \`npm ci\`, verify the candidate freeze, and dispatch
\`.github/workflows/platform-validation-v032.yml\` from a connected GitHub
repository. The required matrix is Ubuntu 24.04, macOS 15, and Windows 11 ARM.
The harness opens the local HTML through \`file://\`, applies browser offline
mode, captures descendant targets and HAR data, runs the fixed scientific flow,
and retains JSON, CSV, PDF, screenshot, self-test, and raw CDP event evidence.
The v0.3.2 recorder requires the raw CDP file, hosted run metadata, workflow
preflight, and upload receipt as hash-bound artifacts. The upload receipt must
be copied from the genuine GitHub Actions upload outputs; the software does not
authenticate that external declaration.

Draft input templates intentionally contain refusal placeholders and false
operator confirmations. A real operator must enter observed values, compute all
artifact hashes independently, and confirm each statement only after the run.
Use \`scripts/create-platform-evidence-record-v032.mjs\` for one-run records.

A local macOS diagnostic, a green workflow, or a deterministic matrix is not a
platform PASS. AC-PLAT-01 and AC-PLAT-02 remain EXTERNAL_OPEN until all three
genuine records and independent human review are complete.
`,
  );
  writeFileSync(
    path.resolve(KIT_DIRECTORY, 'package.json'),
    `${JSON.stringify(KIT_PACKAGE, null, 2)}\n`,
  );
  const lockResult = spawnSync(
    'npm',
    [
      'install',
      '--package-lock-only',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ],
    {
      cwd: KIT_DIRECTORY,
      encoding: 'utf8',
    },
  );
  if (lockResult.status !== 0) {
    throw new Error(
      `Could not generate the minimal kit package lock.\n${lockResult.stderr || lockResult.stdout}`,
    );
  }
}

function payloadEntries() {
  const entries = [];
  function walk(directory) {
    for (const name of readdirSync(directory).sort()) {
      const absolute = path.resolve(directory, name);
      const metadata = statSync(absolute);
      if (metadata.isDirectory()) walk(absolute);
      else if (metadata.isFile()) {
        const bytes = readFileSync(absolute);
        entries.push({
          path: portable(path.relative(KIT_DIRECTORY, absolute)),
          bytes: bytes.length,
          sha256: sha256(bytes),
        });
      }
    }
  }
  walk(KIT_DIRECTORY);
  return entries;
}

function buildArchive() {
  const zipInput = {};
  for (const entry of payloadEntries()) {
    zipInput[`${KIT_NAME}/${entry.path}`] = [
      readFileSync(path.resolve(KIT_DIRECTORY, entry.path)),
      { mtime: FIXED_ZIP_TIME },
    ];
  }
  const archiveBytes = Buffer.from(zipSync(zipInput, { level: 9 }));
  writeFileSync(ARCHIVE_PATH, archiveBytes);
  writeFileSync(
    ARCHIVE_CHECKSUM_PATH,
    `${sha256(archiveBytes)}  ${path.basename(ARCHIVE_PATH)}\n`,
  );
}

function runCheck(
  command,
  argumentsList,
  environment = {},
  cwd = PROJECT_ROOT,
) {
  const result = spawnSync(command, argumentsList, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  });
  if (result.status !== 0) {
    throw new Error(
      `Verification command failed: ${command} ${argumentsList.join(' ')}\n${result.stderr || result.stdout}`,
    );
  }
  return {
    command: [command, ...argumentsList].join(' '),
    ...(Object.keys(environment).length > 0 ? { environment } : {}),
    status: 'PASS',
  };
}

function runExtractedKitSmoke() {
  const temporaryRoot = mkdtempSync(
    path.join(os.tmpdir(), 'activation-energy-platform-kit-v032-'),
  );
  try {
    const extracted = unzipSync(readFileSync(ARCHIVE_PATH));
    for (const [relativePath, bytes] of Object.entries(extracted)) {
      const destination = path.resolve(temporaryRoot, relativePath);
      const relativeDestination = path.relative(temporaryRoot, destination);
      if (
        relativeDestination.startsWith('..') ||
        path.isAbsolute(relativeDestination)
      ) {
        throw new Error(`Unsafe archive entry: ${relativePath}`);
      }
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, Buffer.from(bytes));
    }
    const extractedKit = path.resolve(temporaryRoot, KIT_NAME);
    const checks = [
      runCheck(
        'npm',
        ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
        {},
        extractedKit,
      ),
      runCheck('npm', ['run', 'verify:candidate'], {}, extractedKit),
      runCheck('npm', ['run', 'test:platform-evidence'], {}, extractedKit),
      runCheck('npm', ['run', 'test:hosted-platform'], {}, extractedKit),
      runCheck(
        'npm',
        ['run', 'record:platform-evidence', '--', '--help'],
        {},
        extractedKit,
      ),
      runCheck(
        'npm',
        ['run', 'record:platform-human-review', '--', '--help'],
        {},
        extractedKit,
      ),
      runCheck(
        'npm',
        ['run', 'validate:hosted-platform', '--', '--help'],
        {},
        extractedKit,
      ),
    ];
    return checks.map((check) => ({ ...check, context: 'EXTRACTED_KIT' }));
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function existingGenuineRecords() {
  return ['macos', 'windows11', 'ubuntu']
    .map((osFamily) => ({
      osFamily,
      path: `evidence/platform/v0.3.2/retained/${osFamily}/evidence-record.json`,
    }))
    .filter((entry) => existsSync(path.resolve(PROJECT_ROOT, entry.path)))
    .map((entry) => {
      const bytes = readFileSync(path.resolve(PROJECT_ROOT, entry.path));
      return { ...entry, bytes: bytes.length, sha256: sha256(bytes) };
    });
}

async function main() {
  const freezeResult = await verifyExternalCandidateFreeze();
  prepareOutputDirectory();
  const freeze = readJson(
    'output/v0.3.2-external-validation/CANDIDATE_FREEZE.json',
  );
  const sourceSet = [
    ...new Set([
      ...PLATFORM_SOURCES,
      'output/v0.3.2-external-validation/CANDIDATE_FREEZE.json',
      'output/v0.3.2-external-validation/CANDIDATE_FREEZE.sha256',
      ...freeze.boundArtifacts.map((artifact) => artifact.path),
    ]),
  ].sort();
  sourceSet.forEach(copySource);
  writeGeneratedKitFiles();

  const manifestPath = path.resolve(KIT_DIRECTORY, 'PACKAGE_MANIFEST.json');
  const packageManifest = {
    schemaVersion:
      'activation-energy-studio/platform-validation-package/v1',
    releaseVersion: VERSION,
    status: 'TOOLING_READY_GENUINE_DEVICE_EVIDENCE_OPEN',
    candidateSha256: freezeResult.candidateSha256,
    candidateFreezeSha256: sha256(
      readFileSync(
        path.resolve(
          PROJECT_ROOT,
          'output/v0.3.2-external-validation/CANDIDATE_FREEZE.json',
        ),
      ),
    ),
    gateIds: ['AC-PLAT-01', 'AC-PLAT-02'],
    claimBoundary:
      'This package prepares collection and validation. It does not supply nonlocal device evidence or independent human review.',
    files: payloadEntries(),
  };
  writeFileSync(manifestPath, `${JSON.stringify(packageManifest, null, 2)}\n`);
  buildArchive();

  const checks = [
    runCheck('node', ['scripts/verify-v0.3.2-external-candidate.mjs']),
    runCheck('node', ['--test', 'tests/platform-evidence-record.test.mjs']),
    runCheck(
      'node',
      ['--test', 'tests/platform-evidence-record.test.mjs'],
      { AES_PLATFORM_VALIDATION_VERSION: '0.3.2' },
    ),
    runCheck(
      'npx',
      ['--no-install', 'vitest', 'run', 'tests/platform-human-review-record.test.ts'],
      { AES_PLATFORM_VALIDATION_VERSION: '0.3.2' },
    ),
    runCheck('node', ['--test', 'tests/hosted-platform-validation.test.mjs']),
    runCheck(
      'node',
      ['--test', 'tests/hosted-platform-validation.test.mjs'],
      { AES_PLATFORM_VALIDATION_VERSION: '0.3.2' },
    ),
    runCheck('node', [
      '--test',
      'tests/hosted-platform-v032-contract.test.mjs',
      'tests/local-macos-platform-diagnostic-v032.test.mjs',
    ]),
    runCheck('node', ['scripts/verify-local-macos-diagnostic.mjs']),
    runCheck('node', ['scripts/verify-local-macos-diagnostic-v032.mjs']),
    ...runExtractedKitSmoke(),
  ];

  const localManifestPath =
    'evidence/platform/v0.3.2/retained/local-macos-diagnostic/LOCAL_MACOS_DIAGNOSTIC_MANIFEST.json';
  const localManifestBytes = readFileSync(
    path.resolve(PROJECT_ROOT, localManifestPath),
  );
  const failedRoot = path.resolve(
    PROJECT_ROOT,
    'evidence/platform/v0.3.2/failed',
  );
  const failedAttempts = existsSync(failedRoot)
    ? readdirSync(failedRoot)
        .sort()
        .map((name) => ({
          path: `evidence/platform/v0.3.2/failed/${name}`,
          classification: 'FAILED_LOCAL_DIAGNOSTIC_NOT_PLATFORM_EVIDENCE',
        }))
    : [];
  const genuineRecords = existingGenuineRecords();
  const packageManifestBytes = readFileSync(manifestPath);
  const archiveBytes = readFileSync(ARCHIVE_PATH);
  const archiveChecksumBytes = readFileSync(ARCHIVE_CHECKSUM_PATH);
  const status = {
    schemaVersion:
      'activation-energy-studio/platform-external-evidence-status/v1',
    releaseVersion: VERSION,
    status: 'TOOLING_READY_EXTERNAL_EVIDENCE_OPEN',
    gateIds: ['AC-PLAT-01', 'AC-PLAT-02'],
    candidate: {
      sha256: freezeResult.candidateSha256,
      freezeSha256: packageManifest.candidateFreezeSha256,
    },
    packageArtifacts: [
      {
        role: 'package-manifest',
        path: portable(path.relative(PROJECT_ROOT, manifestPath)),
        bytes: packageManifestBytes.length,
        sha256: sha256(packageManifestBytes),
      },
      {
        role: 'deterministic-zip',
        path: portable(path.relative(PROJECT_ROOT, ARCHIVE_PATH)),
        bytes: archiveBytes.length,
        sha256: sha256(archiveBytes),
      },
      {
        role: 'zip-checksum-sidecar',
        path: portable(path.relative(PROJECT_ROOT, ARCHIVE_CHECKSUM_PATH)),
        bytes: archiveChecksumBytes.length,
        sha256: sha256(archiveChecksumBytes),
      },
    ],
    technicalReadiness: {
      state: 'READY_FOR_GENUINE_DEVICE_EXECUTION',
      legacyV020CompatibilityPreserved: true,
      v032ContractReady: true,
      checks,
    },
    actualRetainedOsEvidenceSet: {
      genuineOneRunRecords: genuineRecords,
      localDiagnostics: [
        {
          osFamily: 'macos',
          path: localManifestPath,
          bytes: localManifestBytes.length,
          sha256: sha256(localManifestBytes),
          classification:
            'LOCAL_AUTOMATED_DIAGNOSTIC_NOT_PLATFORM_EVIDENCE',
        },
      ],
      failedAttempts,
    },
    missingExternalRequirements: [
      'Genuine macOS one-run evidence record with hosted origin',
      'Genuine Windows 11 one-run evidence record with hosted origin',
      'Genuine Ubuntu 24.04 one-run evidence record with hosted origin',
      'Deterministic three-OS matrix record',
      'Independent hash-bound human review of raw CDP events, HAR, screenshot, PDF, exports, identity, and deviations',
    ],
    matrixRecordPresent: false,
    independentHumanReviewPresent: false,
    externalEvidenceComplete: false,
    eligibleForPlatformGateClosure: false,
    gateStatus: {
      'AC-PLAT-01': 'EXTERNAL_OPEN',
      'AC-PLAT-02': 'EXTERNAL_OPEN',
    },
    claimBoundary:
      'Technical collection infrastructure and one local diagnostic are ready. Cross-platform compatibility and platform acceptance are not established.',
  };
  writeFileSync(STATUS_PATH, `${JSON.stringify(status, null, 2)}\n`);
  process.stdout.write(
    `PASS PLATFORM_VALIDATION_PACKAGE_V032 files=${packageManifest.files.length} archive=${sha256(archiveBytes)} externalEvidenceComplete=false\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(
      `FAIL PLATFORM_VALIDATION_PACKAGE_V032 ${error?.message ?? String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
