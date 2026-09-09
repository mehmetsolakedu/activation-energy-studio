import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import type { ActivationEnergyAnalysis, Diagnostic } from '../src/core/types';
import App from '../src/App';
import {
  createPdfReport,
  createProjectReport,
  groupDiagnosticsForPresentation,
} from '../src/report';
import { groupDisplayDiagnostics } from '../src/components/DiagnosticsList';
import syntheticCsv from '../examples/synthetic_kas_150.csv?raw';
import { confirmInterpretation, interpretationCheckbox } from './app-test-helpers';

const { analyzeActivationEnergyMock } = vi.hoisted(() => ({
  analyzeActivationEnergyMock: vi.fn(),
}));

vi.mock('../src/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core')>();
  return {
    ...actual,
    analyzeActivationEnergy: analyzeActivationEnergyMock,
  };
});

const warningDiagnostics: Diagnostic[] = [
  {
    code: 'LIMITED_HEATING_RATES',
    message: 'Only three distinct heating rates are available.',
    severity: 'warning',
  },
  {
    code: 'LOW_R2',
    message: 'Regression R2 is below the configured threshold.',
    severity: 'warning',
  },
  {
    code: 'NUMERICAL_DERIVATIVE',
    message: 'Derivative was estimated numerically from the curve.',
    severity: 'warning',
  },
  {
    code: 'MULTISTEP_EA_VARIATION',
    message: 'Apparent Ea varies strongly across alpha.',
    severity: 'warning',
  },
];

const warningAnalysis: ActivationEnergyAnalysis = {
  status: 'partial',
  preparedRuns: [],
  eligibility: {
    eligible: true,
    commonAlphaRange: [0.1, 0.9],
    distinctHeatingRates: 3,
    refusals: [],
    warnings: [],
  },
  methods: [],
  refusals: [],
  warnings: warningDiagnostics,
  constants: { gasConstantJPerMolK: 8.31446261815324 },
};

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

function pageContentStreams(binary: string): string {
  return [...binary.matchAll(/stream\r?\n([\s\S]*?)endstream/g)]
    .map((match) => match[1])
    .join('\n')
    .replace(/\\([()\\])/g, '$1');
}

