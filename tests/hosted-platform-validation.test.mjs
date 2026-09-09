import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const CONTRACT_VERSION = process.env.AES_PLATFORM_VALIDATION_VERSION ?? '0.2.0';
const PLATFORM_CONTRACT_MODULE = CONTRACT_VERSION === '0.3.2'
  ? '../scripts/platform-hosted-ci-v032.mjs'
  : '../scripts/platform-hosted-ci.mjs';
const HOSTED_HARNESS_MODULE = CONTRACT_VERSION === '0.3.2'
  ? '../scripts/run-hosted-platform-validation-core-v032.mjs'
  : '../scripts/run-hosted-platform-validation.mjs';

const {
  EXTERNAL_PROTOCOLS_BLOCKED,
  EXTERNAL_URL_BLOCK_PATTERNS,
  EXPECTED_ARTIFACT_ROLES,
  HOSTED_RUNNER_MATRIX,
  HUMAN_OBSERVER_PLACEHOLDER,
  OPERATOR_CONFIRMATION_KEYS,
  REQUIRED_ACTION_TIMELINE,
  REQUIRED_NETWORK_COVERAGE,
  HostedPlatformValidationError,
  assertHostedRunnerIdentity,
  assertOfflineHar,
  cdpEventsToHar,
  classifyNetworkUrl,
  createDraftPlatformManifest,
  inspectHarNetwork,
  validateActionTimeline,
  validateExpectedArtifactSet,
  validateExpectedDownloadSet,
  validateHarCaptureMetadata,
  validateTargetLedger,
} = await import(PLATFORM_CONTRACT_MODULE);
const {
  HOSTED_ACTION_COMMITS,
  HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR,
  HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR_ENVIRONMENT,
  assertGoogleChromeProduct,
  assertHostedActionsEnvironment,
  assertHostedGoogleChromeExecutablePath,
  configureCapturedTargetSession,
  createHostedFailureRecord,
  discoverGoogleChromeExecutable,
  googleChromeExecutableCandidates,
} = await import(HOSTED_HARNESS_MODULE);
import {
  HOSTED_WORKFLOW_PREFLIGHT_NAME,
  HOSTED_WORKFLOW_PREFLIGHT_NODE_ARCHITECTURE_SCOPE,
  HOSTED_WORKFLOW_PREFLIGHT_STATUS,
  createHostedWorkflowPreflight,
  validateHostedWorkflowPreflight,
  writeHostedWorkflowPreflight,
} from '../scripts/write-hosted-workflow-preflight.mjs';

const TEST_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(TEST_PATH), '..');
const CONTRACT_WORKFLOW_NAME = CONTRACT_VERSION === '0.3.2'
  ? 'Hosted Platform Validation v0.3.2'
  : 'Hosted Platform Validation';
const CONTRACT_WORKFLOW_RELATIVE_PATH = CONTRACT_VERSION === '0.3.2'
  ? '.github/workflows/platform-validation-v032.yml'
  : '.github/workflows/platform-validation.yml';
const HARNESS_PATH = path.resolve(
  PROJECT_ROOT,
  CONTRACT_VERSION === '0.3.2'
    ? 'scripts/run-hosted-platform-validation-core-v032.mjs'
    : 'scripts/run-hosted-platform-validation.mjs',
);
const WORKFLOW_PATH = path.resolve(
  PROJECT_ROOT,
  CONTRACT_WORKFLOW_RELATIVE_PATH,
);

function unquoteYamlScalar(value) {
  const normalized = String(value ?? '')
    .replace(/\s+#.*$/u, '')
    .trim();
  if (
    normalized.length >= 2 &&
    ((normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'")))
  ) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

function parseRootWorkflowEnvironment(workflow) {
  const lines = workflow.split(/\r?\n/u);
  const start = lines.findIndex((line) => line === 'env:');
  assert.ok(start >= 0, 'Root workflow env block is missing.');
  const environment = {};
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;
    if (!line.startsWith('  ')) break;
    const match = /^  ([A-Z0-9_]+):\s*(.+)$/u.exec(line);
    if (match) environment[match[1]] = unquoteYamlScalar(match[2]);
  }
  return environment;
}

function parseWorkflowMatrixInclude(workflow) {
  const lines = workflow.split(/\r?\n/u);
  const start = lines.findIndex((line) => line === '        include:');
  assert.ok(start >= 0, 'Matrix include block is missing.');
  const entries = [];
  let current = null;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;
    if (!line.startsWith('          ')) break;
    const first = /^          - ([a-z_]+):\s*(.+)$/u.exec(line);
    if (first) {
      current = { [first[1]]: unquoteYamlScalar(first[2]) };
      entries.push(current);
      continue;
    }
    const nested = /^            ([a-z_]+):\s*(.+)$/u.exec(line);
    if (nested && current) {
      current[nested[1]] = unquoteYamlScalar(nested[2]);
    }
  }
  return entries;
}

function parseWorkflowSteps(workflow) {
  const steps = new Map();
  let current = null;
  let subsection = null;
  for (const line of workflow.split(/\r?\n/u)) {
    const stepRecord = /^      -(?:\s+(.*))?$/u.exec(line);
    if (stepRecord) {
      const nameMatch = /^name:\s*(.+)$/u.exec(stepRecord[1] ?? '');
      assert.ok(
        nameMatch,
        `Every workflow step must start with an explicit "- name:" record; observed "${line.trim()}".`,
      );
      const name = unquoteYamlScalar(nameMatch[1]);
      assert.equal(steps.has(name), false, `Duplicate workflow step: ${name}`);
      current = { name };
      steps.set(name, current);
      subsection = null;
      continue;
    }
    if (!current) continue;
    const fieldMatch =
      /^        ([a-z][a-z0-9-]*):(?:\s*(.*))?$/u.exec(line);
    if (fieldMatch) {
      const [, key, rawValue = ''] = fieldMatch;
      assert.equal(
        Object.hasOwn(current, key),
        false,
        `Duplicate top-level key "${key}" in workflow step "${current.name}".`,
      );
      if (rawValue.trim() === '' && ['env', 'with'].includes(key)) {
        current[key] = {};
        subsection = key;
      } else {
        current[key] = unquoteYamlScalar(rawValue);
        subsection = null;
      }
      continue;
    }
    const nestedMatch =
      /^          ([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/u.exec(line);
    if (nestedMatch) {
      assert.ok(
        subsection,
        `Nested key "${nestedMatch[1]}" has no env/with owner in workflow step "${current.name}".`,
      );
      assert.equal(
        Object.hasOwn(current[subsection], nestedMatch[1]),
        false,
        `Duplicate ${subsection} key "${nestedMatch[1]}" in workflow step "${current.name}".`,
      );
      current[subsection][nestedMatch[1]] = unquoteYamlScalar(
        nestedMatch[2],
      );
    }
  }
  return steps;
}

const WORKFLOW_STEP_SHAPES = Object.freeze([
  Object.freeze({
    name: 'Check out the locked source',
    keys: Object.freeze(['name', 'uses', 'with']),
    nested: Object.freeze({
      with: Object.freeze(['persist-credentials']),
    }),
  }),
  Object.freeze({
    name: 'Initialize retained pre-browser diagnostics',
    keys: Object.freeze(['name', 'run']),
    nested: Object.freeze({}),
  }),
  Object.freeze({
    name: 'Set up Node.js 22.22.3',
    keys: Object.freeze(['name', 'uses', 'with']),
    nested: Object.freeze({
      with: Object.freeze(['architecture', 'cache', 'node-version']),
    }),
  }),
  Object.freeze({
    name: 'Install locked dependencies',
    keys: Object.freeze(['name', 'run']),
    nested: Object.freeze({}),
  }),
  Object.freeze({
    name: 'Verify the independent Paper 010 Decimal oracle',
    keys: Object.freeze(['name', 'run']),
    nested: Object.freeze({}),
  }),
  Object.freeze({
    name: 'Verify the independent Oak Decimal oracle',
    keys: Object.freeze(['name', 'run']),
    nested: Object.freeze({}),
  }),
  Object.freeze({
    name: 'Verify the independent Dryad Polyisoprene Decimal oracle',
    keys: Object.freeze(['name', 'run']),
    nested: Object.freeze({}),
  }),
  Object.freeze({
    name: 'Verify the independent NR-CELS Decimal oracle and evidence',
    keys: Object.freeze(['name', 'run']),
    nested: Object.freeze({}),
  }),
  Object.freeze({
    name: 'Verify the independent Coal-SPT-Paraffin Decimal oracle',
    keys: Object.freeze(['name', 'run']),
    nested: Object.freeze({}),
  }),
  Object.freeze({
    name: 'Run TypeScript typecheck',
    keys: Object.freeze(['name', 'run']),
    nested: Object.freeze({}),
  }),
  Object.freeze({
    name: 'Run complete Vitest suite including all real-data lanes',
    keys: Object.freeze(['name', 'run']),
    nested: Object.freeze({}),
  }),
  Object.freeze({
    name: 'Run dedicated real-data oracle reproducibility suites',
    keys: Object.freeze(['name', 'run']),
    nested: Object.freeze({}),
  }),
  Object.freeze({
    name: 'Verify the recursive fixture manifest',
    keys: Object.freeze(['name', 'run']),
    nested: Object.freeze({}),
  }),
  Object.freeze({
    name: 'Run hosted contracts and the real Chrome Worker boundary probe',
    keys: Object.freeze(['env', 'name', 'run', 'timeout-minutes']),
    nested: Object.freeze({
      env: Object.freeze(['AES_RUN_REAL_CHROME_WORKER_INTEGRATION']),
    }),
  }),
  Object.freeze({
    name: 'Run hosted real-browser platform validation',
    keys: Object.freeze(['name', 'run', 'timeout-minutes']),
    nested: Object.freeze({}),
  }),
  Object.freeze({
    name: 'Upload retained evidence, including failed-run diagnostics',
    keys: Object.freeze(['id', 'if', 'name', 'uses', 'with']),
    nested: Object.freeze({
      with: Object.freeze([
        'if-no-files-found',
        'name',
        'path',
        'retention-days',
      ]),
    }),
  }),
]);

function sortedKeys(value) {
  return Object.keys(value).sort();
}

function assertWorkflowStepShapes(steps) {
  assert.deepEqual(
    [...steps.keys()],
    WORKFLOW_STEP_SHAPES.map(({ name }) => name),
    'Workflow must contain exactly the named hosted-validation steps.',
  );
  for (const shape of WORKFLOW_STEP_SHAPES) {
    const step = steps.get(shape.name);
    assert.deepEqual(
      sortedKeys(step),
      [...shape.keys].sort(),
      `Unexpected top-level key in workflow step "${shape.name}".`,
    );
    for (const [section, expectedKeys] of Object.entries(shape.nested)) {
      assert.deepEqual(
        sortedKeys(step[section]),
        [...expectedKeys].sort(),
        `Unexpected ${section} key in workflow step "${shape.name}".`,
      );
    }
  }
}

const HASHES = Object.freeze({
  release: '01'.repeat(32),
  goldenInput: '02'.repeat(32),
  selfTestJson: '03'.repeat(32),
  reportJson: '04'.repeat(32),
  reportCsv: '05'.repeat(32),
  reportPdf: '06'.repeat(32),
  networkHar: '07'.repeat(32),
  screenshot: '08'.repeat(32),
});

const VALID_RUNNERS = Object.freeze({
  macos: {
    runnerLabel: 'macos-15',
    family: 'macos',
    platform: 'darwin',
    architecture: 'ARM64',
    osEdition: 'macOS 15.7.7',
  },
  ubuntu: {
    runnerLabel: 'ubuntu-24.04',
    family: 'ubuntu',
    platform: 'linux',
    architecture: 'X64',
    osEdition: 'Ubuntu 24.04.4 LTS',
  },
  windows11: {
    runnerLabel: 'windows-11-arm',
    family: 'windows11',
    platform: 'Windows',
    architecture: 'ARM64',
    osEdition: 'Microsoft Windows 11 Enterprise',
  },
});

const BASE_TIME_MS = Date.parse('2026-07-27T08:00:00.000Z');
const PAGE_IDENTITY = Object.freeze({
  sessionId: 'session-page',
  targetId: 'target-page',
  targetType: 'page',
});

function marker(monotonicMs) {
  return {
    utc: new Date(BASE_TIME_MS + monotonicMs).toISOString(),
    monotonicMs,
  };
}

function expectCode(code, callback) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof HostedPlatformValidationError);
    assert.equal(error.code, code);
    return true;
  });
}

