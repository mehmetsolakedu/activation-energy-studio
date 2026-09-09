// Version-specific v0.3.2 hosted-platform contract helpers.
const INPUT_SCHEMA = 'activation-energy-studio/platform-run-input/v1';
const PLATFORM_CONTRACT_VERSION =
  process.env.AES_PLATFORM_VALIDATION_VERSION ?? '0.3.2';
if (PLATFORM_CONTRACT_VERSION !== '0.3.2') {
  throw new Error(
    `platform-hosted-ci-v032.mjs requires AES_PLATFORM_VALIDATION_VERSION=0.3.2; received ${PLATFORM_CONTRACT_VERSION}`,
  );
}

export const REQUIRED_NETWORK_COVERAGE = Object.freeze([
  'page-open',
  'upload',
  'analysis',
  'json-export',
  'csv-export',
  'pdf-export',
]);

export const REQUIRED_ACTION_TIMELINE = Object.freeze([
  'page-open',
  'self-test',
  'upload',
  'analysis',
  'json-export',
  'csv-export',
  'pdf-export',
]);

export const REQUIRED_DOM_CONTRACT_SELECTORS = Object.freeze([
  // Only controls that must exist before upload/analysis belong here.
  // numeric-results is created after analysis and is validated in that action.
  '[data-testid="run-platform-self-test"]',
  '[data-testid="download-platform-self-test"]',
  '[data-testid="thermal-file-input"]',
  '[data-testid="run-analysis"]',
  '[data-testid="export-json"]',
  '[data-testid="export-csv"]',
  '[data-testid="export-pdf"]',
]);

export const MONITORED_TARGET_TYPES = Object.freeze([
  'page',
  'iframe',
  'worker',
  'shared_worker',
]);

export const EXTERNAL_PROTOCOLS_BLOCKED = Object.freeze([
  'http:',
  'https:',
  'ws:',
  'wss:',
  'ftp:',
]);

export const EXTERNAL_URL_BLOCK_PATTERNS = Object.freeze([
  'http://*',
  'https://*',
  'ws://*',
  'wss://*',
  'ftp://*',
]);

export const OPERATOR_CONFIRMATION_KEYS = Object.freeze([
  'releaseAndInputHashesChecked',
  'contextValuesRecorded',
  'analysisCompleted',
  'allExportsSaved',
  'networkLogSavedBeforeReconnect',
]);

export const EXPECTED_ARTIFACT_ROLES = Object.freeze([
  'release',
  'goldenInput',
  'selfTestJson',
  'reportJson',
  'reportCsv',
  'reportPdf',
  'networkHar',
  'screenshot',
]);

export const EXPECTED_DOWNLOAD_ROLES = Object.freeze([
  'selfTestJson',
  'reportJson',
  'reportCsv',
  'reportPdf',
]);

export const HUMAN_OBSERVER_PLACEHOLDER = Object.freeze({
  name: 'REPLACE_WITH_REAL_HUMAN_OBSERVER',
  organization: 'REPLACE_WITH_REAL_ORGANIZATION_OR_INDEPENDENT_AFFILIATION',
});

export const HOSTED_RUNNER_MATRIX = Object.freeze({
  'macos-15': Object.freeze({
    family: 'macos',
    platform: 'darwin',
    architecture: 'arm64',
    editionPattern: /\bmacOS\s+15(?:\.\d+)*\b/i,
  }),
  'ubuntu-24.04': Object.freeze({
    family: 'ubuntu',
    platform: 'linux',
    architecture: 'x64',
    editionPattern: /\bUbuntu\b.*\b24\.04(?:\.\d+)*\b/i,
  }),
  'windows-11-arm': Object.freeze({
    family: 'windows11',
    platform: 'win32',
    architecture: 'arm64',
    editionPattern: /\bWindows\s+11\b/i,
  }),
});

const ARTIFACT_EXTENSIONS = Object.freeze({
  release: ['.html'],
  goldenInput: ['.csv'],
  selfTestJson: ['.json'],
  reportJson: ['.json'],
  reportCsv: ['.csv'],
  reportPdf: ['.pdf'],
  networkHar: ['.har', '.json'],
  screenshot: ['.png'],
});

const EXTERNAL_PROTOCOLS = new Set(EXTERNAL_PROTOCOLS_BLOCKED);
const ALLOWED_TARGET_TYPES = new Set(['tab', ...MONITORED_TARGET_TYPES]);
const MONITORED_TARGET_TYPE_SET = new Set(MONITORED_TARGET_TYPES);
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export class HostedPlatformValidationError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'HostedPlatformValidationError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details = undefined) {
  throw new HostedPlatformValidationError(code, message, details);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('VALUE_REQUIRED', `${label} must be a non-empty string.`);
  }
  return value.trim();
}

function finiteNumber(value, label) {
  if (!Number.isFinite(value)) fail('VALUE_INVALID', `${label} must be a finite number.`);
  return value;
}

function normalizeArchitecture(value) {
  const architecture = requiredString(value, 'architecture').toLowerCase();
  if (['arm64', 'aarch64'].includes(architecture)) return 'arm64';
  if (['x64', 'amd64', 'x86_64'].includes(architecture)) return 'x64';
  fail('RUNNER_ARCHITECTURE_UNSUPPORTED', `Unsupported runner architecture: ${value}.`);
}

function normalizePlatform(value) {
  const platform = requiredString(value, 'platform').toLowerCase();
  if (['darwin', 'macos'].includes(platform)) return 'darwin';
  if (['linux', 'ubuntu'].includes(platform)) return 'linux';
  if (['win32', 'windows'].includes(platform)) return 'win32';
  fail('RUNNER_PLATFORM_UNSUPPORTED', `Unsupported runner platform: ${value}.`);
}

export function assertHostedRunnerIdentity(identity) {
  if (!isPlainObject(identity)) fail('RUNNER_IDENTITY_INVALID', 'Runner identity must be an object.');

  const runnerLabel = requiredString(identity.runnerLabel, 'runnerLabel');
  const expected = HOSTED_RUNNER_MATRIX[runnerLabel];
  if (!expected) {
    fail(
      'RUNNER_LABEL_UNSUPPORTED',
      `Runner label ${runnerLabel} is not an allowed hosted validation runner; no fallback is permitted.`,
    );
  }

  const family = requiredString(identity.family, 'family');
  if (family !== expected.family) {
    fail(
      'RUNNER_FAMILY_MISMATCH',
      `${runnerLabel} must map to ${expected.family}, not ${family}.`,
    );
  }

  const platform = normalizePlatform(identity.platform);
  if (platform !== expected.platform) {
    fail(
      'RUNNER_PLATFORM_MISMATCH',
      `${runnerLabel} requires ${expected.platform}, not ${platform}.`,
    );
  }

  const architecture = normalizeArchitecture(identity.architecture);
  if (architecture !== expected.architecture) {
    fail(
      'RUNNER_ARCHITECTURE_MISMATCH',
      `${runnerLabel} requires ${expected.architecture}, not ${architecture}.`,
    );
  }

  const osEdition = requiredString(identity.osEdition, 'osEdition');
  if (expected.family === 'windows11' && /\bWindows\s+Server\b/i.test(osEdition)) {
    fail(
      'WINDOWS_SERVER_FALLBACK_FORBIDDEN',
      'Windows Server cannot be substituted for the required Windows 11 runner.',
    );
  }
  if (!expected.editionPattern.test(osEdition)) {
    fail(
      'RUNNER_OS_EDITION_MISMATCH',
      `${runnerLabel} does not match the declared OS edition: ${osEdition}.`,
    );
  }

  return Object.freeze({
    runnerLabel,
    family,
    platform,
    architecture,
    osEdition,
  });
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    fail('CDP_EVENT_INVALID', `${label} is not valid JSON: ${error.message}`);
  }
}

