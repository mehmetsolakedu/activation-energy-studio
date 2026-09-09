import { describe, expect, it } from 'vitest';

import { analyzeActivationEnergy } from '../src/core';
import { buildThermalRuns } from '../src/integration';
import { ingestThermalFiles } from '../src/io';

const curveCsv = [
  'Temperature [K],Alpha [0-1],Heating rate [K/min],Run,Sample,Atmosphere,Reaction stage',
  '500,0.1,5,run-5,sample-a,N2,main decomposition',
  '550,0.5,5,run-5,sample-a,N2,main decomposition',
  '600,0.9,5,run-5,sample-a,N2,main decomposition',
  '510,0.1,10,run-10,sample-a,N2,main decomposition',
  '560,0.5,10,run-10,sample-a,N2,main decomposition',
  '610,0.9,10,run-10,sample-a,N2,main decomposition',
  '520,0.1,20,run-20,sample-a,N2,main decomposition',
  '570,0.5,20,run-20,sample-a,N2,main decomposition',
  '620,0.9,20,run-20,sample-a,N2,main decomposition',
  '',
].join('\n');

describe('first-class reaction-stage ingestion contract', () => {
  it('detects and propagates a stage column through records, processed tables, adapter, and core', async () => {
    const ingestion = await ingestThermalFiles([
      new File([curveCsv], 'stage-column.csv', { type: 'text/csv' }),
    ]);

    expect(ingestion.status).toBe('ready');
    expect(ingestion.files[0]?.mappings).toContainEqual(
      expect.objectContaining({ role: 'stage', header: 'Reaction stage' }),
    );
    expect(new Set(ingestion.records.map((record) => record.stage)))
      .toEqual(new Set(['main decomposition']));
    expect(new Set(ingestion.tables.tAlphaBeta.map((row) => row.stage)))
      .toEqual(new Set(['main decomposition']));

    const adapted = buildThermalRuns(ingestion);
    expect(adapted.diagnostics).toEqual([]);
    expect(adapted.runs).toHaveLength(3);
    expect(adapted.runs.every((run) => run.stage === 'main decomposition')).toBe(true);

    const analysis = analyzeActivationEnergy(adapted.runs, {
      alphaValues: [0.5],
      methods: ['KAS'],
      includeKissinger: false,
    });
    expect(analysis.status).not.toBe('refused');
    expect(analysis.methods[0]?.estimates).toHaveLength(1);
  });

  it('does not mistake a temperature-step header for a reaction-stage column', async () => {
    const csv = [
      'Temperature step [K],Alpha [0-1],Heating rate [K/min],Run',
      '500,0.1,5,run-5',
      '550,0.5,5,run-5',
      '600,0.9,5,run-5',
      '',
    ].join('\n');
    const ingestion = await ingestThermalFiles([
      new File([csv], 'temperature-step.csv', { type: 'text/csv' }),
    ]);

    expect(ingestion.files[0]?.mappings.some(({ role }) => role === 'stage')).toBe(false);
  });

  it('reports partial stage assignment as an adapter hard error', async () => {
    const partial = curveCsv.replace(
      '550,0.5,5,run-5,sample-a,N2,main decomposition',
      '550,0.5,5,run-5,sample-a,N2,',
    );
    const ingestion = await ingestThermalFiles([
      new File([partial], 'partial-stage.csv', { type: 'text/csv' }),
    ]);
    const adapted = buildThermalRuns(ingestion);

    expect(ingestion.status).toBe('ready');
    expect(adapted.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'AMBIGUOUS_STAGE',
        runId: 'run-5',
      }),
    );
    expect(adapted.runs.some((run) => run.id === 'run-5')).toBe(false);
  });
});
