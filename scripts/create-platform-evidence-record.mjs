#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import {
  HOSTED_WORKFLOW_PREFLIGHT_NAME,
  validateHostedWorkflowPreflight,
} from './write-hosted-workflow-preflight.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');

const PLATFORM_CONTRACT_VERSION =
  process.env.AES_PLATFORM_VALIDATION_VERSION ?? '0.2.0';
if (!['0.2.0', '0.3.2'].includes(PLATFORM_CONTRACT_VERSION)) {
  throw new Error(
    `Unsupported AES_PLATFORM_VALIDATION_VERSION: ${PLATFORM_CONTRACT_VERSION}`,
  );
}
const IS_V032_CONTRACT = PLATFORM_CONTRACT_VERSION === '0.3.2';
const hostedPlatformHelper = IS_V032_CONTRACT
  ? await import('./platform-hosted-ci-v032.mjs')
  : await import('./platform-hosted-ci.mjs');
const {
  cdpEventsToHar,
  validateTargetLedger,
} = hostedPlatformHelper;
const SCIENTIFIC_COMPARATOR_FILE = IS_V032_CONTRACT
  ? 'compare-scientific-reports-v032.mjs'
  : 'compare-scientific-reports.mjs';
const scientificComparator = IS_V032_CONTRACT
  ? await import('./compare-scientific-reports-v032.mjs')
  : await import('./compare-scientific-reports.mjs');
const { scientificReportHash } = scientificComparator;
const INPUT_SCHEMA = 'activation-energy-studio/platform-run-input/v1';
const OUTPUT_SCHEMA = 'activation-energy-studio/platform-evidence-record/v1';
const RELEASE_FILE_NAME =
  `Activation-Energy-Studio-v${PLATFORM_CONTRACT_VERSION}.html`;
const GOLDEN_CHECKSUM_NAME = 'Platform-Golden-synthetic_kas_150.csv';
const REPORT_SCHEMA = IS_V032_CONTRACT
  ? 'activation-energy-studio/project-report/v6'
  : 'activation-energy-studio/project-report/v4';
const EXPECTED_APP_VERSION = PLATFORM_CONTRACT_VERSION;
const EXPECTED_CORE_MATH_VERSION = 'activation-energy-core/v2';
const EXPECTED_FORMULA_SET_VERSION = 'activation-energy-formulas/v1';
const EXPECTED_REPORT_SCHEMA_VERSION = REPORT_SCHEMA;
const CANDIDATE_FREEZE_SCHEMA =
  'activation-energy-studio/external-validation-candidate-freeze/v1';
const CANDIDATE_FREEZE_RELATIVE_PATH =
  'output/v0.3.2-external-validation/CANDIDATE_FREEZE.json';
const CANDIDATE_FREEZE_SHA_RELATIVE_PATH =
  'output/v0.3.2-external-validation/CANDIDATE_FREEZE.sha256';
const PLATFORM_CHECKSUM_RELATIVE_PATH = IS_V032_CONTRACT
  ? 'evidence/platform/v0.3.2/PLATFORM_INPUT_SHA256SUMS.txt'
  : 'release/SHA256SUMS.txt';
const PLATFORM_PROTOCOL_RELATIVE_PATH = IS_V032_CONTRACT
  ? 'evidence/platform/v0.3.2/PLATFORM_VALIDATION_PROTOCOL.md'
  : 'PLATFORM_VALIDATION_PROTOCOL.md';
const SELF_TEST_SCHEMA = 'activation-energy-studio/runtime-self-test/v1';
const SELF_TEST_CONTRACT = 'platform-scientific-self-test/1';
const SELF_TEST_GATE_BOUNDARY = 'NOT_CLOSED_BY_SELF_TEST';
const HOSTED_METADATA_SCHEMA = 'activation-energy-studio/hosted-platform-run/v1';
const HOSTED_METADATA_STATUS =
  'AUTOMATED_RUN_EVIDENCE_AWAITING_HUMAN_REVIEW';
const HOSTED_METADATA_CLAIM_BOUNDARY =
  'Automated hosted evidence awaits human review and does not close a platform criterion by itself.';
const HOSTED_UPLOAD_RECEIPT_SCHEMA =
  'activation-energy-studio/github-actions-artifact-receipt/v1';
const V032_HOSTED_WORKFLOW_NAME = 'Hosted Platform Validation v0.3.2';
const V032_HOSTED_WORKFLOW_PATH =
  '.github/workflows/platform-validation-v032.yml';
const V032_HOSTED_ACTION_COMMITS = Object.freeze({
  checkout: Object.freeze({
    environment: 'AES_ACTION_CHECKOUT_SHA',
    commitSha: 'd23441a48e516b6c34aea4fa41551a30e30af803',
  }),
  setupNode: Object.freeze({
    environment: 'AES_ACTION_SETUP_NODE_SHA',
    commitSha: '249970729cb0ef3589644e2896645e5dc5ba9c38',
  }),
  uploadArtifact: Object.freeze({
    environment: 'AES_ACTION_UPLOAD_ARTIFACT_SHA',
    commitSha: 'b7c566a772e6b6bfb58ed0dc250532a479d7789f',
  }),
});
const V032_RUNNER_CONTRACT = Object.freeze({
  macos: Object.freeze({
    runnerLabel: 'macos-15',
    platform: 'darwin',
    architecture: 'arm64',
    runnerOs: 'macos',
    navigatorPlatform: 'MacIntel',
    userAgentPattern: /Macintosh/u,
    forbiddenUserAgentPattern: /Windows NT|Linux x86_64/u,
  }),
  windows11: Object.freeze({
    runnerLabel: 'windows-11-arm',
    platform: 'win32',
    architecture: 'arm64',
    runnerOs: 'windows',
    navigatorPlatform: 'Win32',
    userAgentPattern: /Windows NT 10\.0/u,
    forbiddenUserAgentPattern: /Macintosh|Linux x86_64/u,
  }),
  ubuntu: Object.freeze({
    runnerLabel: 'ubuntu-24.04',
    platform: 'linux',
    architecture: 'x64',
    runnerOs: 'linux',
    navigatorPlatform: 'Linux x86_64',
    userAgentPattern: /Linux x86_64/u,
    forbiddenUserAgentPattern: /Macintosh|Windows NT/u,
  }),
});
const SELF_TEST_PAYLOAD_CANONICALIZATION = Object.freeze({
  id: 'platform-self-test-scientific-payload-canonical-v1',
  activationEnergyDecimalPlaces: 6,
  r2DecimalPlaces: 12,
  alphaDecimalPlaces: 6,
  thresholdDecimalPlaces: 6,
  integerFields: ['n'],
  categoricalFields: 'exact',
  arrayOrder: 'preserved',
  rawPayloadRetention: 'full-precision',
});
const EXPECTED_SCIENTIFIC_PAYLOAD_SHA256 =
  '2b53c8311cf5b4fda612a455d92e00a6e3b9eaa6ad24e293430af05ee4eae2ba';
const EXPECTED_SCIENTIFIC_BUILD_SHA256 =
  IS_V032_CONTRACT
    ? '4c834b6f8acbaed7d893049ab9b38fab9ac6b88f7691b76f5151bf3dae513756'
    : '38a8d33c1d1d90e361078ae98bb4721dee6442e16453166df4219bc69f29d0a7';
const EXPECTED_SELF_TEST_CLAIM_BOUNDARY =
  'PASS proves only that this browser runtime reproduced the locked embedded scientific fixture without a network call in the self-test implementation. It does not prove a complete Windows/macOS/Linux platform gate, zero-request HAR evidence, user-data correctness, experimental truth, or mechanism identification.';
const REQUIRED_SELF_TEST_CHECK_IDS = [
  'BUILD-FINGERPRINT',
  'INPUT-SHA256',
  'INGESTION',
  'ADAPTER',
  'GLOBAL-REFUSALS',
  'EXPECTED-WARNINGS',
  'METHOD-FWO',
  'METHOD-KAS',
  'METHOD-STARINK',
  'METHOD-FRIEDMAN',
  'SCIENTIFIC-PAYLOAD-SHA256',
];
const MIN_SCREENSHOT_BYTES = 1_024;
const MIN_SCREENSHOT_WIDTH = 640;
const MIN_SCREENSHOT_HEIGHT = 360;
const MAX_SCREENSHOT_DIMENSION = 16_384;
const MAX_SCREENSHOT_PIXELS = 100_000_000;
const REQUIRED_METHODS = ['FWO', 'KAS', 'STARINK', 'FRIEDMAN'];
const EXPECTED_ALPHA_GRID = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const REQUIRED_NETWORK_COVERAGE = [
  'page-open',
  'upload',
  'analysis',
  'json-export',
  'csv-export',
  'pdf-export',
];
const REQUIRED_CONFIRMATIONS = [
  'releaseAndInputHashesChecked',
  'contextValuesRecorded',
  'analysisCompleted',
  'allExportsSaved',
  'networkLogSavedBeforeReconnect',
];
const BASE_REQUIRED_ARTIFACT_ROLES = [
  'release',
  'goldenInput',
  'selfTestJson',
  'reportJson',
  'reportCsv',
  'reportPdf',
  'networkHar',
  'screenshot',
];
const V032_HOSTED_ORIGIN_ARTIFACT_ROLES = [
  'rawCdpEvents',
  'hostedRunMetadata',
  'hostedWorkflowPreflight',
  'hostedUploadReceipt',
];
const REQUIRED_ARTIFACT_ROLES = [
  ...BASE_REQUIRED_ARTIFACT_ROLES,
  ...(IS_V032_CONTRACT ? V032_HOSTED_ORIGIN_ARTIFACT_ROLES : []),
];
const CSV_HEADERS = [
  'schemaVersion',
  'applicationVersion',
  ...(IS_V032_CONTRACT
    ? [
        'sourceProvenanceKind',
        'sourceExampleId',
        'sourceCitationLabel',
        'sourceCitationDoi',
        'sourceCitationUrl',
        'sourceLicenseIdentifier',
        'sourceLicenseName',
        'sourceLicenseUrl',
        'sourceLicenseScope',
        'sourceType',
        'sourceExtractionSteps',
        'sourceTransformationSteps',
        'sourcePrintedPrecision',
        'sourceRounding',
        'separateDatasetLicenseExists',
        'separateDatasetLicenseIdentifier',
        'separateDatasetLicenseScope',
        'sourceClaimLimits',
      ]
    : []),
  'resultId',
  'quantity',
  'claimBoundary',
  'confidenceBoundary',
  'sample',
  'process',
  'stage',
  'atmosphere',
  'method',
  'resultType',
  'formulaId',
  'alpha',
  'activationEnergyKJPerMol',
  'confidence95LowerKJPerMol',
  'confidence95UpperKJPerMol',
  'n',
  'rawObservationCount',
  'residualDegreesOfFreedom',
  'regressionInputAggregation',
  'r2',
  'slope',
  'slopeStandardError',
  'status',
  ...(IS_V032_CONTRACT ? ['disposition'] : []),
];

export class PlatformEvidenceValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PlatformEvidenceValidationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PlatformEvidenceValidationError(code, message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function objectAt(value, label) {
  if (!isPlainObject(value)) fail('INPUT_INVALID', `${label} must be an object.`);
  return value;
}

function allowedKeys(value, allowed, label) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    fail('INPUT_INVALID', `${label} contains unsupported field(s): ${unexpected.join(', ')}.`);
  }
}

function stringAt(value, label, { pattern } = {}) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('INPUT_INVALID', `${label} must be a non-empty string.`);
  }
  if (pattern && !pattern.test(value)) fail('INPUT_INVALID', `${label} has an invalid format.`);
  return value;
}

function observerNameAt(value, label) {
  const name = stringAt(value, label);
  const normalized = name
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, ' ')
    .trim();
  const tokens = normalized.split(/\s+/u);
  const placeholderTokens = new Set([
    'REPLACE',
    'AWAITING',
    'TBD',
    'TODO',
    'UNKNOWN',
    'PENDING',
    'PLACEHOLDER',
    'UNASSIGNED',
  ]);
  const placeholderPhrases = new Set([
    'N A',
    'NONE',
    'NOT ASSIGNED',
    'TO BE CONFIRMED',
    'TO BE DETERMINED',
  ]);
  if (
    tokens.some((token) => placeholderTokens.has(token))
    || placeholderPhrases.has(normalized)
  ) {
    fail('INPUT_INVALID', `${label} must identify the real observer, not a placeholder.`);
  }
  return name;
}

function booleanAt(value, label, expected) {
  if (typeof value !== 'boolean') fail('INPUT_INVALID', `${label} must be boolean.`);
  if (expected !== undefined && value !== expected) {
    fail('PROTOCOL_CONTRADICTION', `${label} must be ${String(expected)}.`);
  }
  return value;
}

function utcTime(value, label) {
  const text = stringAt(value, label, {
    pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/,
  });
  const epoch = Date.parse(text);
  if (!Number.isFinite(epoch)) fail('INPUT_INVALID', `${label} is not a valid UTC timestamp.`);
  return { text, epoch };
}

function arrayOfStrings(value, label, { nonEmpty = false } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    fail('INPUT_INVALID', `${label} must be ${nonEmpty ? 'a non-empty' : 'an'} array.`);
  }
  return value.map((entry, index) => stringAt(entry, `${label}[${index}]`));
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