function retainedEvent(method, params, identity = PAGE_IDENTITY) {
  return { method, params, ...identity };
}

function validCdpEvents(
  url = `file:///tmp/Activation-Energy-Studio-v${CONTRACT_VERSION}.html`,
) {
  return [
    retainedEvent(
      'Network.requestWillBeSent',
      {
        requestId: 'document-1',
        timestamp: 100,
        wallTime: 1_784_000_000,
        type: 'Document',
        request: {
          url,
          method: 'GET',
          headers: { Accept: 'text/html' },
        },
      },
    ),
    retainedEvent(
      'Network.responseReceived',
      {
        requestId: 'document-1',
        timestamp: 100.1,
        response: {
          status: 200,
          statusText: 'OK',
          protocol: 'file',
          headers: { 'Content-Type': 'text/html' },
          mimeType: 'text/html',
          encodedDataLength: 1_024,
        },
      },
    ),
    retainedEvent('Page.domContentEventFired', { timestamp: 100.2 }),
    retainedEvent('Page.loadEventFired', { timestamp: 100.3 }),
    retainedEvent('Network.loadingFinished', {
      requestId: 'document-1',
      timestamp: 100.4,
      encodedDataLength: 1_024,
    }),
  ];
}

function validArtifacts() {
  return {
    release: {
      path: `Activation-Energy-Studio-v${CONTRACT_VERSION}.html`,
      sha256: HASHES.release,
    },
    goldenInput: { path: 'Platform-Golden-synthetic_kas_150.csv', sha256: HASHES.goldenInput },
    selfTestJson: {
      path: `activation-energy-platform-self-test-v${CONTRACT_VERSION}-pass.json`,
      sha256: HASHES.selfTestJson,
    },
    reportJson: { path: 'report.json', sha256: HASHES.reportJson },
    reportCsv: { path: 'report.csv', sha256: HASHES.reportCsv },
    reportPdf: { path: 'report.pdf', sha256: HASHES.reportPdf },
    networkHar: { path: 'network.har', sha256: HASHES.networkHar },
    screenshot: { path: 'result.png', sha256: HASHES.screenshot },
  };
}

function downloadDescriptor(pathname, bytes, sha256, guid, offset) {
  const suggestedFilename = path.basename(pathname);
  return {
    path: pathname,
    complete: true,
    bytes,
    sha256,
    suggestedFilename,
    protocolEvents: {
      willBegin: {
        guid,
        suggestedFilename,
        url: `blob:null/${guid}`,
        observedAt: marker(offset),
      },
      completed: {
        guid,
        state: 'completed',
        receivedBytes: bytes,
        totalBytes: bytes,
        observedAt: marker(offset + 100),
      },
    },
    stableSizeObservations: [
      { bytes, observedAt: marker(offset + 200) },
      { bytes, observedAt: marker(offset + 300) },
    ],
  };
}

function validDownloads() {
  return {
    selfTestJson: downloadDescriptor(
      `downloads/activation-energy-platform-self-test-v${CONTRACT_VERSION}-pass.json`,
      1_000,
      HASHES.selfTestJson,
      'guid-self-test',
      700,
    ),
    reportJson: downloadDescriptor(
      'downloads/golden-analysis.json',
      2_000,
      HASHES.reportJson,
      'guid-json',
      2_400,
    ),
    reportCsv: downloadDescriptor(
      'downloads/golden-analysis-results.csv',
      3_000,
      HASHES.reportCsv,
      'guid-csv',
      3_200,
    ),
    reportPdf: downloadDescriptor(
      'downloads/golden-analysis-report.pdf',
      4_000,
      HASHES.reportPdf,
      'guid-pdf',
      4_000,
    ),
  };
}

function downloadEvidence(role, download) {
  return {
    downloadRole: role,
    guid: download.protocolEvents.willBegin.guid,
    protocolState: 'completed',
    bytes: download.bytes,
    sha256: download.sha256,
  };
}

function validTimeline(downloads = validDownloads()) {
  return {
    captureStartedAt: marker(0),
    captureEndedAt: marker(5_000),
    actions: [
      {
        id: 'page-open',
        before: marker(100),
        after: marker(500),
        verified: true,
        evidence: {
          documentProtocol: 'file:',
          onlineStateDuringRun: false,
          domContract: {
            selectorsPresent: [
              '[data-testid="run-platform-self-test"]',
              '[data-testid="download-platform-self-test"]',
              '[data-testid="thermal-file-input"]',
              '[data-testid="run-analysis"]',
              '[data-testid="numeric-results"]',
              '[data-testid="export-json"]',
              '[data-testid="export-csv"]',
              '[data-testid="export-pdf"]',
            ],
          },
        },
      },
      {
        id: 'self-test',
        before: marker(600),
        after: marker(1_100),
        verified: true,
        evidence: {
          status: 'PASS',
          ...downloadEvidence('selfTestJson', downloads.selfTestJson),
        },
      },
      {
        id: 'upload',
        before: marker(1_200),
        after: marker(1_500),
        verified: true,
        evidence: {
          fileCount: 1,
          fileName: 'Platform-Golden-synthetic_kas_150.csv',
          runAnalysisEnabled: true,
        },
      },
      {
        id: 'analysis',
        before: marker(1_600),
        after: marker(2_200),
        verified: true,
        evidence: {
          refused: false,
          totalRows: 36,
          methodCounts: { FWO: 9, KAS: 9, STARINK: 9, FRIEDMAN: 9 },
          commonAlphaRangeVisible: true,
        },
      },
      {
        id: 'json-export',
        before: marker(2_300),
        after: marker(2_800),
        verified: true,
        evidence: downloadEvidence('reportJson', downloads.reportJson),
      },
      {
        id: 'csv-export',
        before: marker(3_100),
        after: marker(3_600),
        verified: true,
        evidence: downloadEvidence('reportCsv', downloads.reportCsv),
      },
      {
        id: 'pdf-export',
        before: marker(3_900),
        after: marker(4_400),
        verified: true,
        evidence: downloadEvidence('reportPdf', downloads.reportPdf),
      },
    ],
  };
}

function validTargetLedger(extraTargets = []) {
  return {
    autoAttach: {
      autoAttach: true,
      flatten: true,
      waitForDebuggerOnStart: true,
    },
    browserSessionId: 'session-browser',
    mainPageTargetId: PAGE_IDENTITY.targetId,
    mainPageSessionId: PAGE_IDENTITY.sessionId,
    unsupportedTargets: [],
    unobservedDescendantTargets: [],
    discoveredTargets: [
      { targetId: 'target-tab', type: 'tab', url: '', destroyedAt: null },
      {
        targetId: PAGE_IDENTITY.targetId,
        type: 'page',
        url: `file:///tmp/Activation-Energy-Studio-v${CONTRACT_VERSION}.html`,
        destroyedAt: null,
      },
      ...extraTargets.map(({ targetId, type, url }) => ({
        targetId,
        type,
        url,
        destroyedAt: null,
      })),
    ],
    targets: [
      {
        targetId: 'target-tab',
        sessionId: 'session-tab',
        parentSessionId: 'session-browser',
        type: 'tab',
        url: '',
        captureAttached: true,
        paused: true,
        autoAttachConfigured: true,
        networkEnabled: false,
        offlineMechanism: 'not-applicable',
        externalProtocolsBlocked: [],
        blockedUrlPatterns: [],
        pageEventsEnabled: false,
        networkEventCount: 0,
        attachedAt: marker(5),
        pausedAt: marker(6),
        listenersAttachedAt: marker(7),
        networkEnabledAt: null,
        offlineConfiguredAt: null,
        autoAttachConfiguredAt: marker(8),
        configuredAt: marker(9),
        resumedAt: marker(10),
        configurationError: null,
      },
      {
        targetId: PAGE_IDENTITY.targetId,
        sessionId: PAGE_IDENTITY.sessionId,
        parentSessionId: 'session-tab',
        type: 'page',
        url: `file:///tmp/Activation-Energy-Studio-v${CONTRACT_VERSION}.html`,
        captureAttached: true,
        paused: true,
        autoAttachConfigured: true,
        networkEnabled: true,
        offlineMechanism: 'Network.emulateNetworkConditions',
        externalProtocolsBlocked: [...EXTERNAL_PROTOCOLS_BLOCKED],
        blockedUrlPatterns: [],
        pageEventsEnabled: true,
        networkEventCount: 3,
        attachedAt: marker(11),
        pausedAt: marker(12),
        listenersAttachedAt: marker(13),
        networkEnabledAt: marker(14),
        offlineConfiguredAt: marker(15),
        autoAttachConfiguredAt: marker(16),
        configuredAt: marker(17),
        resumedAt: marker(18),
        configurationError: null,
      },
      ...extraTargets,
    ],
  };
}

