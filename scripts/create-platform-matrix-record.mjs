#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const INPUT_SCHEMA = 'activation-energy-studio/platform-evidence-record/v1';
const OUTPUT_SCHEMA = 'activation-energy-studio/platform-matrix-record/v1';
const REQUIRED_OS_FAMILIES = ['macos', 'windows11', 'ubuntu'];
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export class PlatformMatrixValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PlatformMatrixValidationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PlatformMatrixValidationError(code, message);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function objectAt(value, label) {
  if (!isObject(value)) fail('RECORD_INVALID', `${label} must be an object.`);
  return value;
}

function stringAt(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('RECORD_INVALID', `${label} must be a non-empty string.`);
  }
  return value;
}

function shaAt(value, label) {
  const normalized = stringAt(value, label).toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) fail('RECORD_INVALID', `${label} must be a lowercase SHA-256.`);
  return normalized;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sameSet(left, right) {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every((item) => right.includes(item))
  );
}

function sameValue(items, label) {
  const distinct = [...new Set(items)];
  if (distinct.length !== 1) {
    fail('MATRIX_MISMATCH', `${label} differs across platform records: ${distinct.join(', ')}.`);
  }
  return distinct[0];
}

function readEvidenceRecord(path) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    fail('MISSING_RECORD', `Platform evidence record is missing: ${absolutePath}.`);
  }
  if (extname(absolutePath).toLowerCase() !== '.json') {
    fail('RECORD_INVALID', `Platform evidence record must use .json: ${absolutePath}.`);
  }
  const bytes = readFileSync(absolutePath);
  if (bytes.length === 0) fail('RECORD_INVALID', `Platform evidence record is empty: ${absolutePath}.`);
  let record;
  try {
    record = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    fail('RECORD_INVALID', `${absolutePath} is not valid JSON: ${error.message}`);
  }
  return {
    absolutePath,
    fileName: basename(absolutePath),
    sizeBytes: bytes.length,
    sha256: sha256(bytes),
    record: objectAt(record, absolutePath),
  };
}