function sameSet(left, right) {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function selfTestFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('SELF_TEST_INVALID', `${label} must be a finite number.`);
  }
  return value;
}

function fixedSelfTestDecimal(value, decimalPlaces, label) {
  const fixed = selfTestFiniteNumber(value, label).toFixed(decimalPlaces);
  return Number(fixed) === 0
    ? `0.${'0'.repeat(decimalPlaces)}`
    : fixed;
}

function canonicalSelfTestScientificPayload(payload) {
  const scientificPayload = objectAt(payload, 'selfTestJson.scientificPayload');
  allowedKeys(
    scientificPayload,
    [
      'fixtureSha256',
      'alphaGrid',
      'methods',
      'includeKissinger',
      'minR2Warning',
      'warningCodes',
      'methodsResults',
    ],
    'selfTestJson.scientificPayload',
  );
  if (!Array.isArray(scientificPayload.alphaGrid)) {
    fail('SELF_TEST_INVALID', 'selfTestJson.scientificPayload.alphaGrid must be an array.');
  }
  if (!Array.isArray(scientificPayload.methods)) {
    fail('SELF_TEST_INVALID', 'selfTestJson.scientificPayload.methods must be an array.');
  }
  if (!Array.isArray(scientificPayload.warningCodes)) {
    fail('SELF_TEST_INVALID', 'selfTestJson.scientificPayload.warningCodes must be an array.');
  }
  if (!Array.isArray(scientificPayload.methodsResults)) {
    fail('SELF_TEST_INVALID', 'selfTestJson.scientificPayload.methodsResults must be an array.');
  }
  const policy = SELF_TEST_PAYLOAD_CANONICALIZATION;
  return {
    canonicalization: policy.id,
    fixtureSha256: stringAt(
      scientificPayload.fixtureSha256,
      'selfTestJson.scientificPayload.fixtureSha256',
    ),
    alphaGrid: scientificPayload.alphaGrid.map((value, index) =>
      fixedSelfTestDecimal(
        value,
        policy.alphaDecimalPlaces,
        `selfTestJson.scientificPayload.alphaGrid[${index}]`,
      )),
    methods: scientificPayload.methods.map((value, index) =>
      stringAt(value, `selfTestJson.scientificPayload.methods[${index}]`)),
    includeKissinger: scientificPayload.includeKissinger,
    minR2Warning: fixedSelfTestDecimal(
      scientificPayload.minR2Warning,
      policy.thresholdDecimalPlaces,
      'selfTestJson.scientificPayload.minR2Warning',
    ),
    warningCodes: scientificPayload.warningCodes.map((value, index) =>
      stringAt(value, `selfTestJson.scientificPayload.warningCodes[${index}]`)),
    methodsResults: scientificPayload.methodsResults.map((rawMethod, methodIndex) => {
      const method = objectAt(
        rawMethod,
        `selfTestJson.scientificPayload.methodsResults[${methodIndex}]`,
      );
      allowedKeys(
        method,
        ['method', 'formulaId', 'status', 'estimates'],
        `selfTestJson.scientificPayload.methodsResults[${methodIndex}]`,
      );
      if (!Array.isArray(method.estimates)) {
        fail(
          'SELF_TEST_INVALID',
          `selfTestJson.scientificPayload.methodsResults[${methodIndex}].estimates must be an array.`,
        );
      }
      return {
        method: stringAt(
          method.method,
          `selfTestJson.scientificPayload.methodsResults[${methodIndex}].method`,
        ),
        formulaId: stringAt(
          method.formulaId,
          `selfTestJson.scientificPayload.methodsResults[${methodIndex}].formulaId`,
        ),
        status: stringAt(
          method.status,
          `selfTestJson.scientificPayload.methodsResults[${methodIndex}].status`,
        ),
        estimates: method.estimates.map((rawEstimate, estimateIndex) => {
          const estimate = objectAt(
            rawEstimate,
            `selfTestJson.scientificPayload.methodsResults[${methodIndex}].estimates[${estimateIndex}]`,
          );
          allowedKeys(
            estimate,
            ['alpha', 'activationEnergyKJPerMol', 'r2', 'n'],
            `selfTestJson.scientificPayload.methodsResults[${methodIndex}].estimates[${estimateIndex}]`,
          );
          if (!Number.isInteger(estimate.n)) {
            fail(
              'SELF_TEST_INVALID',
              `selfTestJson.scientificPayload.methodsResults[${methodIndex}].estimates[${estimateIndex}].n must be an integer.`,
            );
          }
          return {
            alpha: fixedSelfTestDecimal(
              estimate.alpha,
              policy.alphaDecimalPlaces,
              `selfTestJson.scientificPayload.methodsResults[${methodIndex}].estimates[${estimateIndex}].alpha`,
            ),
            activationEnergyKJPerMol: fixedSelfTestDecimal(
              estimate.activationEnergyKJPerMol,
              policy.activationEnergyDecimalPlaces,
              `selfTestJson.scientificPayload.methodsResults[${methodIndex}].estimates[${estimateIndex}].activationEnergyKJPerMol`,
            ),
            r2: fixedSelfTestDecimal(
              estimate.r2,
              policy.r2DecimalPlaces,
              `selfTestJson.scientificPayload.methodsResults[${methodIndex}].estimates[${estimateIndex}].r2`,
            ),
            n: estimate.n,
          };
        }),
      };
    }),
  };
}

function parseChecksumFile(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const checksums = new Map();
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue;
    const match = /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line);
    if (!match) fail('REFERENCE_INVALID', `${path}:${index + 1} is not a SHA256SUMS entry.`);
    const name = match[2].trim();
    if (checksums.has(name)) fail('REFERENCE_INVALID', `Duplicate SHA-256 entry for ${name}.`);
    checksums.set(name, match[1].toLowerCase());
  }
  return checksums;
}

function validateCandidateFreeze(path, checksumPath, projectRoot) {
  let freeze;
  try {
    freeze = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail('REFERENCE_INVALID', `Candidate freeze is not valid JSON: ${error.message}`);
  }
  if (
    !isPlainObject(freeze) ||
    freeze.schemaVersion !== CANDIDATE_FREEZE_SCHEMA ||
    freeze.releaseVersion !== EXPECTED_APP_VERSION ||
    freeze.status !== 'HASH_LOCKED_EXTERNAL_VALIDATION_IN_PROGRESS'
  ) {
    fail('REFERENCE_INVALID', 'Candidate freeze identity or status is not the locked v0.3.2 contract.');
  }
  const candidate = objectAt(freeze.candidate, 'candidateFreeze.candidate');
  if (
    candidate.path !== `release/v${EXPECTED_APP_VERSION}/${RELEASE_FILE_NAME}` ||
    !Number.isSafeInteger(candidate.bytes) ||
    candidate.bytes <= 0 ||
    !/^[a-f0-9]{64}$/u.test(candidate.sha256)
  ) {
    fail('REFERENCE_INVALID', 'Candidate freeze does not contain the exact v0.3.2 release descriptor.');
  }
  const integrityPolicy = objectAt(
    freeze.integrityPolicy,
    'candidateFreeze.integrityPolicy',
  );
  if (
    integrityPolicy.releaseDirectoryMutationAllowed !== false ||
    integrityPolicy.syntheticHumanOrDeviceEvidenceAllowed !== false ||
    integrityPolicy.historicalEvidenceRelabelingAllowed !== false
  ) {
    fail('REFERENCE_INVALID', 'Candidate freeze integrity policy is not fail-closed.');
  }
  const platformGates = new Map(
    (Array.isArray(freeze.externalGateBaseline) ? freeze.externalGateBaseline : [])
      .filter((gate) => isPlainObject(gate))
      .map((gate) => [gate.id, gate]),
  );
  for (const gateId of ['AC-PLAT-01', 'AC-PLAT-02']) {
    const gate = platformGates.get(gateId);
    if (gate?.lane !== 'cross-platform-runtime' || gate?.status !== 'EXTERNAL_OPEN') {
      fail('REFERENCE_INVALID', `${gateId} is not EXTERNAL_OPEN in the candidate freeze.`);
    }
  }
  if (!Array.isArray(freeze.boundArtifacts) || freeze.boundArtifacts.length < 7) {
    fail('REFERENCE_INVALID', 'Candidate freeze omits required bound artifacts.');
  }
  const boundRoles = new Set();
  for (const artifact of freeze.boundArtifacts) {
    if (
      !isPlainObject(artifact) ||
      typeof artifact.role !== 'string' ||
      artifact.role.trim() === '' ||
      boundRoles.has(artifact.role) ||
      typeof artifact.path !== 'string' ||
      !Number.isSafeInteger(artifact.bytes) ||
      artifact.bytes <= 0 ||
      !/^[a-f0-9]{64}$/u.test(artifact.sha256)
    ) {
      fail('REFERENCE_INVALID', 'Candidate freeze has an invalid bound-artifact descriptor.');
    }
    boundRoles.add(artifact.role);
    const artifactPath = resolve(projectRoot, artifact.path);
    const relativePath = relative(projectRoot, artifactPath);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      fail('REFERENCE_INVALID', `Unsafe freeze-bound path: ${artifact.path}.`);
    }
    if (!existsSync(artifactPath)) {
      fail('REFERENCE_MISSING', `Freeze-bound artifact is missing: ${artifact.path}.`);
    }
    const metadata = statSync(artifactPath);
    if (
      !metadata.isFile() ||
      metadata.size !== artifact.bytes ||
      sha256(readFileSync(artifactPath)) !== artifact.sha256
    ) {
      fail('REFERENCE_HASH_MISMATCH', `Freeze-bound artifact changed: ${artifact.path}.`);
    }
  }
  if (!boundRoles.has('release-html')) {
    fail('REFERENCE_INVALID', 'Candidate freeze omits the release-html binding.');
  }
  const computedSha256 = sha256(readFileSync(path));
  const checksumText = readFileSync(checksumPath, 'utf8').trim();
  const checksumMatch = /^([a-f0-9]{64})  CANDIDATE_FREEZE\.json$/u.exec(checksumText);
  if (!checksumMatch || checksumMatch[1] !== computedSha256) {
    fail('REFERENCE_INVALID', 'Candidate-freeze checksum sidecar does not match the freeze bytes.');
  }
  return {
    path,
    bytes: statSync(path).size,
    sha256: computedSha256,
    checksumPath,
    checksumSha256: sha256(readFileSync(checksumPath)),
    candidate: {
      path: candidate.path,
      bytes: candidate.bytes,
      sha256: candidate.sha256,
    },
  };
}

function nativePath(manifestDirectory, declaredPath) {
  return isAbsolute(declaredPath) ? resolve(declaredPath) : resolve(manifestDirectory, declaredPath);
}

function portablePath(declaredPath) {
  return declaredPath.split(sep).join('/').replaceAll('\\', '/');
}

function verifyArtifact(role, declaration, manifestDirectory) {
  const artifact = objectAt(declaration, `artifacts.${role}`);
  allowedKeys(artifact, ['path', 'sha256'], `artifacts.${role}`);
  const declaredPath = stringAt(artifact.path, `artifacts.${role}.path`);
  const declaredSha256 = stringAt(artifact.sha256, `artifacts.${role}.sha256`, {
    pattern: /^[a-fA-F0-9]{64}$/,
  }).toLowerCase();
  const path = nativePath(manifestDirectory, declaredPath);
  if (!existsSync(path)) fail('MISSING_ARTIFACT', `${role} artifact does not exist: ${declaredPath}.`);
  let metadata;
  try {
    metadata = statSync(path);
  } catch (error) {
    fail('MISSING_ARTIFACT', `${role} artifact cannot be read: ${error.message}`);
  }
  if (!metadata.isFile() || metadata.size === 0) {
    fail('ARTIFACT_INVALID', `${role} artifact must be a non-empty regular file.`);
  }
  const bytes = readFileSync(path);
  const computedSha256 = sha256(bytes);
  if (computedSha256 !== declaredSha256) {
    fail(
      'HASH_MISMATCH',
      `${role} SHA-256 mismatch: declared ${declaredSha256}, computed ${computedSha256}.`,
    );
  }
  return {
    role,
    declaredPath: portablePath(declaredPath),
    resolvedPath: path,
    realPath: realpathSync(path),
    fileName: basename(path),
    extension: extname(path).toLowerCase(),
    sizeBytes: metadata.size,
    sha256: computedSha256,
    bytes,
  };
}

function assertFileType(artifact, extensions, label) {
  if (!extensions.includes(artifact.extension)) {
    fail('ARTIFACT_INVALID', `${label} must use ${extensions.join(' or ')} extension.`);
  }
}

function parseJsonArtifact(artifact, label) {
  try {
    return JSON.parse(artifact.bytes.toString('utf8'));
  } catch (error) {
    fail('ARTIFACT_INVALID', `${label} is not valid JSON: ${error.message}`);
  }
}

function hostedOriginFail(message) {
  fail('HOSTED_ORIGIN_INVALID', message);
}

function hostedRuntimeIdentityFail(message) {
  fail('HOSTED_RUNTIME_IDENTITY_MISMATCH', message);
}

function normalizedArchitecture(value, label) {
  const normalized = stringAt(value, label).toLowerCase();
  if (['arm64', 'aarch64'].includes(normalized)) return 'arm64';
  if (['x64', 'x86_64', 'amd64'].includes(normalized)) return 'x64';
  hostedOriginFail(`${label} uses an unsupported architecture: ${value}.`);
}

