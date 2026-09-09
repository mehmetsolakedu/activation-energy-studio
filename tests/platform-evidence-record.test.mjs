import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { deflateSync, gunzipSync } from 'node:zlib';

import {
  PlatformEvidenceValidationError,
  createPlatformEvidenceRecord,
  serializePlatformEvidenceRecord,
  writePlatformEvidenceRecord,
} from '../scripts/create-platform-evidence-record.mjs';
import { createHostedWorkflowPreflight } from '../scripts/write-hosted-workflow-preflight.mjs';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(TEST_DIRECTORY, '..');
const CONTRACT_VERSION = process.env.AES_PLATFORM_VALIDATION_VERSION ?? '0.2.0';
const IS_V032_CONTRACT = CONTRACT_VERSION === '0.3.2';
const hostedPlatformHelper = IS_V032_CONTRACT
  ? await import('../scripts/platform-hosted-ci-v032.mjs')
  : await import('../scripts/platform-hosted-ci.mjs');
const {
  EXTERNAL_PROTOCOLS_BLOCKED,
  REQUIRED_DOM_CONTRACT_SELECTORS,
  cdpEventsToHar,
} = hostedPlatformHelper;
const SCIENTIFIC_COMPARATOR_FILE = IS_V032_CONTRACT
  ? 'compare-scientific-reports-v032.mjs'
  : 'compare-scientific-reports.mjs';
const scientificComparator = IS_V032_CONTRACT
  ? await import('../scripts/compare-scientific-reports-v032.mjs')
  : await import('../scripts/compare-scientific-reports.mjs');
const { scientificReportHash } = scientificComparator;
const REPORT_SCHEMA = IS_V032_CONTRACT
  ? 'activation-energy-studio/project-report/v6'
  : 'activation-energy-studio/project-report/v4';
const SCRIPT_PATH = resolve(PROJECT_ROOT, 'scripts/create-platform-evidence-record.mjs');
const COMPARATOR_PATH = resolve(PROJECT_ROOT, 'scripts', SCIENTIFIC_COMPARATOR_FILE);
const RELEASE_PATH = IS_V032_CONTRACT
  ? resolve(PROJECT_ROOT, 'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html')
  : resolve(PROJECT_ROOT, 'release/Activation-Energy-Studio-v0.2.0.html');
const GOLDEN_INPUT_PATH = resolve(PROJECT_ROOT, 'examples/synthetic_kas_150.csv');
const EXPECTED_SCIENTIFIC_BUILD_SHA256 =
  IS_V032_CONTRACT
    ? '4c834b6f8acbaed7d893049ab9b38fab9ac6b88f7691b76f5151bf3dae513756'
    : '38a8d33c1d1d90e361078ae98bb4721dee6442e16453166df4219bc69f29d0a7';
const EXPECTED_SCIENTIFIC_PAYLOAD_SHA256 =
  '2b53c8311cf5b4fda612a455d92e00a6e3b9eaa6ad24e293430af05ee4eae2ba';
