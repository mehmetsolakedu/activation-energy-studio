import oak5Csv from '../../tests/fixtures/real/oak/source/TGA-Oak-5Kmin-1.csv?raw';
import oak10Csv from '../../tests/fixtures/real/oak/source/TGA-Oak-10Kmin-1.csv?raw';
import oak20Csv from '../../tests/fixtures/real/oak/source/TGA-Oak-20Kmin-1.csv?raw';
import oak40Csv from '../../tests/fixtures/real/oak/source/TGA-Oak-40Kmin-1.csv?raw';
import paper010Csv from '../../tests/fixtures/real/paper010_rh_t_alpha_beta.csv?raw';
import paper063Csv from '../../tests/fixtures/real/paper063/paper063_kissinger_peaks.csv?raw';

import type { IngestionOptions, WideSeriesDefinition } from '../io';
import type { LicensedSourceProvenance, LicensedSourceType } from '../report';

export type RealExampleId =
  | 'chilean-oak-raw'
  | 'paper010-supplied-dalpha-dt'
  | 'paper063-kissinger-beta-tp';

export type RealExampleMethod =
  | 'FWO'
  | 'KAS'
  | 'STARINK'
  | 'FRIEDMAN'
  | 'KISSINGER';

export interface RealExampleLicense {
  readonly spdx: 'CC-BY-4.0';
  readonly name: string;
  readonly url: string;
  readonly scope: string;
  /**
   * `null` is deliberate for Paper063: its five-row table is transcribed from
   * CC BY article content and is not a separately deposited dataset.
   */
  readonly separateDatasetLicense: string | null;
}

export interface RealExampleCitation {
  readonly label: string;
  readonly doi: string;
  readonly url: string;
}

export interface RealExampleSourceDetails {
  readonly sourceType: LicensedSourceType;
  readonly extractionSteps: readonly string[];
  readonly transformationSteps: readonly string[];
  readonly printedPrecision: string;
  readonly rounding: string;
  readonly separateDatasetLicenseScope: string;
  readonly claimLimits: readonly string[];
}

export interface RealExampleDefinition {
  readonly id: RealExampleId;
  readonly title: string;
  readonly project: string;
  readonly process: string;
  readonly stage: string;
  readonly alphaStart: number | null;
  readonly alphaEnd: number | null;
  readonly alphaStep: number | null;
  readonly license: RealExampleLicense;
  readonly citation: RealExampleCitation;
  readonly sourceDetails: RealExampleSourceDetails;
  readonly boundary: string;
  readonly methods: readonly RealExampleMethod[];
  readonly resultType: 'isoconversional' | 'peak';
  readonly fileNames: readonly string[];
}

interface EmbeddedExampleFile {
  readonly name: string;
  readonly type: string;
  readonly content: string;
}

interface RealExampleSource {
  readonly definition: RealExampleDefinition;
  readonly files: readonly EmbeddedExampleFile[];
  readonly options: readonly IngestionOptions[];
}

const CC_BY_4_0 = {
  spdx: 'CC-BY-4.0',
  name: 'Creative Commons Attribution 4.0 International',
  url: 'https://creativecommons.org/licenses/by/4.0/',
} as const;

const OAK_ALPHA_GRID = Array.from(
  { length: 17 },
  (_, index) => Number(((index + 1) * 0.05).toFixed(2)),
);

const PAPER010_ALPHA_GRID = Array.from(
  { length: 16 },
  (_, index) => Number(((index + 1) * 0.05).toFixed(2)),
);

function oakSeries(rate: 5 | 10 | 20 | 40): WideSeriesDefinition {
  return {
    seriesId: `oak-${rate}`,
    runId: `oak-${rate}`,
    temperature: { columnIndex: 0, unit: 'C' },
    signal: {
      kind: 'alpha',
      columnIndex: 6,
      unit: 'fraction',
    },
    derivative: {
      semantic: 'dAlphaDt',
      valueColumnIndex: 8,
      unit: 'min^-1',
    },
    heatingRate: { value: rate, unit: 'K/min' },
    context: {
      sample: 'Chilean Oak',
      atmosphere: 'N2',
      stage: 'alpha 0.05-0.85',
    },
  };
}

