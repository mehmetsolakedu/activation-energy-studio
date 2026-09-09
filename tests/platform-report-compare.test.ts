import { describe, expect, it } from 'vitest';

import {
  canonicalScientificJson,
  firstDifference,
  scientificReportHash,
} from '../scripts/compare-scientific-reports-v032.mjs';

function report(generatedAt: string, activationEnergyKJPerMol = 150) {
  return {
    schemaVersion: 'activation-energy-studio/project-report/v6',
    application: { name: 'Activation Energy Studio', version: '0.3.2' },
    generatedAt,
    context: { projectName: 'Platform golden', sourceFiles: [] },
    analysis: { methods: [{ method: 'KAS', estimates: [{ alpha: 0.5, activationEnergyKJPerMol }] }] },
  };
}

describe('cross-platform scientific report comparison', () => {
  it('ignores only generatedAt and makes object key order irrelevant', () => {
    const mac = report('2026-07-18T10:00:00.000Z');
    const windows = {
      ...report('2026-07-18T11:00:00.000Z'),
      application: { version: '0.3.2', name: 'Activation Energy Studio' },
    };

    expect(canonicalScientificJson(mac)).toBe(canonicalScientificJson(windows));
    expect(scientificReportHash(mac)).toBe(scientificReportHash(windows));
  });

  it('reports the first numeric difference without tolerance', () => {
    const left = JSON.parse(canonicalScientificJson(report('a', 150)));
    const right = JSON.parse(canonicalScientificJson(report('b', 150.0000001)));
    const difference = firstDifference(left, right);

    expect(difference?.path).toBe('$.analysis.methods[0].estimates[0].activationEnergyKJPerMol');
    expect(difference?.left).toBe(150);
    expect(difference?.right).toBe(150.0000001);
  });

  it('rejects non-project JSON instead of comparing unrelated files', () => {
    expect(() => canonicalScientificJson({ result: 1 })).toThrow('Unsupported report schema');
  });

  it('retains comparison support for the historical v0.2.0 schema-v4 contract', () => {
    const legacy = {
      ...report('2026-07-18T10:00:00.000Z'),
      schemaVersion: 'activation-energy-studio/project-report/v4',
      application: { name: 'Activation Energy Studio', version: '0.2.0' },
    };
    expect(canonicalScientificJson(legacy)).toContain('project-report/v4');
    expect(scientificReportHash(legacy)).toMatch(/^[a-f0-9]{64}$/u);
  });
});