export function normalizeCdpEvent(input, index = 0) {
  let event = input;
  const identity = {};
  if (typeof event === 'string') event = parseJson(event, `CDP event ${index}`);
  if (!isPlainObject(event)) {
    fail('CDP_EVENT_INVALID', `CDP event ${index} must be an object or JSON string.`);
  }

  for (let depth = 0; depth < 4; depth += 1) {
    for (const key of ['sessionId', 'targetId', 'targetType']) {
      if (typeof event[key] === 'string' && event[key].trim() !== '') {
        identity[key] = event[key].trim();
      }
    }
    if (typeof event.method === 'string') break;
    if (typeof event.message === 'string') event = parseJson(event.message, `CDP event ${index}.message`);
    else if (isPlainObject(event.message)) event = event.message;
    else break;
  }

  if (!isPlainObject(event) || typeof event.method !== 'string' || !isPlainObject(event.params)) {
    fail('CDP_EVENT_INVALID', `CDP event ${index} lacks a method/params payload.`);
  }
  for (const key of ['sessionId', 'targetId', 'targetType']) {
    if (typeof event[key] === 'string' && event[key].trim() !== '') {
      identity[key] = event[key].trim();
    }
  }
  if (!identity.sessionId || !identity.targetId || !identity.targetType) {
    fail(
      'CDP_TARGET_IDENTITY_MISSING',
      `CDP event ${index} must retain sessionId, targetId, and targetType.`,
    );
  }
  return {
    method: event.method,
    params: event.params,
    sessionId: identity.sessionId,
    targetId: identity.targetId,
    targetType: identity.targetType,
  };
}

function timelineMarker(value, label) {
  if (!isPlainObject(value)) fail('TIMELINE_MARKER_INVALID', `${label} must be an object.`);
  const utc = requiredString(value.utc, `${label}.utc`);
  const utcEpochMs = Date.parse(utc);
  if (!Number.isFinite(utcEpochMs)) {
    fail('TIMELINE_MARKER_INVALID', `${label}.utc must be a valid UTC timestamp.`);
  }
  if (!/Z$/u.test(utc)) {
    fail('TIMELINE_MARKER_INVALID', `${label}.utc must be serialized in UTC with a Z suffix.`);
  }
  const monotonicMs = finiteNumber(value.monotonicMs, `${label}.monotonicMs`);
  if (monotonicMs < 0) {
    fail('TIMELINE_MARKER_INVALID', `${label}.monotonicMs cannot be negative.`);
  }
  return Object.freeze({
    utc: new Date(utcEpochMs).toISOString(),
    monotonicMs,
    utcEpochMs,
  });
}