function normalizedRunnerOs(value, label) {
  const normalized = stringAt(value, label).toLowerCase();
  if (['macos', 'darwin'].includes(normalized)) return 'macos';
  if (['windows', 'win32'].includes(normalized)) return 'windows';
  if (['linux', 'ubuntu'].includes(normalized)) return 'linux';
  hostedOriginFail(`${label} uses an unsupported runner OS: ${value}.`);
}

function exactHostedString(actual, expected, label) {
  if (actual !== expected) {
    hostedOriginFail(`${label} must equal ${JSON.stringify(expected)}.`);
  }
}

function positiveDecimalString(value, label) {
  const text = stringAt(value, label);
  if (!/^[1-9]\d*$/u.test(text)) {
    hostedOriginFail(`${label} must be a positive decimal identifier.`);
  }
  return text;
}

function v032MetadataArtifactDescriptor(descriptor, artifact, label) {
  const value = objectAt(descriptor, label);
  if (
    value.path !== artifact.fileName ||
    value.sha256 !== artifact.sha256
  ) {
    hostedOriginFail(
      `${label} must hash-bind the retained ${artifact.fileName} artifact.`,
    );
  }
}

function removeDerivedEpochFields(value) {
  if (Array.isArray(value)) return value.map(removeDerivedEpochFields);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'utcEpochMs')
      .map(([key, entry]) => [key, removeDerivedEpochFields(entry)]),
  );
}

function rawCdpFail(message) {
  fail('RAW_CDP_EVIDENCE_INVALID', message);
}

function validateV032RawCdpEvidence({
  rawArtifact,
  harArtifact,
  metadata,
  runStart,
  runEnd,
  artifacts,
}) {
  assertFileType(rawArtifact, ['.json'], 'rawCdpEvents');
  if (rawArtifact.fileName !== 'raw-cdp-events.json') {
    rawCdpFail('rawCdpEvents must be named raw-cdp-events.json.');
  }
  const raw = parseJsonArtifact(rawArtifact, 'rawCdpEvents');
  const har = parseJsonArtifact(harArtifact, 'networkHar');
  if (
    raw?.schema !== 'activation-energy-studio/raw-cdp-network-events/v2' ||
    raw?.claimStatus !== HOSTED_METADATA_STATUS ||
    !Array.isArray(raw.timeline) ||
    !Array.isArray(raw.events) ||
    raw.events.length === 0 ||
    !isPlainObject(raw.targetLedger) ||
    !isPlainObject(raw.downloads)
  ) {
    rawCdpFail('Raw CDP evidence schema, claim boundary, timeline, ledger, downloads, or events are invalid.');
  }
  const rawStart = objectAt(raw.captureStartedAt, 'rawCdpEvents.captureStartedAt');
  const rawEnd = objectAt(raw.captureEndedAt, 'rawCdpEvents.captureEndedAt');
  const rawStartUtc = utcTime(rawStart.utc, 'rawCdpEvents.captureStartedAt.utc');
  const rawEndUtc = utcTime(rawEnd.utc, 'rawCdpEvents.captureEndedAt.utc');
  if (
    rawStartUtc.epoch < runStart.epoch ||
    rawEndUtc.epoch > runEnd.epoch ||
    rawEndUtc.epoch <= rawStartUtc.epoch ||
    !Number.isFinite(rawStart.monotonicMs) ||
    !Number.isFinite(rawEnd.monotonicMs) ||
    rawEnd.monotonicMs <= rawStart.monotonicMs
  ) {
    rawCdpFail('Raw CDP capture interval is invalid or outside the hosted run interval.');
  }

  const retainedFiles = objectAt(metadata.retainedFiles, 'hostedRunMetadata.retainedFiles');
  const retainedRawDescriptor = objectAt(
    retainedFiles.rawCdpEvents,
    'hostedRunMetadata.retainedFiles.rawCdpEvents',
  );
  if (
    retainedRawDescriptor.path !== rawArtifact.fileName ||
    retainedRawDescriptor.bytes !== rawArtifact.sizeBytes ||
    retainedRawDescriptor.sha256 !== rawArtifact.sha256
  ) {
    rawCdpFail('Hosted metadata does not hash-bind the retained raw-cdp-events.json file.');
  }
  const metadataTimeline = objectAt(
    metadata.actionTimeline,
    'hostedRunMetadata.actionTimeline',
  );
  const harCapture = objectAt(har?.log?._capture, 'networkHar.log._capture');
  if (harCapture.schema !== 'activation-energy-studio/cdp-capture/v2') {
    rawCdpFail('HAR does not retain the v2 CDP capture contract.');
  }
  const alignedStructures = [
    [raw.captureStartedAt, metadataTimeline.captureStartedAt, 'metadata capture start'],
    [raw.captureEndedAt, metadataTimeline.captureEndedAt, 'metadata capture end'],
    [raw.timeline, metadataTimeline.actions, 'metadata action timeline'],
    [raw.targetLedger, metadata.targetLedger, 'metadata target ledger'],
    [raw.downloads, metadata.downloads, 'metadata download ledger'],
    [raw.captureStartedAt, harCapture.captureStartedAt, 'HAR capture start'],
    [raw.captureEndedAt, harCapture.captureEndedAt, 'HAR capture end'],
    [raw.timeline, harCapture.timeline, 'HAR action timeline'],
    [raw.targetLedger, harCapture.targetLedger, 'HAR target ledger'],
    [raw.downloads, harCapture.downloads, 'HAR download ledger'],
  ];
  for (const [left, right, label] of alignedStructures) {
    if (
      !isDeepStrictEqual(
        removeDerivedEpochFields(left),
        removeDerivedEpochFields(right),
      )
    ) {
      rawCdpFail(`Raw CDP evidence differs from the ${label}.`);
    }
  }
  if (
    !Array.isArray(metadataTimeline.coverage) ||
    !sameArray(metadataTimeline.coverage, REQUIRED_NETWORK_COVERAGE) ||
    !Array.isArray(harCapture.networkCoverage) ||
    !sameArray(harCapture.networkCoverage, REQUIRED_NETWORK_COVERAGE)
  ) {
    rawCdpFail('Raw timeline coverage is not aligned with metadata and HAR coverage.');
  }
  const requiredTimeline = [
    'page-open',
    'self-test',
    'upload',
    'analysis',
    'json-export',
    'csv-export',
    'pdf-export',
  ];
  if (
    raw.timeline.length !== requiredTimeline.length ||
    raw.timeline.some(
      (entry, index) =>
        !isPlainObject(entry) ||
        entry.id !== requiredTimeline[index] ||
        entry.verified !== true,
    )
  ) {
    rawCdpFail('Raw action timeline is incomplete, unordered, or unverified.');
  }

  let validatedTargetLedger;
  try {
    validatedTargetLedger = validateTargetLedger(raw.targetLedger);
  } catch (error) {
    rawCdpFail(`Raw target ledger is invalid: ${error.message}`);
  }
  const targets = validatedTargetLedger.targets;
  const targetBySession = new Map();
  for (const target of targets) {
    if (targetBySession.has(target.sessionId)) {
      rawCdpFail('Raw target ledger contains duplicate session identities.');
    }
    targetBySession.set(target.sessionId, target);
  }
  const allowedEventMethods = new Set([
    'Network.requestWillBeSent',
    'Network.responseReceived',
    'Network.loadingFinished',
    'Network.loadingFailed',
    'Network.webSocketCreated',
    'Network.webTransportCreated',
    'Page.domContentEventFired',
    'Page.loadEventFired',
  ]);
  const networkEventCounts = new Map();
  let previousObservedEpoch = rawStartUtc.epoch;
  let previousObservedMonotonic = rawStart.monotonicMs;
  for (const [index, event] of raw.events.entries()) {
    const target = targetBySession.get(event?.sessionId);
    const observedAt = event?.observedAt;
    let observedUtc = null;
    if (isPlainObject(observedAt)) {
      try {
        observedUtc = utcTime(
          observedAt.utc,
          `rawCdpEvents.events[${index}].observedAt.utc`,
        );
      } catch {
        rawCdpFail(`Raw CDP event ${index} has an invalid observedAt timestamp.`);
      }
    }
    if (
      !isPlainObject(event) ||
      !allowedEventMethods.has(event.method) ||
      !isPlainObject(event.params) ||
      !target ||
      target.targetId !== event.targetId ||
      target.type !== event.targetType ||
      !observedUtc ||
      !Number.isFinite(observedAt.monotonicMs) ||
      observedUtc.epoch < rawStartUtc.epoch ||
      observedUtc.epoch > rawEndUtc.epoch ||
      observedAt.monotonicMs < rawStart.monotonicMs ||
      observedAt.monotonicMs > rawEnd.monotonicMs ||
      observedUtc.epoch < previousObservedEpoch ||
      observedAt.monotonicMs < previousObservedMonotonic
    ) {
      rawCdpFail(`Raw CDP event ${index} has an invalid method, target identity, or observation order.`);
    }
    previousObservedEpoch = observedUtc.epoch;
    previousObservedMonotonic = observedAt.monotonicMs;
    if (event.method.startsWith('Network.')) {
      networkEventCounts.set(
        event.sessionId,
        (networkEventCounts.get(event.sessionId) ?? 0) + 1,
      );
    }
  }
  for (const target of targets) {
    if ((networkEventCounts.get(target.sessionId) ?? 0) !== target.networkEventCount) {
      rawCdpFail(`Raw Network event count differs from target ledger session ${target.sessionId}.`);
    }
  }
  let recomputed;
  try {
    recomputed = cdpEventsToHar(raw.events, {
      capture: {
        timeline: {
          captureStartedAt: raw.captureStartedAt,
          captureEndedAt: raw.captureEndedAt,
          actions: raw.timeline,
        },
        targetLedger: raw.targetLedger,
        downloads: raw.downloads,
      },
      pageId: har.log.pages?.[0]?.id,
      pageTitle: har.log.pages?.[0]?.title,
      creatorName: har.log.creator?.name,
      creatorVersion: har.log.creator?.version,
      allowExternalForDiagnostics: false,
    });
  } catch (error) {
    rawCdpFail(`Raw CDP events cannot reproduce an offline HAR: ${error.message}`);
  }
  if (
    !isDeepStrictEqual(
      removeDerivedEpochFields(recomputed.har),
      removeDerivedEpochFields(har),
    )
  ) {
    rawCdpFail('Raw CDP events do not reproduce the retained HAR exactly.');
  }
  const rawRequests = raw.events.filter(
    (event) => event.method === 'Network.requestWillBeSent',
  );
  const harEntries = har.log.entries;
  if (
    metadata.networkInspection?.totalRequests !== harEntries.length ||
    !Array.isArray(metadata.networkInspection?.externalRequests) ||
    metadata.networkInspection.externalRequests.length !== 0 ||
    !Array.isArray(metadata.networkInspection?.unsupportedRequests) ||
    metadata.networkInspection.unsupportedRequests.length !== 0
  ) {
    rawCdpFail('Hosted metadata network inspection differs from raw CDP and HAR evidence.');
  }
  for (const role of ['selfTestJson', 'reportJson', 'reportCsv', 'reportPdf']) {
    const download = raw.downloads[role];
    if (
      !isPlainObject(download) ||
      download.complete !== true ||
      download.path !== artifacts[role].fileName ||
      download.bytes !== artifacts[role].sizeBytes ||
      download.sha256 !== artifacts[role].sha256
    ) {
      rawCdpFail(`Raw download ledger ${role} differs from the retained artifact.`);
    }
  }
  return {
    schema: raw.schema,
    sha256: rawArtifact.sha256,
    sizeBytes: rawArtifact.sizeBytes,
    captureStartedAt: rawStartUtc.text,
    captureEndedAt: rawEndUtc.text,
    eventCount: raw.events.length,
    requestCount: rawRequests.length,
    targetCount: targets.length,
    downloadCount: Object.keys(raw.downloads).length,
    harAligned: true,
    metadataAligned: true,
  };
}

