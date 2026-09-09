import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import App from '../src/App';
import { analyzeActivationEnergy } from '../src/core';
import { buildThermalRuns } from '../src/integration';
import { ingestThermalFiles } from '../src/io';
import { confirmInterpretation, interpretationCheckbox } from './app-test-helpers';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIRECTORY = path.resolve(
  TEST_DIRECTORY,
  '../evidence/usability/v0.2.0/study_bundle',
);
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };

function fixtureFile(fileName: string): File {
  const type = fileName.endsWith('.tsv') ? 'text/tab-separated-values' : 'text/csv';
  const source = readFileSync(path.resolve(FIXTURE_DIRECTORY, fileName));
  if (fileName !== 'C1_peaks.tsv') return new File([source], fileName, { type });
  // Preserve the historical usability bundle byte-for-byte while adapting its
  // numeric peak table to the candidate's explicit peak-evidence contract.
  const rows = source.toString('utf8').trimEnd().split(/\r?\n/u);
  const verifiedRows = rows.map((row, index) => index === 0
    ? `${row}\tPeak resolved\tPeak quality\tPeak source signal\tAnalyst confirmed\tPeak ambiguous`
    : `${row}\ttrue\tclear-interior\texternal-beta-tp-table\ttrue\tfalse`);
  return new File([`${verifiedRows.join('\n')}\n`], fileName, { type });
}

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