function validCapture(overrides = {}) {
  const downloads = overrides.downloads ?? validDownloads();
  return {
    downloads,
    timeline: overrides.timeline ?? validTimeline(downloads),
    targetLedger: overrides.targetLedger ?? validTargetLedger(),
  };
}

function convert(events, options = {}) {
  return cdpEventsToHar(events, {
    capture: validCapture(),
    ...options,
  });
}

test('hosted runner matrix is an exact three-label mapping', () => {
  assert.deepEqual(Object.keys(HOSTED_RUNNER_MATRIX), [
    'macos-15',
    'ubuntu-24.04',
    'windows-11-arm',
  ]);
  assert.deepEqual(
    Object.values(HOSTED_RUNNER_MATRIX).map(({ family }) => family),
    ['macos', 'ubuntu', 'windows11'],
  );
});

test('accepts only the exact OS, architecture, platform, and family identities', () => {
  assert.equal(assertHostedRunnerIdentity(VALID_RUNNERS.macos).architecture, 'arm64');
  assert.equal(assertHostedRunnerIdentity(VALID_RUNNERS.ubuntu).architecture, 'x64');
  assert.equal(assertHostedRunnerIdentity(VALID_RUNNERS.windows11).platform, 'win32');
});

test('rejects latest aliases and Windows Server fallback', () => {
  for (const runnerLabel of ['macos-latest', 'ubuntu-latest', 'windows-latest', 'windows-2025']) {
    expectCode('RUNNER_LABEL_UNSUPPORTED', () =>
      assertHostedRunnerIdentity({ ...VALID_RUNNERS.windows11, runnerLabel }),
    );
  }
  expectCode('WINDOWS_SERVER_FALLBACK_FORBIDDEN', () =>
    assertHostedRunnerIdentity({
      ...VALID_RUNNERS.windows11,
      osEdition: 'Microsoft Windows Server 2025 Datacenter',
    }),
  );
});

test('rejects mismatched runner family, platform, architecture, and OS edition', () => {
  expectCode('RUNNER_FAMILY_MISMATCH', () =>
    assertHostedRunnerIdentity({ ...VALID_RUNNERS.ubuntu, family: 'macos' }),
  );
  expectCode('RUNNER_PLATFORM_MISMATCH', () =>
    assertHostedRunnerIdentity({ ...VALID_RUNNERS.ubuntu, platform: 'darwin' }),
  );
  expectCode('RUNNER_ARCHITECTURE_MISMATCH', () =>
    assertHostedRunnerIdentity({ ...VALID_RUNNERS.windows11, architecture: 'x64' }),
  );
  expectCode('RUNNER_OS_EDITION_MISMATCH', () =>
    assertHostedRunnerIdentity({ ...VALID_RUNNERS.macos, osEdition: 'macOS 14.8.7' }),
  );
});

test('classifies remote-origin blobs as external instead of treating every blob as local', () => {
  assert.equal(classifyNetworkUrl('file:///tmp/app.html').kind, 'file');
  assert.equal(classifyNetworkUrl('blob:null/123').kind, 'local');
  assert.equal(classifyNetworkUrl('blob:file:///tmp/123').kind, 'local');
  assert.equal(classifyNetworkUrl('blob:https://example.com/123').kind, 'external');
  assert.equal(classifyNetworkUrl('wss://example.com/socket').kind, 'external');
});

test('converts each actual CDP request into one full HAR 1.2 entry', () => {
  const wrappedEvents = validCdpEvents().map((event) => ({
    message: JSON.stringify({ message: event }),
  }));
  wrappedEvents.splice(3, 0, {
    message: JSON.stringify({
      message: retainedEvent('Network.dataReceived', { requestId: 'document-1' }),
    }),
  });

  const { har, inspection } = convert(wrappedEvents, {
    pageTitle: 'Activation Energy Studio',
    creatorVersion: 'test',
  });
  assert.equal(har.log.version, '1.2');
  assert.equal(har.log.entries.length, 1);
  assert.equal(
    har.log.entries[0].request.url,
    `file:///tmp/Activation-Energy-Studio-v${CONTRACT_VERSION}.html`,
  );
  assert.equal(har.log.entries[0].request.method, 'GET');
  assert.equal(har.log.entries[0].time, 400);
  assert.equal(har.log.pages[0].pageTimings.onContentLoad, 200);
  assert.equal(har.log.pages[0].pageTimings.onLoad, 300);
  assert.equal(har.log.entries[0]._cdpSessionId, PAGE_IDENTITY.sessionId);
  assert.deepEqual(har.log._capture.networkCoverage, REQUIRED_NETWORK_COVERAGE);
  assert.equal(inspection.fileRequests.length, 1);
  assert.equal(inspection.externalRequests.length, 0);
});

test('keys CDP requests by session and retains descendant target identity without page double counting', () => {
  const workerIdentity = {
    sessionId: 'session-worker',
    targetId: 'target-worker',
    targetType: 'worker',
  };
  const workerTarget = {
    targetId: workerIdentity.targetId,
    sessionId: workerIdentity.sessionId,
    parentSessionId: PAGE_IDENTITY.sessionId,
    type: 'worker',
    url: 'file:///tmp/worker.js',
    captureAttached: true,
    paused: true,
    autoAttachConfigured: true,
    networkEnabled: true,
    offlineMechanism: 'Network.setBlockedURLs',
    externalProtocolsBlocked: [...EXTERNAL_PROTOCOLS_BLOCKED],
    blockedUrlPatterns: [...EXTERNAL_URL_BLOCK_PATTERNS],
    pageEventsEnabled: false,
    networkEventCount: 3,
    attachedAt: marker(30),
    pausedAt: marker(31),
    listenersAttachedAt: marker(32),
    networkEnabledAt: marker(33),
    offlineConfiguredAt: marker(34),
    autoAttachConfiguredAt: marker(35),
    configuredAt: marker(36),
    resumedAt: marker(37),
    configurationError: null,
  };
  const workerEvents = [
    retainedEvent(
      'Network.requestWillBeSent',
      {
        requestId: 'document-1',
        timestamp: 100.5,
        wallTime: 1_784_000_000.5,
        type: 'Fetch',
        request: {
          url: 'data:text/plain,worker',
          method: 'GET',
          headers: {},
        },
      },
      workerIdentity,
    ),
    retainedEvent(
      'Network.responseReceived',
      {
        requestId: 'document-1',
        timestamp: 100.6,
        response: {
          status: 200,
          statusText: 'OK',
          protocol: 'data',
          headers: {},
          mimeType: 'text/plain',
          encodedDataLength: 6,
        },
      },
      workerIdentity,
    ),
    retainedEvent(
      'Network.loadingFinished',
      {
        requestId: 'document-1',
        timestamp: 100.7,
        encodedDataLength: 6,
      },
      workerIdentity,
    ),
  ];
  const targetLedger = validTargetLedger([workerTarget]);
  const result = cdpEventsToHar([...validCdpEvents(), ...workerEvents], {
    capture: validCapture({ targetLedger }),
  });

  assert.equal(result.har.log.entries.length, 2);
  assert.deepEqual(
    result.har.log.entries.map((entry) => entry._cdpSessionId),
    [PAGE_IDENTITY.sessionId, workerIdentity.sessionId],
  );
  assert.equal(result.har.log.pages.length, 1);
  assert.equal(result.har.log.pages[0].pageTimings.onLoad, 300);
});

test('fails closed when descendant target observation is unsupported, missing, or mismatched', () => {
  const unsupported = validTargetLedger();
  unsupported.unsupportedTargets.push({
    targetId: 'target-service',
    type: 'service_worker',
  });
  expectCode('CDP_TARGET_UNSUPPORTED', () => validateTargetLedger(unsupported));

  const unobserved = validTargetLedger();
  unobserved.unobservedDescendantTargets.push({
    targetId: 'target-worker',
    type: 'worker',
  });
  expectCode('CDP_DESCENDANT_UNOBSERVED', () => validateTargetLedger(unobserved));

  const notOffline = validTargetLedger();
  notOffline.targets.find(({ type }) => type === 'page').offlineMechanism =
    'Network.setBlockedURLs';
  expectCode('CDP_OFFLINE_MECHANISM_INVALID', () => validateTargetLedger(notOffline));

  const incompleteWorkerBoundary = validTargetLedger([
    {
      targetId: 'target-worker',
      sessionId: 'session-worker',
      parentSessionId: PAGE_IDENTITY.sessionId,
      type: 'worker',
      url: 'blob:null/worker',
      captureAttached: true,
      paused: true,
      autoAttachConfigured: true,
      networkEnabled: true,
      offlineMechanism: 'Network.setBlockedURLs',
      externalProtocolsBlocked: EXTERNAL_PROTOCOLS_BLOCKED.slice(0, -1),
      blockedUrlPatterns: [...EXTERNAL_URL_BLOCK_PATTERNS],
      pageEventsEnabled: false,
      networkEventCount: 0,
      attachedAt: marker(30),
      pausedAt: marker(31),
      listenersAttachedAt: marker(32),
      networkEnabledAt: marker(33),
      offlineConfiguredAt: marker(34),
      autoAttachConfiguredAt: marker(35),
      configuredAt: marker(36),
      resumedAt: marker(37),
      configurationError: null,
    },
  ]);
  expectCode('CDP_OFFLINE_MECHANISM_INVALID', () =>
    validateTargetLedger(incompleteWorkerBoundary),
  );

  const resumedTooEarly = validTargetLedger();
  resumedTooEarly.targets.find(({ type }) => type === 'page').resumedAt = marker(14);
  expectCode('CDP_TARGET_CONFIGURATION_ORDER_INVALID', () =>
    validateTargetLedger(resumedTooEarly),
  );

  const missingIdentity = validCdpEvents().map(({ sessionId, ...event }) => event);
  expectCode('CDP_TARGET_IDENTITY_MISSING', () => convert(missingIdentity));

  const mismatchedIdentity = validCdpEvents();
  mismatchedIdentity[0] = {
    ...mismatchedIdentity[0],
    targetId: 'not-in-ledger',
  };
  expectCode('CDP_TARGET_IDENTITY_MISMATCH', () => convert(mismatchedIdentity));
});