function validateV032HostedOrigin({
  artifacts,
  validatedManifest,
  candidateFreeze,
}) {
  const metadataArtifact = artifacts.hostedRunMetadata;
  const preflightArtifact = artifacts.hostedWorkflowPreflight;
  const receiptArtifact = artifacts.hostedUploadReceipt;
  for (const [artifact, expectedName, label] of [
    [metadataArtifact, 'hosted-run-metadata.json', 'hostedRunMetadata'],
    [preflightArtifact, HOSTED_WORKFLOW_PREFLIGHT_NAME, 'hostedWorkflowPreflight'],
    [receiptArtifact, 'hosted-upload-receipt.json', 'hostedUploadReceipt'],
  ]) {
    assertFileType(artifact, ['.json'], label);
    if (artifact.fileName !== expectedName) {
      hostedOriginFail(`${label} must be named ${expectedName}.`);
    }
  }

  const metadata = parseJsonArtifact(metadataArtifact, 'hostedRunMetadata');
  const preflight = parseJsonArtifact(preflightArtifact, 'hostedWorkflowPreflight');
  const receipt = parseJsonArtifact(receiptArtifact, 'hostedUploadReceipt');
  const family = validatedManifest.environment.os.family;
  const expectedRunner = V032_RUNNER_CONTRACT[family];
  if (!expectedRunner) hostedOriginFail(`No v0.3.2 runner contract exists for ${family}.`);

  if (
    metadata?.schema !== HOSTED_METADATA_SCHEMA ||
    metadata?.claimStatus !== HOSTED_METADATA_STATUS ||
    metadata?.humanReviewCompleted !== false ||
    metadata?.operatorConfirmationsCompleted !== false ||
    metadata?.family !== family ||
    !Array.isArray(metadata?.platformCriteriaClosed) ||
    metadata.platformCriteriaClosed.length !== 0 ||
    metadata?.claimBoundary !== HOSTED_METADATA_CLAIM_BOUNDARY
  ) {
    hostedOriginFail(
      'hostedRunMetadata identity, claim status, review boundary, gate-closure boundary, or OS family is invalid.',
    );
  }

  const runner = objectAt(metadata.runner, 'hostedRunMetadata.runner');
  exactHostedString(
    runner.runnerLabel,
    expectedRunner.runnerLabel,
    'hostedRunMetadata.runner.runnerLabel',
  );
  exactHostedString(runner.family, family, 'hostedRunMetadata.runner.family');
  exactHostedString(
    runner.platform,
    expectedRunner.platform,
    'hostedRunMetadata.runner.platform',
  );
  if (
    normalizedArchitecture(
      runner.architecture,
      'hostedRunMetadata.runner.architecture',
    ) !== expectedRunner.architecture ||
    normalizedArchitecture(
      validatedManifest.environment.os.architecture,
      'manifest.environment.os.architecture',
    ) !== expectedRunner.architecture
  ) {
    hostedOriginFail('Hosted runner and manifest architectures do not match the fixed runner contract.');
  }
  exactHostedString(
    runner.osEdition,
    validatedManifest.environment.os.edition,
    'hostedRunMetadata.runner.osEdition',
  );
  exactHostedString(
    metadata.osBuild,
    validatedManifest.environment.os.build,
    'hostedRunMetadata.osBuild',
  );
  exactHostedString(
    metadata.osLocale,
    validatedManifest.environment.locale.osLocale,
    'hostedRunMetadata.osLocale',
  );
  for (const [value, label] of [
    [metadata.reportedArchitecture, 'hostedRunMetadata.reportedArchitecture'],
    [metadata.nodeArchitecture, 'hostedRunMetadata.nodeArchitecture'],
  ]) {
    if (normalizedArchitecture(value, label) !== expectedRunner.architecture) {
      hostedOriginFail(`${label} differs from the fixed hosted architecture.`);
    }
  }

  const provenance = objectAt(metadata.provenance, 'hostedRunMetadata.provenance');
  exactHostedString(provenance.provider, 'GitHub Actions', 'hostedRunMetadata.provenance.provider');
  exactHostedString(
    provenance.runnerEnvironment,
    'github-hosted',
    'hostedRunMetadata.provenance.runnerEnvironment',
  );
  exactHostedString(
    provenance.workflow,
    V032_HOSTED_WORKFLOW_NAME,
    'hostedRunMetadata.provenance.workflow',
  );
  const repository = stringAt(
    provenance.repository,
    'hostedRunMetadata.provenance.repository',
    { pattern: /^[^/\s]+\/[^/\s]+$/u },
  );
  const runId = positiveDecimalString(
    provenance.runId,
    'hostedRunMetadata.provenance.runId',
  );
  const runAttempt = positiveDecimalString(
    provenance.runAttempt,
    'hostedRunMetadata.provenance.runAttempt',
  );
  const commitSha = stringAt(
    provenance.commitSha,
    'hostedRunMetadata.provenance.commitSha',
    { pattern: /^[a-f0-9]{40}$/u },
  );
  const gitRef = stringAt(provenance.gitRef, 'hostedRunMetadata.provenance.gitRef');
  const workflowRefPrefix = `${repository}/${V032_HOSTED_WORKFLOW_PATH}@`;
  if (
    typeof provenance.workflowRef !== 'string' ||
    !provenance.workflowRef.startsWith(workflowRefPrefix) ||
    provenance.workflowRef.slice(workflowRefPrefix.length) !== gitRef
  ) {
    hostedOriginFail('Hosted workflow ref does not bind the v0.3.2 workflow path and git ref.');
  }
  const expectedRunUrl =
    `https://github.com/${repository}/actions/runs/${runId}/attempts/${runAttempt}`;
  exactHostedString(
    provenance.runUrl,
    expectedRunUrl,
    'hostedRunMetadata.provenance.runUrl',
  );
  if (
    normalizedRunnerOs(
      provenance.runnerOS,
      'hostedRunMetadata.provenance.runnerOS',
    ) !== expectedRunner.runnerOs ||
    normalizedArchitecture(
      provenance.runnerArchitecture,
      'hostedRunMetadata.provenance.runnerArchitecture',
    ) !== expectedRunner.architecture
  ) {
    hostedOriginFail('GitHub runner OS or architecture differs from the fixed hosted target.');
  }
  stringAt(provenance.runnerName, 'hostedRunMetadata.provenance.runnerName');
  stringAt(provenance.imageOS, 'hostedRunMetadata.provenance.imageOS');
  stringAt(provenance.imageVersion, 'hostedRunMetadata.provenance.imageVersion');
  const browserExpectation = objectAt(
    provenance.browserExpectation,
    'hostedRunMetadata.provenance.browserExpectation',
  );
  if (
    browserExpectation.product !== 'Google Chrome' ||
    browserExpectation.expectedMajor !== 150 ||
    browserExpectation.environment !== 'AES_EXPECTED_GOOGLE_CHROME_MAJOR'
  ) {
    hostedOriginFail('Hosted browser expectation is not the locked Chrome 150 contract.');
  }
  const actions = objectAt(provenance.actions, 'hostedRunMetadata.provenance.actions');
  for (const [role, expected] of Object.entries(V032_HOSTED_ACTION_COMMITS)) {
    const action = objectAt(actions[role], `hostedRunMetadata.provenance.actions.${role}`);
    if (
      action.environment !== expected.environment ||
      action.commitSha !== expected.commitSha
    ) {
      hostedOriginFail(`Hosted action pin ${role} differs from the immutable workflow commit.`);
    }
  }
  const expectedManifestRunId = `gha-${family}-${runId}-${runAttempt}`;
  exactHostedString(
    validatedManifest.runId,
    expectedManifestRunId,
    'manifest.runId',
  );

  const browser = objectAt(metadata.browser, 'hostedRunMetadata.browser');
  if (
    browser.product !== `Chrome/${browser.version}` ||
    browser.version !== validatedManifest.environment.browser.version ||
    browser.observedMajor !== 150 ||
    browser.expectedMajor !== 150 ||
    browser.headless !== true ||
    browser.userAgent !== validatedManifest.environment.runtime.userAgent ||
    !/^150\.\d+\.\d+\.\d+$/u.test(browser.version)
  ) {
    hostedOriginFail('Hosted browser metadata differs from the locked Chrome runtime identity.');
  }
  exactHostedString(
    validatedManifest.environment.browser.name,
    'Google Chrome (headless)',
    'manifest.environment.browser.name',
  );
  exactHostedString(
    validatedManifest.environment.runtime.javascriptEngine,
    `V8 ${browser.javascriptVersion}`,
    'manifest.environment.runtime.javascriptEngine',
  );
  exactHostedString(
    validatedManifest.environment.browser.engine,
    `Chromium ${browser.version}; V8 ${browser.javascriptVersion}`,
    'manifest.environment.browser.engine',
  );

  const runtime = objectAt(metadata.runtime, 'hostedRunMetadata.runtime');
  const runtimeExpectations = {
    documentProtocol: validatedManifest.environment.runtime.documentProtocol,
    onlineStateDuringRun: validatedManifest.environment.runtime.onlineStateDuringRun,
    userAgent: validatedManifest.environment.runtime.userAgent,
    navigatorLanguage: validatedManifest.environment.browser.navigatorLanguage,
    timeZone: validatedManifest.environment.locale.timeZone,
    decimalSeparator: validatedManifest.environment.locale.decimalSeparator,
  };
  for (const [key, expected] of Object.entries(runtimeExpectations)) {
    if (runtime[key] !== expected) {
      hostedOriginFail(`hostedRunMetadata.runtime.${key} differs from the run manifest.`);
    }
  }
  if (
    !Array.isArray(runtime.navigatorLanguages) ||
    !sameArray(
      runtime.navigatorLanguages,
      validatedManifest.environment.browser.navigatorLanguages,
    )
  ) {
    hostedOriginFail('Hosted runtime navigator languages differ from the run manifest.');
  }
  if (
    !expectedRunner.userAgentPattern.test(runtime.userAgent) ||
    expectedRunner.forbiddenUserAgentPattern.test(runtime.userAgent)
  ) {
    hostedRuntimeIdentityFail(
      `Hosted runtime user agent does not identify the declared ${family} target.`,
    );
  }

  const metadataStartedAt = utcTime(metadata.startedAt, 'hostedRunMetadata.startedAt');
  const metadataEndedAt = utcTime(metadata.endedAt, 'hostedRunMetadata.endedAt');
  if (
    metadataStartedAt.text !== validatedManifest.startedAt.text ||
    metadataEndedAt.text !== validatedManifest.endedAt.text
  ) {
    hostedOriginFail('Hosted metadata run interval differs from the run manifest.');
  }

  for (const role of BASE_REQUIRED_ARTIFACT_ROLES) {
    v032MetadataArtifactDescriptor(
      metadata.artifacts?.[role],
      artifacts[role],
      `hostedRunMetadata.artifacts.${role}`,
    );
  }
  const workflowPreflight = objectAt(
    metadata.workflowPreflight,
    'hostedRunMetadata.workflowPreflight',
  );
  if (
    workflowPreflight.path !== preflightArtifact.fileName ||
    workflowPreflight.bytes !== preflightArtifact.sizeBytes ||
    workflowPreflight.sha256 !== preflightArtifact.sha256
  ) {
    hostedOriginFail('Hosted metadata does not hash-bind the retained workflow preflight.');
  }
  const metadataFreeze = objectAt(metadata.candidateFreeze, 'hostedRunMetadata.candidateFreeze');
  const metadataFreezeRecord = objectAt(
    metadataFreeze.record,
    'hostedRunMetadata.candidateFreeze.record',
  );
  const metadataFreezeChecksum = objectAt(
    metadataFreeze.checksum,
    'hostedRunMetadata.candidateFreeze.checksum',
  );
  if (
    metadataFreezeRecord.path !== 'CANDIDATE_FREEZE.v0.3.2.json' ||
    metadataFreezeRecord.bytes !== candidateFreeze.bytes ||
    metadataFreezeRecord.sha256 !== candidateFreeze.sha256 ||
    metadataFreezeChecksum.path !== 'CANDIDATE_FREEZE.v0.3.2.sha256' ||
    metadataFreezeChecksum.sha256 !== candidateFreeze.checksumSha256
  ) {
    hostedOriginFail('Hosted metadata candidate-freeze descriptors differ from the current lock.');
  }

  try {
    validateHostedWorkflowPreflight(preflight, {
      osFamily: family,
      runnerLabel: expectedRunner.runnerLabel,
      nodeArchitecture: expectedRunner.architecture,
    });
  } catch (error) {
    hostedOriginFail(`Hosted workflow preflight is invalid: ${error.message}`);
  }
  const preflightObserved = objectAt(
    preflight.observedEnvironment,
    'hostedWorkflowPreflight.observedEnvironment',
  );
  for (const [key, expected] of Object.entries({
    repository,
    workflow: provenance.workflow,
    workflowRef: provenance.workflowRef,
    runId,
    runAttempt,
    commitSha,
    gitRef,
    imageOs: provenance.imageOS,
    imageVersion: provenance.imageVersion,
  })) {
    if (preflightObserved[key] !== expected) {
      hostedOriginFail(`Hosted workflow preflight ${key} differs from run provenance.`);
    }
  }
  if (
    normalizedRunnerOs(preflightObserved.runnerOs, 'hostedWorkflowPreflight.runnerOs')
      !== expectedRunner.runnerOs ||
    normalizedArchitecture(
      preflightObserved.runnerArchitecture,
      'hostedWorkflowPreflight.runnerArchitecture',
    ) !== expectedRunner.architecture ||
    preflight.runtime.platform !== expectedRunner.platform ||
    Date.parse(preflight.startedAtUtc) >= validatedManifest.startedAt.epoch
  ) {
    hostedOriginFail('Hosted workflow preflight runner identity or time boundary is invalid.');
  }

  if (receipt?.schemaVersion !== HOSTED_UPLOAD_RECEIPT_SCHEMA) {
    hostedOriginFail('Hosted upload receipt schema is invalid.');
  }
  for (const [key, expected] of Object.entries({
    provider: 'GitHub Actions',
    repository,
    workflow: provenance.workflow,
    runId,
    runAttempt,
    commitSha,
  })) {
    if (receipt[key] !== expected) {
      hostedOriginFail(`Hosted upload receipt ${key} differs from run provenance.`);
    }
  }
  const artifactId = positiveDecimalString(
    receipt.artifactId,
    'hostedUploadReceipt.artifactId',
  );
  const artifactName =
    `hosted-platform-v0.3.2-${family}-${runId}-${runAttempt}`;
  const artifactUrl =
    `https://github.com/${repository}/actions/runs/${runId}/artifacts/${artifactId}`;
  if (
    receipt.artifactName !== artifactName ||
    receipt.artifactUrl !== artifactUrl ||
    typeof receipt.artifactDigest !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(receipt.artifactDigest) ||
    receipt.claimBoundary !==
      'DECLARED_GITHUB_ACTIONS_UPLOAD_OUTPUT_NOT_AUTHENTICATED_BY_SOFTWARE'
  ) {
    hostedOriginFail('Hosted upload receipt artifact identity or claim boundary is invalid.');
  }
  const receiptCapturedAt = utcTime(
    receipt.capturedAtUtc,
    'hostedUploadReceipt.capturedAtUtc',
  );
  if (receiptCapturedAt.epoch <= validatedManifest.endedAt.epoch) {
    hostedOriginFail('Hosted upload receipt must be captured after the hosted run ended.');
  }

  const rawCdpEvidence = validateV032RawCdpEvidence({
    rawArtifact: artifacts.rawCdpEvents,
    harArtifact: artifacts.networkHar,
    metadata,
    runStart: validatedManifest.startedAt,
    runEnd: validatedManifest.endedAt,
    artifacts,
  });

  return {
    metadata,
    runtimeIdentity: {
      family,
      runnerLabel: expectedRunner.runnerLabel,
      platform: expectedRunner.platform,
      architecture: expectedRunner.architecture,
      navigatorPlatform: expectedRunner.navigatorPlatform,
    },
    publicRecord: {
      status:
        'STRUCTURALLY_HASH_BOUND_HOSTED_ORIGIN_REQUIRES_EXTERNAL_AUTHENTICITY_AUDIT',
      provider: 'GitHub Actions',
      repository,
      workflow: provenance.workflow,
      workflowRef: provenance.workflowRef,
      runId,
      runAttempt,
      runUrl: expectedRunUrl,
      commitSha,
      gitRef,
      runnerLabel: expectedRunner.runnerLabel,
      runnerOS: provenance.runnerOS,
      runnerArchitecture: provenance.runnerArchitecture,
      imageOS: provenance.imageOS,
      imageVersion: provenance.imageVersion,
      uploadArtifact: {
        artifactId,
        artifactName,
        artifactUrl,
        artifactDigest: receipt.artifactDigest,
        capturedAtUtc: receiptCapturedAt.text,
        claimBoundary: receipt.claimBoundary,
      },
      rawCdpEvidence,
      artifacts: {
        hostedRunMetadata: publicArtifact(metadataArtifact),
        hostedWorkflowPreflight: publicArtifact(preflightArtifact),
        hostedUploadReceipt: publicArtifact(receiptArtifact),
      },
      authenticityBoundary:
        'The recorder verifies internal identity alignment and retained hashes. It does not independently authenticate GitHub, the runner, the upload output, or the human observer.',
    },
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      if (field !== '') fail('CSV_INCONSISTENT', 'CSV contains a quote inside an unquoted field.');
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.endsWith('\r') ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) fail('CSV_INCONSISTENT', 'CSV ends inside a quoted field.');
  if (field !== '' || row.length > 0) {
    row.push(field.endsWith('\r') ? field.slice(0, -1) : field);
    rows.push(row);
  }
  return rows;
}

