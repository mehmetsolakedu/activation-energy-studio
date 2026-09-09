#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RELEASE_VERIFICATION_SCHEMA =
  'activation-energy-studio/release-verification-record/v1';
export const RELEASE_VERIFICATION_SIDECAR_SCHEMA =
  'activation-energy-studio/release-verification-sidecar/v1';
export const AUTHORITATIVE_RELEASE_CHECK_COMMAND = 'npm run check';
export const RELEASE_VERIFICATION_PASS =
  'TECHNICAL_RELEASE_CHECK_PASS_EXTERNAL_GATES_UNCHANGED';
export const RELEASE_VERIFICATION_FAIL =
  'TECHNICAL_RELEASE_CHECK_FAIL_EXTERNAL_GATES_UNCHANGED';

const DEFAULT_PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const PLACEHOLDER_PATTERN = /\b(?:TODO|TBD|FIXME|CHANGEME|PLACEHOLDER)\b|<[^>]+>/iu;
const INPUT_PATHS = Object.freeze([
  'package.json',
  'release/Activation-Energy-Studio-v0.2.0.html',
  'release/MANIFEST.v0.2.0.json',
]);
const CLAIM_BOUNDARY = Object.freeze({
  technicalCheckOnly: true,
  independentScientificReviewComplete: false,
  hostedThreeOsValidationComplete: false,
  humanUsabilityValidationComplete: false,
  statement:
    'A successful npm run check is technical evidence only. It does not close independent-review, hosted-platform, or observed-human gates.',
});

export class ReleaseVerificationError extends Error {
  constructor(code, message) {
    super(`${code} ${message}`);
    this.name = 'ReleaseVerificationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ReleaseVerificationError(code, message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('RELEASE_RECORD_INVALID_OBJECT', `${label} must be an object.`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(object(value, label)).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(
      'RELEASE_RECORD_UNEXPECTED_FIELDS',
      `${label} keys differ: expected ${wanted.join(', ')}, found ${actual.join(', ')}.`,
    );
  }
}

function nonPlaceholderString(value, label) {
  if (
    typeof value !== 'string'
    || value.trim() !== value
    || value.length === 0
    || PLACEHOLDER_PATTERN.test(value)
  ) {
    fail(
      'RELEASE_RECORD_PLACEHOLDER',
      `${label} must be a non-placeholder string.`,
    );
  }
  return value;
}

function utc(value, label) {
  const text = nonPlaceholderString(value, label);
  if (!UTC_PATTERN.test(text) || !Number.isFinite(Date.parse(text))) {
    fail('RELEASE_RECORD_INVALID_TIME', `${label} must be an ISO UTC timestamp.`);
  }
  return text;
}

function regularFile(filePath, label) {
  if (!existsSync(filePath)) {
    fail('RELEASE_RECORD_FILE_MISSING', `${label} is missing: ${filePath}.`);
  }
  if (lstatSync(filePath).isSymbolicLink()) {
    fail('RELEASE_RECORD_SYMLINK', `${label} must not be a symbolic link.`);
  }
  if (!statSync(filePath).isFile()) {
    fail('RELEASE_RECORD_NOT_FILE', `${label} must be a regular file.`);
  }
  return readFileSync(filePath);
}

function containedProjectFile(projectRoot, relativePath, label) {
  if (
    typeof relativePath !== 'string'
    || relativePath.includes('\\')
    || path.posix.isAbsolute(relativePath)
    || relativePath.split('/').some((part) => ['', '.', '..'].includes(part))
  ) {
    fail('RELEASE_RECORD_PATH_TRAVERSAL', `${label} is not a portable relative path.`);
  }
  const canonicalRoot = realpathSync(path.resolve(projectRoot));
  const absolute = path.resolve(canonicalRoot, ...relativePath.split('/'));
  const relative = path.relative(canonicalRoot, absolute);
  if (
    relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    fail('RELEASE_RECORD_PATH_TRAVERSAL', `${label} escapes the project root.`);
  }
  const bytes = regularFile(absolute, label);
  if (realpathSync(absolute) !== absolute) {
    fail('RELEASE_RECORD_SYMLINK', `${label} resolves through a symbolic link.`);
  }
  return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
}