export function validateTargetLedger(ledger) {
  if (!isPlainObject(ledger)) {
    fail('CDP_TARGET_LEDGER_MISSING', 'A browser target/session ledger is required.');
  }
  const autoAttach = ledger.autoAttach;
  if (
    !isPlainObject(autoAttach) ||
    autoAttach.autoAttach !== true ||
    autoAttach.flatten !== true ||
    autoAttach.waitForDebuggerOnStart !== true
  ) {
    fail(
      'CDP_AUTO_ATTACH_INVALID',
      'Target.setAutoAttach must pause targets with autoAttach=true, flatten=true, waitForDebuggerOnStart=true.',
    );
  }
  if (!Array.isArray(ledger.unsupportedTargets) || ledger.unsupportedTargets.length > 0) {
    fail(
      'CDP_TARGET_UNSUPPORTED',
      'Unsupported descendant targets were encountered or the unsupported-target ledger is missing.',
      ledger.unsupportedTargets,
    );
  }
  if (
    !Array.isArray(ledger.unobservedDescendantTargets) ||
    ledger.unobservedDescendantTargets.length > 0
  ) {
    fail(
      'CDP_DESCENDANT_UNOBSERVED',
      'At least one descendant target could not be attached and observed.',
      ledger.unobservedDescendantTargets,
    );
  }
  if (!Array.isArray(ledger.targets) || ledger.targets.length === 0) {
    fail('CDP_TARGET_LEDGER_MISSING', 'The target ledger contains no attached targets.');
  }
  if (!Array.isArray(ledger.discoveredTargets) || ledger.discoveredTargets.length === 0) {
    fail(
      'CDP_TARGET_LEDGER_MISSING',
      'The target ledger contains no Target.setDiscoverTargets inventory.',
    );
  }

  const mainPageTargetId = requiredString(ledger.mainPageTargetId, 'targetLedger.mainPageTargetId');
  const mainPageSessionId = requiredString(
    ledger.mainPageSessionId,
    'targetLedger.mainPageSessionId',
  );
  const targetIds = new Set();
  const sessionIds = new Set();
  const targets = ledger.targets.map((entry, index) => {
    const label = `targetLedger.targets[${index}]`;
    if (!isPlainObject(entry)) fail('CDP_TARGET_LEDGER_INVALID', `${label} must be an object.`);
    const targetId = requiredString(entry.targetId, `${label}.targetId`);
    const sessionId = requiredString(entry.sessionId, `${label}.sessionId`);
    const parentSessionId = requiredString(entry.parentSessionId, `${label}.parentSessionId`);
    const type = requiredString(entry.type, `${label}.type`);
    if (!ALLOWED_TARGET_TYPES.has(type)) {
      fail('CDP_TARGET_UNSUPPORTED', `${label} has unsupported target type ${type}.`);
    }
    if (targetIds.has(targetId)) {
      fail('CDP_TARGET_LEDGER_INVALID', `Target ${targetId} occurs more than once.`);
    }
    if (sessionIds.has(sessionId)) {
      fail('CDP_TARGET_LEDGER_INVALID', `Session ${sessionId} occurs more than once.`);
    }
    targetIds.add(targetId);
    sessionIds.add(sessionId);
    if (entry.captureAttached !== true) {
      fail('CDP_DESCENDANT_UNOBSERVED', `${label} was not attached to the capture.`);
    }
    if (entry.paused !== true) {
      fail('CDP_DESCENDANT_UNOBSERVED', `${label} was not paused before target configuration.`);
    }
    if (entry.autoAttachConfigured !== true) {
      fail('CDP_DESCENDANT_UNOBSERVED', `${label} did not inherit recursive auto-attach.`);
    }
    if (entry.configurationError !== null) {
      fail(
        'CDP_DESCENDANT_UNOBSERVED',
        `${label} has a target configuration error.`,
        entry.configurationError,
      );
    }
    if (MONITORED_TARGET_TYPE_SET.has(type) && entry.networkEnabled !== true) {
      fail('CDP_DESCENDANT_UNOBSERVED', `${label} did not enable Network observation.`);
    }
    const expectedOfflineMechanism =
      type === 'page' || type === 'iframe'
        ? 'Network.emulateNetworkConditions'
        : type === 'worker' || type === 'shared_worker'
          ? 'Network.setBlockedURLs'
          : 'not-applicable';
    const offlineMechanism = requiredString(
      entry.offlineMechanism,
      `${label}.offlineMechanism`,
    );
    if (offlineMechanism !== expectedOfflineMechanism) {
      fail(
        'CDP_OFFLINE_MECHANISM_INVALID',
        `${label} must use ${expectedOfflineMechanism}, not ${offlineMechanism}.`,
      );
    }
    const expectedProtocols = MONITORED_TARGET_TYPE_SET.has(type)
      ? EXTERNAL_PROTOCOLS_BLOCKED
      : [];
    if (
      !Array.isArray(entry.externalProtocolsBlocked) ||
      entry.externalProtocolsBlocked.length !== expectedProtocols.length ||
      entry.externalProtocolsBlocked.some(
        (protocol, protocolIndex) => protocol !== expectedProtocols[protocolIndex],
      )
    ) {
      fail(
        'CDP_OFFLINE_MECHANISM_INVALID',
        `${label}.externalProtocolsBlocked must exactly match the target-specific protocol boundary.`,
      );
    }
    const expectedBlockedUrlPatterns =
      type === 'worker' || type === 'shared_worker'
        ? EXTERNAL_URL_BLOCK_PATTERNS
        : [];
    if (
      !Array.isArray(entry.blockedUrlPatterns) ||
      entry.blockedUrlPatterns.length !== expectedBlockedUrlPatterns.length ||
      entry.blockedUrlPatterns.some(
        (pattern, patternIndex) => pattern !== expectedBlockedUrlPatterns[patternIndex],
      )
    ) {
      fail(
        'CDP_OFFLINE_MECHANISM_INVALID',
        `${label}.blockedUrlPatterns does not match its retained CDP mechanism.`,
      );
    }
    if (!Number.isInteger(entry.networkEventCount) || entry.networkEventCount < 0) {
      fail('CDP_TARGET_LEDGER_INVALID', `${label}.networkEventCount must be a non-negative integer.`);
    }
    const attachedAt = timelineMarker(entry.attachedAt, `${label}.attachedAt`);
    const pausedAt = timelineMarker(entry.pausedAt, `${label}.pausedAt`);
    const listenersAttachedAt = timelineMarker(
      entry.listenersAttachedAt,
      `${label}.listenersAttachedAt`,
    );
    const networkEnabledAt = MONITORED_TARGET_TYPE_SET.has(type)
      ? timelineMarker(entry.networkEnabledAt, `${label}.networkEnabledAt`)
      : null;
    const offlineConfiguredAt = MONITORED_TARGET_TYPE_SET.has(type)
      ? timelineMarker(entry.offlineConfiguredAt, `${label}.offlineConfiguredAt`)
      : null;
    const autoAttachConfiguredAt = timelineMarker(
      entry.autoAttachConfiguredAt,
      `${label}.autoAttachConfiguredAt`,
    );
    const configuredAt = timelineMarker(entry.configuredAt, `${label}.configuredAt`);
    const resumedAt = timelineMarker(entry.resumedAt, `${label}.resumedAt`);
    const orderedMarkers = [
      attachedAt,
      pausedAt,
      listenersAttachedAt,
      ...(networkEnabledAt ? [networkEnabledAt, offlineConfiguredAt] : []),
      autoAttachConfiguredAt,
      configuredAt,
      resumedAt,
    ];
    if (
      orderedMarkers.some(
        (current, markerIndex) =>
          markerIndex > 0 &&
          (current.monotonicMs < orderedMarkers[markerIndex - 1].monotonicMs ||
            current.utcEpochMs < orderedMarkers[markerIndex - 1].utcEpochMs),
      )
    ) {
      fail(
        'CDP_TARGET_CONFIGURATION_ORDER_INVALID',
        `${label} does not retain listener, offline, auto-attach, and resume ordering.`,
      );
    }
    if (
      configuredAt.monotonicMs < attachedAt.monotonicMs ||
      configuredAt.utcEpochMs < attachedAt.utcEpochMs
    ) {
      fail('CDP_TARGET_LEDGER_INVALID', `${label} was configured before it was attached.`);
    }
    return Object.freeze({
      targetId,
      sessionId,
      parentSessionId,
      type,
      url: typeof entry.url === 'string' ? entry.url : '',
      captureAttached: true,
      paused: true,
      autoAttachConfigured: true,
      networkEnabled: entry.networkEnabled === true,
      offlineMechanism,
      externalProtocolsBlocked: Object.freeze([...expectedProtocols]),
      blockedUrlPatterns: Object.freeze([...expectedBlockedUrlPatterns]),
      pageEventsEnabled: entry.pageEventsEnabled === true,
      networkEventCount: entry.networkEventCount,
      attachedAt,
      pausedAt,
      listenersAttachedAt,
      networkEnabledAt,
      offlineConfiguredAt,
      autoAttachConfiguredAt,
      configuredAt,
      resumedAt,
      configurationError: null,
      ...(entry.detachedAt
        ? { detachedAt: timelineMarker(entry.detachedAt, `${label}.detachedAt`) }
        : {}),
    });
  });

  const mainPage = targets.find(
    ({ targetId, sessionId }) =>
      targetId === mainPageTargetId && sessionId === mainPageSessionId,
  );
  if (!mainPage || mainPage.type !== 'page') {
    fail(
      'CDP_MAIN_PAGE_UNOBSERVED',
      'The main page target/session pair is absent from the validated target ledger.',
    );
  }
  if (mainPage.networkEventCount <= 0 || mainPage.pageEventsEnabled !== true) {
    fail(
      'CDP_MAIN_PAGE_UNOBSERVED',
      'The main page has no retained Network events or Page timing observation.',
    );
  }
  const browserSessionId = requiredString(
    ledger.browserSessionId,
    'targetLedger.browserSessionId',
  );
  for (const target of targets) {
    if (
      target.parentSessionId !== browserSessionId &&
      !sessionIds.has(target.parentSessionId)
    ) {
      fail(
        'CDP_DESCENDANT_UNOBSERVED',
        `Target ${target.targetId} refers to an unobserved parent session ${target.parentSessionId}.`,
      );
    }
  }
  const discoveredIds = new Set();
  const discoveredTargets = ledger.discoveredTargets.map((entry, index) => {
    const label = `targetLedger.discoveredTargets[${index}]`;
    if (!isPlainObject(entry)) fail('CDP_TARGET_LEDGER_INVALID', `${label} must be an object.`);
    const targetId = requiredString(entry.targetId, `${label}.targetId`);
    const type = requiredString(entry.type, `${label}.type`);
    if (discoveredIds.has(targetId)) {
      fail('CDP_TARGET_LEDGER_INVALID', `Discovered target ${targetId} occurs more than once.`);
    }
    discoveredIds.add(targetId);
    if (type !== 'browser' && !ALLOWED_TARGET_TYPES.has(type)) {
      fail('CDP_TARGET_UNSUPPORTED', `Discovered target ${targetId} has unsupported type ${type}.`);
    }
    if (type !== 'browser' && !targetIds.has(targetId)) {
      fail(
        'CDP_DESCENDANT_UNOBSERVED',
        `Discovered target ${targetId} (${type}) has no auto-attached capture session.`,
      );
    }
    return Object.freeze({
      targetId,
      type,
      url: typeof entry.url === 'string' ? entry.url : '',
      destroyedAt:
        entry.destroyedAt === null || entry.destroyedAt === undefined
          ? null
          : timelineMarker(entry.destroyedAt, `${label}.destroyedAt`),
    });
  });
  for (const target of targets) {
    if (!discoveredIds.has(target.targetId)) {
      fail(
        'CDP_DESCENDANT_UNOBSERVED',
        `Auto-attached target ${target.targetId} is missing from target discovery.`,
      );
    }
  }

  return Object.freeze({
    autoAttach: Object.freeze({
      autoAttach: true,
      flatten: true,
      waitForDebuggerOnStart: true,
    }),
    browserSessionId,
    mainPageTargetId,
    mainPageSessionId,
    targets: Object.freeze(targets),
    discoveredTargets: Object.freeze(discoveredTargets),
    unsupportedTargets: Object.freeze([]),
    unobservedDescendantTargets: Object.freeze([]),
  });
}

export function classifyNetworkUrl(urlText) {
  const value = requiredString(urlText, 'network URL');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('NETWORK_URL_INVALID', `Invalid network URL: ${value}.`);
  }

  if (EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    return Object.freeze({ kind: 'external', protocol: parsed.protocol, url: value });
  }
  if (parsed.protocol === 'file:') {
    return Object.freeze({ kind: 'file', protocol: parsed.protocol, url: value });
  }
  if (parsed.protocol === 'data:') {
    return Object.freeze({ kind: 'local', protocol: parsed.protocol, url: value });
  }
  if (parsed.protocol === 'blob:') {
    const nested = value.slice('blob:'.length);
    if (/^(?:https?|wss?|ftp):/i.test(nested)) {
      const nestedProtocol = new URL(nested).protocol;
      return Object.freeze({ kind: 'external', protocol: nestedProtocol, url: value });
    }
    if (/^(?:file:|null(?:\/|$))/i.test(nested)) {
      return Object.freeze({ kind: 'local', protocol: parsed.protocol, url: value });
    }
    return Object.freeze({ kind: 'unsupported', protocol: parsed.protocol, url: value });
  }
  return Object.freeze({ kind: 'unsupported', protocol: parsed.protocol, url: value });
}

