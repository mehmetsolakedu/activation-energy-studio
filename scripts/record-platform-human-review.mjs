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
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

import { createPlatformMatrixRecord } from './create-platform-matrix-record.mjs';
import {
  HOSTED_WORKFLOW_PREFLIGHT_NAME,
  validateHostedWorkflowPreflight,
} from './write-hosted-workflow-preflight.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PLATFORM_CONTRACT_VERSION =
  process.env.AES_PLATFORM_VALIDATION_VERSION ?? '0.2.0';
if (!['0.2.0', '0.3.2'].includes(PLATFORM_CONTRACT_VERSION)) {
  throw new Error(
    `Unsupported AES_PLATFORM_VALIDATION_VERSION: ${PLATFORM_CONTRACT_VERSION}`,
  );
}
const IS_V032_CONTRACT = PLATFORM_CONTRACT_VERSION === '0.3.2';
const MATRIX_SCHEMA = 'activation-energy-studio/platform-matrix-record/v1';
const SOURCE_RECORD_SCHEMA = 'activation-energy-studio/platform-evidence-record/v1';
const HOSTED_METADATA_SCHEMA = 'activation-energy-studio/hosted-platform-run/v1';
const HOSTED_METADATA_STATUS = 'AUTOMATED_RUN_EVIDENCE_AWAITING_HUMAN_REVIEW';
const HOSTED_UPLOAD_RECEIPT_SCHEMA =
  'activation-energy-studio/github-actions-artifact-receipt/v1';
const HOSTED_WORKFLOW_NAME = IS_V032_CONTRACT
  ? 'Hosted Platform Validation v0.3.2'
  : 'Hosted Platform Validation';
const HOSTED_WORKFLOW_PATH = IS_V032_CONTRACT
  ? '.github/workflows/platform-validation-v032.yml'
  : '.github/workflows/platform-validation.yml';
const HOSTED_ACTION_COMMITS = Object.freeze({
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
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u;
const UTC_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const PLACEHOLDER_PATTERN =
  /(?:\[required|replace[_ -]?with|not[_ -]?reviewed|tbd|todo|placeholder|your[_ -]?name|automated_hosted_run_awaiting_human_observer_confirmation)/iu;

export const PLATFORM_HUMAN_REVIEW_INPUT_SCHEMA =
  'activation-energy-studio/platform-human-review-input/v1';
export const PLATFORM_HUMAN_REVIEW_RECORD_SCHEMA =
  'activation-energy-studio/platform-human-review-record/v1';
export const PLATFORM_HUMAN_REVIEW_RECORD_STATE =
  'STRUCTURALLY_VALIDATED_REQUIRES_INDEPENDENT_AUTHENTICITY_AUDIT';
export const PLATFORM_HUMAN_REVIEW_DECISION_IDS = Object.freeze([
  'HAR_NETWORK',
  'SCREENSHOT_UI',
  'PDF_VISUAL_QA',
  'JSON_CSV_PDF_CONSISTENCY',
  'RUNNER_OS_ARCH_IDENTITY',
  'DEVIATIONS',
]);

const REQUIRED_OS_FAMILIES = Object.freeze(['macos', 'windows11', 'ubuntu']);
const REQUIRED_ARTIFACT_ROLES = Object.freeze([
  'hostedRunMetadata',
  'hostedWorkflowPreflight',
  'hostedUploadReceipt',
  'networkHar',
  'screenshot',
  'reportPdf',
  'reportJson',
  'reportCsv',
  ...(IS_V032_CONTRACT ? ['rawCdpEvents'] : []),
]);
const SOURCE_BOUND_ARTIFACT_ROLES = Object.freeze([
  'networkHar',
  'screenshot',
  'reportPdf',
  'reportJson',
  'reportCsv',
  ...(IS_V032_CONTRACT ? ['rawCdpEvents'] : []),
]);
const REQUIRED_REVIEWER_DECLARATIONS = Object.freeze([
  'personallyReviewedAllReferencedEvidence',
  'understandsIdentityIsNotAuthenticatedBySoftware',
  'understandsAcceptanceGatesAreNotAutomaticallyClosed',
]);
const RUNNER_CONTRACT = Object.freeze({
  macos: Object.freeze({
    runnerLabel: 'macos-15',
    platform: 'darwin',
    architecture: 'arm64',
    runnerOS: 'macos',
  }),
  windows11: Object.freeze({
    runnerLabel: 'windows-11-arm',
    platform: 'win32',
    architecture: 'arm64',
    runnerOS: 'windows',
  }),
  ubuntu: Object.freeze({
    runnerLabel: 'ubuntu-24.04',
    platform: 'linux',
    architecture: 'x64',
    runnerOS: 'linux',
  }),
});

export class PlatformHumanReviewValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PlatformHumanReviewValidationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PlatformHumanReviewValidationError(code, message);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function objectAt(value, label) {
  if (!isObject(value)) fail('REVIEW_INVALID_OBJECT', `${label} must be an object.`);
  return value;
}

function arrayAt(value, label) {
  if (!Array.isArray(value)) fail('REVIEW_INVALID_ARRAY', `${label} must be an array.`);
  return value;
}

function allowedKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    fail('REVIEW_UNKNOWN_FIELD', `${label} contains unknown field(s): ${unknown.join(', ')}.`);
  }
}

function stringAt(value, label, { allowPlaceholder = false } = {}) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail('REVIEW_EMPTY_FIELD', `${label} must be a non-empty string.`);
  }
  const text = value.trim();
  if (!allowPlaceholder && PLACEHOLDER_PATTERN.test(text)) {
    fail('REVIEW_PLACEHOLDER', `${label} contains an unresolved placeholder.`);
  }
  return text;
}

function booleanAt(value, label, expected) {
  if (typeof value !== 'boolean') {
    fail('REVIEW_INVALID_BOOLEAN', `${label} must be boolean.`);
  }
  if (expected !== undefined && value !== expected) {
    fail('REVIEW_DECLARATION_INVALID', `${label} must be ${String(expected)}.`);
  }
  return value;
}

function shaAt(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail('REVIEW_INVALID_SHA256', `${label} must be a lowercase SHA-256 value.`);
  }
  return value;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function utcAt(value, label) {
  const text = stringAt(value, label);
  const patternMatch = text.match(UTC_TIMESTAMP_PATTERN);
  const epoch = Date.parse(text);
  const canonicalized =
    patternMatch === null
      ? null
      : text.replace(
          /(?:\.(\d{1,3}))?Z$/u,
          (_match, milliseconds = '') =>
            `.${milliseconds.padEnd(3, '0')}Z`,
        );
  if (
    patternMatch === null
    || !Number.isFinite(epoch)
    || new Date(epoch).toISOString() !== canonicalized
  ) {
    fail('REVIEW_INVALID_UTC_TIME', `${label} must be a valid ISO-8601 UTC timestamp ending in Z.`);
  }
  return { text, epoch };
}

function sameSet(left, right) {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every((item) => right.includes(item))
  );
}

