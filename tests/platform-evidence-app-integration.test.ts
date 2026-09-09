import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { createPlatformEvidenceRecord } from '../scripts/create-platform-evidence-record.mjs';
import { analyzeActivationEnergy } from '../src/core';
import { buildThermalRuns } from '../src/integration';
import { ingestThermalFiles } from '../src/io';
import {
  runPlatformSelfTest,
  serializePlatformSelfTestRecord,
} from '../src/platformSelfTest';
import {
  createPdfReport,
  createProjectReport,
  createResultsCsv,
  serializeProjectReport,
} from '../src/report';
import syntheticCsv from '../examples/synthetic_kas_150.csv?raw';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_PATH = resolve(PROJECT_ROOT, 'release/Activation-Energy-Studio-v0.2.0.html');
const GOLDEN_INPUT_PATH = resolve(PROJECT_ROOT, 'examples/synthetic_kas_150.csv');

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function artifact(path: string) {
  return { path, sha256: sha256(path) };
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, payload: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, payload])));
  return Buffer.concat([length, typeBytes, payload, checksum]);
}

function makeScreenshotPng(width = 640, height = 360): Buffer {
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

describe('platform evidence record with an application-generated report', () => {
  it('refuses to bind current v0.3 exports to the immutable v0.2 release evidence', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'activation-energy-platform-app-'));
    try {
      const file = new File([syntheticCsv], 'synthetic_kas_150.csv', { type: 'text/csv' });
      const ingestion = await ingestThermalFiles([file]);
      expect(ingestion.status).toBe('ready');
      if (ingestion.status !== 'ready') throw new Error('Golden ingestion unexpectedly failed.');
      const adapted = buildThermalRuns(
        ingestion,
        undefined,
        'platform-golden supplied-alpha 0.10-0.90 stage',
      );
      const alphaGrid = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
      const methods = ['FWO', 'KAS', 'STARINK', 'FRIEDMAN'] as const;
      const analysis = analyzeActivationEnergy(adapted.runs, {
        alphaValues: alphaGrid,
        methods,
        includeKissinger: false,
        minR2Warning: 0.98,
      });
      const goldenBytes = readFileSync(GOLDEN_INPUT_PATH);
      const report = createProjectReport(
        analysis,
        {
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
            },
          ],
        },
        {
          ingestion,
          analysisConfiguration: {
            alphaGrid,
            methods,
            includeKissinger: false,
            minR2Warning: 0.98,
          },
        },
      );
      report.generatedAt = '2026-07-18T10:05:00.000Z';

      const reportJsonPath = join(directory, 'report.json');
      const reportCsvPath = join(directory, 'report.csv');
      const reportPdfPath = join(directory, 'report.pdf');
      const selfTestJsonPath = join(directory, 'platform-self-test.json');
      const networkHarPath = join(directory, 'network.har');
      const screenshotPath = join(directory, 'result.png');
      const manifestPath = join(directory, 'run-input.json');
      const selfTest = await runPlatformSelfTest({
        recordedAt: '2026-07-18T10:01:00.000Z',
        runtime: {
          userAgent: 'Application contract fixture',
          platform: 'Contract platform',
          languages: ['en-US'],
          locale: 'en-US',
          timeZone: 'Europe/Istanbul',
          online: false,
          hardwareConcurrency: 8,
          pageProtocol: 'file:',
        },
      });
      expect(
        selfTest.recordStatus,
        JSON.stringify(selfTest.checks.filter((check) => check.status === 'FAIL'), null, 2),
      ).toBe('PASS');
      writeFileSync(reportJsonPath, `${serializeProjectReport(report)}\n`);
      writeFileSync(reportCsvPath, createResultsCsv(report));
      writeFileSync(reportPdfPath, Buffer.from(await createPdfReport(report).arrayBuffer()));
      writeFileSync(selfTestJsonPath, serializePlatformSelfTestRecord(selfTest));
      writeFileSync(
        networkHarPath,
        `${JSON.stringify(
          {
            log: {
              version: '1.2',
              creator: { name: 'Vitest Contract HAR', version: '1.0.0' },
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
                    url: 'file:///validation/Activation-Energy-Studio-v0.2.0.html',
                  },
                },
              ],
            },
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(screenshotPath, makeScreenshotPng());

      const manifest = {
        schemaVersion: 'activation-energy-studio/platform-run-input/v1',
        runId: 'macos-application-golden-01',
        observer: { name: 'Automated application contract' },
        startedAt: '2026-07-18T10:00:00.000Z',
        endedAt: '2026-07-18T10:10:00.000Z',
        environment: {
          os: {
            family: 'macos',
            edition: 'macOS test fixture',
            build: 'test-build',
            architecture: 'arm64',
          },
          runtime: {
            documentProtocol: 'file:',
            onlineStateDuringRun: false,
            userAgent: 'Application contract fixture',
            javascriptEngine: 'Vitest JavaScript runtime',
          },
          browser: {
            name: 'Contract Browser',
            version: '1.0.0',
            engine: 'Contract Engine 1.0',
            navigatorLanguage: 'en-US',
            navigatorLanguages: ['en-US'],
          },
          locale: { osLocale: 'en-US', timeZone: 'Europe/Istanbul', decimalSeparator: '.' },
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
          selfTestJson: artifact(selfTestJsonPath),
          reportJson: artifact(reportJsonPath),
          reportCsv: artifact(reportCsvPath),
          reportPdf: artifact(reportPdfPath),
          networkHar: artifact(networkHarPath),
          screenshot: artifact(screenshotPath),
        },
      };
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      expect(() => createPlatformEvidenceRecord(manifestPath))
        .toThrow('selfTestJson schema or contract does not match the platform self-test');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
