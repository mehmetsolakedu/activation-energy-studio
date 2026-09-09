#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PLATFORM_CONTRACT_VERSION =
  process.env.AES_PLATFORM_VALIDATION_VERSION ?? '0.2.0';
if (!['0.2.0', '0.3.2'].includes(PLATFORM_CONTRACT_VERSION)) {
  throw new Error(
    `Unsupported AES_PLATFORM_VALIDATION_VERSION: ${PLATFORM_CONTRACT_VERSION}`,
  );
}
const HOSTED_WORKFLOW_NAME = PLATFORM_CONTRACT_VERSION === '0.3.2'
  ? 'Hosted Platform Validation v0.3.2'
  : 'Hosted Platform Validation';
const HOSTED_WORKFLOW_PATH = PLATFORM_CONTRACT_VERSION === '0.3.2'
  ? '.github/workflows/platform-validation-v032.yml'
  : '.github/workflows/platform-validation.yml';

export const HOSTED_WORKFLOW_PREFLIGHT_SCHEMA =
  'activation-energy-studio/hosted-workflow-preflight/v1';
export const HOSTED_WORKFLOW_PREFLIGHT_NAME =
  'hosted-workflow-preflight.json';
export const HOSTED_WORKFLOW_PREFLIGHT_STATUS =
  'WORKFLOW_STARTED_DIAGNOSTIC_NOT_PLATFORM_EVIDENCE';
export const HOSTED_WORKFLOW_PREFLIGHT_PURPOSE =
  'Retain a diagnostic file when dependency installation or a pre-browser hosted check fails before the browser harness can write evidence.';
export const HOSTED_WORKFLOW_PREFLIGHT_NODE_ARCHITECTURE_SCOPE =
  'BOOTSTRAP_NODE_BEFORE_SETUP_NODE_MAY_DIFFER_FROM_DECLARED_TARGET';

const TARGETS = Object.freeze({
  'ubuntu-24.04': Object.freeze({
    osFamily: 'ubuntu',
    nodeArchitecture: 'x64',
    runnerOs: 'Linux',
    runnerArchitecture: 'X64',
    platform: 'linux',
  }),
  'macos-15': Object.freeze({
    osFamily: 'macos',
    nodeArchitecture: 'arm64',
    runnerOs: 'macOS',
    runnerArchitecture: 'ARM64',
    platform: 'darwin',
  }),
  'windows-11-arm': Object.freeze({
    osFamily: 'windows11',
    nodeArchitecture: 'arm64',
    runnerOs: 'Windows',
    runnerArchitecture: 'ARM64',
    platform: 'win32',
  }),
});

const TOP_LEVEL_KEYS = Object.freeze([
  'schema',
  'releaseVersion',
  'claimStatus',
  'startedAtUtc',
  'declaredTarget',
  'observedEnvironment',
  'runtime',
  'evidenceBoundary',
]);
const OBSERVED_ENVIRONMENT_KEYS = Object.freeze([
  'githubActions',
  'runnerEnvironment',
  'runnerOs',
  'runnerArchitecture',
  'imageOs',
  'imageVersion',
  'repository',
  'workflow',
  'workflowRef',
  'runId',
  'runAttempt',
  'commitSha',
  'gitRef',
  'serverUrl',
]);

function required(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function optionalEnvironment(environment, key) {
  const value = environment[key];
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : null;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(object(value, label)).sort();
  const required = [...expected].sort();
  if (
    actual.length !== required.length
    || actual.some((key, index) => key !== required[index])
  ) {
    throw new Error(`${label} has an invalid field set.`);
  }
}

function nonemptyRecordString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function canonicalUtcTimestamp(value, label) {
  const text = nonemptyRecordString(value, label);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(text)
  ) {
    throw new Error(`${label} must be a canonical ISO-8601 UTC timestamp.`);
  }
  const epoch = Date.parse(text);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== text) {
    throw new Error(`${label} must be a real canonical UTC calendar time.`);
  }
  return text;
}

