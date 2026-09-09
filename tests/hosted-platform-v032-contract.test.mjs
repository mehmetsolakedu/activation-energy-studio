import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_PATH = path.resolve(
  PROJECT_ROOT,
  '.github/workflows/platform-validation-v032.yml',
);
const TEST_RUNNER_PATH = path.resolve(
  PROJECT_ROOT,
  'scripts/run-platform-tests-v032.mjs',
);

test('v0.3.2 hosted workflow binds the freeze, exact matrix, pinned actions, and versioned harness', () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  for (const runner of ['ubuntu-24.04', 'macos-15', 'windows-11-arm']) {
    assert.match(workflow, new RegExp(`runner_label: ${runner.replaceAll('.', '\\.')}`, 'u'));
  }
  assert.doesNotMatch(workflow, /(?:ubuntu|macos|windows)-latest/u);
  assert.match(workflow, /verify-v0\.3\.2-external-candidate\.mjs/u);
  assert.match(workflow, /npm run test:platform-evidence/u);
  assert.match(workflow, /npm run test:hosted-platform/u);
  assert.match(workflow, /npm run validate:hosted-platform/u);
  assert.match(workflow, /AES_PLATFORM_VALIDATION_VERSION: "0\.3\.2"/u);
  assert.match(workflow, /output\/hosted-platform-v0\.3\.2/u);
  assert.match(workflow, /actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803/u);
  assert.match(workflow, /actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38/u);
  assert.match(workflow, /actions\/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f/u);
  assert.match(workflow, /retention-days: 90/u);
  assert.doesNotMatch(
    workflow,
    /verify:(?:release-manifest|paper010-oracle|oak-oracle|dryad-oracle|nr-cels-oracle|coal-spt-paraffin-oracle)|npm run typecheck|npm test/u,
  );
  const testRunner = readFileSync(TEST_RUNNER_PATH, 'utf8');
  assert.match(testRunner, /tests\/hosted-platform-validation\.test\.mjs/u);
  assert.match(testRunner, /tests\/hosted-platform-v032-contract\.test\.mjs/u);
  assert.match(testRunner, /AES_PLATFORM_VALIDATION_VERSION: '0\.3\.2'/u);
});