function expectedCsvValue(report, result, header) {
  if (header === 'schemaVersion') return String(report.schemaVersion);
  if (header === 'applicationVersion') return String(report.application.version);
  const value = result[header];
  return value === null || value === undefined ? '' : String(value);
}

function validateCsvExport(artifact, report) {
  assertFileType(artifact, ['.csv'], 'reportCsv');
  const text = artifact.bytes.toString('utf8');
  if (text.includes('\0')) fail('ARTIFACT_INVALID', 'reportCsv contains NUL bytes.');
  const rows = parseCsv(text);
  if (rows.length === 0 || !sameArray(rows[0], CSV_HEADERS)) {
    fail(
      'CSV_INCONSISTENT',
      `reportCsv header does not match the version ${PLATFORM_CONTRACT_VERSION} export contract.`,
    );
  }
  if (!Array.isArray(report.results) || rows.length - 1 !== report.results.length) {
    fail(
      'CSV_INCONSISTENT',
      `reportCsv has ${Math.max(0, rows.length - 1)} result row(s), JSON has ${Array.isArray(report.results) ? report.results.length : 'no'} result array.`,
    );
  }
  report.results.forEach((result, rowIndex) => {
    const actual = rows[rowIndex + 1];
    if (actual.length !== CSV_HEADERS.length) {
      fail('CSV_INCONSISTENT', `reportCsv row ${rowIndex + 2} has ${actual.length} columns.`);
    }
    for (let columnIndex = 0; columnIndex < CSV_HEADERS.length; columnIndex += 1) {
      const header = CSV_HEADERS[columnIndex];
      const expected = expectedCsvValue(report, result, header);
      if (actual[columnIndex] !== expected) {
        fail(
          'CSV_INCONSISTENT',
          `reportCsv row ${rowIndex + 2} field ${header} differs from reportJson.`,
        );
      }
    }
  });
}

function exactReportContext(report, goldenInput) {
  const expected = {
    projectName: 'Platform golden',
    sample: 'synthetic-kas',
    process: 'multi-rate thermal decomposition',
    atmosphere: 'N2',
    stage: 'supplied-alpha 0.10-0.90 window',
  };
  const context = objectAt(report.context, 'reportJson.context');
  for (const [key, value] of Object.entries(expected)) {
    if (context[key] !== value) {
      fail('REPORT_INCONSISTENT', `reportJson.context.${key} must equal ${JSON.stringify(value)}.`);
    }
  }
  if (!Array.isArray(context.sourceFiles) || context.sourceFiles.length === 0) {
    fail('REPORT_INCONSISTENT', 'reportJson.context.sourceFiles must retain the golden input.');
  }
  const sourceMatch = context.sourceFiles.find(
    (source) =>
      isPlainObject(source) &&
      String(source.sha256).toLowerCase() === goldenInput.sha256 &&
      (!IS_V032_CONTRACT ||
        source.sourceFileId === `sha256:${goldenInput.sha256}`) &&
      source.sizeBytes === goldenInput.sizeBytes,
  );
  if (!sourceMatch) {
    fail(
      'REPORT_INCONSISTENT',
      'reportJson.context.sourceFiles does not match the retained golden input hash-bound identity and size.',
    );
  }
}

function validateScientificReport(report, goldenInput, runStart, runEnd) {
  if (!isPlainObject(report) || report.schemaVersion !== REPORT_SCHEMA) {
    fail('REPORT_INCONSISTENT', `reportJson must use ${REPORT_SCHEMA}.`);
  }
  const application = objectAt(report.application, 'reportJson.application');
  if (
    application.name !== 'Activation Energy Studio' ||
    application.version !== EXPECTED_APP_VERSION ||
    application.calculationLocation !== 'local-browser'
  ) {
    fail('REPORT_INCONSISTENT', 'reportJson application identity does not match the release under test.');
  }
  const generatedAt = utcTime(report.generatedAt, 'reportJson.generatedAt');
  if (generatedAt.epoch < runStart.epoch || generatedAt.epoch > runEnd.epoch) {
    fail('REPORT_INCONSISTENT', 'reportJson.generatedAt falls outside the declared run interval.');
  }
  exactReportContext(report, goldenInput);

  const reproducibility = objectAt(report.reproducibility, 'reportJson.reproducibility');
  const configuration = objectAt(
    reproducibility.configuration,
    'reportJson.reproducibility.configuration',
  );
  if (!Array.isArray(configuration.alphaGrid) || !sameArray(configuration.alphaGrid, EXPECTED_ALPHA_GRID)) {
    fail('REPORT_INCONSISTENT', 'reportJson alpha grid is not the fixed 0.10-0.90 platform grid.');
  }
  if (
    !Array.isArray(configuration.selectedMethods) ||
    !sameSet(configuration.selectedMethods, REQUIRED_METHODS)
  ) {
    fail('REPORT_INCONSISTENT', 'reportJson selected methods are not FWO, KAS, Starink and Friedman.');
  }
  if (
    configuration.includeKissinger !== false ||
    configuration.minR2Warning !== 0.98 ||
    configuration.stageWindowCelsius !== null
  ) {
    fail('REPORT_INCONSISTENT', 'reportJson analysis configuration differs from the platform protocol.');
  }

  const analysis = objectAt(report.analysis, 'reportJson.analysis');
  if (!['success', 'partial'].includes(analysis.status)) {
    fail('REPORT_INCONSISTENT', 'reportJson analysis did not complete successfully or partially.');
  }
  if (!Array.isArray(analysis.methods)) {
    fail('REPORT_INCONSISTENT', 'reportJson.analysis.methods must be an array.');
  }
  const analyzedMethods = analysis.methods.map((entry, index) =>
    stringAt(objectAt(entry, `reportJson.analysis.methods[${index}]`).method, `reportJson.analysis.methods[${index}].method`),
  );
  if (!sameSet(analyzedMethods, REQUIRED_METHODS)) {
    fail('REPORT_INCONSISTENT', 'reportJson does not contain all four required isoconversional methods.');
  }
  if (analysis.kissinger !== undefined && analysis.kissinger !== null) {
    fail('REPORT_INCONSISTENT', 'reportJson contains a Kissinger result for a fixture without beta-Tp data.');
  }
  const eligibility = objectAt(analysis.eligibility, 'reportJson.analysis.eligibility');
  if (!Array.isArray(eligibility.commonAlphaRange) || !sameArray(eligibility.commonAlphaRange, [0.1, 0.9])) {
    fail('REPORT_INCONSISTENT', 'reportJson common alpha range must be [0.1, 0.9].');
  }
  if (!Array.isArray(report.results) || report.results.length === 0) {
    fail('REPORT_INCONSISTENT', 'reportJson must contain scientific result rows.');
  }
  const resultMethods = [...new Set(report.results.map((row) => row?.method))];
  if (!sameSet(resultMethods, REQUIRED_METHODS)) {
    fail('REPORT_INCONSISTENT', 'reportJson result rows do not cover exactly the four required methods.');
  }
  for (const method of REQUIRED_METHODS) {
    const successfulRows = report.results.filter(
      (row) =>
        row?.method === method &&
        row.status === 'success' &&
        Number.isFinite(row.alpha) &&
        Number.isFinite(row.activationEnergyKJPerMol),
    );
    const successfulAlphas = [...new Set(successfulRows.map((row) => row.alpha))].sort((left, right) => left - right);
    if (!sameArray(successfulAlphas, EXPECTED_ALPHA_GRID)) {
      fail(
        'REPORT_INCONSISTENT',
        `reportJson has no successful ${method} result at every alpha from 0.10 through 0.90.`,
      );
    }
    if (
      method === 'KAS' &&
      successfulRows.some((row) => Math.abs(row.activationEnergyKJPerMol - 150) > 1e-4)
    ) {
      fail('REPORT_INCONSISTENT', 'reportJson KAS results do not reproduce the 150 kJ/mol golden target.');
    }
  }
  return generatedAt.text;
}