export function createHostedWorkflowPreflight({
  osFamily,
  runnerLabel,
  nodeArchitecture,
  environment = process.env,
  runtime = process,
  now = new Date(),
}) {
  const normalizedRunnerLabel = required(runnerLabel, 'runnerLabel');
  const normalizedOsFamily = required(osFamily, 'osFamily');
  const normalizedNodeArchitecture = required(
    nodeArchitecture,
    'nodeArchitecture',
  );
  const expected = TARGETS[normalizedRunnerLabel];
  if (
    !expected
    || expected.osFamily !== normalizedOsFamily
    || expected.nodeArchitecture !== normalizedNodeArchitecture
  ) {
    throw new Error(
      `Unsupported hosted target mapping: ${normalizedRunnerLabel}/${normalizedOsFamily}/${normalizedNodeArchitecture}.`,
    );
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('now must be a valid Date.');
  }

  return Object.freeze({
    schema: HOSTED_WORKFLOW_PREFLIGHT_SCHEMA,
    releaseVersion: PLATFORM_CONTRACT_VERSION,
    claimStatus: HOSTED_WORKFLOW_PREFLIGHT_STATUS,
    startedAtUtc: now.toISOString(),
    declaredTarget: Object.freeze({
      runnerLabel: normalizedRunnerLabel,
      osFamily: normalizedOsFamily,
      nodeArchitecture: normalizedNodeArchitecture,
    }),
    observedEnvironment: Object.freeze({
      githubActions: optionalEnvironment(environment, 'GITHUB_ACTIONS'),
      runnerEnvironment: optionalEnvironment(
        environment,
        'RUNNER_ENVIRONMENT',
      ),
      runnerOs: optionalEnvironment(environment, 'RUNNER_OS'),
      runnerArchitecture: optionalEnvironment(environment, 'RUNNER_ARCH'),
      imageOs: optionalEnvironment(environment, 'ImageOS'),
      imageVersion: optionalEnvironment(environment, 'ImageVersion'),
      repository: optionalEnvironment(environment, 'GITHUB_REPOSITORY'),
      workflow: optionalEnvironment(environment, 'GITHUB_WORKFLOW'),
      workflowRef: optionalEnvironment(environment, 'GITHUB_WORKFLOW_REF'),
      runId: optionalEnvironment(environment, 'GITHUB_RUN_ID'),
      runAttempt: optionalEnvironment(environment, 'GITHUB_RUN_ATTEMPT'),
      commitSha: optionalEnvironment(environment, 'GITHUB_SHA'),
      gitRef: optionalEnvironment(environment, 'GITHUB_REF'),
      serverUrl: optionalEnvironment(environment, 'GITHUB_SERVER_URL'),
    }),
    runtime: Object.freeze({
      nodeVersion: runtime.version,
      nodeArchitecture: runtime.arch,
      nodeArchitectureScope:
        HOSTED_WORKFLOW_PREFLIGHT_NODE_ARCHITECTURE_SCOPE,
      platform: runtime.platform,
    }),
    evidenceBoundary: Object.freeze({
      platformEvidence: false,
      softwareAuthenticatedRunnerIdentity: false,
      acceptanceGatesAutomaticallyApplied: false,
      humanReviewRequired: true,
      purpose: HOSTED_WORKFLOW_PREFLIGHT_PURPOSE,
    }),
  });
}

