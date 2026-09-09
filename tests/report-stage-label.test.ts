import { describe, expect, it } from 'vitest';

import { resolveReportStageLabel } from '../src/report';

describe('report stage label contract', () => {
  it('keeps a trimmed explicit scientific stage label', () => {
    expect(
      resolveReportStageLabel({
        explicitLabel: '  main devolatilization  ',
        hasSuppliedAlpha: true,
        commonAlphaRange: [0.1, 0.9],
      }),
    ).toBe('main devolatilization');
  });

  it('uses the selected numeric mass-normalization window when no label is supplied', () => {
    expect(
      resolveReportStageLabel({
        stageWindow: { startCelsius: 200, endCelsius: 500 },
        hasSuppliedAlpha: false,
      }),
    ).toBe('200.0-500.0 °C');
  });

  it('derives the exact supplied-alpha platform stage from the analyzed common range', () => {
    expect(
      resolveReportStageLabel({
        hasSuppliedAlpha: true,
        commonAlphaRange: [0.1, 0.9],
      }),
    ).toBe('supplied-alpha 0.10-0.90 window');
  });

  it('does not invent a stage without an explicit, numeric, or supplied-alpha basis', () => {
    expect(
      resolveReportStageLabel({
        hasSuppliedAlpha: false,
        commonAlphaRange: [0.1, 0.9],
      }),
    ).toBeUndefined();
  });
});
