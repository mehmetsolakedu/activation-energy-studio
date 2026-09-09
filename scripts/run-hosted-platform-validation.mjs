#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  constants as fsConstants,
  existsSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import puppeteer from 'puppeteer-core';

import {
  EXTERNAL_PROTOCOLS_BLOCKED,
  EXTERNAL_URL_BLOCK_PATTERNS,
  HOSTED_RUNNER_MATRIX,
  REQUIRED_DOM_CONTRACT_SELECTORS,
  HostedPlatformValidationError,
  assertHostedRunnerIdentity,
  assertOfflineHar,
  cdpEventsToHar,
  createDraftPlatformManifest,
  validateActionTimeline,
  validateExpectedArtifactSet,
  validateExpectedDownloadSet,
  validateTargetLedger,
} from './platform-hosted-ci.mjs';
import {
  HOSTED_WORKFLOW_PREFLIGHT_NAME,
  validateHostedWorkflowPreflight,
} from './write-hosted-workflow-preflight.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const HOSTED_CONTRACT_SOURCE = path.resolve(
  path.dirname(SCRIPT_PATH),
  'platform-hosted-ci.mjs',
);
const LOCAL_MACOS_CLI_SOURCE = path.resolve(
  path.dirname(SCRIPT_PATH),
  'run-local-macos-platform-diagnostic.mjs',
);
const RELEASE_NAME = 'Activation-Energy-Studio-v0.2.0.html';
const GOLDEN_NAME = 'Platform-Golden-synthetic_kas_150.csv';
const RELEASE_SOURCE = path.resolve(PROJECT_ROOT, 'release', RELEASE_NAME);
const GOLDEN_SOURCE = path.resolve(PROJECT_ROOT, 'release', GOLDEN_NAME);
const CHECKSUM_SOURCE = path.resolve(PROJECT_ROOT, 'release', 'SHA256SUMS.txt');
const SELF_TEST_DOWNLOAD_NAME =
  'activation-energy-platform-self-test-v0.2.0-pass.json';
const REPORT_DOWNLOAD_NAMES = Object.freeze({
  reportJson: 'platform-golden.json',
  reportCsv: 'platform-golden-results.csv',
  reportPdf: 'platform-golden-report.pdf',
});
export const LOCAL_MACOS_DIAGNOSTIC_MANIFEST_NAME =
  'LOCAL_MACOS_DIAGNOSTIC_MANIFEST.json';
const REQUIRED_METHODS = Object.freeze(['FWO', 'KAS', 'STARINK', 'FRIEDMAN']);
const EXPECTED_ALPHA_GRID = Object.freeze(
  Array.from({ length: 9 }, (_, index) => Number(((index + 1) / 10).toFixed(1))),
);
const CLAIM_STATUS = 'AUTOMATED_RUN_EVIDENCE_AWAITING_HUMAN_REVIEW';
const FAILURE_STATUS = 'AUTOMATED_RUN_FAILED_NOT_EVIDENCE';
export const LOCAL_MACOS_DIAGNOSTIC_STATUS =
  'LOCAL_AUTOMATED_DIAGNOSTIC_NOT_PLATFORM_EVIDENCE';
export const LOCAL_MACOS_DIAGNOSTIC_FAILURE_STATUS =
  'LOCAL_AUTOMATED_DIAGNOSTIC_FAILED_NOT_EVIDENCE';
export const HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR = 150;
export const HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR_ENVIRONMENT =
  'AES_EXPECTED_GOOGLE_CHROME_MAJOR';
const DEFAULT_TIMEOUT_MS = 45_000;
const HOSTED_EXECUTION_PROFILE = Object.freeze({
  kind: 'hosted',
  claimStatus: CLAIM_STATUS,
  failureStatus: FAILURE_STATUS,
  harCreatorName: 'Activation Energy Studio hosted CDP harness',
  metadataSchema: 'activation-energy-studio/hosted-platform-run/v1',
  metadataFileName: 'hosted-run-metadata.json',
  createDraftManifest: true,
  nextRequiredAction:
    'A real human reviewer must inspect the retained evidence, replace the observer placeholder, set confirmations only after review, and then run the existing recorder.',
});
const LOCAL_MACOS_EXECUTION_PROFILE = Object.freeze({
  kind: 'local-macos-diagnostic',
  claimStatus: LOCAL_MACOS_DIAGNOSTIC_STATUS,
  failureStatus: LOCAL_MACOS_DIAGNOSTIC_FAILURE_STATUS,
  harCreatorName: 'Activation Energy Studio local macOS diagnostic CDP harness',
  metadataSchema:
    'activation-energy-studio/local-macos-browser-diagnostic/v1',
  metadataFileName: 'local-macos-diagnostic.json',
  createDraftManifest: false,
  nextRequiredAction:
    'This automated local diagnostic cannot close AC-PLAT-01 or AC-PLAT-02. Retain it as technical evidence only; complete separately observed macOS, Windows 11, and Ubuntu runs under the platform protocol.',
});
export const HOSTED_ACTION_COMMITS = Object.freeze({
  checkout: Object.freeze({
    environment: 'AES_ACTION_CHECKOUT_SHA',
    sha: 'd23441a48e516b6c34aea4fa41551a30e30af803',
  }),
  setupNode: Object.freeze({
    environment: 'AES_ACTION_SETUP_NODE_SHA',
    sha: '249970729cb0ef3589644e2896645e5dc5ba9c38',
  }),
  uploadArtifact: Object.freeze({
    environment: 'AES_ACTION_UPLOAD_ARTIFACT_SHA',
    sha: 'b7c566a772e6b6bfb58ed0dc250532a479d7789f',
  }),
});

function fail(code, message, details = undefined) {
  throw new HostedPlatformValidationError(code, message, details);
}

function usage() {
  return [
    'Usage:',
    '  node scripts/run-hosted-platform-validation.mjs',
    '    --os macos|windows11|ubuntu',
    '    --runner-label macos-15|windows-11-arm|ubuntu-24.04',
    '    --node-arch arm64|x64',
    '    --output <empty-output-directory>',
    '    [--browser-executable <absolute-system-Chrome-path>]',
    '',
    'This command is intentionally restricted to GitHub-hosted Actions runners.',
  ].join('\n');
}

