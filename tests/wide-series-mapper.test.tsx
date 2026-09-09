import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MappingWizard } from '../src/components/MappingWizard';
import {
  WideSeriesMapper,
  wideSeriesDefinitionsComplete,
} from '../src/components/WideSeriesMapper';
import type {
  BatchIngestionResult,
  IngestionOptions,
  IngestionResult,
  MappingNeed,
  WideSeriesDefinition,
} from '../src/io';

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};

function seriesDefinition(
  index: number,
  context: WideSeriesDefinition['context'] = {
    sample: 'RH',
    atmosphere: 'N2',
    stage: 'main decomposition',
  },
): WideSeriesDefinition {
  return {
    seriesId: `series-${index + 1}`,
    runId: `run-${index + 1}`,
    temperature: { columnIndex: index * 4, unit: 'C' },
    signal: {
      kind: 'massPercent',
      columnIndex: (index * 4) + 1,
      unit: '%',
      alphaReference: { initialValue: 100, finalValue: 0 },
    },
    derivative: {
      semantic: 'massLossRate',
      temperatureColumn: { columnIndex: (index * 4) + 2, unit: 'C' },
      valueColumnIndex: (index * 4) + 3,
      unit: '%/min',
    },
    heatingRate: { value: 5 * (index + 1), unit: 'K/min' },
    context,
  };
}

function unresolvedFile(mappingNeeds: MappingNeed[], headers = ['T', 'TG', 'T DTG', 'DTG']): IngestionResult {
  return {
    status: 'needs_mapping',
    source: {
      fileName: 'raw-series.xlsx',
      fileType: 'xlsx',
      sheetName: 'Fig.2.',
    },
    headers,
    preview: [
      [100, 99.8, 100, 0.01],
      [110, 99.2, 110, 0.02],
    ],
    mappings: [],
    candidates: [],
    mappingNeeds,
    diagnostics: [],
    records: [],
    tables: { tAlphaBeta: [], betaTp: [] },
  };
}

function batch(file: IngestionResult): BatchIngestionResult {
  return {
    status: 'needs_mapping',
    files: [file],
    diagnostics: [],
    records: [],
    tables: { tAlphaBeta: [], betaTp: [] },
  };
}

