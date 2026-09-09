import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import App from '../src/App';
import { confirmInterpretation } from './app-test-helpers';

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };

function buttonContaining(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.textContent?.includes(text));
  if (!button) throw new Error(`Button containing "${text}" was not found.`);
  return button;
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  if (!setter) throw new Error('Native input value setter is unavailable');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function waitUntil(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

describe('App provided-derivative mapping flow', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('requires an explicit unit for dAlpha/dt and exposes the safe guided mapping choice', async () => {
    const rows = [
      'Temperature [K],Alpha [fraction],Heating rate [K/min],Run,dα/dt',
      '500,0.4,5,run-5,0.010',
      '510,0.5,5,run-5,0.012',
      '520,0.6,5,run-5,0.014',
      '510,0.4,10,run-10,0.020',
      '520,0.5,10,run-10,0.024',
      '530,0.6,10,run-10,0.028',
      '520,0.4,20,run-20,0.040',
      '530,0.5,20,run-20,0.048',
      '540,0.6,20,run-20,0.056',
    ];
    const root = createRoot(host);
    await act(async () => root.render(<App />));

    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error('File input not found.');
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File([`${rows.join('\n')}\n`], 'provided-derivative-unit.csv', {
        type: 'text/csv',
      })],
    });
    await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
    await waitUntil(() => host.querySelector('.mapping-wizard') !== null, 'mapping wizard');

    const derivativeRole = [...host.querySelectorAll<HTMLElement>('.mapping-role')]
      .find((item) => item.textContent?.includes('Conversion rate dα/dt'));
    expect(derivativeRole).toBeDefined();
    const selects = derivativeRole?.querySelectorAll<HTMLSelectElement>('select');
    expect(selects).toHaveLength(2);
    const unitSelect = selects?.[1];
    expect([...(unitSelect?.options ?? [])].map(({ value }) => value)).toEqual([
      '',
      'min^-1',
      's^-1',
      '%/min',
      '%/s',
    ]);
    expect(host.textContent).toContain('A generic DTG or dm/dt mass-rate column is not automatically treated as dα/dt');

    const applyButton = buttonContaining(host, 'Validate selections');
    expect(applyButton.disabled).toBe(true);
    await act(async () => {
      if (!unitSelect) throw new Error('dAlpha/dt unit selector not found.');
      unitSelect.value = 'min^-1';
      unitSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(applyButton.disabled).toBe(false);

    await act(async () => applyButton.click());
    await waitUntil(() => host.querySelector('.mapping-wizard') === null, 'mapping re-ingestion');
    expect(host.querySelector('.status-pill')?.textContent).toContain('Ready');
    const stageLabel = host.querySelector<HTMLInputElement>('[data-testid="stage-label"]');
    if (!stageLabel) throw new Error('Stage label input not found.');
    await act(async () => setInput(stageLabel, 'provided derivative stage'));
    await confirmInterpretation(host);
    expect(buttonContaining(host, 'Run eligible methods').disabled).toBe(false);

    await act(async () => root.unmount());
  });
});
