import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readXlsxFileMock = vi.hoisted(() => vi.fn(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return [{
    sheet: 'Slow',
    data: [
      ['Temperature [K]', 'Alpha [0-1]', 'beta [K/min]', 'Run', 'Reaction stage'],
      [400, 0.10, 5, 'slow-run', 'slow stage'],
      [425, 0.20, 5, 'slow-run', 'slow stage'],
      [450, 0.30, 5, 'slow-run', 'slow stage'],
    ],
  }];
}));

vi.mock('read-excel-file/browser', () => ({ default: readXlsxFileMock }));

vi.mock('../src/io', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/io')>();
  return {
    ...actual,
    ingestThermalFiles: async (
      files: File[],
      options: Parameters<typeof actual.ingestThermalFiles>[1],
    ) => {
      if (files.some((file) => file.name === 'paper063_kissinger_peaks.csv')) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return actual.ingestThermalFiles(files, options);
    },
  };
});

import App from '../src/App';

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};

async function waitUntil(
  predicate: () => boolean,
  label: string,
  attempts = 300,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function chooseFiles(host: HTMLElement, files: File[]): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('[data-testid="thermal-file-input"]');
  if (!input) throw new Error('File input not found.');
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

async function click(host: HTMLElement, selector: string): Promise<void> {
  const button = host.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`Button not found: ${selector}`);
  await act(async () => button.click());
}

function setInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Native input value setter is unavailable.');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('App dataset state integrity', () => {
  let host: HTMLDivElement;
  let root: Root;

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

  it('STATE-001 keeps the latest upload authoritative through JSON hashing and provenance', async () => {
    let exportedBlob: Blob | undefined;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = ((blob: Blob) => {
      exportedBlob = blob;
      return 'blob:state-integrity-test';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
    HTMLAnchorElement.prototype.click = () => undefined;

    try {
      await chooseFiles(host, [new File(['slow workbook'], 'slow.xlsx')]);
      const fastCsv = [
        'Temperature [K],Alpha [0-1],beta [K/min],Run,Reaction stage',
        '500,0.10,10,fast-run,fast stage',
        '525,0.20,10,fast-run,fast stage',
        '550,0.30,10,fast-run,fast stage',
      ].join('\n');
      await chooseFiles(host, [new File([fastCsv], 'fast.csv', { type: 'text/csv' })]);
      await waitUntil(
        () => host.querySelector('.file-row .status-pill')?.textContent === 'Ready',
        'latest upload to become ready',
      );
      await act(async () => new Promise((resolve) => setTimeout(resolve, 140)));

      expect(host.querySelector('.file-row strong')?.textContent).toBe('fast.csv');
      expect(host.querySelector('.mapping-audit-list section strong')?.textContent)
        .toBe('fast.csv');

      const confirmation = host.querySelector<HTMLInputElement>(
        '[data-testid="confirm-interpretation"]',
      );
      if (!confirmation) throw new Error('Interpretation confirmation not found.');
      await act(async () => confirmation.click());
      await click(host, '[data-testid="run-analysis"]');
      await waitUntil(
        () => host.querySelector<HTMLButtonElement>('[data-testid="export-json"]')?.disabled === false,
        'JSON export to become enabled',
      );
      await click(host, '[data-testid="export-json"]');
      await waitUntil(() => exportedBlob !== undefined, 'JSON export blob');

      const exportedText = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('Blob read failed.'));
        reader.readAsText(exportedBlob as Blob);
      });
      const report = JSON.parse(exportedText) as {
        context: { sourceFiles: Array<{ name: string; sha256: string }> };
        reproducibility: { inputTables: Array<{ fileName: string }> };
      };
      expect(report.context.sourceFiles[0]).toMatchObject({
        name: 'fast.csv',
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(report.reproducibility.inputTables[0]?.fileName).toBe('fast.csv');
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      HTMLAnchorElement.prototype.click = originalAnchorClick;
    }
  });

  it('STATE-001 does not let an older example load overwrite a newer upload', async () => {
    await click(host, 'button[data-example-id="paper063-kissinger-beta-tp"]');
    const userCsv = [
      'Temperature [K],Alpha [0-1],beta [K/min],Run,Reaction stage',
      '500,0.10,10,user-run,user stage',
      '525,0.20,10,user-run,user stage',
      '550,0.30,10,user-run,user stage',
    ].join('\n');
    await chooseFiles(host, [new File([userCsv], 'user.csv', { type: 'text/csv' })]);
    await waitUntil(
      () => host.querySelector('.file-row .status-pill')?.textContent === 'Ready',
      'newer upload to become ready',
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 140)));

    expect(host.querySelector('.file-row strong')?.textContent)
      .toBe('user.csv');
    expect(host.querySelector('.mapping-audit-list section strong')?.textContent)
      .toBe('user.csv');
  });

  it('STATE-002 keeps mapping dirty when controls change during an in-flight Apply', async () => {
    await chooseFiles(host, [new File(['slow workbook'], 'mapping-race.xlsx')]);
    await waitUntil(
      () => host.querySelector('.file-row .status-pill')?.textContent === 'Ready',
      'initial workbook ingestion',
    );
    await click(host, '[data-testid="mapping-editor-toggle"]');
    const decimal = host.querySelector<HTMLSelectElement>('[data-testid="decimal-separator"]');
    if (!decimal) throw new Error('Decimal separator control not found.');
    await act(async () => {
      decimal.value = '.';
      decimal.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click(host, '[data-testid="apply-mapping"]');

    const header = host.querySelector<HTMLInputElement>('[data-testid="header-row-input"]');
    if (!header) throw new Error('Header row control disappeared during Apply.');
    await act(async () => setInput(header, '2'));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 140)));

    expect(host.querySelector<HTMLInputElement>('[data-testid="header-row-input"]')?.value)
      .toBe('2');
    expect(host.querySelector('[data-testid="mapping-pending-notice"]')).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>('[data-testid="confirm-interpretation"]'))
      .toBeNull();
    expect(host.querySelector('.mapping-wizard')).not.toBeNull();
  });
});
