import { createHash } from 'node:crypto';

import { analyzeActivationEnergy, type ThermalRun } from '../../src/core';
import { buildThermalRuns } from '../../src/integration';
import { ingestThermalFiles, type BatchIngestionResult, type BetaTpRow } from '../../src/io';
import { createProjectReport } from '../../src/report';
import syntheticCsv from '../../examples/synthetic_kas_150.csv?raw';
import {
  VERIFIED_BETA_TP_ROW_EVIDENCE,
  VERIFIED_CURVE_PEAK_EVIDENCE,
} from './peak-evidence';

export async function makeSchemaV7QaReport() {
  const stage = 'alpha 0.10-0.90 synthetic window';
  const file = new File([syntheticCsv], 'synthetic_kas_150.csv', { type: 'text/csv' });
  const ingestion = await ingestThermalFiles([file]);
  if (ingestion.status !== 'ready') throw new Error('QA fixture ingestion was not ready.');
  const adapted = buildThermalRuns(ingestion, undefined, stage);
  if (adapted.runs.length !== 4) throw new Error('QA fixture must produce four thermal runs.');

  const peakRows: BetaTpRow[] = adapted.runs.map((run) => {
    const peakPoint = run.points[4];
    const source = ingestion.records.find(
      (record) =>
        record.runId === run.id && Math.abs(record.temperatureK - peakPoint.temperature) < 1e-8,
    );
    if (!source) throw new Error(`Missing source row for ${run.id} peak fixture.`);
    return {
      runId: run.id,
      heatingRateKPerMin: run.heatingRate,
      peakTemperatureK: peakPoint.temperature,
      sample: run.sampleId,
      atmosphere: run.atmosphere,
      stage,
      ...VERIFIED_BETA_TP_ROW_EVIDENCE,
      provenance: source.provenance,
    };
  });
  const ingestionWithPeaks: BatchIngestionResult = {
    ...ingestion,
    tables: { ...ingestion.tables, betaTp: peakRows },
  };
  const runsWithPeaks: ThermalRun[] = adapted.runs.map((run, index) => ({
    ...run,
    peakTemperature: peakRows[index].peakTemperatureK,
    ...VERIFIED_CURVE_PEAK_EVIDENCE,
  }));
  const alphaGrid = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  const methods = ['FWO', 'KAS', 'STARINK', 'FRIEDMAN'] as const;
  const analysis = analyzeActivationEnergy(runsWithPeaks, {
    alphaValues: alphaGrid,
    methods,
    includeKissinger: true,
    minR2Warning: 0.98,
  });
  const report = createProjectReport(
    analysis,
    {
      projectName: 'Schema v7 PDF visual QA',
      sample: 'synthetic-kas',
      process: 'multi-rate thermal decomposition',
      stage,
      atmosphere: 'N2',
      analystNote:
        'Synthetic QA fixture with a known KAS target. This artifact validates report rendering, not experimental truth.',
      sourceFiles: [
        {
          name: file.name,
          sizeBytes: file.size,
          sha256: createHash('sha256').update(syntheticCsv).digest('hex'),
        },
      ],
    },
    {
      ingestion: ingestionWithPeaks,
      analysisConfiguration: {
        alphaGrid,
        methods,
        includeKissinger: true,
        minR2Warning: 0.98,
      },
    },
  );
  report.generatedAt = '2026-07-18T00:00:00.000Z';
  return report;
}