function validateEvidenceRecord(source) {
  const { record } = source;
  if (record.schemaVersion !== INPUT_SCHEMA) {
    fail('RECORD_INVALID', `${source.fileName} must use ${INPUT_SCHEMA}.`);
  }
  if (record.recordStatus !== 'VALIDATED_RETAINED_ARTIFACT_SET') {
    fail('RECORD_INVALID', `${source.fileName} is not a validated retained-artifact record.`);
  }
  const runId = stringAt(record.runId, `${source.fileName}.runId`);
  const claimBoundary = objectAt(record.claimBoundary, `${source.fileName}.claimBoundary`);
  if (
    claimBoundary.acPlat01 !== 'ONE_RUN_EVIDENCE_READY_FOR_REVIEW' ||
    claimBoundary.acPlat02 !== 'AWAITING_THREE_PLATFORM_SCIENTIFIC_JSON_COMPARISON'
  ) {
    fail('RECORD_INVALID', `${source.fileName} has an incompatible one-run claim boundary.`);
  }

  const environment = objectAt(record.environment, `${source.fileName}.environment`);
  const os = objectAt(environment.os, `${source.fileName}.environment.os`);
  const family = stringAt(os.family, `${source.fileName}.environment.os.family`);
  if (!REQUIRED_OS_FAMILIES.includes(family)) {
    fail('RECORD_INVALID', `${source.fileName} has unsupported OS family ${family}.`);
  }
  const osSummary = {
    family,
    edition: stringAt(os.edition, `${source.fileName}.environment.os.edition`),
    build: stringAt(os.build, `${source.fileName}.environment.os.build`),
    architecture: stringAt(os.architecture, `${source.fileName}.environment.os.architecture`),
  };
  const browser = objectAt(environment.browser, `${source.fileName}.environment.browser`);
  const browserSummary = {
    name: stringAt(browser.name, `${source.fileName}.environment.browser.name`),
    version: stringAt(browser.version, `${source.fileName}.environment.browser.version`),
    engine: stringAt(browser.engine, `${source.fileName}.environment.browser.engine`),
  };

  const artifacts = objectAt(record.artifacts, `${source.fileName}.artifacts`);
  const release = objectAt(artifacts.release, `${source.fileName}.artifacts.release`);
  const goldenInput = objectAt(artifacts.goldenInput, `${source.fileName}.artifacts.goldenInput`);
  const selfTestArtifact = objectAt(artifacts.selfTestJson, `${source.fileName}.artifacts.selfTestJson`);

  const selfTest = objectAt(record.selfTest, `${source.fileName}.selfTest`);
  if (
    selfTest.recordStatus !== 'PASS' ||
    selfTest.platformGateStatus !== 'NOT_CLOSED_BY_SELF_TEST' ||
    selfTest.passedCheckCount !== 11
  ) {
    fail('RECORD_INVALID', `${source.fileName} does not retain an 11/11 PASS self-test boundary.`);
  }
  const goldenInputSha256 = shaAt(goldenInput.sha256, `${source.fileName}.artifacts.goldenInput.sha256`);
  const selfTestInputSha256 = shaAt(selfTest.inputSha256, `${source.fileName}.selfTest.inputSha256`);
  if (goldenInputSha256 !== selfTestInputSha256) {
    fail('RECORD_INVALID', `${source.fileName} self-test input hash differs from its retained golden input.`);
  }

  const protocolObservation = objectAt(
    record.protocolObservation,
    `${source.fileName}.protocolObservation`,
  );
  const networkCapture = objectAt(
    protocolObservation.networkCapture,
    `${source.fileName}.protocolObservation.networkCapture`,
  );
  if (
    networkCapture.externalRequestAttempts !== 0 ||
    !Number.isInteger(networkCapture.totalEntries) ||
    networkCapture.totalEntries < 1 ||
    !Number.isInteger(networkCapture.localRequestEntries) ||
    networkCapture.localRequestEntries < 1 ||
    !Number.isInteger(networkCapture.pageCount) ||
    networkCapture.pageCount < 1
  ) {
    fail('RECORD_INVALID', `${source.fileName} does not retain a non-empty zero-external-request HAR summary.`);
  }
  const harCreator = objectAt(networkCapture.creator, `${source.fileName}.networkCapture.creator`);
  stringAt(harCreator.name, `${source.fileName}.networkCapture.creator.name`);
  stringAt(harCreator.version, `${source.fileName}.networkCapture.creator.version`);

  const visualEvidence = objectAt(record.visualEvidence, `${source.fileName}.visualEvidence`);
  if (visualEvidence.contentReviewStatus !== 'AWAITING_HUMAN_VISUAL_REVIEW') {
    fail('RECORD_INVALID', `${source.fileName} must preserve the human visual-review boundary.`);
  }

  const scientificReport = objectAt(record.scientificReport, `${source.fileName}.scientificReport`);
  const timeWindow = objectAt(record.timeWindow, `${source.fileName}.timeWindow`);
  return {
    family,
    runId,
    os: osSummary,
    browser: browserSummary,
    timeWindow: {
      startedAt: stringAt(timeWindow.startedAt, `${source.fileName}.timeWindow.startedAt`),
      endedAt: stringAt(timeWindow.endedAt, `${source.fileName}.timeWindow.endedAt`),
    },
    sourceRecord: {
      fileName: source.fileName,
      sizeBytes: source.sizeBytes,
      sha256: source.sha256,
    },
    hashes: {
      releaseSha256: shaAt(release.sha256, `${source.fileName}.artifacts.release.sha256`),
      goldenInputSha256,
      selfTestArtifactSha256: shaAt(
        selfTestArtifact.sha256,
        `${source.fileName}.artifacts.selfTestJson.sha256`,
      ),
      scientificBuildSha256: shaAt(
        selfTest.scientificBuildSha256,
        `${source.fileName}.selfTest.scientificBuildSha256`,
      ),
      selfTestPayloadSha256: shaAt(
        selfTest.scientificPayloadSha256,
        `${source.fileName}.selfTest.scientificPayloadSha256`,
      ),
      scientificReportCanonicalSha256: shaAt(
        scientificReport.canonicalSha256,
        `${source.fileName}.scientificReport.canonicalSha256`,
      ),
    },
    networkCapture: {
      externalRequestAttempts: 0,
      totalEntries: networkCapture.totalEntries,
      localRequestEntries: networkCapture.localRequestEntries,
      pageCount: networkCapture.pageCount,
      creator: {
        name: harCreator.name,
        version: harCreator.version,
      },
    },
    selfTest: {
      recordStatus: 'PASS',
      platformGateStatus: 'NOT_CLOSED_BY_SELF_TEST',
      passedCheckCount: 11,
    },
    visualReviewStatus: 'AWAITING_HUMAN_VISUAL_REVIEW',
  };
}

