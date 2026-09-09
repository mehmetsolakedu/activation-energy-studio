import type {
  AlphaDerivativeUnit,
  AlphaUnit,
  ColumnCandidate,
  ColumnDetectionResult,
  ColumnMapping,
  ColumnRole,
  ColumnSelection,
  ColumnUnit,
  HeatingRateUnit,
  IngestionOptions,
  MappingNeed,
  MassPercentUnit,
  MassUnit,
  TemperatureKind,
  TemperatureUnit,
  TimeUnit,
} from './types';

const NUMERIC_ROLES: ColumnRole[] = [
  'temperature',
  'time',
  'mass',
  'massPercent',
  'alpha',
  'dAlphaDt',
  'heatingRate',
];

const ROLE_UNITS: Partial<Record<ColumnRole, readonly ColumnUnit[]>> = {
  temperature: ['K', 'C'] satisfies TemperatureUnit[],
  time: ['s', 'min'] satisfies TimeUnit[],
  mass: ['mg', 'g'] satisfies MassUnit[],
  massPercent: ['%', 'fraction'] satisfies MassPercentUnit[],
  alpha: ['fraction', '%'] satisfies AlphaUnit[],
  dAlphaDt: ['min^-1', 's^-1', '%/min', '%/s'] satisfies AlphaDerivativeUnit[],
  heatingRate: ['K/min', 'K/s', 'C/min', 'C/s'] satisfies HeatingRateUnit[],
};