function validateProjectRelease(projectRoot) {
  const inputs = INPUT_PATHS.map((relativePath) =>
    containedProjectFile(projectRoot, relativePath, relativePath));
  const packageJson = JSON.parse(
    readFileSync(path.resolve(projectRoot, 'package.json'), 'utf8'),
  );
  if (packageJson.scripts?.check !== undefined
      && typeof packageJson.scripts.check !== 'string') {
    fail('RELEASE_RECORD_CHECK_SCRIPT_INVALID', 'package.json scripts.check must be a string.');
  }
  if (!packageJson.scripts?.check) {
    fail('RELEASE_RECORD_CHECK_SCRIPT_MISSING', 'package.json has no scripts.check.');
  }
  const manifest = JSON.parse(
    readFileSync(
      path.resolve(projectRoot, 'release/MANIFEST.v0.2.0.json'),
      'utf8',
    ),
  );
  const release = inputs.find((item) =>
    item.path.endsWith('Activation-Energy-Studio-v0.2.0.html'));
  if (
    manifest.release?.artifact !== release.path
    || manifest.release?.bytes !== release.bytes
    || manifest.release?.sha256 !== release.sha256
  ) {
    fail(
      'RELEASE_RECORD_MANIFEST_RELEASE_MISMATCH',
      'Release manifest does not bind the current release HTML.',
    );
  }
  return {
    inputs,
    checkScriptSha256: sha256(Buffer.from(packageJson.scripts.check, 'utf8')),
  };
}

function defaultRunner({ executable, args, cwd }) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    shell: false,
  });
  if (result.error) {
    return {
      status: null,
      signal: null,
      stdout: result.stdout ?? '',
      stderr: `${result.stderr ?? ''}${result.error.message}\n`,
    };
  }
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function serializeLog({ startedAt, finishedAt, executable, result }) {
  return [
    'AES_RELEASE_VERIFICATION_LOG_V1',
    `COMMAND ${AUTHORITATIVE_RELEASE_CHECK_COMMAND}`,
    `EXECUTABLE ${executable}`,
    'ARGS ["run","check"]',
    'SHELL false',
    `STARTED_AT ${startedAt}`,
    `FINISHED_AT ${finishedAt}`,
    `EXIT_CODE ${result.status === null ? 'null' : result.status}`,
    `SIGNAL ${result.signal ?? 'null'}`,
    '[STDOUT]',
    result.stdout,
    '[STDERR]',
    result.stderr,
    '[END]',
    '',
  ].join('\n');
}