function parseArguments(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${usage()}\n`);
    return null;
  }

  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) fail('ARGUMENT_INVALID', `Unexpected argument: ${token}.`);
    if (![
      '--os',
      '--runner-label',
      '--node-arch',
      '--output',
      '--browser-executable',
    ].includes(token)) {
      fail('ARGUMENT_INVALID', `Unknown argument: ${token}.`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      fail('ARGUMENT_INVALID', `${token} requires a value.`);
    }
    if (values.has(token)) fail('ARGUMENT_INVALID', `${token} was provided more than once.`);
    values.set(token, value);
    index += 1;
  }

  for (const required of ['--os', '--runner-label', '--node-arch', '--output']) {
    if (!values.has(required)) fail('ARGUMENT_REQUIRED', `${required} is required.`);
  }

  const family = values.get('--os');
  if (!['macos', 'windows11', 'ubuntu'].includes(family)) {
    fail('ARGUMENT_INVALID', '--os must be macos, windows11, or ubuntu.');
  }
  const runnerLabel = values.get('--runner-label');
  const expected = HOSTED_RUNNER_MATRIX[runnerLabel];
  if (!expected || expected.family !== family) {
    fail(
      'RUNNER_FAMILY_MISMATCH',
      `${runnerLabel} is not the fixed hosted runner for ${family}.`,
    );
  }
  const nodeArchitecture = values.get('--node-arch');
  if (!['arm64', 'x64'].includes(nodeArchitecture)) {
    fail('ARGUMENT_INVALID', '--node-arch must be arm64 or x64.');
  }
  if (nodeArchitecture !== expected.architecture) {
    fail(
      'RUNNER_NODE_ARCHITECTURE_MISMATCH',
      `${runnerLabel} requires Node.js ${expected.architecture}; received ${nodeArchitecture}.`,
    );
  }

  return Object.freeze({
    family,
    runnerLabel,
    nodeArchitecture,
    outputDirectory: path.resolve(values.get('--output')),
    browserExecutable: values.has('--browser-executable')
      ? path.resolve(values.get('--browser-executable'))
      : null,
  });
}

function requiredEnvironment(name, environment = process.env) {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim() === '') {
    fail('HOSTED_PROVENANCE_MISSING', `Required GitHub Actions value ${name} is missing.`);
  }
  return value.trim();
}

export function assertHostedActionsEnvironment(environment = process.env) {
  if (environment.GITHUB_ACTIONS !== 'true') {
    fail(
      'GITHUB_ACTIONS_REQUIRED',
      'Hosted platform evidence may only be generated inside GitHub Actions.',
    );
  }
  if (environment.RUNNER_ENVIRONMENT !== 'github-hosted') {
    fail(
      'GITHUB_HOSTED_RUNNER_REQUIRED',
      'Self-hosted runners cannot be recorded as this GitHub-hosted validation profile.',
    );
  }

  const serverUrl = requiredEnvironment('GITHUB_SERVER_URL', environment);
  const repository = requiredEnvironment('GITHUB_REPOSITORY', environment);
  const runId = requiredEnvironment('GITHUB_RUN_ID', environment);
  const runAttempt = requiredEnvironment('GITHUB_RUN_ATTEMPT', environment);
  const sha = requiredEnvironment('GITHUB_SHA', environment);
  const imageOS = requiredEnvironment('ImageOS', environment);
  const imageVersion = requiredEnvironment('ImageVersion', environment);
  const expectedChromeMajor = requiredEnvironment(
    HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR_ENVIRONMENT,
    environment,
  );
  if (expectedChromeMajor !== String(HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR)) {
    fail(
      'HOSTED_CHROME_EXPECTATION_MISMATCH',
      `${HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR_ENVIRONMENT} must equal the commit-controlled major ${HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR}.`,
    );
  }
  const actions = Object.fromEntries(
    Object.entries(HOSTED_ACTION_COMMITS).map(([role, pin]) => {
      const observedSha = requiredEnvironment(pin.environment, environment);
      if (observedSha !== pin.sha) {
        fail(
          'HOSTED_ACTION_SHA_MISMATCH',
          `${pin.environment} must equal the immutable workflow action commit ${pin.sha}.`,
        );
      }
      return [
        role,
        Object.freeze({
          commitSha: observedSha,
          environment: pin.environment,
        }),
      ];
    }),
  );

  return Object.freeze({
    provider: 'GitHub Actions',
    repository,
    workflow: requiredEnvironment('GITHUB_WORKFLOW', environment),
    workflowRef: requiredEnvironment('GITHUB_WORKFLOW_REF', environment),
    runId,
    runAttempt,
    runUrl: `${serverUrl}/${repository}/actions/runs/${runId}/attempts/${runAttempt}`,
    commitSha: sha,
    gitRef: requiredEnvironment('GITHUB_REF', environment),
    runnerEnvironment: environment.RUNNER_ENVIRONMENT,
    runnerName: requiredEnvironment('RUNNER_NAME', environment),
    runnerOS: requiredEnvironment('RUNNER_OS', environment),
    runnerArchitecture: requiredEnvironment('RUNNER_ARCH', environment),
    imageOS,
    imageVersion,
    browserExpectation: Object.freeze({
      product: 'Google Chrome',
      expectedMajor: HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR,
      environment: HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR_ENVIRONMENT,
    }),
    actions: Object.freeze(actions),
  });
}

export function assertLocalMacOSDiagnosticEnvironment({
  platform = process.platform,
  environment = process.env,
} = {}) {
  if (platform !== 'darwin') {
    fail(
      'LOCAL_MACOS_REQUIRED',
      'The local diagnostic is restricted to a directly observed macOS host.',
    );
  }
  if (
    environment.GITHUB_ACTIONS === 'true' ||
    environment.RUNNER_ENVIRONMENT === 'github-hosted'
  ) {
    fail(
      'LOCAL_DIAGNOSTIC_GITHUB_ACTIONS_FORBIDDEN',
      'Use the hosted harness inside GitHub Actions; do not relabel a hosted run as a local macOS diagnostic.',
    );
  }
  return Object.freeze({
    executionEnvironment: 'LOCAL_DIRECT_MACOS_HOST',
    githubActions: false,
  });
}

async function ensureEmptyOutputDirectory(
  directory,
  { allowedExistingFiles = [] } = {},
) {
  if (existsSync(directory)) {
    const metadata = await stat(directory);
    if (!metadata.isDirectory()) {
      fail('OUTPUT_INVALID', `Output path is not a directory: ${directory}.`);
    }
    const allowed = new Set(allowedExistingFiles);
    const entries = (await readdir(directory)).sort();
    const unexpected = entries.filter((name) => !allowed.has(name));
    if (unexpected.length > 0) {
      fail(
        'OUTPUT_NOT_EMPTY',
        `Refusing to overwrite existing browser-run evidence in ${directory}.`,
      );
    }
    for (const name of entries) {
      const entryMetadata = await lstat(path.resolve(directory, name));
      if (!entryMetadata.isFile() || entryMetadata.isSymbolicLink()) {
        fail(
          'OUTPUT_PREFLIGHT_INVALID',
          `Allowed preflight entry must be a regular file: ${name}.`,
        );
      }
    }
    return;
  }
  await mkdir(directory, { recursive: true });
}

async function readHostedWorkflowPreflight(outputDirectory, options) {
  const preflightPath = path.resolve(
    outputDirectory,
    HOSTED_WORKFLOW_PREFLIGHT_NAME,
  );
  if (!existsSync(preflightPath)) {
    fail(
      'HOSTED_WORKFLOW_PREFLIGHT_REQUIRED',
      `Hosted workflow preflight is missing: ${preflightPath}.`,
    );
  }
  let record;
  try {
    record = JSON.parse(await readFile(preflightPath, 'utf8'));
    validateHostedWorkflowPreflight(record, {
      osFamily: options.family,
      runnerLabel: options.runnerLabel,
      nodeArchitecture: options.nodeArchitecture,
    });
  } catch (error) {
    fail(
      'HOSTED_WORKFLOW_PREFLIGHT_INVALID',
      `Hosted workflow preflight is invalid: ${error?.message ?? String(error)}`,
    );
  }
  return Object.freeze({
    record,
    descriptor: await descriptor(preflightPath, outputDirectory),
  });
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function sha256File(filePath) {
  return sha256Bytes(await readFile(filePath));
}

function parseChecksumIndex(text) {
  const checksums = new Map();
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (line.trim() === '') continue;
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/iu.exec(line);
    if (!match) {
      fail(
        'RELEASE_CHECKSUM_INVALID',
        `release/SHA256SUMS.txt line ${index + 1} is invalid.`,
      );
    }
    const fileName = match[2].trim();
    if (checksums.has(fileName)) {
      fail('RELEASE_CHECKSUM_INVALID', `Duplicate checksum entry for ${fileName}.`);
    }
    checksums.set(fileName, match[1].toLowerCase());
  }
  return checksums;
}

async function verifyAndCopyLockedInputs(outputDirectory) {
  for (const source of [CHECKSUM_SOURCE, RELEASE_SOURCE, GOLDEN_SOURCE]) {
    try {
      await access(source);
    } catch {
      fail('LOCKED_INPUT_MISSING', `Required locked input is missing: ${source}.`);
    }
  }

  const checksums = parseChecksumIndex(await readFile(CHECKSUM_SOURCE, 'utf8'));
  const expectedRelease = checksums.get(RELEASE_NAME);
  const expectedGolden = checksums.get(GOLDEN_NAME);
  if (!expectedRelease || !expectedGolden) {
    fail(
      'RELEASE_CHECKSUM_INVALID',
      'release/SHA256SUMS.txt does not lock both hosted validation inputs.',
    );
  }
  const actualRelease = await sha256File(RELEASE_SOURCE);
  const actualGolden = await sha256File(GOLDEN_SOURCE);
  if (actualRelease !== expectedRelease || actualGolden !== expectedGolden) {
    fail('LOCKED_INPUT_HASH_MISMATCH', 'Source release or golden input hash is stale.');
  }

  const releasePath = path.resolve(outputDirectory, RELEASE_NAME);
  const goldenPath = path.resolve(outputDirectory, GOLDEN_NAME);
  await copyFile(RELEASE_SOURCE, releasePath);
  await copyFile(GOLDEN_SOURCE, goldenPath);
  if (
    (await sha256File(releasePath)) !== expectedRelease ||
    (await sha256File(goldenPath)) !== expectedGolden
  ) {
    fail('LOCKED_INPUT_COPY_MISMATCH', 'Copied hosted validation input changed bytes.');
  }

  return Object.freeze({
    releasePath,
    goldenPath,
    releaseSha256: expectedRelease,
    goldenSha256: expectedGolden,
  });
}

function runText(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15_000,
    windowsHide: true,
  }).trim();
}

function normalizeLocaleText(value) {
  return String(value ?? '')
    .trim()
    .replace(/\..*$/u, '')
    .replace(/@.*$/u, '')
    .replace('_', '-');
}

function collectMacOSMetadata() {
  const version = runText('sw_vers', ['-productVersion']);
  const build = runText('sw_vers', ['-buildVersion']);
  let osLocale = normalizeLocaleText(process.env.LANG);
  try {
    osLocale = normalizeLocaleText(runText('defaults', ['read', '-g', 'AppleLocale']));
  } catch {
    // LANG is retained when the global AppleLocale key is not available.
  }
  return {
    osEdition: `macOS ${version}`,
    osBuild:
      `${build}; Darwin ${os.release()}` +
      (process.env.ImageVersion ? `; ImageVersion ${process.env.ImageVersion}` : ''),
    osLocale: osLocale || 'und',
    reportedArchitecture: runText('uname', ['-m']),
  };
}

function collectUbuntuMetadata() {
  const fields = Object.fromEntries(
    readFileSync('/etc/os-release', 'utf8')
      .split(/\r?\n/u)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => {
        const index = line.indexOf('=');
        return [
          line.slice(0, index),
          line.slice(index + 1).replace(/^"|"$/gu, ''),
        ];
      }),
  );
  return {
    osEdition: fields.PRETTY_NAME || `Ubuntu ${fields.VERSION_ID ?? 'unknown'}`,
    osBuild: `${os.release()}; ImageVersion ${process.env.ImageVersion}`,
    osLocale: normalizeLocaleText(process.env.LANG) || 'C',
    reportedArchitecture: runText('uname', ['-m']),
  };
}

function runPowerShellJson(command) {
  const arguments_ = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command];
  let lastError;
  for (const executable of ['powershell.exe', 'pwsh.exe', 'pwsh']) {
    try {
      return JSON.parse(runText(executable, arguments_).replace(/^\uFEFF/u, ''));
    } catch (error) {
      lastError = error;
    }
  }
  fail(
    'WINDOWS_METADATA_UNAVAILABLE',
    `PowerShell could not read Windows metadata: ${lastError?.message ?? 'unknown error'}.`,
  );
}

function collectWindowsMetadata() {
  const metadata = runPowerShellJson(
    [
      '$os = Get-CimInstance Win32_OperatingSystem;',
      '$culture = (Get-Culture).Name;',
      '[pscustomobject]@{',
      'Caption=$os.Caption;',
      'Version=$os.Version;',
      'BuildNumber=$os.BuildNumber;',
      'OSArchitecture=$os.OSArchitecture;',
      'Culture=$culture',
      '} | ConvertTo-Json -Compress',
    ].join(' '),
  );
  return {
    osEdition: String(metadata.Caption),
    osBuild:
      `${metadata.Version} build ${metadata.BuildNumber}; ` +
      `ImageVersion ${process.env.ImageVersion}`,
    osLocale: normalizeLocaleText(metadata.Culture) || 'und',
    reportedArchitecture: String(metadata.OSArchitecture),
  };
}

function collectRunnerIdentity(family, runnerLabel, expectedNodeArchitecture) {
  const platformMetadata =
    family === 'macos'
      ? collectMacOSMetadata()
      : family === 'ubuntu'
        ? collectUbuntuMetadata()
        : collectWindowsMetadata();
  const reportedArchitecture =
    platformMetadata.reportedArchitecture ?? process.arch;
  const normalizedArchitecture = /(?:arm|aarch64)/iu.test(reportedArchitecture)
    ? 'arm64'
    : /(?:x86_64|amd64|x64|64-bit)/iu.test(reportedArchitecture)
      ? 'x64'
      : reportedArchitecture;
  const runner = assertHostedRunnerIdentity({
    runnerLabel,
    family,
    platform: process.platform,
    architecture: normalizedArchitecture,
    osEdition: platformMetadata.osEdition,
  });
  if (process.arch !== expectedNodeArchitecture) {
    fail(
      'NODE_ARCHITECTURE_MISMATCH',
      `The workflow selected Node.js ${expectedNodeArchitecture}, but the running process reports ${process.arch}.`,
    );
  }
  return Object.freeze({
    runner,
    osBuild: platformMetadata.osBuild,
    osLocale: platformMetadata.osLocale,
    reportedArchitecture,
    nodeArchitecture: process.arch,
  });
}

function collectLocalMacOSIdentity() {
  const platformMetadata = collectMacOSMetadata();
  const reportedArchitecture =
    platformMetadata.reportedArchitecture ?? process.arch;
  const normalizedArchitecture = /(?:arm|aarch64)/iu.test(reportedArchitecture)
    ? 'arm64'
    : /(?:x86_64|amd64|x64|64-bit)/iu.test(reportedArchitecture)
      ? 'x64'
      : reportedArchitecture;
  return Object.freeze({
    runner: Object.freeze({
      runnerLabel: 'local-macos-direct',
      family: 'macos',
      platform: 'darwin',
      architecture: normalizedArchitecture,
      osEdition: platformMetadata.osEdition,
      evidenceClass: 'local-automated-diagnostic',
    }),
    osBuild: platformMetadata.osBuild,
    osLocale: platformMetadata.osLocale,
    reportedArchitecture,
    nodeArchitecture: process.arch,
  });
}

export function googleChromeExecutableCandidates({
  explicitPath = null,
  platform = process.platform,
  environment = process.env,
} = {}) {
  const candidates = [
    explicitPath,
    environment.AES_REAL_CHROME_EXECUTABLE,
    environment.PUPPETEER_EXECUTABLE_PATH,
    environment.CHROME_PATH,
    environment.CHROME_BIN,
  ];
  if (platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  } else if (platform === 'linux') {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/opt/google/chrome/google-chrome',
    );
  } else if (platform === 'win32') {
    for (const root of [
      environment.ProgramFiles,
      environment['PROGRAMFILES(X86)'],
      environment.LOCALAPPDATA,
    ]) {
      if (root) {
        candidates.push(
          path.win32.join(
            root,
            'Google',
            'Chrome',
            'Application',
            'chrome.exe',
          ),
        );
      }
    }
  } else {
    fail(
      'SYSTEM_PLATFORM_UNSUPPORTED',
      `Google Chrome discovery does not support platform ${platform}.`,
    );
  }
  return Object.freeze([...new Set(candidates.filter(Boolean))]);
}

export async function discoverGoogleChromeExecutable(explicitPath = null) {
  const candidates = googleChromeExecutableCandidates({ explicitPath });
  for (const candidate of candidates) {
    const absolute = path.resolve(candidate);
    try {
      await access(absolute);
      return absolute;
    } catch {
      // Try the next explicit, environment, or fixed runner-image path.
    }
  }
  fail(
    'GOOGLE_CHROME_NOT_FOUND',
    'The selected browser-run environment has no discoverable Google Chrome executable.',
    {
      platform: process.platform,
      checkedCandidates: candidates,
    },
  );
}

export function assertGoogleChromeProduct(
  product,
  {
    expectedMajor = null,
    requiredCode = 'GOOGLE_CHROME_REQUIRED',
    mismatchCode = 'GOOGLE_CHROME_MAJOR_MISMATCH',
  } = {},
) {
  const normalizedProduct = String(product ?? '').trim();
  const match = /^Chrome\/(\d+)\.(\d+)\.(\d+)\.(\d+)$/u.exec(
    normalizedProduct,
  );
  if (!match) {
    fail(
      requiredCode,
      `A four-component Google Chrome product is required; observed ${normalizedProduct || 'unknown'}.`,
    );
  }
  const version = match.slice(1).join('.');
  const major = Number(match[1]);
  if (
    expectedMajor !== null &&
    (!Number.isSafeInteger(expectedMajor) || major !== expectedMajor)
  ) {
    fail(
      mismatchCode,
      `Google Chrome major ${expectedMajor} is required; observed ${version}.`,
      { expectedMajor, observedMajor: major, observedVersion: version },
    );
  }
  return Object.freeze({
    product: normalizedProduct,
    version,
    major,
  });
}

function pathApiForPlatform(platform) {
  if (platform === 'win32') return path.win32;
  if (platform === 'darwin' || platform === 'linux') return path.posix;
  fail(
    'SYSTEM_PLATFORM_UNSUPPORTED',
    `Hosted Google Chrome validation does not support platform ${platform}.`,
  );
}

function normalizeHostedSystemPath(value, platform) {
  const api = pathApiForPlatform(platform);
  let normalized = api.resolve(String(value ?? '').trim());
  if (platform === 'win32' && normalized.startsWith('\\\\?\\')) {
    normalized = normalized.slice(4);
  }
  return api.normalize(normalized);
}

function equalHostedSystemPath(left, right, platform) {
  const normalizedLeft = normalizeHostedSystemPath(left, platform);
  const normalizedRight = normalizeHostedSystemPath(right, platform);
  return platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

export function hostedGoogleChromeInstallationPaths({
  platform = process.platform,
  environment = process.env,
} = {}) {
  if (platform === 'darwin') {
    const chrome =
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    return Object.freeze({
      requestedPaths: Object.freeze([chrome]),
      canonicalPaths: Object.freeze([chrome]),
    });
  }
  if (platform === 'linux') {
    const paths = Object.freeze([
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/opt/google/chrome/google-chrome',
    ]);
    return Object.freeze({
      requestedPaths: paths,
      canonicalPaths: paths,
    });
  }
  if (platform === 'win32') {
    const requestedPaths = [
      environment.ProgramFiles,
      environment['PROGRAMFILES(X86)'],
      environment.LOCALAPPDATA,
    ]
      .filter(
        (root) =>
          typeof root === 'string' &&
          root.trim() !== '' &&
          path.win32.isAbsolute(root),
      )
      .map((root) =>
        path.win32.join(
          root,
          'Google',
          'Chrome',
          'Application',
          'chrome.exe',
        ),
      );
    if (requestedPaths.length === 0) {
      fail(
        'HOSTED_WINDOWS_INSTALLATION_ROOTS_MISSING',
        'Hosted Windows validation requires ProgramFiles, PROGRAMFILES(X86), or LOCALAPPDATA.',
      );
    }
    const uniquePaths = Object.freeze([...new Set(requestedPaths)]);
    return Object.freeze({
      requestedPaths: uniquePaths,
      canonicalPaths: uniquePaths,
    });
  }
  fail(
    'SYSTEM_PLATFORM_UNSUPPORTED',
    `Hosted Google Chrome validation does not support platform ${platform}.`,
  );
}

export function assertHostedGoogleChromeExecutablePath(
  executablePath,
  {
    platform = process.platform,
    environment = process.env,
    canonicalize = (candidate) => realpathSync.native(candidate),
  } = {},
) {
  const allowed = hostedGoogleChromeInstallationPaths({
    platform,
    environment,
  });
  const requestedPath = normalizeHostedSystemPath(executablePath, platform);
  if (
    !allowed.requestedPaths.some((candidate) =>
      equalHostedSystemPath(requestedPath, candidate, platform),
    )
  ) {
    fail(
      'HOSTED_GOOGLE_CHROME_EXECUTABLE_REQUIRED',
      `Hosted validation requires an exact platform Google Chrome installation path; observed ${requestedPath || 'unknown'}.`,
      {
        observedPath: requestedPath,
        allowedPaths: allowed.requestedPaths,
      },
    );
  }

  let canonicalPath;
  try {
    canonicalPath = normalizeHostedSystemPath(
      canonicalize(requestedPath),
      platform,
    );
  } catch (error) {
    fail(
      'HOSTED_GOOGLE_CHROME_CANONICALIZATION_FAILED',
      `Hosted Google Chrome path could not be canonicalized: ${requestedPath}.`,
      {
        observedPath: requestedPath,
        error: error?.message ?? String(error),
      },
    );
  }
  if (
    !allowed.canonicalPaths.some((candidate) =>
      equalHostedSystemPath(canonicalPath, candidate, platform),
    )
  ) {
    fail(
      'HOSTED_GOOGLE_CHROME_CANONICAL_PATH_REQUIRED',
      `Hosted Google Chrome resolved outside the approved system installation roots: ${canonicalPath}.`,
      {
        observedPath: requestedPath,
        canonicalPath,
        allowedCanonicalPaths: allowed.canonicalPaths,
      },
    );
  }
  return canonicalPath;
}

const AUTO_ATTACH_CONFIGURATION = Object.freeze({
  autoAttach: true,
  flatten: true,
  waitForDebuggerOnStart: true,
});

const NETWORK_TARGET_TYPES = new Set(['page', 'iframe', 'worker', 'shared_worker']);
const PAGE_EVENT_TARGET_TYPES = new Set(['page', 'iframe']);

function createMarker(origin) {
  return () =>
    Object.freeze({
      utc: new Date().toISOString(),
      monotonicMs: Number(process.hrtime.bigint() - origin) / 1_000_000,
    });
}

function attachCdpCapture(session, events, identity, marker, targetEntry) {
  const methods = [
    'Network.requestWillBeSent',
    'Network.responseReceived',
    'Network.loadingFinished',
    'Network.loadingFailed',
    'Network.webSocketCreated',
    'Network.webTransportCreated',
    'Page.domContentEventFired',
    'Page.loadEventFired',
  ];
  for (const method of methods) {
    session.on(method, (params) => {
      events.push({
        method,
        params,
        sessionId: identity.sessionId,
        targetId: identity.targetId,
        targetType: identity.targetType,
        observedAt: marker(),
      });
      if (method.startsWith('Network.')) targetEntry.networkEventCount += 1;
    });
  }
}

export async function configureCapturedTargetSession({
  session,
  targetEntry,
  marker,
  attachListeners,
}) {
  if (!session || typeof session.send !== 'function') {
    fail('CDP_TARGET_CONFIGURATION_INVALID', 'A send-capable CDP target session is required.');
  }
  if (!targetEntry || typeof targetEntry !== 'object') {
    fail('CDP_TARGET_CONFIGURATION_INVALID', 'A mutable target ledger entry is required.');
  }
  if (typeof marker !== 'function' || typeof attachListeners !== 'function') {
    fail(
      'CDP_TARGET_CONFIGURATION_INVALID',
      'Target configuration requires marker and attachListeners callbacks.',
    );
  }

  targetEntry.autoAttachConfigured ??= false;
  targetEntry.networkEnabled ??= false;
  targetEntry.offlineMechanism ??= 'not-applicable';
  targetEntry.externalProtocolsBlocked ??= [];
  targetEntry.blockedUrlPatterns ??= [];
  targetEntry.pageEventsEnabled ??= false;
  targetEntry.configurationError ??= null;
  targetEntry.listenersAttachedAt ??= null;
  targetEntry.networkEnabledAt ??= null;
  targetEntry.offlineConfiguredAt ??= null;
  targetEntry.autoAttachConfiguredAt ??= null;
  targetEntry.configuredAt ??= null;
  targetEntry.resumedAt ??= null;

  try {
    await attachListeners(session, targetEntry);
    targetEntry.listenersAttachedAt = marker();
    if (NETWORK_TARGET_TYPES.has(targetEntry.type)) {
      await session.send('Network.enable');
      targetEntry.networkEnabled = true;
      targetEntry.networkEnabledAt = marker();
      if (PAGE_EVENT_TARGET_TYPES.has(targetEntry.type)) {
        await session.send('Network.emulateNetworkConditions', {
          offline: true,
          latency: 0,
          downloadThroughput: 0,
          uploadThroughput: 0,
        });
        targetEntry.offlineMechanism = 'Network.emulateNetworkConditions';
      } else {
        await session.send('Network.setBlockedURLs', {
          urls: [...EXTERNAL_URL_BLOCK_PATTERNS],
        });
        targetEntry.offlineMechanism = 'Network.setBlockedURLs';
        targetEntry.blockedUrlPatterns = [...EXTERNAL_URL_BLOCK_PATTERNS];
      }
      targetEntry.externalProtocolsBlocked = [...EXTERNAL_PROTOCOLS_BLOCKED];
      targetEntry.offlineConfiguredAt = marker();
    }
    if (PAGE_EVENT_TARGET_TYPES.has(targetEntry.type)) {
      await session.send('Page.enable');
      targetEntry.pageEventsEnabled = true;
    }
    await session.send('Target.setAutoAttach', AUTO_ATTACH_CONFIGURATION);
    targetEntry.autoAttachConfigured = true;
    targetEntry.autoAttachConfiguredAt = marker();
    targetEntry.configuredAt = marker();
  } catch (error) {
    targetEntry.configurationError = {
      name: error?.name ?? 'Error',
      message: error?.message ?? String(error),
    };
  } finally {
    if (!targetEntry.configuredAt) targetEntry.configuredAt = marker();
    try {
      await session.send('Runtime.runIfWaitingForDebugger');
      targetEntry.resumedAt = marker();
    } catch (resumeError) {
      targetEntry.configurationError = {
        name: resumeError?.name ?? 'Error',
        message: resumeError?.message ?? String(resumeError),
        phase: 'Runtime.runIfWaitingForDebugger',
        priorError: targetEntry.configurationError,
      };
    }
  }
  return targetEntry;
}

async function initializeTargetCapture(browserSession, events, marker) {
  const ledger = {
    autoAttach: { ...AUTO_ATTACH_CONFIGURATION },
    browserSessionId: browserSession.id(),
    mainPageTargetId: null,
    mainPageSessionId: null,
    targets: [],
    discoveredTargets: [],
    unsupportedTargets: [],
    unobservedDescendantTargets: [],
  };
  const sessions = new Map([[browserSession.id(), browserSession]]);
  const entriesBySession = new Map();
  const discoveredByTarget = new Map();
  const registeredParents = new Set();
  const configuredSessions = new Set();
  const pendingConfigurations = new Set();

  const queueConfiguration = (promise) => {
    pendingConfigurations.add(promise);
    promise.finally(() => pendingConfigurations.delete(promise)).catch(() => {});
  };

  const registerParent = (parentSession) => {
    const parentId = parentSession.id();
    if (registeredParents.has(parentId)) return;
    registeredParents.add(parentId);
    parentSession.on('sessionattached', (childSession) => {
      sessions.set(childSession.id(), childSession);
      registerParent(childSession);
    });
    parentSession.on('Target.attachedToTarget', (params) => {
      if (configuredSessions.has(params.sessionId)) return;
      configuredSessions.add(params.sessionId);
      const childSession =
        sessions.get(params.sessionId) ??
        browserSession.connection()?.session(params.sessionId);
      if (!childSession) {
        ledger.unobservedDescendantTargets.push({
          sessionId: params.sessionId,
          targetId: params.targetInfo?.targetId ?? null,
          type: params.targetInfo?.type ?? null,
          parentSessionId: parentId,
          reason: 'Puppeteer did not expose the auto-attached CDP session.',
        });
        return;
      }
      sessions.set(params.sessionId, childSession);
      registerParent(childSession);
      queueConfiguration(
        (async () => {
          const targetInfo = params.targetInfo ?? {};
          const targetEntry = {
            targetId: String(targetInfo.targetId ?? ''),
            sessionId: params.sessionId,
            parentSessionId: parentId,
            type: String(targetInfo.type ?? ''),
            url: String(targetInfo.url ?? ''),
            captureAttached: true,
            paused: params.waitingForDebugger === true,
            autoAttachConfigured: false,
            networkEnabled: false,
            offlineMechanism: 'not-applicable',
            externalProtocolsBlocked: [],
            blockedUrlPatterns: [],
            pageEventsEnabled: false,
            networkEventCount: 0,
            attachedAt: marker(),
            pausedAt: marker(),
            listenersAttachedAt: null,
            networkEnabledAt: null,
            offlineConfiguredAt: null,
            autoAttachConfiguredAt: null,
            configuredAt: null,
            resumedAt: null,
            configurationError: null,
          };
          ledger.targets.push(targetEntry);
          entriesBySession.set(params.sessionId, targetEntry);
          if (!NETWORK_TARGET_TYPES.has(targetEntry.type) && targetEntry.type !== 'tab') {
            ledger.unsupportedTargets.push({
              targetId: targetEntry.targetId,
              sessionId: targetEntry.sessionId,
              parentSessionId: parentId,
              type: targetEntry.type,
              url: targetEntry.url,
            });
          }
          await configureCapturedTargetSession({
            session: childSession,
            targetEntry,
            marker,
            attachListeners: (session) => {
              attachCdpCapture(
                session,
                events,
                {
                  sessionId: params.sessionId,
                  targetId: targetEntry.targetId,
                  targetType: targetEntry.type,
                },
                marker,
                targetEntry,
              );
            },
          });
        })(),
      );
    });
    parentSession.on('Target.detachedFromTarget', (params) => {
      const entry = entriesBySession.get(params.sessionId);
      if (entry && !entry.detachedAt) entry.detachedAt = marker();
    });
  };

  registerParent(browserSession);
  const retainDiscoveredTarget = (targetInfo) => {
    if (!targetInfo || typeof targetInfo.targetId !== 'string') return;
    let retained = discoveredByTarget.get(targetInfo.targetId);
    if (!retained) {
      retained = {
        targetId: targetInfo.targetId,
        type: String(targetInfo.type ?? ''),
        url: String(targetInfo.url ?? ''),
        destroyedAt: null,
      };
      discoveredByTarget.set(targetInfo.targetId, retained);
      ledger.discoveredTargets.push(retained);
    } else {
      retained.type = String(targetInfo.type ?? retained.type);
      retained.url = String(targetInfo.url ?? retained.url);
    }
  };
  browserSession.on('Target.targetCreated', ({ targetInfo }) => {
    retainDiscoveredTarget(targetInfo);
  });
  browserSession.on('Target.targetInfoChanged', ({ targetInfo }) => {
    retainDiscoveredTarget(targetInfo);
  });
  browserSession.on('Target.targetDestroyed', ({ targetId }) => {
    const retained = discoveredByTarget.get(targetId);
    if (retained && !retained.destroyedAt) retained.destroyedAt = marker();
  });
  await browserSession.send('Target.setDiscoverTargets', { discover: true });
  await browserSession.send('Target.setAutoAttach', AUTO_ATTACH_CONFIGURATION);

  const waitForMainPage = async (targetId, timeoutMs = DEFAULT_TIMEOUT_MS) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const entry = ledger.targets.find(({ targetId: candidate }) => candidate === targetId);
      if (entry?.configurationError) {
        fail(
          'CDP_MAIN_PAGE_UNOBSERVED',
          'The main page target failed CDP capture configuration.',
          entry.configurationError,
        );
      }
      if (
        entry?.networkEnabled === true &&
        entry?.offlineMechanism === 'Network.emulateNetworkConditions' &&
        entry?.pageEventsEnabled === true &&
        entry?.autoAttachConfigured === true &&
        entry?.resumedAt
      ) {
        ledger.mainPageTargetId = entry.targetId;
        ledger.mainPageSessionId = entry.sessionId;
        return entry;
      }
      await delay(25);
    }
    fail('CDP_MAIN_PAGE_UNOBSERVED', `Timed out observing main page target ${targetId}.`);
  };

  const settle = async (timeoutMs = DEFAULT_TIMEOUT_MS) => {
    const deadline = Date.now() + timeoutMs;
    let stableTargetCount = -1;
    let stableObservations = 0;
    while (Date.now() < deadline) {
      await Promise.allSettled([...pendingConfigurations]);
      const allDiscoveredObserved = ledger.discoveredTargets
        .filter(({ type }) => type !== 'browser')
        .every(({ targetId }) =>
          ledger.targets.some(
            (target) =>
              target.targetId === targetId &&
              target.configurationError === null &&
              target.resumedAt,
          ),
        );
      if (
        pendingConfigurations.size === 0 &&
        allDiscoveredObserved &&
        ledger.targets.length === stableTargetCount
      ) {
        stableObservations += 1;
        if (stableObservations >= 2) return;
      } else {
        stableTargetCount = ledger.targets.length;
        stableObservations = 0;
      }
      await delay(50);
    }
    fail('CDP_DESCENDANT_UNOBSERVED', 'Timed out settling descendant target capture.');
  };

  return Object.freeze({ ledger, waitForMainPage, settle });
}

function createDownloadTracker(browserSession, marker) {
  const records = new Map();
  const errors = [];
  const seenEvents = new Set();
  const connection = browserSession.connection();

  const retainOnce = (method, params, callback) => {
    const key = `${method}:${JSON.stringify(params)}`;
    if (seenEvents.has(key)) return;
    seenEvents.add(key);
    callback();
  };
  const onWillBegin = (params) =>
    retainOnce('Browser.downloadWillBegin', params, () => {
      if (records.has(params.guid)) {
        errors.push({
          code: 'DOWNLOAD_PROTOCOL_DUPLICATE',
          message: `Duplicate Browser.downloadWillBegin for GUID ${params.guid}.`,
        });
        return;
      }
      records.set(params.guid, {
        guid: params.guid,
        suggestedFilename: params.suggestedFilename,
        url: params.url,
        willBeginAt: marker(),
        progress: [],
        completed: null,
        canceled: null,
      });
    });
  const onProgress = (params) =>
    retainOnce('Browser.downloadProgress', params, () => {
      const record = records.get(params.guid);
      if (!record) {
        errors.push({
          code: 'DOWNLOAD_PROTOCOL_ORPHAN',
          message: `Browser.downloadProgress refers to unknown GUID ${params.guid}.`,
        });
        return;
      }
      const retained = {
        guid: params.guid,
        state: params.state,
        receivedBytes: params.receivedBytes,
        totalBytes: params.totalBytes,
        observedAt: marker(),
      };
      record.progress.push(retained);
      if (params.state === 'completed') record.completed = retained;
      if (params.state === 'canceled') record.canceled = retained;
    });

  for (const emitter of [browserSession, connection]) {
    emitter.on('Browser.downloadWillBegin', onWillBegin);
    emitter.on('Browser.downloadProgress', onProgress);
  }

  const waitForCompletedProtocol = async (
    expectedFilename,
    baselineGuids,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (errors.length > 0) {
        fail(errors[0].code, errors[0].message, errors);
      }
      const candidates = [...records.values()].filter(
        (record) =>
          !baselineGuids.has(record.guid) &&
          record.suggestedFilename === expectedFilename,
      );
      if (candidates.length > 1) {
        fail(
          'DOWNLOAD_PROTOCOL_AMBIGUOUS',
          `Multiple download GUIDs claimed ${expectedFilename}.`,
        );
      }
      const [record] = candidates;
      if (record?.canceled) {
        fail('DOWNLOAD_CANCELED', `${expectedFilename} was canceled by the browser.`);
      }
      if (record?.completed) return record;
      await delay(25);
    }
    fail(
      'DOWNLOAD_PROTOCOL_TIMEOUT',
      `Timed out waiting for Browser.downloadProgress state=completed for ${expectedFilename}.`,
    );
  };

  return Object.freeze({
    records,
    errors,
    waitForCompletedProtocol,
    snapshot() {
      return {
        records: [...records.values()],
        errors: [...errors],
      };
    },
  });
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}

async function waitForCompletedFile(
  filePath,
  protocolRecord,
  marker,
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  if (!protocolRecord?.completed || protocolRecord.completed.state !== 'completed') {
    fail(
      'DOWNLOAD_PROTOCOL_INCOMPLETE',
      `Refusing ${path.basename(filePath)} without Browser.downloadProgress state=completed.`,
    );
  }
  const deadline = Date.now() + timeoutMs;
  let previousObservation = null;
  while (Date.now() < deadline) {
    try {
      const metadata = await stat(filePath);
      if (metadata.isFile() && metadata.size > 0) {
        const observation = Object.freeze({
          bytes: metadata.size,
          observedAt: marker(),
        });
        if (previousObservation?.bytes === observation.bytes) {
          const sha256 = await sha256File(filePath);
          const afterHash = await stat(filePath);
          if (afterHash.isFile() && afterHash.size === observation.bytes) {
            const receivedBytes = protocolRecord.completed.receivedBytes;
            if (!Number.isInteger(receivedBytes) || receivedBytes !== observation.bytes) {
              fail(
                'DOWNLOAD_SIZE_MISMATCH',
                `${path.basename(filePath)} protocol bytes differ from the stable file size.`,
              );
            }
            return Object.freeze({
              path: filePath,
              complete: true,
              bytes: observation.bytes,
              sha256,
              suggestedFilename: protocolRecord.suggestedFilename,
              protocolEvents: Object.freeze({
                willBegin: Object.freeze({
                  guid: protocolRecord.guid,
                  suggestedFilename: protocolRecord.suggestedFilename,
                  url: protocolRecord.url,
                  observedAt: protocolRecord.willBeginAt,
                }),
                completed: Object.freeze({
                  guid: protocolRecord.guid,
                  state: 'completed',
                  receivedBytes,
                  totalBytes:
                    Number.isInteger(protocolRecord.completed.totalBytes) &&
                    protocolRecord.completed.totalBytes >= receivedBytes
                      ? protocolRecord.completed.totalBytes
                      : receivedBytes,
                  observedAt: protocolRecord.completed.observedAt,
                }),
              }),
              stableSizeObservations: Object.freeze([
                previousObservation,
                observation,
              ]),
            });
          }
        }
        previousObservation = observation;
      }
    } catch (error) {
      if (error instanceof HostedPlatformValidationError) throw error;
      // Chrome retains a .crdownload until the original filename is complete.
    }
    await delay(100);
  }
  fail('DOWNLOAD_TIMEOUT', `Timed out waiting for ${path.basename(filePath)}.`);
}

async function waitForEnabled(page, selector) {
  await page.waitForFunction(
    (target) => {
      const element = document.querySelector(target);
      return element instanceof HTMLButtonElement && element.disabled === false;
    },
    { timeout: DEFAULT_TIMEOUT_MS },
    selector,
  );
}

async function setInputValue(page, selector, value) {
  await page.$eval(
    selector,
    (element, nextValue) => {
      if (!(element instanceof HTMLInputElement)) {
        throw new Error(`Expected input element for ${element.tagName}.`);
      }
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      if (!setter) throw new Error('HTMLInputElement value setter is unavailable.');
      setter.call(element, nextValue);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    },
    value,
  );
}

async function downloadThroughButton(page, selector, expectedPath, downloadTracker, marker) {
  if (existsSync(expectedPath)) {
    fail(
      'DOWNLOAD_COLLISION',
      `Refusing to overwrite pre-existing download ${expectedPath}.`,
    );
  }
  const baselineGuids = new Set(downloadTracker.records.keys());
  await waitForEnabled(page, selector);
  await page.click(selector);
  const protocolRecord = await downloadTracker.waitForCompletedProtocol(
    path.basename(expectedPath),
    baselineGuids,
  );
  return waitForCompletedFile(expectedPath, protocolRecord, marker);
}

async function recordAction(timeline, marker, id, operation) {
  const action = {
    id,
    before: marker(),
    after: null,
    verified: false,
    evidence: null,
  };
  timeline.actions.push(action);
  try {
    const result = await operation();
    action.evidence = result.evidence;
    action.verified = true;
    action.after = marker();
    return result.value;
  } catch (error) {
    action.after = marker();
    action.error = {
      name: error?.name ?? 'Error',
      code: error?.code ?? null,
      message: error?.message ?? String(error),
    };
    throw error;
  }
}

function downloadTimelineEvidence(role, download) {
  return {
    downloadRole: role,
    guid: download.protocolEvents.willBegin.guid,
    protocolState: download.protocolEvents.completed.state,
    bytes: download.bytes,
    sha256: download.sha256,
  };
}

function parseJsonArtifact(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    fail('ARTIFACT_JSON_INVALID', `${label} is not valid JSON: ${error.message}.`);
  }
}

function sameNumericArray(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameStringSet(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

function validateSelfTest(bytes, goldenSha256) {
  const record = parseJsonArtifact(bytes, 'self-test JSON');
  if (record.recordStatus !== 'PASS') {
    fail('SELF_TEST_FAILED', 'The in-app scientific self-test did not return PASS.');
  }
  if (
    record.runtime?.pageProtocol !== 'file:' ||
    record.runtime?.online !== false
  ) {
    fail('SELF_TEST_RUNTIME_INVALID', 'Self-test did not retain file:/offline runtime state.');
  }
  if (
    record.fixture?.expectedSha256 !== goldenSha256 ||
    record.fixture?.observedSha256 !== goldenSha256
  ) {
    fail('SELF_TEST_FIXTURE_MISMATCH', 'Self-test did not reproduce the locked golden input.');
  }
  if (
    !Array.isArray(record.checks) ||
    record.checks.length === 0 ||
    record.checks.some((check) => check?.status !== 'PASS')
  ) {
    fail('SELF_TEST_CHECK_FAILED', 'At least one retained self-test check is not PASS.');
  }
  return record;
}

function validateScientificReport(bytes, goldenSha256, goldenSizeBytes) {
  const report = parseJsonArtifact(bytes, 'scientific report JSON');
  const expectedContext = {
    projectName: 'Platform golden',
    sample: 'synthetic-kas',
    process: 'multi-rate thermal decomposition',
    atmosphere: 'N2',
    stage: 'supplied-alpha 0.10-0.90 window',
  };
  for (const [key, expected] of Object.entries(expectedContext)) {
    if (report.context?.[key] !== expected) {
      fail('REPORT_CONTEXT_MISMATCH', `report.context.${key} differs from the golden protocol.`);
    }
  }
  const sourceMatch = report.context?.sourceFiles?.some(
    (source) =>
      source?.sha256 === goldenSha256 &&
      source?.sizeBytes === goldenSizeBytes,
  );
  if (!sourceMatch) {
    fail('REPORT_SOURCE_MISMATCH', 'Report provenance does not retain the golden input hash and size.');
  }
  if (!sameStringSet(report.analysis?.methods?.map(({ method }) => method), REQUIRED_METHODS)) {
    fail('REPORT_METHOD_MISMATCH', 'Report does not contain exactly the four required methods.');
  }
  if (report.analysis?.kissinger !== null && report.analysis?.kissinger !== undefined) {
    fail('REPORT_KISSINGER_UNEXPECTED', 'Golden supplied-alpha flow must not create Kissinger output.');
  }
  if (!sameNumericArray(report.analysis?.eligibility?.commonAlphaRange, [0.1, 0.9])) {
    fail('REPORT_ALPHA_RANGE_MISMATCH', 'Report common alpha range is not 0.10-0.90.');
  }
  if (!Array.isArray(report.results) || report.results.length !== 36) {
    fail('REPORT_RESULT_COUNT_MISMATCH', 'Golden report must contain exactly 36 result rows.');
  }
  for (const method of REQUIRED_METHODS) {
    const rows = report.results.filter(
      (row) =>
        row?.method === method &&
        row.status === 'success' &&
        Number.isFinite(row.alpha) &&
        Number.isFinite(row.activationEnergyKJPerMol),
    );
    const alphas = [...new Set(rows.map(({ alpha }) => alpha))].sort(
      (left, right) => left - right,
    );
    if (!sameNumericArray(alphas, EXPECTED_ALPHA_GRID)) {
      fail('REPORT_ALPHA_GRID_MISMATCH', `${method} does not cover all nine alpha points.`);
    }
    if (
      method === 'KAS' &&
      rows.some(({ activationEnergyKJPerMol }) =>
        Math.abs(activationEnergyKJPerMol - 150) > 1e-4)
    ) {
      fail('REPORT_NUMERIC_MISMATCH', 'KAS did not reproduce 150 kJ/mol.');
    }
  }
  return report;
}

function validateCsvAndPdf(csvBytes, pdfBytes, report) {
  const csvText = csvBytes.toString('utf8');
  const csvLines = csvText.trimEnd().split(/\r?\n/u);
  if (
    !csvLines[0]?.startsWith('schemaVersion,applicationVersion,') ||
    csvLines.length - 1 !== report.results.length
  ) {
    fail('CSV_EXPORT_INVALID', 'CSV export does not match the report result count/header.');
  }
  if (
    !pdfBytes.subarray(0, 5).equals(Buffer.from('%PDF-')) ||
    !pdfBytes.subarray(Math.max(0, pdfBytes.length - 2048)).includes(Buffer.from('%%EOF'))
  ) {
    fail('PDF_EXPORT_INVALID', 'PDF export lacks a valid PDF header or EOF marker.');
  }
}

async function descriptor(
  filePath,
  outputDirectory,
  { includeBytes = false } = {},
) {
  const metadata = await stat(filePath);
  if (!metadata.isFile() || metadata.size <= 0) {
    fail('ARTIFACT_EMPTY', `${filePath} is not a non-empty file.`);
  }
  return Object.freeze({
    path: path.relative(outputDirectory, filePath).split(path.sep).join('/'),
    ...(includeBytes ? { bytes: metadata.size } : {}),
    sha256: await sha256File(filePath),
  });
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function summarizeTargetLedger(ledger) {
  if (!ledger) return null;
  return {
    autoAttach: ledger.autoAttach ?? null,
    browserSessionId: ledger.browserSessionId ?? null,
    mainPageTargetId: ledger.mainPageTargetId ?? null,
    mainPageSessionId: ledger.mainPageSessionId ?? null,
    discoveredTargetCount: Array.isArray(ledger.discoveredTargets)
      ? ledger.discoveredTargets.length
      : 0,
    attachedTargetCount: Array.isArray(ledger.targets) ? ledger.targets.length : 0,
    targets: Array.isArray(ledger.targets)
      ? ledger.targets.map((target) => ({
          targetId: target.targetId ?? null,
          sessionId: target.sessionId ?? null,
          parentSessionId: target.parentSessionId ?? null,
          type: target.type ?? null,
          paused: target.paused === true,
          networkEnabled: target.networkEnabled === true,
          offlineMechanism: target.offlineMechanism ?? null,
          externalProtocolsBlocked: target.externalProtocolsBlocked ?? [],
          blockedUrlPatterns: target.blockedUrlPatterns ?? [],
          autoAttachConfigured: target.autoAttachConfigured === true,
          resumed: Boolean(target.resumedAt),
          networkEventCount: target.networkEventCount ?? 0,
          configurationError: target.configurationError ?? null,
        }))
      : [],
    unsupportedTargets: Array.isArray(ledger.unsupportedTargets)
      ? ledger.unsupportedTargets
      : [],
    unobservedDescendantTargets: Array.isArray(ledger.unobservedDescendantTargets)
      ? ledger.unobservedDescendantTargets
      : [],
  };
}

export function createHostedFailureRecord({
  options,
  provenance,
  identity = null,
  error,
  recordedAt = new Date().toISOString(),
}) {
  return {
    schema: 'activation-energy-studio/hosted-platform-run-failure/v2',
    claimStatus: FAILURE_STATUS,
    recordedAt,
    family: options.family,
    runnerLabel: options.runnerLabel,
    provenance,
    identity,
    partial: error?.hostedPartial ?? null,
    error: {
      name: error?.name ?? 'Error',
      code: error?.code ?? 'UNCLASSIFIED_ERROR',
      message: error?.message ?? String(error),
    },
  };
}

export function createLocalMacOSFailureRecord({
  provenance,
  identity = null,
  error,
  recordedAt = new Date().toISOString(),
}) {
  return {
    schema:
      'activation-energy-studio/local-macos-browser-diagnostic-failure/v1',
    claimStatus: LOCAL_MACOS_DIAGNOSTIC_FAILURE_STATUS,
    recordedAt,
    family: 'macos',
    provenance,
    identity,
    partial: error?.browserRunPartial ?? null,
    platformCriteriaClosed: [],
    claimBoundary:
      'A failed local automated diagnostic is not platform evidence and cannot be converted into a hosted or human-observed PASS.',
    error: {
      name: error?.name ?? 'Error',
      code: error?.code ?? 'UNCLASSIFIED_ERROR',
      message: error?.message ?? String(error),
    },
  };
}

async function executeAutomatedBrowserRun(
  options,
  provenance,
  identity,
  lockedInputs,
  profile,
) {
  let browserExecutable = null;
  const rawEventsPath = path.resolve(options.outputDirectory, 'raw-cdp-events.json');
  const harPath = path.resolve(options.outputDirectory, 'network.har');
  const screenshotPath = path.resolve(options.outputDirectory, 'final-state.png');
  const selfTestPath = path.resolve(
    options.outputDirectory,
    SELF_TEST_DOWNLOAD_NAME,
  );
  const reportJsonPath = path.resolve(
    options.outputDirectory,
    REPORT_DOWNLOAD_NAMES.reportJson,
  );
  const reportCsvPath = path.resolve(
    options.outputDirectory,
    REPORT_DOWNLOAD_NAMES.reportCsv,
  );
  const reportPdfPath = path.resolve(
    options.outputDirectory,
    REPORT_DOWNLOAD_NAMES.reportPdf,
  );
  const cdpEvents = [];
  const startedAt = new Date().toISOString();
  const monotonicOrigin = process.hrtime.bigint();
  const marker = createMarker(monotonicOrigin);
  const timeline = {
    captureStartedAt: null,
    captureEndedAt: null,
    actions: [],
  };
  let browser;
  let targetCapture;
  let downloadTracker;
  let lastRuntime = null;
  let lastBrowserVersion = null;
  let lastChromeIdentity = null;
  let completed;

  try {
    browserExecutable = await discoverGoogleChromeExecutable(
      options.browserExecutable,
    );
    if (profile.kind === 'hosted') {
      browserExecutable =
        assertHostedGoogleChromeExecutablePath(browserExecutable);
    }
    if (process.platform !== 'win32') {
      try {
        await access(browserExecutable, fsConstants.X_OK);
      } catch {
        fail(
          'SYSTEM_CHROME_NOT_EXECUTABLE',
          `The discovered Chrome path is not executable: ${browserExecutable}.`,
        );
      }
    }
    browser = await puppeteer.launch({
      executablePath: browserExecutable,
      headless: true,
      waitForInitialPage: false,
      defaultViewport: {
        width: 1440,
        height: 1200,
        deviceScaleFactor: 1,
      },
      args: [
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-features=OptimizationHints,MediaRouter',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-startup-window',
        '--password-store=basic',
        '--use-mock-keychain',
      ],
    });
    const browserSession = await browser.target().createCDPSession();
    lastBrowserVersion = await browserSession.send('Browser.getVersion');
    lastChromeIdentity = assertGoogleChromeProduct(
      lastBrowserVersion.product,
      {
        expectedMajor:
          profile.kind === 'hosted'
            ? provenance.browserExpectation.expectedMajor
            : null,
        requiredCode:
          profile.kind === 'hosted'
            ? 'HOSTED_GOOGLE_CHROME_REQUIRED'
            : 'LOCAL_GOOGLE_CHROME_REQUIRED',
        mismatchCode: 'HOSTED_GOOGLE_CHROME_MAJOR_MISMATCH',
      },
    );
    timeline.captureStartedAt = marker();
    targetCapture = await initializeTargetCapture(browserSession, cdpEvents, marker);
    downloadTracker = createDownloadTracker(browserSession, marker);
    await browserSession.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: options.outputDirectory,
      eventsEnabled: true,
    });
    const page = await browser.newPage();
    const mainPageTargetId = page.target()?._targetId;
    if (typeof mainPageTargetId !== 'string' || mainPageTargetId === '') {
      fail('CDP_MAIN_PAGE_UNOBSERVED', 'Puppeteer did not expose the main page target ID.');
    }
    await targetCapture.waitForMainPage(mainPageTargetId);
    await page.setBypassServiceWorker(true);
    await page.setOfflineMode(true);

    const releaseUrl = pathToFileURL(lockedInputs.releasePath).href;
    const initialRuntime = await recordAction(timeline, marker, 'page-open', async () => {
      await page.goto(releaseUrl, {
        waitUntil: ['domcontentloaded', 'load'],
        timeout: DEFAULT_TIMEOUT_MS,
      });
      await page.setOfflineMode(true);
      await page.waitForFunction(() => navigator.onLine === false, {
        timeout: DEFAULT_TIMEOUT_MS,
      });
      const runtime = await page.evaluate((selectors) => {
        const selectorsPresent = selectors.filter(
          (selector) => document.querySelector(selector) !== null,
        );
        return {
          documentProtocol: window.location.protocol,
          onlineStateDuringRun: navigator.onLine,
          userAgent: navigator.userAgent,
          navigatorLanguage: navigator.language,
          navigatorLanguages: [...navigator.languages],
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          decimalSeparator:
            new Intl.NumberFormat().formatToParts(1.1).find(({ type }) => type === 'decimal')
              ?.value ?? '.',
          domContract: { selectorsPresent },
        };
      }, REQUIRED_DOM_CONTRACT_SELECTORS);
      lastRuntime = runtime;
      if (
        runtime.documentProtocol !== 'file:' ||
        runtime.onlineStateDuringRun !== false ||
        runtime.domContract.selectorsPresent.length !==
          REQUIRED_DOM_CONTRACT_SELECTORS.length
      ) {
        fail(
          'BROWSER_OFFLINE_STATE_INVALID',
          'The page is not file://, navigator.onLine is not false, or the DOM contract is incomplete.',
        );
      }
      return {
        value: runtime,
        evidence: {
          documentProtocol: runtime.documentProtocol,
          onlineStateDuringRun: runtime.onlineStateDuringRun,
          domContract: runtime.domContract,
        },
      };
    });
    lastRuntime = initialRuntime;
    await targetCapture.settle();
    validateTargetLedger(targetCapture.ledger);

    const selfTestResult = await recordAction(
      timeline,
      marker,
      'self-test',
      async () => {
        await page.click('[data-testid="run-platform-self-test"]');
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="platform-self-test-status"]')
              ?.textContent?.trim() === 'PASS',
          { timeout: DEFAULT_TIMEOUT_MS },
        );
        const download = await downloadThroughButton(
          page,
          '[data-testid="download-platform-self-test"]',
          selfTestPath,
          downloadTracker,
          marker,
        );
        const record = validateSelfTest(
          await readFile(selfTestPath),
          lockedInputs.goldenSha256,
        );
        return {
          value: { download, record },
          evidence: {
            status: 'PASS',
            ...downloadTimelineEvidence('selfTestJson', download),
          },
        };
      },
    );
    const selfTestDownload = selfTestResult.download;
    const selfTest = selfTestResult.record;

    await recordAction(timeline, marker, 'upload', async () => {
      const fileInput = await page.$('[data-testid="thermal-file-input"]');
      if (!fileInput) fail('UI_CONTRACT_MISSING', 'Golden upload input is missing.');
      await fileInput.uploadFile(lockedInputs.goldenPath);
      await fileInput.dispose();

      await setInputValue(page, '[data-testid="project-name"]', 'Platform golden');
      await setInputValue(
        page,
        '[data-testid="process-name"]',
        'multi-rate thermal decomposition',
      );
      await setInputValue(
        page,
        '[data-testid="stage-label"]',
        'supplied-alpha 0.10-0.90 window',
      );
      await waitForEnabled(page, '[data-testid="run-analysis"]');
      const uploadState = await page.evaluate(() => {
        const input = document.querySelector('[data-testid="thermal-file-input"]');
        const runButton = document.querySelector('[data-testid="run-analysis"]');
        return {
          fileCount: input instanceof HTMLInputElement ? input.files?.length ?? 0 : 0,
          fileName:
            input instanceof HTMLInputElement && input.files?.[0]
              ? input.files[0].name
              : '',
          runAnalysisEnabled:
            runButton instanceof HTMLButtonElement && runButton.disabled === false,
        };
      });
      if (
        uploadState.fileCount !== 1 ||
        uploadState.fileName !== path.basename(lockedInputs.goldenPath) ||
        uploadState.runAnalysisEnabled !== true
      ) {
        fail('UI_UPLOAD_CONTRACT_FAILED', 'The golden upload DOM contract was not retained.');
      }
      return { value: uploadState, evidence: uploadState };
    });

    const visibleState = await recordAction(timeline, marker, 'analysis', async () => {
      await page.click('[data-testid="run-analysis"]');
      await page.waitForSelector('[data-testid="numeric-results"]', {
        visible: true,
        timeout: DEFAULT_TIMEOUT_MS,
      });
      const state = await page.evaluate((methods) => {
        const rows = [
          ...document.querySelectorAll(
            '[data-testid="numeric-results"] tbody tr[data-method][data-result-type="isoconversional"]',
          ),
        ];
        const pageText = document.body.innerText;
        return {
          refused: document.querySelector('[data-testid="analysis-refused-state"]') !== null,
          totalRows: rows.length,
          methodCounts: Object.fromEntries(
            methods.map((method) => [
              method,
              rows.filter((row) => row.getAttribute('data-method') === method).length,
            ]),
          ),
          commonAlphaRangeVisible: pageText.includes('0.10–0.90'),
        };
      }, REQUIRED_METHODS);
      if (
        state.refused ||
        state.totalRows !== 36 ||
        REQUIRED_METHODS.some((method) => state.methodCounts[method] !== 9) ||
        state.commonAlphaRangeVisible !== true
      ) {
        fail(
          'VISIBLE_RESULT_CONTRACT_FAILED',
          'Visible final state does not show 36 rows, four methods, and the common alpha range.',
          state,
        );
      }
      return { value: state, evidence: state };
    });

    const reportJsonDownload = await recordAction(
      timeline,
      marker,
      'json-export',
      async () => {
        const download = await downloadThroughButton(
          page,
          '[data-testid="export-json"]',
          reportJsonPath,
          downloadTracker,
          marker,
        );
        return {
          value: download,
          evidence: downloadTimelineEvidence('reportJson', download),
        };
      },
    );
    const reportCsvDownload = await recordAction(
      timeline,
      marker,
      'csv-export',
      async () => {
        const download = await downloadThroughButton(
          page,
          '[data-testid="export-csv"]',
          reportCsvPath,
          downloadTracker,
          marker,
        );
        return {
          value: download,
          evidence: downloadTimelineEvidence('reportCsv', download),
        };
      },
    );
    const reportPdfDownload = await recordAction(
      timeline,
      marker,
      'pdf-export',
      async () => {
        const download = await downloadThroughButton(
          page,
          '[data-testid="export-pdf"]',
          reportPdfPath,
          downloadTracker,
          marker,
        );
        return {
          value: download,
          evidence: downloadTimelineEvidence('reportPdf', download),
        };
      },
    );
    const goldenMetadata = await stat(lockedInputs.goldenPath);
    const report = validateScientificReport(
      await readFile(reportJsonPath),
      lockedInputs.goldenSha256,
      goldenMetadata.size,
    );
    validateCsvAndPdf(
      await readFile(reportCsvPath),
      await readFile(reportPdfPath),
      report,
    );

    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await page.waitForFunction(() => window.scrollX === 0 && window.scrollY === 0, {
      timeout: DEFAULT_TIMEOUT_MS,
    });
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
      type: 'png',
    });
    const screenshotMetadata = await stat(screenshotPath);
    if (screenshotMetadata.size < 1024) {
      fail('SCREENSHOT_INVALID', 'Final-state screenshot is unexpectedly small.');
    }

    const browserVersion = lastBrowserVersion;
    const chromeIdentity = lastChromeIdentity;
    if (!browserVersion || !chromeIdentity) {
      fail(
        'GOOGLE_CHROME_IDENTITY_MISSING',
        'The validated Google Chrome identity was not retained.',
      );
    }
    await targetCapture.settle();
    timeline.captureEndedAt = marker();
    const normalizedDownloads = validateExpectedDownloadSet(
      Object.fromEntries(
        Object.entries({
          selfTestJson: selfTestDownload,
          reportJson: reportJsonDownload,
          reportCsv: reportCsvDownload,
          reportPdf: reportPdfDownload,
        }).map(([role, download]) => [
          role,
          {
            ...download,
            path: path
              .relative(options.outputDirectory, download.path)
              .split(path.sep)
              .join('/'),
          },
        ]),
      ),
    );
    const validatedTimeline = validateActionTimeline(timeline, normalizedDownloads);
    const validatedTargetLedger = validateTargetLedger(targetCapture.ledger);
    completed = {
      pageTitle: await page.title(),
      runtime: initialRuntime,
      browserVersion,
      chromeIdentity,
      downloads: normalizedDownloads,
      timeline: validatedTimeline,
      targetLedger: validatedTargetLedger,
      downloadProtocolLedger: downloadTracker.snapshot(),
      cdpEvents: [...cdpEvents],
      selfTest,
      reportGeneratedAt: report.generatedAt,
    };
  } catch (error) {
    if (!timeline.captureEndedAt) timeline.captureEndedAt = marker();
    const browserRunPartial = {
      browser: {
        executable: browserExecutable,
        launched: Boolean(browser),
        version: lastBrowserVersion,
      },
      runtime: lastRuntime,
      capture: {
        captureStartedAt: timeline.captureStartedAt,
        captureEndedAt: timeline.captureEndedAt,
        actions: timeline.actions,
        cdpEventCount: cdpEvents.length,
        downloadProtocolLedger: downloadTracker?.snapshot() ?? null,
      },
      targetLedger: summarizeTargetLedger(targetCapture?.ledger),
    };
    if (
      error !== null &&
      (typeof error === 'object' || typeof error === 'function')
    ) {
      error.browserRunPartial = browserRunPartial;
      if (profile.kind === 'hosted') error.hostedPartial = browserRunPartial;
    } else {
      const wrapped = new HostedPlatformValidationError(
        'UNCLASSIFIED_ERROR',
        String(error),
      );
      wrapped.browserRunPartial = browserRunPartial;
      if (profile.kind === 'hosted') wrapped.hostedPartial = browserRunPartial;
      throw wrapped;
    }
    throw error;
  } finally {
    if (!timeline.captureEndedAt) timeline.captureEndedAt = marker();
    const retainedEvents = completed?.cdpEvents ?? [...cdpEvents];
    const retainedTargetLedger =
      completed?.targetLedger ??
      (targetCapture
        ? JSON.parse(JSON.stringify(targetCapture.ledger))
        : null);
    const retainedDownloads =
      completed?.downloads ??
      (downloadTracker
        ? JSON.parse(JSON.stringify(downloadTracker.snapshot()))
        : null);
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Failure diagnostics and captured events are still retained below.
      }
    }
    await writeJson(rawEventsPath, {
      schema: 'activation-energy-studio/raw-cdp-network-events/v2',
      claimStatus: completed ? profile.claimStatus : profile.failureStatus,
      captureStartedAt: timeline.captureStartedAt,
      captureEndedAt: timeline.captureEndedAt,
      timeline: timeline.actions,
      targetLedger: retainedTargetLedger,
      downloads: retainedDownloads,
      events: retainedEvents,
    });
  }

  if (!completed) {
    fail('BROWSER_RUN_INCOMPLETE', 'The browser run did not reach the retained completion state.');
  }
  const endedAt = new Date().toISOString();
  const downloads = completed.downloads;
  const converted = cdpEventsToHar(completed.cdpEvents, {
    allowExternalForDiagnostics: true,
    pageId: 'activation-energy-studio',
    pageTitle: completed.pageTitle,
    creatorName: profile.harCreatorName,
    creatorVersion: '0.2.0',
    capture: {
      timeline: completed.timeline,
      targetLedger: completed.targetLedger,
      downloads,
    },
  });
  await writeJson(harPath, converted.har);
  const networkInspection = assertOfflineHar(converted.har);
  const product = String(completed.browserVersion.product ?? '');
  const chromeIdentity = completed.chromeIdentity;

  const artifacts = validateExpectedArtifactSet({
    release: await descriptor(lockedInputs.releasePath, options.outputDirectory),
    goldenInput: await descriptor(lockedInputs.goldenPath, options.outputDirectory),
    selfTestJson: await descriptor(selfTestPath, options.outputDirectory),
    reportJson: await descriptor(reportJsonPath, options.outputDirectory),
    reportCsv: await descriptor(reportCsvPath, options.outputDirectory),
    reportPdf: await descriptor(reportPdfPath, options.outputDirectory),
    networkHar: await descriptor(harPath, options.outputDirectory),
    screenshot: await descriptor(screenshotPath, options.outputDirectory),
  });
  const browserVersion = chromeIdentity.version;
  const browserName = 'Google Chrome (headless)';
  let draftManifestPath = null;
  if (profile.createDraftManifest) {
    const draftManifest = createDraftPlatformManifest({
      runner: identity.runner,
      runId:
        `gha-${options.family}-${provenance.runId}-${provenance.runAttempt}`,
      startedAt,
      endedAt,
      osBuild: identity.osBuild,
      browser: {
        name: browserName,
        version: browserVersion,
        engine: `Chromium ${browserVersion}; V8 ${completed.browserVersion.jsVersion}`,
      },
      runtime: {
        documentProtocol: completed.runtime.documentProtocol,
        onlineStateDuringRun: completed.runtime.onlineStateDuringRun,
        userAgent: completed.runtime.userAgent,
        javascriptEngine: `V8 ${completed.browserVersion.jsVersion}`,
      },
      locale: {
        osLocale: identity.osLocale,
        navigatorLanguage: completed.runtime.navigatorLanguage,
        navigatorLanguages: completed.runtime.navigatorLanguages,
        timeZone: completed.runtime.timeZone,
        decimalSeparator: completed.runtime.decimalSeparator,
      },
      artifacts,
      har: converted.har,
    });
    draftManifestPath = path.resolve(
      options.outputDirectory,
      `platform-run-input.${options.family}.draft.json`,
    );
    await writeJson(draftManifestPath, draftManifest);
  }

  const metadata = {
    schema: profile.metadataSchema,
    claimStatus: profile.claimStatus,
    humanReviewCompleted: false,
    operatorConfirmationsCompleted: false,
    family: options.family,
    runner: identity.runner,
    osBuild: identity.osBuild,
    osLocale: identity.osLocale,
    reportedArchitecture: identity.reportedArchitecture,
    nodeArchitecture: identity.nodeArchitecture,
    provenance,
    ...(profile.kind === 'hosted'
      ? {
          workflowPreflight: await descriptor(
            path.resolve(
              options.outputDirectory,
              HOSTED_WORKFLOW_PREFLIGHT_NAME,
            ),
            options.outputDirectory,
            { includeBytes: true },
          ),
        }
      : {}),
    browser: {
      executable: browserExecutable,
      product: completed.browserVersion.product,
      version: chromeIdentity.version,
      observedMajor: chromeIdentity.major,
      expectedMajor:
        profile.kind === 'hosted'
          ? provenance.browserExpectation.expectedMajor
          : null,
      revision: completed.browserVersion.revision,
      protocolVersion: completed.browserVersion.protocolVersion,
      javascriptVersion: completed.browserVersion.jsVersion,
      userAgent: completed.browserVersion.userAgent,
      headless: true,
    },
    runtime: completed.runtime,
    startedAt,
    endedAt,
    reportGeneratedAt: completed.reportGeneratedAt,
    downloads,
    actionTimeline: completed.timeline,
    targetLedger: completed.targetLedger,
    downloadProtocolLedger: completed.downloadProtocolLedger,
    artifacts,
    networkInspection,
    retainedFiles: {
      rawCdpEvents: path.basename(rawEventsPath),
      ...(draftManifestPath
        ? { draftManifest: path.basename(draftManifestPath) }
        : {}),
    },
    platformCriteriaClosed: [],
    claimBoundary:
      profile.kind === 'hosted'
        ? 'Automated hosted evidence awaits human review and does not close a platform criterion by itself.'
        : 'Direct local macOS automation only: not a human-observed platform record, not Windows or Ubuntu evidence, and not recorder-compatible platform PASS input.',
    nextRequiredAction: profile.nextRequiredAction,
  };
  await writeJson(
    path.resolve(options.outputDirectory, profile.metadataFileName),
    metadata,
  );
  return metadata;
}

const LOCAL_DIAGNOSTIC_FILE_ROLES = Object.freeze({
  [RELEASE_NAME]: 'locked_release_html',
  [GOLDEN_NAME]: 'locked_platform_golden_input',
  'raw-cdp-events.json': 'raw_cdp_network_events',
  'network.har': 'offline_network_capture',
  'final-state.png': 'final_state_screenshot',
  [SELF_TEST_DOWNLOAD_NAME]: 'platform_self_test_json',
  [REPORT_DOWNLOAD_NAMES.reportJson]: 'scientific_report_json',
  [REPORT_DOWNLOAD_NAMES.reportCsv]: 'scientific_report_csv',
  [REPORT_DOWNLOAD_NAMES.reportPdf]: 'scientific_report_pdf',
  [LOCAL_MACOS_EXECUTION_PROFILE.metadataFileName]:
    'local_diagnostic_metadata',
});

async function writeLocalDiagnosticIntegrityManifest(
  outputDirectory,
  metadata,
) {
  const names = (await readdir(outputDirectory)).sort();
  const forbidden = names.filter(
    (name) =>
      /^platform-run-input\..+\.draft\.json$/u.test(name) ||
      name === HOSTED_EXECUTION_PROFILE.metadataFileName,
  );
  if (forbidden.length > 0) {
    fail(
      'LOCAL_DIAGNOSTIC_HOSTED_ARTIFACT_FORBIDDEN',
      `Local output contains hosted-only artifacts: ${forbidden.join(', ')}.`,
    );
  }
  const requiredNames = Object.keys(LOCAL_DIAGNOSTIC_FILE_ROLES).sort();
  if (
    names.length !== requiredNames.length ||
    names.some((name, index) => name !== requiredNames[index])
  ) {
    fail(
      'LOCAL_DIAGNOSTIC_ARTIFACT_SET_INVALID',
      `Expected exactly ${requiredNames.join(', ')}; observed ${names.join(', ')}.`,
    );
  }
  const files = [];
  for (const name of names) {
    const filePath = path.resolve(outputDirectory, name);
    const fileMetadata = await stat(filePath);
    if (!fileMetadata.isFile() || fileMetadata.size <= 0) {
      fail(
        'LOCAL_DIAGNOSTIC_ARTIFACT_INVALID',
        `Local diagnostic artifact is missing, empty, or not a file: ${name}.`,
      );
    }
    files.push({
      path: name,
      role: LOCAL_DIAGNOSTIC_FILE_ROLES[name],
      bytes: fileMetadata.size,
      sha256: await sha256File(filePath),
    });
  }
  const manifest = {
    schema:
      'activation-energy-studio/local-macos-diagnostic-integrity-manifest/v1',
    claimStatus: LOCAL_MACOS_DIAGNOSTIC_STATUS,
    generatedAt: metadata.endedAt,
    integrityAlgorithm: 'SHA-256',
    evidenceClass: 'local-automated-diagnostic',
    platformCriteriaClosed: [],
    claimBoundary: metadata.claimBoundary,
    fileCount: files.length,
    files,
  };
  await writeJson(
    path.resolve(outputDirectory, LOCAL_MACOS_DIAGNOSTIC_MANIFEST_NAME),
    manifest,
  );
  return manifest;
}

export async function verifyLocalMacOSDiagnosticBundle(outputDirectory) {
  const resolvedOutput = path.resolve(outputDirectory);
  const manifestPath = path.resolve(
    resolvedOutput,
    LOCAL_MACOS_DIAGNOSTIC_MANIFEST_NAME,
  );
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    fail(
      'LOCAL_DIAGNOSTIC_MANIFEST_INVALID',
      `Cannot read the local diagnostic integrity manifest: ${error?.message ?? String(error)}.`,
    );
  }
  if (
    manifest.schema !==
      'activation-energy-studio/local-macos-diagnostic-integrity-manifest/v1' ||
    manifest.claimStatus !== LOCAL_MACOS_DIAGNOSTIC_STATUS ||
    manifest.evidenceClass !== 'local-automated-diagnostic' ||
    !Array.isArray(manifest.platformCriteriaClosed) ||
    manifest.platformCriteriaClosed.length !== 0
  ) {
    fail(
      'LOCAL_DIAGNOSTIC_MANIFEST_INVALID',
      'The local diagnostic integrity manifest has an invalid schema or claim boundary.',
    );
  }
  const actualNames = (await readdir(resolvedOutput)).sort();
  const expectedNames = [
    ...Object.keys(LOCAL_DIAGNOSTIC_FILE_ROLES),
    LOCAL_MACOS_DIAGNOSTIC_MANIFEST_NAME,
  ].sort();
  if (
    actualNames.length !== expectedNames.length ||
    actualNames.some((name, index) => name !== expectedNames[index])
  ) {
    fail(
      'LOCAL_DIAGNOSTIC_ARTIFACT_SET_INVALID',
      'The retained local diagnostic directory does not match the locked artifact set.',
    );
  }
  if (
    !Array.isArray(manifest.files) ||
    manifest.fileCount !== expectedNames.length - 1 ||
    manifest.files.length !== expectedNames.length - 1
  ) {
    fail(
      'LOCAL_DIAGNOSTIC_MANIFEST_INVALID',
      'The local diagnostic integrity manifest has an invalid file count.',
    );
  }
  const seen = new Set();
  const manifestEntries = new Map();
  for (const entry of manifest.files) {
    if (
      !entry ||
      typeof entry.path !== 'string' ||
      entry.role !== LOCAL_DIAGNOSTIC_FILE_ROLES[entry.path] ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes <= 0 ||
      !/^[a-f0-9]{64}$/u.test(entry.sha256) ||
      seen.has(entry.path)
    ) {
      fail(
        'LOCAL_DIAGNOSTIC_MANIFEST_INVALID',
        'The local diagnostic integrity manifest contains an invalid or duplicate entry.',
      );
    }
    seen.add(entry.path);
    manifestEntries.set(entry.path, entry);
    const filePath = path.resolve(resolvedOutput, entry.path);
    const relative = path.relative(resolvedOutput, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      fail(
        'LOCAL_DIAGNOSTIC_MANIFEST_INVALID',
        `Unsafe diagnostic artifact path: ${entry.path}.`,
      );
    }
    const fileMetadata = await stat(filePath);
    if (
      !fileMetadata.isFile() ||
      fileMetadata.size !== entry.bytes ||
      (await sha256File(filePath)) !== entry.sha256
    ) {
      fail(
        'LOCAL_DIAGNOSTIC_HASH_MISMATCH',
        `Retained local diagnostic artifact does not match its manifest: ${entry.path}.`,
      );
    }
  }
  if (
    seen.size !== Object.keys(LOCAL_DIAGNOSTIC_FILE_ROLES).length ||
    Object.keys(LOCAL_DIAGNOSTIC_FILE_ROLES).some((name) => !seen.has(name))
  ) {
    fail(
      'LOCAL_DIAGNOSTIC_MANIFEST_INVALID',
      'The local diagnostic integrity manifest omits a required artifact.',
    );
  }
  const currentChecksums = parseChecksumIndex(
    await readFile(CHECKSUM_SOURCE, 'utf8'),
  );
  for (const lockedName of [RELEASE_NAME, GOLDEN_NAME]) {
    const currentChecksum = currentChecksums.get(lockedName);
    if (
      !currentChecksum ||
      manifestEntries.get(lockedName)?.sha256 !== currentChecksum ||
      (await sha256File(
        lockedName === RELEASE_NAME ? RELEASE_SOURCE : GOLDEN_SOURCE,
      )) !== currentChecksum
    ) {
      fail(
        'LOCAL_DIAGNOSTIC_LOCKED_INPUT_STALE',
        `The retained local diagnostic is not locked to the current ${lockedName}.`,
      );
    }
  }
  const metadata = JSON.parse(
    await readFile(
      path.resolve(
        resolvedOutput,
        LOCAL_MACOS_EXECUTION_PROFILE.metadataFileName,
      ),
      'utf8',
    ),
  );
  if (
    metadata.schema !== LOCAL_MACOS_EXECUTION_PROFILE.metadataSchema ||
    metadata.claimStatus !== LOCAL_MACOS_DIAGNOSTIC_STATUS ||
    metadata.humanReviewCompleted !== false ||
    metadata.operatorConfirmationsCompleted !== false ||
    !Array.isArray(metadata.platformCriteriaClosed) ||
    metadata.platformCriteriaClosed.length !== 0 ||
    metadata.provenance?.executionEnvironment !== 'LOCAL_DIRECT_MACOS_HOST' ||
    metadata.provenance?.githubActions !== false ||
    'draftManifest' in (metadata.retainedFiles ?? {})
  ) {
    fail(
      'LOCAL_DIAGNOSTIC_METADATA_INVALID',
      'The retained local diagnostic metadata violates the local-only claim contract.',
    );
  }
  const expectedValidationSources = [
    {
      path: 'scripts/run-hosted-platform-validation.mjs',
      sha256: await sha256File(SCRIPT_PATH),
    },
    {
      path: 'scripts/platform-hosted-ci.mjs',
      sha256: await sha256File(HOSTED_CONTRACT_SOURCE),
    },
    {
      path: 'scripts/run-local-macos-platform-diagnostic.mjs',
      sha256: await sha256File(LOCAL_MACOS_CLI_SOURCE),
    },
  ];
  if (
    !Array.isArray(metadata.provenance.validationSources) ||
    metadata.provenance.validationSources.length !==
      expectedValidationSources.length ||
    expectedValidationSources.some(
      (expected, index) =>
        metadata.provenance.validationSources[index]?.path !== expected.path ||
        metadata.provenance.validationSources[index]?.sha256 !==
          expected.sha256,
    )
  ) {
    fail(
      'LOCAL_DIAGNOSTIC_HARNESS_STALE',
      'The retained local diagnostic was not produced by the current local browser harness contract.',
    );
  }
  const metadataArtifactFiles = Object.freeze({
    release: RELEASE_NAME,
    goldenInput: GOLDEN_NAME,
    selfTestJson: SELF_TEST_DOWNLOAD_NAME,
    reportJson: REPORT_DOWNLOAD_NAMES.reportJson,
    reportCsv: REPORT_DOWNLOAD_NAMES.reportCsv,
    reportPdf: REPORT_DOWNLOAD_NAMES.reportPdf,
    networkHar: 'network.har',
    screenshot: 'final-state.png',
  });
  for (const [role, fileName] of Object.entries(metadataArtifactFiles)) {
    const descriptor = metadata.artifacts?.[role];
    if (
      descriptor?.path !== fileName ||
      descriptor?.sha256 !== manifestEntries.get(fileName)?.sha256
    ) {
      fail(
        'LOCAL_DIAGNOSTIC_METADATA_INVALID',
        `Metadata artifact ${role} does not match the integrity manifest.`,
      );
    }
  }
  return Object.freeze({
    claimStatus: manifest.claimStatus,
    fileCount: manifest.fileCount,
    manifestSha256: await sha256File(manifestPath),
  });
}

export async function runLocalMacOSDiagnostic({
  outputDirectory,
  browserExecutable = null,
  environment = process.env,
} = {}) {
  if (typeof outputDirectory !== 'string' || outputDirectory.trim() === '') {
    fail(
      'ARGUMENT_REQUIRED',
      'A non-empty outputDirectory is required for the local macOS diagnostic.',
    );
  }
  const environmentIdentity = assertLocalMacOSDiagnosticEnvironment({
    environment,
  });
  const options = Object.freeze({
    family: 'macos',
    runnerLabel: 'local-macos-direct',
    outputDirectory: path.resolve(outputDirectory),
    browserExecutable: browserExecutable
      ? path.resolve(browserExecutable)
      : null,
  });
  const provenance = Object.freeze({
    schema: 'activation-energy-studio/local-macos-direct-provenance/v1',
    ...environmentIdentity,
    processPlatform: process.platform,
    nodeVersion: process.version,
    nodeArchitecture: process.arch,
    validationSources: Object.freeze([
      Object.freeze({
        path: 'scripts/run-hosted-platform-validation.mjs',
        sha256: await sha256File(SCRIPT_PATH),
      }),
      Object.freeze({
        path: 'scripts/platform-hosted-ci.mjs',
        sha256: await sha256File(HOSTED_CONTRACT_SOURCE),
      }),
      Object.freeze({
        path: 'scripts/run-local-macos-platform-diagnostic.mjs',
        sha256: await sha256File(LOCAL_MACOS_CLI_SOURCE),
      }),
    ]),
  });
  await ensureEmptyOutputDirectory(options.outputDirectory);
  let identity = null;
  try {
    const lockedInputs = await verifyAndCopyLockedInputs(
      options.outputDirectory,
    );
    identity = collectLocalMacOSIdentity();
    const metadata = await executeAutomatedBrowserRun(
      options,
      provenance,
      identity,
      lockedInputs,
      LOCAL_MACOS_EXECUTION_PROFILE,
    );
    const manifest = await writeLocalDiagnosticIntegrityManifest(
      options.outputDirectory,
      metadata,
    );
    await verifyLocalMacOSDiagnosticBundle(options.outputDirectory);
    return Object.freeze({ metadata, manifest });
  } catch (error) {
    const failure = createLocalMacOSFailureRecord({
      provenance,
      identity,
      error,
    });
    await writeJson(
      path.resolve(options.outputDirectory, 'local-macos-diagnostic-failure.json'),
      failure,
    );
    throw error;
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options) return;

  const provenance = assertHostedActionsEnvironment();
  await ensureEmptyOutputDirectory(options.outputDirectory, {
    allowedExistingFiles: [HOSTED_WORKFLOW_PREFLIGHT_NAME],
  });
  let identity = null;
  try {
    await readHostedWorkflowPreflight(options.outputDirectory, options);
    const lockedInputs = await verifyAndCopyLockedInputs(options.outputDirectory);
    identity = collectRunnerIdentity(
      options.family,
      options.runnerLabel,
      options.nodeArchitecture,
    );
    const metadata = await executeAutomatedBrowserRun(
      options,
      provenance,
      identity,
      lockedInputs,
      HOSTED_EXECUTION_PROFILE,
    );
    process.stdout.write(
      `TECHNICAL_OK ${metadata.claimStatus} family=${options.family} runner=${options.runnerLabel}\n`,
    );
  } catch (error) {
    const failure = createHostedFailureRecord({
      options,
      provenance,
      identity,
      error,
    });
    await writeJson(
      path.resolve(options.outputDirectory, 'hosted-run-failure.json'),
      failure,
    );
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(
      `FAIL ${error?.code ?? 'UNCLASSIFIED_ERROR'} ${error?.message ?? String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