describe('AC-UX-04 warning visibility contract', () => {
  it('collapses repeated user-facing codes without changing the underlying records', () => {
    const raw = [
      {
        code: 'LOW_R2',
        message: 'Same user-facing explanation.',
        severity: 'warning' as const,
      },
      {
        code: 'LOW_R2',
        message: 'Same user-facing explanation.',
        severity: 'warning' as const,
      },
      {
        code: 'NUMERICAL_DERIVATIVE',
        message: 'A different explanation.',
        severity: 'warning' as const,
      },
    ];

    expect(groupDisplayDiagnostics(raw)).toEqual([
      { ...raw[0], occurrenceCount: 2 },
      { ...raw[2], occurrenceCount: 1 },
    ]);
    expect(raw).toHaveLength(3);
  });

  it('summarizes repeated PDF warnings by code while retaining method and alpha scope', async () => {
    const repeated: Diagnostic[] = [
      {
        code: 'LOW_R2',
        message: 'FWO regression at alpha 0.1 is below threshold.',
        severity: 'warning',
        method: 'FWO',
        alpha: 0.1,
      },
      {
        code: 'LOW_R2',
        message: 'FWO regression at alpha 0.2 is below threshold.',
        severity: 'warning',
        method: 'FWO',
        alpha: 0.2,
      },
      {
        code: 'LOW_R2',
        message: 'KAS regression at alpha 0.2 is below threshold.',
        severity: 'warning',
        method: 'KAS',
        alpha: 0.2,
      },
    ];
    const groups = groupDiagnosticsForPresentation(repeated);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      code: 'LOW_R2',
      occurrences: 3,
      methods: ['FWO', 'KAS'],
      alphas: [0.1, 0.2],
      distinctMessages: 3,
    });

    const report = createProjectReport(
      { ...warningAnalysis, warnings: repeated },
      {
        projectName: 'Repeated warning presentation contract',
        sourceFiles: [
          { name: 'repeated-warning.csv', sizeBytes: 1, sha256: 'b'.repeat(64) },
        ],
      },
    );
    expect(report.analysis.warnings).toHaveLength(3);
    const pdf = createPdfReport(report);
    const binary = new TextDecoder('latin1').decode(await pdf.arrayBuffer());
    const pageTextOperators = pageContentStreams(binary);
    expect(pageTextOperators).toContain('Warnings (1 group / 3 records)');
    expect(pageTextOperators).toContain(
      'records=3 | methods=FWO, KAS | alpha=0.1, 0.2',
    );
  });

  it('renders all four warning codes and user-facing messages inside the App result card', async () => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    analyzeActivationEnergyMock.mockReturnValue(warningAnalysis);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      await act(async () => root.render(<App />));
      const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]');
      if (!fileInput) throw new Error('File input not found');
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [new File([syntheticCsv], 'warning-contract.csv', { type: 'text/csv' })],
      });
      await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
      const stageInput = host.querySelector<HTMLInputElement>('[data-testid="stage-label"]');
      if (!stageInput) throw new Error('Stage input not found');
      const stageSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!stageSetter) throw new Error('Native input value setter is unavailable');
      await act(async () => {
        stageSetter.call(stageInput, 'warning contract stage');
        stageInput.dispatchEvent(new Event('input', { bubbles: true }));
        stageInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      await waitUntil(
        () => interpretationCheckbox(host)?.disabled === false,
        'ready interpretation confirmation',
      );
      await confirmInterpretation(host);
      await act(async () => buttonContaining(host, 'Run eligible methods').click());

      const resultWarnings = host.querySelector<HTMLElement>('[data-testid="result-card-diagnostics"]');
      expect(resultWarnings).not.toBeNull();
      expect(host.querySelector('.results-panel')?.contains(resultWarnings)).toBe(true);
      expect(resultWarnings?.hidden).toBe(false);
      expect(resultWarnings?.getAttribute('aria-hidden')).not.toBe('true');

      const visibleWarnings = [...(resultWarnings?.querySelectorAll<HTMLElement>('.notice.warning') ?? [])]
        .map((notice) => ({
          code: notice.querySelector('strong')?.textContent,
          message: notice.querySelector('div')?.textContent,
        }));

      expect(visibleWarnings).toMatchInlineSnapshot(`
        [
          {
            "code": "LIMITED_HEATING_RATES",
            "message": "Problem: Only three distinct heating rates are available. Why it matters: Calculation is possible, but slope uncertainty remains weakly constrained. Action: Add independent runs, preferably over a wider heating-rate range.",
          },
          {
            "code": "LOW_R2",
            "message": "Problem: The regression R² is below the quality threshold. Why it matters: A single-slope kinetic relationship may not explain the data adequately. Action: Inspect the raw curves, stage boundaries, and influential runs, and report the result as limited evidence.",
          },
          {
            "code": "NUMERICAL_DERIVATIVE",
            "message": "Problem: The derivative was estimated numerically from raw data. Why it matters: Sampling frequency and noise can affect the Friedman result. Action: Compare Friedman with FWO, KAS, and Starink, and retain the derivative source in the report.",
          },
          {
            "code": "MULTISTEP_EA_VARIATION",
            "message": "Problem: Ea(alpha) varies strongly across conversion. Why it matters: A single mean Ea may conceal multistage behavior. Action: Report the Ea(alpha) profile with its method and alpha range; do not present one value as a material constant.",
          },
        ]
      `);
    } finally {
      await act(async () => root.unmount());
      host.remove();
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
      analyzeActivationEnergyMock.mockReset();
    }
  });

  it('draws the same four warning codes and messages as visible PDF page text', async () => {
    const report = createProjectReport(warningAnalysis, {
      projectName: 'AC-UX-04 warning visibility contract',
      sourceFiles: [{ name: 'warning-contract.csv', sizeBytes: 1, sha256: 'a'.repeat(64) }],
    });
    const pdf = createPdfReport(report);
    const binary = new TextDecoder('latin1').decode(await pdf.arrayBuffer());
    const pageTextOperators = pageContentStreams(binary);

    expect(pageTextOperators).toContain('Diagnostics');
    expect(pageTextOperators).toContain('Warnings (4)');
    const visibleWarningLines = warningDiagnostics.map((diagnostic, index) => {
      const expected = `${index + 1}. [${diagnostic.code}] ${diagnostic.message}`;
      expect(pageTextOperators).toContain(expected);
      return expected;
    });

    expect(visibleWarningLines).toMatchInlineSnapshot(`
      [
        "1. [LIMITED_HEATING_RATES] Only three distinct heating rates are available.",
        "2. [LOW_R2] Regression R2 is below the configured threshold.",
        "3. [NUMERICAL_DERIVATIVE] Derivative was estimated numerically from the curve.",
        "4. [MULTISTEP_EA_VARIATION] Apparent Ea varies strongly across alpha.",
      ]
    `);
  });
});