function headersToHar(headers) {
  if (headers === undefined) return [];
  if (!isPlainObject(headers)) fail('CDP_EVENT_INVALID', 'CDP headers must be an object.');
  return Object.entries(headers).map(([name, value]) => ({
    name,
    value: Array.isArray(value) ? value.join('\n') : String(value),
  }));
}

function queryStringToHar(urlText) {
  const url = new URL(urlText);
  return [...url.searchParams.entries()].map(([name, value]) => ({ name, value }));
}

function roundedMilliseconds(value) {
  return Math.round(value * 1_000) / 1_000;
}

function elapsedMilliseconds(start, end, label) {
  const elapsed = (finiteNumber(end, `${label}.end`) - finiteNumber(start, `${label}.start`)) * 1_000;
  if (elapsed < 0) fail('CDP_TIME_INVALID', `${label} has a negative duration.`);
  return roundedMilliseconds(elapsed);
}

function requireRequestId(params, label) {
  return requiredString(params.requestId, `${label}.requestId`);
}

function harEntry(record, pageId) {
  if (record.endTimestamp === undefined) {
    fail('CDP_REQUEST_INCOMPLETE', `Request ${record.requestId} has no loadingFinished/loadingFailed event.`);
  }
  if (!record.response && !record.failure) {
    fail('CDP_RESPONSE_MISSING', `Request ${record.requestId} has no response or failure evidence.`);
  }

  const duration = elapsedMilliseconds(record.timestamp, record.endTimestamp, `request ${record.requestId}`);
  const response = record.response;
  const encodedSize = Number.isFinite(record.encodedDataLength)
    ? record.encodedDataLength
    : Number.isFinite(response?.encodedDataLength)
      ? response.encodedDataLength
      : 0;
  const postData = typeof record.request.postData === 'string' ? record.request.postData : undefined;

  return {
    pageref: pageId,
    startedDateTime: new Date(record.wallTime * 1_000).toISOString(),
    time: duration,
    request: {
      method: record.method,
      url: record.url,
      httpVersion: typeof response?.protocol === 'string' ? response.protocol : '',
      cookies: [],
      headers: headersToHar(record.request.headers),
      queryString: queryStringToHar(record.url),
      headersSize: -1,
      bodySize: postData === undefined ? -1 : Buffer.byteLength(postData, 'utf8'),
      ...(postData === undefined
        ? {}
        : {
            postData: {
              mimeType: String(record.request.headers?.['Content-Type'] ?? ''),
              text: postData,
            },
          }),
    },
    response: {
      status: Number.isFinite(response?.status) ? response.status : 0,
      statusText: typeof response?.statusText === 'string' ? response.statusText : '',
      httpVersion: typeof response?.protocol === 'string' ? response.protocol : '',
      cookies: [],
      headers: headersToHar(response?.headers),
      content: {
        size: encodedSize,
        mimeType: typeof response?.mimeType === 'string' ? response.mimeType : '',
      },
      redirectURL: typeof response?.headers?.location === 'string' ? response.headers.location : '',
      headersSize: -1,
      bodySize: encodedSize,
      ...(record.failure ? { _failure: record.failure } : {}),
    },
    cache: {},
    timings: {
      blocked: -1,
      dns: -1,
      connect: -1,
      ssl: -1,
      send: 0,
      wait: duration,
      receive: 0,
    },
    _cdpRequestId: record.requestId,
    _cdpSessionId: record.sessionId,
    _targetId: record.targetId,
    _targetType: record.targetType,
    _resourceType: record.resourceType,
    _timingSource: 'CDP requestWillBeSent to loadingFinished/loadingFailed',
  };
}

export function inspectHarNetwork(har) {
  const entries = har?.log?.entries;
  if (!Array.isArray(entries)) fail('HAR_INVALID', 'HAR log.entries must be an array.');

  const fileRequests = [];
  const localRequests = [];
  const externalRequests = [];
  const unsupportedRequests = [];

  for (const [index, entry] of entries.entries()) {
    const url = entry?.request?.url;
    if (typeof url !== 'string' || url.trim() === '') {
      fail('HAR_INVALID', `HAR entry ${index} has no request URL.`);
    }
    const classification = classifyNetworkUrl(url);
    if (classification.kind === 'file') fileRequests.push(url);
    else if (classification.kind === 'local') localRequests.push(url);
    else if (classification.kind === 'external') externalRequests.push(url);
    else unsupportedRequests.push(url);
  }

  return Object.freeze({
    totalRequests: entries.length,
    fileRequests: Object.freeze(fileRequests),
    localRequests: Object.freeze(localRequests),
    externalRequests: Object.freeze(externalRequests),
    unsupportedRequests: Object.freeze(unsupportedRequests),
  });
}

export function assertOfflineHar(har) {
  const inspection = inspectHarNetwork(har);
  if (inspection.unsupportedRequests.length > 0) {
    fail(
      'UNSUPPORTED_NETWORK_PROTOCOL',
      `HAR contains unsupported request URL(s): ${inspection.unsupportedRequests.join(', ')}.`,
      inspection,
    );
  }
  if (inspection.externalRequests.length > 0) {
    fail(
      'EXTERNAL_NETWORK_REQUEST',
      `HAR contains external request(s): ${inspection.externalRequests.join(', ')}.`,
      inspection,
    );
  }
  if (inspection.fileRequests.length === 0) {
    fail('LOCAL_FILE_REQUEST_REQUIRED', 'HAR contains no observed file: request.', inspection);
  }
  return inspection;
}

