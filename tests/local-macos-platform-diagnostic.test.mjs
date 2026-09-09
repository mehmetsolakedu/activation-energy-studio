import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  LOCAL_MACOS_DIAGNOSTIC_FAILURE_STATUS,
  LOCAL_MACOS_DIAGNOSTIC_STATUS,
  assertLocalMacOSDiagnosticEnvironment,
  createLocalMacOSFailureRecord,
  verifyLocalMacOSDiagnosticBundle,
} from '../scripts/run-hosted-platform-validation.mjs';
import {
  localMacOSDiagnosticUsage,
  parseLocalMacOSDiagnosticArguments,
} from '../scripts/run-local-macos-platform-diagnostic.mjs';
import {
  DEFAULT_LOCAL_MACOS_DIAGNOSTIC_DIRECTORY,
} from '../scripts/verify-local-macos-diagnostic.mjs';
import {
  HostedPlatformValidationError,
  REQUIRED_DOM_CONTRACT_SELECTORS,
} from '../scripts/platform-hosted-ci.mjs';

function expectCode(code, callback) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof HostedPlatformValidationError);
    assert.equal(error.code, code);
    return true;
  });
}

test('local macOS CLI accepts only output and an optional explicit Chrome path', () => {
  const output = path.resolve('tmp/local-macos-diagnostic');
  const chrome = path.resolve('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  assert.deepEqual(
    parseLocalMacOSDiagnosticArguments([
      '--output',
      output,
      '--browser-executable',
      chrome,
    ]),
    {
      outputDirectory: output,
      browserExecutable: chrome,
    },
  );
  assert.equal(parseLocalMacOSDiagnosticArguments(['--help']), null);
  assert.match(localMacOSDiagnosticUsage(), /does not emit hosted provenance/u);
  expectCode('ARGUMENT_REQUIRED', () =>
    parseLocalMacOSDiagnosticArguments([]),
  );
  expectCode('ARGUMENT_INVALID', () =>
    parseLocalMacOSDiagnosticArguments([
      '--output',
      output,
      '--os',
      'macos',
    ]),
  );
  expectCode('ARGUMENT_INVALID', () =>
    parseLocalMacOSDiagnosticArguments([
      '--output',
      output,
      '--output',
      output,
    ]),
  );
});

test('local diagnostic environment is direct-macOS only and rejects GitHub Actions', () => {
  assert.deepEqual(
    assertLocalMacOSDiagnosticEnvironment({
      platform: 'darwin',
      environment: {},
    }),
    {
      executionEnvironment: 'LOCAL_DIRECT_MACOS_HOST',
      githubActions: false,
    },
  );
  expectCode('LOCAL_MACOS_REQUIRED', () =>
    assertLocalMacOSDiagnosticEnvironment({
      platform: 'linux',
      environment: {},
    }),
  );
  expectCode('LOCAL_DIAGNOSTIC_GITHUB_ACTIONS_FORBIDDEN', () =>
    assertLocalMacOSDiagnosticEnvironment({
      platform: 'darwin',
      environment: { GITHUB_ACTIONS: 'true' },
    }),
  );
  expectCode('LOCAL_DIAGNOSTIC_GITHUB_ACTIONS_FORBIDDEN', () =>
    assertLocalMacOSDiagnosticEnvironment({
      platform: 'darwin',
      environment: { RUNNER_ENVIRONMENT: 'github-hosted' },
    }),
  );
});

test('pre-analysis DOM contract excludes the result table that is created only after analysis', () => {
  assert.ok(
    REQUIRED_DOM_CONTRACT_SELECTORS.includes(
      '[data-testid="run-analysis"]',
    ),
  );
  assert.equal(
    REQUIRED_DOM_CONTRACT_SELECTORS.includes(
      '[data-testid="numeric-results"]',
    ),
    false,
  );
});

test('local diagnostic failures have a distinct non-evidence schema and retain partial capture', () => {
  const error = new HostedPlatformValidationError(
    'BROWSER_LAUNCH_FAILED',
    'Synthetic local Chrome failure.',
  );
  error.browserRunPartial = {
    browser: {
      executable:
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      launched: false,
    },
  };
  const failure = createLocalMacOSFailureRecord({
    provenance: {
      executionEnvironment: 'LOCAL_DIRECT_MACOS_HOST',
      githubActions: false,
    },
    error,
    recordedAt: '2026-07-27T12:00:00.000Z',
  });
  assert.equal(
    failure.schema,
    'activation-energy-studio/local-macos-browser-diagnostic-failure/v1',
  );
  assert.equal(failure.claimStatus, LOCAL_MACOS_DIAGNOSTIC_FAILURE_STATUS);
  assert.deepEqual(failure.platformCriteriaClosed, []);
  assert.equal(failure.partial.browser.launched, false);
  assert.doesNotMatch(failure.schema, /hosted-platform-run/u);
});

test('retained local macOS Chrome diagnostic is hash-locked and cannot claim platform PASS', async () => {
  const result = await verifyLocalMacOSDiagnosticBundle(
    DEFAULT_LOCAL_MACOS_DIAGNOSTIC_DIRECTORY,
  );
  assert.equal(result.claimStatus, LOCAL_MACOS_DIAGNOSTIC_STATUS);
  assert.equal(result.fileCount, 10);
  assert.match(result.manifestSha256, /^[a-f0-9]{64}$/u);
});