test('retains external requests only in explicit diagnostic mode and rejects them by default', () => {
  const events = validCdpEvents('https://example.com/app.html');
  expectCode('EXTERNAL_NETWORK_REQUEST', () => convert(events));

  const localAndExternal = [
    ...validCdpEvents(),
    retainedEvent(
      'Network.requestWillBeSent',
      {
        requestId: 'external-1',
        timestamp: 100.5,
        wallTime: 1_784_000_000.5,
        type: 'Fetch',
        request: { url: 'https://example.com/telemetry', method: 'POST', headers: {} },
      },
    ),
    retainedEvent(
      'Network.loadingFailed',
      {
        requestId: 'external-1',
        timestamp: 100.6,
        errorText: 'net::ERR_INTERNET_DISCONNECTED',
      },
    ),
  ];
  expectCode('EXTERNAL_NETWORK_REQUEST', () => convert(localAndExternal));

  const diagnostic = convert(localAndExternal, { allowExternalForDiagnostics: true });
  assert.equal(diagnostic.har.log.entries.length, 2);
  assert.deepEqual(diagnostic.inspection.externalRequests, ['https://example.com/telemetry']);
  expectCode('EXTERNAL_NETWORK_REQUEST', () => assertOfflineHar(diagnostic.har));
});

test('retains blockedReason when Chrome reports an empty loadingFailed errorText', () => {
  const blocked = [
    ...validCdpEvents(),
    retainedEvent('Network.requestWillBeSent', {
      requestId: 'blocked-1',
      timestamp: 100.5,
      wallTime: 1_784_000_000.5,
      type: 'Fetch',
      request: {
        url: 'http://127.0.0.1:31337/blocked',
        method: 'GET',
        headers: {},
      },
    }),
    retainedEvent('Network.loadingFailed', {
      requestId: 'blocked-1',
      timestamp: 100.6,
      errorText: '',
      blockedReason: 'inspector',
      canceled: false,
    }),
  ];
  const diagnostic = convert(blocked, { allowExternalForDiagnostics: true });
  const failure = diagnostic.har.log.entries.find(
    (entry) => entry._cdpRequestId === 'blocked-1',
  ).response._failure;
  assert.equal(failure.errorText, '');
  assert.equal(failure.blockedReason, 'inspector');
  assert.equal(failure.canceled, false);

  const missingReason = structuredClone(blocked);
  delete missingReason.at(-1).params.blockedReason;
  expectCode('CDP_EVENT_INVALID', () =>
    convert(missingReason, { allowExternalForDiagnostics: true }),
  );
});

test('rejects observed WebSocket attempts without inventing a HAR request', () => {
  expectCode('EXTERNAL_NETWORK_REQUEST', () =>
    convert([
      ...validCdpEvents(),
      retainedEvent('Network.webSocketCreated', {
        requestId: 'socket-1',
        url: 'wss://example.com/socket',
      }),
    ]),
  );
});

test('fails closed on incomplete, orphaned, duplicate, or timing-deficient CDP evidence', () => {
  expectCode('CDP_REQUEST_INCOMPLETE', () =>
    convert(validCdpEvents().filter(({ method }) => method !== 'Network.loadingFinished')),
  );
  expectCode('CDP_ORPHAN_EVENT', () =>
    convert([
      retainedEvent('Network.responseReceived', {
        requestId: 'unknown',
        response: {},
        timestamp: 1,
      }),
      ...validCdpEvents(),
    ]),
  );
  expectCode('CDP_DUPLICATE_REQUEST_ID', () =>
    convert([validCdpEvents()[0], validCdpEvents()[0], ...validCdpEvents().slice(1)]),
  );
  expectCode('CDP_PAGE_TIMING_MISSING', () =>
    convert(
      validCdpEvents().filter(
        ({ method }) => method !== 'Page.domContentEventFired' && method !== 'Page.loadEventFired',
      ),
    ),
  );
});

test('requires a retained file request even when data or blob requests exist', () => {
  const har = {
    log: {
      entries: [
        { request: { url: 'data:text/plain,offline' } },
        { request: { url: 'blob:null/123' } },
      ],
    },
  };
  assert.equal(inspectHarNetwork(har).localRequests.length, 2);
  expectCode('LOCAL_FILE_REQUEST_REQUIRED', () => assertOfflineHar(har));
});

test('validates the exact distinct artifact set, hashes, and extensions', () => {
  const artifacts = validateExpectedArtifactSet(validArtifacts());
  assert.deepEqual(Object.keys(artifacts), EXPECTED_ARTIFACT_ROLES);

  const missing = validArtifacts();
  delete missing.screenshot;
  expectCode('ARTIFACT_SET_MISMATCH', () => validateExpectedArtifactSet(missing));

  expectCode('ARTIFACT_HASH_INVALID', () =>
    validateExpectedArtifactSet({
      ...validArtifacts(),
      reportJson: { path: 'report.json', sha256: 'not-a-hash' },
    }),
  );
  expectCode('ARTIFACT_EXTENSION_INVALID', () =>
    validateExpectedArtifactSet({
      ...validArtifacts(),
      reportPdf: { path: 'report.txt', sha256: HASHES.reportPdf },
    }),
  );
  expectCode('ARTIFACT_PATH_DUPLICATE', () =>
    validateExpectedArtifactSet({
      ...validArtifacts(),
      reportJson: {
        path: `activation-energy-platform-self-test-v${CONTRACT_VERSION}-pass.json`,
        sha256: HASHES.reportJson,
      },
    }),
  );
});

test('validates complete downloads and one shared scientific export stem', () => {
  const downloads = validateExpectedDownloadSet(validDownloads());
  assert.equal(downloads.reportPdf.bytes, 4_000);
  assert.equal(
    downloads.reportPdf.protocolEvents.willBegin.guid,
    downloads.reportPdf.protocolEvents.completed.guid,
  );
  assert.equal(downloads.reportPdf.stableSizeObservations.length, 2);

  expectCode('DOWNLOAD_INCOMPLETE', () =>
    validateExpectedDownloadSet({
      ...validDownloads(),
      reportPdf: { ...validDownloads().reportPdf, complete: false },
    }),
  );
  expectCode('DOWNLOAD_NAME_INVALID', () =>
    validateExpectedDownloadSet({
      ...validDownloads(),
      selfTestJson: { ...validDownloads().selfTestJson, path: 'self-test.json' },
    }),
  );
  expectCode('DOWNLOAD_STEM_MISMATCH', () =>
    validateExpectedDownloadSet({
      ...validDownloads(),
      reportPdf: downloadDescriptor(
        'downloads/different-report.pdf',
        4_000,
        HASHES.reportPdf,
        'guid-pdf-different',
        4_000,
      ),
    }),
  );
  const mismatchedGuid = validDownloads();
  mismatchedGuid.reportPdf.protocolEvents.completed.guid = 'different-guid';
  expectCode('DOWNLOAD_GUID_MISMATCH', () =>
    validateExpectedDownloadSet(mismatchedGuid),
  );

  const missingCompletion = validDownloads();
  delete missingCompletion.reportJson.protocolEvents.completed;
  expectCode('DOWNLOAD_PROTOCOL_INCOMPLETE', () =>
    validateExpectedDownloadSet(missingCompletion),
  );

  const unstable = validDownloads();
  unstable.reportCsv.stableSizeObservations[1].bytes -= 1;
  expectCode('DOWNLOAD_SIZE_UNSTABLE', () =>
    validateExpectedDownloadSet(unstable),
  );
});

test('derives coverage only from a complete ordered UTC and monotonic action timeline', () => {
  const downloads = validDownloads();
  const timeline = validateActionTimeline(validTimeline(downloads), downloads);
  assert.deepEqual(timeline.actions.map(({ id }) => id), REQUIRED_ACTION_TIMELINE);
  assert.deepEqual(timeline.coverage, REQUIRED_NETWORK_COVERAGE);

  const missing = validTimeline(downloads);
  missing.actions.splice(4, 1);
  expectCode('ACTION_TIMELINE_INCOMPLETE', () =>
    validateActionTimeline(missing, downloads),
  );

  const badResults = validTimeline(downloads);
  badResults.actions[3].evidence.totalRows = 35;
  expectCode('ACTION_EVIDENCE_INVALID', () =>
    validateActionTimeline(badResults, downloads),
  );

  const outOfActionDownload = validDownloads();
  outOfActionDownload.reportJson.stableSizeObservations[1].observedAt = marker(3_000);
  expectCode('TIMELINE_DOWNLOAD_MISMATCH', () =>
    validateActionTimeline(validTimeline(outOfActionDownload), outOfActionDownload),
  );
});

test('requires custom HAR capture start/end, timeline, target ledger, and derived coverage', () => {
  const { har } = convert(validCdpEvents());
  const capture = validateHarCaptureMetadata(har);
  assert.deepEqual(capture.timeline.coverage, REQUIRED_NETWORK_COVERAGE);

  const missingTimeline = structuredClone(har);
  delete missingTimeline.log._capture.timeline;
  expectCode('ACTION_TIMELINE_MISSING', () =>
    validateHarCaptureMetadata(missingTimeline),
  );

  const hardcodedCoverage = structuredClone(har);
  hardcodedCoverage.log._capture.networkCoverage = ['page-open'];
  expectCode('NETWORK_COVERAGE_INCOMPLETE', () =>
    validateHarCaptureMetadata(hardcodedCoverage),
  );
});

