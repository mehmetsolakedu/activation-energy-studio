import { describe, expect, it } from 'vitest';

import type { ActivationEnergyAnalysis } from '../src/core/types';
import {
  APP_VERSION,
  CORE_MATH_VERSION,
  createPdfReport,
  createProjectReport,
  createResultsCsv,
  serializeProjectReport,
} from '../src/report';
import packageJsonRaw from '../package.json?raw';

const analysis: ActivationEnergyAnalysis = {
  status: 'success',
  preparedRuns: [],
  eligibility: {
    eligible: true,
    commonAlphaRange: [0.1, 0.9],
    distinctHeatingRates: 4,
    refusals: [],
    warnings: [],
  },
  methods: [
    {
      method: 'KAS',
      resultType: 'isoconversional',
      formulaId: 'kas_ln_beta_over_t2_v1',
      status: 'success',
      estimates: [
        {
          alpha: 0.5,
          activationEnergyKJPerMol: 150,
          observations: [],
          regression: {
            n: 4,
            rawObservationCount: 4,
            residualDegreesOfFreedom: 2,
            inputAggregation: 'none',
            inputGroups: [],
            x: [1, 2, 3, 4],
            y: [4, 3, 2, 1],
            slope: -18,
            intercept: 5,
            fitted: [4, 3, 2, 1],
            residuals: [0, 0, 0, 0],
            sse: 0,
            r2: 1,
            residualStandardError: 0,
            slopeStandardError: 0.6,
            slopeConfidence95: [-20, -16],
          },
        },
      ],
      refusals: [],
      warnings: [],
    },
  ],
  refusals: [],
  warnings: [],
  constants: { gasConstantJPerMolK: 8.31446261815324 },
};

describe('reproducible reporting', () => {
  it('keeps the report version synchronized with the release package', () => {
    expect(APP_VERSION).toBe(JSON.parse(packageJsonRaw).version);
  });

  it('serializes the complete project schema', () => {
    const report = createProjectReport(analysis, {
      projectName: 'Synthetic check',
      sourceFiles: [{ name: 'run.csv', sizeBytes: 12, sha256: 'a'.repeat(64) }],
    });

    const json = JSON.parse(serializeProjectReport(report));
    expect(json.schemaVersion).toBe('activation-energy-studio/project-report/v6');
    expect(json.application.version).toBe('0.3.2');
    expect(json.reproducibility.coreMathVersion).toBe(CORE_MATH_VERSION);
    expect(json.analysis.methods[0].method).toBe('KAS');
    expect(json.context.sourceFiles[0].sha256).toBe('a'.repeat(64));
    expect(json.results[0]).toMatchObject({
      formulaId: 'kas_ln_beta_over_t2_v1',
      status: 'success',
      disposition: 'REPORTABLE',
    });
  });

  it('exports separate computation status and scientific disposition to CSV', () => {
    const csv = createResultsCsv(analysis);
    expect(csv).toContain('activationEnergyKJPerMol');
    expect(csv).toContain('KAS,isoconversional,kas_ln_beta_over_t2_v1,0.5,150');
    expect(csv).toContain('133.33333333333334,166.66666666666669');
    expect(csv.split('\n')[0]).toContain('status,disposition');
    expect(csv).toContain('success,REPORTABLE');
  });

  it('uses the report alpha grid and minimum R2 threshold for each row disposition', async () => {
    const method = analysis.methods[0];
    const estimate = method.estimates[0];
    const thresholdAnalysis: ActivationEnergyAnalysis = {
      ...analysis,
      methods: [{
        ...method,
        estimates: [{
          ...estimate,
          regression: {
            ...estimate.regression,
            r2: 0.99,
          },
        }],
      }],
    };
    const report = createProjectReport(
      thresholdAnalysis,
      {
        projectName: 'Disposition threshold check',
        sourceFiles: [],
      },
      {
        analysisConfiguration: {
          alphaGrid: [0.5],
          methods: ['KAS'],
          includeKissinger: false,
          minR2Warning: 0.995,
        },
      },
    );

    expect(report.results).toHaveLength(1);
    expect(report.results[0]).toMatchObject({
      status: 'success',
      disposition: 'CALCULATED_UNRELIABLE',
      formulaId: 'kas_ln_beta_over_t2_v1',
    });
    expect(createResultsCsv(report)).toContain('success,CALCULATED_UNRELIABLE');
    const pdf = createPdfReport(report);
    const binary = new TextDecoder('latin1').decode(await pdf.arrayBuffer());
    const unescapedPdfLiterals = binary.replace(/\\([()\\])/g, '$1');
    expect(unescapedPdfLiterals).toContain('CALCULATED BUT UNRELIABLE');
    expect(unescapedPdfLiterals).not.toContain('CALCULATED UNRELIABLE');
  });

  it('creates a multi-page PDF for a long result set', async () => {
    const method = analysis.methods[0];
    const estimate = method.estimates[0];
    const longAnalysis: ActivationEnergyAnalysis = {
      ...analysis,
      methods: [
        {
          ...method,
          estimates: Array.from({ length: 96 }, (_, index) => ({
            ...estimate,
            alpha: 0.01 + index * 0.009,
            activationEnergyKJPerMol: 130 + index * 0.4,
          })),
        },
      ],
    };
    const report = createProjectReport(longAnalysis, {
      projectName: 'PDF pagination stress check',
      sourceFiles: [
        {
          name: 'a-long-but-readable-source-file-name.csv',
          sizeBytes: 12_345,
          sha256: 'a'.repeat(64),
        },
      ],
    });

    const pdf = createPdfReport(report);
    expect(pdf.type).toBe('application/pdf');
    expect(pdf.size).toBeGreaterThan(10_000);

    const binary = new TextDecoder('latin1').decode(await pdf.arrayBuffer());
    const pageObjects = binary.match(/\/Type\s*\/Page\b/g) ?? [];
    expect(pageObjects.length).toBeGreaterThan(1);
  });
});