export function validateHostedWorkflowPreflight(
  record,
  { osFamily, runnerLabel, nodeArchitecture } = {},
) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('Hosted workflow preflight must be a JSON object.');
  }
  exactKeys(record, TOP_LEVEL_KEYS, 'Hosted workflow preflight');
  if (record.schema !== HOSTED_WORKFLOW_PREFLIGHT_SCHEMA) {
    throw new Error('Hosted workflow preflight schema is invalid.');
  }
  if (record.releaseVersion !== PLATFORM_CONTRACT_VERSION) {
    throw new Error('Hosted workflow preflight release version is invalid.');
  }
  if (record.claimStatus !== HOSTED_WORKFLOW_PREFLIGHT_STATUS) {
    throw new Error('Hosted workflow preflight claim status is invalid.');
  }
  const boundary = object(
    record.evidenceBoundary,
    'Hosted workflow preflight evidence boundary',
  );
  exactKeys(
    boundary,
    [
      'platformEvidence',
      'softwareAuthenticatedRunnerIdentity',
      'acceptanceGatesAutomaticallyApplied',
      'humanReviewRequired',
      'purpose',
    ],
    'Hosted workflow preflight evidence boundary',
  );
  if (
    boundary.platformEvidence !== false
    || boundary.softwareAuthenticatedRunnerIdentity !== false
    || boundary.acceptanceGatesAutomaticallyApplied !== false
    || boundary.humanReviewRequired !== true
    || boundary.purpose !== HOSTED_WORKFLOW_PREFLIGHT_PURPOSE
  ) {
    throw new Error('Hosted workflow preflight evidence boundary is invalid.');
  }
  try {
    canonicalUtcTimestamp(
      record.startedAtUtc,
      'Hosted workflow preflight timestamp',
    );
  } catch {
    throw new Error('Hosted workflow preflight timestamp is invalid.');
  }
  const declared = object(
    record.declaredTarget,
    'Hosted workflow preflight declared target',
  );
  exactKeys(
    declared,
    ['runnerLabel', 'osFamily', 'nodeArchitecture'],
    'Hosted workflow preflight declared target',
  );
  const expectedTarget = TARGETS[declared.runnerLabel];
  if (
    !expectedTarget
    || declared.osFamily !== expectedTarget.osFamily
    || declared.nodeArchitecture !== expectedTarget.nodeArchitecture
    || (osFamily !== undefined && declared.osFamily !== osFamily)
    || (runnerLabel !== undefined && declared.runnerLabel !== runnerLabel)
    || (
      nodeArchitecture !== undefined
      && declared.nodeArchitecture !== nodeArchitecture
    )
  ) {
    throw new Error('Hosted workflow preflight target does not match the run.');
  }

  const observed = object(
    record.observedEnvironment,
    'Hosted workflow preflight observed environment',
  );
  exactKeys(
    observed,
    OBSERVED_ENVIRONMENT_KEYS,
    'Hosted workflow preflight observed environment',
  );
  if (
    observed.githubActions !== 'true'
    || observed.runnerEnvironment !== 'github-hosted'
    || observed.runnerOs !== expectedTarget.runnerOs
    || observed.runnerArchitecture !== expectedTarget.runnerArchitecture
  ) {
    throw new Error('Hosted workflow preflight runner environment is invalid.');
  }
  const repository = nonemptyRecordString(
    observed.repository,
    'Hosted workflow preflight repository',
  );
  if (!/^[^/\s]+\/[^/\s]+$/u.test(repository)) {
    throw new Error('Hosted workflow preflight repository must use owner/name.');
  }
  if (observed.workflow !== HOSTED_WORKFLOW_NAME) {
    throw new Error('Hosted workflow preflight workflow name is invalid.');
  }
  const workflowRef = nonemptyRecordString(
    observed.workflowRef,
    'Hosted workflow preflight workflow ref',
  );
  const workflowRefPrefix = `${repository}/${HOSTED_WORKFLOW_PATH}@`;
  if (
    !workflowRef.startsWith(workflowRefPrefix)
    || workflowRef.length === workflowRefPrefix.length
    || /\s/u.test(workflowRef)
  ) {
    throw new Error('Hosted workflow preflight workflow ref is invalid.');
  }
  for (const [key, label] of [
    ['runId', 'run ID'],
    ['runAttempt', 'run attempt'],
  ]) {
    if (!/^[1-9]\d*$/u.test(nonemptyRecordString(observed[key], label))) {
      throw new Error(`Hosted workflow preflight ${label} is invalid.`);
    }
  }
  if (
    !/^[a-f0-9]{40}$/u.test(
      nonemptyRecordString(
        observed.commitSha,
        'Hosted workflow preflight commit SHA',
      ),
    )
  ) {
    throw new Error('Hosted workflow preflight commit SHA is invalid.');
  }
  const gitRef = nonemptyRecordString(
    observed.gitRef,
    'Hosted workflow preflight git ref',
  );
  if (workflowRef.slice(workflowRefPrefix.length) !== gitRef) {
    throw new Error('Hosted workflow preflight workflow ref and git ref differ.');
  }
  if (observed.serverUrl !== 'https://github.com') {
    throw new Error('Hosted workflow preflight server URL is invalid.');
  }
  nonemptyRecordString(observed.imageOs, 'Hosted workflow preflight image OS');
  nonemptyRecordString(
    observed.imageVersion,
    'Hosted workflow preflight image version',
  );

  const runtime = object(record.runtime, 'Hosted workflow preflight runtime');
  exactKeys(
    runtime,
    [
      'nodeVersion',
      'nodeArchitecture',
      'nodeArchitectureScope',
      'platform',
    ],
    'Hosted workflow preflight runtime',
  );
  if (
    !/^v\d+\.\d+\.\d+$/u.test(
      nonemptyRecordString(
        runtime.nodeVersion,
        'Hosted workflow preflight Node version',
      ),
    )
    || !['arm64', 'x64'].includes(runtime.nodeArchitecture)
    || runtime.nodeArchitectureScope
      !== HOSTED_WORKFLOW_PREFLIGHT_NODE_ARCHITECTURE_SCOPE
    || runtime.platform !== expectedTarget.platform
  ) {
    throw new Error('Hosted workflow preflight runtime is invalid.');
  }
  return record;
}

