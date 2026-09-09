import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import App from '../src/App';
import { confirmInterpretation, interpretationCheckbox } from './app-test-helpers';
import realCsv from './fixtures/real/paper010_rh_t_alpha_beta.csv?raw';

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };

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

describe('App alpha-grid flow', () => {
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

  it('runs the explicit 0.05–0.80 Paper010-sized grid as 16 points per method', async () => {
    await act(async () => {
      setInput(host, 'alpha-start', '0.05');
      setInput(host, 'alpha-end', '0.80');
      setInput(host, 'alpha-step', '0.05');
    });
    expect(host.querySelector('[data-testid="alpha-grid-summary"]')?.textContent)
      .toContain('16 α points');

    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error('File input not found');
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File([realCsv], 'paper010-rh-real.csv', { type: 'text/csv' })],
    });
    await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => setInput(host, 'stage-label', 'Paper010 supplied-alpha stage'));
    await waitUntil(
      () => interpretationCheckbox(host)?.disabled === false,
      'example ingestion',
    );
    await confirmInterpretation(host);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]')?.click());
    await waitUntil(
      () => host.querySelectorAll('[data-testid="numeric-results"] tbody tr').length === 64,
      '64 isoconversional result rows',
    );

    const rows = host.querySelectorAll<HTMLElement>(
      '[data-testid="numeric-results"] tbody tr[data-result-type="isoconversional"]',
    );
    expect(rows).toHaveLength(64);
    expect(rows[0]?.querySelector('[data-field="alpha"]')?.textContent).toBe('0.05');
    expect(rows[15]?.querySelector('[data-field="alpha"]')?.textContent).toBe('0.80');
  });

  it('disables analysis and invalidates existing results when the grid is unaligned', async () => {
    const exampleButton = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Try the synthetic check'));
    if (!exampleButton) throw new Error('Synthetic example button not found');
    await act(async () => exampleButton.click());
    await waitUntil(
      () => interpretationCheckbox(host)?.disabled === false,
      'example ingestion',
    );
    await confirmInterpretation(host);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]')?.click());
    expect(host.querySelector('[data-testid="numeric-results"]')).not.toBeNull();

    await act(async () => setInput(host, 'alpha-step', '0.07'));
    expect(host.querySelector('[data-testid="alpha-grid-error"]')?.textContent)
      .toContain('must be exactly divisible');
    expect(host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]')?.disabled).toBe(true);
    expect(host.querySelector('[data-testid="numeric-results"]')).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="export-json"]')?.disabled).toBe(true);
  });
});