const V032_BROWSER_VERSION = '150.0.7871.188';
const V032_JAVASCRIPT_VERSION = '15.0.245.21';
const V032_MACOS_USER_AGENT =
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/${V032_BROWSER_VERSION} Safari/537.36`;
const V032_REPOSITORY = 'example/activation-energy-studio-validation';
const V032_RUN_ID = '9000';
const V032_RUN_ATTEMPT = '1';
const V032_COMMIT_SHA = 'a'.repeat(40);
const V032_GIT_REF = 'refs/heads/main';
// Gzipped deterministic output of runPlatformSelfTest() using the fixture runtime below.
// The current build fingerprint is rebound below because this Node-only recorder test
// intentionally does not execute the browser app. The Vitest app-integration test separately
// proves that runPlatformSelfTest() emits the same locked fingerprint and 11/11 PASS record.
const SELF_TEST_PASS_GZIP_BASE64 =
  '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';
const temporaryDirectories = [];

after(() => {
  temporaryDirectories.forEach((path) => rmSync(path, { recursive: true, force: true }));
});

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function currentBuildSelfTestBytes() {
  const record = JSON.parse(
    gunzipSync(Buffer.from(SELF_TEST_PASS_GZIP_BASE64, 'base64')).toString('utf8'),
  );
  record.application.version = CONTRACT_VERSION;
  record.application.scientificBuildSha256 = EXPECTED_SCIENTIFIC_BUILD_SHA256;
  record.application.coreMathVersion = 'activation-energy-core/v2';
  record.application.formulaSetVersion = 'activation-energy-formulas/v1';
  record.application.reportSchemaVersion = REPORT_SCHEMA;
  const buildCheck = record.checks.find((check) => check.id === 'BUILD-FINGERPRINT');
  assert.ok(buildCheck, 'embedded app self-test fixture must contain BUILD-FINGERPRINT');
  buildCheck.observed = EXPECTED_SCIENTIFIC_BUILD_SHA256;
  const starinkEstimate = record.scientificPayload.methodsResults
    .find((method) => method.method === 'STARINK')
    ?.estimates.find((estimate) => estimate.alpha === 0.4);
  assert.ok(starinkEstimate, 'embedded app self-test fixture must contain STARINK alpha=0.4');
  starinkEstimate.activationEnergyKJPerMol = 150.28304748224974;
  record.expectations.scientificPayloadCanonicalization = {
    id: 'platform-self-test-scientific-payload-canonical-v1',
    activationEnergyDecimalPlaces: 6,
    r2DecimalPlaces: 12,
    alphaDecimalPlaces: 6,
    thresholdDecimalPlaces: 6,
    integerFields: ['n'],
    categoricalFields: 'exact',
    arrayOrder: 'preserved',
    rawPayloadRetention: 'full-precision',
  };
  record.expectations.expectedScientificPayloadSha256 = EXPECTED_SCIENTIFIC_PAYLOAD_SHA256;
  record.scientificPayloadSha256 = EXPECTED_SCIENTIFIC_PAYLOAD_SHA256;
  const payloadCheck = record.checks.find(
    (check) => check.id === 'SCIENTIFIC-PAYLOAD-SHA256',
  );
  assert.ok(
    payloadCheck,
    'embedded app self-test fixture must contain SCIENTIFIC-PAYLOAD-SHA256',
  );
  payloadCheck.expected = EXPECTED_SCIENTIFIC_PAYLOAD_SHA256;
  payloadCheck.observed = EXPECTED_SCIENTIFIC_PAYLOAD_SHA256;
  if (IS_V032_CONTRACT) {
    record.runtime.userAgent = V032_MACOS_USER_AGENT;
    record.runtime.platform = 'MacIntel';
  }
  return Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const csvHeaders = [
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

function makeReport() {
  const methods = ['FWO', 'KAS', 'STARINK', 'FRIEDMAN'];
  const alphaGrid = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  const energyByMethod = { FWO: 151, KAS: 150, STARINK: 149.5, FRIEDMAN: 152 };
  const results = methods.flatMap((method, methodIndex) =>
    alphaGrid.map((alpha) => ({
      resultId: `isoconversional:${method}:${alpha}`,
      quantity: 'apparent activation energy',
      claimBoundary: 'Apparent activation energy; not a universal material constant.',
      confidenceBoundary: 'Regression scatter only.',
      sample: 'synthetic-kas',
      process: 'multi-rate thermal decomposition',
      stage: 'supplied-alpha 0.10-0.90 window',
      atmosphere: 'N2',
      method,
      resultType: 'isoconversional',
      formulaId: `fixture-${method.toLowerCase()}`,
      alpha,
      activationEnergyKJPerMol: energyByMethod[method],
      confidence95LowerKJPerMol: energyByMethod[method] - 1,
      confidence95UpperKJPerMol: energyByMethod[method] + 1,
      n: 4,
      rawObservationCount: 4,
      residualDegreesOfFreedom: 2,
      regressionInputAggregation: 'none',
      r2: 0.999,
      slope: -1000 - methodIndex,
      slopeStandardError: 1 + methodIndex,
      status: 'success',
      disposition: 'REPORTABLE',
    })),
  );
  const goldenBytes = readFileSync(GOLDEN_INPUT_PATH);
  return {
    schemaVersion: REPORT_SCHEMA,
    application: {
      name: 'Activation Energy Studio',
      version: CONTRACT_VERSION,
      calculationLocation: 'local-browser',
    },
    generatedAt: '2026-07-18T10:05:00.000Z',
    context: {
      projectName: 'Platform golden',
      sample: 'synthetic-kas',
      process: 'multi-rate thermal decomposition',
      atmosphere: 'N2',
      stage: 'supplied-alpha 0.10-0.90 window',
      sourceFiles: [
        {
          name: 'synthetic_kas_150.csv',
          sizeBytes: goldenBytes.length,
          sha256: createHash('sha256').update(goldenBytes).digest('hex'),
          sourceFileId: `sha256:${createHash('sha256').update(goldenBytes).digest('hex')}`,
        },
      ],
    },
    scientificBoundary: { fixture: true },
    reproducibility: {
      configuration: {
        alphaGrid,
        selectedMethods: methods,
        includeKissinger: false,
        minR2Warning: 0.98,
        stageWindowCelsius: null,
      },
    },
    analysis: {
      status: 'success',
      eligibility: { commonAlphaRange: [0.1, 0.9] },
      methods: methods.map((method) => ({ method })),
    },
    results,
    traceability: { fixture: true },
  };
}

function reportCsv(report) {
  const rows = report.results.map((result) => {
    const row = {
      schemaVersion: report.schemaVersion,
      applicationVersion: report.application.version,
      ...result,
    };
    return csvHeaders.map((header) => csvCell(row[header])).join(',');
  });
  return `${csvHeaders.join(',')}\n${rows.join('\n')}\n`;
}

function artifact(path) {
  return { path, sha256: hashFile(path) };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, payload) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, payload])));
  return Buffer.concat([length, typeBytes, payload, checksum]);
}

function makeScreenshotPng(width = 640, height = 360) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const stride = width * 3 + 1;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    pixels[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 3;
      pixels[offset] = (x * 17 + y * 3) & 0xff;
      pixels[offset + 1] = (x * 5 + y * 11) & 0xff;
      pixels[offset + 2] = (x * 13 + y * 7) & 0xff;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeNetworkHar(capture = null) {
  const har = {
    log: {
      version: '1.2',
      creator: { name: 'Fixture DevTools', version: '1.0.0' },
      pages: [
        {
          startedDateTime: '2026-07-18T10:00:05.000Z',
          id: 'page_1',
          title: 'Activation Energy Studio',
          pageTimings: { onContentLoad: 120, onLoad: 180 },
        },
      ],
      entries: [
        {
          pageref: 'page_1',
          startedDateTime: '2026-07-18T10:00:05.000Z',
          time: 180,
          request: {
            method: 'GET',
            url: `file:///validation/Activation-Energy-Studio-v${CONTRACT_VERSION}.html`,
          },
        },
      ],
    },
  };
  if (capture) har.log._capture = capture;
  return har;
}

