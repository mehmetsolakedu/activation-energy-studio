import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  BatchIngestionResult,
  IngestionOptions,
  IngestionResult,
} from '../src/io';
import { confirmInterpretation } from './app-test-helpers';

const harness = vi.hoisted(() => ({
  ingest: vi.fn(),
  wideOptions: {
    layout: 'wide-series',
    headerRow: 0,
    decimalSeparator: '.',
    wideScopeConfirmed: true,
    wideSeries: [{
      seriesId: 'series-1',
      runId: 'run-1',
      temperature: { columnIndex: 0, unit: 'C' },
      signal: {
        kind: 'massPercent',
        columnIndex: 1,
        unit: '%',
        alphaReference: { initialValue: 100, finalValue: 0 },
      },
      derivative: {
        semantic: 'massLossRate',
        valueColumnIndex: 3,
        unit: '%/min',
        temperatureColumn: { columnIndex: 2, unit: 'C' },
      },
      heatingRate: { value: 5, unit: 'K/min' },
      context: { sample: 'RH', atmosphere: 'N2', stage: 'main decomposition' },
    }],
  },
}));

vi.mock('../src/io', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/io')>();
  return { ...actual, ingestThermalFiles: harness.ingest };
});

vi.mock('../src/components/MappingWizard', () => ({
  MappingWizard: ({
    onApply,
    onChange,
  }: {
    onApply: () => void;
    onChange: (fileIndex: number, options: IngestionOptions) => void;
  }) => (
    <div data-testid="mock-wide-mapper">
      <button
        data-testid="mock-wide-configure"
        onClick={() => onChange(0, harness.wideOptions as IngestionOptions)}
        type="button"
      >
        Configure wide
      </button>
      <button data-testid="mock-wide-apply" onClick={onApply} type="button">
        Apply wide
      </button>
    </div>
  ),
}));

import App from '../src/App';

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};

function fileResult(status: IngestionResult['status']): IngestionResult {
  return {
    status,
    source: {
      fileName: 'raw-wide.xlsx',
      fileType: 'xlsx',
      sheetName: 'Data',
    },
    headers: ['T', 'TG', 'T DTG', 'DTG'],
    preview: [[100, 99, 100, 0.01]],
    mappings: [],
    candidates: [],
    mappingNeeds: status === 'needs_mapping'
      ? [
          { kind: 'wide_series', message: 'Map each series.' },
          { kind: 'scope_confirmation', message: 'Confirm scope.' },
        ]
      : [],
    diagnostics: [],
    records: [],
    tables: { tAlphaBeta: [], betaTp: [] },
  };
}

function batch(status: BatchIngestionResult['status']): BatchIngestionResult {
  const file = fileResult(status);
  return {
    status,
    files: [file],
    diagnostics: [],
    records: [],
    tables: { tAlphaBeta: [], betaTp: [] },
  };
}

async function waitUntil(
  condition: () => boolean,
  label: string,
  attempts = 60,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (condition()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Native input value setter is unavailable');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('App wide-series alpha-grid binding', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    harness.ingest.mockReset();
    harness.ingest.mockImplementation(async (
      _files: readonly File[],
      options: readonly IngestionOptions[],
    ) => (
      options[0]?.layout === 'wide-series' ? batch('ready') : batch('needs_mapping')
    ));
    root = createRoot(host);
    await act(async () => root.render(<App />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('blocks stale analysis/export and refreshes projection on the current grid', async () => {
    const upload = host.querySelector<HTMLInputElement>('input[type="file"]');
    if (!upload) throw new Error('File input not found');
    Object.defineProperty(upload, 'files', {
      configurable: true,
      value: [new File(['mock'], 'raw-wide.xlsx')],
    });
    await act(async () => upload.dispatchEvent(new Event('change', { bubbles: true })));
    await waitUntil(
      () => host.querySelector('[data-testid="mock-wide-mapper"]') !== null,
      'wide mapper',
    );

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="mock-wide-configure"]')?.click();
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="mock-wide-apply"]')?.click();
    });
    await waitUntil(
      () => host.querySelector('.status-pill')?.textContent?.includes('Ready') === true,
      'ready ingestion',
    );

    const initialApplied = harness.ingest.mock.calls[1]?.[1] as IngestionOptions[];
    expect(initialApplied[0]?.wideAlphaGrid).toEqual([
      0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
    ]);
    expect(host.querySelector('[data-testid="wide-alpha-grid-stale"]')).toBeNull();

    const alphaStep = host.querySelector<HTMLInputElement>('[data-testid="alpha-step"]');
    if (!alphaStep) throw new Error('Alpha-step input not found');
    await act(async () => setInput(alphaStep, '0.20'));

    const stale = host.querySelector('[data-testid="wide-alpha-grid-stale"]');
    const run = host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]');
    expect(stale?.textContent).toContain('Stale points will not be used silently');
    expect(run?.disabled).toBe(true);
    expect(host.querySelector('[data-testid="numeric-results"]')).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="export-pdf"]')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-testid="export-csv"]')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-testid="export-json"]')?.disabled).toBe(true);

    const refresh = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Refresh wide-series projection'));
    if (!refresh) throw new Error('Wide projection refresh action not found');
    await act(async () => refresh.click());
    await waitUntil(() => harness.ingest.mock.calls.length >= 3, 'wide reprojection');
    await waitUntil(
      () => host.querySelector('[data-testid="wide-alpha-grid-stale"]') === null,
      'stale marker cleared',
    );

    const refreshed = harness.ingest.mock.calls[2]?.[1] as IngestionOptions[];
    expect(refreshed[0]?.wideAlphaGrid).toEqual([0.1, 0.3, 0.5, 0.7, 0.9]);
    const stageLabel = host.querySelector<HTMLInputElement>('[data-testid="stage-label"]');
    if (!stageLabel) throw new Error('Stage-label input not found');
    await act(async () => setInput(stageLabel, 'main decomposition'));
    await confirmInterpretation(host);
    expect(host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]')?.disabled)
      .toBe(false);
  });
});
