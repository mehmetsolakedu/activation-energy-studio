import { useEffect, useMemo, useState } from 'react';

import type {
  BatchIngestionResult,
  ColumnMapping,
  ColumnRole,
  ColumnSelection,
  ColumnUnit,
  IngestionOptions,
  IngestionResult,
  MappingNeed,
  TableKind,
} from '../io';
import {
  WideSeriesMapper,
  wideSeriesDefinitionsComplete,
} from './WideSeriesMapper';

const ROLE_LABELS: Record<ColumnRole, string> = {
  temperature: 'Temperature',
  time: 'Time (optional)',
  mass: 'Mass (optional)',
  massPercent: 'Mass percentage (optional)',
  alpha: 'Conversion α (optional)',
  dAlphaDt: 'Conversion rate dα/dt (optional)',
  heatingRate: 'Heating rate β',
  run: 'Run identifier (optional)',
  sample: 'Sample (optional)',
  atmosphere: 'Atmosphere (optional)',
  stage: 'Reaction stage (recommended)',
  peakResolved: 'Peak identity resolved',
  peakQuality: 'Peak quality classification',
  peakSourceSignal: 'Peak source signal',
  peakAnalystConfirmed: 'Peak confirmed by analyst',
  peakAmbiguous: 'Legacy peak ambiguity flag',
};

const ROLE_UNITS: Partial<Record<ColumnRole, readonly ColumnUnit[]>> = {
  temperature: ['C', 'K'],
  time: ['s', 'min'],
  mass: ['mg', 'g'],
  massPercent: ['%', 'fraction'],
  alpha: ['fraction', '%'],
  dAlphaDt: ['min^-1', 's^-1', '%/min', '%/s'],
  heatingRate: ['K/min', 'C/min', 'K/s', 'C/s'],
};

const ROLE_ORDER: readonly ColumnRole[] = [
  'temperature',
  'alpha',
  'dAlphaDt',
  'mass',
  'massPercent',
  'heatingRate',
  'time',
  'run',
  'sample',
  'atmosphere',
  'stage',
  'peakResolved',
  'peakQuality',
  'peakSourceSignal',
  'peakAnalystConfirmed',
  'peakAmbiguous',
];

const TABLE_KIND_LABELS: Record<TableKind, string> = {
  auto: 'Automatic detection',
  curve: 'TGA/DTG curve',
  't-alpha-beta': 'T–α–β isoconversional table',
  'beta-tp': 'β–Tp peak table (Kissinger)',
};

interface MappingWizardProps {
  ingestion: BatchIngestionResult;
  optionsByFile: readonly IngestionOptions[];
  isBusy: boolean;
  allowReady?: boolean;
  onChange: (fileIndex: number, options: IngestionOptions) => void;
  onApply: () => void;
}

function selectionColumn(selection: ColumnSelection | undefined): number | undefined {
  if (typeof selection === 'number') return selection;
  if (typeof selection === 'object' && typeof selection.column === 'number') return selection.column;
  return undefined;
}

function selectionUnit(selection: ColumnSelection | undefined): ColumnUnit | undefined {
  return typeof selection === 'object' ? selection.unit : undefined;
}

function selectionTemperatureKind(
  selection: ColumnSelection | undefined,
): ColumnMapping['temperatureKind'] {
  return typeof selection === 'object' ? selection.temperatureKind : undefined;
}

function automaticMapping(result: IngestionResult, role: ColumnRole): ColumnMapping | undefined {
  return result.mappings.find((mapping) => mapping.role === role);
}

function selectedColumn(
  result: IngestionResult,
  options: IngestionOptions,
  role: ColumnRole,
): number | undefined {
  if (
    options.columnMapping?.[role] === undefined
    && options.ignoredRoles?.includes(role)
  ) {
    return undefined;
  }
  return selectionColumn(options.columnMapping?.[role]) ?? automaticMapping(result, role)?.columnIndex;
}

function selectedUnit(
  result: IngestionResult,
  options: IngestionOptions,
  role: ColumnRole,
): ColumnUnit | undefined {
  const explicit = options.columnMapping?.[role];
  if (explicit !== undefined) return selectionUnit(explicit);
  return automaticMapping(result, role)?.unit;
}

