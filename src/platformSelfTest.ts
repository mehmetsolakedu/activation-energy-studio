import { analyzeActivationEnergy, type IsoConversionalMethod } from './core';
import { ingestThermalFiles } from './io';
import { buildThermalRuns } from './integration';
import {
  APP_VERSION,
  CORE_MATH_VERSION,
  FORMULA_SET_VERSION,
  REPORT_SCHEMA_VERSION,
  hashFile,
} from './report';
import syntheticKasExample from '../examples/synthetic_kas_150.csv?raw';

export const PLATFORM_SELF_TEST_SCHEMA =
  'activation-energy-studio/runtime-self-test/v1' as const;
export const PLATFORM_SELF_TEST_CONTRACT = 'platform-scientific-self-test/2' as const;
export const GOLDEN_INPUT_SHA256 =
  'eeafd2d8a1dc11c385bc2906800b9b1d5647451a64cd400eafd50a83579f8b19' as const;

const ALPHA_GRID = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] as const;
const EXPECTED_WARNING_CODES = ['NUMERICAL_DERIVATIVE'] as const;

export interface MethodSelfTestExpectation {
  readonly method: IsoConversionalMethod;
  readonly formulaId: string;
  readonly activationEnergyRangeKJPerMol: readonly [number, number];
  readonly minimumR2: number;
  readonly estimateCount: number;
  readonly observationsPerEstimate: number;
}

export const PLATFORM_SELF_TEST_EXPECTATIONS: readonly MethodSelfTestExpectation[] = [
  {
    method: 'FWO',
    formulaId: 'fwo_doyle_ln_1.052_v1',
    activationEnergyRangeKJPerMol: [152, 152.5],
    minimumR2: 0.9999995,
    estimateCount: 9,
    observationsPerEstimate: 4,
  },
  {
    method: 'KAS',
    formulaId: 'kas_ln_beta_over_t2_v1',
    activationEnergyRangeKJPerMol: [149.999, 150.001],
    minimumR2: 0.9999995,
    estimateCount: 9,
    observationsPerEstimate: 4,
  },
  {
    method: 'STARINK',
    formulaId: 'starink_ln_beta_over_t1.92_1.0008_v1',
    activationEnergyRangeKJPerMol: [150.25, 150.31],
    minimumR2: 0.9999995,
    estimateCount: 9,
    observationsPerEstimate: 4,
  },
  {
    method: 'FRIEDMAN',
    formulaId: 'friedman_ln_dalpha_dt_v1',
    activationEnergyRangeKJPerMol: [150.25, 150.38],
    minimumR2: 0.9999995,
    estimateCount: 9,
    observationsPerEstimate: 4,
  },
] as const;

export const PLATFORM_SELF_TEST_PAYLOAD_CANONICALIZATION = {
  id: 'platform-self-test-scientific-payload-canonical-v1',
  activationEnergyDecimalPlaces: 6,
  r2DecimalPlaces: 12,
  alphaDecimalPlaces: 6,
  thresholdDecimalPlaces: 6,
  integerFields: ['n'],
  categoricalFields: 'exact',
  arrayOrder: 'preserved',
  rawPayloadRetention: 'full-precision',
} as const;

// Filled from the versioned canonical scientific payload produced by this contract.
// A mismatch is a FAIL even when all broad numeric ranges still pass. The full-precision
// raw payload remains in the retained record for diagnosis.
export const EXPECTED_SCIENTIFIC_PAYLOAD_SHA256 =
  'c3084a1762e4b3c6d7587df0068351edf755e0234b8fd24ab768439e1e24ef96' as const;

export interface PlatformSelfTestRuntime {
  readonly userAgent: string;
  readonly platform: string;
  readonly languages: readonly string[];
  readonly locale: string;
  readonly timeZone: string;
  readonly online: boolean | null;
  readonly hardwareConcurrency: number | null;
  readonly pageProtocol: string;
}