export function serializeReleaseVerificationRecord(record) {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function serializeReleaseVerificationSidecar(sidecar) {
  return `${JSON.stringify(sidecar, null, 2)}\n`;
}

export function recordReleaseVerificationRun({
  projectRoot = DEFAULT_PROJECT_ROOT,
  outputDirectory,
  runId,
  runner = defaultRunner,
  now = () => new Date(),
} = {}) {
  const resolvedRoot = realpathSync(path.resolve(projectRoot));
  const id = nonPlaceholderString(runId, 'runId');
  if (!RUN_ID_PATTERN.test(id)) {
    fail('RELEASE_RECORD_INVALID_RUN_ID', 'runId has an invalid format.');
  }
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
    fail('RELEASE_RECORD_OUTPUT_REQUIRED', 'outputDirectory is required.');
  }
  const output = path.resolve(outputDirectory);
  mkdirSync(output, { recursive: true });
  if (lstatSync(output).isSymbolicLink() || !statSync(output).isDirectory()) {
    fail('RELEASE_RECORD_OUTPUT_INVALID', 'outputDirectory must be a real directory.');
  }

  const project = validateProjectRelease(resolvedRoot);
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const startedAt = now().toISOString();
  const result = runner({
    executable,
    args: ['run', 'check'],
    cwd: resolvedRoot,
    shell: false,
  });
  const finishedAt = now().toISOString();
  const startMs = Date.parse(startedAt);
  const finishMs = Date.parse(finishedAt);
  if (finishMs < startMs) {
    fail('RELEASE_RECORD_INVALID_TIME', 'finishedAt precedes startedAt.');
  }
  const normalizedResult = {
    status: Number.isInteger(result?.status) ? result.status : null,
    signal: result?.signal === null || result?.signal === undefined
      ? null
      : String(result.signal),
    stdout: String(result?.stdout ?? ''),
    stderr: String(result?.stderr ?? ''),
  };
  const logBytes = Buffer.from(
    serializeLog({
      startedAt,
      finishedAt,
      executable,
      result: normalizedResult,
    }),
    'utf8',
  );
  const logName = `${id}.release-check.log`;
  const summaryName = `${id}.release-check.json`;
  const sidecarName = `${id}.release-check.sidecar.json`;
  const logPath = path.join(output, logName);
  const summaryPath = path.join(output, summaryName);
  const sidecarPath = path.join(output, sidecarName);
  writeFileSync(logPath, logBytes);

  const passed = normalizedResult.status === 0 && normalizedResult.signal === null;
  const summary = {
    schemaVersion: RELEASE_VERIFICATION_SCHEMA,
    runId: id,
    recordStatus: passed ? RELEASE_VERIFICATION_PASS : RELEASE_VERIFICATION_FAIL,
    command: {
      display: AUTHORITATIVE_RELEASE_CHECK_COMMAND,
      executable,
      args: ['run', 'check'],
      shell: false,
    },
    timeWindow: {
      startedAt,
      finishedAt,
      durationMs: finishMs - startMs,
    },
    execution: {
      exitCode: normalizedResult.status,
      signal: normalizedResult.signal,
      stdoutBytes: Buffer.byteLength(normalizedResult.stdout),
      stderrBytes: Buffer.byteLength(normalizedResult.stderr),
    },
    projectBindings: {
      checkScriptSha256: project.checkScriptSha256,
      files: project.inputs,
    },
    log: {
      path: logName,
      bytes: logBytes.length,
      sha256: sha256(logBytes),
    },
    claimBoundary: { ...CLAIM_BOUNDARY },
  };
  const summaryBytes = Buffer.from(serializeReleaseVerificationRecord(summary));
  writeFileSync(summaryPath, summaryBytes);
  const sidecar = {
    schemaVersion: RELEASE_VERIFICATION_SIDECAR_SCHEMA,
    summary: {
      path: summaryName,
      bytes: summaryBytes.length,
      sha256: sha256(summaryBytes),
    },
    log: {
      path: logName,
      bytes: logBytes.length,
      sha256: sha256(logBytes),
    },
  };
  writeFileSync(
    sidecarPath,
    serializeReleaseVerificationSidecar(sidecar),
    'utf8',
  );
  return { summary, sidecar, summaryPath, sidecarPath, logPath };
}

function validateHashEntry(entry, expectedPath, bytes, label) {
  exactKeys(entry, ['path', 'bytes', 'sha256'], label);
  if (
    entry.path !== expectedPath
    || entry.bytes !== bytes.length
    || typeof entry.sha256 !== 'string'
    || !SHA256_PATTERN.test(entry.sha256)
    || entry.sha256 !== sha256(bytes)
  ) {
    fail('RELEASE_RECORD_HASH_MISMATCH', `${label} does not bind current bytes.`);
  }
}

