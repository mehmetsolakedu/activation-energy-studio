export interface DisplayDiagnostic {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface DisplayDiagnosticGroup extends DisplayDiagnostic {
  occurrenceCount: number;
}

interface DiagnosticsListProps {
  diagnostics: DisplayDiagnostic[];
  emptyMessage?: string;
}

export function groupDisplayDiagnostics(
  diagnostics: readonly DisplayDiagnostic[],
): DisplayDiagnosticGroup[] {
  const grouped = new Map<string, DisplayDiagnosticGroup>();
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.severity}\u0000${diagnostic.code}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.occurrenceCount += 1;
      continue;
    }
    grouped.set(key, { ...diagnostic, occurrenceCount: 1 });
  }
  return [...grouped.values()];
}

export function DiagnosticsList({
  diagnostics,
  emptyMessage,
}: DiagnosticsListProps) {
  if (diagnostics.length === 0) {
    return (
      <div className="notice info">
        {emptyMessage ?? 'No active warning.'}
      </div>
    );
  }

  const groups = groupDisplayDiagnostics(diagnostics);

  return (
    <div className="result-stack" style={{ padding: '0 1.35rem 1.35rem' }}>
      {groups.map((diagnostic) => (
        <div
          className={`notice ${diagnostic.severity}`}
          style={{ margin: 0 }}
          key={`${diagnostic.severity}-${diagnostic.code}`}
        >
          <strong>{diagnostic.code}</strong>
          <div>{diagnostic.message}</div>
          {diagnostic.occurrenceCount > 1 && (
            <div className="diagnostic-occurrence">
              {`The same warning occurred in ${diagnostic.occurrenceCount} result records; full method and α details are retained in the JSON audit trail.`}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