export interface PlatformSelfTestCheck {
  readonly id: string;
  readonly label: string;
  readonly status: 'PASS' | 'FAIL';
  readonly expected: unknown;
  readonly observed: unknown;
}

export interface PlatformSelfTestEstimate {
  readonly alpha: number;
  readonly activationEnergyKJPerMol: number;
  readonly r2: number;
  readonly n: number;
}

export interface PlatformSelfTestMethodResult {
  readonly method: IsoConversionalMethod;
  readonly formulaId: string;
  readonly status: string;
  readonly estimates: readonly PlatformSelfTestEstimate[];
}

export interface PlatformSelfTestScientificPayload {
  readonly fixtureSha256: string;
  readonly alphaGrid: readonly number[];
  readonly methods: readonly IsoConversionalMethod[];
  readonly includeKissinger: false;
  readonly minR2Warning: number;
  readonly warningCodes: readonly string[];
  readonly methodsResults: readonly PlatformSelfTestMethodResult[];
}

export interface PlatformSelfTestRecord {
  readonly schema: typeof PLATFORM_SELF_TEST_SCHEMA;
  readonly contract: typeof PLATFORM_SELF_TEST_CONTRACT;
  readonly recordStatus: 'PASS' | 'FAIL';
  readonly platformGateStatus: 'NOT_CLOSED_BY_SELF_TEST';
  readonly recordedAt: string;
  readonly application: {
    readonly name: 'Activation Energy Studio';
    readonly version: string;
    readonly scientificBuildSha256: string;
    readonly coreMathVersion: string;
    readonly formulaSetVersion: string;
    readonly reportSchemaVersion: string;
  };
  readonly claimBoundary: string;
  readonly runtime: PlatformSelfTestRuntime;
  readonly fixture: {
    readonly name: 'synthetic_kas_150.csv';
    readonly expectedSha256: string;
    readonly observedSha256: string | null;
    readonly sizeBytes: number;
    readonly experimentalData: false;
  };
  readonly expectations: {
    readonly alphaGrid: readonly number[];
    readonly methods: readonly MethodSelfTestExpectation[];
    readonly expectedWarningCodes: readonly string[];
    readonly scientificPayloadCanonicalization:
      typeof PLATFORM_SELF_TEST_PAYLOAD_CANONICALIZATION;
    readonly expectedScientificPayloadSha256: string;
  };
  readonly checks: readonly PlatformSelfTestCheck[];
  readonly scientificPayload: PlatformSelfTestScientificPayload | null;
  readonly scientificPayloadSha256: string | null;
}

export interface PlatformSelfTestOptions {
  readonly fixtureCsv?: string;
  readonly recordedAt?: string;
  readonly runtime?: PlatformSelfTestRuntime;
}

function scientificBuildSha256(): string {
  return typeof __SCIENTIFIC_BUILD_SHA256__ === 'string'
    ? __SCIENTIFIC_BUILD_SHA256__
    : 'unavailable';
}

export function capturePlatformSelfTestRuntime(): PlatformSelfTestRuntime {
  const browserNavigator = typeof navigator === 'undefined' ? undefined : navigator;
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  return {
    userAgent: browserNavigator?.userAgent ?? 'unavailable',
    platform: browserNavigator?.platform ?? 'unavailable',
    languages: browserNavigator?.languages ? [...browserNavigator.languages] : [],
    locale: resolved.locale || browserNavigator?.language || 'unavailable',
    timeZone: resolved.timeZone || 'unavailable',
    online: typeof browserNavigator?.onLine === 'boolean' ? browserNavigator.onLine : null,
    hardwareConcurrency:
      typeof browserNavigator?.hardwareConcurrency === 'number'
        ? browserNavigator.hardwareConcurrency
        : null,
    pageProtocol: typeof location === 'undefined' ? 'unavailable' : location.protocol,
  };
}

