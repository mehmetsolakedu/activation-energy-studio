import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AES_PLATFORM_VALIDATION_VERSION = '0.3.2';

const {
  LOCAL_MACOS_DIAGNOSTIC_STATUS,
  verifyLocalMacOSDiagnosticBundle,
} = await import('../scripts/run-hosted-platform-validation-core-v032.mjs');
const {
  DEFAULT_V032_LOCAL_MACOS_DIAGNOSTIC_DIRECTORY,
} = await import('../scripts/verify-local-macos-diagnostic-v032.mjs');

test('retained v0.3.2 local macOS diagnostic is freeze-bound and remains non-platform evidence', async () => {
  const result = await verifyLocalMacOSDiagnosticBundle(
    DEFAULT_V032_LOCAL_MACOS_DIAGNOSTIC_DIRECTORY,
  );
  assert.equal(result.claimStatus, LOCAL_MACOS_DIAGNOSTIC_STATUS);
  assert.equal(result.fileCount, 12);
  assert.match(result.manifestSha256, /^[a-f0-9]{64}$/u);
});
