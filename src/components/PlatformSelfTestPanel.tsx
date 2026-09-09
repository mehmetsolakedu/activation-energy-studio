import { useState } from 'react';

import { APP_VERSION, downloadText } from '../report';
import {
  PLATFORM_SELF_TEST_EXPECTATIONS,
  runPlatformSelfTest,
  serializePlatformSelfTestRecord,
  type PlatformSelfTestRecord,
} from '../platformSelfTest';

function rangeText(range: readonly [number, number]): string {
  return `${range[0].toFixed(3)}–${range[1].toFixed(3)} kJ/mol`;
}

export function PlatformSelfTestPanel() {
  const [record, setRecord] = useState<PlatformSelfTestRecord | null>(null);
  const [running, setRunning] = useState(false);

  async function run(): Promise<void> {
    setRunning(true);
    try {
      setRecord(await runPlatformSelfTest());
    } finally {
      setRunning(false);
    }
  }

  function download(): void {
    if (!record) return;
    downloadText(
      serializePlatformSelfTestRecord(record),
      `activation-energy-platform-self-test-v${APP_VERSION}-${record.recordStatus.toLowerCase()}.json`,
      'application/json;charset=utf-8',
    );
  }

  const failedChecks = record?.checks.filter((check) => check.status === 'FAIL') ?? [];

  return (
    <article className="card platform-self-test" data-testid="platform-self-test-panel">
      <div className="card-header">
        <div>
          <h3>
            {'Platform scientific self-test'}
          </h3>
          <p>
            {'Reproduces the locked example through the real calculation path without network calls.'}
          </p>
        </div>
        <span
          className={`status-pill ${record?.recordStatus === 'PASS' ? 'ok' : record ? 'error' : 'warning'}`}
          data-testid="platform-self-test-status"
          aria-live="polite"
        >
          {running
            ? 'Running'
            : record?.recordStatus ?? 'Not run'}
        </span>
      </div>

      <div className="self-test-body">
        <div className="self-test-build">
          <span>
            {`Scientific build · v${APP_VERSION}`}
          </span>
          <code title={record?.application.scientificBuildSha256}>
            {record?.application.scientificBuildSha256
              ?? 'Recorded when run'}
          </code>
        </div>

        <div
          className="self-test-expectations"
          aria-label={'Numerical self-test expectations'}
        >
          {PLATFORM_SELF_TEST_EXPECTATIONS.map((expectation) => (
            <div key={expectation.method}>
              <strong>{expectation.method}</strong>
              <span>{rangeText(expectation.activationEnergyRangeKJPerMol)}</span>
              <small>
                {'9 α points'} · R² ≥ {expectation.minimumR2}
              </small>
            </div>
          ))}
        </div>

        {record && (
          <div className={`notice ${record.recordStatus === 'PASS' ? 'success' : 'error'}`}>
            <strong>
              {record.recordStatus === 'PASS'
                ? `${record.checks.length}/${record.checks.length} checks passed.`
                : `${failedChecks.length} checks failed; the platform result was not marked PASS.`}
            </strong>
            <span>
              {'Scientific payload'}: {
                record.scientificPayloadSha256
                ?? 'not produced'
              }
            </span>
            {failedChecks.length > 0 && (
              <span>
                {'Failed'}: {
                  failedChecks.map((check) => check.id).join(', ')
                }
              </span>
            )}
          </div>
        )}

        <div className="action-row self-test-actions">
          <button
            className="secondary-button"
            data-testid="run-platform-self-test"
            disabled={running}
            onClick={() => void run()}
            type="button"
          >
            {running
              ? 'Self-test running…'
              : 'Run scientific self-test'}
          </button>
          <button
            className="ghost-button"
            data-testid="download-platform-self-test"
            disabled={!record || running}
            onClick={download}
            type="button"
          >
            {'Platform evidence JSON'}
          </button>
        </div>

        <small className="self-test-boundary">
          {'This record demonstrates the local scientific path in one browser; it does not replace HAR, screenshot, and three-operating-system comparison evidence.'}
        </small>
      </div>
    </article>
  );
}