export function writeHostedWorkflowPreflight({
  outputDirectory,
  ...options
}) {
  const resolvedOutput = path.resolve(
    required(outputDirectory, 'outputDirectory'),
  );
  mkdirSync(resolvedOutput, { recursive: true });
  const outputPath = path.resolve(
    resolvedOutput,
    HOSTED_WORKFLOW_PREFLIGHT_NAME,
  );
  let existing = null;
  try {
    existing = readFileSync(outputPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (existing !== null) {
    throw new Error(`Refusing to overwrite hosted preflight: ${outputPath}`);
  }
  const record = createHostedWorkflowPreflight(options);
  validateHostedWorkflowPreflight(record, {
    osFamily: options.osFamily,
    runnerLabel: options.runnerLabel,
    nodeArchitecture: options.nodeArchitecture,
  });
  writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, {
    flag: 'wx',
  });
  return Object.freeze({ outputPath, record });
}

function parseArguments(argumentsList) {
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Expected --key value argument pairs.');
    }
    if (values.has(key)) throw new Error(`Duplicate argument: ${key}`);
    values.set(key, value);
  }
  const allowed = new Set([
    '--os',
    '--runner-label',
    '--node-arch',
    '--output',
  ]);
  for (const key of values.keys()) {
    if (!allowed.has(key)) throw new Error(`Unknown argument: ${key}`);
  }
  return {
    osFamily: required(values.get('--os'), '--os'),
    runnerLabel: required(values.get('--runner-label'), '--runner-label'),
    nodeArchitecture: required(values.get('--node-arch'), '--node-arch'),
    outputDirectory: required(values.get('--output'), '--output'),
  };
}

function isMain() {
  return (
    process.argv[1]
    && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  );
}

if (isMain()) {
  try {
    const { outputPath } = writeHostedWorkflowPreflight(
      parseArguments(process.argv.slice(2)),
    );
    process.stdout.write(
      `TECHNICAL_OK ${HOSTED_WORKFLOW_PREFLIGHT_STATUS} ${outputPath}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `FAIL HOSTED_WORKFLOW_PREFLIGHT ${error?.message ?? String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
