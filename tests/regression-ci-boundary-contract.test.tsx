import { act } from 'react';
import { createRoot } from 'react-dom/client';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';

import App from '../src/App';
import {
  REGRESSION_CI_CLAIM_BOUNDARY,
  createPdfReport,
  createResultsCsv,
  serializeProjectReport,
} from '../src/report';
import { makeSchemaV6QaReport } from './helpers/report-fixture';

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };

describe('AC-REG-03 regression-only confidence boundary', () => {
  it('renders the exact standard technical English boundary in the UI', async () => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      await act(async () => root.render(<App />));
      const boundary = host.querySelector<HTMLElement>('[data-testid="regression-ci-claim-boundary"]');
      expect(boundary).not.toBeNull();
      expect(boundary?.textContent?.trim()).toBe(REGRESSION_CI_CLAIM_BOUNDARY);
      expect(REGRESSION_CI_CLAIM_BOUNDARY).toContain('95% confidence interval');
      expect(REGRESSION_CI_CLAIM_BOUNDARY).toContain('within-heating-rate replicate variability');
      expect(REGRESSION_CI_CLAIM_BOUNDARY).toContain('calibration uncertainty');
      expect(REGRESSION_CI_CLAIM_BOUNDARY).toContain('anchor uncertainty');
      expect(REGRESSION_CI_CLAIM_BOUNDARY).toContain('baseline uncertainty');
      expect(REGRESSION_CI_CLAIM_BOUNDARY).toContain('derivative-method uncertainty');
    } finally {
      await act(async () => root.unmount());
      host.remove();
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
    }
  });

  it('serializes the exact boundary in JSON and keeps the tidy CSV aligned', async () => {
    const report = await makeSchemaV6QaReport();
    const parsedJson = JSON.parse(serializeProjectReport(report)) as typeof report;
    expect(parsedJson.scientificBoundary.regressionConfidenceInterval).toBe(
      REGRESSION_CI_CLAIM_BOUNDARY,
    );
    expect(parsedJson.results.length).toBeGreaterThan(0);
    expect(
      parsedJson.results.every(
        (result) => result.confidenceBoundary === REGRESSION_CI_CLAIM_BOUNDARY,
      ),
    ).toBe(true);

    const parsedCsv = Papa.parse<Record<string, string>>(createResultsCsv(report), {
      header: true,
      skipEmptyLines: true,
    });
    expect(parsedCsv.errors).toEqual([]);
    expect(parsedCsv.meta.fields).toContain('confidenceBoundary');
    expect(
      parsedCsv.data.every(
        (result) => result.confidenceBoundary === REGRESSION_CI_CLAIM_BOUNDARY,
      ),
    ).toBe(true);
  });

  it('embeds the same scope and all four explicit exclusions in the PDF', async () => {
    const report = await makeSchemaV6QaReport();
    const pdf = createPdfReport(report);
    const binary = new TextDecoder('latin1').decode(await pdf.arrayBuffer());
    const unescapedPdfLiterals = binary.replace(/\\([()\\])/g, '$1');
    const [scopeStatement, exclusionStatement] = REGRESSION_CI_CLAIM_BOUNDARY.split('; ');

    expect(unescapedPdfLiterals).toContain(`${scopeStatement};`);
    expect(unescapedPdfLiterals).toContain(exclusionStatement);
    for (const exclusion of [
      'calibration uncertainty',
      'anchor uncertainty',
      'baseline uncertainty',
      'derivative-method uncertainty',
    ]) {
      expect(unescapedPdfLiterals, exclusion).toContain(exclusion);
    }
  });
});