function validateSelfTestRecord(
  artifact,
  goldenInput,
  runStart,
  runEnd,
  environment,
  hostedOrigin = null,
) {
  assertFileType(artifact, ['.json'], 'selfTestJson');
  const record = parseJsonArtifact(artifact, 'selfTestJson');
  if (!isPlainObject(record)) {
    fail('SELF_TEST_INVALID', 'selfTestJson must contain a JSON object.');
  }
  if (record.schema !== SELF_TEST_SCHEMA || record.contract !== SELF_TEST_CONTRACT) {
    fail('SELF_TEST_INVALID', 'selfTestJson schema or contract does not match the platform self-test.');
  }
  if (record.recordStatus !== 'PASS') {
    fail('SELF_TEST_INVALID', 'selfTestJson recordStatus must be PASS.');
  }
  if (record.platformGateStatus !== SELF_TEST_GATE_BOUNDARY) {
    fail('SELF_TEST_INVALID', `selfTestJson platformGateStatus must be ${SELF_TEST_GATE_BOUNDARY}.`);
  }
  if (record.claimBoundary !== EXPECTED_SELF_TEST_CLAIM_BOUNDARY) {
    fail('SELF_TEST_INVALID', 'selfTestJson claim boundary differs from the locked release boundary.');
  }

  const recordedAt = utcTime(record.recordedAt, 'selfTestJson.recordedAt');
  if (recordedAt.epoch < runStart.epoch || recordedAt.epoch > runEnd.epoch) {
    fail('SELF_TEST_INVALID', 'selfTestJson.recordedAt falls outside the declared run interval.');
  }

  const application = objectAt(record.application, 'selfTestJson.application');
  if (application.name !== 'Activation Energy Studio' || application.version !== EXPECTED_APP_VERSION) {
    fail('SELF_TEST_INVALID', 'selfTestJson application identity does not match the release under test.');
  }
  const scientificBuildSha256 = stringAt(
    application.scientificBuildSha256,
    'selfTestJson.application.scientificBuildSha256',
    { pattern: /^[a-f0-9]{64}$/ },
  );
  if (scientificBuildSha256 !== EXPECTED_SCIENTIFIC_BUILD_SHA256) {
    fail('SELF_TEST_INVALID', 'selfTestJson scientific build fingerprint does not match the locked release.');
  }
  for (const [key, expected] of Object.entries({
    coreMathVersion: EXPECTED_CORE_MATH_VERSION,
    formulaSetVersion: EXPECTED_FORMULA_SET_VERSION,
    reportSchemaVersion: EXPECTED_REPORT_SCHEMA_VERSION,
  })) {
    if (stringAt(application[key], `selfTestJson.application.${key}`) !== expected) {
      fail(
        'SELF_TEST_INVALID',
        `selfTestJson application ${key} does not match the locked release contract.`,
      );
    }
  }

  const runtime = objectAt(record.runtime, 'selfTestJson.runtime');
  if (runtime.pageProtocol !== 'file:' || runtime.online !== false) {
    fail('SELF_TEST_INVALID', 'selfTestJson runtime must record file: execution with navigator.onLine=false.');
  }
  if (runtime.userAgent !== environment.runtime.userAgent) {
    fail('SELF_TEST_INVALID', 'selfTestJson userAgent differs from the run manifest.');
  }
  if (runtime.timeZone !== environment.locale.timeZone) {
    fail('SELF_TEST_INVALID', 'selfTestJson timeZone differs from the run manifest.');
  }
  if (!Array.isArray(runtime.languages) || !sameArray(runtime.languages, environment.browser.navigatorLanguages)) {
    fail('SELF_TEST_INVALID', 'selfTestJson runtime languages differ from the run manifest.');
  }
  if (runtime.locale !== environment.browser.navigatorLanguage) {
    fail('SELF_TEST_INVALID', 'selfTestJson runtime locale differs from the run manifest.');
  }
  if (IS_V032_CONTRACT && hostedOrigin) {
    const expectedIdentity = hostedOrigin.runtimeIdentity;
    if (runtime.platform !== expectedIdentity.navigatorPlatform) {
      hostedRuntimeIdentityFail(
        `selfTestJson runtime.platform must identify ${expectedIdentity.family} as ${expectedIdentity.navigatorPlatform}.`,
      );
    }
    const expectedRunner = V032_RUNNER_CONTRACT[expectedIdentity.family];
    if (
      !expectedRunner.userAgentPattern.test(runtime.userAgent) ||
      expectedRunner.forbiddenUserAgentPattern.test(runtime.userAgent)
    ) {
      hostedRuntimeIdentityFail(
        `selfTestJson user agent does not identify the declared ${expectedIdentity.family} target.`,
      );
    }
    if (
      hostedOrigin.metadata.runtime.userAgent !== runtime.userAgent ||
      hostedOrigin.metadata.browser.userAgent !== runtime.userAgent ||
      hostedOrigin.metadata.runner.platform !== expectedIdentity.platform ||
      normalizedArchitecture(
        hostedOrigin.metadata.runner.architecture,
        'hostedRunMetadata.runner.architecture',
      ) !== expectedIdentity.architecture
    ) {
      hostedRuntimeIdentityFail(
        'Self-test, browser metadata, runtime metadata, and hosted runner identity are not aligned.',
      );
    }
  }

  const fixture = objectAt(record.fixture, 'selfTestJson.fixture');
  if (
    fixture.name !== 'synthetic_kas_150.csv' ||
    fixture.expectedSha256 !== goldenInput.sha256 ||
    fixture.observedSha256 !== goldenInput.sha256 ||
    fixture.sizeBytes !== goldenInput.sizeBytes ||
    fixture.experimentalData !== false
  ) {
    fail('SELF_TEST_INVALID', 'selfTestJson fixture identity does not match the retained golden input.');
  }

  const expectations = objectAt(record.expectations, 'selfTestJson.expectations');
  const declaredCanonicalization = objectAt(
    expectations.scientificPayloadCanonicalization,
    'selfTestJson.expectations.scientificPayloadCanonicalization',
  );
  allowedKeys(
    declaredCanonicalization,
    Object.keys(SELF_TEST_PAYLOAD_CANONICALIZATION),
    'selfTestJson.expectations.scientificPayloadCanonicalization',
  );
  if (
    expectations.expectedScientificPayloadSha256 !== EXPECTED_SCIENTIFIC_PAYLOAD_SHA256 ||
    !Array.isArray(expectations.alphaGrid) ||
    !sameArray(expectations.alphaGrid, EXPECTED_ALPHA_GRID) ||
    Object.entries(SELF_TEST_PAYLOAD_CANONICALIZATION).some(([key, expected]) =>
      Array.isArray(expected)
        ? !Array.isArray(declaredCanonicalization[key])
          || !sameArray(declaredCanonicalization[key], expected)
        : declaredCanonicalization[key] !== expected)
  ) {
    fail('SELF_TEST_INVALID', 'selfTestJson locked expectations differ from the release contract.');
  }

  if (record.scientificPayloadSha256 !== EXPECTED_SCIENTIFIC_PAYLOAD_SHA256) {
    fail('SELF_TEST_INVALID', 'selfTestJson scientific payload SHA-256 differs from the locked value.');
  }
  const scientificPayload = objectAt(record.scientificPayload, 'selfTestJson.scientificPayload');
  if (
    scientificPayload.fixtureSha256 !== goldenInput.sha256 ||
    !Array.isArray(scientificPayload.alphaGrid) ||
    !sameArray(scientificPayload.alphaGrid, EXPECTED_ALPHA_GRID) ||
    !Array.isArray(scientificPayload.methods) ||
    !sameArray(scientificPayload.methods, REQUIRED_METHODS) ||
    scientificPayload.includeKissinger !== false ||
    scientificPayload.minR2Warning !== 0.98
  ) {
    fail('SELF_TEST_INVALID', 'selfTestJson scientific payload configuration differs from the platform contract.');
  }
  const computedScientificPayloadSha256 = sha256(
    Buffer.from(JSON.stringify(canonicalSelfTestScientificPayload(scientificPayload)), 'utf8'),
  );
  if (computedScientificPayloadSha256 !== EXPECTED_SCIENTIFIC_PAYLOAD_SHA256) {
    fail(
      'SELF_TEST_INVALID',
      'selfTestJson canonical scientific payload does not reproduce the locked SHA-256.',
    );
  }

  if (!Array.isArray(record.checks) || record.checks.length !== REQUIRED_SELF_TEST_CHECK_IDS.length) {
    fail('SELF_TEST_INVALID', `selfTestJson must contain exactly ${REQUIRED_SELF_TEST_CHECK_IDS.length} checks.`);
  }
  const checkById = new Map();
  for (const [index, rawCheck] of record.checks.entries()) {
    const check = objectAt(rawCheck, `selfTestJson.checks[${index}]`);
    const id = stringAt(check.id, `selfTestJson.checks[${index}].id`);
    if (checkById.has(id)) fail('SELF_TEST_INVALID', `selfTestJson contains duplicate check ${id}.`);
    if (check.status !== 'PASS') fail('SELF_TEST_INVALID', `selfTestJson check ${id} did not PASS.`);
    checkById.set(id, check);
  }
  if (!sameSet([...checkById.keys()], REQUIRED_SELF_TEST_CHECK_IDS)) {
    fail('SELF_TEST_INVALID', 'selfTestJson check identifiers differ from the locked release contract.');
  }
  if (
    checkById.get('BUILD-FINGERPRINT')?.observed !== EXPECTED_SCIENTIFIC_BUILD_SHA256 ||
    checkById.get('INPUT-SHA256')?.observed !== goldenInput.sha256 ||
    checkById.get('SCIENTIFIC-PAYLOAD-SHA256')?.observed !== EXPECTED_SCIENTIFIC_PAYLOAD_SHA256
  ) {
    fail('SELF_TEST_INVALID', 'selfTestJson critical check observations differ from their locked values.');
  }

  return {
    schema: record.schema,
    contract: record.contract,
    recordStatus: record.recordStatus,
    platformGateStatus: record.platformGateStatus,
    recordedAt: recordedAt.text,
    scientificBuildSha256,
    inputSha256: goldenInput.sha256,
    scientificPayloadSha256: record.scientificPayloadSha256,
    passedCheckCount: record.checks.length,
    humanEvidenceBoundary:
      'The self-test is machine-validated preliminary runtime evidence; it does not replace HAR, visual-content review, or the three-OS matrix.',
  };
}

function validatePdf(artifact) {
  assertFileType(artifact, ['.pdf'], 'reportPdf');
  if (!artifact.bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    fail('ARTIFACT_INVALID', 'reportPdf does not have a PDF signature.');
  }
  if (!artifact.bytes.subarray(Math.max(0, artifact.bytes.length - 2048)).includes(Buffer.from('%%EOF'))) {
    fail('ARTIFACT_INVALID', 'reportPdf has no terminal PDF marker.');
  }
}

function parsePngDimensions(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature)) return undefined;
  if (
    bytes.length < 45 ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    fail('ARTIFACT_INVALID', 'screenshot PNG is missing a valid IHDR chunk.');
  }
  if (bytes.subarray(bytes.length - 8, bytes.length - 4).toString('ascii') !== 'IEND') {
    fail('ARTIFACT_INVALID', 'screenshot PNG is missing an IEND chunk.');
  }
  return { format: 'PNG', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function parseJpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    fail('ARTIFACT_INVALID', 'screenshot JPEG is missing an end marker.');
  }
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      return {
        format: 'JPEG',
        width: bytes.readUInt16BE(offset + 5),
        height: bytes.readUInt16BE(offset + 3),
      };
    }
    offset += segmentLength;
  }
  fail('ARTIFACT_INVALID', 'screenshot JPEG has no supported start-of-frame dimensions.');
}

function parseWebpDimensions(bytes) {
  if (
    bytes.length < 30 ||
    bytes.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    bytes.subarray(8, 12).toString('ascii') !== 'WEBP'
  ) {
    return undefined;
  }
  const chunkType = bytes.subarray(12, 16).toString('ascii');
  if (chunkType === 'VP8X') {
    return {
      format: 'WEBP',
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  if (chunkType === 'VP8L' && bytes[20] === 0x2f) {
    return {
      format: 'WEBP',
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + ((bytes[22] & 0xc0) >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
    };
  }
  if (
    chunkType === 'VP8 ' &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return {
      format: 'WEBP',
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  fail('ARTIFACT_INVALID', 'screenshot WEBP has no supported dimension header.');
}

function validateScreenshot(artifact) {
  assertFileType(artifact, ['.png', '.jpg', '.jpeg', '.webp'], 'screenshot');
  const bytes = artifact.bytes;
  if (bytes.length < MIN_SCREENSHOT_BYTES) {
    fail('ARTIFACT_INVALID', `screenshot must contain at least ${MIN_SCREENSHOT_BYTES} bytes.`);
  }
  const dimensions = parsePngDimensions(bytes) ?? parseJpegDimensions(bytes) ?? parseWebpDimensions(bytes);
  if (!dimensions) fail('ARTIFACT_INVALID', 'screenshot has no recognized image signature.');
  const { width, height } = dimensions;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < MIN_SCREENSHOT_WIDTH ||
    height < MIN_SCREENSHOT_HEIGHT ||
    width > MAX_SCREENSHOT_DIMENSION ||
    height > MAX_SCREENSHOT_DIMENSION ||
    width * height > MAX_SCREENSHOT_PIXELS
  ) {
    fail(
      'ARTIFACT_INVALID',
      `screenshot dimensions ${width}x${height} are outside the retained-evidence bounds.`,
    );
  }
  return {
    ...dimensions,
    sizeBytes: bytes.length,
    humanVisualContentReview: 'REQUIRED_NOT_AUTOMATICALLY_ATTESTED',
  };
}

function harTime(value, label, runStart, runEnd) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('NETWORK_EVIDENCE_INVALID', `${label} must be a timestamp string.`);
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) fail('NETWORK_EVIDENCE_INVALID', `${label} is not a valid timestamp.`);
  if (epoch < runStart.epoch || epoch > runEnd.epoch) {
    fail('NETWORK_EVIDENCE_INVALID', `${label} falls outside the declared run interval.`);
  }
  return epoch;
}

function validateNetworkHar(artifact, declaredAttempts, runStart, runEnd) {
  assertFileType(artifact, ['.har', '.json'], 'networkHar');
  const har = parseJsonArtifact(artifact, 'networkHar');
  const log = har?.log;
  if (!isPlainObject(log) || log.version !== '1.2') {
    fail('NETWORK_EVIDENCE_INVALID', 'networkHar.log must be a HAR 1.2 object.');
  }
  const creator = log.creator;
  if (
    !isPlainObject(creator) ||
    typeof creator.name !== 'string' ||
    creator.name.trim() === '' ||
    typeof creator.version !== 'string' ||
    creator.version.trim() === ''
  ) {
    fail('NETWORK_EVIDENCE_INVALID', 'networkHar.log.creator must identify the capture tool and version.');
  }
  const pages = log.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    fail('NETWORK_EVIDENCE_INVALID', 'networkHar.log.pages must contain at least one captured page.');
  }
  const pageIds = new Set();
  for (const [index, page] of pages.entries()) {
    if (!isPlainObject(page)) fail('NETWORK_EVIDENCE_INVALID', `networkHar page ${index} must be an object.`);
    const id = typeof page.id === 'string' ? page.id.trim() : '';
    if (!id || pageIds.has(id)) {
      fail('NETWORK_EVIDENCE_INVALID', `networkHar page ${index} has a missing or duplicate id.`);
    }
    pageIds.add(id);
    if (typeof page.title !== 'string' || page.title.trim() === '') {
      fail('NETWORK_EVIDENCE_INVALID', `networkHar page ${index} has no title.`);
    }
    harTime(page.startedDateTime, `networkHar page ${index}.startedDateTime`, runStart, runEnd);
    const timings = page.pageTimings;
    if (
      !isPlainObject(timings) ||
      !Number.isFinite(timings.onContentLoad) ||
      timings.onContentLoad < 0 ||
      !Number.isFinite(timings.onLoad) ||
      timings.onLoad < 0
    ) {
      fail('NETWORK_EVIDENCE_INVALID', `networkHar page ${index} has incomplete non-negative page timings.`);
    }
  }

  const entries = log.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    fail('NETWORK_EVIDENCE_INVALID', 'networkHar.log.entries must contain the captured local page request.');
  }
  const externalRequests = [];
  const localRequests = [];
  for (const [index, entry] of entries.entries()) {
    if (!isPlainObject(entry)) fail('NETWORK_EVIDENCE_INVALID', `networkHar entry ${index} must be an object.`);
    if (typeof entry.pageref !== 'string' || !pageIds.has(entry.pageref)) {
      fail('NETWORK_EVIDENCE_INVALID', `networkHar entry ${index} does not reference a retained page.`);
    }
    harTime(entry.startedDateTime, `networkHar entry ${index}.startedDateTime`, runStart, runEnd);
    if (!Number.isFinite(entry.time) || entry.time < 0) {
      fail('NETWORK_EVIDENCE_INVALID', `networkHar entry ${index}.time must be non-negative.`);
    }
    const urlText = entry?.request?.url;
    if (typeof urlText !== 'string' || urlText.trim() === '') {
      fail('NETWORK_EVIDENCE_INVALID', `networkHar entry ${index} has no request URL.`);
    }
    if (typeof entry?.request?.method !== 'string' || entry.request.method.trim() === '') {
      fail('NETWORK_EVIDENCE_INVALID', `networkHar entry ${index} has no request method.`);
    }
    let protocol;
    try {
      protocol = new URL(urlText).protocol;
    } catch {
      fail('NETWORK_EVIDENCE_INVALID', `networkHar entry ${index} has an invalid request URL.`);
    }
    if (['http:', 'https:', 'ws:', 'wss:', 'ftp:'].includes(protocol)) externalRequests.push(urlText);
    else if (['file:', 'data:', 'blob:'].includes(protocol)) localRequests.push(urlText);
    else {
      fail('NETWORK_EVIDENCE_INVALID', `networkHar entry ${index} uses unsupported protocol ${protocol}.`);
    }
  }
  if (localRequests.length === 0) {
    fail('NETWORK_EVIDENCE_INVALID', 'networkHar contains no retained non-network local page request.');
  }
  if (
    IS_V032_CONTRACT &&
    !localRequests.some((urlText) => {
      try {
        return new URL(urlText).protocol === 'file:' &&
          decodeURIComponent(new URL(urlText).pathname).endsWith(`/${RELEASE_FILE_NAME}`);
      } catch {
        return false;
      }
    })
  ) {
    fail(
      'NETWORK_EVIDENCE_INVALID',
      `networkHar contains no file: request for the locked ${RELEASE_FILE_NAME}.`,
    );
  }
  if (declaredAttempts !== externalRequests.length) {
    fail(
      'PROTOCOL_CONTRADICTION',
      `Declared ${declaredAttempts} external request attempt(s), HAR contains ${externalRequests.length}.`,
    );
  }
  if (externalRequests.length !== 0) {
    fail('NETWORK_EVIDENCE_INVALID', `networkHar contains external request attempt(s): ${externalRequests.join(', ')}.`);
  }
  return {
    externalRequestAttempts: externalRequests.length,
    totalEntries: entries.length,
    localRequestEntries: localRequests.length,
    pageCount: pages.length,
    creator: {
      name: creator.name,
      version: creator.version,
    },
  };
}