function validateLogEnvelope(logBytes, summary) {
  const text = logBytes.toString('utf8');
  const stdoutMarker = '\n[STDOUT]\n';
  const stderrMarker = '\n[STDERR]\n';
  const endMarker = '\n[END]\n';
  const stdoutIndex = text.indexOf(stdoutMarker);
  const stderrIndex = text.lastIndexOf(stderrMarker);
  const endIndex = text.lastIndexOf(endMarker);
  if (
    stdoutIndex < 0
    || stderrIndex <= stdoutIndex
    || endIndex <= stderrIndex
    || endIndex + endMarker.length !== text.length
  ) {
    fail('RELEASE_RECORD_LOG_INVALID', 'Log envelope markers are missing or ambiguous.');
  }
  const header = text.slice(0, stdoutIndex).split('\n');
  const expectedHeader = [
    'AES_RELEASE_VERIFICATION_LOG_V1',
    `COMMAND ${AUTHORITATIVE_RELEASE_CHECK_COMMAND}`,
    `EXECUTABLE ${summary.command.executable}`,
    'ARGS ["run","check"]',
    'SHELL false',
    `STARTED_AT ${summary.timeWindow.startedAt}`,
    `FINISHED_AT ${summary.timeWindow.finishedAt}`,
    `EXIT_CODE ${summary.execution.exitCode === null ? 'null' : summary.execution.exitCode}`,
    `SIGNAL ${summary.execution.signal ?? 'null'}`,
  ];
  if (JSON.stringify(header) !== JSON.stringify(expectedHeader)) {
    fail('RELEASE_RECORD_LOG_INVALID', 'Log header contradicts the summary.');
  }
  const stdout = text.slice(
    stdoutIndex + stdoutMarker.length,
    stderrIndex,
  );
  const stderr = text.slice(
    stderrIndex + stderrMarker.length,
    endIndex,
  );
  if (
    Buffer.byteLength(stdout) !== summary.execution.stdoutBytes
    || Buffer.byteLength(stderr) !== summary.execution.stderrBytes
  ) {
    fail('RELEASE_RECORD_LOG_INVALID', 'Log stream byte counts contradict the summary.');
  }
}

export function verifyReleaseVerificationRecord({
  projectRoot = DEFAULT_PROJECT_ROOT,
  summaryPath,
  sidecarPath,
} = {}) {
  const resolvedRoot = realpathSync(path.resolve(projectRoot));
  const summaryAbsolute = path.resolve(summaryPath ?? '');
  const sidecarAbsolute = path.resolve(sidecarPath ?? '');
  if (path.dirname(summaryAbsolute) !== path.dirname(sidecarAbsolute)) {
    fail('RELEASE_RECORD_PATH_TRAVERSAL', 'Summary and sidecar must be adjacent.');
  }
  const summaryBytes = regularFile(summaryAbsolute, 'summary');
  const sidecarBytes = regularFile(sidecarAbsolute, 'sidecar');
  let summary;
  let sidecar;
  try {
    summary = JSON.parse(summaryBytes.toString('utf8'));
    sidecar = JSON.parse(sidecarBytes.toString('utf8'));
  } catch (error) {
    fail('RELEASE_RECORD_JSON_INVALID', String(error));
  }
  exactKeys(sidecar, ['schemaVersion', 'summary', 'log'], 'sidecar');
  if (sidecar.schemaVersion !== RELEASE_VERIFICATION_SIDECAR_SCHEMA) {
    fail('RELEASE_RECORD_SCHEMA_MISMATCH', 'Sidecar schema is not supported.');
  }
  validateHashEntry(
    sidecar.summary,
    path.basename(summaryAbsolute),
    summaryBytes,
    'sidecar.summary',
  );
  const logName = nonPlaceholderString(sidecar.log?.path, 'sidecar.log.path');
  if (path.basename(logName) !== logName) {
    fail('RELEASE_RECORD_PATH_TRAVERSAL', 'Log path must be a basename.');
  }
  const logPath = path.join(path.dirname(sidecarAbsolute), logName);
  const logBytes = regularFile(logPath, 'log');
  validateHashEntry(sidecar.log, logName, logBytes, 'sidecar.log');

  exactKeys(summary, [
    'schemaVersion',
    'runId',
    'recordStatus',
    'command',
    'timeWindow',
    'execution',
    'projectBindings',
    'log',
    'claimBoundary',
  ], 'summary');
  if (summary.schemaVersion !== RELEASE_VERIFICATION_SCHEMA) {
    fail('RELEASE_RECORD_SCHEMA_MISMATCH', 'Summary schema is not supported.');
  }
  if (!RUN_ID_PATTERN.test(nonPlaceholderString(summary.runId, 'summary.runId'))) {
    fail('RELEASE_RECORD_INVALID_RUN_ID', 'Summary runId is invalid.');
  }
  exactKeys(summary.command, ['display', 'executable', 'args', 'shell'], 'summary.command');
  const expectedExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  if (
    summary.command.display !== AUTHORITATIVE_RELEASE_CHECK_COMMAND
    || summary.command.executable !== expectedExecutable
    || JSON.stringify(summary.command.args) !== '["run","check"]'
    || summary.command.shell !== false
  ) {
    fail('RELEASE_RECORD_COMMAND_MISMATCH', 'Recorded command is not exact npm run check.');
  }
  exactKeys(summary.timeWindow, ['startedAt', 'finishedAt', 'durationMs'], 'summary.timeWindow');
  const startedAt = utc(summary.timeWindow.startedAt, 'startedAt');
  const finishedAt = utc(summary.timeWindow.finishedAt, 'finishedAt');
  if (
    summary.timeWindow.durationMs !== Date.parse(finishedAt) - Date.parse(startedAt)
    || summary.timeWindow.durationMs < 0
  ) {
    fail('RELEASE_RECORD_INVALID_TIME', 'durationMs does not match the time window.');
  }
  exactKeys(summary.execution, [
    'exitCode',
    'signal',
    'stdoutBytes',
    'stderrBytes',
  ], 'summary.execution');
  const passed = summary.execution.exitCode === 0 && summary.execution.signal === null;
  const expectedStatus = passed ? RELEASE_VERIFICATION_PASS : RELEASE_VERIFICATION_FAIL;
  if (summary.recordStatus !== expectedStatus) {
    fail('RELEASE_RECORD_STATUS_INFLATION', 'recordStatus contradicts exitCode/signal.');
  }
  exactKeys(summary.claimBoundary, Object.keys(CLAIM_BOUNDARY), 'summary.claimBoundary');
  if (JSON.stringify(summary.claimBoundary) !== JSON.stringify(CLAIM_BOUNDARY)) {
    fail('RELEASE_RECORD_BOUNDARY_INFLATION', 'External gate boundary was altered.');
  }
  validateHashEntry(summary.log, logName, logBytes, 'summary.log');
  validateLogEnvelope(logBytes, summary);
  exactKeys(
    summary.projectBindings,
    ['checkScriptSha256', 'files'],
    'summary.projectBindings',
  );
  const current = validateProjectRelease(resolvedRoot);
  if (
    summary.projectBindings.checkScriptSha256 !== current.checkScriptSha256
    || JSON.stringify(summary.projectBindings.files) !== JSON.stringify(current.inputs)
  ) {
    fail('RELEASE_RECORD_STALE_BINDING', 'Project files or npm check script changed.');
  }
  return { summary, sidecar, logPath };
}

