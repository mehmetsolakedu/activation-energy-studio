// @vitest-environment node

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  analyzeActivationEnergy,
  type IsoConversionalMethod,
} from '../src/core';
import { assessScientificDisposition } from '../src/product/disposition';
import {
  ingestThermalFiles,
  type IngestionOptions,
  type WideSeriesDefinition,
} from '../src/io';
import { buildThermalRuns } from '../src/integration';
import {
  createPdfReport,
  createProjectReport,
  createResultsCsv,
  serializeProjectReport,
} from '../src/report';

const VERIFICATION_DIR = resolve(process.cwd(), 'docs/verification-v0.4.1');
const MASTER = JSON.parse(
  readFileSync(resolve(VERIFICATION_DIR, 'decimal50-parity-reference.json'), 'utf8'),
);
const EXPORT_DIR = mkdtempSync(join(tmpdir(), 'aes-v041-parity-'));

afterAll(() => {
  rmSync(EXPORT_DIR, { recursive: true, force: true });
});

function sha256Buf(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

describe('v0.4.1 real-data app-to-Decimal(50) parity (Oak including Starink, and Rhubarb)', () => {
  it('matches Decimal(50) on Chilean Oak for FWO, KAS, and Starink and exports v0.4.1 JSON/CSV/PDF', async () => {
    const oakDir = resolve(process.cwd(), 'tests/fixtures/real/oak/source');
    const files = [
      { name: 'TGA-Oak-5Kmin-1.csv', beta: 5 },
      { name: 'TGA-Oak-10Kmin-1.csv', beta: 10 },
      { name: 'TGA-Oak-20Kmin-1.csv', beta: 20 },
      { name: 'TGA-Oak-40Kmin-1.csv', beta: 40 },
    ];
    const alphaGrid = Array.from({ length: 17 }, (_, i) =>
      Number((0.05 * (i + 1)).toFixed(2)),
    );
    const buffers = files.map((f) => readFileSync(resolve(oakDir, f.name)));
    const inputs = files.map(
      (f, idx) => new File([new Uint8Array(buffers[idx]!)], f.name, { type: 'text/csv' }),
    );
    const options: IngestionOptions[] = files.map((f) => ({
      layout: 'wide-series',
      headerRow: 1,
      delimiter: ';',
      decimalSeparator: '.',
      wideAlphaGrid: alphaGrid,
      wideScopeConfirmed: true,
      wideSeries: [
        {
          seriesId: `oak-${f.beta}`,
          runId: `oak-${f.beta}`,
          temperature: { columnIndex: 0, unit: 'C' },
          signal: { kind: 'alpha', columnIndex: 6, unit: 'fraction' },
          derivative: {
            semantic: 'dAlphaDt',
            valueColumnIndex: 8,
            unit: 'min^-1',
          },
          heatingRate: { value: f.beta, unit: 'K/min' },
          context: {
            sample: 'Chilean Oak (untreated)',
            atmosphere: 'N2',
            stage: 'Pyrolysis conversion branch, alpha = 0.05-0.85',
          },
        } satisfies WideSeriesDefinition,
      ],
    }));

    const batch = await ingestThermalFiles(inputs, options);
    expect(batch.status).toBe('ready');
    const built = buildThermalRuns(batch);
    expect(built.diagnostics).toEqual([]);

    const analysis = analyzeActivationEnergy(built.runs, {
      alphaValues: alphaGrid,
      methods: ['FWO', 'KAS', 'STARINK'],
      includeKissinger: false,
      minR2Warning: 0.98,
    });
    const disposition = assessScientificDisposition(analysis, {
      alphaGrid,
      minimumReportableR2: 0.98,
    });

    expect(disposition.overallDisposition).toBe('REPORTABLE_WITH_CAUTION');
    const maxDiffs: Record<string, { maxEaDiff: number; maxR2Diff: number }> = {};
    for (const methodName of ['FWO', 'KAS', 'STARINK'] as IsoConversionalMethod[]) {
      const m = analysis.methods.find((x) => x.method === methodName)!;
      const wCodes = m.warnings.map((w) => w.code);
      expect(wCodes).toContain('POSSIBLE_MULTISTEP_EA_VARIATION');
      expect(wCodes).toContain('INTEGRAL_METHOD_VARIABLE_EA_BIAS');
      const refRows = MASTER.oak.baselineSummary[methodName].perAlpha;
      let maxEaDiff = 0;
      let maxR2Diff = 0;
      for (let i = 0; i < 17; i += 1) {
        const est = m.estimates[i]!;
        maxEaDiff = Math.max(
          maxEaDiff,
          Math.abs(est.activationEnergyKJPerMol - refRows[i].ea),
        );
        maxR2Diff = Math.max(maxR2Diff, Math.abs(est.regression.r2 - refRows[i].r2));
      }
      maxDiffs[methodName] = { maxEaDiff, maxR2Diff };
      expect(maxEaDiff).toBeLessThan(1e-11);
      expect(maxR2Diff).toBeLessThan(1e-14);
    }

    const report = createProjectReport(
      analysis,
      {
        projectName: 'Chilean Oak four-rate TGA pyrolysis (v0.4.1)',
        sample: 'Chilean Oak (untreated)',
        process: 'Pyrolysis',
        atmosphere: 'N2',
        stage: 'Pyrolysis conversion branch, alpha = 0.05-0.85',
        sourceFiles: files.map((f, idx) => ({
          name: f.name,
          sizeBytes: buffers[idx]!.byteLength,
          sha256: sha256Buf(buffers[idx]!),
        })),
      },
      {
        ingestion: batch,
        ingestionOptions: options,
        analysisConfiguration: {
          alphaGrid,
          methods: ['FWO', 'KAS', 'STARINK'],
          includeKissinger: false,
          minR2Warning: 0.98,
        },
      },
    );
    const oakCsv = createResultsCsv(report);
    writeFileSync(
      resolve(EXPORT_DIR, 'oak_v041_report.json'),
      serializeProjectReport(report),
      'utf8',
    );
    writeFileSync(
      resolve(EXPORT_DIR, 'oak_v041_results.csv'),
      oakCsv,
      'utf8',
    );
    const pdfBlob = createPdfReport(report);
    const pdfBytes = Buffer.from(await pdfBlob.arrayBuffer());
    writeFileSync(resolve(EXPORT_DIR, 'oak_v041_report.pdf'), pdfBytes);
    expect(oakCsv).toBe(
      readFileSync(resolve(VERIFICATION_DIR, 'oak_v041_results.csv'), 'utf8'),
    );
    expect(pdfBytes.byteLength).toBeGreaterThan(10_000);
  });

  it('matches Decimal(50) on Rhubarb direct XLSX, enforces v0.4.1 CI-excludes-zero (6/64 REPORTABLE_WITH_CAUTION, 58/64 CALCULATED_UNRELIABLE), and exports JSON/CSV/PDF', async () => {
    const xlsxPath = resolve(
      process.cwd(),
      'tests/fixtures/real/source/paper010/pone.0173946.s002.xlsx',
    );
    const bytes = readFileSync(xlsxPath);
    const alphaGrid = Array.from({ length: 16 }, (_, i) =>
      Number((0.05 * (i + 1)).toFixed(2)),
    );
    const options: IngestionOptions[] = [
      {
        layout: 'wide-series',
        sheet: 'Fig.2.',
        headerRow: 2,
        decimalSeparator: '.',
        wideAlphaGrid: alphaGrid,
        wideScopeConfirmed: true,
        wideSeries: [
          {
            seriesId: 'rh-5',
            runId: 'RH-5',
            temperature: { columnIndex: 0, unit: 'C' },
            signal: {
              kind: 'massPercent',
              columnIndex: 1,
              unit: '%',
              alphaReference: { initialValue: 100, finalValue: 0 },
            },
            derivative: {
              semantic: 'massLossRate',
              valueColumnIndex: 7,
              unit: '%/min',
              temperatureColumn: { columnIndex: 6, unit: 'C' },
            },
            heatingRate: { value: 5, unit: 'K/min' },
            context: {
              sample: 'Rhubarb (RH)',
              atmosphere: 'Simulated air (N2:O2=4:1)',
              stage: 'RH conversion branch, alpha = 0.05-0.80',
            },
          },
          {
            seriesId: 'rh-10',
            runId: 'RH-10',
            temperature: { columnIndex: 2, unit: 'C' },
            signal: {
              kind: 'massPercent',
              columnIndex: 3,
              unit: '%',
              alphaReference: { initialValue: 100, finalValue: 0 },
            },
            derivative: {
              semantic: 'massLossRate',
              valueColumnIndex: 9,
              unit: '%/min',
              temperatureColumn: { columnIndex: 8, unit: 'C' },
            },
            heatingRate: { value: 10, unit: 'K/min' },
            context: {
              sample: 'Rhubarb (RH)',
              atmosphere: 'Simulated air (N2:O2=4:1)',
              stage: 'RH conversion branch, alpha = 0.05-0.80',
            },
          },
          {
            seriesId: 'rh-20',
            runId: 'RH-20',
            temperature: { columnIndex: 4, unit: 'C' },
            signal: {
              kind: 'massPercent',
              columnIndex: 5,
              unit: '%',
              alphaReference: { initialValue: 100, finalValue: 0 },
            },
            derivative: {
              semantic: 'massLossRate',
              valueColumnIndex: 11,
              unit: '%/min',
              temperatureColumn: { columnIndex: 10, unit: 'C' },
            },
            heatingRate: { value: 20, unit: 'K/min' },
            context: {
              sample: 'Rhubarb (RH)',
              atmosphere: 'Simulated air (N2:O2=4:1)',
              stage: 'RH conversion branch, alpha = 0.05-0.80',
            },
          },
        ],
      },
    ];

    const batch = await ingestThermalFiles(
      [
        new File([new Uint8Array(bytes)], 'pone.0173946.s002.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      ],
      options,
    );
    expect(batch.status).toBe('ready');
    const built = buildThermalRuns(batch);
    expect(built.diagnostics).toEqual([]);

    const analysis = analyzeActivationEnergy(built.runs, {
      alphaValues: alphaGrid,
      methods: ['FWO', 'KAS', 'STARINK', 'FRIEDMAN'],
      includeKissinger: false,
      minR2Warning: 0.98,
    });
    const disposition = assessScientificDisposition(analysis, {
      alphaGrid,
      minimumReportableR2: 0.98,
    });

    expect(disposition.overallDisposition).toBe('CALCULATED_UNRELIABLE');
    let totalReportableWithCaution = 0;
    let totalUnreliable = 0;
    const methodSummary: Record<string, unknown> = {};
    for (const ms of disposition.methods) {
      expect(ms.disposition).toBe('CALCULATED_UNRELIABLE');
      expect(ms.meanEaRecommended).toBe(false);
      const rc = ms.results.filter(
        (r) => r.disposition === 'REPORTABLE_WITH_CAUTION',
      ).length;
      const un = ms.results.filter(
        (r) => r.disposition === 'CALCULATED_UNRELIABLE',
      ).length;
      const ciZero = ms.results.filter((r) =>
        r.reasons.some(
          (x) => x.code === 'ACTIVATION_ENERGY_CI_INCLUDES_NONPOSITIVE',
        ),
      ).length;
      totalReportableWithCaution += rc;
      totalUnreliable += un;
      const coreM = analysis.methods.find((x) => x.method === ms.method)!;
      const hasBias = coreM.warnings.some(
        (w) => w.code === 'INTEGRAL_METHOD_VARIABLE_EA_BIAS',
      );
      if (ms.method === 'FRIEDMAN') expect(hasBias).toBe(false);
      else expect(hasBias).toBe(true);
      const refRows = MASTER.rhubarb.nominal100to0[ms.method].rows;
      let maxEaDiff = 0;
      for (let i = 0; i < 16; i += 1) {
        maxEaDiff = Math.max(
          maxEaDiff,
          Math.abs(coreM.estimates[i]!.activationEnergyKJPerMol - refRows[i].ea),
        );
      }
      expect(maxEaDiff).toBeLessThan(1e-8);
      methodSummary[ms.method] = {
        reportableWithCaution: rc,
        unreliable: un,
        ciIncludesNonpositive: ciZero,
        hasIntegralBiasWarning: hasBias,
        maxEaDiffVsDecimal50: maxEaDiff,
      };
    }
    expect(totalReportableWithCaution).toBe(6);
    expect(totalUnreliable).toBe(58);

    const report = createProjectReport(
      analysis,
      {
        projectName: 'Rhubarb three-rate direct XLSX (v0.4.1)',
        sample: 'Rhubarb (RH)',
        process: 'Combustion / partial carbonizing',
        atmosphere: 'Simulated air (N2:O2=4:1)',
        stage: 'RH conversion branch, alpha = 0.05-0.80',
        sourceFiles: [
          {
            name: 'pone.0173946.s002.xlsx',
            sizeBytes: bytes.byteLength,
            sha256: sha256Buf(bytes),
          },
        ],
      },
      {
        ingestion: batch,
        ingestionOptions: options,
        analysisConfiguration: {
          alphaGrid,
          methods: ['FWO', 'KAS', 'STARINK', 'FRIEDMAN'],
          includeKissinger: false,
          minR2Warning: 0.98,
        },
      },
    );
    const rhubarbCsv = createResultsCsv(report);
    writeFileSync(
      resolve(EXPORT_DIR, 'rhubarb_v041_report.json'),
      serializeProjectReport(report),
      'utf8',
    );
    writeFileSync(
      resolve(EXPORT_DIR, 'rhubarb_v041_results.csv'),
      rhubarbCsv,
      'utf8',
    );
    const pdfBlob = createPdfReport(report);
    const pdfBytes = Buffer.from(await pdfBlob.arrayBuffer());
    writeFileSync(resolve(EXPORT_DIR, 'rhubarb_v041_report.pdf'), pdfBytes);
    expect(rhubarbCsv).toBe(
      readFileSync(resolve(VERIFICATION_DIR, 'rhubarb_v041_results.csv'), 'utf8'),
    );
    expect(pdfBytes.byteLength).toBeGreaterThan(10_000);
  });
});