test('creates a recorder-compatible draft that cannot claim human confirmation', () => {
  const { har } = convert(validCdpEvents());
  const manifest = createDraftPlatformManifest({
    runner: VALID_RUNNERS.macos,
    runId: 'gha-123-1-macos',
    startedAt: '2026-07-27T08:00:00.000Z',
    endedAt: '2026-07-27T08:01:00.000Z',
    osBuild: '24G720; runner image 20260715.0234.1',
    browser: { name: 'Google Chrome', version: '150.0.0.0', engine: 'Blink' },
    runtime: {
      documentProtocol: 'file:',
      onlineStateDuringRun: false,
      userAgent: 'Hosted CI browser fixture',
      javascriptEngine: 'V8 15.0',
    },
    locale: {
      osLocale: 'en-US',
      navigatorLanguage: 'en-US',
      navigatorLanguages: ['en-US', 'en'],
      timeZone: 'UTC',
      decimalSeparator: '.',
    },
    artifacts: validArtifacts(),
    har,
  });

  assert.equal(manifest.schemaVersion, 'activation-energy-studio/platform-run-input/v1');
  assert.deepEqual(manifest.observer, HUMAN_OBSERVER_PLACEHOLDER);
  assert.equal(manifest.environment.os.family, 'macos');
  assert.equal(manifest.environment.runtime.documentProtocol, 'file:');
  assert.equal(manifest.environment.runtime.onlineStateDuringRun, false);
  assert.equal(manifest.environment.browser.navigatorLanguage, 'en-US');
  assert.deepEqual(manifest.environment.browser.navigatorLanguages, ['en-US', 'en']);
  assert.deepEqual(manifest.environment.locale, {
    osLocale: 'en-US',
    timeZone: 'UTC',
    decimalSeparator: '.',
  });
  assert.equal(manifest.protocol.declaredExternalRequestAttempts, 0);
  assert.deepEqual(manifest.protocol.networkCapture.covers, REQUIRED_NETWORK_COVERAGE);
  assert.deepEqual(
    Object.keys(manifest.protocol.operatorConfirmations),
    OPERATOR_CONFIRMATION_KEYS,
  );
  assert.ok(Object.values(manifest.protocol.operatorConfirmations).every((value) => value === false));
  assert.match(manifest.protocol.deviations[0], /AWAITING_HUMAN_OBSERVER_CONFIRMATION/);
});

test('draft manifest refuses online, non-file, invalid time, and external-network inputs', () => {
  const { har } = convert(validCdpEvents());
  const base = {
    runner: VALID_RUNNERS.ubuntu,
    runId: 'gha-123-1-ubuntu',
    startedAt: '2026-07-27T08:00:00.000Z',
    endedAt: '2026-07-27T08:01:00.000Z',
    osBuild: '6.17.0; runner image 20260715.1',
    browser: { name: 'Google Chrome', version: '150', engine: 'Blink' },
    runtime: {
      documentProtocol: 'file:',
      onlineStateDuringRun: false,
      userAgent: 'Hosted CI browser fixture',
      javascriptEngine: 'V8 15',
    },
    locale: {
      osLocale: 'en-US',
      navigatorLanguage: 'en-US',
      navigatorLanguages: ['en-US'],
      timeZone: 'UTC',
      decimalSeparator: '.',
    },
    artifacts: validArtifacts(),
    har,
  };

  expectCode('RUNTIME_ONLINE_STATE_INVALID', () =>
    createDraftPlatformManifest({
      ...base,
      runtime: { ...base.runtime, onlineStateDuringRun: true },
    }),
  );
  expectCode('RUNTIME_PROTOCOL_INVALID', () =>
    createDraftPlatformManifest({
      ...base,
      runtime: { ...base.runtime, documentProtocol: 'https:' },
    }),
  );
  expectCode('TIMESTAMP_INVALID', () =>
    createDraftPlatformManifest({ ...base, endedAt: base.startedAt }),
  );
  expectCode('RUN_ID_INVALID', () =>
    createDraftPlatformManifest({ ...base, runId: 'not valid because spaces' }),
  );
  expectCode('LOCALE_INVALID', () =>
    createDraftPlatformManifest({
      ...base,
      locale: { ...base.locale, decimalSeparator: ',' },
    }),
  );
  const missingCapture = structuredClone(har);
  delete missingCapture.log._capture;
  expectCode('HAR_CAPTURE_METADATA_MISSING', () =>
    createDraftPlatformManifest({ ...base, har: missingCapture }),
  );

  const externalHar = {
    log: {
      ...har.log,
      entries: [
        ...har.log.entries,
        {
          request: { url: 'ftp://example.com/data', method: 'GET' },
        },
      ],
    },
  };
  expectCode('EXTERNAL_NETWORK_REQUEST', () =>
    createDraftPlatformManifest({ ...base, har: externalHar }),
  );
});

test('requires exact immutable workflow action SHAs and retains them in provenance', () => {
  const environment = {
    GITHUB_ACTIONS: 'true',
    RUNNER_ENVIRONMENT: 'github-hosted',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_REPOSITORY: 'example/activation-energy-studio',
    GITHUB_RUN_ID: '123456',
    GITHUB_RUN_ATTEMPT: '2',
    GITHUB_SHA: 'a'.repeat(40),
    GITHUB_WORKFLOW: CONTRACT_WORKFLOW_NAME,
    GITHUB_WORKFLOW_REF:
      `example/activation-energy-studio/${CONTRACT_WORKFLOW_RELATIVE_PATH}@refs/heads/main`,
    GITHUB_REF: 'refs/heads/main',
    RUNNER_NAME: 'GitHub Actions 1',
    RUNNER_OS: 'macOS',
    RUNNER_ARCH: 'ARM64',
    ImageOS: 'macos15',
    ImageVersion: '20260715.0234.1',
    AES_ACTION_CHECKOUT_SHA: HOSTED_ACTION_COMMITS.checkout.sha,
    AES_ACTION_SETUP_NODE_SHA: HOSTED_ACTION_COMMITS.setupNode.sha,
    AES_ACTION_UPLOAD_ARTIFACT_SHA: HOSTED_ACTION_COMMITS.uploadArtifact.sha,
    [HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR_ENVIRONMENT]: String(
      HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR,
    ),
  };
  const provenance = assertHostedActionsEnvironment(environment);
  assert.equal(
    provenance.actions.checkout.commitSha,
    HOSTED_ACTION_COMMITS.checkout.sha,
  );
  assert.equal(
    provenance.actions.setupNode.commitSha,
    HOSTED_ACTION_COMMITS.setupNode.sha,
  );
  assert.equal(
    provenance.actions.uploadArtifact.commitSha,
    HOSTED_ACTION_COMMITS.uploadArtifact.sha,
  );
  assert.deepEqual(provenance.browserExpectation, {
    product: 'Google Chrome',
    expectedMajor: 150,
    environment: HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR_ENVIRONMENT,
  });

  const missing = { ...environment };
  delete missing.AES_ACTION_SETUP_NODE_SHA;
  expectCode('HOSTED_PROVENANCE_MISSING', () =>
    assertHostedActionsEnvironment(missing),
  );
  expectCode('HOSTED_ACTION_SHA_MISMATCH', () =>
    assertHostedActionsEnvironment({
      ...environment,
      AES_ACTION_UPLOAD_ARTIFACT_SHA: 'f'.repeat(40),
    }),
  );
  expectCode('HOSTED_CHROME_EXPECTATION_MISMATCH', () =>
    assertHostedActionsEnvironment({
      ...environment,
      [HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR_ENVIRONMENT]: '151',
    }),
  );

  const failureError = new HostedPlatformValidationError(
    'BROWSER_LAUNCH_FAILED',
    'Synthetic first-run browser failure.',
  );
  failureError.hostedPartial = {
    browser: { executable: '/system/chrome', launched: false, version: null },
    capture: { captureStartedAt: null, cdpEventCount: 0 },
    targetLedger: null,
  };
  const failure = createHostedFailureRecord({
    options: { family: 'macos', runnerLabel: 'macos-15' },
    provenance,
    identity: { runner: VALID_RUNNERS.macos },
    error: failureError,
    recordedAt: '2026-07-27T08:00:00.000Z',
  });
  assert.equal(failure.schema, 'activation-energy-studio/hosted-platform-run-failure/v2');
  assert.equal(failure.provenance.workflowRef, environment.GITHUB_WORKFLOW_REF);
  assert.match(failure.provenance.runUrl, /actions\/runs\/123456\/attempts\/2$/u);
  assert.equal(failure.provenance.imageOS, environment.ImageOS);
  assert.equal(failure.provenance.imageVersion, environment.ImageVersion);
  assert.equal(
    failure.provenance.actions.uploadArtifact.commitSha,
    HOSTED_ACTION_COMMITS.uploadArtifact.sha,
  );
  assert.equal(failure.identity.runner.runnerLabel, 'macos-15');
  assert.equal(failure.partial.browser.executable, '/system/chrome');
});

