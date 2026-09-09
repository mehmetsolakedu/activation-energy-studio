import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ResearchSummary, scientificDispositionLabel } from '../src/components/ResearchSummary';
import type { ActivationEnergyAnalysis } from '../src/core';
import type {
  ScientificDisposition,
  ScientificDispositionAssessment,
} from '../src/product/disposition';

const analysis: ActivationEnergyAnalysis = {
  status: 'success',
  preparedRuns: [5, 10, 20].map((heatingRateKPerMinute) => ({
    id: `run-${heatingRateKPerMinute}`,
    heatingRateKPerMinute,
    derivativeSource: 'temperature',
    stage: 'main',
    points: [
      { temperatureK: 500, alpha: 0.1, dAlphaDtPerMinute: 0.01 },
      { temperatureK: 600, alpha: 0.5, dAlphaDtPerMinute: 0.02 },
      { temperatureK: 700, alpha: 0.9, dAlphaDtPerMinute: 0.03 },
    ],
  })),
  eligibility: {
    eligible: true,
    commonAlphaRange: [0.1, 0.9],
    distinctHeatingRates: 3,
    refusals: [],
    warnings: [],
  },
  methods: [],
  refusals: [],
  warnings: [],
  constants: { gasConstantJPerMolK: 8.31446261815324 },
};

const cautionReason = {
  code: 'LIMITED_HEATING_RATES',
  message: 'Only three distinct heating rates constrain this result.',
  severity: 'caution' as const,
};

const assessment: ScientificDispositionAssessment = {
  minimumReportableR2: 0.98,
  overallDisposition: 'REPORTABLE_WITH_CAUTION',
  methods: [
    {
      method: 'KAS',
      resultType: 'isoconversional',
      computationStatus: 'success',
      disposition: 'REPORTABLE_WITH_CAUTION',
      results: [
        {
          resultId: 'KAS:alpha:0.1',
          method: 'KAS',
          resultType: 'isoconversional',
          alpha: 0.1,
          computationStatus: 'success',
          disposition: 'REPORTABLE_WITH_CAUTION',
          activationEnergyKJPerMol: 150,
          r2: 0.995,
          reasons: [cautionReason],
          nextExperimentHints: ['Add at least one independent heating rate.'],
        },
        {
          resultId: 'KAS:alpha:0.2',
          method: 'KAS',
          resultType: 'isoconversional',
          alpha: 0.2,
          computationStatus: 'success',
          disposition: 'REPORTABLE_WITH_CAUTION',
          activationEnergyKJPerMol: 155,
          r2: 0.99,
          reasons: [cautionReason],
          nextExperimentHints: ['Add at least one independent heating rate.'],
        },
      ],
      reportableAlphaSegments: [
        {
          startAlpha: 0.1,
          endAlpha: 0.2,
          alphaValues: [0.1, 0.2],
          disposition: 'REPORTABLE_WITH_CAUTION',
        },
      ],
      meanEaRecommended: false,
      meanEaReason: 'Strong Ea(alpha) variation makes a single mean scientifically misleading.',
      reasons: [cautionReason],
      nextExperimentHints: ['Add at least one independent heating rate.'],
    },
  ],
  reasons: [cautionReason],
  nextExperimentHints: ['Add at least one independent heating rate.'],
};

describe('ResearchSummary', () => {
  it('renders seven direct answers and the exact English disposition vocabulary', () => {
    const expectedLabels: ReadonlyArray<
      readonly [ScientificDisposition, string]
    > = [
      ['REPORTABLE', 'REPORTABLE'],
      ['REPORTABLE_WITH_CAUTION', 'REPORTABLE WITH CAUTION'],
      ['CALCULATED_UNRELIABLE', 'CALCULATED BUT UNRELIABLE'],
      ['CALCULATION_REJECTED', 'CALCULATION REJECTED'],
    ];
    for (const [disposition, en] of expectedLabels) {
      expect(scientificDispositionLabel(disposition)).toBe(en);
    }

    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(
      <ResearchSummary assessment={assessment} analysis={analysis} />,
    );

    expect(host.querySelectorAll('[data-answer]')).toHaveLength(7);
    expect(host.querySelector('[data-answer="data-seen"]')?.textContent).toContain('3');
    expect(host.querySelector('[data-answer="methods-run"]')?.textContent).toContain('KAS');
    expect(host.querySelector('[data-answer="reportable-results"]')?.textContent)
      .toContain(scientificDispositionLabel('REPORTABLE_WITH_CAUTION'));
    expect(host.querySelector('[data-answer="mean-ea"]')?.textContent?.length)
      .toBeGreaterThan(20);
    expect(host.querySelector('[data-answer="limitations"]')?.textContent)
      .toContain('LIMITED_HEATING_RATES');
    expect(host.querySelector('[data-answer="report-wording"]')?.textContent)
      .toContain('KAS');
    expect(host.querySelector('[data-answer="report-wording"]')?.textContent)
      .toContain('150');
    expect(host.querySelector('[data-answer="next-experiment"]')?.textContent)
      .toMatch(/heating rate/u);
    expect(host.textContent).not.toMatch(/Passed/u);
  });
});
