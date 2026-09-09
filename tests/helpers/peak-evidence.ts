import type { KissingerPeak } from '../../src/core';
import type { ThermalRun } from '../../src/core';

/**
 * Explicit evidence required by successful synthetic/external beta-Tp fixtures.
 * Individual refusal tests override the relevant field deliberately.
 */
export const VERIFIED_EXTERNAL_PEAK_EVIDENCE = {
  peakResolved: true,
  peakQuality: 'clear-interior',
  sourceSignal: 'external-beta-tp-table',
  analystConfirmed: true,
} as const satisfies Pick<
  KissingerPeak,
  'peakResolved' | 'peakQuality' | 'sourceSignal' | 'analystConfirmed'
>;

export const VERIFIED_BETA_TP_ROW_EVIDENCE = {
  peakResolved: true,
  peakQuality: 'clear-interior',
  peakSourceSignal: 'external-beta-tp-table',
  peakAnalystConfirmed: true,
  peakAmbiguous: false,
} as const;

export const VERIFIED_CURVE_PEAK_EVIDENCE = {
  peakResolved: true,
  peakQuality: 'clear-interior',
  peakSourceSignal: 'external-beta-tp-table',
  peakAnalystConfirmed: true,
} as const satisfies Pick<
  ThermalRun,
  'peakResolved' | 'peakQuality' | 'peakSourceSignal' | 'peakAnalystConfirmed'
>;