export function cdpEventsToHar(events, options = {}) {
  if (!Array.isArray(events) || events.length === 0) {
    fail('CDP_EVENTS_REQUIRED', 'At least one actual CDP event is required.');
  }

  const capture = validateCaptureEnvelope(options.capture);
  const targetLedger = capture.targetLedger;
  const targetBySession = new Map(
    targetLedger.targets.map((target) => [target.sessionId, target]),
  );
  const records = new Map();
  const orderedRecords = [];
  const pageEvents = { domContent: [], load: [] };

  for (const [index, input] of events.entries()) {
    const {
      method,
      params,
      sessionId,
      targetId,
      targetType,
    } = normalizeCdpEvent(input, index);
    const ledgerTarget = targetBySession.get(sessionId);
    if (
      !ledgerTarget ||
      ledgerTarget.targetId !== targetId ||
      ledgerTarget.type !== targetType
    ) {
      fail(
        'CDP_TARGET_IDENTITY_MISMATCH',
        `CDP event ${index} does not match a validated target/session ledger entry.`,
        { sessionId, targetId, targetType },
      );
    }

    if (method === 'Network.webSocketCreated' || method === 'Network.webTransportCreated') {
      const url = requiredString(params.url, `${method}.url`);
      const classification = classifyNetworkUrl(url);
      if (classification.kind === 'external') {
        fail('EXTERNAL_NETWORK_REQUEST', `${method} observed external URL ${url}.`);
      }
      fail('UNSUPPORTED_NETWORK_PROTOCOL', `${method} is not permitted in an offline platform run.`);
    }

    if (method === 'Network.requestWillBeSent') {
      const requestId = requireRequestId(params, method);
      const requestKey = `${sessionId}:${requestId}`;
      if (records.has(requestKey)) {
        fail(
          'CDP_DUPLICATE_REQUEST_ID',
          `Request ${requestKey} was observed more than once; redirects must be retained explicitly, not collapsed.`,
        );
      }
      if (!isPlainObject(params.request)) {
        fail('CDP_EVENT_INVALID', `${method}.request must be an object.`);
      }
      const url = requiredString(params.request.url, `${method}.request.url`);
      const record = {
        requestKey,
        requestId,
        sessionId,
        targetId,
        targetType,
        request: params.request,
        url,
        method: requiredString(params.request.method, `${method}.request.method`),
        timestamp: finiteNumber(params.timestamp, `${method}.timestamp`),
        wallTime: finiteNumber(params.wallTime, `${method}.wallTime`),
        resourceType: typeof params.type === 'string' ? params.type : '',
        classification: classifyNetworkUrl(url),
      };
      records.set(requestKey, record);
      orderedRecords.push(record);
      continue;
    }

    if (method === 'Network.responseReceived') {
      const requestId = requireRequestId(params, method);
      const requestKey = `${sessionId}:${requestId}`;
      const record = records.get(requestKey);
      if (!record) fail('CDP_ORPHAN_EVENT', `${method} refers to unknown request ${requestKey}.`);
      if (!isPlainObject(params.response)) {
        fail('CDP_EVENT_INVALID', `${method}.response must be an object.`);
      }
      record.response = params.response;
      continue;
    }

    if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      const requestId = requireRequestId(params, method);
      const requestKey = `${sessionId}:${requestId}`;
      const record = records.get(requestKey);
      if (!record) fail('CDP_ORPHAN_EVENT', `${method} refers to unknown request ${requestKey}.`);
      if (record.endTimestamp !== undefined) {
        fail('CDP_DUPLICATE_COMPLETION', `Request ${requestKey} has multiple completion events.`);
      }
      record.endTimestamp = finiteNumber(params.timestamp, `${method}.timestamp`);
      if (Number.isFinite(params.encodedDataLength)) record.encodedDataLength = params.encodedDataLength;
      if (method === 'Network.loadingFailed') {
        const errorText =
          typeof params.errorText === 'string' ? params.errorText.trim() : '';
        const blockedReason =
          typeof params.blockedReason === 'string' && params.blockedReason.trim() !== ''
            ? params.blockedReason.trim()
            : null;
        if (errorText === '' && blockedReason === null) {
          fail(
            'CDP_EVENT_INVALID',
            `${method} requires non-empty errorText or blockedReason evidence.`,
          );
        }
        record.failure = {
          errorText,
          canceled: params.canceled === true,
          blockedReason,
        };
      }
      continue;
    }

    if (method === 'Page.domContentEventFired') {
      if (sessionId === targetLedger.mainPageSessionId) {
        pageEvents.domContent.push(finiteNumber(params.timestamp, `${method}.timestamp`));
      }
      continue;
    }
    if (method === 'Page.loadEventFired') {
      if (sessionId === targetLedger.mainPageSessionId) {
        pageEvents.load.push(finiteNumber(params.timestamp, `${method}.timestamp`));
      }
    }
  }

  if (orderedRecords.length === 0) {
    fail('CDP_REQUESTS_REQUIRED', 'No Network.requestWillBeSent event was observed.');
  }

  if (options.allowExternalForDiagnostics !== true) {
    const externalUrls = orderedRecords
      .filter((record) => record.classification.kind === 'external')
      .map((record) => record.url);
    const unsupportedUrls = orderedRecords
      .filter((record) => record.classification.kind === 'unsupported')
      .map((record) => record.url);
    if (unsupportedUrls.length > 0) {
      fail(
        'UNSUPPORTED_NETWORK_PROTOCOL',
        `CDP events contain unsupported request URL(s): ${unsupportedUrls.join(', ')}.`,
      );
    }
    if (externalUrls.length > 0) {
      fail(
        'EXTERNAL_NETWORK_REQUEST',
        `CDP events contain external request(s): ${externalUrls.join(', ')}.`,
      );
    }
  }

  const pageStart =
    orderedRecords.find(
      (record) =>
        record.sessionId === targetLedger.mainPageSessionId &&
        record.classification.kind === 'file' &&
        record.resourceType === 'Document',
    ) ??
    orderedRecords.find(
      (record) =>
        record.sessionId === targetLedger.mainPageSessionId &&
        record.classification.kind === 'file',
    );
  if (!pageStart) {
    fail('LOCAL_FILE_REQUEST_REQUIRED', 'CDP events contain no observed file: page request.');
  }

  const domContentTimestamp = pageEvents.domContent.find((value) => value >= pageStart.timestamp);
  const loadTimestamp = pageEvents.load.find((value) => value >= pageStart.timestamp);
  if (domContentTimestamp === undefined || loadTimestamp === undefined) {
    fail(
      'CDP_PAGE_TIMING_MISSING',
      'Page.domContentEventFired and Page.loadEventFired are required after the local page request.',
    );
  }

  const pageId = requiredString(options.pageId ?? 'page-1', 'pageId');
  const pageTitle = requiredString(options.pageTitle ?? pageStart.url, 'pageTitle');
  const har = {
    log: {
      version: '1.2',
      creator: {
        name: requiredString(options.creatorName ?? 'Activation Energy Studio CDP harness', 'creatorName'),
        version: requiredString(options.creatorVersion ?? '1', 'creatorVersion'),
      },
      pages: [
        {
          startedDateTime: new Date(pageStart.wallTime * 1_000).toISOString(),
          id: pageId,
          title: pageTitle,
          pageTimings: {
            onContentLoad: elapsedMilliseconds(
              pageStart.timestamp,
              domContentTimestamp,
              'DOMContentLoaded',
            ),
            onLoad: elapsedMilliseconds(pageStart.timestamp, loadTimestamp, 'load'),
          },
        },
      ],
      entries: orderedRecords.map((record) => harEntry(record, pageId)),
      _capture: {
        schema: 'activation-energy-studio/cdp-capture/v2',
        captureStartedAt: capture.timeline.captureStartedAt,
        captureEndedAt: capture.timeline.captureEndedAt,
        timeline: capture.timeline.actions,
        targetLedger,
        downloads: capture.downloads,
        networkCoverage: capture.timeline.coverage,
      },
    },
  };

  const inspection = inspectHarNetwork(har);
  if (options.allowExternalForDiagnostics !== true) assertOfflineHar(har);
  return Object.freeze({ har, inspection });
}

function portablePath(value, label) {
  const path = requiredString(value, label).replaceAll('\\', '/');
  if (path.endsWith('/')) fail('ARTIFACT_PATH_INVALID', `${label} must name a file.`);
  return path;
}