function sameArray(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function fixedScientificDecimal(value: number, decimalPlaces: number, field: string): string {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be finite before scientific-payload canonicalization.`);
  }
  const fixed = value.toFixed(decimalPlaces);
  return Number(fixed) === 0
    ? `0.${'0'.repeat(decimalPlaces)}`
    : fixed;
}

export function canonicalPlatformSelfTestScientificPayload(
  payload: PlatformSelfTestScientificPayload,
): unknown {
  const policy = PLATFORM_SELF_TEST_PAYLOAD_CANONICALIZATION;
  return {
    canonicalization: policy.id,
    fixtureSha256: payload.fixtureSha256,
    alphaGrid: payload.alphaGrid.map((value) =>
      fixedScientificDecimal(value, policy.alphaDecimalPlaces, 'alphaGrid')),
    methods: [...payload.methods],
    includeKissinger: payload.includeKissinger,
    minR2Warning: fixedScientificDecimal(
      payload.minR2Warning,
      policy.thresholdDecimalPlaces,
      'minR2Warning',
    ),
    warningCodes: [...payload.warningCodes],
    methodsResults: payload.methodsResults.map((method) => ({
      method: method.method,
      formulaId: method.formulaId,
      status: method.status,
      estimates: method.estimates.map((estimate) => {
        if (!Number.isInteger(estimate.n)) {
          throw new Error('n must be an integer before scientific-payload canonicalization.');
        }
        return {
          alpha: fixedScientificDecimal(
            estimate.alpha,
            policy.alphaDecimalPlaces,
            `${method.method}.alpha`,
          ),
          activationEnergyKJPerMol: fixedScientificDecimal(
            estimate.activationEnergyKJPerMol,
            policy.activationEnergyDecimalPlaces,
            `${method.method}.activationEnergyKJPerMol`,
          ),
          r2: fixedScientificDecimal(
            estimate.r2,
            policy.r2DecimalPlaces,
            `${method.method}.r2`,
          ),
          n: estimate.n,
        };
      }),
    })),
  };
}

export function canonicalPlatformSelfTestScientificPayloadJson(
  payload: PlatformSelfTestScientificPayload,
): string {
  return JSON.stringify(canonicalPlatformSelfTestScientificPayload(payload));
}

function addCheck(
  checks: PlatformSelfTestCheck[],
  id: string,
  label: string,
  expected: unknown,
  observed: unknown,
  passed: boolean,
): void {
  checks.push({ id, label, expected, observed, status: passed ? 'PASS' : 'FAIL' });
}

function baseRecord(
  options: PlatformSelfTestOptions,
  fixtureSizeBytes: number,
  checks: PlatformSelfTestCheck[],
): Omit<PlatformSelfTestRecord, 'recordStatus' | 'scientificPayload' | 'scientificPayloadSha256'> {
  return {
    schema: PLATFORM_SELF_TEST_SCHEMA,
    contract: PLATFORM_SELF_TEST_CONTRACT,
    platformGateStatus: 'NOT_CLOSED_BY_SELF_TEST',
    recordedAt: options.recordedAt ?? new Date().toISOString(),
    application: {
      name: 'Activation Energy Studio',
      version: APP_VERSION,
      scientificBuildSha256: scientificBuildSha256(),
      coreMathVersion: CORE_MATH_VERSION,
      formulaSetVersion: FORMULA_SET_VERSION,
      reportSchemaVersion: REPORT_SCHEMA_VERSION,
    },
    claimBoundary:
      'PASS proves only that this browser runtime reproduced the locked embedded scientific fixture without a network call in the self-test implementation. It does not prove a complete Windows/macOS/Linux platform gate, zero-request HAR evidence, user-data correctness, experimental truth, or mechanism identification.',
    runtime: options.runtime ?? capturePlatformSelfTestRuntime(),
    fixture: {
      name: 'synthetic_kas_150.csv',
      expectedSha256: GOLDEN_INPUT_SHA256,
      observedSha256: null,
      sizeBytes: fixtureSizeBytes,
      experimentalData: false,
    },
    expectations: {
      alphaGrid: ALPHA_GRID,
      methods: PLATFORM_SELF_TEST_EXPECTATIONS,
      expectedWarningCodes: EXPECTED_WARNING_CODES,
      scientificPayloadCanonicalization:
        PLATFORM_SELF_TEST_PAYLOAD_CANONICALIZATION,
      expectedScientificPayloadSha256: EXPECTED_SCIENTIFIC_PAYLOAD_SHA256,
    },
    checks,
  };
}

function finishRecord(
  base: Omit<PlatformSelfTestRecord, 'recordStatus' | 'scientificPayload' | 'scientificPayloadSha256'>,
  observedSha256: string | null,
  scientificPayload: PlatformSelfTestScientificPayload | null,
  scientificPayloadSha256: string | null,
): PlatformSelfTestRecord {
  const recordStatus = base.checks.every((check) => check.status === 'PASS') ? 'PASS' : 'FAIL';
  return {
    ...base,
    recordStatus,
    fixture: { ...base.fixture, observedSha256 },
    scientificPayload,
    scientificPayloadSha256,
  };
}

export async function runPlatformSelfTest(
  options: PlatformSelfTestOptions = {},
): Promise<PlatformSelfTestRecord> {
  const fixtureCsv = options.fixtureCsv ?? syntheticKasExample;
  const fixture = new File([fixtureCsv], 'synthetic_kas_150.csv', { type: 'text/csv' });
  const checks: PlatformSelfTestCheck[] = [];
  const base = baseRecord(options, fixture.size, checks);
  let observedInputSha256: string | null = null;

  try {
    const buildSha = base.application.scientificBuildSha256;
    addCheck(
      checks,
      'BUILD-FINGERPRINT',
      'Scientific build fingerprint',
      '64 lowercase hexadecimal characters',
      buildSha,
      /^[a-f0-9]{64}$/.test(buildSha),
    );

    const sourceTrace = await hashFile(fixture);
    observedInputSha256 = sourceTrace.sha256;
    addCheck(
      checks,
      'INPUT-SHA256',
      'Locked synthetic-input SHA-256',
      GOLDEN_INPUT_SHA256,
      sourceTrace.sha256,
      sourceTrace.sha256 === GOLDEN_INPUT_SHA256,
    );
    if (sourceTrace.sha256 !== GOLDEN_INPUT_SHA256) {
      return finishRecord(base, observedInputSha256, null, null);
    }

    const ingestion = await ingestThermalFiles([fixture]);
    addCheck(checks, 'INGESTION', 'CSV ingestion status', 'ready', ingestion.status, ingestion.status === 'ready');
    if (ingestion.status !== 'ready') return finishRecord(base, observedInputSha256, null, null);

    const adapted = buildThermalRuns(
      ingestion,
      undefined,
      'platform-golden supplied-alpha 0.10-0.90 stage',
    );
    addCheck(
      checks,
      'ADAPTER',
      'Normalized runs and adapter diagnostics',
      { runCount: 4, diagnostics: [] },
      { runCount: adapted.runs.length, diagnostics: adapted.diagnostics.map((item) => item.code) },
      adapted.runs.length === 4 && adapted.diagnostics.length === 0,
    );
    if (adapted.runs.length !== 4 || adapted.diagnostics.length > 0) {
      return finishRecord(base, observedInputSha256, null, null);
    }

    const methods = PLATFORM_SELF_TEST_EXPECTATIONS.map((item) => item.method);
    const analysis = analyzeActivationEnergy(adapted.runs, {
      alphaValues: ALPHA_GRID,
      methods,
      includeKissinger: false,
      minR2Warning: 0.98,
    });
    const refusalCodes = analysis.refusals.map((item) => item.code);
    addCheck(
      checks,
      'GLOBAL-REFUSALS',
      'Global calculation rejection',
      [],
      refusalCodes,
      refusalCodes.length === 0,
    );
    const warningCodes = analysis.warnings.map((item) => item.code);
    addCheck(
      checks,
      'EXPECTED-WARNINGS',
      'Locked synthetic-warning contract',
      EXPECTED_WARNING_CODES,
      warningCodes,
      sameArray(warningCodes, EXPECTED_WARNING_CODES),
    );

    const methodsResults: PlatformSelfTestMethodResult[] = [];
    for (const expectation of PLATFORM_SELF_TEST_EXPECTATIONS) {
      const result = analysis.methods.find((item) => item.method === expectation.method);
      const estimates = result?.estimates.map((estimate) => ({
        alpha: estimate.alpha,
        activationEnergyKJPerMol: estimate.activationEnergyKJPerMol,
        r2: estimate.regression.r2,
        n: estimate.regression.n,
      })) ?? [];
      methodsResults.push({
        method: expectation.method,
        formulaId: result?.formulaId ?? 'missing',
        status: result?.status ?? 'missing',
        estimates,
      });
      const energies = estimates.map((item) => item.activationEnergyKJPerMol);
      const observed = {
        status: result?.status ?? 'missing',
        formulaId: result?.formulaId ?? 'missing',
        estimateCount: estimates.length,
        alphaGrid: estimates.map((item) => item.alpha),
        minimumActivationEnergyKJPerMol: energies.length > 0 ? Math.min(...energies) : null,
        maximumActivationEnergyKJPerMol: energies.length > 0 ? Math.max(...energies) : null,
        minimumR2: estimates.length > 0 ? Math.min(...estimates.map((item) => item.r2)) : null,
        observationsPerEstimate: [...new Set(estimates.map((item) => item.n))],
        refusalCodes: result?.refusals.map((item) => item.code) ?? ['METHOD_MISSING'],
      };
      const [minimumEa, maximumEa] = expectation.activationEnergyRangeKJPerMol;
      const passed = Boolean(result)
        && result?.status === 'success'
        && result.formulaId === expectation.formulaId
        && result.refusals.length === 0
        && estimates.length === expectation.estimateCount
        && sameArray(estimates.map((item) => item.alpha), ALPHA_GRID)
        && estimates.every((item) => Number.isFinite(item.activationEnergyKJPerMol))
        && estimates.every((item) => item.activationEnergyKJPerMol >= minimumEa)
        && estimates.every((item) => item.activationEnergyKJPerMol <= maximumEa)
        && estimates.every((item) => item.r2 >= expectation.minimumR2)
        && estimates.every((item) => item.n === expectation.observationsPerEstimate);
      addCheck(
        checks,
        `METHOD-${expectation.method}`,
        `${expectation.method} numerical contract`,
        expectation,
        observed,
        passed,
      );
    }

    const scientificPayload: PlatformSelfTestScientificPayload = {
      fixtureSha256: sourceTrace.sha256,
      alphaGrid: ALPHA_GRID,
      methods,
      includeKissinger: false,
      minR2Warning: 0.98,
      warningCodes,
      methodsResults,
    };
    const scientificPayloadText =
      canonicalPlatformSelfTestScientificPayloadJson(scientificPayload);
    const payloadTrace = await hashFile(new File(
      [scientificPayloadText],
      'platform-self-test-scientific-payload.json',
      { type: 'application/json' },
    ));
    addCheck(
      checks,
      'SCIENTIFIC-PAYLOAD-SHA256',
      'Canonical scientific-payload SHA-256',
      EXPECTED_SCIENTIFIC_PAYLOAD_SHA256,
      payloadTrace.sha256,
      payloadTrace.sha256 === EXPECTED_SCIENTIFIC_PAYLOAD_SHA256,
    );
    return finishRecord(base, observedInputSha256, scientificPayload, payloadTrace.sha256);
  } catch (error) {
    addCheck(
      checks,
      'RUNTIME-ERROR',
      'Self-test runtime error',
      'no exception',
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      false,
    );
    return finishRecord(base, observedInputSha256, null, null);
  }
}

export function serializePlatformSelfTestRecord(record: PlatformSelfTestRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}