function portableRelativePath(value, label) {
  const path = stringAt(value, label, { allowPlaceholder: true });
  if (
    isAbsolute(path) ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..') ||
    /^[A-Za-z]:/u.test(path)
  ) {
    fail('REVIEW_PATH_INVALID', `${label} must be a confined portable relative path.`);
  }
  return path;
}

function resolveContainedFile(root, portablePath, label) {
  const candidate = resolve(root, ...portablePath.split('/'));
  if (!existsSync(candidate) || !statSync(candidate).isFile()) {
    fail('REVIEW_FILE_MISSING', `${label} is missing: ${portablePath}.`);
  }
  const rootReal = realpathSync(root);
  const candidateReal = realpathSync(candidate);
  const escaped = relative(rootReal, candidateReal);
  if (escaped === '..' || escaped.startsWith(`..${sep}`) || isAbsolute(escaped)) {
    fail('REVIEW_PATH_ESCAPE', `${label} resolves outside the review evidence root.`);
  }
  return candidateReal;
}

function verifyHashedFile(root, value, label, extraAllowedKeys = []) {
  const descriptor = objectAt(value, label);
  allowedKeys(descriptor, ['path', 'sha256', ...extraAllowedKeys], label);
  const portablePath = portableRelativePath(descriptor.path, `${label}.path`);
  const declaredSha256 = shaAt(descriptor.sha256, `${label}.sha256`);
  const resolvedPath = resolveContainedFile(root, portablePath, label);
  const bytes = readFileSync(resolvedPath);
  if (bytes.length === 0) fail('REVIEW_FILE_EMPTY', `${label} must be non-empty.`);
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== declaredSha256) {
    fail(
      'REVIEW_HASH_MISMATCH',
      `${label} declared ${declaredSha256}, computed ${actualSha256}.`,
    );
  }
  return {
    path: portablePath,
    fileName: basename(resolvedPath),
    sizeBytes: bytes.length,
    sha256: actualSha256,
    resolvedPath,
    bytes,
  };
}