export function createPlatformMatrixRecord(recordPaths) {
  if (!Array.isArray(recordPaths) || recordPaths.length !== 3) {
    fail('USAGE', 'Exactly three --record paths are required.');
  }
  const platforms = recordPaths.map((path) => validateEvidenceRecord(readEvidenceRecord(path)));
  const families = platforms.map((platform) => platform.family);
  if (!sameSet(families, REQUIRED_OS_FAMILIES)) {
    fail(
      'MATRIX_MISMATCH',
      `OS family set must be exactly ${REQUIRED_OS_FAMILIES.join(', ')}; received ${families.join(', ')}.`,
    );
  }
  const runIds = platforms.map((platform) => platform.runId);
  if (new Set(runIds).size !== runIds.length) {
    fail('MATRIX_MISMATCH', 'Every platform evidence record must have a distinct runId.');
  }
  const recordHashes = platforms.map((platform) => platform.sourceRecord.sha256);
  if (new Set(recordHashes).size !== recordHashes.length) {
    fail('MATRIX_MISMATCH', 'Every platform evidence record must be a distinct retained JSON file.');
  }

  const commonHashes = {
    releaseSha256: sameValue(
      platforms.map((platform) => platform.hashes.releaseSha256),
      'release SHA-256',
    ),
    goldenInputSha256: sameValue(
      platforms.map((platform) => platform.hashes.goldenInputSha256),
      'golden-input SHA-256',
    ),
    scientificBuildSha256: sameValue(
      platforms.map((platform) => platform.hashes.scientificBuildSha256),
      'scientific-build SHA-256',
    ),
    selfTestPayloadSha256: sameValue(
      platforms.map((platform) => platform.hashes.selfTestPayloadSha256),
      'self-test scientific-payload SHA-256',
    ),
    scientificReportCanonicalSha256: sameValue(
      platforms.map((platform) => platform.hashes.scientificReportCanonicalSha256),
      'scientific-report canonical SHA-256',
    ),
  };

  const order = new Map(REQUIRED_OS_FAMILIES.map((family, index) => [family, index]));
  platforms.sort((left, right) => order.get(left.family) - order.get(right.family));
  return {
    schemaVersion: OUTPUT_SCHEMA,
    recordStatus: 'VALIDATED_THREE_PLATFORM_EVIDENCE_MATRIX',
    claimBoundary: {
      acPlat01: 'THREE_RETAINED_RUNS_READY_FOR_HUMAN_REVIEW',
      acPlat02: 'THREE_OS_MATRIX_READY_FOR_HUMAN_REVIEW',
      statement:
        'This deterministic matrix validates the retained records and their cross-platform invariants. It does not itself mark AC-PLAT-01 or AC-PLAT-02 PASS; raw HAR and visual evidence still require human audit.',
    },
    requiredOsFamilies: [...REQUIRED_OS_FAMILIES],
    commonHashes,
    platforms,
    humanReviewRequirements: [
      'Inspect every raw HAR and confirm the capture visibly covers the declared run.',
      'Inspect every screenshot or screen recording for final status, methods, common alpha range, warnings, and offline state.',
      'Confirm observer-declared OS/browser/runtime identity against the external handoff.',
    ],
    verifiedChecks: [
      'EXACT_MACOS_WINDOWS11_UBUNTU_SET',
      'DISTINCT_RUN_IDS_AND_RECORD_FILES',
      'COMMON_RELEASE_SHA256',
      'COMMON_GOLDEN_INPUT_SHA256',
      'COMMON_SCIENTIFIC_BUILD_SHA256',
      'COMMON_SELF_TEST_PAYLOAD_SHA256',
      'COMMON_SCIENTIFIC_REPORT_CANONICAL_SHA256',
      'ZERO_EXTERNAL_REQUESTS_EACH_RUN',
      'SELF_TEST_PASS_BOUNDARY_EACH_RUN',
      'HUMAN_VISUAL_REVIEW_BOUNDARY_PRESERVED',
    ],
  };
}