function setInput(host: HTMLElement, testId: string, value: string): void {
  const input = host.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`);
  if (!input) throw new Error(`Input not found: ${testId}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Native input value setter is unavailable');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('nonexpert result-type comprehension surface', () => {
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

  it('loads the embedded nonexperimental example, confirms it, and reaches Ea(alpha) results', async () => {
    await act(async () => buttonContaining(host, 'Try the synthetic check').click());
    await waitUntil(
      () => interpretationCheckbox(host)?.disabled === false,
      'embedded example ingestion',
    );

    expect(host.querySelector('.mapping-wizard')).toBeNull();
    expect(host.querySelector('.status-pill')?.textContent).toContain('Ready');

    await confirmInterpretation(host);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]')?.click());
    await waitUntil(
      () => host.querySelector('[data-testid="result-type-comparison"]') !== null,
      'result type comparison',
    );

    const comparison = host.querySelector<HTMLElement>('[data-testid="result-type-comparison"]');
    expect(comparison?.textContent).toContain('Ea(α) profile');
    expect(comparison?.querySelector('.result-type-card.profile strong')?.textContent)
      .toMatch(/^[1-9]\d* calculated points$/);
    expect(comparison?.querySelector('.result-type-card.peak strong')?.textContent)
      .toBe('Not calculated');
    const numericResults = host.querySelector<HTMLElement>('[data-testid="numeric-results"]');
    const numericRows = numericResults?.querySelectorAll('tbody tr') ?? [];
    expect(numericResults?.textContent).toContain('Numerical Ea and regression diagnostics');
    expect(numericRows).toHaveLength(36);
    const firstFwoRow = numericResults?.querySelector<HTMLElement>(
      'tbody tr[data-method="FWO"][data-result-type="isoconversional"]',
    );
    expect(firstFwoRow?.querySelector('[data-field="alpha"]')?.textContent).toBe('0.10');
    expect(Number(firstFwoRow?.querySelector('[data-field="ea"]')?.textContent)).toBeGreaterThan(0);
    expect(firstFwoRow?.querySelector('[data-field="ci95"]')?.textContent)
      .toMatch(/^-?\d+\.\d{2} – -?\d+\.\d{2}$/);
    expect(firstFwoRow?.querySelector('[data-field="r2"]')?.textContent)
      .toMatch(/^(?:0\.\d{5}|1\.00000)$/);
    expect(Number(firstFwoRow?.querySelector('[data-field="n"]')?.textContent))
      .toBeGreaterThanOrEqual(3);
    expect(host.textContent).toContain('The synthetic check is for training');
  });

  it('renders the actual C1 Kissinger value beside Ea(alpha) and locks the four-part boundary', async () => {
    const inputFiles = [
      fixtureFile('W2_synthetic_kas_150.csv'),
      fixtureFile('C1_peaks.tsv'),
    ];
    const ingestion = await ingestThermalFiles(inputFiles);
    const adapted = buildThermalRuns(ingestion, undefined, 'result comparison stage');
    const expected = analyzeActivationEnergy(adapted.runs, {
      methods: ['FWO', 'KAS', 'STARINK', 'FRIEDMAN'],
      includeKissinger: true,
      minR2Warning: 0.98,
    }).kissinger?.activationEnergyKJPerMol;
    expect(expected).toBeTypeOf('number');

    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error('File input not found');
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [
        fixtureFile('W2_synthetic_kas_150.csv'),
        fixtureFile('C1_peaks.tsv'),
      ],
    });
    await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => setInput(host, 'stage-label', 'result comparison stage'));
    await waitUntil(
      () => interpretationCheckbox(host)?.disabled === false,
      'paired fixture ingestion',
    );
    await confirmInterpretation(host);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]')?.click());

    const comparison = host.querySelector<HTMLElement>('[data-testid="result-type-comparison"]');
    expect(comparison).not.toBeNull();
    expect(comparison?.querySelector('.result-type-card.peak strong')?.textContent)
      .toBe(`${expected?.toFixed(1)} kJ/mol`);
    expect(comparison?.textContent).toContain('They are not the same result');
    expect(comparison?.textContent).toContain('Multiple heating rates are compared at fixed conversion');
    expect(comparison?.textContent).toContain('from peak temperatures');
    expect(comparison?.textContent).toContain('are not interchangeable');
    const peakRow = host.querySelector<HTMLElement>(
      '[data-testid="numeric-results"] tbody tr[data-method="KISSINGER"][data-result-type="peak"]',
    );
    expect(peakRow?.querySelector('[data-field="alpha"]')?.textContent).toBe('Peak');
    expect(peakRow?.querySelector('[data-field="ea"]')?.textContent)
      .toBe(expected?.toFixed(2));
  });

  it('runs a standalone beta-Tp file as a separate Kissinger analysis', async () => {
    const peakFile = fixtureFile('C1_peaks.tsv');
    const ingestion = await ingestThermalFiles([peakFile]);
    const adapted = buildThermalRuns(ingestion, undefined, 'standalone peak stage');
    const expected = analyzeActivationEnergy(adapted.runs, {
      methods: [],
      includeKissinger: true,
      kissingerPeaks: adapted.kissingerPeaks,
    }).kissinger?.activationEnergyKJPerMol;
    expect(adapted.runs).toEqual([]);
    expect(adapted.kissingerPeaks).toHaveLength(4);
    expect(expected).toBeTypeOf('number');

    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error('File input not found');
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [fixtureFile('C1_peaks.tsv')],
    });
    await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => setInput(host, 'stage-label', 'standalone peak stage'));
    await waitUntil(
      () => interpretationCheckbox(host)?.disabled === false,
      'standalone peak ingestion',
    );
    await confirmInterpretation(host);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]')?.click());
    await waitUntil(
      () => host.querySelector(
        '[data-testid="numeric-results"] tbody tr[data-method="KISSINGER"]',
      ) !== null,
      'standalone Kissinger result',
    );

    const comparison = host.querySelector<HTMLElement>('[data-testid="result-type-comparison"]');
    expect(comparison?.querySelector('.result-type-card.profile strong')?.textContent)
      .toBe('0 calculated points');
    expect(comparison?.querySelector('.result-type-card.peak strong')?.textContent)
      .toBe(`${expected?.toFixed(1)} kJ/mol`);
    const rows = host.querySelectorAll('[data-testid="numeric-results"] tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute('data-result-type')).toBe('peak');
  });

  it('fails the entire batch closed when valid runs coexist with an adapter error', async () => {
    const twoPointRuns = [
      'Temperature [K],Alpha [0-1],Heating rate [K/min],Run,Sample,Atmosphere',
      '500,.1,5,bad-beta-5,refusal,N2',
      '600,.9,5,bad-beta-5,refusal,N2',
      '510,.1,10,bad-beta-10,refusal,N2',
      '610,.9,10,bad-beta-10,refusal,N2',
      '520,.1,20,bad-beta-20,refusal,N2',
      '620,.9,20,bad-beta-20,refusal,N2',
      '',
    ].join('\n');
    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error('File input not found');
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [
        fixtureFile('W2_synthetic_kas_150.csv'),
        new File([twoPointRuns], 'adapter-refusal.csv', { type: 'text/csv' }),
      ],
    });
    await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => setInput(host, 'stage-label', 'adapter refusal stage'));
    await waitUntil(
      () => interpretationCheckbox(host)?.disabled === false,
      'adapter-refusal ingestion',
    );
    await confirmInterpretation(host);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]')?.click());

    const refused = host.querySelector<HTMLElement>('[data-testid="analysis-refused-state"]');
    expect(refused).not.toBeNull();
    expect(refused?.textContent).toContain('CALCULATION REJECTED');
    expect(refused?.textContent).toContain('INSUFFICIENT_STAGE_POINTS');
    expect(refused?.textContent).not.toContain('Analysis has not been run');
    expect(host.querySelector('[data-testid="numeric-results"]')).toBeNull();
    expect(buttonContaining(host, 'PDF report').disabled).toBe(true);
    expect(buttonContaining(host, 'Results CSV').disabled).toBe(true);
    expect(buttonContaining(host, 'Reproducible JSON').disabled).toBe(true);
  });

  it('refuses an unsupported selection visibly instead of silently dropping the file', async () => {
    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error('File input not found');
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File(['not thermal data'], 'instrument-report.pdf', { type: 'application/pdf' })],
    });
    await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })));

    expect(host.textContent).toContain('unsupported_file_type');
    expect(host.textContent).toContain('Problem: The file type is unsupported.');
    expect(host.textContent).toContain('Why it matters:');
    expect(host.textContent).toContain('Action:');
    expect(host.textContent).toContain('instrument-report.pdf');
    expect(host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]')?.disabled).toBe(true);
    expect(host.querySelectorAll('.file-row')).toHaveLength(0);
  });
});
