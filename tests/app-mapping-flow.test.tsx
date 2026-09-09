import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import App from '../src/App';
import { confirmInterpretation } from './app-test-helpers';
import ambiguousCsv from './fixtures/bare_ambiguous.csv?raw';

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };

function setSelect(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
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

function roleUnitSelect(container: HTMLElement, label: string): HTMLSelectElement {
  const role = [...container.querySelectorAll<HTMLElement>('.mapping-role')]
    .find((item) => item.textContent?.includes(label));
  const selects = role?.querySelectorAll<HTMLSelectElement>('select');
  if (!selects || selects.length < 2) throw new Error(`Unit selector not found for ${label}`);
  return selects[1];
}

describe('App guided mapping flow', () => {
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

  it('keeps analysis disabled until ambiguous units are confirmed and re-ingested', async () => {
    const root = createRoot(host);
    await act(async () => root.render(<App />));

    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error('File input not found');
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File([ambiguousCsv], 'instrument-units.csv', { type: 'text/csv' })],
    });
    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    for (let attempt = 0; attempt < 50 && !host.querySelector('.mapping-wizard'); attempt += 1) {
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    }

    const analysisButton = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Run eligible methods'));
    expect(host.querySelector('.mapping-wizard')).not.toBeNull();
    expect(analysisButton?.disabled).toBe(true);
    const applyButton = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Validate selections'));
    if (!applyButton) throw new Error('Mapping apply button not found');
    expect(applyButton.disabled).toBe(true);
    expect(host.textContent).toContain('required selections before validation');

    await act(async () => {
      setSelect(roleUnitSelect(host, 'Temperature'), 'K');
      setSelect(roleUnitSelect(host, 'Conversion α'), 'fraction');
      setSelect(roleUnitSelect(host, 'Heating rate β'), 'K/min');
    });

    expect(applyButton.disabled).toBe(false);
    await act(async () => {
      applyButton.click();
    });
    for (let attempt = 0; attempt < 20 && host.querySelector('.mapping-wizard'); attempt += 1) {
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    }

    expect(host.querySelector('.mapping-wizard')).toBeNull();
    expect(host.querySelector('.status-pill')?.textContent).toContain('Ready');
    const stageLabel = host.querySelector<HTMLInputElement>('[data-testid="stage-label"]');
    if (!stageLabel) throw new Error('Stage label input not found');
    await act(async () => setInput(stageLabel, 'guided mapping stage'));
    await confirmInterpretation(host);
    expect(analysisButton?.disabled).toBe(false);

    await act(async () => root.unmount());
  });
});