function portableBasename(value) {
  const normalized = value.replaceAll('\\', '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function extensionOf(value) {
  const basename = portableBasename(value).toLowerCase();
  const index = basename.lastIndexOf('.');
  return index === -1 ? '' : basename.slice(index);
}

function validateExactRoles(value, expectedRoles, label) {
  if (!isPlainObject(value)) fail('ARTIFACT_SET_INVALID', `${label} must be an object.`);
  const actualRoles = Object.keys(value).sort();
  const expected = [...expectedRoles].sort();
  if (
    actualRoles.length !== expected.length ||
    actualRoles.some((role, index) => role !== expected[index])
  ) {
    fail(
      'ARTIFACT_SET_MISMATCH',
      `${label} must contain exactly: ${expectedRoles.join(', ')}.`,
      { expected: expectedRoles, actual: actualRoles },
    );
  }
}

function assertDistinctPaths(entries, label) {
  const paths = new Map();
  for (const [role, descriptor] of entries) {
    const key = descriptor.path.replaceAll('\\', '/').toLowerCase();
    if (paths.has(key)) {
      fail(
        'ARTIFACT_PATH_DUPLICATE',
        `${label} roles ${paths.get(key)} and ${role} resolve to the same path.`,
      );
    }
    paths.set(key, role);
  }
}

export function validateExpectedArtifactSet(artifacts) {
  validateExactRoles(artifacts, EXPECTED_ARTIFACT_ROLES, 'artifacts');
  const validated = {};

  for (const role of EXPECTED_ARTIFACT_ROLES) {
    const descriptor = artifacts[role];
    if (!isPlainObject(descriptor)) {
      fail('ARTIFACT_DESCRIPTOR_INVALID', `artifacts.${role} must be an object.`);
    }
    const path = portablePath(descriptor.path, `artifacts.${role}.path`);
    const sha256 = requiredString(descriptor.sha256, `artifacts.${role}.sha256`).toLowerCase();
    if (!SHA256_PATTERN.test(sha256)) {
      fail('ARTIFACT_HASH_INVALID', `artifacts.${role}.sha256 must contain 64 hexadecimal characters.`);
    }
    if (!ARTIFACT_EXTENSIONS[role].includes(extensionOf(path))) {
      fail(
        'ARTIFACT_EXTENSION_INVALID',
        `artifacts.${role} must use ${ARTIFACT_EXTENSIONS[role].join(' or ')}.`,
      );
    }
    validated[role] = Object.freeze({ path, sha256 });
  }

  assertDistinctPaths(Object.entries(validated), 'artifact');
  return Object.freeze(validated);
}

export function validateExpectedDownloadSet(downloads) {
  validateExactRoles(downloads, EXPECTED_DOWNLOAD_ROLES, 'downloads');
  const validated = {};

  for (const role of EXPECTED_DOWNLOAD_ROLES) {
    const descriptor = downloads[role];
    if (!isPlainObject(descriptor)) {
      fail('DOWNLOAD_DESCRIPTOR_INVALID', `downloads.${role} must be an object.`);
    }
    const path = portablePath(descriptor.path, `downloads.${role}.path`);
    if (descriptor.complete !== true) {
      fail('DOWNLOAD_INCOMPLETE', `downloads.${role} is not marked complete.`);
    }
    if (!Number.isInteger(descriptor.bytes) || descriptor.bytes <= 0) {
      fail('DOWNLOAD_SIZE_INVALID', `downloads.${role}.bytes must be a positive integer.`);
    }
    const sha256 = requiredString(descriptor.sha256, `downloads.${role}.sha256`).toLowerCase();
    if (!SHA256_PATTERN.test(sha256)) {
      fail('DOWNLOAD_HASH_INVALID', `downloads.${role}.sha256 must contain 64 hexadecimal characters.`);
    }
    const suggestedFilename = requiredString(
      descriptor.suggestedFilename,
      `downloads.${role}.suggestedFilename`,
    );
    if (suggestedFilename !== portableBasename(path)) {
      fail(
        'DOWNLOAD_NAME_INVALID',
        `downloads.${role}.suggestedFilename does not match its retained path.`,
      );
    }
    const protocolEvents = descriptor.protocolEvents;
    if (!isPlainObject(protocolEvents)) {
      fail(
        'DOWNLOAD_PROTOCOL_INCOMPLETE',
        `downloads.${role}.protocolEvents must retain willBegin and completed events.`,
      );
    }
    const willBegin = protocolEvents.willBegin;
    const completed = protocolEvents.completed;
    if (!isPlainObject(willBegin) || !isPlainObject(completed)) {
      fail(
        'DOWNLOAD_PROTOCOL_INCOMPLETE',
        `downloads.${role} lacks Browser.downloadWillBegin or Browser.downloadProgress completion evidence.`,
      );
    }
    const willBeginGuid = requiredString(
      willBegin.guid,
      `downloads.${role}.protocolEvents.willBegin.guid`,
    );
    const completedGuid = requiredString(
      completed.guid,
      `downloads.${role}.protocolEvents.completed.guid`,
    );
    if (willBeginGuid !== completedGuid) {
      fail(
        'DOWNLOAD_GUID_MISMATCH',
        `downloads.${role} willBegin and completed events do not share one GUID.`,
      );
    }
    if (completed.state !== 'completed') {
      fail(
        'DOWNLOAD_PROTOCOL_INCOMPLETE',
        `downloads.${role} has no Browser.downloadProgress state=completed event.`,
      );
    }
    if (willBegin.suggestedFilename !== suggestedFilename) {
      fail(
        'DOWNLOAD_NAME_INVALID',
        `downloads.${role} Browser.downloadWillBegin filename does not match the retained file.`,
      );
    }
    const willBeginAt = timelineMarker(
      willBegin.observedAt,
      `downloads.${role}.protocolEvents.willBegin.observedAt`,
    );
    const completedAt = timelineMarker(
      completed.observedAt,
      `downloads.${role}.protocolEvents.completed.observedAt`,
    );
    if (
      completedAt.monotonicMs < willBeginAt.monotonicMs ||
      completedAt.utcEpochMs < willBeginAt.utcEpochMs
    ) {
      fail('DOWNLOAD_PROTOCOL_ORDER_INVALID', `downloads.${role} completed before it began.`);
    }
    if (!Number.isInteger(completed.receivedBytes) || completed.receivedBytes <= 0) {
      fail(
        'DOWNLOAD_SIZE_INVALID',
        `downloads.${role}.protocolEvents.completed.receivedBytes must be positive.`,
      );
    }
    if (completed.receivedBytes !== descriptor.bytes) {
      fail(
        'DOWNLOAD_SIZE_MISMATCH',
        `downloads.${role} protocol bytes differ from the retained file size.`,
      );
    }
    if (
      completed.totalBytes !== undefined &&
      (!Number.isInteger(completed.totalBytes) || completed.totalBytes < descriptor.bytes)
    ) {
      fail(
        'DOWNLOAD_SIZE_MISMATCH',
        `downloads.${role} has an invalid protocol totalBytes value.`,
      );
    }
    if (
      !Array.isArray(descriptor.stableSizeObservations) ||
      descriptor.stableSizeObservations.length !== 2
    ) {
      fail(
        'DOWNLOAD_SIZE_UNSTABLE',
        `downloads.${role} must retain exactly two consecutive stable-size observations.`,
      );
    }
    const stableSizeObservations = descriptor.stableSizeObservations.map(
      (observation, index) => {
        const label = `downloads.${role}.stableSizeObservations[${index}]`;
        if (!isPlainObject(observation) || observation.bytes !== descriptor.bytes) {
          fail('DOWNLOAD_SIZE_UNSTABLE', `${label} does not match downloads.${role}.bytes.`);
        }
        return Object.freeze({
          bytes: observation.bytes,
          observedAt: timelineMarker(observation.observedAt, `${label}.observedAt`),
        });
      },
    );
    if (
      stableSizeObservations[0].observedAt.monotonicMs < completedAt.monotonicMs ||
      stableSizeObservations[1].observedAt.monotonicMs <=
        stableSizeObservations[0].observedAt.monotonicMs ||
      stableSizeObservations[0].observedAt.utcEpochMs < completedAt.utcEpochMs ||
      stableSizeObservations[1].observedAt.utcEpochMs <
        stableSizeObservations[0].observedAt.utcEpochMs
    ) {
      fail(
        'DOWNLOAD_SIZE_UNSTABLE',
        `downloads.${role} stable-size observations are not consecutive after protocol completion.`,
      );
    }
    validated[role] = Object.freeze({
      path,
      complete: true,
      bytes: descriptor.bytes,
      sha256,
      suggestedFilename,
      protocolEvents: Object.freeze({
        willBegin: Object.freeze({
          guid: willBeginGuid,
          suggestedFilename,
          url: requiredString(
            willBegin.url,
            `downloads.${role}.protocolEvents.willBegin.url`,
          ),
          observedAt: willBeginAt,
        }),
        completed: Object.freeze({
          guid: completedGuid,
          state: 'completed',
          receivedBytes: completed.receivedBytes,
          totalBytes:
            completed.totalBytes === undefined
              ? completed.receivedBytes
              : completed.totalBytes,
          observedAt: completedAt,
        }),
      }),
      stableSizeObservations: Object.freeze(stableSizeObservations),
    });
  }

  assertDistinctPaths(Object.entries(validated), 'download');
  const selfTestName = portableBasename(validated.selfTestJson.path);
  const expectedSelfTestName =
    `activation-energy-platform-self-test-v${PLATFORM_CONTRACT_VERSION}-pass.json`;
  if (selfTestName !== expectedSelfTestName) {
    fail(
      'DOWNLOAD_NAME_INVALID',
      `The retained self-test download must be the exact v${PLATFORM_CONTRACT_VERSION} PASS JSON.`,
    );
  }

  const jsonName = portableBasename(validated.reportJson.path);
  const csvName = portableBasename(validated.reportCsv.path);
  const pdfName = portableBasename(validated.reportPdf.path);
  if (!jsonName.toLowerCase().endsWith('.json') || jsonName === selfTestName) {
    fail('DOWNLOAD_NAME_INVALID', 'The scientific JSON export has an invalid name.');
  }
  if (!csvName.toLowerCase().endsWith('-results.csv')) {
    fail('DOWNLOAD_NAME_INVALID', 'The scientific CSV export must end in -results.csv.');
  }
  if (!pdfName.toLowerCase().endsWith('-report.pdf')) {
    fail('DOWNLOAD_NAME_INVALID', 'The scientific PDF export must end in -report.pdf.');
  }

  const jsonStem = jsonName.slice(0, -'.json'.length);
  const csvStem = csvName.slice(0, -'-results.csv'.length);
  const pdfStem = pdfName.slice(0, -'-report.pdf'.length);
  if (jsonStem !== csvStem || jsonStem !== pdfStem) {
    fail('DOWNLOAD_STEM_MISMATCH', 'Scientific JSON, CSV, and PDF exports must share one export stem.');
  }

  return Object.freeze(validated);
}

const DOWNLOAD_ROLE_BY_ACTION = Object.freeze({
  'self-test': 'selfTestJson',
  'json-export': 'reportJson',
  'csv-export': 'reportCsv',
  'pdf-export': 'reportPdf',
});

function validateDownloadActionEvidence(actionId, evidence, downloads) {
  const role = DOWNLOAD_ROLE_BY_ACTION[actionId];
  const download = downloads[role];
  if (
    evidence.downloadRole !== role ||
    evidence.guid !== download.protocolEvents.willBegin.guid ||
    evidence.protocolState !== 'completed' ||
    evidence.bytes !== download.bytes ||
    evidence.sha256 !== download.sha256
  ) {
    fail(
      'TIMELINE_DOWNLOAD_MISMATCH',
      `${actionId} does not match the validated ${role} download.`,
    );
  }
  return role;
}

export function validateActionTimeline(timeline, downloadsInput) {
  if (!isPlainObject(timeline)) {
    fail('ACTION_TIMELINE_MISSING', 'A retained action timeline is required.');
  }
  const downloads = validateExpectedDownloadSet(downloadsInput);
  const captureStartedAt = timelineMarker(
    timeline.captureStartedAt,
    'timeline.captureStartedAt',
  );
  const captureEndedAt = timelineMarker(timeline.captureEndedAt, 'timeline.captureEndedAt');
  if (
    captureEndedAt.monotonicMs <= captureStartedAt.monotonicMs ||
    captureEndedAt.utcEpochMs <= captureStartedAt.utcEpochMs
  ) {
    fail('ACTION_TIMELINE_INVALID', 'The capture end marker must follow its start marker.');
  }
  if (!Array.isArray(timeline.actions)) {
    fail('ACTION_TIMELINE_MISSING', 'timeline.actions must be an array.');
  }
  const actionIds = timeline.actions.map((action) => action?.id);
  if (
    actionIds.length !== REQUIRED_ACTION_TIMELINE.length ||
    actionIds.some((id, index) => id !== REQUIRED_ACTION_TIMELINE[index])
  ) {
    fail(
      'ACTION_TIMELINE_INCOMPLETE',
      `Timeline actions must appear exactly as: ${REQUIRED_ACTION_TIMELINE.join(', ')}.`,
      actionIds,
    );
  }

  let previousAfter = captureStartedAt;
  const completedDownloadRoles = new Set();
  const actions = timeline.actions.map((action, index) => {
    const label = `timeline.actions[${index}]`;
    if (!isPlainObject(action) || action.verified !== true || !isPlainObject(action.evidence)) {
      fail('ACTION_TIMELINE_INCOMPLETE', `${label} is not retained as verified.`);
    }
    const before = timelineMarker(action.before, `${label}.before`);
    const after = timelineMarker(action.after, `${label}.after`);
    if (
      before.monotonicMs < previousAfter.monotonicMs ||
      before.utcEpochMs < previousAfter.utcEpochMs ||
      after.monotonicMs < before.monotonicMs ||
      after.utcEpochMs < before.utcEpochMs ||
      after.monotonicMs > captureEndedAt.monotonicMs ||
      after.utcEpochMs > captureEndedAt.utcEpochMs
    ) {
      fail('ACTION_TIMELINE_INVALID', `${label} is out of order or outside the capture bounds.`);
    }
    previousAfter = after;
    const evidence = action.evidence;

    if (action.id === 'page-open') {
      if (
        evidence.documentProtocol !== 'file:' ||
        evidence.onlineStateDuringRun !== false ||
        !isPlainObject(evidence.domContract) ||
        !Array.isArray(evidence.domContract.selectorsPresent)
      ) {
        fail('ACTION_EVIDENCE_INVALID', 'page-open lacks retained file:/offline DOM evidence.');
      }
      const present = new Set(evidence.domContract.selectorsPresent);
      if (REQUIRED_DOM_CONTRACT_SELECTORS.some((selector) => !present.has(selector))) {
        fail('ACTION_EVIDENCE_INVALID', 'page-open lacks one or more required DOM contract selectors.');
      }
    } else if (action.id === 'upload') {
      if (
        evidence.fileCount !== 1 ||
        typeof evidence.fileName !== 'string' ||
        evidence.fileName.trim() === '' ||
        evidence.runAnalysisEnabled !== true
      ) {
        fail('ACTION_EVIDENCE_INVALID', 'upload lacks the retained single-file DOM contract.');
      }
    } else if (action.id === 'analysis') {
      if (
        evidence.refused !== false ||
        evidence.totalRows !== 36 ||
        evidence.commonAlphaRangeVisible !== true ||
        !isPlainObject(evidence.methodCounts) ||
        ['FWO', 'KAS', 'STARINK', 'FRIEDMAN'].some(
          (method) => evidence.methodCounts[method] !== 9,
        )
      ) {
        fail('ACTION_EVIDENCE_INVALID', 'analysis lacks the required 36-row/four-method DOM result.');
      }
    }

    if (Object.hasOwn(DOWNLOAD_ROLE_BY_ACTION, action.id)) {
      if (action.id === 'self-test' && evidence.status !== 'PASS') {
        fail('ACTION_EVIDENCE_INVALID', 'self-test timeline evidence is not PASS.');
      }
      const role = validateDownloadActionEvidence(action.id, evidence, downloads);
      const download = downloads[role];
      const protocolStart = download.protocolEvents.willBegin.observedAt;
      const stableEnd = download.stableSizeObservations[1].observedAt;
      if (
        protocolStart.monotonicMs < before.monotonicMs ||
        protocolStart.utcEpochMs < before.utcEpochMs ||
        stableEnd.monotonicMs > after.monotonicMs ||
        stableEnd.utcEpochMs > after.utcEpochMs
      ) {
        fail(
          'TIMELINE_DOWNLOAD_MISMATCH',
          `${action.id} does not enclose its browser protocol and stable-file observations.`,
        );
      }
      completedDownloadRoles.add(role);
    }
    return Object.freeze({
      id: action.id,
      before,
      after,
      verified: true,
      evidence: Object.freeze({ ...evidence }),
    });
  });

  if (
    EXPECTED_DOWNLOAD_ROLES.some((role) => !completedDownloadRoles.has(role)) ||
    completedDownloadRoles.size !== EXPECTED_DOWNLOAD_ROLES.length
  ) {
    fail('ACTION_TIMELINE_INCOMPLETE', 'The timeline does not retain all four completed downloads.');
  }
  const coverage = actions
    .map(({ id }) => id)
    .filter((id) => REQUIRED_NETWORK_COVERAGE.includes(id));
  if (
    coverage.length !== REQUIRED_NETWORK_COVERAGE.length ||
    coverage.some((id, index) => id !== REQUIRED_NETWORK_COVERAGE[index])
  ) {
    fail('NETWORK_COVERAGE_INCOMPLETE', 'Required network coverage cannot be derived from the timeline.');
  }
  return Object.freeze({
    captureStartedAt,
    captureEndedAt,
    actions: Object.freeze(actions),
    coverage: Object.freeze(coverage),
  });
}

function validateCaptureEnvelope(capture) {
  if (!isPlainObject(capture)) {
    fail('HAR_CAPTURE_METADATA_MISSING', 'HAR capture metadata is required.');
  }
  const downloads = validateExpectedDownloadSet(capture.downloads);
  const timeline = validateActionTimeline(capture.timeline, downloads);
  const targetLedger = validateTargetLedger(capture.targetLedger);
  return Object.freeze({ downloads, timeline, targetLedger });
}

export function validateHarCaptureMetadata(har) {
  const capture = har?.log?._capture;
  if (!isPlainObject(capture)) {
    fail('HAR_CAPTURE_METADATA_MISSING', 'HAR log._capture is required.');
  }
  const validated = validateCaptureEnvelope({
    downloads: capture.downloads,
    targetLedger: capture.targetLedger,
    timeline: {
      captureStartedAt: capture.captureStartedAt,
      captureEndedAt: capture.captureEndedAt,
      actions: capture.timeline,
    },
  });
  if (
    !Array.isArray(capture.networkCoverage) ||
    capture.networkCoverage.length !== validated.timeline.coverage.length ||
    capture.networkCoverage.some(
      (entry, index) => entry !== validated.timeline.coverage[index],
    )
  ) {
    fail(
      'NETWORK_COVERAGE_INCOMPLETE',
      'HAR networkCoverage is missing or differs from successfully validated timeline markers.',
    );
  }
  return validated;
}

function timestamp(value, label) {
  const text = requiredString(value, label);
  const epoch = Date.parse(text);
  if (!Number.isFinite(epoch)) fail('TIMESTAMP_INVALID', `${label} is not a valid timestamp.`);
  return { text: new Date(epoch).toISOString(), epoch };
}

function stringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('VALUE_INVALID', `${label} must be a non-empty string array.`);
  }
  return value.map((entry, index) => requiredString(entry, `${label}[${index}]`));
}