function needText(need: MappingNeed): string {
  const role = need.role ? ROLE_LABELS[need.role] : undefined;
  switch (need.kind) {
    case 'sheet':
      return 'The file contains multiple worksheets. Select the sheet to analyze.';
    case 'header_row':
      return 'Explicitly select the row containing the actual column headers.';
    case 'layout':
      return 'Select whether the data use a long table or side-by-side series layout.';
    case 'wide_series':
      return 'Complete temperature, signal, rate, and experimental context for each side-by-side series.';
    case 'scope_confirmation':
      return 'Confirm that populated columns not included in the analysis are out of scope.';
    case 'decimal_separator':
      return 'The decimal separator is mixed or ambiguous. Explicitly choose comma or period.';
    case 'table_kind':
      return 'Specify whether the two-column table is a curve or a Kissinger peak table.';
    case 'unit':
      return `The unit for ${role ?? 'the numeric column'} could not be read safely from the header. Select it explicitly.`;
    case 'column':
      return role
        ? `Explicitly select the ${role} column.`
        : 'Select at least one α, mass, or mass-percentage signal column.';
  }
}

function needAppliesToLayout(
  need: MappingNeed,
  layout: 'long' | 'wide-series' | undefined,
): boolean {
  if (layout === 'wide-series') {
    return need.kind !== 'column'
      && need.kind !== 'unit'
      && need.kind !== 'table_kind';
  }
  if (layout === 'long') {
    return need.kind !== 'wide_series' && need.kind !== 'scope_confirmation';
  }
  return true;
}

function needResolved(
  result: IngestionResult,
  options: IngestionOptions,
  need: MappingNeed,
): boolean {
  switch (need.kind) {
    case 'sheet':
      return options.sheet !== undefined && options.sheet !== '';
    case 'header_row':
      return Number.isInteger(options.headerRow) && (options.headerRow as number) >= 0;
    case 'layout':
      return options.layout === 'long' || options.layout === 'wide-series';
    case 'wide_series':
      return options.layout === 'wide-series'
        && wideSeriesDefinitionsComplete(options.wideSeries, result.headers.length);
    case 'scope_confirmation':
      return options.layout === 'wide-series' && options.wideScopeConfirmed === true;
    case 'decimal_separator':
      return options.decimalSeparator === '.' || options.decimalSeparator === ',';
    case 'table_kind':
      return options.tableKind !== undefined && options.tableKind !== 'auto';
    case 'unit':
      return need.role !== undefined && selectedUnit(result, options, need.role) !== undefined;
    case 'column':
      if (need.role === 'heatingRate') {
        return selectedColumn(result, options, 'heatingRate') !== undefined
          || (options.defaults?.heatingRate?.value ?? 0) > 0;
      }
      if (need.role !== undefined) return selectedColumn(result, options, need.role) !== undefined;
      return ['alpha', 'mass', 'massPercent']
        .some((role) => selectedColumn(result, options, role as ColumnRole) !== undefined);
  }
}

function mappingDescriptor(
  result: IngestionResult,
  options: IngestionOptions,
  role: ColumnRole,
  columnIndex: number,
  unitOverride?: ColumnUnit | null,
): Exclude<ColumnSelection, number | string> {
  const previousColumnIndex = selectedColumn(result, options, role);
  const sameColumn = previousColumnIndex === columnIndex;
  const explicit = options.columnMapping?.[role];
  const existing = automaticMapping(result, role);
  const matchingAutomatic = existing?.columnIndex === columnIndex ? existing : undefined;
  const unit = unitOverride === null
    ? undefined
    : unitOverride ?? (sameColumn ? selectedUnit(result, options, role) : undefined);
  const temperatureKind = sameColumn
    ? selectionTemperatureKind(explicit) ?? matchingAutomatic?.temperatureKind
    : undefined;
  return {
    column: columnIndex,
    ...(unit === undefined ? {} : { unit }),
    ...(role === 'temperature' && temperatureKind !== undefined
      ? { temperatureKind }
      : {}),
  };
}

function previewValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (value instanceof Date) return value.toLocaleString('en-US');
  return String(value);
}