function oakOptions(rate: 5 | 10 | 20 | 40): IngestionOptions {
  return {
    layout: 'wide-series',
    headerRow: 1,
    delimiter: ';',
    decimalSeparator: '.',
    wideSeries: [oakSeries(rate)],
    wideAlphaGrid: OAK_ALPHA_GRID,
    wideScopeConfirmed: true,
  };
}

const EXAMPLE_SOURCES = [
  {
    definition: {
      id: 'chilean-oak-raw',
      title: 'Chilean Oak — four-rate raw TG curves',
      project: 'Licensed real data: Chilean Oak',
      process: 'Thermal decomposition under nitrogen',
      stage: 'Single explicitly confirmed alpha=0.05–0.85 branch',
      alphaStart: 0.05,
      alphaEnd: 0.85,
      alphaStep: 0.05,
      license: {
        ...CC_BY_4_0,
        scope: 'The four original CSV data files deposited in Mendeley Data v2.',
        separateDatasetLicense: 'CC-BY-4.0',
      },
      citation: {
        label: 'Chilean Oak TGA dataset, Mendeley Data, version 2',
        doi: '10.17632/gkhjh4v8tg.2',
        url: 'https://doi.org/10.17632/gkhjh4v8tg.2',
      },
      sourceDetails: {
        sourceType: 'deposited-raw-instrument-data',
        extractionSteps: [
          'Embedded the four original CSV files deposited in Mendeley Data version 2.',
          'Retained each source row so report observations can resolve physical row contributors.',
        ],
        transformationSteps: [
          'Converted the selected Celsius temperature column to kelvin with +273.15.',
          'Selected the explicitly confirmed monotone alpha 0.05-0.85 branch.',
          'Projected the supplied dAlpha/dt signal at the requested alpha values without smoothing.',
        ],
        printedPrecision:
          'Numeric precision is retained from the deposited CSV fields before canonical-unit conversion.',
        rounding: 'No additional catalog rounding is applied before ingestion.',
        separateDatasetLicenseScope:
          'A separate CC-BY-4.0 dataset license covers the four deposited CSV files.',
        claimLimits: [
          'The result applies only to the selected sample, nitrogen atmosphere, conversion branch, and configured methods.',
          'The example does not establish a universal material constant or a single-step mechanism.',
        ],
      },
      boundary:
        'Results are apparent activation energies specific to this sample, atmosphere, selected conversion branch, and methods. The verified path converts the Celsius column with +273.15 because the deposited redundant Kelvin column uses a 273.00 K offset.',
      methods: ['FWO', 'KAS', 'STARINK'],
      resultType: 'isoconversional',
      fileNames: [
        'TGA-Oak-5Kmin-1.csv',
        'TGA-Oak-10Kmin-1.csv',
        'TGA-Oak-20Kmin-1.csv',
        'TGA-Oak-40Kmin-1.csv',
      ],
    },
    files: [
      { name: 'TGA-Oak-5Kmin-1.csv', type: 'text/csv', content: oak5Csv },
      { name: 'TGA-Oak-10Kmin-1.csv', type: 'text/csv', content: oak10Csv },
      { name: 'TGA-Oak-20Kmin-1.csv', type: 'text/csv', content: oak20Csv },
      { name: 'TGA-Oak-40Kmin-1.csv', type: 'text/csv', content: oak40Csv },
    ],
    options: [
      oakOptions(5),
      oakOptions(10),
      oakOptions(20),
      oakOptions(40),
    ],
  },
  {
    definition: {
      id: 'paper010-supplied-dalpha-dt',
      title: 'Rhubarb — supplied dAlpha/dt derived from official DTG',
      project: 'Paper010 official supplement Friedman example',
      process: 'Rhubarb pyrolysis in simulated air',
      stage: 'Initial-mass-normalized alpha=0.05–0.80 range',
      alphaStart: 0.05,
      alphaEnd: 0.8,
      alphaStep: 0.05,
      license: {
        ...CC_BY_4_0,
        scope:
          'Rows deterministically derived from the official PLOS ONE S2 workbook; source, transformation rule, and hash are locked in the fixture manifest.',
        separateDatasetLicense: 'CC-BY-4.0',
      },
      citation: {
        label: 'PLOS ONE supporting information S2, rhubarb TG/DTG workbook',
        doi: '10.1371/journal.pone.0173946.s002',
        url: 'https://doi.org/10.1371/journal.pone.0173946.s002',
      },
      sourceDetails: {
        sourceType: 'official-supplement-derived-table',
        extractionSteps: [
          'Read the official PLOS ONE S2 rhubarb TG/DTG workbook from the licensed supporting information.',
          'Selected the four documented heating-rate sheets and retained physical source-row provenance.',
        ],
        transformationSteps: [
          'Normalized alpha from the official TG signal over the locked initial-mass basis.',
          'Located the first alpha 0.05-0.80 crossings by piecewise-linear interpolation.',
          'Interpolated the official positive -DTG signal at each T_alpha and converted percent per minute to fraction per minute.',
        ],
        printedPrecision:
          'Derived rows retain deterministic decimal output from the source workbook and locked derivation script.',
        rounding:
          'No publication-table rounding is substituted for the equation-correct source-workbook derivation.',
        separateDatasetLicenseScope:
          'The CC-BY-4.0 supporting-information license covers the official S2 workbook used for derivation.',
        claimLimits: [
          'The equation-correct Friedman calculation does not reproduce the publication S5/Table 4 values exactly.',
          'Published values are not treated as an independent numerical oracle for this derived fixture.',
        ],
      },
      boundary:
        'dAlpha/dt is obtained by linearly interpolating the official S2 -DTG signal at T_alpha. The equation-correct Friedman path does not exactly reproduce the published S5/Table 4 values; that discrepancy is retained and publication values are not treated as an oracle.',
      methods: ['FRIEDMAN'],
      resultType: 'isoconversional',
      fileNames: ['paper010_rh_t_alpha_beta.csv'],
    },
    files: [{
      name: 'paper010_rh_t_alpha_beta.csv',
      type: 'text/csv',
      content: paper010Csv,
    }],
    options: [{
      headerRow: 0,
      delimiter: ',',
      decimalSeparator: '.',
      tableKind: 't-alpha-beta',
      layout: 'long',
      columnMapping: {
        temperature: { column: 0, unit: 'C', temperatureKind: 'sample' },
        alpha: { column: 1, unit: 'fraction' },
        dAlphaDt: { column: 2, unit: 'min^-1' },
        massPercent: { column: 3, unit: '%' },
        heatingRate: { column: 4, unit: 'K/min' },
        run: 5,
        sample: 6,
        atmosphere: 7,
      },
      defaults: {
        stage: 'initial-normalized alpha 0.05-0.80',
      },
    }],
  },
  {
    definition: {
      id: 'paper063-kissinger-beta-tp',
      title: 'XPS — separate beta–Tp Kissinger table',
      project: 'Paper063 publication-derived Kissinger example',
      process: 'Extruded-polystyrene pyrolysis',
      stage: 'XPS primary-pyrolysis DTG peak',
      alphaStart: null,
      alphaEnd: null,
      alphaStep: null,
      license: {
        ...CC_BY_4_0,
        scope:
          'The five beta–Tp rows are transcribed from Figure 1 of the CC BY 4.0 article; there is no separate raw-dataset license.',
        separateDatasetLicense: null,
      },
      citation: {
        label:
          'Pyrolysis Kinetic Properties of Thermal Insulation Waste Extruded Polystyrene by Multiple Thermal Analysis Methods',
        doi: '10.3390/ma13245595',
        url: 'https://doi.org/10.3390/ma13245595',
      },
      sourceDetails: {
        sourceType: 'article-figure-transcription',
        extractionSteps: [
          'Read the five heating rates and XPS DTG peak temperatures printed in Figure 1 on article pages 6-7.',
          'Paired the heating rates and peak temperatures in the order reported by the article.',
        ],
        transformationSteps: [
          'The five beta-Tp pairs were transcribed into the embedded CSV without inferring raw curve values.',
          'Peak temperatures remain the whole-kelvin values printed by the article.',
        ],
        printedPrecision: '1 K as printed for the five XPS peak temperatures in Figure 1.',
        rounding:
          'Peak temperatures are rounded to whole kelvin in the publication; no hidden precision is reconstructed.',
        separateDatasetLicenseScope:
          'No separately deposited dataset or raw-curve license exists; only the CC-BY-4.0 article content covers this transcription.',
        claimLimits: [
          'The fixture validates only the separate Kissinger beta-Tp route.',
          'It cannot validate alpha-dependent FWO, KAS, Starink, or Friedman calculations.',
          'The calculated result is conditional on the article values rounded to whole kelvin.',
        ],
      },
      boundary:
        'This is not an instrument export or raw curve. Peak temperatures were printed at 1 K resolution; the result demonstrates only the separate Kissinger implementation and is conditional on those rounded values. It does not validate alpha-dependent methods.',
      methods: ['KISSINGER'],
      resultType: 'peak',
      fileNames: ['paper063_kissinger_peaks.csv'],
    },
    files: [{
      name: 'paper063_kissinger_peaks.csv',
      type: 'text/csv',
      content: paper063Csv,
    }],
    options: [{
      headerRow: 0,
      delimiter: ',',
      decimalSeparator: '.',
      tableKind: 'beta-tp',
      layout: 'long',
      columnMapping: {
        run: 0,
        heatingRate: { column: 1, unit: 'K/min' },
        temperature: { column: 2, unit: 'K', temperatureKind: 'peak' },
        stage: 3,
      },
      defaults: {
        sample: 'Extruded polystyrene (XPS)',
      },
    }],
  },
] as const satisfies readonly RealExampleSource[];