function normalizedHeader(header: string): string {
  return header
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/α/g, ' alpha ')
    .replace(/β/g, ' beta ')
    .replace(/Δ/g, ' delta ')
    .replace(/℃/g, ' °c ')
    .replace(/⁻¹/g, '-1')
    .replace(/−/g, '-')
    .toLowerCase()
    .replace(/[_–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordsOnly(header: string): string {
  return normalizedHeader(header)
    .replace(/[\[\](){}]/g, ' ')
    .replace(/[°%/\\,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasPhrase(value: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) =>
    new RegExp(`(?:^|\\b)${phrase.replace(/ /g, '\\s+')}(?:$|\\b)`, 'i').test(value),
  );
}

function isExplicitAlphaDerivativeHeader(header: string): boolean {
  const value = wordsOnly(header);
  const compact = normalizedHeader(header).replace(/[\s[\](){}]/g, '');
  return (
    compact.includes('dalpha/dt')
    || compact.includes('dconversion/dt')
    || hasPhrase(value, [
      'alpha rate',
      'conversion rate',
      'rate of conversion',
    ])
  );
}

function detectTemperatureUnit(header: string): TemperatureUnit | undefined {
  const value = normalizedHeader(header);
  if (/(?:°\s*c\b|\bdeg(?:ree)?s?\s*c\b|\bcelsius\b)/i.test(value)) return 'C';
  if (/(?:\[\s*k\s*\]|\(\s*k\s*\)|\bkelvin\b|\btemp(?:erature)?\s+k\b)/i.test(value)) {
    return 'K';
  }
  return undefined;
}

function detectTimeUnit(header: string): TimeUnit | undefined {
  const value = normalizedHeader(header);
  if (/\bmin(?:ute)?s?\b/i.test(value)) return 'min';
  if (/(?:\[\s*s\s*\]|\(\s*s\s*\)|\bsec(?:ond)?s?\b)/i.test(value)) return 's';
  return undefined;
}

function detectMassUnit(header: string): MassUnit | undefined {
  const value = normalizedHeader(header);
  if (/\bmg\b/i.test(value)) return 'mg';
  if (/(?:\[\s*g\s*\]|\(\s*g\s*\)|\bgrams?\b|\bgram\b)/i.test(value)) return 'g';
  return undefined;
}

function detectFractionUnit(header: string): '%' | 'fraction' | undefined {
  const value = normalizedHeader(header);
  if (/%|\bpercent(?:age)?\b|\bwt\s*pct\b/i.test(value)) return '%';
  if (/\b(?:fraction|fractional|dimensionless)\b|0\s*(?:\.\.|-|to)\s*1/i.test(value)) {
    return 'fraction';
  }
  return undefined;
}

function detectAlphaDerivativeUnit(header: string): AlphaDerivativeUnit | undefined {
  const value = normalizedHeader(header).replace(/\s+/g, ' ');
  const compact = value.replace(/\s+/g, '');
  const explicitlyAlphaDerivative = isExplicitAlphaDerivativeHeader(header);

  if (
    /(?:\bmg\b|\bkg\b|\bg\s*\/|\bgrams?\b|\bmass\b|\bweight\b|°\s*c\b|\bcelsius\b|\bkelvin\b|\b[ck]\s*\/\s*(?:min|s))/i
      .test(value)
  ) {
    return undefined;
  }

  // Generic DTG/dm/dt or mass-rate columns are not automatically equivalent to
  // d(alpha)/dt. A user may still map one manually, but must then choose an
  // explicit conversion-rate unit in the guided mapping surface.
  if (
    !explicitlyAlphaDerivative
    && /(?:\bdtg\b|\bdm\s*\/\s*dt\b|\bg\s*\/)/i.test(value)
  ) {
    return undefined;
  }

  const percent = /%|\bpercent(?:age)?\b/i.test(value);
  const perMinute =
    /(?:1\/min(?:ute)?s?|\/min(?:ute)?s?|permin(?:ute)?s?|min(?:ute)?s?\^?-1)/i
      .test(compact);
  const perSecond =
    /(?:1\/s(?:ec(?:ond)?s?)?|\/s(?:ec(?:ond)?s?)?|persec(?:ond)?s?|s\^?-1|sec(?:ond)?s?\^?-1)/i
      .test(compact);
  if (perMinute) return percent ? '%/min' : 'min^-1';
  if (perSecond) return percent ? '%/s' : 's^-1';
  return undefined;
}

function detectHeatingRateUnit(header: string): HeatingRateUnit | undefined {
  const value = normalizedHeader(header).replace(/\s+/g, ' ');
  const perMinute = /(?:\/|\bper\b)\s*min(?:ute)?s?/i.test(value);
  const perSecond = /(?:\/|\bper\b)\s*s(?:ec(?:ond)?s?)?/i.test(value);
  const celsius = /°\s*c\b|\bcelsius\b|\bdeg(?:ree)?s?\s*c\b/i.test(value);
  const kelvin = /\bk\b|\bkelvin\b/i.test(value);
  if (perMinute && celsius) return 'C/min';
  if (perMinute && kelvin) return 'K/min';
  if (perSecond && celsius) return 'C/s';
  if (perSecond && kelvin) return 'K/s';
  return undefined;
}

function detectUnit(role: ColumnRole, header: string): ColumnUnit | undefined {
  switch (role) {
    case 'temperature':
      return detectTemperatureUnit(header);
    case 'time':
      return detectTimeUnit(header);
    case 'mass':
      return detectMassUnit(header);
    case 'massPercent':
    case 'alpha':
      return detectFractionUnit(header);
    case 'dAlphaDt':
      return detectAlphaDerivativeUnit(header);
    case 'heatingRate':
      return detectHeatingRateUnit(header);
    default:
      return undefined;
  }
}

function detectTemperatureKind(header: string): TemperatureKind {
  const value = wordsOnly(header);
  if (
    hasPhrase(value, [
      'peak temperature',
      'peak temp',
      'maximum temperature',
      'maximum temp',
      't peak',
      'tp',
      'tmax',
    ])
  ) {
    return 'peak';
  }
  return 'sample';
}

function candidate(
  role: ColumnRole,
  columnIndex: number,
  header: string,
  confidence: number,
  reason: string,
): ColumnCandidate {
  return {
    role,
    columnIndex,
    header,
    unit: detectUnit(role, header),
    temperatureKind: role === 'temperature' ? detectTemperatureKind(header) : undefined,
    confidence,
    reason,
  };
}

function candidatesForHeader(header: string, columnIndex: number): ColumnCandidate[] {
  const value = wordsOnly(header);
  const raw = normalizedHeader(header);
  const result: ColumnCandidate[] = [];
  const fractionUnit = detectFractionUnit(header);
  const explicitAlphaDerivative = isExplicitAlphaDerivativeHeader(header);

  if (explicitAlphaDerivative) {
    result.push(candidate('dAlphaDt', columnIndex, header, 1, 'conversion-rate alias'));
  }

  if (
    hasPhrase(value, [
      'heating rate',
      'heating speed',
      'scan rate',
      'ramp rate',
      'beta',
    ])
  ) {
    result.push(candidate('heatingRate', columnIndex, header, 1, 'heating-rate alias'));
  }

  if (
    (hasPhrase(value, [
      'mass percent',
      'mass percentage',
      'weight percent',
      'weight percentage',
      'remaining mass',
      'residual mass',
      'normalized mass',
      'wt pct',
      'wt',
    ]) ||
      (fractionUnit !== undefined && hasPhrase(value, ['mass', 'weight']))) &&
    (fractionUnit !== undefined || /\bnormalized\b|\bremaining\b/i.test(value))
  ) {
    result.push(candidate('massPercent', columnIndex, header, 1, 'mass-percentage alias'));
  } else if (
    hasPhrase(value, [
      'mass',
      'sample mass',
      'weight',
      'sample weight',
    ])
  ) {
    result.push(candidate('mass', columnIndex, header, 0.95, 'mass alias'));
  }

  if (
    !explicitAlphaDerivative &&
    hasPhrase(value, [
      'alpha',
      'conversion',
      'conversion degree',
      'conversion fraction',
      'extent of conversion',
    ])
  ) {
    result.push(candidate('alpha', columnIndex, header, 1, 'conversion alias'));
  }

  const temperatureUnit = detectTemperatureUnit(header);
  if (
    hasPhrase(value, [
      'temperature',
      'sample temperature',
      'furnace temperature',
      'peak temperature',
      'peak temp',
      't peak',
      'tp',
      'tmax',
      'temp',
    ]) ||
    (/^t(?:\s|$)/i.test(value) && temperatureUnit !== undefined)
  ) {
    result.push(candidate('temperature', columnIndex, header, 1, 'temperature alias'));
  }

  if (
    hasPhrase(value, ['elapsed time', 'time', 'duration']) ||
    (/^t(?:\s|$)/i.test(value) && detectTimeUnit(header) !== undefined && temperatureUnit === undefined)
  ) {
    result.push(candidate('time', columnIndex, header, 0.95, 'time alias'));
  }

  if (hasPhrase(value, ['run id', 'run', 'curve id', 'curve', 'experiment id'])) {
    result.push(candidate('run', columnIndex, header, 0.95, 'run identifier alias'));
  }
  if (
    hasPhrase(value, ['sample id', 'sample name', 'specimen'])
    || value === 'sample'
  ) {
    result.push(candidate('sample', columnIndex, header, 0.95, 'sample alias'));
  }
  if (hasPhrase(value, ['atmosphere', 'gas atmosphere', 'purge gas', 'carrier gas', 'ambient'])) {
    result.push(candidate('atmosphere', columnIndex, header, 0.95, 'atmosphere alias'));
  }
  if (
    hasPhrase(value, [
      'reaction stage',
      'reaction step',
      'process stage',
      'thermal event',
    ])
    || ['stage', 'step'].includes(value)
  ) {
    result.push(candidate('stage', columnIndex, header, 0.95, 'reaction-stage alias'));
  }
  if (hasPhrase(value, ['peak resolved', 'resolved peak']) || value === 'resolved') {
    result.push(candidate('peakResolved', columnIndex, header, 1, 'peak-resolution evidence'));
  }
  if (hasPhrase(value, ['peak quality']) || value === 'quality') {
    result.push(candidate('peakQuality', columnIndex, header, 1, 'peak-quality evidence'));
  }
  if (
    hasPhrase(value, ['peak source signal', 'source signal', 'signal kind'])
    || value === 'signal'
  ) {
    result.push(candidate('peakSourceSignal', columnIndex, header, 1, 'peak-source evidence'));
  }
  if (hasPhrase(value, ['analyst confirmed', 'analyst confirmation'])) {
    result.push(candidate('peakAnalystConfirmed', columnIndex, header, 1, 'analyst confirmation'));
  }
  if (hasPhrase(value, ['peak ambiguous']) || value === 'ambiguous') {
    result.push(candidate('peakAmbiguous', columnIndex, header, 1, 'legacy peak-ambiguity evidence'));
  }

  // A percent sign alone is not enough to infer what the percentage represents.
  if (raw.trim() === '%' || value.trim() === 'percent') return [];
  return result;
}

function resolveSelection(
  role: ColumnRole,
  selection: ColumnSelection,
  headers: readonly string[],
): { mapping?: ColumnMapping; need?: MappingNeed } {
  const descriptor =
    typeof selection === 'object' ? selection : { column: selection };
  let columnIndex: number | undefined;
  if (typeof descriptor.column === 'number') {
    columnIndex = descriptor.column;
  } else {
    const matches = headers
      .map((header, index) => ({ header, index }))
      .filter(({ header }) => header === descriptor.column);
    if (matches.length === 1) columnIndex = matches[0].index;
    if (matches.length > 1) {
      return {
        need: {
          kind: 'column',
          role,
          message: `Column name "${descriptor.column}" occurs more than once; select it by index.`,
          candidateColumns: matches.map(({ index }) => index),
        },
      };
    }
  }

  if (columnIndex === undefined || columnIndex < 0 || columnIndex >= headers.length) {
    return {
      need: {
        kind: 'column',
        role,
        message: `The explicit ${role} column does not exist in this table.`,
        candidateColumns: headers.map((_, index) => index),
      },
    };
  }

  return {
    mapping: {
      role,
      columnIndex,
      header: headers[columnIndex],
      unit: descriptor.unit ?? detectUnit(role, headers[columnIndex]),
      temperatureKind:
        role === 'temperature'
          ? descriptor.temperatureKind ?? detectTemperatureKind(headers[columnIndex])
          : undefined,
      confidence: 'manual',
    },
  };
}

function mappingNeedsUnit(mapping: ColumnMapping): boolean {
  return NUMERIC_ROLES.includes(mapping.role) && mapping.unit === undefined;
}

/** Detects common thermoanalytical headings without inventing ambiguous mappings. */
export function detectColumnMappings(
  headers: readonly string[],
  options: Pick<
    IngestionOptions,
    'columnMapping' | 'ignoredRoles' | 'defaults' | 'tableKind'
  > = {},
): ColumnDetectionResult {
  const candidates = headers.flatMap((header, index) => candidatesForHeader(header, index));
  const mappings: ColumnMapping[] = [];
  const needs: MappingNeed[] = [];
  const explicitRoles = new Set<ColumnRole>();
  const ignoredRoles = new Set(options.ignoredRoles ?? []);

  for (const [role, selection] of Object.entries(options.columnMapping ?? {}) as [
    ColumnRole,
    ColumnSelection,
  ][]) {
    explicitRoles.add(role);
    const resolved = resolveSelection(role, selection, headers);
    if (resolved.mapping) mappings.push(resolved.mapping);
    if (resolved.need) needs.push(resolved.need);
  }

  const roles: ColumnRole[] = [
    'temperature',
    'time',
    'mass',
    'massPercent',
    'alpha',
    'dAlphaDt',
    'heatingRate',
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
  const explicitlyClaimedColumns = new Set(
    mappings
      .filter((mapping) => mapping.confidence === 'manual')
      .map((mapping) => mapping.columnIndex),
  );

  for (const role of roles) {
    if (explicitRoles.has(role)) continue;
    if (ignoredRoles.has(role)) continue;
    const roleCandidates = candidates.filter((item) =>
      item.role === role && !explicitlyClaimedColumns.has(item.columnIndex));
    if (roleCandidates.length === 0) continue;
    const bestConfidence = Math.max(...roleCandidates.map((item) => item.confidence));
    const best = roleCandidates.filter((item) => item.confidence === bestConfidence);
    if (best.length > 1) {
      needs.push({
        kind: 'column',
        role,
        message: `More than one column could be ${role}; choose the intended column explicitly.`,
        candidateColumns: best.map((item) => item.columnIndex),
      });
      continue;
    }
    mappings.push({
      role,
      columnIndex: best[0].columnIndex,
      header: best[0].header,
      unit: best[0].unit,
      temperatureKind: best[0].temperatureKind,
      confidence: best[0].confidence === 1 ? 'exact' : 'alias',
    });
  }

  const columnsUsed = new Map<number, ColumnMapping[]>();
  for (const mapping of mappings) {
    const used = columnsUsed.get(mapping.columnIndex) ?? [];
    used.push(mapping);
    columnsUsed.set(mapping.columnIndex, used);
  }
  for (const [columnIndex, used] of columnsUsed) {
    if (used.length <= 1) continue;
    for (const mapping of used) {
      needs.push({
        kind: 'column',
        role: mapping.role,
        message: `Column "${mapping.header}" was mapped to multiple roles (${used
          .map((item) => item.role)
          .join(', ')}); provide explicit, non-overlapping mappings.`,
        candidateColumns: [columnIndex],
      });
    }
  }

  for (const mapping of mappings) {
    if (!mappingNeedsUnit(mapping)) continue;
    needs.push({
      kind: 'unit',
      role: mapping.role,
      message: `The unit for ${mapping.role} column "${mapping.header}" is not explicit.`,
      candidateColumns: [mapping.columnIndex],
      allowedValues: [...(ROLE_UNITS[mapping.role] ?? [])],
    });
  }

  const byRole = new Map(mappings.map((mapping) => [mapping.role, mapping]));
  if (!byRole.has('temperature')) {
    needs.push({
      kind: 'column',
      role: 'temperature',
      message: 'Select the temperature column.',
      candidateColumns: headers.map((_, index) => index),
    });
  }
  if (!byRole.has('heatingRate') && options.defaults?.heatingRate === undefined) {
    needs.push({
      kind: 'column',
      role: 'heatingRate',
      message: 'Select a heating-rate column or provide a per-file heating-rate default.',
      candidateColumns: headers.map((_, index) => index),
    });
  }

  const temperature = byRole.get('temperature');
  const declaredKind = options.tableKind ?? 'auto';
  const isPeak =
    declaredKind === 'beta-tp' ||
    (declaredKind === 'auto' && temperature?.temperatureKind === 'peak');
  if (isPeak) {
    const requiredPeakRoles: readonly ColumnRole[] = [
      'peakResolved',
      'peakQuality',
      'peakSourceSignal',
      'peakAnalystConfirmed',
    ];
    for (const role of requiredPeakRoles) {
      if (byRole.has(role)) continue;
      needs.push({
        kind: 'column',
        role,
        message: `Kissinger beta–Tp input requires an explicit ${role} column.`,
        candidateColumns: headers.map((_, index) => index),
      });
    }
  }
  const hasCurveSignal = byRole.has('alpha') || byRole.has('mass') || byRole.has('massPercent');
  if (!isPeak && !hasCurveSignal) {
    const hasOnlyTemperatureAndRate =
      byRole.has('temperature') &&
      (byRole.has('heatingRate') || options.defaults?.heatingRate !== undefined);
    if (declaredKind === 'auto' && hasOnlyTemperatureAndRate) {
      needs.push({
        kind: 'table_kind',
        message:
          'Temperature and heating rate alone could describe either sparse curve data or a beta-Tp peak table.',
        allowedValues: ['beta-tp', 'curve'],
      });
    } else {
      needs.push({
        kind: 'column',
        message: 'Select at least one conversion, mass, or mass-percentage signal column.',
        candidateColumns: headers.map((_, index) => index),
      });
    }
  }

  return { mappings, candidates, needs };
}
