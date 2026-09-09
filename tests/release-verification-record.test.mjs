import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  AUTHORITATIVE_RELEASE_CHECK_COMMAND,
  RELEASE_VERIFICATION_FAIL,
  RELEASE_VERIFICATION_PASS,
  ReleaseVerificationError,
  recordReleaseVerificationRun,
  verifyReleaseVerificationRecord,
} from '../scripts/record-release-verification.mjs';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const temporaryDirectories = [];

function temporaryDirectory(prefix = 'aes-release-record-') {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function clock() {
  const values = [
    new Date('2026-07-27T10:00:00.000Z'),
    new Date('2026-07-27T10:00:01.250Z'),
  ];
  return () => values.shift();
}

function createRecord({ status = 0, projectRoot = PROJECT_ROOT } = {}) {
  const outputDirectory = temporaryDirectory();
  const calls = [];
  const retained = recordReleaseVerificationRun({
    projectRoot,
    outputDirectory,
    runId: 'release-v0.2.0-focused-test',
    now: clock(),
    runner: (request) => {
      calls.push(request);
      return {
        status,
        signal: null,
        stdout: status === 0 ? 'focused checks passed\n' : '',
        stderr: status === 0 ? '' : 'focused checks failed\n',
      };
    },
  });
  return { ...retained, calls, projectRoot };
}

function rewriteSidecarSummaryHash(record) {
  const summaryBytes = readFileSync(record.summaryPath);
  const sidecar = JSON.parse(readFileSync(record.sidecarPath, 'utf8'));
  sidecar.summary.bytes = summaryBytes.length;
  sidecar.summary.sha256 = sha256(summaryBytes);
  writeFileSync(record.sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
}

function expectCode(callback, code) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof ReleaseVerificationError);
    assert.equal(error.code, code);
    return true;
  });
}

test.after(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('executes only exact npm run check and writes a hash-bound summary plus sidecar', () => {
  const record = createRecord();
  assert.equal(record.calls.length, 1);
  assert.equal(record.calls[0].executable, process.platform === 'win32' ? 'npm.cmd' : 'npm');
  assert.deepEqual(record.calls[0].args, ['run', 'check']);
  assert.equal(record.calls[0].shell, false);
  assert.equal(record.summary.command.display, AUTHORITATIVE_RELEASE_CHECK_COMMAND);
  assert.equal(record.summary.recordStatus, RELEASE_VERIFICATION_PASS);
  assert.deepEqual(record.summary.claimBoundary, {
    technicalCheckOnly: true,
    independentScientificReviewComplete: false,
    hostedThreeOsValidationComplete: false,
    humanUsabilityValidationComplete: false,
    statement:
      'A successful npm run check is technical evidence only. It does not close independent-review, hosted-platform, or observed-human gates.',
  });

  const verified = verifyReleaseVerificationRecord(record);
  assert.equal(verified.summary.recordStatus, RELEASE_VERIFICATION_PASS);
  assert.equal(verified.summary.projectBindings.files.length, 3);
  assert.equal(
    verified.sidecar.summary.sha256,
    sha256(readFileSync(record.summaryPath)),
  );
  assert.equal(
    verified.sidecar.log.sha256,
    sha256(readFileSync(record.logPath)),
  );
});

test('validates an existing exact retained log and rejects log or sidecar tampering', () => {
  const logTamper = createRecord();
  appendFileSync(logTamper.logPath, 'tamper');
  expectCode(
    () => verifyReleaseVerificationRecord(logTamper),
    'RELEASE_RECORD_HASH_MISMATCH',
  );

  const sidecarTamper = createRecord();
  const sidecar = JSON.parse(readFileSync(sidecarTamper.sidecarPath, 'utf8'));
  sidecar.log.sha256 = '0'.repeat(64);
  writeFileSync(sidecarTamper.sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
  expectCode(
    () => verifyReleaseVerificationRecord(sidecarTamper),
    'RELEASE_RECORD_HASH_MISMATCH',
  );
});

test('rejects command substitution and external-gate status inflation even after rehashing', () => {
  const commandTamper = createRecord();
  const commandSummary = JSON.parse(readFileSync(commandTamper.summaryPath, 'utf8'));
  commandSummary.command.display = 'npm test';
  writeFileSync(
    commandTamper.summaryPath,
    `${JSON.stringify(commandSummary, null, 2)}\n`,
  );
  rewriteSidecarSummaryHash(commandTamper);
  expectCode(
    () => verifyReleaseVerificationRecord(commandTamper),
    'RELEASE_RECORD_COMMAND_MISMATCH',
  );

  const boundaryTamper = createRecord();
  const boundarySummary = JSON.parse(readFileSync(boundaryTamper.summaryPath, 'utf8'));
  boundarySummary.claimBoundary.hostedThreeOsValidationComplete = true;
  writeFileSync(
    boundaryTamper.summaryPath,
    `${JSON.stringify(boundarySummary, null, 2)}\n`,
  );
  rewriteSidecarSummaryHash(boundaryTamper);
  expectCode(
    () => verifyReleaseVerificationRecord(boundaryTamper),
    'RELEASE_RECORD_BOUNDARY_INFLATION',
  );
});

test('retains failed npm run check as FAIL and refuses a forged PASS', () => {
  const record = createRecord({ status: 1 });
  assert.equal(record.summary.recordStatus, RELEASE_VERIFICATION_FAIL);
  verifyReleaseVerificationRecord(record);

  const summary = JSON.parse(readFileSync(record.summaryPath, 'utf8'));
  summary.recordStatus = RELEASE_VERIFICATION_PASS;
  writeFileSync(record.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  rewriteSidecarSummaryHash(record);
  expectCode(
    () => verifyReleaseVerificationRecord(record),
    'RELEASE_RECORD_STATUS_INFLATION',
  );
});

test('rejects symbolic-link substitution for a retained log', (context) => {
  const record = createRecord();
  const target = path.join(path.dirname(record.logPath), 'real-log-copy.txt');
  copyFileSync(record.logPath, target);
  unlinkSync(record.logPath);
  try {
    symlinkSync(target, record.logPath);
  } catch (error) {
    context.skip(`Symlink creation unavailable: ${error.code ?? error}`);
    return;
  }
  expectCode(
    () => verifyReleaseVerificationRecord(record),
    'RELEASE_RECORD_SYMLINK',
  );
});

test('binds the exact release HTML, release manifest, package check script, and rejects placeholders', () => {
  const projectRoot = temporaryDirectory('aes-release-project-');
  mkdirSync(path.join(projectRoot, 'release'), { recursive: true });
  for (const relativePath of [
    'package.json',
    'release/Activation-Energy-Studio-v0.2.0.html',
    'release/MANIFEST.v0.2.0.json',
  ]) {
    copyFileSync(
      path.resolve(PROJECT_ROOT, relativePath),
      path.resolve(projectRoot, relativePath),
    );
  }
  const record = createRecord({ projectRoot });
  appendFileSync(
    path.resolve(projectRoot, 'release/Activation-Energy-Studio-v0.2.0.html'),
    '\nrelease-tamper',
  );
  expectCode(
    () => verifyReleaseVerificationRecord(record),
    'RELEASE_RECORD_MANIFEST_RELEASE_MISMATCH',
  );

  expectCode(
    () =>
      recordReleaseVerificationRun({
        projectRoot: PROJECT_ROOT,
        outputDirectory: temporaryDirectory(),
        runId: 'TODO',
        runner: () => ({ status: 0, signal: null, stdout: '', stderr: '' }),
      }),
    'RELEASE_RECORD_PLACEHOLDER',
  );
});