export function createDraftPlatformManifest(input) {
  if (!isPlainObject(input)) fail('MANIFEST_INPUT_INVALID', 'Manifest input must be an object.');

  const runner = assertHostedRunnerIdentity(input.runner);
  const runId = requiredString(input.runId, 'runId');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(runId)) {
    fail(
      'RUN_ID_INVALID',
      'runId must be 3-128 characters using only letters, digits, dot, underscore, or hyphen.',
    );
  }
  const startedAt = timestamp(input.startedAt, 'startedAt');
  const endedAt = timestamp(input.endedAt, 'endedAt');
  if (endedAt.epoch <= startedAt.epoch) {
    fail('TIMESTAMP_INVALID', 'endedAt must be later than startedAt.');
  }

  const runtime = input.runtime;
  if (!isPlainObject(runtime)) fail('MANIFEST_INPUT_INVALID', 'runtime must be an object.');
  if (runtime.documentProtocol !== 'file:') {
    fail('RUNTIME_PROTOCOL_INVALID', 'Hosted platform evidence must use documentProtocol file:.');
  }
  if (runtime.onlineStateDuringRun !== false) {
    fail('RUNTIME_ONLINE_STATE_INVALID', 'Hosted platform evidence must retain onlineStateDuringRun=false.');
  }

  const browser = input.browser;
  if (!isPlainObject(browser)) fail('MANIFEST_INPUT_INVALID', 'browser must be an object.');
  const locale = input.locale;
  if (!isPlainObject(locale)) fail('MANIFEST_INPUT_INVALID', 'locale must be an object.');
  const navigatorLanguages = stringArray(locale.navigatorLanguages, 'locale.navigatorLanguages');
  const navigatorLanguage = requiredString(locale.navigatorLanguage, 'locale.navigatorLanguage');
  const osLocale = requiredString(locale.osLocale, 'locale.osLocale');
  if (navigatorLanguages[0] !== navigatorLanguage) {
    fail('LOCALE_INVALID', 'navigatorLanguages[0] must equal navigatorLanguage.');
  }
  if (!['.', ','].includes(locale.decimalSeparator)) {
    fail('LOCALE_INVALID', 'locale.decimalSeparator must be . or ,.');
  }
  if (/^en-US$/i.test(osLocale) && locale.decimalSeparator !== '.') {
    fail('LOCALE_INVALID', 'en-US locale requires a dot decimal separator.');
  }
  if (/^tr-TR$/i.test(osLocale) && locale.decimalSeparator !== ',') {
    fail('LOCALE_INVALID', 'tr-TR locale requires a comma decimal separator.');
  }

  const artifacts = validateExpectedArtifactSet(input.artifacts);
  const networkInspection = assertOfflineHar(input.har);
  const capture = validateHarCaptureMetadata(input.har);
  if (
    capture.timeline.captureStartedAt.utcEpochMs < startedAt.epoch ||
    capture.timeline.captureEndedAt.utcEpochMs > endedAt.epoch
  ) {
    fail(
      'ACTION_TIMELINE_INVALID',
      'The validated network/action capture must remain inside the manifest run bounds.',
    );
  }
  const operatorConfirmations = Object.fromEntries(
    OPERATOR_CONFIRMATION_KEYS.map((key) => [key, false]),
  );

  return {
    schemaVersion: INPUT_SCHEMA,
    runId,
    observer: { ...HUMAN_OBSERVER_PLACEHOLDER },
    startedAt: startedAt.text,
    endedAt: endedAt.text,
    environment: {
      os: {
        family: runner.family,
        edition: runner.osEdition,
        build: requiredString(input.osBuild, 'osBuild'),
        architecture: runner.architecture,
      },
      runtime: {
        documentProtocol: 'file:',
        onlineStateDuringRun: false,
        userAgent: requiredString(runtime.userAgent, 'runtime.userAgent'),
        javascriptEngine: requiredString(runtime.javascriptEngine, 'runtime.javascriptEngine'),
      },
      browser: {
        name: requiredString(browser.name, 'browser.name'),
        version: requiredString(browser.version, 'browser.version'),
        engine: requiredString(browser.engine, 'browser.engine'),
        navigatorLanguage,
        navigatorLanguages,
      },
      locale: {
        osLocale,
        timeZone: requiredString(locale.timeZone, 'locale.timeZone'),
        decimalSeparator: locale.decimalSeparator,
      },
    },
    protocol: {
      offlineMode: true,
      declaredExternalRequestAttempts: networkInspection.externalRequests.length,
      networkCapture: {
        format: 'HAR',
        complete: true,
        capturedWhileOffline: true,
        covers: [...capture.timeline.coverage],
      },
      operatorConfirmations,
      deviations: ['AUTOMATED_HOSTED_RUN_AWAITING_HUMAN_OBSERVER_CONFIRMATION'],
    },
    artifacts,
  };
}
