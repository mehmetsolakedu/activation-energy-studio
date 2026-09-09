import { describe, expect, it } from 'vitest';

import type {
  ActivationEnergyAnalysis,
  AlphaActivationEnergyEstimate,
  AlphaMethodResult,
  CalculationStatus,
  Diagnostic,
  IsoConversionalMethod,
  RegressionResult,
} from '../src/core';
import {
  assessScientificDisposition,
  publicationDecisionNote,
  scientificDispositionLabel,
  type ScientificDisposition,
} from '../src/product/disposition';

function regression(r2: number): RegressionResult {
  return {
    n: 4,
    rawObservationCount: 4,
    residualDegreesOfFreedom: 2,
    inputAggregation: 'none',
    inputGroups: [],
    x: [0.0018, 0.0017, 0.0016, 0.0015],
    y: [-12, -11, -10, -9],
    slope: -10_000,
    intercept: 6,
    fitted: [-12, -11, -10, -9],
    residuals: [0, 0, 0, 0],
    sse: 0,
    r2,
    residualStandardError: 0,
    slopeStandardError: 10,
    slopeConfidence95: [-10_043, -9_957],
  };
}

function estimate(
  alpha: number,
  activationEnergyKJPerMol: number,
  r2: number,
): AlphaActivationEnergyEstimate {
  return {
    alpha,
    activationEnergyKJPerMol,
    regression: regression(r2),
    observations: [],
  };
}

function diagnostic(
  code: Diagnostic['code'],
  severity: Diagnostic['severity'],
  method?: Diagnostic['method'],
  alpha?: number,
): Diagnostic {
  return {
    code,
    severity,
    message: `${code} diagnostic`,
    ...(method === undefined ? {} : { method }),
    ...(alpha === undefined ? {} : { alpha }),
  };
}

function analysisFixture(input: {
  method?: IsoConversionalMethod;
  status: CalculationStatus;
  estimates: readonly AlphaActivationEnergyEstimate[];
  warnings?: readonly Diagnostic[];
  refusals?: readonly Diagnostic[];
  analysisWarnings?: readonly Diagnostic[];
}): ActivationEnergyAnalysis {
  const methodName = input.method ?? 'KAS';
  const method: AlphaMethodResult = {
    method: methodName,
    resultType: 'isoconversional',
    formulaId: 'test_formula_v1',
    status: input.status,
    estimates: input.estimates,
    warnings: input.warnings ?? [],
    refusals: input.refusals ?? [],
  };
  return {
    status: input.status,
    preparedRuns: [],
    eligibility: {
      eligible: input.status !== 'refused',
      commonAlphaRange: [0.1, 0.9],
      distinctHeatingRates: 4,
      warnings: [],
      refusals: [],
    },
    methods: [method],
    warnings: input.analysisWarnings ?? [],
    refusals: input.refusals ?? [],
    constants: { gasConstantJPerMolK: 8.31446261815324 },
  };
}

interface Scenario {
  readonly label: string;
  readonly analysis: ActivationEnergyAnalysis;
  readonly alphaGrid: readonly number[];
  readonly expectedMethodDisposition: ScientificDisposition;
  readonly expectedResultDispositions: readonly ScientificDisposition[];
  readonly expectedSegments: readonly (readonly number[])[];
  readonly expectedMeanRecommended: boolean;
  readonly expectedReasonCode: string;
  readonly expectedHint: boolean;
}