function validateManifestShape(manifest) {
  const input = objectAt(manifest, 'manifest');
  allowedKeys(
    input,
    ['schemaVersion', 'runId', 'observer', 'startedAt', 'endedAt', 'environment', 'protocol', 'artifacts'],
    'manifest',
  );
  if (input.schemaVersion !== INPUT_SCHEMA) {
    fail('INPUT_INVALID', `manifest.schemaVersion must be ${INPUT_SCHEMA}.`);
  }
  const runId = stringAt(input.runId, 'manifest.runId', {
    pattern: /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/,
  });
  const observer = objectAt(input.observer, 'manifest.observer');
  allowedKeys(observer, ['name', 'organization'], 'manifest.observer');
  observerNameAt(observer.name, 'manifest.observer.name');
  if (observer.organization !== undefined) stringAt(observer.organization, 'manifest.observer.organization');

  const startedAt = utcTime(input.startedAt, 'manifest.startedAt');
  const endedAt = utcTime(input.endedAt, 'manifest.endedAt');
  if (endedAt.epoch <= startedAt.epoch) {
    fail('INPUT_INVALID', 'manifest.endedAt must be after manifest.startedAt.');
  }

  const environment = objectAt(input.environment, 'manifest.environment');
  allowedKeys(environment, ['os', 'runtime', 'browser', 'locale'], 'manifest.environment');
  const os = objectAt(environment.os, 'manifest.environment.os');
  allowedKeys(os, ['family', 'edition', 'build', 'architecture'], 'manifest.environment.os');
  if (!['macos', 'windows11', 'ubuntu'].includes(os.family)) {
    fail('INPUT_INVALID', 'manifest.environment.os.family must be macos, windows11 or ubuntu.');
  }
  for (const field of ['edition', 'build', 'architecture']) stringAt(os[field], `manifest.environment.os.${field}`);
  if (os.family === 'macos' && !/macos/i.test(os.edition)) {
    fail('PROTOCOL_CONTRADICTION', 'macos family requires an edition identifying macOS.');
  }
  if (os.family === 'windows11' && !/windows\s*11/i.test(os.edition)) {
    fail('PROTOCOL_CONTRADICTION', 'windows11 family requires an edition identifying Windows 11.');
  }
  if (os.family === 'ubuntu') {
    const version = /ubuntu[^0-9]*(\d{2,4})\.(\d{2})/i.exec(os.edition);
    if (!version) {
      fail('PROTOCOL_CONTRADICTION', 'ubuntu family requires an edition containing its Ubuntu version.');
    }
    const major = Number(version[1]);
    const minor = Number(version[2]);
    if (major < 22 || (major === 22 && minor < 4)) {
      fail('PROTOCOL_CONTRADICTION', 'Ubuntu platform evidence requires Ubuntu 22.04 or newer.');
    }
  }

  const runtime = objectAt(environment.runtime, 'manifest.environment.runtime');
  allowedKeys(runtime, ['documentProtocol', 'onlineStateDuringRun', 'userAgent', 'javascriptEngine'], 'manifest.environment.runtime');
  if (runtime.documentProtocol !== 'file:') {
    fail('PROTOCOL_CONTRADICTION', 'manifest.environment.runtime.documentProtocol must be file:.');
  }
  booleanAt(runtime.onlineStateDuringRun, 'manifest.environment.runtime.onlineStateDuringRun', false);
  stringAt(runtime.userAgent, 'manifest.environment.runtime.userAgent');
  stringAt(runtime.javascriptEngine, 'manifest.environment.runtime.javascriptEngine');

  const browser = objectAt(environment.browser, 'manifest.environment.browser');
  allowedKeys(browser, ['name', 'version', 'engine', 'navigatorLanguage', 'navigatorLanguages'], 'manifest.environment.browser');
  for (const field of ['name', 'version', 'engine', 'navigatorLanguage']) {
    stringAt(browser[field], `manifest.environment.browser.${field}`);
  }
  const navigatorLanguages = arrayOfStrings(
    browser.navigatorLanguages,
    'manifest.environment.browser.navigatorLanguages',
    { nonEmpty: true },
  );
  if (navigatorLanguages[0] !== browser.navigatorLanguage) {
    fail('PROTOCOL_CONTRADICTION', 'navigatorLanguages[0] must equal navigatorLanguage.');
  }

  const locale = objectAt(environment.locale, 'manifest.environment.locale');
  allowedKeys(locale, ['osLocale', 'timeZone', 'decimalSeparator'], 'manifest.environment.locale');
  stringAt(locale.osLocale, 'manifest.environment.locale.osLocale');
  stringAt(locale.timeZone, 'manifest.environment.locale.timeZone');
  if (!['.', ','].includes(locale.decimalSeparator)) {
    fail('INPUT_INVALID', 'manifest.environment.locale.decimalSeparator must be . or ,.');
  }
  if (/^en-US$/i.test(locale.osLocale) && locale.decimalSeparator !== '.') {
    fail('PROTOCOL_CONTRADICTION', 'en-US locale requires a dot decimal separator declaration.');
  }
  if (/^tr-TR$/i.test(locale.osLocale) && locale.decimalSeparator !== ',') {
    fail('PROTOCOL_CONTRADICTION', 'tr-TR locale requires a comma decimal separator declaration.');
  }

  const protocol = objectAt(input.protocol, 'manifest.protocol');
  allowedKeys(
    protocol,
    ['offlineMode', 'declaredExternalRequestAttempts', 'networkCapture', 'operatorConfirmations', 'deviations'],
    'manifest.protocol',
  );
  booleanAt(protocol.offlineMode, 'manifest.protocol.offlineMode', true);
  if (!Number.isInteger(protocol.declaredExternalRequestAttempts) || protocol.declaredExternalRequestAttempts < 0) {
    fail('INPUT_INVALID', 'manifest.protocol.declaredExternalRequestAttempts must be a non-negative integer.');
  }
  const networkCapture = objectAt(protocol.networkCapture, 'manifest.protocol.networkCapture');
  allowedKeys(networkCapture, ['format', 'complete', 'capturedWhileOffline', 'covers'], 'manifest.protocol.networkCapture');
  if (networkCapture.format !== 'HAR') fail('INPUT_INVALID', 'networkCapture.format must be HAR.');
  booleanAt(networkCapture.complete, 'manifest.protocol.networkCapture.complete', true);
  booleanAt(networkCapture.capturedWhileOffline, 'manifest.protocol.networkCapture.capturedWhileOffline', true);
  const covers = arrayOfStrings(networkCapture.covers, 'manifest.protocol.networkCapture.covers');
  if (!sameSet(covers, REQUIRED_NETWORK_COVERAGE)) {
    fail('PROTOCOL_CONTRADICTION', 'networkCapture.covers does not cover the full required run sequence.');
  }
  const confirmations = objectAt(protocol.operatorConfirmations, 'manifest.protocol.operatorConfirmations');
  allowedKeys(confirmations, REQUIRED_CONFIRMATIONS, 'manifest.protocol.operatorConfirmations');
  for (const key of REQUIRED_CONFIRMATIONS) {
    booleanAt(confirmations[key], `manifest.protocol.operatorConfirmations.${key}`, true);
  }
  const deviations = arrayOfStrings(protocol.deviations, 'manifest.protocol.deviations');

  const artifacts = objectAt(input.artifacts, 'manifest.artifacts');
  allowedKeys(artifacts, REQUIRED_ARTIFACT_ROLES, 'manifest.artifacts');
  for (const role of REQUIRED_ARTIFACT_ROLES) {
    if (!(role in artifacts)) fail('MISSING_ARTIFACT', `manifest.artifacts.${role} is required.`);
  }

  return {
    input,
    runId,
    observer,
    startedAt,
    endedAt,
    environment,
    protocol,
    deviations,
    artifacts,
  };
}

function publicArtifact(artifact) {
  return {
    path: artifact.declaredPath,
    fileName: artifact.fileName,
    sizeBytes: artifact.sizeBytes,
    sha256: artifact.sha256,
  };
}