export function serializePlatformMatrixRecord(record) {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function writePlatformMatrixRecord(recordPaths, outputPath) {
  const matrix = createPlatformMatrixRecord(recordPaths);
  const absoluteOutputPath = resolve(outputPath);
  if (extname(absoluteOutputPath).toLowerCase() !== '.json') {
    fail('OUTPUT_INVALID', 'Matrix output path must use the .json extension.');
  }
  const inputPaths = new Set(recordPaths.map((path) => resolve(path)));
  if (inputPaths.has(absoluteOutputPath)) {
    fail('OUTPUT_INVALID', 'Matrix output must not overwrite an input evidence record.');
  }
  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  const temporaryPath = `${absoluteOutputPath}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, serializePlatformMatrixRecord(matrix), 'utf8');
    rmSync(absoluteOutputPath, { force: true });
    renameSync(temporaryPath, absoluteOutputPath);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    fail('OUTPUT_WRITE_FAILED', `Could not write platform matrix record: ${error.message}`);
  }
  return matrix;
}

function parseArguments(argumentsList) {
  const recordPaths = [];
  let outputPath;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--record') recordPaths.push(argumentsList[++index]);
    else if (argument === '--output') outputPath = argumentsList[++index];
    else if (argument === '--help' || argument === '-h') return { help: true };
    else fail('USAGE', `Unknown argument: ${argument}.`);
  }
  if (recordPaths.some((path) => !path)) fail('USAGE', '--record requires a JSON path.');
  if (recordPaths.length !== 3) fail('USAGE', 'Exactly three --record paths are required.');
  return { help: false, recordPaths, outputPath };
}

function usage() {
  return [
    'Usage:',
    '  node scripts/create-platform-matrix-record.mjs \\',
    '    --record <macos-evidence-record.json> \\',
    '    --record <windows11-evidence-record.json> \\',
    '    --record <ubuntu-evidence-record.json> \\',
    '    --output <platform-matrix-record.json>',
    '',
    'If --output is omitted, the deterministic validated matrix is written to stdout.',
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
      writePlatformMatrixRecord(parsed.recordPaths, parsed.outputPath);
      console.log(`OK PLATFORM_MATRIX_RECORD_CREATED ${resolve(parsed.outputPath)}`);
    } else {
      process.stdout.write(serializePlatformMatrixRecord(createPlatformMatrixRecord(parsed.recordPaths)));
    }
    return 0;
  } catch (error) {
    const prefix = error instanceof PlatformMatrixValidationError ? `FAIL ${error.code}` : 'FAIL UNEXPECTED';
    console.error(`${prefix} ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = main();
}

export const PLATFORM_MATRIX_SCRIPT_PATH = SCRIPT_PATH;