const scenarios: readonly Scenario[] = [
  {
    label: 'clean finite positive result with acceptable R2',
    analysis: analysisFixture({
      status: 'success',
      estimates: [estimate(0.5, 150, 0.995)],
    }),
    alphaGrid: [0.5],
    expectedMethodDisposition: 'REPORTABLE',
    expectedResultDispositions: ['REPORTABLE'],
    expectedSegments: [[0.5]],
    expectedMeanRecommended: false,
    expectedReasonCode: 'FINITE_POSITIVE_RESULT_WITH_ACCEPTABLE_R2',
    expectedHint: false,
  },
  {
    label: 'limited-rate warning retains a cautious result',
    analysis: analysisFixture({
      status: 'success',
      estimates: [estimate(0.5, 150, 0.995)],
      warnings: [diagnostic('LIMITED_HEATING_RATES', 'warning', 'KAS')],
    }),
    alphaGrid: [0.5],
    expectedMethodDisposition: 'REPORTABLE_WITH_CAUTION',
    expectedResultDispositions: ['REPORTABLE_WITH_CAUTION'],
    expectedSegments: [[0.5]],
    expectedMeanRecommended: false,
    expectedReasonCode: 'LIMITED_HEATING_RATES',
    expectedHint: true,
  },
  {
    label: 'R2 below threshold is calculated but unreliable even without a warning object',
    analysis: analysisFixture({
      status: 'success',
      estimates: [estimate(0.5, 150, 0.9)],
    }),
    alphaGrid: [0.5],
    expectedMethodDisposition: 'CALCULATED_UNRELIABLE',
    expectedResultDispositions: ['CALCULATED_UNRELIABLE'],
    expectedSegments: [],
    expectedMeanRecommended: false,
    expectedReasonCode: 'R2_BELOW_REPORTABILITY_THRESHOLD',
    expectedHint: true,
  },
  {
    label: 'nonpositive Ea is calculated but unreliable',
    analysis: analysisFixture({
      status: 'success',
      estimates: [estimate(0.5, 0, 0.995)],
    }),
    alphaGrid: [0.5],
    expectedMethodDisposition: 'CALCULATED_UNRELIABLE',
    expectedResultDispositions: ['CALCULATED_UNRELIABLE'],
    expectedSegments: [],
    expectedMeanRecommended: false,
    expectedReasonCode: 'NONPOSITIVE_APPARENT_EA',
    expectedHint: true,
  },
  {
    label: 'missing numeric result remains a calculation rejection',
    analysis: analysisFixture({
      status: 'refused',
      estimates: [],
      refusals: [
        diagnostic('INSUFFICIENT_DISTINCT_HEATING_RATES', 'refusal', 'KAS'),
      ],
    }),
    alphaGrid: [0.5],
    expectedMethodDisposition: 'CALCULATION_REJECTED',
    expectedResultDispositions: ['CALCULATION_REJECTED'],
    expectedSegments: [],
    expectedMeanRecommended: false,
    expectedReasonCode: 'INSUFFICIENT_DISTINCT_HEATING_RATES',
    expectedHint: true,
  },
  {
    label: 'alpha-scoped warning breaks ranges and multistep blocks the mean',
    analysis: analysisFixture({
      status: 'success',
      estimates: [
        estimate(0.1, 120, 0.995),
        estimate(0.2, 140, 0.995),
        estimate(0.3, 165, 0.995),
      ],
      warnings: [
        diagnostic('LOW_R2', 'warning', 'KAS', 0.2),
        diagnostic('MULTISTEP_EA_VARIATION', 'warning', 'KAS'),
      ],
      analysisWarnings: [
        diagnostic('LOW_R2', 'warning', 'FWO', 0.1),
      ],
    }),
    alphaGrid: [0.1, 0.2, 0.3],
    expectedMethodDisposition: 'CALCULATED_UNRELIABLE',
    expectedResultDispositions: [
      'REPORTABLE_WITH_CAUTION',
      'CALCULATED_UNRELIABLE',
      'REPORTABLE_WITH_CAUTION',
    ],
    expectedSegments: [[0.1], [0.3]],
    expectedMeanRecommended: false,
    expectedReasonCode: 'MULTISTEP_EA_VARIATION',
    expectedHint: true,
  },
];

describe('scientific disposition product policy', () => {
  it('uses the exact human-facing labels in publication-preview notes', () => {
    expect(scientificDispositionLabel('REPORTABLE')).toBe('REPORTABLE');
    expect(scientificDispositionLabel('REPORTABLE_WITH_CAUTION'))
      .toBe('REPORTABLE WITH CAUTION');
    expect(scientificDispositionLabel('CALCULATED_UNRELIABLE'))
      .toBe('CALCULATED BUT UNRELIABLE');
    expect(scientificDispositionLabel('CALCULATION_REJECTED'))
      .toBe('CALCULATION REJECTED');

    const assessment = assessScientificDisposition(scenarios[5]!.analysis, {
      alphaGrid: scenarios[5]!.alphaGrid,
      minimumReportableR2: 0.98,
    });
    const note = publicationDecisionNote(assessment);
    expect(note).toContain('Publication-preview decision: CALCULATED BUT UNRELIABLE');
    expect(note).toContain('KAS: CALCULATED BUT UNRELIABLE');
    expect(note).not.toContain('REPORTABLE_WITH_CAUTION');
    expect(note).not.toContain('CALCULATED_UNRELIABLE');
  });

  it.each(scenarios)(
    '$label',
    ({
      analysis,
      alphaGrid,
      expectedMethodDisposition,
      expectedResultDispositions,
      expectedSegments,
      expectedMeanRecommended,
      expectedReasonCode,
      expectedHint,
    }) => {
      const assessment = assessScientificDisposition(analysis, {
        alphaGrid,
        minimumReportableR2: 0.98,
      });
      const method = assessment.methods[0]!;

      expect(method.computationStatus).toBe(analysis.methods[0]?.status);
      expect(method.disposition).toBe(expectedMethodDisposition);
      expect(method.results.map((result) => result.disposition))
        .toEqual(expectedResultDispositions);
      expect(method.results.every(
        (result) => result.computationStatus === analysis.methods[0]?.status,
      )).toBe(true);
      expect(method.reportableAlphaSegments.map((segment) => segment.alphaValues))
        .toEqual(expectedSegments);
      expect(method.meanEaRecommended).toBe(expectedMeanRecommended);
      expect(method.reasons.map((reason) => reason.code)).toContain(expectedReasonCode);
      expect(method.reasons.every((reason) => reason.message.length <= 180)).toBe(true);
      expect(method.nextExperimentHints.length > 0).toBe(expectedHint);
    },
  );
});