function parseJsonBytes(bytes, label) {
  try {
    return objectAt(JSON.parse(bytes.toString('utf8')), label);
  } catch (error) {
    if (error instanceof PlatformHumanReviewValidationError) throw error;
    fail(
      'REVIEW_JSON_INVALID',
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

function publicFile(file) {
  return {
    path: file.path,
    fileName: file.fileName,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
  };
}

function normalizeArchitecture(value, label) {
  const architecture = stringAt(value, label).toLowerCase();
  if (['arm64', 'aarch64'].includes(architecture)) return 'arm64';
  if (['x64', 'amd64', 'x86_64'].includes(architecture)) return 'x64';
  fail('REVIEW_RUNNER_IDENTITY_MISMATCH', `${label} has unsupported architecture ${value}.`);
}

function normalizeRunnerOs(value, label) {
  const operatingSystem = stringAt(value, label).toLowerCase();
  if (['macos', 'darwin'].includes(operatingSystem)) return 'macos';
  if (['windows', 'win32'].includes(operatingSystem)) return 'windows';
  if (['linux', 'ubuntu'].includes(operatingSystem)) return 'linux';
  fail('REVIEW_RUNNER_IDENTITY_MISMATCH', `${label} has unsupported OS ${value}.`);
}

function verifyMatrixLocks(root, value) {
  const locks = objectAt(value, 'input.locks');
  allowedKeys(locks, ['matrix', 'sourceRecords'], 'input.locks');
  const matrixFile = verifyHashedFile(root, locks.matrix, 'input.locks.matrix');
  if (extname(matrixFile.fileName).toLowerCase() !== '.json') {
    fail('REVIEW_MATRIX_INVALID', 'The matrix lock must reference a JSON file.');
  }
  const matrix = parseJsonBytes(matrixFile.bytes, 'platform matrix');
  if (
    matrix.schemaVersion !== MATRIX_SCHEMA ||
    matrix.recordStatus !== 'VALIDATED_THREE_PLATFORM_EVIDENCE_MATRIX'
  ) {
    fail('REVIEW_MATRIX_INVALID', 'The locked matrix is not a validated three-platform matrix.');
  }

  const declaredSources = arrayAt(locks.sourceRecords, 'input.locks.sourceRecords');
  if (declaredSources.length !== REQUIRED_OS_FAMILIES.length) {
    fail('REVIEW_SOURCE_SET_INVALID', 'Exactly three sourceRecords locks are required.');
  }
  const sources = declaredSources.map((item, index) => {
    const label = `input.locks.sourceRecords[${index}]`;
    const descriptor = objectAt(item, label);
    allowedKeys(descriptor, ['osFamily', 'path', 'sha256'], label);
    const family = stringAt(descriptor.osFamily, `${label}.osFamily`);
    if (!REQUIRED_OS_FAMILIES.includes(family)) {
      fail('REVIEW_SOURCE_SET_INVALID', `${label}.osFamily is unsupported: ${family}.`);
    }
    const file = verifyHashedFile(root, descriptor, label, ['osFamily']);
    if (extname(file.fileName).toLowerCase() !== '.json') {
      fail('REVIEW_SOURCE_RECORD_INVALID', `${label} must reference a JSON source record.`);
    }
    return {
      family,
      file,
      record: parseJsonBytes(file.bytes, `${family} source record`),
    };
  });
  if (!sameSet(sources.map((source) => source.family), REQUIRED_OS_FAMILIES)) {
    fail('REVIEW_SOURCE_SET_INVALID', 'Source record families must be exactly macos, windows11, ubuntu.');
  }
  if (new Set(sources.map((source) => source.file.sha256)).size !== sources.length) {
    fail('REVIEW_SOURCE_SET_INVALID', 'Every source record must have a distinct file SHA-256.');
  }
  if (new Set(sources.map((source) => source.file.resolvedPath)).size !== sources.length) {
    fail('REVIEW_SOURCE_SET_INVALID', 'Every source record must reference a distinct file.');
  }

  let recomputedMatrix;
  try {
    recomputedMatrix = createPlatformMatrixRecord(
      sources.map((source) => source.file.resolvedPath),
    );
  } catch (error) {
    fail(
      'REVIEW_SOURCE_RECORD_INVALID',
      `The locked source records cannot reproduce a valid matrix: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!isDeepStrictEqual(matrix, recomputedMatrix)) {
    fail(
      'REVIEW_MATRIX_SOURCE_MISMATCH',
      'The locked matrix object does not exactly match a matrix recomputed from the three actual source-record files.',
    );
  }

  const byFamily = new Map();
  for (const source of sources) {
    const record = source.record;
    if (
      record.schemaVersion !== SOURCE_RECORD_SCHEMA ||
      record.recordStatus !== 'VALIDATED_RETAINED_ARTIFACT_SET'
    ) {
      fail('REVIEW_SOURCE_RECORD_INVALID', `${source.family} has an invalid source-record boundary.`);
    }
    const observer = objectAt(record.observer, `${source.family}.observer`);
    stringAt(observer.name, `${source.family}.observer.name`);
    const matrixPlatform = arrayAt(matrix.platforms, 'matrix.platforms').find(
      (platform) => platform.family === source.family,
    );
    byFamily.set(source.family, { ...source, matrixPlatform });
  }
  return { matrix, matrixFile, sources, byFamily };
}

function validateReviewer(value) {
  const reviewer = objectAt(value, 'input.reviewer');
  allowedKeys(
    reviewer,
    [
      'name',
      'affiliation',
      'professionalProfile',
      'role',
      'relevantExperience',
      'declarations',
    ],
    'input.reviewer',
  );
  const declarations = objectAt(reviewer.declarations, 'input.reviewer.declarations');
  allowedKeys(declarations, REQUIRED_REVIEWER_DECLARATIONS, 'input.reviewer.declarations');
  const normalizedDeclarations = {};
  for (const field of REQUIRED_REVIEWER_DECLARATIONS) {
    normalizedDeclarations[field] = booleanAt(
      declarations[field],
      `input.reviewer.declarations.${field}`,
      true,
    );
  }
  return {
    name: stringAt(reviewer.name, 'input.reviewer.name'),
    affiliation: stringAt(reviewer.affiliation, 'input.reviewer.affiliation'),
    professionalProfile: stringAt(
      reviewer.professionalProfile,
      'input.reviewer.professionalProfile',
    ),
    role: stringAt(reviewer.role, 'input.reviewer.role'),
    relevantExperience: stringAt(
      reviewer.relevantExperience,
      'input.reviewer.relevantExperience',
    ),
    declarations: normalizedDeclarations,
  };
}

function validateReviewContext(value) {
  const review = objectAt(value, 'input.review');
  allowedKeys(
    review,
    ['startedAtUtc', 'endedAtUtc', 'recordedAtUtc', 'environment'],
    'input.review',
  );
  const startedAt = utcAt(review.startedAtUtc, 'input.review.startedAtUtc');
  const endedAt = utcAt(review.endedAtUtc, 'input.review.endedAtUtc');
  const recordedAt = utcAt(review.recordedAtUtc, 'input.review.recordedAtUtc');
  if (endedAt.epoch <= startedAt.epoch) {
    fail('REVIEW_TIME_ORDER_INVALID', 'Review end time must be later than review start time.');
  }
  if (recordedAt.epoch < endedAt.epoch) {
    fail('REVIEW_TIME_ORDER_INVALID', 'recordedAtUtc must not precede endedAtUtc.');
  }
  const environment = objectAt(review.environment, 'input.review.environment');
  allowedKeys(environment, ['operatingSystem', 'browser', 'locale'], 'input.review.environment');
  return {
    startedAt,
    endedAt,
    recordedAt,
    public: {
      startedAtUtc: startedAt.text,
      endedAtUtc: endedAt.text,
      recordedAtUtc: recordedAt.text,
      environment: {
        operatingSystem: stringAt(
          environment.operatingSystem,
          'input.review.environment.operatingSystem',
        ),
        browser: stringAt(environment.browser, 'input.review.environment.browser'),
        locale: stringAt(environment.locale, 'input.review.environment.locale'),
      },
    },
  };
}

function validateHostedMetadata(metadata, family, sourceRecord) {
  if (
    metadata.schema !== HOSTED_METADATA_SCHEMA ||
    metadata.claimStatus !== HOSTED_METADATA_STATUS ||
    metadata.humanReviewCompleted !== false ||
    metadata.operatorConfirmationsCompleted !== false ||
    (IS_V032_CONTRACT &&
      (!Array.isArray(metadata.platformCriteriaClosed) ||
        metadata.platformCriteriaClosed.length !== 0 ||
        metadata.claimBoundary !==
          'Automated hosted evidence awaits human review and does not close a platform criterion by itself.'))
  ) {
    fail(
      'REVIEW_HOSTED_PROVENANCE_INVALID',
      `${family} metadata must retain the automated hosted, awaiting-human-review boundary.`,
    );
  }
  if (metadata.family !== family) {
    fail('REVIEW_HOSTED_PROVENANCE_INVALID', `${family} metadata family does not match.`);
  }
  const sourceEnvironment = objectAt(sourceRecord.environment, `${family}.environment`);
  const sourceOs = objectAt(sourceEnvironment.os, `${family}.environment.os`);
  const sourceBrowser = objectAt(sourceEnvironment.browser, `${family}.environment.browser`);
  const sourceLocale = objectAt(sourceEnvironment.locale, `${family}.environment.locale`);
  const sourceTime = objectAt(sourceRecord.timeWindow, `${family}.timeWindow`);
  const contract = RUNNER_CONTRACT[family];
  const runner = objectAt(metadata.runner, `${family}.metadata.runner`);
  if (
    runner.runnerLabel !== contract.runnerLabel ||
    runner.family !== family ||
    runner.platform !== contract.platform ||
    normalizeArchitecture(runner.architecture, `${family}.metadata.runner.architecture`) !==
      contract.architecture ||
    runner.osEdition !== sourceOs.edition
  ) {
    fail('REVIEW_RUNNER_IDENTITY_MISMATCH', `${family} retained runner contract does not match.`);
  }
  if (
    metadata.osBuild !== sourceOs.build ||
    metadata.osLocale !== sourceLocale.osLocale ||
    normalizeArchitecture(
      metadata.reportedArchitecture,
      `${family}.metadata.reportedArchitecture`,
    ) !== sourceOs.architecture ||
    normalizeArchitecture(metadata.nodeArchitecture, `${family}.metadata.nodeArchitecture`) !==
      sourceOs.architecture ||
    metadata.startedAt !== sourceTime.startedAt ||
    metadata.endedAt !== sourceTime.endedAt
  ) {
    fail(
      'REVIEW_RUNNER_IDENTITY_MISMATCH',
      `${family} metadata differs from its hash-bound platform source record.`,
    );
  }

  const runtime = objectAt(metadata.runtime, `${family}.metadata.runtime`);
  if (
    runtime.navigatorLanguage !== sourceBrowser.navigatorLanguage ||
    !isDeepStrictEqual(runtime.navigatorLanguages, sourceBrowser.navigatorLanguages) ||
    runtime.timeZone !== sourceLocale.timeZone ||
    runtime.decimalSeparator !== sourceLocale.decimalSeparator
  ) {
    fail('REVIEW_LOCALE_MISMATCH', `${family} runtime locale differs from its source record.`);
  }

  const provenance = objectAt(metadata.provenance, `${family}.metadata.provenance`);
  if (
    provenance.provider !== 'GitHub Actions' ||
    provenance.runnerEnvironment !== 'github-hosted'
  ) {
    fail('REVIEW_HOSTED_PROVENANCE_INVALID', `${family} is not GitHub-hosted provenance.`);
  }
  const repository = stringAt(provenance.repository, `${family}.provenance.repository`);
  if (!/^[^/\s]+\/[^/\s]+$/u.test(repository)) {
    fail('REVIEW_HOSTED_PROVENANCE_INVALID', `${family} repository must use owner/name.`);
  }
  const workflow = stringAt(provenance.workflow, `${family}.provenance.workflow`);
  if (workflow !== HOSTED_WORKFLOW_NAME) {
    fail(
      'REVIEW_HOSTED_PROVENANCE_INVALID',
      `${family} workflow must be ${HOSTED_WORKFLOW_NAME}.`,
    );
  }
  const workflowRef = stringAt(provenance.workflowRef, `${family}.provenance.workflowRef`);
  const runId = stringAt(provenance.runId, `${family}.provenance.runId`);
  const runAttempt = stringAt(provenance.runAttempt, `${family}.provenance.runAttempt`);
  if (!/^[1-9]\d*$/u.test(runId) || !/^[1-9]\d*$/u.test(runAttempt)) {
    fail('REVIEW_HOSTED_PROVENANCE_INVALID', `${family} runId/runAttempt must be positive integers.`);
  }
  const runUrl = stringAt(provenance.runUrl, `${family}.provenance.runUrl`);
  let parsedRunUrl;
  try {
    parsedRunUrl = new URL(runUrl);
  } catch {
    fail('REVIEW_HOSTED_PROVENANCE_INVALID', `${family} runUrl must be an absolute URL.`);
  }
  const expectedPath = `/${repository}/actions/runs/${runId}/attempts/${runAttempt}`;
  if (
    parsedRunUrl.protocol !== 'https:' ||
    parsedRunUrl.hostname !== 'github.com' ||
    parsedRunUrl.port !== '' ||
    parsedRunUrl.username !== '' ||
    parsedRunUrl.password !== '' ||
    parsedRunUrl.pathname !== expectedPath ||
    parsedRunUrl.search !== '' ||
    parsedRunUrl.hash !== ''
  ) {
    fail('REVIEW_HOSTED_PROVENANCE_INVALID', `${family} runUrl does not match run provenance.`);
  }
  const commitSha = stringAt(provenance.commitSha, `${family}.provenance.commitSha`);
  if (!GIT_SHA_PATTERN.test(commitSha)) {
    fail('REVIEW_HOSTED_PROVENANCE_INVALID', `${family} commitSha must be lowercase 40-hex.`);
  }
  const gitRef = stringAt(provenance.gitRef, `${family}.provenance.gitRef`);
  const expectedWorkflowRefPrefix = `${repository}/${HOSTED_WORKFLOW_PATH}@`;
  if (
    !workflowRef.startsWith(expectedWorkflowRefPrefix)
    || workflowRef.length === expectedWorkflowRefPrefix.length
    || workflowRef.slice(expectedWorkflowRefPrefix.length) !== gitRef
    || /\s/u.test(workflowRef)
  ) {
    fail(
      'REVIEW_HOSTED_PROVENANCE_INVALID',
      `${family} workflowRef must bind the fixed workflow path and gitRef.`,
    );
  }
  const actions = objectAt(provenance.actions, `${family}.provenance.actions`);
  allowedKeys(actions, Object.keys(HOSTED_ACTION_COMMITS), `${family}.provenance.actions`);
  for (const [role, expected] of Object.entries(HOSTED_ACTION_COMMITS)) {
    const action = objectAt(actions[role], `${family}.provenance.actions.${role}`);
    allowedKeys(
      action,
      ['commitSha', 'environment'],
      `${family}.provenance.actions.${role}`,
    );
    if (
      action.commitSha !== expected.commitSha
      || action.environment !== expected.environment
    ) {
      fail(
        'REVIEW_HOSTED_PROVENANCE_INVALID',
        `${family} ${role} action pin differs from the fixed workflow contract.`,
      );
    }
  }
  const browserExpectation = objectAt(
    provenance.browserExpectation,
    `${family}.provenance.browserExpectation`,
  );
  allowedKeys(
    browserExpectation,
    ['product', 'expectedMajor', 'environment'],
    `${family}.provenance.browserExpectation`,
  );
  if (
    browserExpectation.product !== 'Google Chrome'
    || browserExpectation.expectedMajor !== 150
    || browserExpectation.environment !== 'AES_EXPECTED_GOOGLE_CHROME_MAJOR'
  ) {
    fail(
      'REVIEW_HOSTED_PROVENANCE_INVALID',
      `${family} browser expectation differs from the fixed workflow contract.`,
    );
  }
  const runnerArchitecture = normalizeArchitecture(
    provenance.runnerArchitecture,
    `${family}.provenance.runnerArchitecture`,
  );
  if (
    runnerArchitecture !== sourceOs.architecture ||
    normalizeRunnerOs(provenance.runnerOS, `${family}.provenance.runnerOS`) !==
      contract.runnerOS
  ) {
    fail('REVIEW_RUNNER_IDENTITY_MISMATCH', `${family} provenance OS/architecture differs.`);
  }
  const expectedSourceRunId = `gha-${family}-${runId}-${runAttempt}`;
  if (sourceRecord.runId !== expectedSourceRunId) {
    fail(
      'REVIEW_HOSTED_PROVENANCE_INVALID',
      `${family} source runId must equal ${expectedSourceRunId}.`,
    );
  }
  return {
    provider: 'GitHub Actions',
    repository,
    workflow,
    workflowRef,
    runId,
    runAttempt,
    runUrl,
    commitSha,
    gitRef,
    runnerEnvironment: 'github-hosted',
    runnerName: stringAt(provenance.runnerName, `${family}.provenance.runnerName`),
    runnerOS: stringAt(provenance.runnerOS, `${family}.provenance.runnerOS`),
    runnerArchitecture,
    imageOS: stringAt(provenance.imageOS, `${family}.provenance.imageOS`),
    imageVersion: stringAt(provenance.imageVersion, `${family}.provenance.imageVersion`),
  };
}

function validateHostedWorkflowPreflightArtifact(
  preflight,
  family,
  metadata,
  provenance,
  file,
) {
  const contract = RUNNER_CONTRACT[family];
  try {
    validateHostedWorkflowPreflight(preflight, {
      osFamily: family,
      runnerLabel: contract.runnerLabel,
      nodeArchitecture: contract.architecture,
    });
  } catch (error) {
    fail(
      'REVIEW_PREFLIGHT_INVALID',
      `${family} hosted workflow preflight is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const descriptor = objectAt(
    metadata.workflowPreflight,
    `${family}.metadata.workflowPreflight`,
  );
  allowedKeys(
    descriptor,
    ['path', 'bytes', 'sha256'],
    `${family}.metadata.workflowPreflight`,
  );
  if (
    descriptor.path !== HOSTED_WORKFLOW_PREFLIGHT_NAME
    || descriptor.bytes !== file.sizeBytes
    || descriptor.sha256 !== file.sha256
  ) {
    fail(
      'REVIEW_PREFLIGHT_BINDING_MISMATCH',
      `${family} preflight bytes do not match the hosted metadata descriptor.`,
    );
  }
  const observed = preflight.observedEnvironment;
  const exactObserved = {
    repository: provenance.repository,
    workflow: provenance.workflow,
    workflowRef: provenance.workflowRef,
    runId: provenance.runId,
    runAttempt: provenance.runAttempt,
    commitSha: provenance.commitSha,
    gitRef: provenance.gitRef,
    imageOs: provenance.imageOS,
    imageVersion: provenance.imageVersion,
  };
  for (const [key, expected] of Object.entries(exactObserved)) {
    if (observed[key] !== expected) {
      fail(
        'REVIEW_PREFLIGHT_PROVENANCE_MISMATCH',
        `${family} preflight ${key} differs from hosted metadata provenance.`,
      );
    }
  }
  if (
    normalizeRunnerOs(observed.runnerOs, `${family}.preflight.runnerOs`)
      !== contract.runnerOS
    || normalizeArchitecture(
      observed.runnerArchitecture,
      `${family}.preflight.runnerArchitecture`,
    ) !== contract.architecture
    || preflight.runtime.platform !== metadata.runner.platform
  ) {
    fail(
      'REVIEW_PREFLIGHT_PROVENANCE_MISMATCH',
      `${family} preflight runner/runtime identity differs from hosted metadata.`,
    );
  }
  const preflightStartedAt = utcAt(
    preflight.startedAtUtc,
    `${family}.preflight.startedAtUtc`,
  );
  const runStartedAt = utcAt(metadata.startedAt, `${family}.metadata.startedAt`);
  if (preflightStartedAt.epoch >= runStartedAt.epoch) {
    fail(
      'REVIEW_PREFLIGHT_TIME_INVALID',
      `${family} preflight must precede the browser harness run interval.`,
    );
  }
  return {
    schema: preflight.schema,
    claimStatus: preflight.claimStatus,
    startedAtUtc: preflightStartedAt.text,
    declaredTarget: preflight.declaredTarget,
    evidenceBoundary: preflight.evidenceBoundary,
  };
}

function validateHostedUploadReceipt(
  receipt,
  family,
  provenance,
  {
    runEndedAtEpoch,
    reviewStartedAtEpoch,
  },
) {
  const label = `${family}.hostedUploadReceipt`;
  const value = objectAt(receipt, label);
  allowedKeys(
    value,
    [
      'schemaVersion',
      'provider',
      'repository',
      'workflow',
      'runId',
      'runAttempt',
      'commitSha',
      'artifactId',
      'artifactName',
      'artifactUrl',
      'artifactDigest',
      'capturedAtUtc',
      'claimBoundary',
    ],
    label,
  );
  if (value.schemaVersion !== HOSTED_UPLOAD_RECEIPT_SCHEMA) {
    fail(
      'REVIEW_UPLOAD_RECEIPT_INVALID',
      `${label}.schemaVersion is invalid.`,
    );
  }
  const exact = {
    provider: 'GitHub Actions',
    repository: provenance.repository,
    workflow: provenance.workflow,
    runId: provenance.runId,
    runAttempt: provenance.runAttempt,
    commitSha: provenance.commitSha,
  };
  for (const [key, expected] of Object.entries(exact)) {
    if (stringAt(value[key], `${label}.${key}`) !== expected) {
      fail(
        'REVIEW_UPLOAD_RECEIPT_INVALID',
        `${label}.${key} differs from hosted run provenance.`,
      );
    }
  }
  const artifactId = stringAt(value.artifactId, `${label}.artifactId`);
  if (!/^[1-9]\d*$/u.test(artifactId)) {
    fail(
      'REVIEW_UPLOAD_RECEIPT_INVALID',
      `${label}.artifactId must be a positive decimal identifier.`,
    );
  }
  const expectedName =
    `hosted-platform-${IS_V032_CONTRACT ? 'v0.3.2-' : ''}${family}-${provenance.runId}-${provenance.runAttempt}`;
  if (stringAt(value.artifactName, `${label}.artifactName`) !== expectedName) {
    fail(
      'REVIEW_UPLOAD_RECEIPT_INVALID',
      `${label}.artifactName differs from the workflow artifact name.`,
    );
  }
  const expectedUrl =
    `https://github.com/${provenance.repository}/actions/runs/${provenance.runId}/artifacts/${artifactId}`;
  if (stringAt(value.artifactUrl, `${label}.artifactUrl`) !== expectedUrl) {
    fail(
      'REVIEW_UPLOAD_RECEIPT_INVALID',
      `${label}.artifactUrl is inconsistent with repository, run, and artifact ID.`,
    );
  }
  const artifactDigest = stringAt(
    value.artifactDigest,
    `${label}.artifactDigest`,
  );
  if (!/^[a-f0-9]{64}$/u.test(artifactDigest)) {
    fail(
      'REVIEW_UPLOAD_RECEIPT_INVALID',
      `${label}.artifactDigest must be the exact 64-character lowercase upload-artifact output.`,
    );
  }
  const capturedAt = utcAt(value.capturedAtUtc, `${label}.capturedAtUtc`);
  if (
    capturedAt.epoch <= runEndedAtEpoch
    || capturedAt.epoch > reviewStartedAtEpoch
  ) {
    fail(
      'REVIEW_UPLOAD_RECEIPT_INVALID',
      `${label}.capturedAtUtc must be after the run and no later than human review start.`,
    );
  }
  const claimBoundary = stringAt(
    value.claimBoundary,
    `${label}.claimBoundary`,
  );
  if (
    claimBoundary
    !== 'DECLARED_GITHUB_ACTIONS_UPLOAD_OUTPUT_NOT_AUTHENTICATED_BY_SOFTWARE'
  ) {
    fail(
      'REVIEW_UPLOAD_RECEIPT_INVALID',
      `${label}.claimBoundary is invalid.`,
    );
  }
  return {
    provider: 'GitHub Actions',
    artifactId,
    artifactName: expectedName,
    artifactUrl: expectedUrl,
    artifactDigest,
    capturedAtUtc: capturedAt.text,
    claimBoundary,
  };
}

function expectedEvidenceHashes(id, files, sourceSha256) {
  const metadata = files.hostedRunMetadata.sha256;
  const byId = {
    HAR_NETWORK: [
      sourceSha256,
      metadata,
      ...(IS_V032_CONTRACT ? [files.rawCdpEvents.sha256] : []),
      files.networkHar.sha256,
    ],
    SCREENSHOT_UI: [sourceSha256, files.screenshot.sha256],
    PDF_VISUAL_QA: [sourceSha256, files.reportPdf.sha256],
    JSON_CSV_PDF_CONSISTENCY: [
      sourceSha256,
      files.reportJson.sha256,
      files.reportCsv.sha256,
      files.reportPdf.sha256,
    ],
    RUNNER_OS_ARCH_IDENTITY: [
      sourceSha256,
      metadata,
      files.hostedWorkflowPreflight.sha256,
      files.hostedUploadReceipt.sha256,
    ],
    DEVIATIONS: [sourceSha256, metadata],
  };
  return byId[id];
}

function validateDeviationAssessments(value, deviations, label) {
  const assessments = arrayAt(value, label);
  const normalized = assessments.map((item, index) => {
    const itemLabel = `${label}[${index}]`;
    const assessment = objectAt(item, itemLabel);
    allowedKeys(assessment, ['deviation', 'disposition', 'comment'], itemLabel);
    const deviation = stringAt(assessment.deviation, `${itemLabel}.deviation`);
    const disposition = stringAt(assessment.disposition, `${itemLabel}.disposition`);
    if (!['ACCEPTED_NON_MATERIAL', 'MATERIAL_FAILURE'].includes(disposition)) {
      fail('REVIEW_DEVIATION_INVALID', `${itemLabel}.disposition is invalid.`);
    }
    return {
      deviation,
      disposition,
      comment: stringAt(assessment.comment, `${itemLabel}.comment`),
    };
  });
  if (!sameSet(normalized.map((item) => item.deviation), deviations)) {
    fail(
      'REVIEW_DEVIATION_INVALID',
      `${label} must assess every source-record deviation exactly once.`,
    );
  }
  return normalized;
}

function validateDecisions(value, files, sourceSha256, deviations, family) {
  const decisions = arrayAt(value, `${family}.decisions`);
  if (decisions.length !== PLATFORM_HUMAN_REVIEW_DECISION_IDS.length) {
    fail(
      'REVIEW_DECISION_SET_INVALID',
      `${family} requires exactly ${PLATFORM_HUMAN_REVIEW_DECISION_IDS.length} review decisions.`,
    );
  }
  const normalized = decisions.map((item, index) => {
    const label = `${family}.decisions[${index}]`;
    const decision = objectAt(item, label);
    allowedKeys(
      decision,
      [
        'id',
        'reviewStatus',
        'decision',
        'reviewedEvidenceSha256',
        'comment',
        'deviationAssessments',
      ],
      label,
    );
    const id = stringAt(decision.id, `${label}.id`);
    if (!PLATFORM_HUMAN_REVIEW_DECISION_IDS.includes(id)) {
      fail('REVIEW_DECISION_SET_INVALID', `${label}.id is unknown: ${id}.`);
    }
    if (decision.reviewStatus !== 'REVIEWED') {
      fail('REVIEW_UNREVIEWED', `${family}.${id} must have reviewStatus REVIEWED.`);
    }
    if (!['PASS', 'FAIL'].includes(decision.decision)) {
      fail('REVIEW_DECISION_INVALID', `${family}.${id} must be PASS or FAIL.`);
    }
    const evidence = arrayAt(
      decision.reviewedEvidenceSha256,
      `${family}.${id}.reviewedEvidenceSha256`,
    ).map((hash, hashIndex) =>
      shaAt(hash, `${family}.${id}.reviewedEvidenceSha256[${hashIndex}]`),
    );
    const expectedEvidence = expectedEvidenceHashes(id, files, sourceSha256);
    if (!sameSet(evidence, expectedEvidence)) {
      fail(
        'REVIEW_EVIDENCE_BINDING_MISMATCH',
        `${family}.${id} must bind exactly to its actual retained evidence hashes.`,
      );
    }
    let deviationAssessments;
    if (id === 'DEVIATIONS') {
      deviationAssessments = validateDeviationAssessments(
        decision.deviationAssessments,
        deviations,
        `${family}.${id}.deviationAssessments`,
      );
      const expectedDecision = deviationAssessments.some(
        (assessment) => assessment.disposition === 'MATERIAL_FAILURE',
      )
        ? 'FAIL'
        : 'PASS';
      if (decision.decision !== expectedDecision) {
        fail(
          'REVIEW_FALSE_PASS',
          `${family}.${id} disposition conflicts with its deviation assessments.`,
        );
      }
    } else if (decision.deviationAssessments !== undefined) {
      fail('REVIEW_UNKNOWN_FIELD', `${family}.${id} cannot contain deviationAssessments.`);
    }
    return {
      id,
      reviewStatus: 'REVIEWED',
      decision: decision.decision,
      reviewedEvidenceSha256: [...evidence].sort(),
      comment: stringAt(decision.comment, `${family}.${id}.comment`),
      ...(deviationAssessments ? { deviationAssessments } : {}),
    };
  });
  if (
    !sameSet(
      normalized.map((decision) => decision.id),
      PLATFORM_HUMAN_REVIEW_DECISION_IDS,
    )
  ) {
    fail('REVIEW_DECISION_SET_INVALID', `${family} decision IDs must be complete and unique.`);
  }
  return normalized.sort(
    (left, right) =>
      PLATFORM_HUMAN_REVIEW_DECISION_IDS.indexOf(left.id) -
      PLATFORM_HUMAN_REVIEW_DECISION_IDS.indexOf(right.id),
  );
}

function validatePlatformReview(value, index, context) {
  const label = `input.platformReviews[${index}]`;
  const review = objectAt(value, label);
  allowedKeys(
    review,
    [
      'osFamily',
      'runId',
      'sourceRecordSha256',
      'startedAtUtc',
      'endedAtUtc',
      'artifacts',
      'decisions',
    ],
    label,
  );
  const family = stringAt(review.osFamily, `${label}.osFamily`);
  const source = context.locks.byFamily.get(family);
  if (!source) fail('REVIEW_PLATFORM_SET_INVALID', `${label}.osFamily is unsupported: ${family}.`);
  if (review.runId !== source.record.runId) {
    fail('REVIEW_RUN_ID_MISMATCH', `${family} review runId differs from the source record.`);
  }
  const declaredSourceSha = shaAt(review.sourceRecordSha256, `${label}.sourceRecordSha256`);
  if (declaredSourceSha !== source.file.sha256) {
    fail('REVIEW_HASH_MISMATCH', `${family} review sourceRecordSha256 differs from actual bytes.`);
  }
  const startedAt = utcAt(review.startedAtUtc, `${label}.startedAtUtc`);
  const endedAt = utcAt(review.endedAtUtc, `${label}.endedAtUtc`);
  if (endedAt.epoch <= startedAt.epoch) {
    fail('REVIEW_TIME_ORDER_INVALID', `${family} review end must be later than its start.`);
  }
  if (
    startedAt.epoch < context.review.startedAt.epoch ||
    endedAt.epoch > context.review.endedAt.epoch
  ) {
    fail('REVIEW_TIME_ORDER_INVALID', `${family} review interval must be inside the global review.`);
  }
  const runEndedAt = utcAt(source.record.timeWindow.endedAt, `${family}.source.endedAt`);
  if (startedAt.epoch < runEndedAt.epoch) {
    fail('REVIEW_TIME_ORDER_INVALID', `${family} human review cannot begin before its run ends.`);
  }

  const declaredArtifacts = objectAt(review.artifacts, `${label}.artifacts`);
  allowedKeys(declaredArtifacts, REQUIRED_ARTIFACT_ROLES, `${label}.artifacts`);
  const files = {};
  for (const role of REQUIRED_ARTIFACT_ROLES) {
    files[role] = verifyHashedFile(
      context.evidenceRoot,
      declaredArtifacts[role],
      `${label}.artifacts.${role}`,
    );
  }
  if (
    new Set(REQUIRED_ARTIFACT_ROLES.map((role) => files[role].resolvedPath)).size !==
    REQUIRED_ARTIFACT_ROLES.length
  ) {
    fail('REVIEW_DUPLICATE_ARTIFACT', `${family} review artifacts must be distinct files.`);
  }
  const sourceArtifacts = objectAt(source.record.artifacts, `${family}.source.artifacts`);
  for (const role of SOURCE_BOUND_ARTIFACT_ROLES) {
    const expected = shaAt(
      objectAt(sourceArtifacts[role], `${family}.source.artifacts.${role}`).sha256,
      `${family}.source.artifacts.${role}.sha256`,
    );
    if (files[role].sha256 !== expected) {
      fail(
        'REVIEW_EVIDENCE_BINDING_MISMATCH',
        `${family}.${role} bytes do not match the source record.`,
      );
    }
  }
  const metadata = parseJsonBytes(
    files.hostedRunMetadata.bytes,
    `${family} hosted run metadata`,
  );
  if (IS_V032_CONTRACT) {
    const rawDescriptor = objectAt(
      objectAt(metadata.retainedFiles, `${family}.metadata.retainedFiles`).rawCdpEvents,
      `${family}.metadata.retainedFiles.rawCdpEvents`,
    );
    allowedKeys(
      rawDescriptor,
      ['path', 'bytes', 'sha256'],
      `${family}.metadata.retainedFiles.rawCdpEvents`,
    );
    if (
      rawDescriptor.path !== 'raw-cdp-events.json' ||
      rawDescriptor.bytes !== files.rawCdpEvents.sizeBytes ||
      rawDescriptor.sha256 !== files.rawCdpEvents.sha256 ||
      source.record.hostedOrigin?.rawCdpEvidence?.sha256 !== files.rawCdpEvents.sha256
    ) {
      fail(
        'REVIEW_EVIDENCE_BINDING_MISMATCH',
        `${family} raw CDP evidence is not hash-bound across metadata, source record, and review input.`,
      );
    }
  }
  const provenance = validateHostedMetadata(metadata, family, source.record);
  const workflowPreflight = validateHostedWorkflowPreflightArtifact(
    parseJsonBytes(
      files.hostedWorkflowPreflight.bytes,
      `${family} hosted workflow preflight`,
    ),
    family,
    metadata,
    provenance,
    files.hostedWorkflowPreflight,
  );
  const uploadReceipt = validateHostedUploadReceipt(
    parseJsonBytes(
      files.hostedUploadReceipt.bytes,
      `${family} hosted upload receipt`,
    ),
    family,
    provenance,
    {
      runEndedAtEpoch: runEndedAt.epoch,
      reviewStartedAtEpoch: startedAt.epoch,
    },
  );
  const deviations = arrayAt(
    objectAt(source.record.protocolObservation, `${family}.protocolObservation`).deviations,
    `${family}.protocolObservation.deviations`,
  ).map((deviation, deviationIndex) =>
    stringAt(deviation, `${family}.protocolObservation.deviations[${deviationIndex}]`),
  );
  if (new Set(deviations).size !== deviations.length) {
    fail('REVIEW_DEVIATION_INVALID', `${family} source deviations must be unique.`);
  }
  const decisions = validateDecisions(
    review.decisions,
    files,
    source.file.sha256,
    deviations,
    family,
  );
  const reviewerDisposition = decisions.every((decision) => decision.decision === 'PASS')
    ? 'PASS'
    : 'FAIL';
  return {
    osFamily: family,
    runId: source.record.runId,
    sourceRecord: publicFile(source.file),
    reviewWindow: {
      startedAtUtc: startedAt.text,
      endedAtUtc: endedAt.text,
    },
    platformIdentity: {
      os: source.record.environment.os,
      browser: source.record.environment.browser,
      runtime: source.record.environment.runtime,
    },
    locale: source.record.environment.locale,
    runProvenance: {
      metadataArtifact: publicFile(files.hostedRunMetadata),
      workflowPreflightArtifact: publicFile(files.hostedWorkflowPreflight),
      workflowPreflight,
      uploadReceiptArtifact: publicFile(files.hostedUploadReceipt),
      uploadReceipt,
      ...provenance,
    },
    retainedArtifacts: Object.fromEntries(
      REQUIRED_ARTIFACT_ROLES.filter((role) => role !== 'hostedRunMetadata').map((role) => [
        role,
        publicFile(files[role]),
      ]),
    ),
    deviations,
    decisions,
    reviewerDisposition,
  };
}

export function createPlatformHumanReviewRecord({ inputPath }) {
  if (!inputPath) fail('REVIEW_ARGUMENT_MISSING', 'inputPath is required.');
  const resolvedInputPath = resolve(inputPath);
  if (!existsSync(resolvedInputPath) || !statSync(resolvedInputPath).isFile()) {
    fail('REVIEW_FILE_MISSING', `Review input is missing: ${resolvedInputPath}.`);
  }
  const evidenceRoot = dirname(realpathSync(resolvedInputPath));
  const inputBytes = readFileSync(resolvedInputPath);
  const input = parseJsonBytes(inputBytes, 'platform human-review input');
  allowedKeys(
    input,
    [
      'schemaVersion',
      'reviewId',
      'locks',
      'reviewer',
      'review',
      'platformReviews',
      'reviewerMatrixDisposition',
    ],
    'input',
  );
  if (input.schemaVersion !== PLATFORM_HUMAN_REVIEW_INPUT_SCHEMA) {
    fail(
      'REVIEW_INPUT_SCHEMA_MISMATCH',
      `Expected ${PLATFORM_HUMAN_REVIEW_INPUT_SCHEMA}.`,
    );
  }
  const reviewId = stringAt(input.reviewId, 'input.reviewId');
  if (!ID_PATTERN.test(reviewId)) fail('REVIEW_ID_INVALID', `Invalid reviewId: ${reviewId}.`);
  const locks = verifyMatrixLocks(evidenceRoot, input.locks);
  const reviewer = validateReviewer(input.reviewer);
  const review = validateReviewContext(input.review);
  const platformReviews = arrayAt(input.platformReviews, 'input.platformReviews');
  if (platformReviews.length !== REQUIRED_OS_FAMILIES.length) {
    fail('REVIEW_PLATFORM_SET_INVALID', 'Exactly three platformReviews are required.');
  }
  const normalizedPlatforms = platformReviews.map((platform, index) =>
    validatePlatformReview(platform, index, { evidenceRoot, locks, review }),
  );
  if (!sameSet(normalizedPlatforms.map((platform) => platform.osFamily), REQUIRED_OS_FAMILIES)) {
    fail('REVIEW_PLATFORM_SET_INVALID', 'Platform reviews must be unique macos, windows11, ubuntu.');
  }
  const reviewerMatrixDisposition = stringAt(
    input.reviewerMatrixDisposition,
    'input.reviewerMatrixDisposition',
  );
  if (!['PASS', 'FAIL'].includes(reviewerMatrixDisposition)) {
    fail('REVIEW_DECISION_INVALID', 'reviewerMatrixDisposition must be PASS or FAIL.');
  }
  const derivedMatrixDisposition = normalizedPlatforms.every(
    (platform) => platform.reviewerDisposition === 'PASS',
  )
    ? 'PASS'
    : 'FAIL';
  if (reviewerMatrixDisposition !== derivedMatrixDisposition) {
    fail(
      'REVIEW_FALSE_PASS',
      `reviewerMatrixDisposition must be ${derivedMatrixDisposition} for the retained decisions.`,
    );
  }
  const order = new Map(REQUIRED_OS_FAMILIES.map((family, index) => [family, index]));
  normalizedPlatforms.sort(
    (left, right) => order.get(left.osFamily) - order.get(right.osFamily),
  );

  const retainedArtifacts = [
    publicFile(locks.matrixFile),
    ...locks.sources.map((source) => publicFile(source.file)),
    ...normalizedPlatforms.flatMap((platform) => [
      platform.runProvenance.metadataArtifact,
      ...Object.values(platform.retainedArtifacts),
    ]),
  ].sort((left, right) => left.path.localeCompare(right.path));

  return {
    schemaVersion: PLATFORM_HUMAN_REVIEW_RECORD_SCHEMA,
    reviewId,
    recordState: PLATFORM_HUMAN_REVIEW_RECORD_STATE,
    matrixIntegrity: {
      status: 'TECHNICALLY_VERIFIED',
      matrix: publicFile(locks.matrixFile),
      sourceRecords: normalizedPlatforms.map((platform) => platform.sourceRecord),
    },
    reviewer,
    review: review.public,
    platforms: normalizedPlatforms,
    reviewerMatrixDisposition,
    eligibleForHumanGateDisposition: derivedMatrixDisposition === 'PASS',
    acceptanceGateStatus: 'NOT_AUTOMATICALLY_APPLIED',
    gateDispositionBoundary: {
      acPlat01: 'RECORDED_HUMAN_DISPOSITION_REQUIRES_INDEPENDENT_AUTHENTICITY_AUDIT',
      acPlat02: 'RECORDED_HUMAN_DISPOSITION_REQUIRES_INDEPENDENT_AUTHENTICITY_AUDIT',
      statement:
        'This recorder validates structure, actual file hashes, provenance consistency, and decision completeness. It does not authenticate the reviewer or automatically mark any acceptance criterion PASS.',
    },
    authenticityStatus: 'NOT_VERIFIED_BY_SOFTWARE',
    retainedArtifacts,
    sourceInput: {
      fileName: basename(resolvedInputPath),
      sizeBytes: inputBytes.length,
      sha256: sha256(inputBytes),
    },
    verifiedChecks: [
      'ACTUAL_MATRIX_BYTES_SHA256_MATCH',
      'ACTUAL_THREE_SOURCE_RECORD_BYTES_SHA256_MATCH',
      'MATRIX_EXACTLY_RECOMPUTED_FROM_SOURCE_RECORDS',
      'HOSTED_GITHUB_ACTIONS_PROVENANCE_BOUND_PER_OS',
      'HOSTED_WORKFLOW_PREFLIGHT_BYTES_BOUND_PER_OS',
      'DECLARED_GITHUB_ACTIONS_UPLOAD_RECEIPT_BOUND_PER_OS',
      'FIXED_RUNNER_OS_ARCHITECTURE_IDENTITY_BOUND_PER_OS',
      'HAR_SCREENSHOT_PDF_JSON_CSV_BYTES_BOUND_PER_OS',
      'ALL_SIX_HUMAN_DECISIONS_REVIEWED_PER_OS',
      'DEVIATIONS_EXACTLY_ASSESSED_PER_OS',
      'NO_AUTOMATIC_ACCEPTANCE_GATE_CLOSURE',
    ],
  };
}

export function serializePlatformHumanReviewRecord(record) {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function writePlatformHumanReviewRecord({ inputPath, outputPath }) {
  if (!outputPath) fail('REVIEW_ARGUMENT_MISSING', 'outputPath is required.');
  const record = createPlatformHumanReviewRecord({ inputPath });
  const absoluteOutputPath = resolve(outputPath);
  if (extname(absoluteOutputPath).toLowerCase() !== '.json') {
    fail('REVIEW_OUTPUT_INVALID', 'Review-record output path must use .json.');
  }
  const evidenceRoot = dirname(realpathSync(resolve(inputPath)));
  const protectedPaths = new Set([
    realpathSync(resolve(inputPath)),
    ...record.retainedArtifacts.map((artifact) =>
      realpathSync(resolve(evidenceRoot, ...artifact.path.split('/'))),
    ),
  ]);
  if (existsSync(absoluteOutputPath) && protectedPaths.has(realpathSync(absoluteOutputPath))) {
    fail('REVIEW_OUTPUT_INVALID', 'Review output must not overwrite any input evidence file.');
  }
  if (protectedPaths.has(absoluteOutputPath)) {
    fail('REVIEW_OUTPUT_INVALID', 'Review output must not overwrite any input evidence file.');
  }
  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  const temporaryPath = `${absoluteOutputPath}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, serializePlatformHumanReviewRecord(record), 'utf8');
    rmSync(absoluteOutputPath, { force: true });
    renameSync(temporaryPath, absoluteOutputPath);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    if (error instanceof PlatformHumanReviewValidationError) throw error;
    fail(
      'REVIEW_OUTPUT_WRITE_FAILED',
      `Could not write review record: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
  return record;
}

function parseArguments(argv) {
  let inputPath;
  let outputPath;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--input') inputPath = argv[++index];
    else if (argument === '--output') outputPath = argv[++index];
    else fail('REVIEW_USAGE', `Unknown argument: ${argument}.`);
  }
  if (!inputPath) fail('REVIEW_USAGE', '--input requires a JSON path.');
  if (argv.includes('--output') && !outputPath) {
    fail('REVIEW_USAGE', '--output requires a JSON path.');
  }
  return { help: false, inputPath, outputPath };
}

function usage() {
  return [
    'Usage:',
    '  node <recorder-directory>/record-platform-human-review.mjs \\',
    '    --input <platform-human-review-input.json> \\',
    '    [--output <platform-human-review-record.json>]',
    '',
    'Without --output, the structural review record is written to stdout.',
    'The recorder never authenticates the reviewer or closes AC-PLAT acceptance gates.',
  ].join('\n');
}

export function main(argv = process.argv.slice(2)) {
  try {
    const parsed = parseArguments(argv);
    if (parsed.help) {
      console.log(usage());
      return 0;
    }
    if (parsed.outputPath) {
      writePlatformHumanReviewRecord(parsed);
      console.log(`OK PLATFORM_HUMAN_REVIEW_RECORDED ${resolve(parsed.outputPath)}`);
    } else {
      process.stdout.write(
        serializePlatformHumanReviewRecord(
          createPlatformHumanReviewRecord({ inputPath: parsed.inputPath }),
        ),
      );
    }
    return 0;
  } catch (error) {
    const prefix =
      error instanceof PlatformHumanReviewValidationError
        ? `FAIL ${error.code}`
        : 'FAIL UNEXPECTED';
    console.error(`${prefix} ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = main();
}

export const PLATFORM_HUMAN_REVIEW_SCRIPT_PATH = SCRIPT_PATH;
