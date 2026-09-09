import { describe, expect, it } from 'vitest';

import {
  canonicalPlatformSelfTestScientificPayloadJson,
  EXPECTED_SCIENTIFIC_PAYLOAD_SHA256,
  GOLDEN_INPUT_SHA256,
  PLATFORM_SELF_TEST_EXPECTATIONS,
  PLATFORM_SELF_TEST_PAYLOAD_CANONICALIZATION,
  runPlatformSelfTest,
  serializePlatformSelfTestRecord,
  type PlatformSelfTestRuntime,
} from '../src/platformSelfTest';

const lockedRuntime: PlatformSelfTestRuntime = {
  userAgent: 'locked-test-runtime',
  platform: 'test-platform',
  languages: ['tr-TR', 'en-US'],
  locale: 'tr-TR',
  timeZone: 'Europe/Istanbul',
  online: false,
  hardwareConcurrency: 8,
  pageProtocol: 'file:',
};

describe('browser platform scientific self-test', () => {
  it('reproduces the locked ingestion-to-core payload and leaves the platform gate open', async () => {
    const record = await runPlatformSelfTest({
      recordedAt: '2026-07-18T12:00:00.000Z',
      runtime: lockedRuntime,
    });

    expect(record.recordStatus).toBe('PASS');
    expect(record.platformGateStatus).toBe('NOT_CLOSED_BY_SELF_TEST');
    expect(record.application.scientificBuildSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(record.fixture.observedSha256).toBe(GOLDEN_INPUT_SHA256);
    expect(record.scientificPayloadSha256).toBe(EXPECTED_SCIENTIFIC_PAYLOAD_SHA256);
    expect(record.checks).toHaveLength(11);
    expect(record.checks.every((check) => check.status === 'PASS')).toBe(true);
    expect(record.checks.map((check) => check.label)).toEqual([
      'Scientific build fingerprint',
      'Locked synthetic-input SHA-256',
      'CSV ingestion status',
      'Normalized runs and adapter diagnostics',
      'Global calculation rejection',
      'Locked synthetic-warning contract',
      'FWO numerical contract',
      'KAS numerical contract',
      'STARINK numerical contract',
      'FRIEDMAN numerical contract',
      'Canonical scientific-payload SHA-256',
    ]);
    expect(record.scientificPayload?.methodsResults.map((method) => method.method))
      .toEqual(['FWO', 'KAS', 'STARINK', 'FRIEDMAN']);
    expect(record.scientificPayload?.methodsResults.every((method) => method.estimates.length === 9))
      .toBe(true);
    expect(record.expectations.methods).toEqual(PLATFORM_SELF_TEST_EXPECTATIONS);
    expect(record.expectations.scientificPayloadCanonicalization)
      .toEqual(PLATFORM_SELF_TEST_PAYLOAD_CANONICALIZATION);
    expect(record.claimBoundary).toContain('does not prove a complete Windows/macOS/Linux platform gate');
  });

  it('canonicalizes the five measured Chrome 150 last-bit differences without changing raw results', async () => {
    const record = await runPlatformSelfTest({
      recordedAt: '2026-07-18T12:00:00.000Z',
      runtime: lockedRuntime,
    });
    expect(record.scientificPayload).not.toBeNull();
    const nodePayload = record.scientificPayload!;
    const chromeEquivalent = JSON.parse(JSON.stringify(nodePayload));
    const measuredChromeValues = [
      [1, 0, 149.99999751114706],
      [2, 3, 150.28304748224974],
      [3, 0, 150.28856889338118],
      [3, 7, 150.32931988768277],
      [3, 8, 150.35433035829206],
    ] as const;
    for (const [methodIndex, estimateIndex, value] of measuredChromeValues) {
      chromeEquivalent.methodsResults[methodIndex].estimates[
        estimateIndex
      ].activationEnergyKJPerMol = value;
    }

    expect(JSON.stringify(chromeEquivalent)).not.toBe(JSON.stringify(nodePayload));
    expect(canonicalPlatformSelfTestScientificPayloadJson(chromeEquivalent))
      .toBe(canonicalPlatformSelfTestScientificPayloadJson(nodePayload));
    expect(nodePayload.methodsResults[1].estimates[0].activationEnergyKJPerMol)
      .toBe(149.99999751114692);
  });

  it('is deterministic outside explicitly volatile runtime metadata', async () => {
    const first = await runPlatformSelfTest({
      recordedAt: '2026-07-18T12:00:00.000Z',
      runtime: lockedRuntime,
    });
    const second = await runPlatformSelfTest({
      recordedAt: '2030-01-01T00:00:00.000Z',
      runtime: { ...lockedRuntime, platform: 'another-platform' },
    });

    expect(second.scientificPayload).toEqual(first.scientificPayload);
    expect(second.scientificPayloadSha256).toBe(first.scientificPayloadSha256);
    expect(second.recordedAt).not.toBe(first.recordedAt);
    expect(second.runtime.platform).not.toBe(first.runtime.platform);
  });

  it('fails closed before ingestion when the embedded fixture bytes are changed', async () => {
    const record = await runPlatformSelfTest({
      fixtureCsv: 'temperature,alpha,heating_rate\n500,0.5,10\n',
      recordedAt: '2026-07-18T12:00:00.000Z',
      runtime: lockedRuntime,
    });

    expect(record.recordStatus).toBe('FAIL');
    expect(record.checks.find((check) => check.id === 'INPUT-SHA256')?.status).toBe('FAIL');
    expect(record.checks.some((check) => check.id === 'INGESTION')).toBe(false);
    expect(record.scientificPayload).toBeNull();
    expect(record.scientificPayloadSha256).toBeNull();
  });

  it('serializes a newline-terminated machine-readable evidence record', async () => {
    const record = await runPlatformSelfTest({
      recordedAt: '2026-07-18T12:00:00.000Z',
      runtime: lockedRuntime,
    });
    const serialized = serializePlatformSelfTestRecord(record);

    expect(serialized.endsWith('\n')).toBe(true);
    expect(JSON.parse(serialized)).toEqual(record);
    expect(serialized).toContain('NOT_CLOSED_BY_SELF_TEST');
  });
});
