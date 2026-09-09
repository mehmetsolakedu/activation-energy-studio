import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import App from '../src/App';
import { confirmInterpretation, interpretationCheckbox } from './app-test-helpers';

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };

async function waitUntil(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function buttonContaining(host: HTMLElement, label: string): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.textContent?.includes(label));
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

function mappingRole(host: HTMLElement, label: string): HTMLElement | undefined {
  return [...host.querySelectorAll<HTMLElement>('.mapping-role')]
    .find((role) => role.querySelector('label')?.firstChild?.textContent?.trim() === label);
}

describe('App TXT selection', () => {
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

  it('accepts a directly usable TXT table through the visible file control', async () => {
    const root = createRoot(host);
    await act(async () => root.render(<App />));
    const input = host.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('File input not found');
    expect(input.accept.split(',')).toContain('.txt');

    const text = [
      'Time(s)\tTemperature [K]\tAlpha [0-1]\tbeta [K/min]\trun',
      '0\t400\t0.1\t5\trun-5',
      '60\t425\t0.2\t5\trun-5',
    ].join('\n');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File([text], 'instrument.txt', { type: 'text/plain' })],
    });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (host.querySelector('.status-pill')?.textContent?.includes('Ready')) break;
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    }

    expect(host.querySelector('.status-pill')?.textContent).toContain('Ready');
    expect(host.textContent).not.toContain('unsupported_file_type');

    const toggle = host.querySelector<HTMLButtonElement>('[data-testid="mapping-editor-toggle"]');
    if (!toggle) throw new Error('Mapping editor toggle not found');
    await act(async () => toggle.click());
    const timeRole = mappingRole(host, 'Time (optional)');
    const timeSelect = timeRole?.querySelector<HTMLSelectElement>('select');
    if (!timeSelect) throw new Error('Time mapping selector not found');
    expect(timeSelect.value).toBe('0');
    await act(async () => {
      timeSelect.value = '';
      timeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const apply = host.querySelector<HTMLButtonElement>('[data-testid="apply-mapping"]');
    if (!apply) throw new Error('Mapping apply button not found');
    await act(async () => apply.click());
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (!host.querySelector('.mapping-wizard')) break;
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    }
    expect(host.querySelector('.status-pill')?.textContent).toContain('Ready');

    const reopen = host.querySelector<HTMLButtonElement>('[data-testid="mapping-editor-toggle"]');
    if (!reopen) throw new Error('Mapping editor reopen control not found');
    await act(async () => reopen.click());
    const ignoredTimeRole = mappingRole(host, 'Time (optional)');
    expect(ignoredTimeRole?.querySelector<HTMLSelectElement>('select')?.value).toBe('');
    await act(async () => root.unmount());
  });

  it('invalidates results and blocks analysis/export while ready-file mapping edits are pending', async () => {
    const root = createRoot(host);
    await act(async () => root.render(<App />));
    await act(async () => buttonContaining(host, 'Try the synthetic check').click());
    await waitUntil(
      () => interpretationCheckbox(host)?.disabled === false,
      'synthetic ingestion',
    );
    await confirmInterpretation(host);

    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]')?.click());
    await waitUntil(
      () => host.querySelector('[data-testid="numeric-results"]') !== null,
      'initial analysis',
    );
    expect(host.querySelector<HTMLButtonElement>('[data-testid="export-json"]')?.disabled)
      .toBe(false);

    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="mapping-editor-toggle"]')?.click());
    const massPercentRole = mappingRole(host, 'Mass percentage (optional)');
    const columnSelect = massPercentRole?.querySelector<HTMLSelectElement>('select');
    if (!columnSelect) throw new Error('Mass-percentage mapping selector not found');
    await act(async () => {
      columnSelect.value = '';
      columnSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(host.querySelector('[data-testid="mapping-pending-notice"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="numeric-results"]')).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]')?.disabled)
      .toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-testid="export-json"]')?.disabled)
      .toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-testid="export-csv"]')?.disabled)
      .toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-testid="export-pdf"]')?.disabled)
      .toBe(true);

    const apply = host.querySelector<HTMLButtonElement>('[data-testid="apply-mapping"]');
    if (!apply) throw new Error('Mapping apply button not found');
    await act(async () => apply.click());
    await waitUntil(
      () =>
        host.querySelector('[data-testid="mapping-pending-notice"]') === null
        && interpretationCheckbox(host)?.disabled === false,
      'applied ready mapping',
    );
    await confirmInterpretation(host);

    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]')?.click());
    await waitUntil(
      () => host.querySelector('[data-testid="numeric-results"]') !== null,
      'analysis after applied mapping',
    );
    expect(host.querySelector<HTMLButtonElement>('[data-testid="export-json"]')?.disabled)
      .toBe(false);
    await act(async () => root.unmount());
  });

  it('requires fresh unit confirmation when a ready mapping moves to another column', async () => {
    const root = createRoot(host);
    await act(async () => root.render(<App />));
    const input = host.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('File input not found');
    const text = [
      'Temperature [K]\tSensor B [°C]\tAlpha [0-1]\tbeta [K/min]\trun',
      '400\t100\t0.1\t5\trun-5',
      '425\t125\t0.2\t5\trun-5',
      '450\t150\t0.3\t5\trun-5',
    ].join('\n');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File([text], 'dual-sensor.txt', { type: 'text/plain' })],
    });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await waitUntil(
      () => host.querySelector<HTMLButtonElement>('[data-testid="mapping-editor-toggle"]') !== null,
      'ready TXT mapping editor',
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="mapping-editor-toggle"]')?.click());

    let temperatureRole = mappingRole(host, 'Temperature');
    let selects = temperatureRole?.querySelectorAll<HTMLSelectElement>('select');
    const columnSelect = selects?.[0];
    if (!columnSelect) throw new Error('Temperature mapping selector not found');
    expect(columnSelect.value).toBe('0');
    await act(async () => {
      columnSelect.value = '1';
      columnSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    temperatureRole = mappingRole(host, 'Temperature');
    selects = temperatureRole?.querySelectorAll<HTMLSelectElement>('select');
    const unitSelect = selects?.[1];
    if (!unitSelect) throw new Error('Temperature unit selector not found');
    expect(unitSelect.value).toBe('');
    expect(host.querySelector('[data-testid="mapping-unit-required"]')?.textContent)
      .toContain('Temperature');
    expect(host.querySelector<HTMLButtonElement>('[data-testid="apply-mapping"]')?.disabled)
      .toBe(true);

    await act(async () => {
      unitSelect.value = 'C';
      unitSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.querySelector('[data-testid="mapping-unit-required"]')).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="apply-mapping"]')?.disabled)
      .toBe(false);

    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="apply-mapping"]')?.click());
    await waitUntil(
      () =>
        host.querySelector('.mapping-wizard') === null
        && host.querySelector('.status-pill')?.textContent?.includes('Ready') === true,
      'remapped TXT ingestion',
    );
    await act(async () => root.unmount());
  });
});
