import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import App from '../src/App';
import type { RealExampleId } from '../src/examples/catalog';
import {
  confirmInterpretation,
  interpretationCheckbox,
} from './app-test-helpers';

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};

async function waitUntil(
  predicate: () => boolean,
  label: string,
): Promise<void> {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (predicate()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function runExample(host: HTMLElement, id: RealExampleId): Promise<void> {
  const button = host.querySelector<HTMLButtonElement>(
    `button[data-example-id="${id}"]`,
  );
  if (!button) throw new Error(`Real-example button not found: ${id}`);
  await act(async () => button.click());
  await waitUntil(
    () => interpretationCheckbox(host)?.disabled === false,
    `${id} interpretation`,
  );
  await confirmInterpretation(host);
  const run = host.querySelector<HTMLButtonElement>(
    '[data-testid="run-analysis"]',
  );
  expect(run?.disabled).toBe(false);
  await act(async () => run?.click());
  await waitUntil(
    () => (
      host.querySelector('[data-testid="numeric-results"]') !== null
      || host.querySelector('[data-testid="analysis-refused-state"]') !== null
    ),
    `${id} analysis outcome`,
  );
  const refused = host.querySelector<HTMLElement>(
    '[data-testid="analysis-refused-state"]',
  );
  if (refused) {
    throw new Error(`${id} was refused: ${refused.textContent}`);
  }
}

describe('licensed real-example App flow', () => {
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

  it('runs the four-rate Chilean Oak raw-curve example with three integral methods', async () => {
    await runExample(host, 'chilean-oak-raw');

    const rows = host.querySelectorAll(
      '[data-testid="numeric-results"] tbody tr[data-result-type="isoconversional"]',
    );
    expect(rows).toHaveLength(51);
    expect(new Set([...rows].map((row) => row.getAttribute('data-method'))))
      .toEqual(new Set(['FWO', 'KAS', 'STARINK']));
    expect(host.textContent).toContain('10.17632/gkhjh4v8tg.2');
  });

  it('runs the supplied dAlpha/dt Paper010 example through Friedman only', async () => {
    await runExample(host, 'paper010-supplied-dalpha-dt');

    const rows = host.querySelectorAll(
      '[data-testid="numeric-results"] tbody tr[data-result-type="isoconversional"]',
    );
    expect(rows).toHaveLength(16);
    expect([...rows].every((row) => row.getAttribute('data-method') === 'FRIEDMAN'))
      .toBe(true);
    expect(host.textContent).toContain('10.1371/journal.pone.0173946.s002');
  });

  it('runs the article-derived beta-Tp example as a separate Kissinger result', async () => {
    let exportedBlob: Blob | undefined;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = ((blob: Blob) => {
      exportedBlob = blob;
      return 'blob:licensed-example-export-test';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
    HTMLAnchorElement.prototype.click = () => undefined;

    try {
      await runExample(host, 'paper063-kissinger-beta-tp');

      const rows = host.querySelectorAll(
        '[data-testid="numeric-results"] tbody tr',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.getAttribute('data-method')).toBe('KISSINGER');
      expect(rows[0]?.getAttribute('data-result-type')).toBe('peak');
      expect(host.textContent).toContain('there is no separate raw-dataset license');
      expect(host.textContent).toContain('10.3390/ma13245595');

      const exportJson = host.querySelector<HTMLButtonElement>(
        '[data-testid="export-json"]',
      );
      expect(exportJson?.disabled).toBe(false);
      await act(async () => exportJson?.click());
      await waitUntil(() => exportedBlob !== undefined, 'Paper063 JSON export');

      const exportedText = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('Blob read failed.'));
        reader.readAsText(exportedBlob as Blob);
      });
      const report = JSON.parse(exportedText) as {
        context: {
          licensedSourceProvenance: {
            exampleId: string;
            citation: { doi: string };
            sourceType: string;
            separateDatasetLicense: { exists: boolean; identifier: string | null };
            printedPrecision: string;
            rounding: string;
          };
          sourceFiles: Array<{ sourceFileId: string }>;
        };
      };
      expect(report.context.licensedSourceProvenance).toMatchObject({
        exampleId: 'paper063-kissinger-beta-tp',
        citation: { doi: '10.3390/ma13245595' },
        sourceType: 'article-figure-transcription',
        separateDatasetLicense: { exists: false, identifier: null },
        printedPrecision: expect.stringContaining('1 K'),
        rounding: expect.stringContaining('rounded'),
      });
      expect(report.context.sourceFiles).toMatchObject([
        { sourceFileId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) },
      ]);
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      HTMLAnchorElement.prototype.click = originalAnchorClick;
    }
  });
});
