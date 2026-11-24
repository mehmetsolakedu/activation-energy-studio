import { describe, expect, it } from 'vitest';

import fixture from './fixtures/audit-v041/variable-kinetics-and-kissinger-fixtures.json';
import {
  analyzeActivationEnergy,
  calculateKissinger,
  type IsoConversionalMethod,
  type KissingerPeak,
  type ThermalRun,
} from '../src/core';
import { assessScientificDisposition } from '../src/product/disposition';

const INTEGRAL_METHODS: readonly IsoConversionalMethod[] = ['FWO', 'KAS', 'STARINK'];
const ALL_ISO_METHODS: readonly IsoConversionalMethod[] = [
  'FWO',
  'KAS',
  'STARINK',
  'FRIEDMAN',
];

interface ScenarioFixture {
  readonly name: string;
  readonly alphaGrid: readonly number[];
  readonly runs: readonly {
    readonly id: string;
    readonly heatingRateKPerMinute: number;
    readonly points: readonly {
      readonly alpha: number;
      readonly temperatureK: number;
      readonly dAlphaDtPerMinute: number;
    }[];
  }[];
}

function toThermalRuns(scenario: ScenarioFixture): ThermalRun[] {
  return scenario.runs.map((run) => ({
    id: run.id,
    heatingRate: run.heatingRateKPerMinute,
    heatingRateUnit: 'K/min',
    temperatureUnit: 'K',
    sampleId: scenario.name,
    atmosphere: 'N2',
    stage: 'simulated-ode-stage',
    points: run.points.map((point) => ({
      temperature: point.temperatureK,
      alpha: point.alpha,
      dAlphaDtPerMinute: point.dAlphaDtPerMinute,
      dAlphaDtSource: 'provided' as const,
    })),
  }));
}

describe('v0.4.1 independent Kissinger Decimal(50) benchmark (distinct from KAS)', () => {
  it('agrees with the independent 5-rate 50-digit Decimal Kissinger target to at least 10 decimal places', () => {
    const k = fixture.independentKissingerDecimal50;
    const peaks: KissingerPeak[] = k.heatingRatesKPerMinute.map((betaStr, idx) => ({
      runId: `independent-kissinger-${betaStr}`,
      heatingRateKPerMinute: Number(betaStr),
      peakTemperatureK: Number(k.peakTemperaturesK[idx]),
      stage: 'independent-peak-stage',
      peakResolved: true,
      peakQuality: 'clear-interior',
      sourceSignal: 'external-beta-tp-table',
      analystConfirmed: true,
    }));

    const result = calculateKissinger(peaks);
    expect(result.status).toBe('success');
    expect(result.regression?.n).toBe(5);
    expect(result.regression?.residualDegreesOfFreedom).toBe(3);
    expect(result.activationEnergyKJPerMol).toBeCloseTo(
      Number(k.activationEnergyKJPerMol),
      10,
    );
    expect(result.regression?.slope).toBeCloseTo(Number(k.slope), 9);
    expect(result.regression?.intercept).toBeCloseTo(Number(k.intercept), 10);
    expect(result.regression?.r2).toBeCloseTo(Number(k.r2), 12);
    expect(result.regression?.slopeStandardError).toBeCloseTo(
      Number(k.slopeStandardError),
      9,
    );
  });
});

