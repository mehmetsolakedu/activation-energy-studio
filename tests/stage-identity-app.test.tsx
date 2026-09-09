import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import App from '../src/App';
import { confirmInterpretation, interpretationCheckbox } from './app-test-helpers';
import syntheticCsv from '../examples/synthetic_kas_150.csv?raw';

const peakTsv = [
  'Peak temperature [K]\tHeating rate [K/min]\tRun\tSample\tAtmosphere\tPeak resolved\tPeak quality\tPeak source signal\tAnalyst confirmed\tPeak ambiguous',
  '585\t5\tpeak-5\tsample-a\tN2\ttrue\tclear-interior\texternal-beta-tp-table\ttrue\tfalse',
  '600\t10\tpeak-10\tsample-a\tN2\ttrue\tclear-interior\texternal-beta-tp-table\ttrue\tfalse',
  '618\t20\tpeak-20\tsample-a\tN2\ttrue\tclear-interior\texternal-beta-tp-table\ttrue\tfalse',
  '637\t40\tpeak-40\tsample-a\tN2\ttrue\tclear-interior\texternal-beta-tp-table\ttrue\tfalse',
  '',
].join('\n');

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};

async function waitUntil(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function setInput(host: HTMLElement, testId: string, value: string): void {
  const input = host.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`);
  if (!input) throw new Error(`Input not found: ${testId}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Native input value setter is unavailable');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function upload(host: HTMLElement, file: File): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('File input not found');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  await waitUntil(
    () => host.querySelector('.file-row .status-pill')?.textContent?.includes('Ready') === true,
    'ready ingestion',
  );
}

describe('App reaction-stage binding', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(<App />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('invalidates a completed result and all exports when the bound stage label changes', async () => {
    await upload(
      host,
      new File([syntheticCsv], 'stage-invalidation.csv', { type: 'text/csv' }),
    );
    await act(async () => setInput(host, 'stage-label', 'main decomposition'));
    await waitUntil(
      () => interpretationCheckbox(host)?.disabled === false,
      'ready interpretation confirmation',
    );
    await confirmInterpretation(host);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]')?.click());
    await waitUntil(
      () => host.querySelector('[data-testid="numeric-results"]') !== null,
      'numeric result',
    );
    expect(host.querySelector<HTMLButtonElement>('[data-testid="export-json"]')?.disabled)
      .toBe(false);

    await act(async () => setInput(host, 'stage-label', 'secondary decomposition'));

    expect(host.querySelector('[data-testid="numeric-results"]')).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="export-json"]')?.disabled)
      .toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-testid="export-csv"]')?.disabled)
      .toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-testid="export-pdf"]')?.disabled)
      .toBe(true);
  });

  it('keeps a stage-less beta-Tp series closed, then succeeds after explicit binding', async () => {
    await upload(
      host,
      new File([peakTsv], 'stage-less-peaks.tsv', { type: 'text/tab-separated-values' }),
    );

    expect(interpretationCheckbox(host)?.disabled).toBe(true);
    expect(host.querySelector('[data-testid="stage-identity-required"]')).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]')?.disabled)
      .toBe(true);
    expect(host.querySelector('[data-testid="numeric-results"]')).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="export-json"]')?.disabled)
      .toBe(true);

    await act(async () => setInput(host, 'stage-label', 'main peak'));
    await confirmInterpretation(host);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]')?.click());
    await waitUntil(
      () => host.querySelector(
        '[data-testid="numeric-results"] tbody tr[data-method="KISSINGER"]',
      ) !== null,
      'standalone Kissinger result',
    );

    expect(host.querySelector('[data-testid="analysis-refused-state"]')).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="export-json"]')?.disabled)
      .toBe(false);
  });

  it('keeps analysis closed when a partially entered or reversed stage window is present', async () => {
    await upload(
      host,
      new File([syntheticCsv], 'invalid-stage-window.csv', { type: 'text/csv' }),
    );
    await act(async () => setInput(host, 'stage-start', '400'));

    expect(host.querySelector('[data-testid="stage-window-error"]')?.textContent)
      .toContain('Enter both the start and end temperatures');
    expect(host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]')?.disabled)
      .toBe(true);

    await act(async () => setInput(host, 'stage-end', '200'));

    expect(host.querySelector('[data-testid="stage-window-error"]')?.textContent)
      .toContain('start lower than end');
    expect(host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]')?.disabled)
      .toBe(true);
    expect(host.querySelector('[data-testid="numeric-results"]')).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="export-json"]')?.disabled)
      .toBe(true);
  });
});