export function createPlatformEvidenceRecord(manifestPath, options = {}) {
  const absoluteManifestPath = resolve(manifestPath);
  if (!existsSync(absoluteManifestPath)) {
    fail('MISSING_MANIFEST', `Manifest does not exist: ${manifestPath}.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(absoluteManifestPath, 'utf8'));
  } catch (error) {
    fail('INPUT_INVALID', `Manifest is not valid JSON: ${error.message}`);
  }
  const validated = validateManifestShape(parsed);
  const projectRoot = resolve(options.projectRoot ?? DEFAULT_PROJECT_ROOT);
  const manifestDirectory = dirname(absoluteManifestPath);
  const checksumPath = resolve(projectRoot, PLATFORM_CHECKSUM_RELATIVE_PATH);
  const protocolPath = resolve(projectRoot, PLATFORM_PROTOCOL_RELATIVE_PATH);
  const candidateFreezePath = IS_V032_CONTRACT
    ? resolve(projectRoot, CANDIDATE_FREEZE_RELATIVE_PATH)
    : null;
  const candidateFreezeChecksumPath = IS_V032_CONTRACT
    ? resolve(projectRoot, CANDIDATE_FREEZE_SHA_RELATIVE_PATH)
    : null;
  const comparatorPath = resolve(projectRoot, 'scripts', SCIENTIFIC_COMPARATOR_FILE);
  for (const [label, path] of [
    ['platform input checksum reference', checksumPath],
    ['platform protocol', protocolPath],
    ...(IS_V032_CONTRACT
      ? [
          ['candidate freeze', candidateFreezePath],
          ['candidate-freeze checksum sidecar', candidateFreezeChecksumPath],
        ]
      : []),
    ['scientific comparator', comparatorPath],
  ]) {
    if (!existsSync(path)) fail('REFERENCE_MISSING', `${label} is missing: ${path}.`);
  }
  const candidateFreeze = IS_V032_CONTRACT
    ? validateCandidateFreeze(
        candidateFreezePath,
        candidateFreezeChecksumPath,
        projectRoot,
      )
    : null;
  const referenceChecksums = parseChecksumFile(checksumPath);
  const artifacts = Object.fromEntries(
    REQUIRED_ARTIFACT_ROLES.map((role) => [role, verifyArtifact(role, validated.artifacts[role], manifestDirectory)]),
  );
  const duplicatePaths = new Map();
  for (const artifact of Object.values(artifacts)) {
    const previous = duplicatePaths.get(artifact.realPath);
    if (previous) {
      fail('ARTIFACT_INVALID', `${artifact.role} and ${previous} resolve to the same retained file.`);
    }
    duplicatePaths.set(artifact.realPath, artifact.role);
  }

  if (artifacts.release.fileName !== RELEASE_FILE_NAME) {
    fail('REFERENCE_HASH_MISMATCH', `release artifact must be named ${RELEASE_FILE_NAME}.`);
  }
  const expectedReleaseHash = referenceChecksums.get(RELEASE_FILE_NAME);
  const expectedGoldenHash = referenceChecksums.get(GOLDEN_CHECKSUM_NAME);
  if (!expectedReleaseHash || !expectedGoldenHash) {
    fail('REFERENCE_INVALID', 'The platform checksum index lacks the fixed release or golden input.');
  }
  if (artifacts.release.sha256 !== expectedReleaseHash) {
    fail('REFERENCE_HASH_MISMATCH', 'release artifact does not match the platform checksum index.');
  }
  if (
    IS_V032_CONTRACT &&
    (artifacts.release.sha256 !== candidateFreeze.candidate.sha256 ||
      artifacts.release.sizeBytes !== candidateFreeze.candidate.bytes)
  ) {
    fail('REFERENCE_HASH_MISMATCH', 'release artifact does not match the v0.3.2 candidate freeze.');
  }
  if (artifacts.goldenInput.sha256 !== expectedGoldenHash) {
    fail('REFERENCE_HASH_MISMATCH', 'goldenInput does not match the platform checksum index.');
  }
  assertFileType(artifacts.release, ['.html'], 'release');
  const releasePrefix = artifacts.release.bytes.subarray(0, 512).toString('utf8').toLowerCase();
  if (!releasePrefix.includes('<!doctype html') && !releasePrefix.includes('<html')) {
    fail('ARTIFACT_INVALID', 'release artifact does not have an HTML document signature.');
  }
  assertFileType(artifacts.goldenInput, ['.csv'], 'goldenInput');
  let selfTest = validateSelfTestRecord(
    artifacts.selfTestJson,
    artifacts.goldenInput,
    validated.startedAt,
    validated.endedAt,
    validated.environment,
  );
  assertFileType(artifacts.reportJson, ['.json'], 'reportJson');
  const report = parseJsonArtifact(artifacts.reportJson, 'reportJson');
  const reportGeneratedAt = validateScientificReport(
    report,
    artifacts.goldenInput,
    validated.startedAt,
    validated.endedAt,
  );
  validateCsvExport(artifacts.reportCsv, report);
  validatePdf(artifacts.reportPdf);
  const screenshotInspection = validateScreenshot(artifacts.screenshot);
  const networkInspection = validateNetworkHar(
    artifacts.networkHar,
    validated.protocol.declaredExternalRequestAttempts,
    validated.startedAt,
    validated.endedAt,
  );
  const hostedOrigin = IS_V032_CONTRACT
    ? validateV032HostedOrigin({
        artifacts,
        validatedManifest: validated,
        candidateFreeze,
      })
    : null;
  if (IS_V032_CONTRACT) {
    selfTest = validateSelfTestRecord(
      artifacts.selfTestJson,
      artifacts.goldenInput,
      validated.startedAt,
      validated.endedAt,
      validated.environment,
      hostedOrigin,
    );
  }
  const canonicalReportSha256 = scientificReportHash(report);

  const relativeReference = (path) => portablePath(relative(projectRoot, path));
  const record = {
    schemaVersion: OUTPUT_SCHEMA,
    runId: validated.runId,
    recordStatus: 'VALIDATED_RETAINED_ARTIFACT_SET',
    metadataProvenance: {
      environment: IS_V032_CONTRACT
        ? 'hash-bound hosted metadata, workflow preflight, and upload receipt; internal identity alignment checked; external authenticity not software-authenticated'
        : 'observer-declared; completeness and internal consistency checked',
      operatorConfirmations: 'observer-declared',
      artifactHashes: 'computed from retained files and matched to declarations',
      externalRequestCount: 'derived from retained HAR request URLs',
      visualContent:
        'image container and dimensions checked; visible content still requires an independent human review',
    },
    claimBoundary: {
      scope: 'one retained operating-system validation run',
      acPlat01: 'ONE_RUN_EVIDENCE_READY_FOR_REVIEW',
      acPlat02: 'AWAITING_THREE_PLATFORM_SCIENTIFIC_JSON_COMPARISON',
      statement:
        'This record verifies one retained artifact set. It does not by itself close AC-PLAT-01 or AC-PLAT-02 and is not a platform PASS.',
    },
    observer: {
      name: validated.observer.name,
      ...(validated.observer.organization ? { organization: validated.observer.organization } : {}),
    },
    timeWindow: {
      startedAt: validated.startedAt.text,
      endedAt: validated.endedAt.text,
      selfTestRecordedAt: selfTest.recordedAt,
      reportGeneratedAt,
    },
    environment: {
      os: {
        family: validated.environment.os.family,
        edition: validated.environment.os.edition,
        build: validated.environment.os.build,
        architecture: validated.environment.os.architecture,
      },
      runtime: {
        documentProtocol: validated.environment.runtime.documentProtocol,
        onlineStateDuringRun: validated.environment.runtime.onlineStateDuringRun,
        userAgent: validated.environment.runtime.userAgent,
        javascriptEngine: validated.environment.runtime.javascriptEngine,
      },
      browser: {
        name: validated.environment.browser.name,
        version: validated.environment.browser.version,
        engine: validated.environment.browser.engine,
        navigatorLanguage: validated.environment.browser.navigatorLanguage,
        navigatorLanguages: [...validated.environment.browser.navigatorLanguages],
      },
      locale: {
        osLocale: validated.environment.locale.osLocale,
        timeZone: validated.environment.locale.timeZone,
        decimalSeparator: validated.environment.locale.decimalSeparator,
      },
    },
    protocolObservation: {
      offlineMode: true,
      networkCapture: {
        format: 'HAR',
        complete: true,
        capturedWhileOffline: true,
        covers: REQUIRED_NETWORK_COVERAGE,
        ...networkInspection,
      },
      operatorConfirmations: Object.fromEntries(
        REQUIRED_CONFIRMATIONS.map((key) => [key, validated.protocol.operatorConfirmations[key]]),
      ),
      deviations: validated.deviations,
    },
    artifacts: Object.fromEntries(
      REQUIRED_ARTIFACT_ROLES.map((role) => [role, publicArtifact(artifacts[role])]),
    ),
    ...(IS_V032_CONTRACT ? { hostedOrigin: hostedOrigin.publicRecord } : {}),
    selfTest,
    visualEvidence: {
      screenshot: screenshotInspection,
      contentReviewStatus: 'AWAITING_HUMAN_VISUAL_REVIEW',
      statement:
        'The recorder validates file type, byte size, and pixel dimensions only; it does not attest what the screenshot visibly shows.',
    },
    scientificReport: {
      schemaVersion: report.schemaVersion,
      applicationVersion: report.application.version,
      canonicalSha256: canonicalReportSha256,
      comparatorCompatible: true,
      volatileFieldsIgnoredByComparator: ['generatedAt'],
    },
    references: {
      runInputManifest: {
        fileName: basename(absoluteManifestPath),
        sha256: sha256(readFileSync(absoluteManifestPath)),
      },
      protocol: {
        path: relativeReference(protocolPath),
        sha256: sha256(readFileSync(protocolPath)),
      },
      releaseChecksums: {
        path: relativeReference(checksumPath),
        sha256: sha256(readFileSync(checksumPath)),
      },
      ...(IS_V032_CONTRACT
        ? {
            candidateFreeze: {
              path: relativeReference(candidateFreezePath),
              sha256: candidateFreeze.sha256,
              checksumPath: relativeReference(candidateFreezeChecksumPath),
              checksumSha256: candidateFreeze.checksumSha256,
              candidateSha256: candidateFreeze.candidate.sha256,
            },
          }
        : {}),
      scientificComparator: {
        path: relativeReference(comparatorPath),
        sha256: sha256(readFileSync(comparatorPath)),
      },
    },
    verifiedChecks: [
      'DECLARED_ARTIFACT_SHA256_MATCH',
      ...(IS_V032_CONTRACT
        ? [
            'CANDIDATE_FREEZE_IDENTITY_STATUS_AND_POLICY_MATCH',
            'HOSTED_METADATA_PREFLIGHT_RECEIPT_HASH_BOUND',
            'HOSTED_RUN_REPOSITORY_WORKFLOW_REF_RUN_ATTEMPT_COMMIT_ALIGNED',
            'HOSTED_OS_PLATFORM_ARCHITECTURE_USER_AGENT_SELF_TEST_ALIGNED',
          ]
        : []),
      'LOCKED_RELEASE_SHA256_MATCH',
      'LOCKED_GOLDEN_INPUT_SHA256_MATCH',
      'SELF_TEST_PASS_BOUNDARY_INPUT_PAYLOAD_BUILD_MATCH',
      'SELF_TEST_RECORDED_WITHIN_RUN_INTERVAL',
      'REPORT_PROTOCOL_CONTEXT_MATCH',
      'REPORT_PROTOCOL_CONFIGURATION_MATCH',
      'CSV_JSON_EXACT_ROW_MATCH',
      'PDF_SIGNATURE_AND_EOF_PRESENT',
      'SCREENSHOT_CONTAINER_AND_DIMENSIONS_VALID_HUMAN_REVIEW_REQUIRED',
      'HAR_CREATOR_PAGES_TIMINGS_AND_LOCAL_ENTRY_VALID',
      'HAR_PARSED_ZERO_EXTERNAL_REQUESTS',
      'SCIENTIFIC_JSON_CANONICAL_HASH_COMPUTED',
    ],
  };
  return record;
}

export function serializePlatformEvidenceRecord(record) {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function writePlatformEvidenceRecord(manifestPath, outputPath, options = {}) {
  const record = createPlatformEvidenceRecord(manifestPath, options);
  const absoluteOutputPath = resolve(outputPath);
  const absoluteManifestPath = resolve(manifestPath);
  if (extname(absoluteOutputPath).toLowerCase() !== '.json') {
    fail('OUTPUT_INVALID', 'Output path must use the .json extension.');
  }
  if (absoluteOutputPath === absoluteManifestPath) {
    fail('OUTPUT_INVALID', 'Output path must not overwrite the input manifest.');
  }
  for (const artifact of Object.values(record.artifacts)) {
    const artifactPath = nativePath(dirname(absoluteManifestPath), artifact.path);
    if (absoluteOutputPath === artifactPath) {
      fail('OUTPUT_INVALID', 'Output path must not overwrite a retained artifact.');
    }
  }
  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  const temporaryPath = `${absoluteOutputPath}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, serializePlatformEvidenceRecord(record), 'utf8');
    rmSync(absoluteOutputPath, { force: true });
    renameSync(temporaryPath, absoluteOutputPath);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    fail('OUTPUT_WRITE_FAILED', `Could not write evidence record: ${error.message}`);
  }
  return record;
}

function parseArguments(argumentsList) {
  let manifestPath;
  let outputPath;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--manifest') manifestPath = argumentsList[++index];
    else if (argument === '--output') outputPath = argumentsList[++index];
    else if (argument === '--help' || argument === '-h') return { help: true };
    else fail('USAGE', `Unknown argument: ${argument}.`);
  }
  if (!manifestPath) fail('USAGE', '--manifest is required.');
  return { manifestPath, outputPath, help: false };
}

function usage() {
  return [
    'Usage:',
    '  node scripts/create-platform-evidence-record.mjs --manifest <run-input.json> --output <evidence-record.json>',
    '',
    'If --output is omitted, the validated record is written to stdout.',
  ].join('\n');
}

export function main(argumentsList = process.argv.slice(2)) {
  try {
    const parsed = parseArguments(argumentsList);
    if (parsed.help) {
      console.log(usage());
      return 0;
    }
    if (parsed.outputPath) {
      writePlatformEvidenceRecord(parsed.manifestPath, parsed.outputPath);
      console.log(`OK PLATFORM_EVIDENCE_RECORD_CREATED ${resolve(parsed.outputPath)}`);
    } else {
      console.log(serializePlatformEvidenceRecord(createPlatformEvidenceRecord(parsed.manifestPath)).trimEnd());
    }
    return 0;
  } catch (error) {
    const code = error instanceof PlatformEvidenceValidationError ? error.code : 'UNEXPECTED_ERROR';
    console.error(`FAIL ${code} ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (resolve(process.argv[1] ?? '') === resolve(SCRIPT_PATH)) {
  process.exitCode = main();
}