describe('v0.4.1 disposition-layer validation on independent RK4 ODE kinetic scenarios', () => {
  it('Scenario A (single-step constant kinetics): classifies all four methods REPORTABLE with zero variation or integral-bias warnings', () => {
    const scenario = fixture.scenarios.singleStepControl;
    const analysis = analyzeActivationEnergy(toThermalRuns(scenario), {
      alphaValues: scenario.alphaGrid,
      methods: ALL_ISO_METHODS,
      includeKissinger: false,
      minR2Warning: 0.98,
    });
    const disposition = assessScientificDisposition(analysis, {
      alphaGrid: scenario.alphaGrid,
      minimumReportableR2: 0.98,
    });

    expect(disposition.overallDisposition).toBe('REPORTABLE');
    for (const methodResult of analysis.methods) {
      const codes = methodResult.warnings.map((w) => w.code);
      expect(codes).not.toContain('POSSIBLE_MULTISTEP_EA_VARIATION');
      expect(codes).not.toContain('MULTISTEP_EA_VARIATION');
      expect(codes).not.toContain('INTEGRAL_METHOD_VARIABLE_EA_BIAS');
    }
    for (const summary of disposition.methods) {
      expect(summary.disposition).toBe('REPORTABLE');
      expect(summary.meanEaRecommended).toBe(true);
    }
  });

  it('Scenario B (two parallel reactions, 10-20% variation): triggers POSSIBLE_MULTISTEP_EA_VARIATION on all methods and INTEGRAL_METHOD_VARIABLE_EA_BIAS on integral methods only', () => {
    const scenario = fixture.scenarios.parallelModerateVariation;
    const analysis = analyzeActivationEnergy(toThermalRuns(scenario), {
      alphaValues: scenario.alphaGrid,
      methods: ALL_ISO_METHODS,
      includeKissinger: false,
      minR2Warning: 0.98,
    });
    const disposition = assessScientificDisposition(analysis, {
      alphaGrid: scenario.alphaGrid,
      minimumReportableR2: 0.98,
    });

    expect(disposition.overallDisposition).toBe('REPORTABLE_WITH_CAUTION');
    for (const methodResult of analysis.methods) {
      const codes = methodResult.warnings.map((w) => w.code);
      expect(codes).toContain('POSSIBLE_MULTISTEP_EA_VARIATION');
      expect(codes).not.toContain('MULTISTEP_EA_VARIATION');
      if (INTEGRAL_METHODS.includes(methodResult.method)) {
        expect(codes).toContain('INTEGRAL_METHOD_VARIABLE_EA_BIAS');
      } else {
        expect(codes).not.toContain('INTEGRAL_METHOD_VARIABLE_EA_BIAS');
      }
    }
    for (const summary of disposition.methods) {
      expect(summary.disposition).toBe('REPORTABLE_WITH_CAUTION');
      expect(summary.meanEaRecommended).toBe(true);
    }
  });

  it.each([
    ['Scenario C (two parallel reactions, >20% variation)', fixture.scenarios.parallelStrongVariation],
    ['Scenario D (two consecutive reactions A->B->C, >20% variation)', fixture.scenarios.consecutiveStrongVariation],
  ])('%s: triggers MULTISTEP_EA_VARIATION, disables single-mean recommendation, and attaches INTEGRAL_METHOD_VARIABLE_EA_BIAS to integral methods only', (_label, scenario) => {
    const analysis = analyzeActivationEnergy(toThermalRuns(scenario), {
      alphaValues: scenario.alphaGrid,
      methods: ALL_ISO_METHODS,
      includeKissinger: false,
      minR2Warning: 0.98,
    });
    const disposition = assessScientificDisposition(analysis, {
      alphaGrid: scenario.alphaGrid,
      minimumReportableR2: 0.98,
    });

    for (const methodResult of analysis.methods) {
      const codes = methodResult.warnings.map((w) => w.code);
      expect(codes).toContain('MULTISTEP_EA_VARIATION');
      expect(codes).not.toContain('POSSIBLE_MULTISTEP_EA_VARIATION');
      if (INTEGRAL_METHODS.includes(methodResult.method)) {
        expect(codes).toContain('INTEGRAL_METHOD_VARIABLE_EA_BIAS');
      } else {
        expect(codes).not.toContain('INTEGRAL_METHOD_VARIABLE_EA_BIAS');
      }
    }
    for (const summary of disposition.methods) {
      expect(summary.meanEaRecommended).toBe(false);
    }
  });

  it('Scenario E (3-rate df=1 high-R² point whose 95% CI includes zero): overrides R² >= 0.98 and marks point CALCULATED_UNRELIABLE', () => {
    // Construct a 3-rate (df=1) dataset where R² is ~0.986 (> 0.98) yet t_{0.975,1} = 12.7062
    // forces the 95% slope CI across zero (nonnegative upper slope bound -> nonpositive lower Ea bound).
    // With x = 1/T = [0.00180, 0.00174, 0.00168] and y = ln(beta) = [ln(5), ln(10), ln(20)],
    // exact collinearity gives R² = 1; perturbing the middle temperature slightly gives R² ~ 0.986.
    const runs: ThermalRun[] = [
      {
        id: 'df1-beta-5',
        heatingRate: 5,
        heatingRateUnit: 'K/min',
        temperatureUnit: 'K',
        sampleId: 'df1-ci-zero-test',
        atmosphere: 'N2',
        stage: 'stage-1',
        points: [
          { temperature: 540, alpha: 0.2 },
          { temperature: 555.5555555555555, alpha: 0.5 },
          { temperature: 575, alpha: 0.8 },
        ],
      },
      {
        id: 'df1-beta-10',
        heatingRate: 10,
        heatingRateUnit: 'K/min',
        temperatureUnit: 'K',
        sampleId: 'df1-ci-zero-test',
        atmosphere: 'N2',
        stage: 'stage-1',
        points: [
          { temperature: 560, alpha: 0.2 },
          { temperature: 578.5, alpha: 0.5 },
          { temperature: 595, alpha: 0.8 },
        ],
      },
      {
        id: 'df1-beta-20',
        heatingRate: 20,
        heatingRateUnit: 'K/min',
        temperatureUnit: 'K',
        sampleId: 'df1-ci-zero-test',
        atmosphere: 'N2',
        stage: 'stage-1',
        points: [
          { temperature: 580, alpha: 0.2 },
          { temperature: 595.2380952380952, alpha: 0.5 },
          { temperature: 615, alpha: 0.8 },
        ],
      },
    ];

    const analysis = analyzeActivationEnergy(runs, {
      alphaValues: [0.5],
      methods: ['FWO'],
      includeKissinger: false,
      minR2Warning: 0.98,
    });
    const fwo = analysis.methods[0]!;
    const est = fwo.estimates[0]!;
    expect(est.regression.residualDegreesOfFreedom).toBe(1);
    expect(est.regression.r2).toBeGreaterThanOrEqual(0.98);
    expect(est.regression.r2).toBeLessThan(0.9939); // df=1 zero-CI boundary is R² = t²/(1+t²) ≈ 0.99384
    expect(est.regression.slopeConfidence95[1]).toBeGreaterThanOrEqual(0);

    const disposition = assessScientificDisposition(analysis, {
      alphaGrid: [0.5],
      minimumReportableR2: 0.98,
    });
    const pointDisp = disposition.methods[0]!.results[0]!;
    expect(pointDisp.disposition).toBe('CALCULATED_UNRELIABLE');
    expect(pointDisp.reasons.some((r) => r.code === 'ACTIVATION_ENERGY_CI_INCLUDES_NONPOSITIVE')).toBe(true);
    expect(disposition.overallDisposition).toBe('CALCULATED_UNRELIABLE');
  });
});