function makeV032Capture(paths) {
  const baseEpoch = Date.parse('2026-07-18T10:00:00.000Z');
  const marker = (monotonicMs) => ({
    utc: new Date(baseEpoch + monotonicMs).toISOString(),
    monotonicMs,
  });
  const download = (role, filePath, offset) => {
    const bytes = readFileSync(filePath).length;
    const fileName = filePath.split('/').at(-1);
    const guid = `guid-${role}`;
    return {
      path: fileName,
      complete: true,
      bytes,
      sha256: hashFile(filePath),
      suggestedFilename: fileName,
      protocolEvents: {
        willBegin: {
          guid,
          suggestedFilename: fileName,
          url: `blob:null/${guid}`,
          observedAt: marker(offset),
        },
        completed: {
          guid,
          state: 'completed',
          receivedBytes: bytes,
          totalBytes: bytes,
          observedAt: marker(offset + 20),
        },
      },
      stableSizeObservations: [
        { bytes, observedAt: marker(offset + 30) },
        { bytes, observedAt: marker(offset + 40) },
      ],
    };
  };
  const downloads = {
    selfTestJson: download('self-test', paths.selfTestJson, 500),
    reportJson: download('json', paths.reportJson, 2500),
    reportCsv: download('csv', paths.reportCsv, 3300),
    reportPdf: download('pdf', paths.reportPdf, 4100),
  };
  const downloadEvidence = (role) => ({
    downloadRole: role,
    guid: downloads[role].protocolEvents.willBegin.guid,
    protocolState: 'completed',
    bytes: downloads[role].bytes,
    sha256: downloads[role].sha256,
  });
  const timelineEnvelope = {
    captureStartedAt: marker(0),
    captureEndedAt: marker(5000),
    actions: [
      {
        id: 'page-open',
        before: marker(100),
        after: marker(300),
        verified: true,
        evidence: {
          documentProtocol: 'file:',
          onlineStateDuringRun: false,
          domContract: {
            selectorsPresent: [...REQUIRED_DOM_CONTRACT_SELECTORS],
          },
        },
      },
      {
        id: 'self-test',
        before: marker(400),
        after: marker(600),
        verified: true,
        evidence: { status: 'PASS', ...downloadEvidence('selfTestJson') },
      },
      {
        id: 'upload',
        before: marker(700),
        after: marker(900),
        verified: true,
        evidence: {
          fileCount: 1,
          fileName: 'Platform-Golden-synthetic_kas_150.csv',
          runAnalysisEnabled: true,
        },
      },
      {
        id: 'analysis',
        before: marker(1000),
        after: marker(2200),
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
        before: marker(2400),
        after: marker(2600),
        verified: true,
        evidence: downloadEvidence('reportJson'),
      },
      {
        id: 'csv-export',
        before: marker(3200),
        after: marker(3400),
        verified: true,
        evidence: downloadEvidence('reportCsv'),
      },
      {
        id: 'pdf-export',
        before: marker(4000),
        after: marker(4200),
        verified: true,
        evidence: downloadEvidence('reportPdf'),
      },
    ],
  };
  const targetLedger = {
    autoAttach: {
      autoAttach: true,
      flatten: true,
      waitForDebuggerOnStart: true,
    },
    browserSessionId: 'browser-session-fixture',
    mainPageTargetId: 'target-fixture',
    mainPageSessionId: 'session-fixture',
    targets: [
      {
        targetId: 'tab-fixture',
        sessionId: 'tab-session-fixture',
        parentSessionId: 'browser-session-fixture',
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
        targetId: 'target-fixture',
        sessionId: 'session-fixture',
        parentSessionId: 'tab-session-fixture',
        type: 'page',
        url: `file:///validation/Activation-Energy-Studio-v${CONTRACT_VERSION}.html`,
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
    ],
    discoveredTargets: [
      {
        targetId: 'tab-fixture',
        type: 'tab',
        url: '',
        destroyedAt: null,
      },
      {
        targetId: 'target-fixture',
        type: 'page',
        url: `file:///validation/Activation-Energy-Studio-v${CONTRACT_VERSION}.html`,
        destroyedAt: null,
      },
    ],
    unsupportedTargets: [],
    unobservedDescendantTargets: [],
  };
  const events = [
    {
      method: 'Network.requestWillBeSent',
      params: {
        requestId: 'request-fixture',
        timestamp: 100,
        wallTime: (baseEpoch + 200) / 1000,
        type: 'Document',
        request: {
          method: 'GET',
          url: `file:///validation/Activation-Energy-Studio-v${CONTRACT_VERSION}.html`,
          headers: { Accept: 'text/html' },
        },
      },
      sessionId: 'session-fixture',
      targetId: 'target-fixture',
      targetType: 'page',
      observedAt: marker(200),
    },
    {
      method: 'Network.responseReceived',
      params: {
        requestId: 'request-fixture',
        timestamp: 100.1,
        response: {
          status: 200,
          statusText: 'OK',
          protocol: 'file',
          headers: { 'Content-Type': 'text/html' },
          mimeType: 'text/html',
          encodedDataLength: 1024,
        },
      },
      sessionId: 'session-fixture',
      targetId: 'target-fixture',
      targetType: 'page',
      observedAt: marker(250),
    },
    {
      method: 'Page.domContentEventFired',
      params: { timestamp: 100.2 },
      sessionId: 'session-fixture',
      targetId: 'target-fixture',
      targetType: 'page',
      observedAt: marker(300),
    },
    {
      method: 'Page.loadEventFired',
      params: { timestamp: 100.3 },
      sessionId: 'session-fixture',
      targetId: 'target-fixture',
      targetType: 'page',
      observedAt: marker(350),
    },
    {
      method: 'Network.loadingFinished',
      params: {
        requestId: 'request-fixture',
        timestamp: 100.4,
        encodedDataLength: 1024,
      },
      sessionId: 'session-fixture',
      targetId: 'target-fixture',
      targetType: 'page',
      observedAt: marker(400),
    },
  ];
  const converted = cdpEventsToHar(events, {
    capture: {
      timeline: timelineEnvelope,
      targetLedger,
      downloads,
    },
    pageId: 'page_1',
    pageTitle: 'Activation Energy Studio',
    creatorName: 'Fixture DevTools',
    creatorVersion: '1.0.0',
    allowExternalForDiagnostics: false,
  });
  const capture = converted.har.log._capture;
  return {
    raw: {
      schema: 'activation-energy-studio/raw-cdp-network-events/v2',
      claimStatus: 'AUTOMATED_RUN_EVIDENCE_AWAITING_HUMAN_REVIEW',
      captureStartedAt: capture.captureStartedAt,
      captureEndedAt: capture.captureEndedAt,
      timeline: capture.timeline,
      targetLedger: capture.targetLedger,
      downloads: capture.downloads,
      events,
    },
    har: converted.har,
    metadataTimeline: {
      captureStartedAt: capture.captureStartedAt,
      captureEndedAt: capture.captureEndedAt,
      actions: capture.timeline,
      coverage: capture.networkCoverage,
    },
    targetLedger: capture.targetLedger,
    downloads: capture.downloads,
    networkInspection: converted.inspection,
  };
}

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'activation-energy-platform-evidence-'));
  temporaryDirectories.push(directory);
  const report = makeReport();
  const paths = {
    selfTestJson: join(
      directory,
      `activation-energy-platform-self-test-v${CONTRACT_VERSION}-pass.json`,
    ),
    reportJson: join(directory, 'platform-golden.json'),
    reportCsv: join(directory, 'platform-golden-results.csv'),
    reportPdf: join(directory, 'platform-golden-report.pdf'),
    networkHar: join(directory, 'network.har'),
    rawCdpEvents: join(directory, 'raw-cdp-events.json'),
    screenshot: join(directory, 'result.png'),
    hostedRunMetadata: join(directory, 'hosted-run-metadata.json'),
    hostedWorkflowPreflight: join(directory, 'hosted-workflow-preflight.json'),
    hostedUploadReceipt: join(directory, 'hosted-upload-receipt.json'),
    manifest: join(directory, 'run-input.json'),
    output: join(directory, 'evidence-record.json'),
  };
  writeFileSync(paths.selfTestJson, currentBuildSelfTestBytes());
  writeFileSync(paths.reportJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(paths.reportCsv, reportCsv(report));
  writeFileSync(paths.reportPdf, Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n'));
  writeFileSync(
    paths.networkHar,
    `${JSON.stringify(makeNetworkHar(), null, 2)}\n`,
  );
  writeFileSync(paths.screenshot, makeScreenshotPng());
  const v032Capture = IS_V032_CONTRACT ? makeV032Capture(paths) : null;
  if (v032Capture) {
    writeFileSync(
      paths.networkHar,
      `${JSON.stringify(v032Capture.har, null, 2)}\n`,
    );
    writeFileSync(
      paths.rawCdpEvents,
      `${JSON.stringify(v032Capture.raw, null, 2)}\n`,
    );
  }
  const manifest = {
    schemaVersion: 'activation-energy-studio/platform-run-input/v1',
    runId: IS_V032_CONTRACT
      ? `gha-macos-${V032_RUN_ID}-${V032_RUN_ATTEMPT}`
      : 'macos-2026-07-18-golden-01',
    observer: { name: 'Independent tester', organization: 'Validation laboratory' },
    startedAt: '2026-07-18T10:00:00.000Z',
    endedAt: '2026-07-18T10:10:00.000Z',
    environment: {
      os: { family: 'macos', edition: 'macOS 15.5', build: '24F74', architecture: 'arm64' },
      runtime: {
        documentProtocol: 'file:',
        onlineStateDuringRun: false,
        userAgent: IS_V032_CONTRACT ? V032_MACOS_USER_AGENT : 'FixtureBrowser/1.0',
        javascriptEngine: IS_V032_CONTRACT
          ? `V8 ${V032_JAVASCRIPT_VERSION}`
          : 'FixtureJS 1.0',
      },
      browser: {
        name: IS_V032_CONTRACT ? 'Google Chrome (headless)' : 'Fixture Browser',
        version: IS_V032_CONTRACT ? V032_BROWSER_VERSION : '1.0.0',
        engine: IS_V032_CONTRACT
          ? `Chromium ${V032_BROWSER_VERSION}; V8 ${V032_JAVASCRIPT_VERSION}`
          : 'Fixture Engine 1.0',
        navigatorLanguage: 'en-US',
        navigatorLanguages: ['en-US'],
      },
      locale: { osLocale: 'en-US', timeZone: 'UTC', decimalSeparator: '.' },
    },
    protocol: {
      offlineMode: true,
      declaredExternalRequestAttempts: 0,
      networkCapture: {
        format: 'HAR',
        complete: true,
        capturedWhileOffline: true,
        covers: ['page-open', 'upload', 'analysis', 'json-export', 'csv-export', 'pdf-export'],
      },
      operatorConfirmations: {
        releaseAndInputHashesChecked: true,
        contextValuesRecorded: true,
        analysisCompleted: true,
        allExportsSaved: true,
        networkLogSavedBeforeReconnect: true,
      },
      deviations: [],
    },
    artifacts: {
      release: artifact(RELEASE_PATH),
      goldenInput: artifact(GOLDEN_INPUT_PATH),
      selfTestJson: artifact(paths.selfTestJson),
      reportJson: artifact(paths.reportJson),
      reportCsv: artifact(paths.reportCsv),
      reportPdf: artifact(paths.reportPdf),
      networkHar: artifact(paths.networkHar),
      screenshot: artifact(paths.screenshot),
      ...(IS_V032_CONTRACT
        ? { rawCdpEvents: artifact(paths.rawCdpEvents) }
        : {}),
    },
  };
  if (IS_V032_CONTRACT) {
    const preflight = createHostedWorkflowPreflight({
      osFamily: 'macos',
      runnerLabel: 'macos-15',
      nodeArchitecture: 'arm64',
      environment: {
        GITHUB_ACTIONS: 'true',
        RUNNER_ENVIRONMENT: 'github-hosted',
        RUNNER_OS: 'macOS',
        RUNNER_ARCH: 'ARM64',
        ImageOS: 'macos15',
        ImageVersion: '20260715.0234.1',
        GITHUB_REPOSITORY: V032_REPOSITORY,
        GITHUB_WORKFLOW: 'Hosted Platform Validation v0.3.2',
        GITHUB_WORKFLOW_REF:
          `${V032_REPOSITORY}/.github/workflows/platform-validation-v032.yml@${V032_GIT_REF}`,
        GITHUB_RUN_ID: V032_RUN_ID,
        GITHUB_RUN_ATTEMPT: V032_RUN_ATTEMPT,
        GITHUB_SHA: V032_COMMIT_SHA,
        GITHUB_REF: V032_GIT_REF,
        GITHUB_SERVER_URL: 'https://github.com',
      },
      runtime: {
        version: 'v22.22.3',
        arch: 'arm64',
        platform: 'darwin',
      },
      now: new Date('2026-07-18T09:59:00.000Z'),
    });
    writeFileSync(
      paths.hostedWorkflowPreflight,
      `${JSON.stringify(preflight, null, 2)}\n`,
    );
    const freezePath = resolve(
      PROJECT_ROOT,
      'output/v0.3.2-external-validation/CANDIDATE_FREEZE.json',
    );
    const freezeChecksumPath = resolve(
      PROJECT_ROOT,
      'output/v0.3.2-external-validation/CANDIDATE_FREEZE.sha256',
    );
    const metadata = {
      schema: 'activation-energy-studio/hosted-platform-run/v1',
      claimStatus: 'AUTOMATED_RUN_EVIDENCE_AWAITING_HUMAN_REVIEW',
      humanReviewCompleted: false,
      operatorConfirmationsCompleted: false,
      family: 'macos',
      runner: {
        runnerLabel: 'macos-15',
        family: 'macos',
        platform: 'darwin',
        architecture: 'arm64',
        osEdition: manifest.environment.os.edition,
      },
      osBuild: manifest.environment.os.build,
      osLocale: manifest.environment.locale.osLocale,
      reportedArchitecture: 'arm64',
      nodeArchitecture: 'arm64',
      provenance: {
        provider: 'GitHub Actions',
        repository: V032_REPOSITORY,
        workflow: 'Hosted Platform Validation v0.3.2',
        workflowRef:
          `${V032_REPOSITORY}/.github/workflows/platform-validation-v032.yml@${V032_GIT_REF}`,
        runId: V032_RUN_ID,
        runAttempt: V032_RUN_ATTEMPT,
        runUrl:
          `https://github.com/${V032_REPOSITORY}/actions/runs/${V032_RUN_ID}/attempts/${V032_RUN_ATTEMPT}`,
        commitSha: V032_COMMIT_SHA,
        gitRef: V032_GIT_REF,
        runnerEnvironment: 'github-hosted',
        runnerName: 'GitHub Actions 1000000001',
        runnerOS: 'macOS',
        runnerArchitecture: 'ARM64',
        imageOS: 'macos15',
        imageVersion: '20260715.0234.1',
        browserExpectation: {
          product: 'Google Chrome',
          expectedMajor: 150,
          environment: 'AES_EXPECTED_GOOGLE_CHROME_MAJOR',
        },
        actions: {
          checkout: {
            commitSha: 'd23441a48e516b6c34aea4fa41551a30e30af803',
            environment: 'AES_ACTION_CHECKOUT_SHA',
          },
          setupNode: {
            commitSha: '249970729cb0ef3589644e2896645e5dc5ba9c38',
            environment: 'AES_ACTION_SETUP_NODE_SHA',
          },
          uploadArtifact: {
            commitSha: 'b7c566a772e6b6bfb58ed0dc250532a479d7789f',
            environment: 'AES_ACTION_UPLOAD_ARTIFACT_SHA',
          },
        },
      },
      candidateFreeze: {
        record: {
          path: 'CANDIDATE_FREEZE.v0.3.2.json',
          bytes: readFileSync(freezePath).length,
          sha256: hashFile(freezePath),
        },
        checksum: {
          path: 'CANDIDATE_FREEZE.v0.3.2.sha256',
          bytes: readFileSync(freezeChecksumPath).length,
          sha256: hashFile(freezeChecksumPath),
        },
      },
      workflowPreflight: {
        path: 'hosted-workflow-preflight.json',
        bytes: readFileSync(paths.hostedWorkflowPreflight).length,
        sha256: hashFile(paths.hostedWorkflowPreflight),
      },
      browser: {
        executable: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        product: `Chrome/${V032_BROWSER_VERSION}`,
        version: V032_BROWSER_VERSION,
        observedMajor: 150,
        expectedMajor: 150,
        revision: '@fixture',
        protocolVersion: '1.3',
        javascriptVersion: V032_JAVASCRIPT_VERSION,
        userAgent: V032_MACOS_USER_AGENT,
        headless: true,
      },
      runtime: {
        documentProtocol: 'file:',
        onlineStateDuringRun: false,
        userAgent: V032_MACOS_USER_AGENT,
        navigatorLanguage: 'en-US',
        navigatorLanguages: ['en-US'],
        timeZone: 'UTC',
        decimalSeparator: '.',
      },
      startedAt: manifest.startedAt,
      endedAt: manifest.endedAt,
      reportGeneratedAt: report.generatedAt,
      artifacts: Object.fromEntries(
        Object.entries(manifest.artifacts)
          .filter(([role]) => role !== 'rawCdpEvents')
          .map(([role, descriptor]) => [
          role,
          {
            path: descriptor.path.split('/').at(-1),
            sha256: descriptor.sha256,
          },
          ]),
      ),
      actionTimeline: v032Capture.metadataTimeline,
      targetLedger: v032Capture.targetLedger,
      downloads: v032Capture.downloads,
      networkInspection: v032Capture.networkInspection,
      retainedFiles: {
        rawCdpEvents: {
          path: 'raw-cdp-events.json',
          bytes: readFileSync(paths.rawCdpEvents).length,
          sha256: hashFile(paths.rawCdpEvents),
        },
        draftManifest: 'platform-run-input.macos.draft.json',
      },
      platformCriteriaClosed: [],
      claimBoundary:
        'Automated hosted evidence awaits human review and does not close a platform criterion by itself.',
    };
    writeFileSync(
      paths.hostedRunMetadata,
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
    const receipt = {
      schemaVersion:
        'activation-energy-studio/github-actions-artifact-receipt/v1',
      provider: 'GitHub Actions',
      repository: V032_REPOSITORY,
      workflow: 'Hosted Platform Validation v0.3.2',
      runId: V032_RUN_ID,
      runAttempt: V032_RUN_ATTEMPT,
      commitSha: V032_COMMIT_SHA,
      artifactId: '123456789',
      artifactName:
        `hosted-platform-v0.3.2-macos-${V032_RUN_ID}-${V032_RUN_ATTEMPT}`,
      artifactUrl:
        `https://github.com/${V032_REPOSITORY}/actions/runs/${V032_RUN_ID}/artifacts/123456789`,
      artifactDigest: 'b'.repeat(64),
      capturedAtUtc: '2026-07-18T10:20:00.000Z',
      claimBoundary:
        'DECLARED_GITHUB_ACTIONS_UPLOAD_OUTPUT_NOT_AUTHENTICATED_BY_SOFTWARE',
    };
    writeFileSync(
      paths.hostedUploadReceipt,
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    Object.assign(manifest.artifacts, {
      hostedRunMetadata: artifact(paths.hostedRunMetadata),
      hostedWorkflowPreflight: artifact(paths.hostedWorkflowPreflight),
      hostedUploadReceipt: artifact(paths.hostedUploadReceipt),
    });
  }
  writeFileSync(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  return { directory, manifest, paths, report };
}

function writeManifest(fixture) {
  writeFileSync(fixture.paths.manifest, `${JSON.stringify(fixture.manifest, null, 2)}\n`);
}

function rebindHostedMetadataArtifact(fixture, role) {
  assert.equal(IS_V032_CONTRACT, true);
  const retained = fixture.manifest.artifacts[role];
  const raw = JSON.parse(readFileSync(fixture.paths.rawCdpEvents, 'utf8'));
  if (raw.downloads[role]) {
    const bytes = readFileSync(retained.path).length;
    const download = raw.downloads[role];
    download.bytes = bytes;
    download.sha256 = retained.sha256;
    download.protocolEvents.completed.receivedBytes = bytes;
    download.protocolEvents.completed.totalBytes = bytes;
    for (const observation of download.stableSizeObservations) {
      observation.bytes = bytes;
    }
    const actionId = {
      selfTestJson: 'self-test',
      reportJson: 'json-export',
      reportCsv: 'csv-export',
      reportPdf: 'pdf-export',
    }[role];
    const action = raw.timeline.find((entry) => entry.id === actionId);
    action.evidence.bytes = bytes;
    action.evidence.sha256 = retained.sha256;
  }
  writeFileSync(
    fixture.paths.rawCdpEvents,
    `${JSON.stringify(raw, null, 2)}\n`,
  );
  fixture.manifest.artifacts.rawCdpEvents = artifact(
    fixture.paths.rawCdpEvents,
  );
  const previousHar = JSON.parse(readFileSync(fixture.paths.networkHar, 'utf8'));
  const converted = cdpEventsToHar(raw.events, {
    capture: {
      timeline: {
        captureStartedAt: raw.captureStartedAt,
        captureEndedAt: raw.captureEndedAt,
        actions: raw.timeline,
      },
      targetLedger: raw.targetLedger,
      downloads: raw.downloads,
    },
    pageId: previousHar.log.pages[0].id,
    pageTitle: previousHar.log.pages[0].title,
    creatorName: previousHar.log.creator.name,
    creatorVersion: previousHar.log.creator.version,
    allowExternalForDiagnostics: false,
  });
  writeFileSync(
    fixture.paths.networkHar,
    `${JSON.stringify(converted.har, null, 2)}\n`,
  );
  fixture.manifest.artifacts.networkHar = artifact(fixture.paths.networkHar);
  const metadata = JSON.parse(
    readFileSync(fixture.paths.hostedRunMetadata, 'utf8'),
  );
  metadata.artifacts[role] = {
    path: retained.path.split('/').at(-1),
    sha256: retained.sha256,
  };
  metadata.artifacts.networkHar = {
    path: fixture.paths.networkHar.split('/').at(-1),
    sha256: fixture.manifest.artifacts.networkHar.sha256,
  };
  metadata.actionTimeline = {
    captureStartedAt: converted.har.log._capture.captureStartedAt,
    captureEndedAt: converted.har.log._capture.captureEndedAt,
    actions: converted.har.log._capture.timeline,
    coverage: converted.har.log._capture.networkCoverage,
  };
  metadata.targetLedger = converted.har.log._capture.targetLedger;
  metadata.downloads = converted.har.log._capture.downloads;
  metadata.networkInspection = converted.inspection;
  metadata.retainedFiles.rawCdpEvents = {
    path: 'raw-cdp-events.json',
    bytes: readFileSync(fixture.paths.rawCdpEvents).length,
    sha256: fixture.manifest.artifacts.rawCdpEvents.sha256,
  };
  writeFileSync(
    fixture.paths.hostedRunMetadata,
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  fixture.manifest.artifacts.hostedRunMetadata = artifact(
    fixture.paths.hostedRunMetadata,
  );
}

function rebindRawCdpArtifact(fixture, { alignHarCapture = false } = {}) {
  assert.equal(IS_V032_CONTRACT, true);
  const raw = JSON.parse(readFileSync(fixture.paths.rawCdpEvents, 'utf8'));
  fixture.manifest.artifacts.rawCdpEvents = artifact(
    fixture.paths.rawCdpEvents,
  );
  const metadata = JSON.parse(
    readFileSync(fixture.paths.hostedRunMetadata, 'utf8'),
  );
  metadata.retainedFiles.rawCdpEvents = {
    path: 'raw-cdp-events.json',
    bytes: readFileSync(fixture.paths.rawCdpEvents).length,
    sha256: fixture.manifest.artifacts.rawCdpEvents.sha256,
  };
  if (alignHarCapture) {
    const har = JSON.parse(readFileSync(fixture.paths.networkHar, 'utf8'));
    har.log._capture.targetLedger = raw.targetLedger;
    writeFileSync(
      fixture.paths.networkHar,
      `${JSON.stringify(har, null, 2)}\n`,
    );
    fixture.manifest.artifacts.networkHar = artifact(fixture.paths.networkHar);
    metadata.targetLedger = raw.targetLedger;
    metadata.artifacts.networkHar = {
      path: 'network.har',
      sha256: fixture.manifest.artifacts.networkHar.sha256,
    };
  }
  writeFileSync(
    fixture.paths.hostedRunMetadata,
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  fixture.manifest.artifacts.hostedRunMetadata = artifact(
    fixture.paths.hostedRunMetadata,
  );
}

function expectCode(callback, code) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof PlatformEvidenceValidationError);
    assert.equal(error.code, code);
    return true;
  });
}

describe('platform retained-evidence record CLI', () => {
  it('creates a deterministic one-run record compatible with the scientific comparator', () => {
    const fixture = createFixture();
    const first = createPlatformEvidenceRecord(fixture.paths.manifest);
    const second = createPlatformEvidenceRecord(fixture.paths.manifest);

    assert.equal(serializePlatformEvidenceRecord(first), serializePlatformEvidenceRecord(second));
    assert.equal(first.recordStatus, 'VALIDATED_RETAINED_ARTIFACT_SET');
    assert.equal(first.claimBoundary.acPlat01, 'ONE_RUN_EVIDENCE_READY_FOR_REVIEW');
    assert.equal(first.claimBoundary.acPlat02, 'AWAITING_THREE_PLATFORM_SCIENTIFIC_JSON_COMPARISON');
    assert.match(first.claimBoundary.statement, /does not by itself close AC-PLAT-01 or AC-PLAT-02/);
    assert.equal(first.protocolObservation.networkCapture.externalRequestAttempts, 0);
    assert.equal(first.protocolObservation.networkCapture.totalEntries, 1);
    assert.equal(first.selfTest.recordStatus, 'PASS');
    assert.equal(first.selfTest.platformGateStatus, 'NOT_CLOSED_BY_SELF_TEST');
    assert.equal(first.selfTest.passedCheckCount, 11);
    assert.equal(first.visualEvidence.screenshot.width, 640);
    assert.equal(first.visualEvidence.screenshot.height, 360);
    assert.equal(first.visualEvidence.contentReviewStatus, 'AWAITING_HUMAN_VISUAL_REVIEW');
    assert.equal(first.scientificReport.canonicalSha256, scientificReportHash(fixture.report));
    assert.equal(first.artifacts.release.sha256, hashFile(RELEASE_PATH));
    assert.equal(first.artifacts.reportPdf.sha256, hashFile(fixture.paths.reportPdf));

    const comparison = spawnSync(
      process.execPath,
      [COMPARATOR_PATH, fixture.paths.reportJson, fixture.paths.reportJson],
      { encoding: 'utf8' },
    );
    assert.equal(comparison.status, 0, comparison.stderr);
    assert.match(comparison.stdout, /PASS SCIENTIFIC_JSON_EQUAL/);
  });

  it('runs end-to-end and writes the record only after validation', () => {
    const fixture = createFixture();
    const result = spawnSync(
      process.execPath,
      [SCRIPT_PATH, '--manifest', fixture.paths.manifest, '--output', fixture.paths.output],
      { cwd: PROJECT_ROOT, encoding: 'utf8' },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^OK PLATFORM_EVIDENCE_RECORD_CREATED /);
    const output = JSON.parse(readFileSync(fixture.paths.output, 'utf8'));
    assert.equal(output.runId, fixture.manifest.runId);
    assert.equal(output.scientificReport.comparatorCompatible, true);
  });

  it('rejects placeholder observer names instead of treating them as retained evidence', () => {
    for (const name of [
      'REPLACE_WITH_REAL_OBSERVER',
      'AWAITING_REAL_OBSERVER',
      'TBD',
      'TODO',
      'UNKNOWN',
      'PENDING REVIEWER',
      'PLACEHOLDER',
      'UNASSIGNED',
      'N/A',
      'NOT ASSIGNED',
      'TO BE CONFIRMED',
      'TO BE DETERMINED',
    ]) {
      const fixture = createFixture();
      fixture.manifest.observer.name = name;
      writeManifest(fixture);
      expectCode(() => createPlatformEvidenceRecord(fixture.paths.manifest), 'INPUT_INVALID');
    }
  });

  it('fails closed on a hash mismatch or missing retained artifact', () => {
    const hashFixture = createFixture();
    hashFixture.manifest.artifacts.reportPdf.sha256 = '0'.repeat(64);
    writeManifest(hashFixture);
    expectCode(
      () => writePlatformEvidenceRecord(hashFixture.paths.manifest, hashFixture.paths.output),
      'HASH_MISMATCH',
    );
    assert.equal(
      spawnSync(process.execPath, ['-e', `require('fs').existsSync(${JSON.stringify(hashFixture.paths.output)}) ? process.exit(1) : process.exit(0)`]).status,
      0,
    );

    const missingFixture = createFixture();
    missingFixture.manifest.artifacts.screenshot.path = join(missingFixture.directory, 'missing.png');
    missingFixture.manifest.artifacts.screenshot.sha256 = '0'.repeat(64);
    writeManifest(missingFixture);
    expectCode(
      () => writePlatformEvidenceRecord(missingFixture.paths.manifest, missingFixture.paths.output),
      'MISSING_ARTIFACT',
    );
  });

  it('rejects a hash-valid report with the wrong scientific context', () => {
    const fixture = createFixture();
    fixture.report.context.stage = 'different stage';
    writeFileSync(fixture.paths.reportJson, `${JSON.stringify(fixture.report, null, 2)}\n`);
    fixture.manifest.artifacts.reportJson = artifact(fixture.paths.reportJson);
    writeManifest(fixture);

    expectCode(() => createPlatformEvidenceRecord(fixture.paths.manifest), 'REPORT_INCONSISTENT');

    const numericFixture = createFixture();
    numericFixture.report.results.find((row) => row.method === 'KAS').activationEnergyKJPerMol = 149;
    writeFileSync(numericFixture.paths.reportJson, `${JSON.stringify(numericFixture.report, null, 2)}\n`);
    writeFileSync(numericFixture.paths.reportCsv, reportCsv(numericFixture.report));
    numericFixture.manifest.artifacts.reportJson = artifact(numericFixture.paths.reportJson);
    numericFixture.manifest.artifacts.reportCsv = artifact(numericFixture.paths.reportCsv);
    writeManifest(numericFixture);
    expectCode(() => createPlatformEvidenceRecord(numericFixture.paths.manifest), 'REPORT_INCONSISTENT');
  });

  it('rejects a hash-valid CSV export that differs from the JSON result rows', () => {
    const fixture = createFixture();
    writeFileSync(fixture.paths.reportCsv, reportCsv(fixture.report).replace(',150,149,', ',999,149,'));
    fixture.manifest.artifacts.reportCsv = artifact(fixture.paths.reportCsv);
    writeManifest(fixture);

    expectCode(() => createPlatformEvidenceRecord(fixture.paths.manifest), 'CSV_INCONSISTENT');
  });

  it('requires a real PASS self-test record and validates all locked boundary/hash/build/time fields', () => {
    const missingFixture = createFixture();
    delete missingFixture.manifest.artifacts.selfTestJson;
    writeManifest(missingFixture);
    expectCode(() => createPlatformEvidenceRecord(missingFixture.paths.manifest), 'MISSING_ARTIFACT');

    const mutations = [
      (record) => { record.recordStatus = 'FAIL'; },
      (record) => { record.platformGateStatus = 'CLOSED'; },
      (record) => { record.fixture.observedSha256 = '0'.repeat(64); },
      (record) => { record.scientificPayloadSha256 = '0'.repeat(64); },
      (record) => { record.application.scientificBuildSha256 = '0'.repeat(64); },
      (record) => {
        record.expectations.scientificPayloadCanonicalization.activationEnergyDecimalPlaces = 5;
      },
      (record) => {
        record.scientificPayload.methodsResults[1].estimates[0]
          .activationEnergyKJPerMol += 0.001;
      },
      (record) => { record.recordedAt = '2026-07-18T11:00:00.000Z'; },
      (record) => { record.claimBoundary = 'Self-test closes the platform gate.'; },
    ];
    for (const mutate of mutations) {
      const fixture = createFixture();
      const record = JSON.parse(readFileSync(fixture.paths.selfTestJson, 'utf8'));
      mutate(record);
      writeFileSync(fixture.paths.selfTestJson, `${JSON.stringify(record, null, 2)}\n`);
      fixture.manifest.artifacts.selfTestJson = artifact(fixture.paths.selfTestJson);
      writeManifest(fixture);
      expectCode(() => createPlatformEvidenceRecord(fixture.paths.manifest), 'SELF_TEST_INVALID');
    }
  });

  it('rejects an empty or timing-free HAR even when the manifest declares complete offline coverage', () => {
    const emptyFixture = createFixture();
    const emptyHar = {
      log: {
        version: '1.2',
        creator: { name: 'Fixture DevTools', version: '1.0.0' },
        pages: [],
        entries: [],
      },
    };
    writeFileSync(emptyFixture.paths.networkHar, `${JSON.stringify(emptyHar, null, 2)}\n`);
    emptyFixture.manifest.artifacts.networkHar = artifact(emptyFixture.paths.networkHar);
    writeManifest(emptyFixture);
    expectCode(() => createPlatformEvidenceRecord(emptyFixture.paths.manifest), 'NETWORK_EVIDENCE_INVALID');

    const timingFixture = createFixture();
    const timingHar = makeNetworkHar();
    delete timingHar.log.pages[0].pageTimings;
    writeFileSync(timingFixture.paths.networkHar, `${JSON.stringify(timingHar, null, 2)}\n`);
    timingFixture.manifest.artifacts.networkHar = artifact(timingFixture.paths.networkHar);
    writeManifest(timingFixture);
    expectCode(() => createPlatformEvidenceRecord(timingFixture.paths.manifest), 'NETWORK_EVIDENCE_INVALID');
  });

  it('rejects signature-only and implausibly small screenshot evidence', () => {
    const signatureFixture = createFixture();
    writeFileSync(signatureFixture.paths.screenshot, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]));
    signatureFixture.manifest.artifacts.screenshot = artifact(signatureFixture.paths.screenshot);
    writeManifest(signatureFixture);
    expectCode(() => createPlatformEvidenceRecord(signatureFixture.paths.manifest), 'ARTIFACT_INVALID');

    const dimensionsFixture = createFixture();
    writeFileSync(dimensionsFixture.paths.screenshot, makeScreenshotPng(320, 180));
    dimensionsFixture.manifest.artifacts.screenshot = artifact(dimensionsFixture.paths.screenshot);
    writeManifest(dimensionsFixture);
    expectCode(() => createPlatformEvidenceRecord(dimensionsFixture.paths.manifest), 'ARTIFACT_INVALID');
  });

  it('rejects an external HTTP or WebSocket attempt retained in the HAR', () => {
    for (const url of ['https://example.invalid/telemetry', 'wss://example.invalid/socket', 'ftp://example.invalid/file']) {
      const fixture = createFixture();
      const har = makeNetworkHar();
      har.log.entries.push({
        pageref: 'page_1',
        startedDateTime: '2026-07-18T10:00:06.000Z',
        time: 10,
        request: { method: 'GET', url },
      });
      writeFileSync(fixture.paths.networkHar, `${JSON.stringify(har, null, 2)}\n`);
      fixture.manifest.artifacts.networkHar = artifact(fixture.paths.networkHar);
      fixture.manifest.protocol.declaredExternalRequestAttempts = 1;
      writeManifest(fixture);

      expectCode(() => createPlatformEvidenceRecord(fixture.paths.manifest), 'NETWORK_EVIDENCE_INVALID');
    }
  });

  it('rejects incomplete or contradictory platform metadata and network coverage', () => {
    const metadataFixture = createFixture();
    delete metadataFixture.manifest.environment.browser.version;
    writeManifest(metadataFixture);
    expectCode(() => createPlatformEvidenceRecord(metadataFixture.paths.manifest), 'INPUT_INVALID');

    const coverageFixture = createFixture();
    coverageFixture.manifest.protocol.networkCapture.covers = ['page-open', 'analysis'];
    writeManifest(coverageFixture);
    expectCode(() => createPlatformEvidenceRecord(coverageFixture.paths.manifest), 'PROTOCOL_CONTRADICTION');

    const oldUbuntuFixture = createFixture();
    oldUbuntuFixture.manifest.environment.os = {
      family: 'ubuntu',
      edition: 'Ubuntu 20.04 LTS',
      build: '5.15.0',
      architecture: 'x64',
    };
    writeManifest(oldUbuntuFixture);
    expectCode(() => createPlatformEvidenceRecord(oldUbuntuFixture.paths.manifest), 'PROTOCOL_CONTRADICTION');

    const localeFixture = createFixture();
    localeFixture.manifest.environment.locale = {
      osLocale: 'tr-TR',
      timeZone: 'Europe/Istanbul',
      decimalSeparator: '.',
    };
    writeManifest(localeFixture);
    expectCode(() => createPlatformEvidenceRecord(localeFixture.paths.manifest), 'PROTOCOL_CONTRADICTION');
  });

  it(
    'rejects a macOS artifact set relabeled as Windows 11 without matching hosted origin',
    { skip: !IS_V032_CONTRACT },
    () => {
      const fixture = createFixture();
      fixture.manifest.runId = `gha-windows11-${V032_RUN_ID}-${V032_RUN_ATTEMPT}`;
      fixture.manifest.environment.os = {
        family: 'windows11',
        edition: 'Windows 11 Pro',
        build: '26100.4652',
        architecture: 'arm64',
      };
      writeManifest(fixture);
      expectCode(
        () => createPlatformEvidenceRecord(fixture.paths.manifest),
        'HOSTED_ORIGIN_INVALID',
      );
    },
  );

  it(
    'rejects a hash-rebound self-test whose navigator platform contradicts hosted macOS',
    { skip: !IS_V032_CONTRACT },
    () => {
      const fixture = createFixture();
      const selfTest = JSON.parse(readFileSync(fixture.paths.selfTestJson, 'utf8'));
      selfTest.runtime.platform = 'Win32';
      writeFileSync(
        fixture.paths.selfTestJson,
        `${JSON.stringify(selfTest, null, 2)}\n`,
      );
      fixture.manifest.artifacts.selfTestJson = artifact(fixture.paths.selfTestJson);
      rebindHostedMetadataArtifact(fixture, 'selfTestJson');
      writeManifest(fixture);
      expectCode(
        () => createPlatformEvidenceRecord(fixture.paths.manifest),
        'HOSTED_RUNTIME_IDENTITY_MISMATCH',
      );
    },
  );

  it(
    'rejects hosted source metadata that claims any platform criterion is closed',
    { skip: !IS_V032_CONTRACT },
    () => {
      const fixture = createFixture();
      const metadata = JSON.parse(
        readFileSync(fixture.paths.hostedRunMetadata, 'utf8'),
      );
      metadata.platformCriteriaClosed = ['AC-PLAT-01'];
      writeFileSync(
        fixture.paths.hostedRunMetadata,
        `${JSON.stringify(metadata, null, 2)}\n`,
      );
      fixture.manifest.artifacts.hostedRunMetadata = artifact(
        fixture.paths.hostedRunMetadata,
      );
      writeManifest(fixture);
      expectCode(
        () => createPlatformEvidenceRecord(fixture.paths.manifest),
        'HOSTED_ORIGIN_INVALID',
      );
    },
  );

  it(
    'requires raw CDP evidence and rejects hash-valid capture or external-channel tampering',
    { skip: !IS_V032_CONTRACT },
    () => {
      const missing = createFixture();
      delete missing.manifest.artifacts.rawCdpEvents;
      writeManifest(missing);
      expectCode(
        () => createPlatformEvidenceRecord(missing.paths.manifest),
        'MISSING_ARTIFACT',
      );

      const captureMismatch = createFixture();
      const mismatchedRaw = JSON.parse(
        readFileSync(captureMismatch.paths.rawCdpEvents, 'utf8'),
      );
      mismatchedRaw.captureEndedAt.monotonicMs += 1;
      writeFileSync(
        captureMismatch.paths.rawCdpEvents,
        `${JSON.stringify(mismatchedRaw, null, 2)}\n`,
      );
      rebindRawCdpArtifact(captureMismatch);
      writeManifest(captureMismatch);
      expectCode(
        () => createPlatformEvidenceRecord(captureMismatch.paths.manifest),
        'RAW_CDP_EVIDENCE_INVALID',
      );

      const externalChannel = createFixture();
      const externalRaw = JSON.parse(
        readFileSync(externalChannel.paths.rawCdpEvents, 'utf8'),
      );
      const pageTarget = externalRaw.targetLedger.targets.find(
        (target) => target.type === 'page',
      );
      pageTarget.networkEventCount += 1;
      externalRaw.events.push({
        method: 'Network.webSocketCreated',
        params: {
          requestId: 'websocket-fixture',
          url: 'wss://example.invalid/socket',
        },
        sessionId: pageTarget.sessionId,
        targetId: pageTarget.targetId,
        targetType: pageTarget.type,
        observedAt: {
          utc: '2026-07-18T10:00:00.450Z',
          monotonicMs: 450,
        },
      });
      writeFileSync(
        externalChannel.paths.rawCdpEvents,
        `${JSON.stringify(externalRaw, null, 2)}\n`,
      );
      rebindRawCdpArtifact(externalChannel, { alignHarCapture: true });
      writeManifest(externalChannel);
      expectCode(
        () => createPlatformEvidenceRecord(externalChannel.paths.manifest),
        'RAW_CDP_EVIDENCE_INVALID',
      );
    },
  );
});