function usage() {
  return [
    'Usage:',
    '  node scripts/record-release-verification.mjs --execute --output-dir DIR --run-id ID [--project-root DIR]',
    '  node scripts/record-release-verification.mjs --verify --summary FILE --sidecar FILE [--project-root DIR]',
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = { projectRoot: DEFAULT_PROJECT_ROOT };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--execute') parsed.mode = 'execute';
    else if (argument === '--verify') parsed.mode = 'verify';
    else if (argument === '--help') parsed.help = true;
    else if (['--project-root', '--output-dir', '--run-id', '--summary', '--sidecar'].includes(argument)) {
      const value = argv[index + 1];
      if (!value) fail('RELEASE_RECORD_USAGE', `${argument} requires a value.`);
      index += 1;
      if (argument === '--project-root') parsed.projectRoot = value;
      if (argument === '--output-dir') parsed.outputDirectory = value;
      if (argument === '--run-id') parsed.runId = value;
      if (argument === '--summary') parsed.summaryPath = value;
      if (argument === '--sidecar') parsed.sidecarPath = value;
    } else fail('RELEASE_RECORD_USAGE', `Unknown argument: ${argument}.`);
  }
  return parsed;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(usage());
    return;
  }
  if (parsed.mode === 'execute') {
    const result = recordReleaseVerificationRun(parsed);
    console.log(`${result.summary.recordStatus} ${result.summaryPath}`);
    if (result.summary.recordStatus !== RELEASE_VERIFICATION_PASS) process.exitCode = 1;
    return;
  }
  if (parsed.mode === 'verify') {
    const result = verifyReleaseVerificationRecord(parsed);
    console.log(`PASS RELEASE_VERIFICATION_RECORD_CURRENT ${result.summary.recordStatus}`);
    return;
  }
  fail('RELEASE_RECORD_USAGE', usage());
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