describe('wide-series mapping UI', () => {
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

  it('keeps derivative semantics explicit and distinguishes -dm/dt from signed dm/dt', () => {
    const html = renderToStaticMarkup(
      <WideSeriesMapper
        headers={['T', 'TG', 'T DTG', 'DTG', 'Not']}
        populatedColumns={[{
          columnIndex: 4,
          header: 'Not',
          populatedRowCount: 1,
          firstSourceRow: 4,
          lastSourceRow: 4,
        }]}
        preview={[[100, 99.8, 100, 0.01, 'out of scope']]}
        scopeConfirmed={false}
        series={[seriesDefinition(0)]}
        onScopeConfirmedChange={() => undefined}
        onSeriesChange={() => undefined}
      />,
    );

    expect(html).toContain('is not inferred automatically');
    expect(html).toContain('Direct dα/dt');
    expect(html).toContain('Positive mass-loss rate (−dm/dt)');
    expect(html).toContain('Signed mass-change rate (dm/dt)');
    expect(html).toContain('Experimental context shared by all series');
    expect(html).toContain('Add series');
    expect(html).toContain('Remove this series');
    expect(html).toContain('Analysis scope confirmation');
    expect(html).toContain('Populated columns found in the full source table but not selected');
    expect(html).toContain('5. Not (');
    expect(html).toContain('source rows 4–4');
    for (const testId of [
      'wide-series-id-0',
      'wide-run-id-0',
      'wide-temperature-column-0',
      'wide-temperature-unit-0',
      'wide-signal-column-0',
      'wide-signal-unit-0',
      'wide-alpha-initial-0',
      'wide-alpha-final-0',
      'wide-heating-rate-0',
      'wide-heating-rate-unit-0',
      'wide-derivative-value-column-0',
      'wide-derivative-temperature-enabled-0',
      'wide-derivative-temperature-column-0',
      'wide-derivative-temperature-unit-0',
      'wide-derivative-unit-0',
      'wide-sample-0',
      'wide-atmosphere-0',
      'wide-stage-0',
      'wide-remove-series-0',
    ]) {
      expect(html).toContain(`data-testid="${testId}"`);
    }
  });

  it('requires a complete explicit definition before mapping can be applied', () => {
    const complete = seriesDefinition(0);
    expect(wideSeriesDefinitionsComplete([complete], 4)).toBe(true);
    expect(wideSeriesDefinitionsComplete([
      { ...complete, context: { ...complete.context, stage: '' } },
    ], 4)).toBe(false);
    expect(wideSeriesDefinitionsComplete([
      {
        ...complete,
        derivative: {
          semantic: 'massChangeRate',
          valueColumnIndex: 3,
          unit: 'mg/min',
        },
      },
    ], 4)).toBe(false);
    expect(wideSeriesDefinitionsComplete([
      { ...complete, signal: { ...complete.signal, columnIndex: 0 } },
    ], 4)).toBe(false);
  });

  it('applies a common context value to every series without inferring it', async () => {
    let changed: readonly WideSeriesDefinition[] = [];
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <WideSeriesMapper
          headers={['T1', 'TG1', 'Td1', 'D1', 'T2', 'TG2', 'Td2', 'D2']}
          preview={[[100, 99, 100, 1, 100, 99, 100, 1]]}
          scopeConfirmed={false}
          series={[
            seriesDefinition(0, { sample: 'A', atmosphere: 'N2', stage: 'S1' }),
            seriesDefinition(1, { sample: 'B', atmosphere: 'N2', stage: 'S1' }),
          ]}
          onScopeConfirmedChange={() => undefined}
          onSeriesChange={(next) => {
            changed = next;
          }}
        />,
      );
    });

    const commonSample = host.querySelector<HTMLInputElement>('[data-testid="wide-common-sample"]');
    if (!commonSample) throw new Error('Common sample input not found');
    expect(commonSample.value).toBe('');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!setter) throw new Error('Native input value setter is unavailable');
      setter.call(commonSample, 'RH');
      commonSample.dispatchEvent(new Event('input', { bubbles: true }));
      commonSample.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(changed).toHaveLength(2);
    expect(changed.every((definition) => definition.context.sample === 'RH')).toBe(true);
    await act(async () => root.unmount());
  });

  it('forces header-row recovery before layout and series mapping', () => {
    const ingestion = batch(unresolvedFile([
      {
        kind: 'sheet',
        message: 'Select the sheet.',
        allowedValues: ['Fig.2.'],
      },
      {
        kind: 'header_row',
        message: 'Select the real header row.',
        allowedValues: ['0', '1', '2'],
      },
    ], ['Column 1', 'Column 2', 'Column 3', 'Column 4']));
    const html = renderToStaticMarkup(
      <MappingWizard
        ingestion={ingestion}
        optionsByFile={[{}]}
        isBusy={false}
        onApply={() => undefined}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain('Select the actual header row first');
    expect(html).toContain('Apply header row and reread');
    expect(html).toContain('data-testid="header-row-input"');
    expect(html).toContain('data-testid="sheet-select"');
    expect(html).toContain('data-testid="apply-mapping"');
    expect(html).not.toContain('Wide series — runs are in side-by-side columns');
    expect(html).not.toContain('wide-series-mapper');
  });

  it('shows the wide mapper, hides long roles, and resets scope when a series changes', async () => {
    const ingestion = batch(unresolvedFile([
      { kind: 'column', role: 'temperature', message: 'Select temperature.' },
      { kind: 'unit', role: 'temperature', message: 'Select temperature unit.' },
      { kind: 'wide_series', message: 'Map each series.' },
      { kind: 'scope_confirmation', message: 'Confirm excluded columns.' },
    ]));
    let changed: IngestionOptions | undefined;
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <MappingWizard
          ingestion={ingestion}
          optionsByFile={[{
            layout: 'wide-series',
            headerRow: 2,
            decimalSeparator: '.',
            wideSeries: [seriesDefinition(0)],
            wideScopeConfirmed: true,
          }]}
          isBusy={false}
          onApply={() => undefined}
          onChange={(_, options) => {
            changed = options;
          }}
        />,
      );
    });

    expect(host.querySelector('[data-testid="wide-series-mapper"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="decimal-separator"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="apply-mapping"]')).not.toBeNull();
    expect(host.querySelector('.mapping-role:not(.wide-series-definition)')).toBeNull();
    const addButton = host.querySelector<HTMLButtonElement>('[data-testid="wide-add-series"]');
    if (!addButton) throw new Error('Add-series button not found');
    await act(async () => addButton.click());

    expect(changed?.wideSeries).toHaveLength(2);
    expect(changed?.wideScopeConfirmed).toBe(false);
    await act(async () => root.unmount());
  });

  it('enables apply only when the wide definition is complete and scope is confirmed', async () => {
    const ingestion = batch(unresolvedFile([
      { kind: 'wide_series', message: 'Map each series.' },
      { kind: 'scope_confirmation', message: 'Confirm excluded columns.' },
    ]));
    let applyCount = 0;

    function Harness() {
      const [options, setOptions] = useState<IngestionOptions>({
        layout: 'wide-series',
        headerRow: 2,
        decimalSeparator: '.',
        wideSeries: [seriesDefinition(0)],
        wideScopeConfirmed: false,
      });
      return (
        <MappingWizard
          ingestion={ingestion}
          optionsByFile={[options]}
          isBusy={false}
          onApply={() => {
            applyCount += 1;
          }}
          onChange={(_, next) => setOptions(next)}
        />
      );
    }

    const root = createRoot(host);
    await act(async () => root.render(<Harness />));
    const apply = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Validate selections'));
    if (!apply) throw new Error('Mapping apply button not found');
    expect(apply.disabled).toBe(true);

    const scope = host.querySelector<HTMLInputElement>('[data-testid="wide-scope-confirmed"]');
    if (!scope) throw new Error('Scope-confirmation checkbox not found');
    await act(async () => scope.click());
    expect(apply.disabled).toBe(false);
    await act(async () => apply.click());
    expect(applyCount).toBe(1);

    const decimal = [...host.querySelectorAll<HTMLLabelElement>('label')]
      .find((label) => label.textContent?.includes('Decimal separator'))
      ?.querySelector<HTMLSelectElement>('select');
    if (!decimal) throw new Error('Decimal-separator selector not found');
    await act(async () => {
      decimal.value = ',';
      decimal.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(apply.disabled).toBe(true);
    expect(host.querySelector<HTMLInputElement>('[data-testid="wide-scope-confirmed"]')?.checked)
      .toBe(false);

    await act(async () => root.unmount());
  });
});