export function MappingWizard({
  ingestion,
  optionsByFile,
  isBusy,
  allowReady = false,
  onChange,
  onApply,
}: MappingWizardProps) {
  const roleLabels = ROLE_LABELS;
  const tableKindLabels = TABLE_KIND_LABELS;
  const firstUnresolved = Math.max(0, ingestion.files.findIndex((file) => file.status !== 'ready'));
  const [activeIndex, setActiveIndex] = useState(firstUnresolved);

  useEffect(() => {
    const next = ingestion.files.findIndex((file) => file.status !== 'ready');
    if (next >= 0) setActiveIndex(next);
  }, [ingestion]);

  const result = ingestion.files[activeIndex] ?? ingestion.files[0];
  const options = optionsByFile[activeIndex] ?? {};
  const unresolvedCount = ingestion.files.filter((file) => file.status !== 'ready').length;
  const needsHeaderReload = result?.mappingNeeds.some((need) => need.kind === 'header_row') ?? false;
  const layoutSelectionRequired = result?.mappingNeeds.some((need) => need.kind === 'layout') ?? false;
  const effectiveLayout = options.layout
    ?? (layoutSelectionRequired ? undefined : 'long');
  const duplicateSelections = useMemo(() => {
    if (!result || effectiveLayout === 'wide-series') return new Set<number>();
    const counts = new Map<number, number>();
    for (const role of ROLE_ORDER) {
      const column = selectedColumn(result, options, role);
      if (column !== undefined) counts.set(column, (counts.get(column) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, count]) => count > 1).map(([column]) => column));
  }, [effectiveLayout, options, result]);
  const visibleMappingNeeds = result
    ? result.mappingNeeds.filter((need) => needAppliesToLayout(need, effectiveLayout))
    : [];
  const unresolvedNeeds = result
    ? visibleMappingNeeds.filter((need) => !needResolved(result, options, need))
    : [];
  const missingExplicitUnits = result
    ? ROLE_ORDER.filter((role) => (
        ROLE_UNITS[role] !== undefined
        && options.columnMapping?.[role] !== undefined
        && selectedColumn(result, options, role) !== undefined
        && selectedUnit(result, options, role) === undefined
      ))
    : [];
  const wideDefinitionIncomplete = effectiveLayout === 'wide-series'
    && !wideSeriesDefinitionsComplete(options.wideSeries, result?.headers.length ?? 0);
  const wideScopeIncomplete = effectiveLayout === 'wide-series'
    && options.wideScopeConfirmed !== true;

  if (
    !result
    || (ingestion.status !== 'needs_mapping' && !(allowReady && ingestion.status === 'ready'))
  ) {
    return null;
  }
  const editingReadyMapping = ingestion.status === 'ready';

  function patchOptions(patch: Partial<IngestionOptions>) {
    onChange(activeIndex, { ...options, ...patch });
  }

  function setRoleColumn(role: ColumnRole, rawValue: string) {
    const nextMapping = { ...(options.columnMapping ?? {}) };
    const nextIgnoredRoles = new Set(options.ignoredRoles ?? []);
    if (rawValue === '') {
      delete nextMapping[role];
      if (role !== 'temperature' && role !== 'heatingRate') nextIgnoredRoles.add(role);
    } else {
      const columnIndex = Number(rawValue);
      nextMapping[role] = mappingDescriptor(result, options, role, columnIndex);
      nextIgnoredRoles.delete(role);
    }
    patchOptions({
      columnMapping: nextMapping,
      ignoredRoles: [...nextIgnoredRoles],
    });
  }

  function setRoleUnit(role: ColumnRole, rawValue: string) {
    const columnIndex = selectedColumn(result, options, role);
    if (columnIndex === undefined) return;
    const nextMapping = { ...(options.columnMapping ?? {}) };
    nextMapping[role] = mappingDescriptor(
      result,
      options,
      role,
      columnIndex,
      rawValue === '' ? null : (rawValue as ColumnUnit),
    );
    patchOptions({ columnMapping: nextMapping });
  }

  function setDefaultRate(rawValue: string) {
    const value = Number(rawValue.replace(',', '.'));
    const previousUnit = options.defaults?.heatingRate?.unit ?? 'K/min';
    patchOptions({
      defaults: {
        ...(options.defaults ?? {}),
        ...(Number.isFinite(value) && value > 0
          ? { heatingRate: { value, unit: previousUnit } }
          : { heatingRate: undefined }),
      },
    });
  }

  return (
    <section className="mapping-wizard" aria-labelledby="mapping-title">
      <div className="mapping-heading">
        <div>
          <p className="mapping-kicker">
            {'Guided data mapping'}
          </p>
          <h3 id="mapping-title">
            {'You verify uncertainty; the software must not guess'}
          </h3>
          <p>
            {editingReadyMapping
              ? 'You can inspect the ready file’s automatic mapping and explicitly exclude an optional column.'
              : `${unresolvedCount} files require a selection. Each choice applies only to the active file and is validated when the file is read again.`}
          </p>
        </div>
        {ingestion.files.length > 1 && (
          <label className="compact-field">
            {'Active file'}
            <select value={activeIndex} onChange={(event) => setActiveIndex(Number(event.target.value))}>
              {ingestion.files.map((file, index) => (
                <option key={`${file.source.fileName}-${index}`} value={index}>
                  {file.status === 'ready' ? '✓ ' : '• '}{file.source.fileName}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="mapping-needs" aria-live="polite">
        {visibleMappingNeeds.map((need, index) => (
          <div key={`${need.kind}-${need.role ?? 'general'}-${index}`}>
            <strong>{index + 1}</strong>
            <span>{needText(need)}</span>
          </div>
        ))}
      </div>

      {result.mappingNeeds.some((need) => need.kind === 'sheet') && (
        <div className="mapping-controls one-column">
          <label>
            {'XLSX worksheet'}
            <select
              data-testid="sheet-select"
              value={String(options.sheet ?? '')}
              onChange={(event) => patchOptions({
                sheet: event.target.value || undefined,
                wideScopeConfirmed: false,
              })}
            >
              <option value="">{'Select a sheet…'}</option>
              {(result.source.availableSheets ?? []).map((sheet) => <option key={sheet}>{sheet}</option>)}
            </select>
          </label>
        </div>
      )}

      {needsHeaderReload && (
        <div className="mapping-controls one-column" data-testid="header-row-step">
          <label>
            {'Select the actual header row first'}
            <input
              data-testid="header-row-input"
              min="1"
              type="number"
              value={options.headerRow === undefined ? '' : options.headerRow + 1}
              onChange={(event) => {
                const value = Number(event.target.value);
                patchOptions({
                  headerRow: Number.isInteger(value) && value >= 1 ? value - 1 : undefined,
                  wideScopeConfirmed: false,
                });
              }}
            />
          </label>
          <small>
            {'The row number is the visible number in the source file. After applying this choice, layout and series mapping open with the actual column names.'}
          </small>
        </div>
      )}

      {result.headers.length > 0 && !needsHeaderReload && (
        <>
          <div className="mapping-controls">
            <label>
              {'Data layout'}
              <select
                data-testid="table-layout"
                value={effectiveLayout ?? ''}
                onChange={(event) => {
                  const layout = event.target.value as 'long' | 'wide-series';
                  patchOptions({
                    layout,
                    ...(layout === 'wide-series' ? { tableKind: 'curve' as const } : {}),
                    wideScopeConfirmed: false,
                  });
                }}
              >
                {layoutSelectionRequired && (
                  <option value="">{'Select a layout…'}</option>
                )}
                <option value="long">
                  {'Long table — rows share common columns'}
                </option>
                <option value="wide-series">
                  {'Wide series — runs are in side-by-side columns'}
                </option>
              </select>
            </label>
            <label>
              {'Decimal separator'}
              <select
                data-testid="decimal-separator"
                value={options.decimalSeparator ?? result.source.decimalSeparator ?? 'auto'}
                onChange={(event) => patchOptions({
                  decimalSeparator: event.target.value as 'auto' | '.' | ',',
                  wideScopeConfirmed: false,
                })}
              >
                <option value="auto">{'Automatic'}</option>
                <option value=",">{'Comma (12,5)'}</option>
                <option value=".">{'Period (12.5)'}</option>
              </select>
            </label>
            <label>
              {'Header row'}
              <input
                data-testid="header-row-input"
                min="1"
                type="number"
                value={(options.headerRow ?? 0) + 1}
                onChange={(event) => patchOptions({
                  headerRow: Math.max(0, Number(event.target.value) - 1),
                  wideScopeConfirmed: false,
                })}
              />
            </label>
            {effectiveLayout === 'long' && (
              <label>
                {'Table type'}
                <select
                  value={options.tableKind ?? 'auto'}
                  onChange={(event) => patchOptions({ tableKind: event.target.value as TableKind })}
                >
                  {Object.entries(tableKindLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {effectiveLayout === 'long' && (
            <>
              <div className="mapping-role-grid">
                {ROLE_ORDER.map((role) => {
                  const column = selectedColumn(result, options, role);
                  const units = ROLE_UNITS[role];
                  return (
                    <div className="mapping-role" key={role}>
                      <label>
                        {roleLabels[role]}
                        <select value={column ?? ''} onChange={(event) => setRoleColumn(role, event.target.value)}>
                          <option value="">
                            {role === 'temperature' || role === 'heatingRate'
                              ? 'Select…'
                              : 'Do not use'}
                          </option>
                          {result.headers.map((header, index) => (
                            <option key={`${header}-${index}`} value={index}>
                              {index + 1}. {header || '(no header)'}
                            </option>
                          ))}
                        </select>
                      </label>
                      {units && column !== undefined && (
                        <label>
                          {'Unit'}
                          <select value={selectedUnit(result, options, role) ?? ''} onChange={(event) => setRoleUnit(role, event.target.value)}>
                            <option value="">{'Select a unit…'}</option>
                            {units.map((unit) => <option key={unit}>{unit}</option>)}
                          </select>
                        </label>
                      )}
                      {column !== undefined && duplicateSelections.has(column) && (
                        <small className="field-error">
                          {'This column is assigned to more than one role.'}
                        </small>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="notice info">
                {'A generic DTG or dm/dt mass-rate column is not automatically treated as dα/dt. Select only a column confirmed to be a conversion rate and explicitly specify its fraction/% and time units.'}
              </div>

              {selectedColumn(result, options, 'heatingRate') === undefined && (
                <div className="default-rate-box">
                  <div>
                    <strong>{'No heating-rate column?'}</strong>
                    <span>
                      {'Enter this file’s fixed rate and unit.'}
                    </span>
                  </div>
                  <label>
                    {'Rate'}
                    <input
                      inputMode="decimal"
                      placeholder={'E.g. 10'}
                      value={options.defaults?.heatingRate?.value ?? ''}
                      onChange={(event) => setDefaultRate(event.target.value)}
                    />
                  </label>
                  <label>
                    {'Unit'}
                    <select
                      value={options.defaults?.heatingRate?.unit ?? 'K/min'}
                      onChange={(event) => {
                        const current = options.defaults?.heatingRate;
                        if (!current) return;
                        patchOptions({
                          defaults: {
                            ...(options.defaults ?? {}),
                            heatingRate: { ...current, unit: event.target.value as 'K/min' | 'C/min' | 'K/s' | 'C/s' },
                          },
                        });
                      }}
                    >
                      {ROLE_UNITS.heatingRate?.map((unit) => <option key={unit}>{unit}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </>
          )}

          {effectiveLayout === 'wide-series' && (
            <WideSeriesMapper
              headers={result.headers}
              populatedColumns={result.populatedColumns}
              preview={result.preview}
              scopeConfirmed={options.wideScopeConfirmed === true}
              series={options.wideSeries ?? []}
              onScopeConfirmedChange={(confirmed) => patchOptions({
                wideScopeConfirmed: confirmed,
              })}
              onSeriesChange={(wideSeries) => patchOptions({
                wideSeries,
                wideScopeConfirmed: false,
              })}
            />
          )}

          <div className="preview-wrap">
            <table>
              <caption>
                {`Source preview — first ${result.preview.length} data rows`}
              </caption>
              <thead><tr>{result.headers.map((header, index) => <th key={`${header}-${index}`}>{index + 1}. {header || '(no header)'}</th>)}</tr></thead>
              <tbody>
                {result.preview.map((row, rowIndex) => (
                  <tr key={rowIndex}>{result.headers.map((_, columnIndex) => <td key={columnIndex}>{previewValue(row[columnIndex])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mapping-actions">
        <div>
          <p>
            {needsHeaderReload
              ? 'The header selection rereads the table from the correct row without changing the source file.'
              : 'Selections do not change the source file; they are traceable import settings for this analysis session only.'}
          </p>
          {unresolvedNeeds.length > 0 && (
            <small className="field-error" role="status">
              {`Complete ${unresolvedNeeds.length} required selections before validation.`}
            </small>
          )}
          {missingExplicitUnits.length > 0 && (
            <small className="field-error" data-testid="mapping-unit-required" role="status">
              {`Explicitly confirm the unit for remapped ${missingExplicitUnits.map((role) => roleLabels[role]).join(', ')}.`}
            </small>
          )}
          {(wideDefinitionIncomplete || wideScopeIncomplete) && (
            <small className="field-error" role="status">
              {'Wide-series validation requires both complete series definitions and explicit scope confirmation.'}
            </small>
          )}
        </div>
        <button
          className="primary-button"
          data-testid="apply-mapping"
          disabled={
            isBusy
            || duplicateSelections.size > 0
            || unresolvedNeeds.length > 0
            || missingExplicitUnits.length > 0
            || wideDefinitionIncomplete
            || wideScopeIncomplete
          }
          onClick={onApply}
          type="button"
        >
          {isBusy
            ? 'Validating…'
            : needsHeaderReload
              ? 'Apply header row and reread'
              : 'Validate selections and reread'}
        </button>
      </div>
    </section>
  );
}
