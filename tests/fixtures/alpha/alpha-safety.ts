import type { ThermalPoint, ThermalRun } from '../../../src/core';
import type {
  BatchIngestionResult,
  BetaTpRow,
  NormalizedThermalRecord,
} from '../../../src/io';

export const HEATING_RATES = [5, 10, 20, 40] as const;

export interface InvalidAnchorFixture {
  readonly label: string;
  readonly initialMass: number;
  readonly finalMass: number;
  readonly masses: readonly [number, number, number];
}

export const INVALID_ANCHOR_FIXTURES: readonly InvalidAnchorFixture[] = [
  {
    label: 'equal anchors',
    initialMass: 100,
    finalMass: 100,
    masses: [100, 100, 100],
  },
  {
    label: 'non-finite initial anchor',
    initialMass: Number.NaN,
    finalMass: 50,
    masses: [100, 75, 50],
  },
  {
    label: 'reversed mass-gain anchors',
    initialMass: 50,
    finalMass: 100,
    masses: [50, 75, 100],
  },
  {
    label: 'numerically unstable anchor span',
    initialMass: 100,
    finalMass: 100 - 1e-13,
    masses: [100, 100 - 5e-14, 100 - 1e-13],
  },
  {
    label: 'anchors incompatible with selected-stage mass data',
    initialMass: 100,
    finalMass: 50,
    masses: [100, 75, 45],
  },
] as const;

const context = {
  sampleId: 'alpha-safety-sample',
  atmosphere: 'N2',
  stage: 'main-loss-stage',
} as const;

export function directAlphaRun(
  heatingRate: number,
  index: number,
  points?: readonly ThermalPoint[],
  contextOverrides: Partial<Pick<ThermalRun, 'sampleId' | 'atmosphere' | 'stage'>> = {},
): ThermalRun {
  const offset = index * 12;
  return {
    id: `alpha-${heatingRate}`,
    heatingRate,
    heatingRateUnit: 'K/min',
    temperatureUnit: 'K',
    points:
      points ??
      [
        { temperature: 500 + offset, alpha: 0.1 },
        { temperature: 550 + offset, alpha: 0.5 },
        { temperature: 600 + offset, alpha: 0.9 },
      ],
    ...context,
    ...contextOverrides,
  };
}

export function validMassRun(heatingRate: number, index: number): ThermalRun {
  const offset = index * 12;
  return {
    id: `mass-${heatingRate}`,
    heatingRate,
    heatingRateUnit: 'K/min',
    temperatureUnit: 'K',
    massReference: { initialMass: 100, finalMass: 50 },
    points: [
      { temperature: 500 + offset, mass: 100 },
      { temperature: 550 + offset, mass: 75 },
      { temperature: 600 + offset, mass: 50 },
    ],
    ...context,
  };
}

export function invalidAnchorRun(
  fixture: InvalidAnchorFixture,
  heatingRate = 40,
  index = 3,
): ThermalRun {
  const offset = index * 12;
  return {
    id: `invalid-anchor-${fixture.label}`,
    heatingRate,
    heatingRateUnit: 'K/min',
    temperatureUnit: 'K',
    massReference: {
      initialMass: fixture.initialMass,
      finalMass: fixture.finalMass,
    },
    points: fixture.masses.map((mass, pointIndex) => ({
      temperature: 500 + offset + pointIndex * 50,
      mass,
    })),
    ...context,
  };
}

export function alphaRunsWithReplacement(replacement: ThermalRun): ThermalRun[] {
  return [
    directAlphaRun(5, 0),
    directAlphaRun(10, 1),
    directAlphaRun(20, 2),
    replacement,
  ];
}

export interface AdapterBatchOptions {
  readonly permutedRate?: number;
  readonly includePeakCandidates?: boolean;
  readonly multiplePeakRate?: number;
}

export function adapterBatch(options: AdapterBatchOptions = {}): BatchIngestionResult {
  const records: NormalizedThermalRecord[] = [];
  const betaTp: BetaTpRow[] = [];

  HEATING_RATES.forEach((heatingRate, runIndex) => {
    const runId = `adapter-${heatingRate}`;
    const offset = runIndex * 12;
    const temperatures =
      options.permutedRate === heatingRate
        ? [500 + offset, 580 + offset, 550 + offset, 620 + offset]
        : [500 + offset, 540 + offset, 580 + offset, 620 + offset];
    const alpha = [0.1, 0.35, 0.65, 0.9];

    temperatures.forEach((temperatureK, pointIndex) => {
      records.push({
        temperatureK,
        temperatureKind: 'sample',
        alpha: alpha[pointIndex] as number,
        heatingRateKPerMin: heatingRate,
        runId,
        sample: context.sampleId,
        atmosphere: context.atmosphere,
        provenance: {
          fileName: `${runId}.csv`,
          sourceRow: pointIndex + 2,
        },
      });
    });

    if (options.includePeakCandidates) {
      betaTp.push({
        heatingRateKPerMin: heatingRate,
        peakTemperatureK: 570 + offset,
        peakResolved: true,
        peakQuality: 'clear-interior',
        peakSourceSignal: 'external-beta-tp-table',
        peakAnalystConfirmed: true,
        peakAmbiguous: false,
        runId,
        sample: context.sampleId,
        atmosphere: context.atmosphere,
        provenance: { fileName: 'peak-candidates.csv', sourceRow: runIndex + 2 },
      });
      if (options.multiplePeakRate === heatingRate) {
        betaTp.push({
          heatingRateKPerMin: heatingRate,
          peakTemperatureK: 576 + offset,
          peakResolved: true,
          peakQuality: 'multiple-overlapping',
          peakSourceSignal: 'external-beta-tp-table',
          peakAnalystConfirmed: true,
          peakAmbiguous: true,
          runId,
          sample: context.sampleId,
          atmosphere: context.atmosphere,
          provenance: { fileName: 'peak-candidates.csv', sourceRow: runIndex + 20 },
        });
      }
    }
  });

  return {
    status: 'ready',
    files: [],
    diagnostics: [],
    records,
    tables: { tAlphaBeta: [], betaTp },
  };
}