test('shares cross-platform Google Chrome discovery without Chromium fallback', () => {
  const localOverride = googleChromeExecutableCandidates({
    explicitPath: '/tmp/local-diagnostic-custom-chrome',
    platform: 'darwin',
    environment: {},
  });
  const macos = googleChromeExecutableCandidates({
    platform: 'darwin',
    environment: {},
  });
  const linux = googleChromeExecutableCandidates({
    platform: 'linux',
    environment: {
      AES_REAL_CHROME_EXECUTABLE: '/opt/google/chrome/google-chrome',
    },
  });
  const windows = googleChromeExecutableCandidates({
    platform: 'win32',
    environment: {
      ProgramFiles: 'C:\\Program Files',
      'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
      LOCALAPPDATA: 'C:\\Users\\runneradmin\\AppData\\Local',
    },
  });

  assert.ok(
    macos.includes(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ),
  );
  assert.equal(localOverride[0], '/tmp/local-diagnostic-custom-chrome');
  assert.ok(linux.includes('/usr/bin/google-chrome'));
  assert.ok(linux.includes('/usr/bin/google-chrome-stable'));
  assert.equal(linux[0], '/opt/google/chrome/google-chrome');
  assert.ok(
    windows.includes(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ),
  );
  assert.ok(
    windows.includes(
      'C:\\Users\\runneradmin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    ),
  );
  assert.ok(
    [...macos, ...linux, ...windows].every(
      (candidate) => !/chromium/iu.test(candidate),
    ),
  );
});

test('fail-closes hosted Google Chrome path and commit-controlled major', () => {
  const windowsEnvironment = {
    ProgramFiles: 'C:\\Program Files',
    'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\runneradmin\\AppData\\Local',
  };
  const chrome = assertGoogleChromeProduct('Chrome/150.0.7871.182', {
    expectedMajor: HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR,
  });
  assert.deepEqual(chrome, {
    product: 'Chrome/150.0.7871.182',
    version: '150.0.7871.182',
    major: 150,
  });
  assert.equal(
    assertHostedGoogleChromeExecutablePath(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      {
        platform: 'darwin',
        environment: {},
        canonicalize: (candidate) => candidate,
      },
    ),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  );
  assert.equal(
    assertHostedGoogleChromeExecutablePath('/usr/bin/google-chrome', {
      platform: 'linux',
      environment: {},
      canonicalize: () => '/opt/google/chrome/google-chrome',
    }),
    '/opt/google/chrome/google-chrome',
  );
  assert.equal(
    assertHostedGoogleChromeExecutablePath(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      {
        platform: 'win32',
        environment: windowsEnvironment,
        canonicalize: (candidate) => candidate,
      },
    ),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  );
  expectCode('GOOGLE_CHROME_MAJOR_MISMATCH', () =>
    assertGoogleChromeProduct('Chrome/151.0.1.2', {
      expectedMajor: HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR,
    }),
  );
  expectCode('GOOGLE_CHROME_REQUIRED', () =>
    assertGoogleChromeProduct('Chromium/150.0.7871.182', {
      expectedMajor: HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR,
    }),
  );
  expectCode('HOSTED_GOOGLE_CHROME_EXECUTABLE_REQUIRED', () =>
    assertHostedGoogleChromeExecutablePath('/usr/bin/chromium', {
      platform: 'linux',
      environment: {},
      canonicalize: (candidate) => candidate,
    }),
  );
  expectCode('HOSTED_GOOGLE_CHROME_EXECUTABLE_REQUIRED', () =>
    assertHostedGoogleChromeExecutablePath('/tmp/google-chrome', {
      platform: 'linux',
      environment: {},
      canonicalize: () => '/opt/google/chrome/google-chrome',
    }),
  );
  expectCode('HOSTED_GOOGLE_CHROME_EXECUTABLE_REQUIRED', () =>
    assertHostedGoogleChromeExecutablePath(
      '/tmp/Fake/Google Chrome.app/Contents/MacOS/Google Chrome',
      {
        platform: 'darwin',
        environment: {},
        canonicalize: () =>
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      },
    ),
  );
  expectCode('HOSTED_GOOGLE_CHROME_EXECUTABLE_REQUIRED', () =>
    assertHostedGoogleChromeExecutablePath(
      'C:\\tmp\\Google\\Chrome\\Application\\chrome.exe',
      {
        platform: 'win32',
        environment: windowsEnvironment,
        canonicalize: () =>
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      },
    ),
  );
  expectCode('HOSTED_GOOGLE_CHROME_CANONICAL_PATH_REQUIRED', () =>
    assertHostedGoogleChromeExecutablePath('/usr/bin/google-chrome', {
      platform: 'linux',
      environment: {},
      canonicalize: () => '/tmp/fake-google-chrome',
    }),
  );
});

test('hosted workflow preflight is retained diagnostic evidence only', () => {
  const outputDirectory = path.resolve(
    tmpdir(),
    `activation-energy-hosted-preflight-${process.pid}-${Date.now()}`,
  );
  try {
    const options = {
      osFamily: 'ubuntu',
      runnerLabel: 'ubuntu-24.04',
      nodeArchitecture: 'x64',
      environment: {
        GITHUB_ACTIONS: 'true',
        RUNNER_ENVIRONMENT: 'github-hosted',
        RUNNER_OS: 'Linux',
        RUNNER_ARCH: 'X64',
        ImageOS: 'ubuntu24',
        ImageVersion: '20260720.247.2',
        GITHUB_REPOSITORY: 'owner/repository',
        GITHUB_WORKFLOW: CONTRACT_WORKFLOW_NAME,
        GITHUB_WORKFLOW_REF:
          `owner/repository/${CONTRACT_WORKFLOW_RELATIVE_PATH}@refs/heads/main`,
        GITHUB_RUN_ID: '1234',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_SHA: 'a'.repeat(40),
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SERVER_URL: 'https://github.com',
      },
      runtime: {
        version: 'v22.22.3',
        arch: 'x64',
        platform: 'linux',
      },
      now: new Date('2026-07-28T00:00:00.000Z'),
    };
    const expected = createHostedWorkflowPreflight(options);
    assert.equal(expected.claimStatus, HOSTED_WORKFLOW_PREFLIGHT_STATUS);
    assert.equal(
      expected.runtime.nodeArchitectureScope,
      HOSTED_WORKFLOW_PREFLIGHT_NODE_ARCHITECTURE_SCOPE,
    );
    assert.deepEqual(expected.evidenceBoundary, {
      platformEvidence: false,
      softwareAuthenticatedRunnerIdentity: false,
      acceptanceGatesAutomaticallyApplied: false,
      humanReviewRequired: true,
      purpose:
        'Retain a diagnostic file when dependency installation or a pre-browser hosted check fails before the browser harness can write evidence.',
    });

    const written = writeHostedWorkflowPreflight({
      ...options,
      outputDirectory,
    });
    assert.equal(
      written.outputPath,
      path.resolve(outputDirectory, HOSTED_WORKFLOW_PREFLIGHT_NAME),
    );
    const retained = JSON.parse(readFileSync(written.outputPath, 'utf8'));
    assert.deepEqual(retained, expected);
    assert.equal(
      validateHostedWorkflowPreflight(retained, {
        osFamily: 'ubuntu',
        runnerLabel: 'ubuntu-24.04',
        nodeArchitecture: 'x64',
      }),
      retained,
    );
    assert.throws(
      () =>
        validateHostedWorkflowPreflight(retained, {
          osFamily: 'windows11',
          runnerLabel: 'windows-11-arm',
          nodeArchitecture: 'arm64',
        }),
      /target does not match/iu,
    );
    assert.throws(
      () =>
        validateHostedWorkflowPreflight({
          ...retained,
          unexpected: true,
        }),
      /invalid field set/iu,
    );
    assert.throws(
      () =>
        validateHostedWorkflowPreflight({
          ...retained,
          observedEnvironment: {
            ...retained.observedEnvironment,
            serverUrl: 'https://example.com',
          },
        }),
      /server URL is invalid/iu,
    );
    assert.throws(
      () =>
        validateHostedWorkflowPreflight({
          ...retained,
          startedAtUtc: '2026-02-29T00:00:00.000Z',
        }),
      /timestamp is invalid/iu,
    );
    assert.throws(
      () =>
        validateHostedWorkflowPreflight({
          ...retained,
          runtime: {
            ...retained.runtime,
            nodeVersion: 'v22.22.3garbage',
          },
        }),
      /runtime is invalid/iu,
    );
    assert.throws(
      () =>
        validateHostedWorkflowPreflight({
          ...retained,
          runtime: {
            ...retained.runtime,
            nodeArchitecture: 'ia32',
          },
        }),
      /runtime is invalid/iu,
    );

    const macosBootstrapArchitectureMismatch =
      createHostedWorkflowPreflight({
        ...options,
        osFamily: 'macos',
        runnerLabel: 'macos-15',
        nodeArchitecture: 'arm64',
        environment: {
          ...options.environment,
          RUNNER_OS: 'macOS',
          RUNNER_ARCH: 'ARM64',
          ImageOS: 'macos15',
        },
        runtime: {
          version: 'v20.19.4',
          arch: 'x64',
          platform: 'darwin',
        },
      });
    assert.doesNotThrow(() =>
      validateHostedWorkflowPreflight(
        macosBootstrapArchitectureMismatch,
        {
          osFamily: 'macos',
          runnerLabel: 'macos-15',
          nodeArchitecture: 'arm64',
        },
      ),
    );
    assert.throws(
      () =>
        validateHostedWorkflowPreflight({
          ...macosBootstrapArchitectureMismatch,
          runtime: {
            ...macosBootstrapArchitectureMismatch.runtime,
            nodeArchitectureScope: 'TARGET_NODE_ARCHITECTURE',
          },
        }),
      /runtime is invalid/iu,
    );

    const windowsPreflight = createHostedWorkflowPreflight({
      ...options,
      osFamily: 'windows11',
      runnerLabel: 'windows-11-arm',
      nodeArchitecture: 'arm64',
      environment: {
        ...options.environment,
        RUNNER_OS: 'Windows',
        RUNNER_ARCH: 'ARM64',
        ImageOS: 'win11',
      },
      runtime: {
        version: 'v20.19.4',
        arch: 'arm64',
        platform: 'win32',
      },
    });
    assert.throws(
      () =>
        validateHostedWorkflowPreflight({
          ...windowsPreflight,
          runtime: {
            ...windowsPreflight.runtime,
            platform: 'darwin',
          },
        }),
      /runtime is invalid/iu,
    );
    assert.throws(
      () =>
        writeHostedWorkflowPreflight({
          ...options,
          outputDirectory,
        }),
      /Refusing to overwrite/iu,
    );
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test(
  'checked-in workflow structurally binds hosted pins, timeouts, and step settings',
  { skip: CONTRACT_VERSION === '0.3.2' },
  () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  const rootEnvironment = parseRootWorkflowEnvironment(workflow);
  const matrix = parseWorkflowMatrixInclude(workflow);
  const steps = parseWorkflowSteps(workflow);
  assertWorkflowStepShapes(steps);

  assert.deepEqual(matrix, [
    {
      runner_label: 'ubuntu-24.04',
      os_family: 'ubuntu',
      node_arch: 'x64',
    },
    {
      runner_label: 'macos-15',
      os_family: 'macos',
      node_arch: 'arm64',
    },
    {
      runner_label: 'windows-11-arm',
      os_family: 'windows11',
      node_arch: 'arm64',
    },
  ]);
  assert.deepEqual(rootEnvironment, {
    AES_ACTION_CHECKOUT_SHA:
      'd23441a48e516b6c34aea4fa41551a30e30af803',
    AES_ACTION_SETUP_NODE_SHA:
      '249970729cb0ef3589644e2896645e5dc5ba9c38',
    AES_ACTION_UPLOAD_ARTIFACT_SHA:
      'b7c566a772e6b6bfb58ed0dc250532a479d7789f',
    AES_EXPECTED_GOOGLE_CHROME_MAJOR: '150',
  });
  const checkout = steps.get('Check out the locked source');
  assert.equal(
    checkout.uses,
    'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
  );
  assert.deepEqual(checkout.with, { 'persist-credentials': 'false' });

  const preflight = steps.get(
    'Initialize retained pre-browser diagnostics',
  );
  assert.equal(
    preflight.run,
    'node scripts/write-hosted-workflow-preflight.mjs --os "${{ matrix.os_family }}" --runner-label "${{ matrix.runner_label }}" --node-arch "${{ matrix.node_arch }}" --output "output/hosted-platform/${{ matrix.os_family }}"',
  );

  const setupNode = steps.get('Set up Node.js 22.22.3');
  assert.equal(
    setupNode.uses,
    'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38',
  );
  assert.deepEqual(setupNode.with, {
    'node-version': '22.22.3',
    architecture: '${{ matrix.node_arch }}',
    cache: 'npm',
  });

  assert.equal(
    steps.get('Verify the independent Paper 010 Decimal oracle').run,
    'npm run verify:paper010-oracle',
  );
  assert.equal(
    steps.get('Verify the independent Oak Decimal oracle').run,
    'npm run verify:oak-oracle',
  );
  assert.equal(
    steps.get('Verify the independent Dryad Polyisoprene Decimal oracle').run,
    'npm run verify:dryad-oracle',
  );
  assert.equal(
    steps.get('Verify the independent NR-CELS Decimal oracle and evidence').run,
    'npm run verify:nr-cels-oracle',
  );
  assert.equal(
    steps.get('Verify the independent Coal-SPT-Paraffin Decimal oracle').run,
    'npm run verify:coal-spt-paraffin-oracle',
  );
  assert.equal(
    steps.get('Run TypeScript typecheck').run,
    'npm run typecheck',
  );
  assert.equal(
    steps.get('Run complete Vitest suite including all real-data lanes').run,
    'npm test',
  );
  assert.equal(
    steps.get('Run dedicated real-data oracle reproducibility suites').run,
    'npm run test:dryad-oracle && npm run test:nr-cels-oracle && npm run test:coal-spt-paraffin-oracle',
  );
  assert.equal(
    steps.get('Verify the recursive fixture manifest').run,
    'npm run verify:fixture-manifest',
  );

  const workerProbe = steps.get(
    'Run hosted contracts and the real Chrome Worker boundary probe',
  );
  assert.equal(workerProbe['timeout-minutes'], '10');
  assert.deepEqual(workerProbe.env, {
    AES_RUN_REAL_CHROME_WORKER_INTEGRATION: '1',
  });
  assert.equal(workerProbe.run, 'npm run test:hosted-platform');

  const harness = steps.get('Run hosted real-browser platform validation');
  assert.equal(harness['timeout-minutes'], '35');
  assert.equal(
    harness.run,
    'node scripts/run-hosted-platform-validation.mjs --os "${{ matrix.os_family }}" --runner-label "${{ matrix.runner_label }}" --node-arch "${{ matrix.node_arch }}" --output "output/hosted-platform/${{ matrix.os_family }}"',
  );

  const upload = steps.get(
    'Upload retained evidence, including failed-run diagnostics',
  );
  assert.equal(upload.if, '${{ always() }}');
  assert.equal(upload.id, 'upload-evidence');
  assert.equal(
    upload.uses,
    'actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f',
  );
  assert.deepEqual(upload.with, {
    name: 'hosted-platform-${{ matrix.os_family }}-${{ github.run_id }}-${{ github.run_attempt }}',
    path: 'output/hosted-platform/${{ matrix.os_family }}',
    'if-no-files-found': 'error',
    'retention-days': '90',
  });

  const replaceOnce = (needle, replacement) => {
    assert.equal(
      workflow.split(needle).length,
      2,
      `Workflow mutation anchor must occur exactly once: ${needle}`,
    );
    return workflow.replace(needle, replacement);
  };
  const unnamedStep = replaceOnce(
    '    steps:\n',
    '    steps:\n      - run: echo unnamed-step\n',
  );
  assert.throws(
    () => parseWorkflowSteps(unnamedStep),
    /must start with an explicit "- name:"/u,
  );

  const extraNamedStep = replaceOnce(
    '    steps:\n',
    [
      '    steps:',
      '      - name: Unexpected extra step',
      '        run: echo unexpected',
      '',
    ].join('\n'),
  );
  assert.throws(
    () => assertWorkflowStepShapes(parseWorkflowSteps(extraNamedStep)),
    /exactly the named hosted-validation steps/u,
  );

  const unexpectedTopLevelKey = replaceOnce(
    '      - name: Run hosted contracts and the real Chrome Worker boundary probe\n',
    [
      '      - name: Run hosted contracts and the real Chrome Worker boundary probe',
      '        continue-on-error: true',
      '',
    ].join('\n'),
  );
  assert.throws(
    () =>
      assertWorkflowStepShapes(parseWorkflowSteps(unexpectedTopLevelKey)),
    /Unexpected top-level key/u,
  );

  const unexpectedEnvironmentKey = replaceOnce(
    '          AES_RUN_REAL_CHROME_WORKER_INTEGRATION: "1"\n',
    [
      '          AES_RUN_REAL_CHROME_WORKER_INTEGRATION: "1"',
      '          UNEXPECTED_WORKER_ENV: "1"',
      '',
    ].join('\n'),
  );
  assert.throws(
    () =>
      assertWorkflowStepShapes(parseWorkflowSteps(unexpectedEnvironmentKey)),
    /Unexpected env key/u,
  );

  const unexpectedWithKey = replaceOnce(
    '          persist-credentials: false\n',
    [
      '          persist-credentials: false',
      '          fetch-depth: 1',
      '',
    ].join('\n'),
  );
  assert.throws(
    () => assertWorkflowStepShapes(parseWorkflowSteps(unexpectedWithKey)),
    /Unexpected with key/u,
  );

  const correctCheckoutPin =
    'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803';
  const commentOnlyPin = replaceOnce(
    `        uses: ${correctCheckoutPin} # v6`,
    `        uses: actions/checkout@${'f'.repeat(40)} # ${correctCheckoutPin}`,
  );
  const commentOnlyPinSteps = parseWorkflowSteps(commentOnlyPin);
  assertWorkflowStepShapes(commentOnlyPinSteps);
  assert.notEqual(
    commentOnlyPinSteps.get('Check out the locked source').uses,
    correctCheckoutPin,
    'A correct SHA present only in a comment must not satisfy the step pin.',
  );

  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /^    timeout-minutes:\s*60$/mu);
  assert.match(workflow, /^      fail-fast:\s*false$/mu);
  assert.doesNotMatch(workflow, /(?:ubuntu|macos|windows)-latest/iu);
  assert.doesNotMatch(workflow, /Windows\s+Server|windows-202[258]/iu);
  },
);

test('one exported helper owns target listeners, network boundary, auto-attach, and resume order', async () => {
  const makeMarker = () => {
    let value = 6_000;
    return () => marker(value++);
  };
  const runFixture = async (type, throwOnMethod = null) => {
    const commands = [];
    const session = {
      async send(method, params) {
        commands.push({ method, params });
        if (method === throwOnMethod) throw new Error(`synthetic ${method} failure`);
        return {};
      },
    };
    const targetEntry = { type, configurationError: null };
    await configureCapturedTargetSession({
      session,
      targetEntry,
      marker: makeMarker(),
      attachListeners() {
        commands.push({ method: 'TEST.listenersAttached' });
      },
    });
    return { commands, targetEntry };
  };

  const worker = await runFixture('worker');
  assert.deepEqual(
    worker.commands.map(({ method }) => method),
    [
      'TEST.listenersAttached',
      'Network.enable',
      'Network.setBlockedURLs',
      'Target.setAutoAttach',
      'Runtime.runIfWaitingForDebugger',
    ],
  );
  assert.deepEqual(
    worker.commands.find(({ method }) => method === 'Network.setBlockedURLs').params.urls,
    EXTERNAL_URL_BLOCK_PATTERNS,
  );
  assert.equal(worker.targetEntry.offlineMechanism, 'Network.setBlockedURLs');
  assert.equal(worker.targetEntry.configurationError, null);

  const page = await runFixture('page');
  assert.deepEqual(
    page.commands.map(({ method }) => method),
    [
      'TEST.listenersAttached',
      'Network.enable',
      'Network.emulateNetworkConditions',
      'Page.enable',
      'Target.setAutoAttach',
      'Runtime.runIfWaitingForDebugger',
    ],
  );
  assert.equal(
    page.targetEntry.offlineMechanism,
    'Network.emulateNetworkConditions',
  );

  const failed = await runFixture('worker', 'Network.setBlockedURLs');
  assert.deepEqual(
    failed.commands.map(({ method }) => method),
    [
      'TEST.listenersAttached',
      'Network.enable',
      'Network.setBlockedURLs',
      'Runtime.runIfWaitingForDebugger',
    ],
  );
  assert.match(failed.targetEntry.configurationError.message, /synthetic/u);
  assert.ok(failed.targetEntry.configuredAt);
  assert.ok(failed.targetEntry.resumedAt);
});

test('harness reapplies offline mode after file navigation and waits before self-test', () => {
  const source = readFileSync(HARNESS_PATH, 'utf8');
  const testSource = readFileSync(TEST_PATH, 'utf8');
  const hostedCanonicalAssignment = source.indexOf(
    'browserExecutable =\n        assertHostedGoogleChromeExecutablePath(browserExecutable)',
  );
  const hostedBrowserLaunch = source.indexOf(
    'browser = await puppeteer.launch({',
    hostedCanonicalAssignment,
  );
  const hostedCanonicalLaunchArgument = source.indexOf(
    'executablePath: browserExecutable',
    hostedBrowserLaunch,
  );
  const workerCanonicalAssignment = testSource.indexOf(
    'executablePath =\n        assertHostedGoogleChromeExecutablePath(executablePath)',
  );
  const workerBrowserLaunch = testSource.indexOf(
    'browser = await puppeteer.launch({',
    workerCanonicalAssignment,
  );
  const workerCanonicalLaunchArgument = testSource.indexOf(
    'executablePath,',
    workerBrowserLaunch,
  );
  const browserIdentity = source.indexOf(
    "lastBrowserVersion = await browserSession.send('Browser.getVersion')",
  );
  const browserContract = source.indexOf(
    'lastChromeIdentity = assertGoogleChromeProduct(',
    browserIdentity,
  );
  const captureStart = source.indexOf(
    'timeline.captureStartedAt = marker()',
    browserContract,
  );
  const navigation = source.indexOf('await page.goto(releaseUrl');
  const secondOffline = source.indexOf('await page.setOfflineMode(true);', navigation);
  const offlineObservation = source.indexOf(
    'await page.waitForFunction(() => navigator.onLine === false',
    secondOffline,
  );
  const selfTest = source.indexOf(
    "await page.click('[data-testid=\"run-platform-self-test\"]')",
    offlineObservation,
  );
  assert.ok(hostedCanonicalAssignment >= 0);
  assert.ok(hostedBrowserLaunch > hostedCanonicalAssignment);
  assert.ok(hostedCanonicalLaunchArgument > hostedBrowserLaunch);
  assert.ok(workerCanonicalAssignment >= 0);
  assert.ok(workerBrowserLaunch > workerCanonicalAssignment);
  assert.ok(workerCanonicalLaunchArgument > workerBrowserLaunch);
  assert.ok(browserIdentity >= 0);
  assert.ok(browserContract > browserIdentity);
  assert.ok(captureStart > browserContract);
  assert.ok(navigation > captureStart);
  assert.ok(secondOffline > navigation);
  assert.ok(offlineObservation > secondOffline);
  assert.ok(selfTest > offlineObservation);
  assert.doesNotMatch(source, /defineProperty\s*\(\s*navigator\s*,\s*['"]onLine/u);
  assert.match(source, /browser\.target\(\)\.createCDPSession\(\)/u);
  assert.match(
    source,
    /browserSession\.send\('Target\.setAutoAttach', AUTO_ATTACH_CONFIGURATION\)/u,
  );
  assert.match(source, /waitForDebuggerOnStart:\s*true/u);
  assert.match(source, /flatten:\s*true/u);
  assert.match(source, /waitForInitialPage:\s*false/u);
  assert.match(source, /'--no-startup-window'/u);
  assert.match(source, /paused:\s*params\.waitingForDebugger === true/u);
  assert.match(
    source,
    /workflowPreflight:\s*await descriptor\([\s\S]{0,300}\{ includeBytes: true \}/u,
  );
  const helper = source.indexOf(
    'export async function configureCapturedTargetSession',
  );
  const listener = source.indexOf('await attachListeners(session, targetEntry)', helper);
  const networkEnable = source.indexOf("await session.send('Network.enable')", listener);
  const offline = source.indexOf(
    "await session.send('Network.emulateNetworkConditions'",
    networkEnable,
  );
  const workerBlockedUrls = source.indexOf(
    "await session.send('Network.setBlockedURLs'",
    networkEnable,
  );
  const recursiveAttach = source.indexOf(
    "await session.send('Target.setAutoAttach'",
    workerBlockedUrls,
  );
  const resume = source.indexOf(
    "await session.send('Runtime.runIfWaitingForDebugger')",
    recursiveAttach,
  );
  const initializer = source.indexOf('async function initializeTargetCapture');
  const sharedHelperCall = source.indexOf(
    'await configureCapturedTargetSession({',
    initializer,
  );
  assert.ok(helper >= 0);
  assert.ok(listener >= 0);
  assert.ok(networkEnable > listener);
  assert.ok(offline > networkEnable);
  assert.ok(workerBlockedUrls > offline);
  assert.ok(recursiveAttach > workerBlockedUrls);
  assert.ok(resume > recursiveAttach);
  assert.ok(sharedHelperCall > initializer);
  assert.deepEqual(EXTERNAL_PROTOCOLS_BLOCKED, [
    'http:',
    'https:',
    'ws:',
    'wss:',
    'ftp:',
  ]);
  assert.deepEqual(EXTERNAL_URL_BLOCK_PATTERNS, [
    'http://*',
    'https://*',
    'ws://*',
    'wss://*',
    'ftp://*',
  ]);
});

const RUN_REAL_CHROME_WORKER_INTEGRATION =
  process.env.AES_RUN_REAL_CHROME_WORKER_INTEGRATION === '1';

test(
  'opt-in real Chrome blocks a paused Worker request before localhost receives it',
  {
    skip: RUN_REAL_CHROME_WORKER_INTEGRATION
      ? false
      : 'Set AES_RUN_REAL_CHROME_WORKER_INTEGRATION=1 to run the real-browser probe.',
  },
  async () => {
    let executablePath = await discoverGoogleChromeExecutable(
      process.env.AES_REAL_CHROME_EXECUTABLE ?? null,
    );
    if (process.env.GITHUB_ACTIONS === 'true') {
      executablePath =
        assertHostedGoogleChromeExecutablePath(executablePath);
    }

    let blockedEndpointHits = 0;
    let probeUrl = '';
    const server = createServer((request, response) => {
      if (request.url === '/should-not-hit') {
        blockedEndpointHits += 1;
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('unexpected server hit');
        return;
      }
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
    });
    await new Promise((resolvePromise, rejectPromise) => {
      server.once('error', rejectPromise);
      server.listen(0, '127.0.0.1', resolvePromise);
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    probeUrl = `http://127.0.0.1:${address.port}/should-not-hit`;
    const workerSource = [
      `fetch(${JSON.stringify(probeUrl)})`,
      ".then(() => postMessage('unexpected-success'))",
      ".catch((error) => postMessage(`blocked:${error.name}`));",
    ].join('');
    const html = [
      '<!doctype html><meta charset="utf-8"><title>worker-probe</title>',
      '<script>',
      'window.__workerProbeDone = false;',
      `const workerSource = ${JSON.stringify(workerSource)};`,
      "const workerBlob = new Blob([workerSource], {type: 'text/javascript'});",
      'const worker = new Worker(URL.createObjectURL(workerBlob));',
      'worker.onmessage = (event) => {',
      '  window.__workerProbeMessage = event.data;',
      '  window.__workerProbeDone = true;',
      '};',
      '</script>',
    ].join('');

    let browser;
    try {
      const { default: puppeteer } = await import('puppeteer-core');
      browser = await puppeteer.launch({
        executablePath,
        headless: true,
        waitForInitialPage: false,
        args: [
          '--disable-background-networking',
          '--no-first-run',
          '--no-startup-window',
        ],
      });
      const browserSession = await browser.target().createCDPSession();
      const observedBrowser = await browserSession.send('Browser.getVersion');
      const observedChrome = assertGoogleChromeProduct(
        observedBrowser.product,
        { expectedMajor: HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR },
      );
      assert.equal(
        observedChrome.major,
        HOSTED_EXPECTED_GOOGLE_CHROME_MAJOR,
      );
      const sessions = new Map([[browserSession.id(), browserSession]]);
      const registeredParents = new Set();
      const pendingConfigurations = new Set();
      const configurationErrors = [];
      const workerRequests = [];
      const workerFailures = [];
      let workerPaused = false;
      const integrationOrigin = process.hrtime.bigint();
      const integrationMarker = () => ({
        utc: new Date().toISOString(),
        monotonicMs:
          Number(process.hrtime.bigint() - integrationOrigin) / 1_000_000,
      });

      const registerParent = (parentSession) => {
        if (registeredParents.has(parentSession.id())) return;
        registeredParents.add(parentSession.id());
        parentSession.on('sessionattached', (childSession) => {
          sessions.set(childSession.id(), childSession);
          registerParent(childSession);
        });
        parentSession.on('Target.attachedToTarget', (params) => {
          const childSession =
            sessions.get(params.sessionId) ??
            browserSession.connection()?.session(params.sessionId);
          if (!childSession) {
            configurationErrors.push(
              new Error(`Missing session ${params.sessionId}.`),
            );
            return;
          }
          sessions.set(params.sessionId, childSession);
          registerParent(childSession);
          const isWorker = ['worker', 'shared_worker'].includes(
            params.targetInfo.type,
          );
          if (isWorker) workerPaused ||= params.waitingForDebugger === true;
          const targetEntry = {
            type: params.targetInfo.type,
            configurationError: null,
          };
          const configuration = configureCapturedTargetSession({
            session: childSession,
            targetEntry,
            marker: integrationMarker,
            attachListeners(session) {
              if (!isWorker) return;
              session.on('Network.requestWillBeSent', (event) => {
                if (event.request.url === probeUrl) workerRequests.push(event);
              });
              session.on('Network.loadingFailed', (event) => {
                workerFailures.push(event);
              });
            },
          })
            .then((configuredEntry) => {
              if (configuredEntry.configurationError) {
                configurationErrors.push(
                  new Error(configuredEntry.configurationError.message),
                );
              }
            })
            .catch((error) => configurationErrors.push(error));
          pendingConfigurations.add(configuration);
          configuration.finally(() => pendingConfigurations.delete(configuration));
        });
      };

      registerParent(browserSession);
      await browserSession.send('Target.setAutoAttach', {
        autoAttach: true,
        flatten: true,
        waitForDebuggerOnStart: true,
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
      await page.waitForFunction(() => window.__workerProbeDone === true, {
        timeout: 15_000,
      });
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline && workerFailures.length === 0) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
      }
      await Promise.allSettled([...pendingConfigurations]);

      assert.deepEqual(
        configurationErrors.map((error) => error.message),
        [],
      );
      assert.equal(workerPaused, true);
      assert.equal(workerRequests.length, 1);
      assert.equal(workerFailures.length, 1);
      assert.equal(workerFailures[0].blockedReason, 'inspector');
      assert.equal(workerFailures[0].errorText, '');
      assert.equal(blockedEndpointHits, 0);
      assert.match(
        await page.evaluate(() => window.__workerProbeMessage),
        /^blocked:/u,
      );
    } finally {
      if (browser) await browser.close();
      await new Promise((resolvePromise) => server.close(resolvePromise));
    }
  },
);

test('hosted harness exposes help but refuses to create evidence outside GitHub Actions', () => {
  const help = spawnSync(process.execPath, [HARNESS_PATH, '--help'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(help.status, 0, help.stdout + help.stderr);
  assert.match(help.stdout, /intentionally restricted to GitHub-hosted Actions runners/u);
  assert.match(help.stdout, /--node-arch arm64\|x64/u);

  const output = path.resolve(
    tmpdir(),
    `activation-energy-hosted-refusal-${process.pid}-${Date.now()}`,
  );
  const refused = spawnSync(
    process.execPath,
    [
      HARNESS_PATH,
      '--os',
      'macos',
      '--runner-label',
      'macos-15',
      '--node-arch',
      'arm64',
      '--output',
      output,
    ],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_ACTIONS: '',
        RUNNER_ENVIRONMENT: '',
      },
    },
  );
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /GITHUB_ACTIONS_REQUIRED/u);
  assert.equal(existsSync(output), false);

  const mismatchedNodeArchitecture = spawnSync(
    process.execPath,
    [
      HARNESS_PATH,
      '--os',
      'macos',
      '--runner-label',
      'macos-15',
      '--node-arch',
      'x64',
      '--output',
      output,
    ],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    },
  );
  assert.notEqual(mismatchedNodeArchitecture.status, 0);
  assert.match(
    mismatchedNodeArchitecture.stderr,
    /RUNNER_NODE_ARCHITECTURE_MISMATCH/u,
  );
  assert.equal(existsSync(output), false);
});