export const REAL_EXAMPLES: readonly RealExampleDefinition[] = Object.freeze(
  EXAMPLE_SOURCES.map(({ definition }) => definition),
);

export function buildLicensedExampleProvenance(
  definition: RealExampleDefinition,
): LicensedSourceProvenance {
  const separateIdentifier = definition.license.separateDatasetLicense;
  return {
    kind: 'licensed-example',
    exampleId: definition.id,
    citation: { ...definition.citation },
    license: {
      identifier: definition.license.spdx,
      name: definition.license.name,
      url: definition.license.url,
      scope: definition.license.scope,
    },
    sourceType: definition.sourceDetails.sourceType,
    extractionSteps: [...definition.sourceDetails.extractionSteps],
    transformationSteps: [...definition.sourceDetails.transformationSteps],
    printedPrecision: definition.sourceDetails.printedPrecision,
    rounding: definition.sourceDetails.rounding,
    separateDatasetLicense: {
      exists: separateIdentifier !== null,
      identifier: separateIdentifier,
      scope: definition.sourceDetails.separateDatasetLicenseScope,
    },
    claimLimits: [definition.boundary, ...definition.sourceDetails.claimLimits],
  };
}

export function createRealExampleSession(id: RealExampleId): {
  definition: RealExampleDefinition;
  files: File[];
  options: IngestionOptions[];
} {
  const index = EXAMPLE_SOURCES.findIndex(({ definition }) => definition.id === id);
  const source = EXAMPLE_SOURCES[index];
  const definition = REAL_EXAMPLES[index];
  if (!source || !definition) {
    throw new Error(`Unknown real example id: ${String(id)}`);
  }

  return {
    definition,
    files: source.files.map(({ content, name, type }) =>
      new File([content], name, { type, lastModified: 0 })),
    options: source.options.map((options) => structuredClone(options)),
  };
}

export const REAL_EXAMPLE_ALPHA_GRIDS: Readonly<
  Record<RealExampleId, readonly number[]>
> = Object.freeze({
  'chilean-oak-raw': OAK_ALPHA_GRID,
  'paper010-supplied-dalpha-dt': PAPER010_ALPHA_GRID,
  'paper063-kissinger-beta-tp': [],
});
