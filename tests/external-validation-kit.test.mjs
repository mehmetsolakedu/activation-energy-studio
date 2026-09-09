import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { unzipSync } from 'fflate';

import {
  EXTERNAL_VALIDATION_KIT_PATHS,
  assertUpstreamValidationCurrent,
  buildExternalValidationKitPlan,
  generateExternalValidationKit,
  verifyExternalValidationKit,
} from '../scripts/generate-external-validation-kit.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('upstream freshness gate rejects a stale release manifest before kit verification', () => {
  const projectRoot = mkdtempSync(resolve(tmpdir(), 'aes-kit-upstream-'));
  const releaseDirectory = resolve(projectRoot, 'release');
  mkdirSync(releaseDirectory, { recursive: true });
  const manifestPath = resolve(releaseDirectory, 'MANIFEST.v0.2.0.json');
  const expected = { schema: 'test/release-manifest/v1', value: 1 };
  writeFileSync(manifestPath, `${JSON.stringify(expected, null, 2)}\n`);
  let reviewChecks = 0;
  const options = {
    projectRoot,
    buildRelease: () => expected,
    verifyReview: (observedRoot, observedOutput) => {
      assert.equal(observedRoot, projectRoot);
      assert.equal(
        observedOutput,
        resolve(projectRoot, 'output/independent-scientific-review-v0.2.0'),
      );
      reviewChecks += 1;
    },
  };

  assert.doesNotThrow(() => assertUpstreamValidationCurrent(options));
  assert.equal(reviewChecks, 1);

  writeFileSync(manifestPath, '{"schema":"stale"}\n');
  assert.throws(
    () => assertUpstreamValidationCurrent(options),
    /release evidence manifest is stale/iu,
  );
  assert.equal(reviewChecks, 1);
});

test('external validation kit is deterministic and explicitly keeps external gates open', () => {
  const first = buildExternalValidationKitPlan();
  const second = buildExternalValidationKitPlan();

  assert.equal(first.archiveSha256, second.archiveSha256);
  assert.deepEqual(first.manifest, second.manifest);
  assert.equal(first.manifest.generation.deterministic, true);
  assert.equal(first.manifest.generation.generatedAtOmitted, true);
  assert.deepEqual(first.manifest.evidenceState, {
    platform: 'PREPARED_AWAITING_REAL_WINDOWS_MACOS_UBUNTU_RUNS',
    usability: 'PREPARED_AWAITING_FIVE_OBSERVED_HUMAN_SESSIONS',
    scientificReview: 'UNSIGNED_AWAITING_INDEPENDENT_REVIEW',
    externalAdjudication:
      'PREPARED_AWAITING_THREE_RETURNED_LANES_AND_SIGNED_HUMAN_AUDITS',
  });
  assert.match(first.manifest.claimBoundary, /not evidence/i);
  assert.ok(first.manifest.files.length >= 50);
  assert.equal(
    new Set(first.manifest.files.map(({ path }) => path)).size,
    first.manifest.files.length,
  );
});

test('generator emits a byte-current directory, checksum, and portable ZIP', () => {
  const plan = generateExternalValidationKit();
  const verified = verifyExternalValidationKit();
  assert.equal(verified.archiveSha256, plan.archiveSha256);

  const archive = readFileSync(EXTERNAL_VALIDATION_KIT_PATHS.archive);
  assert.equal(sha256(archive), plan.archiveSha256);
  assert.equal(
    readFileSync(EXTERNAL_VALIDATION_KIT_PATHS.archiveChecksum, 'utf8'),
    `${plan.archiveSha256}  ${EXTERNAL_VALIDATION_KIT_PATHS.archiveRoot}.zip\n`,
  );

  const unzipped = unzipSync(new Uint8Array(archive));
  const prefix = `${EXTERNAL_VALIDATION_KIT_PATHS.archiveRoot}/`;
  const manifestPath = `${prefix}BUNDLE_MANIFEST.json`;
  const checksumPath = `${prefix}BUNDLE_MANIFEST.sha256`;
  const platformRetainedReadmePath = `${prefix}01-platform/retained/README.md`;
  assert.ok(unzipped[manifestPath]);
  assert.ok(unzipped[checksumPath]);
  assert.ok(unzipped[platformRetainedReadmePath]);
  assert.equal(
    Buffer.from(unzipped[manifestPath]).toString('utf8'),
    readFileSync(
      resolve(EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory, 'BUNDLE_MANIFEST.json'),
      'utf8',
    ),
  );

  const lockCheck = spawnSync(
    'sh',
    [resolve(EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory, 'VERIFY-LOCKS.sh')],
    { encoding: 'utf8' },
  );
  assert.equal(lockCheck.status, 0, lockCheck.stderr);
  assert.match(lockCheck.stdout, /PASS BUNDLE_MANIFEST\.json [0-9a-f]{64}/u);
  assert.match(lockCheck.stdout, /PASS BUNDLE_PAYLOAD_SHA256SUMS\.txt [0-9a-f]{64}/u);
  assert.match(lockCheck.stdout, /PASS BUNDLE_PAYLOADS count=\d+/u);

  const tamperedPayloadPath = resolve(
    EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory,
    'README-FIRST.md',
  );
  writeFileSync(tamperedPayloadPath, 'tampered native-verifier payload\n');
  const tamperedLockCheck = spawnSync(
    'sh',
    [resolve(EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory, 'VERIFY-LOCKS.sh')],
    { encoding: 'utf8' },
  );
  assert.notEqual(tamperedLockCheck.status, 0);
  assert.match(
    `${tamperedLockCheck.stdout}\n${tamperedLockCheck.stderr}`,
    /README-FIRST\.md: (FAILED|FAIL)|FAIL README-FIRST\.md/u,
  );
  generateExternalValidationKit();

  assert.match(
    readFileSync(
      resolve(EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory, 'VERIFY-LOCKS.ps1'),
      'utf8',
    ),
    /Get-FileHash/u,
  );
});

test('hosted repository seed executes every pre-browser workflow command', () => {
  generateExternalValidationKit();
  const temporaryRoot = mkdtempSync(
    resolve(tmpdir(), 'aes-hosted-repository-seed-'),
  );
  const seedRoot = resolve(temporaryRoot, 'repository');
  cpSync(
    resolve(
      EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory,
      '01-platform/hosted',
    ),
    seedRoot,
    { recursive: true },
  );
  symlinkSync(
    resolve(EXTERNAL_VALIDATION_KIT_PATHS.projectRoot, 'node_modules'),
    resolve(seedRoot, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  try {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    for (const script of [
      'verify:paper010-oracle',
      'verify:fixture-manifest',
      'test:hosted-platform',
    ]) {
      const result = spawnSync(npm, ['run', script], {
        cwd: seedRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          AES_RUN_REAL_CHROME_WORKER_INTEGRATION: '0',
        },
      });
      assert.equal(
        result.status,
        0,
        `${script} failed inside the generated repository seed:\n${result.stdout}\n${result.stderr}`,
      );
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('handoff templates are fail-closed and bind the immutable release bytes', () => {
  const plan = generateExternalValidationKit();
  const readme = readFileSync(
    resolve(EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory, 'README-FIRST.md'),
    'utf8',
  );
  const returnChecklist = readFileSync(
    resolve(EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory, 'RETURN-CHECKLIST.md'),
    'utf8',
  );
  const platformRetainedReadme = readFileSync(
    resolve(
      EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory,
      '01-platform/retained/README.md',
    ),
    'utf8',
  );
  const platformProtocol = readFileSync(
    resolve(
      EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory,
      '01-platform/PLATFORM_VALIDATION_PROTOCOL.md',
    ),
    'utf8',
  );
  const hostedReadme = readFileSync(
    resolve(
      EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory,
      '01-platform/hosted/README.md',
    ),
    'utf8',
  );
  const hostedBundledProtocol = readFileSync(
    resolve(
      EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory,
      '01-platform/hosted/PLATFORM_VALIDATION_PROTOCOL.md',
    ),
    'utf8',
  );
  const platformTemplates = Object.fromEntries(
    [
      ['macos', 'macos'],
      ['windows11', 'windows11'],
      ['ubuntu', 'ubuntu'],
    ].map(([slug, family]) => [
      slug,
      {
        family,
        input: JSON.parse(
          readFileSync(
            resolve(
              EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory,
              `01-platform/platform-run-input.${slug}.template.json`,
            ),
            'utf8',
          ),
        ),
        receipt: JSON.parse(
          readFileSync(
            resolve(
              EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory,
              `01-platform/retained/${slug}/hosted-upload-receipt.template.json`,
            ),
            'utf8',
          ),
        ),
      },
    ]),
  );
  const platformHumanReview = JSON.parse(
    readFileSync(
      resolve(
        EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory,
        '01-platform/platform-human-review-input.template.json',
      ),
      'utf8',
    ),
  );
  const platform = JSON.parse(
    readFileSync(
      resolve(
        EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory,
        '01-platform/platform-run-input.template.json',
      ),
      'utf8',
    ),
  );
  const participant = JSON.parse(
    readFileSync(
      resolve(
        EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory,
        '02-usability/participants/P01.template.json',
      ),
      'utf8',
    ),
  );
  const study = JSON.parse(
    readFileSync(
      resolve(
        EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory,
        '02-usability/study-input.template.json',
      ),
      'utf8',
    ),
  );
  const adjudicationTemplate = JSON.parse(
    readFileSync(
      resolve(
        EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory,
        '04-closeout/EXTERNAL_EVIDENCE_ADJUDICATION_INPUT_TEMPLATE.json',
      ),
      'utf8',
    ),
  );

  assert.equal(platform.artifacts.release.sha256, plan.lock.release.sha256);
  assert.equal(platform.artifacts.goldenInput.sha256, plan.lock.goldenInput.sha256);
  assert.equal(
    platform.environment.os.family,
    'REPLACE_WITH_macos_windows11_or_ubuntu',
  );
  assert.equal(platform.protocol.operatorConfirmations.analysisCompleted, false);
  assert.match(platform.artifacts.selfTestJson.sha256, /^REPLACE_/u);
  assert.match(platform.artifacts.reportJson.sha256, /^REPLACE_/u);
  assert.match(returnChecklist, /evidence-record\.json/u);
  assert.match(platformRetainedReadme, /retained\/macos\//u);
  assert.match(platformRetainedReadme, /retained\/windows11\//u);
  assert.match(platformRetainedReadme, /retained\/ubuntu\//u);
  assert.match(platformRetainedReadme, /must be `file:`/u);
  assert.match(platformRetainedReadme, /human must inspect the screenshot/iu);
  assert.match(platformRetainedReadme, /Do not move the\s+manifest/iu);
  assert.match(
    platformRetainedReadme,
    /record-platform-human-review\.mjs --input/iu,
  );
  assert.match(platformRetainedReadme, /does not authenticate the reviewer/iu);
  assert.match(readme, /all six decision surfaces/iu);
  assert.match(
    readme,
    /record-platform-human-review\.mjs --input/iu,
  );
  assert.match(readme, /neither authenticates the reviewer nor applies/iu);
  assert.match(readme, /platform-run-input\.<os>\.template\.json/iu);
  assert.match(readme, /generic field-shape reference/iu);
  assert.match(readme, /without renaming or\s+editing any file/iu);
  assert.match(readme, /Owner adjudication/iu);
  assert.match(readme, /acceptanceGatesAutomaticallyApplied=false/u);
  assert.match(
    readme,
    /adjudicate-external-evidence\.mjs --input/iu,
  );
  assert.match(returnChecklist, /platform-human-review-input\.json/iu);
  assert.match(returnChecklist, /all six decision surfaces/iu);
  assert.match(returnChecklist, /not as authenticated identity/iu);
  assert.match(returnChecklist, /hosted-run-metadata\.json/iu);
  assert.match(returnChecklist, /hosted-workflow-preflight\.json/iu);
  assert.match(returnChecklist, /hosted-upload-receipt\.json/iu);
  assert.match(returnChecklist, /raw-cdp-events\.json/iu);
  assert.match(platformRetainedReadme, /hosted-run-metadata\.json/iu);
  assert.match(platformRetainedReadme, /hosted-workflow-preflight\.json/iu);
  assert.match(platformRetainedReadme, /hosted-upload-receipt\.json/iu);
  assert.match(platformRetainedReadme, /raw-cdp-events\.json/iu);
  assert.match(platformProtocol, /retained\/macos\/evidence-record\.json/iu);
  assert.match(platformProtocol, /retained\/macos\/final-state\.png/iu);
  assert.match(
    platformProtocol,
    /node tools\/record-platform-human-review\.mjs/iu,
  );
  assert.match(
    platformProtocol,
    /node tools\/create-platform-evidence-record\.mjs/iu,
  );
  assert.match(
    platformProtocol,
    /node tools\/compare-scientific-reports\.mjs/iu,
  );
  assert.match(
    platformProtocol,
    /node tools\/create-platform-matrix-record\.mjs/iu,
  );
  assert.match(
    platformProtocol,
    /From the generated external-validation-kit root/iu,
  );
  assert.doesNotMatch(
    platformProtocol,
    /\]\(scripts\/record-platform-human-review\.mjs\)/u,
  );
  assert.equal(hostedBundledProtocol, platformProtocol);
  assert.match(
    hostedReadme,
    /\[`PLATFORM_VALIDATION_PROTOCOL\.md`\]\(PLATFORM_VALIDATION_PROTOCOL\.md\)/u,
  );
  assert.match(
    hostedReadme,
    /minimal repository seed[\s\S]*only runs the hosted\s+automation/iu,
  );
  assert.match(
    hostedReadme,
    /node tools\/record-platform-human-review\.mjs/iu,
  );
  assert.doesNotMatch(platformProtocol, /final-status\.png/iu);
  for (const hostedFileName of [
    'activation-energy-platform-self-test-v0.2.0-pass.json',
    'platform-golden.json',
    'platform-golden-results.csv',
    'platform-golden-report.pdf',
  ]) {
    assert.match(returnChecklist, new RegExp(hostedFileName.replaceAll('.', '\\.'), 'u'));
    assert.match(
      platformRetainedReadme,
      new RegExp(hostedFileName.replaceAll('.', '\\.'), 'u'),
    );
  }
  assert.doesNotMatch(returnChecklist, /retained\/<os>\/self-test\.json/u);
  assert.doesNotMatch(platformRetainedReadme, /- `self-test\.json`/u);
  assert.equal(
    platformHumanReview.schemaVersion,
    'activation-energy-studio/platform-human-review-input/v1',
  );
  assert.deepEqual(
    platformHumanReview.locks.sourceRecords.map(({ osFamily }) => osFamily),
    ['macos', 'windows11', 'ubuntu'],
  );
  assert.equal(
    platformHumanReview.locks.matrix.path,
    'retained/platform-matrix-record.json',
  );
  assert.match(platformHumanReview.locks.matrix.sha256, /^REPLACE_/u);
  assert.deepEqual(
    platformHumanReview.locks.sourceRecords.map(({ osFamily, path }) => ({
      osFamily,
      path,
    })),
    [
      {
        osFamily: 'macos',
        path: 'retained/macos/evidence-record.json',
      },
      {
        osFamily: 'windows11',
        path: 'retained/windows11/evidence-record.json',
      },
      {
        osFamily: 'ubuntu',
        path: 'retained/ubuntu/evidence-record.json',
      },
    ],
  );
  assert.ok(
    platformHumanReview.locks.sourceRecords.every(({ sha256: recordSha256 }) =>
      /^REPLACE_/u.test(recordSha256),
    ),
  );
  assert.deepEqual(
    platformHumanReview.platformReviews.map(({ osFamily }) => osFamily),
    ['macos', 'windows11', 'ubuntu'],
  );
  assert.deepEqual(
    Object.values(platformHumanReview.reviewer.declarations),
    [false, false, false],
  );
  assert.equal(platformHumanReview.reviewerMatrixDisposition, 'FAIL');
  const expectedHumanReviewDecisionIds = [
    'HAR_NETWORK',
    'SCREENSHOT_UI',
    'PDF_VISUAL_QA',
    'JSON_CSV_PDF_CONSISTENCY',
    'RUNNER_OS_ARCH_IDENTITY',
    'DEVIATIONS',
  ];
  for (const review of platformHumanReview.platformReviews) {
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(review.artifacts).map(([role, artifact]) => [
          role,
          artifact.path,
        ]),
      ),
      {
        hostedRunMetadata: `retained/${review.osFamily}/hosted-run-metadata.json`,
        hostedWorkflowPreflight:
          `retained/${review.osFamily}/hosted-workflow-preflight.json`,
        hostedUploadReceipt:
          `retained/${review.osFamily}/hosted-upload-receipt.json`,
        reportJson: `retained/${review.osFamily}/platform-golden.json`,
        reportCsv: `retained/${review.osFamily}/platform-golden-results.csv`,
        reportPdf: `retained/${review.osFamily}/platform-golden-report.pdf`,
        networkHar: `retained/${review.osFamily}/network.har`,
        screenshot: `retained/${review.osFamily}/final-state.png`,
      },
    );
    assert.deepEqual(
      review.decisions.map(({ id }) => id),
      expectedHumanReviewDecisionIds,
    );
    assert.ok(
      review.decisions.every(
        ({ reviewStatus, decision, reviewedEvidenceSha256, comment }) =>
          reviewStatus === 'NOT_REVIEWED' &&
          decision === 'FAIL' &&
          reviewedEvidenceSha256.every((value) => /^REPLACE_/u.test(value)) &&
          /^REPLACE_/u.test(comment),
      ),
    );
    assert.ok(
      Object.values(review.artifacts).every(
        ({ sha256: artifactSha256 }) => /^REPLACE_/u.test(artifactSha256),
      ),
    );
  }
  assert.ok(
    plan.manifest.files.some(
      ({ path, role }) =>
        path === 'tools/record-platform-human-review.mjs' &&
        role === 'platform_human_review_recorder',
    ),
  );
  assert.ok(
    plan.manifest.files.some(
      ({ path, role }) =>
        path === 'tools/write-hosted-workflow-preflight.mjs'
        && role === 'platform_human_review_preflight_validator_dependency',
    ),
  );
  assert.ok(
    plan.manifest.files.some(
      ({ path, role }) =>
        path === 'tools/create-platform-matrix-record.mjs' &&
        role === 'three_platform_matrix_recorder',
    ),
  );
  assert.match(
    readFileSync(
      resolve(
        EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory,
        'tools/record-platform-human-review.mjs',
      ),
      'utf8',
    ),
    /\.\/create-platform-matrix-record\.mjs/u,
  );
  for (const toolName of [
    'create-platform-evidence-record.mjs',
    'create-platform-matrix-record.mjs',
    'record-platform-human-review.mjs',
  ]) {
    const packagedToolHelp = spawnSync(
      process.execPath,
      [
        resolve(
          EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory,
          `tools/${toolName}`,
        ),
        '--help',
      ],
      {
        cwd: EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory,
        encoding: 'utf8',
      },
    );
    assert.equal(
      packagedToolHelp.status,
      0,
      `${toolName} failed:\n${packagedToolHelp.stderr}`,
    );
    assert.match(packagedToolHelp.stdout, /Usage:/u);
  }
  assert.ok(
    plan.manifest.files.some(
      ({ path, role }) =>
        path === '01-platform/platform-human-review-input.template.json' &&
        role === 'platform_human_review_input_template',
    ),
  );
  for (const [slug, { family, input, receipt }] of Object.entries(platformTemplates)) {
    assert.equal(input.environment.os.family, family);
    assert.equal(input.artifacts.release.path, 'Activation-Energy-Studio-v0.2.0.html');
    assert.equal(input.artifacts.release.sha256, plan.lock.release.sha256);
    assert.equal(
      input.artifacts.goldenInput.sha256,
      plan.lock.goldenInput.sha256,
    );
    assert.equal(
      input.artifacts.selfTestJson.path,
      `retained/${slug}/activation-energy-platform-self-test-v0.2.0-pass.json`,
    );
    assert.equal(
      input.artifacts.reportJson.path,
      `retained/${slug}/platform-golden.json`,
    );
    assert.equal(
      input.artifacts.reportCsv.path,
      `retained/${slug}/platform-golden-results.csv`,
    );
    assert.equal(
      input.artifacts.reportPdf.path,
      `retained/${slug}/platform-golden-report.pdf`,
    );
    assert.equal(
      input.artifacts.screenshot.path,
      `retained/${slug}/final-state.png`,
    );
    assert.equal(
      input.protocol.operatorConfirmations.analysisCompleted,
      false,
    );
    assert.equal(
      receipt.schemaVersion,
      'activation-energy-studio/github-actions-artifact-receipt/v1',
    );
    assert.equal(
      receipt.claimBoundary,
      'DECLARED_GITHUB_ACTIONS_UPLOAD_OUTPUT_NOT_AUTHENTICATED_BY_SOFTWARE',
    );
    assert.match(receipt.artifactName, new RegExp(`hosted-platform-${family}`, 'u'));
    assert.match(receipt.artifactDigest, /^REPLACE_/u);
    assert.ok(
      plan.manifest.files.some(
        ({ path: manifestPath, role }) =>
          manifestPath
            === `01-platform/retained/${slug}/hosted-upload-receipt.template.json`
          && role === 'platform_hosted_upload_receipt_template',
      ),
    );
  }
  assert.equal(participant.build.sha256, plan.lock.release.sha256);
  assert.equal(
    participant.schemaVersion,
    'activation-energy-studio/usability-participant-record/v1',
  );
  assert.equal(participant.eligibility.eligible, false);
  assert.equal(participant.consent.recording, false);
  assert.equal(participant.environment.zoomPercent, 100);
  assert.equal(participant.happyPath.completed, false);
  assert.equal(participant.happyPath.macroDecisionCount, null);
  assert.equal(participant.happyPath.semanticUiActivations, null);
  assert.deepEqual(
    participant.evidence.slice(0, 2).map(({ kind }) => kind),
    ['screen-recording', 'audio-recording'],
  );
  assert.equal(
    participant.refusals[0].recordingTimecode.screenRecordingSha256,
    participant.evidence[0].sha256,
  );
  assert.equal(
    participant.comprehension.recordingTimecode.audioRecordingSha256,
    participant.evidence[1].sha256,
  );
  assert.equal(study.evidenceOrigin, 'observed-human-sessions');
  assert.equal(study.participantRecords.length, 5);
  assert.equal(study.secondRaterSelection.method, 'SHA256_SEEDED_ASC_V1');
  assert.equal(study.secondRaterSelection.selectedScenarioIds.length, 10);
  assert.equal(study.secondRaterRatings.length, 10);
  assert.deepEqual(
    study.secondRaterRatings.map(
      ({ participantId, fixtureId }) => `${participantId}:${fixtureId}`,
    ),
    study.secondRaterSelection.selectedScenarioIds,
  );
  assert.equal(study.warningMatrix.length, 8);
  assert.equal(study.coordinator.declarationAccepted, false);
  assert.equal(
    adjudicationTemplate.schemaVersion,
    'activation-energy-studio/external-evidence-adjudication-input/v1',
  );
  assert.deepEqual(
    adjudicationTemplate.lanes.scientific.gateDecisions.map(
      ({ gateId }) => gateId,
    ),
    ['AC-SCI-03', 'AC-VAL-05'],
  );
  assert.deepEqual(
    adjudicationTemplate.lanes.platform.gateDecisions.map(
      ({ gateId }) => gateId,
    ),
    ['AC-PLAT-01', 'AC-PLAT-02'],
  );
  assert.deepEqual(
    adjudicationTemplate.lanes.usability.gateDecisions.map(
      ({ gateId }) => gateId,
    ),
    ['AC-UX-01', 'AC-UX-02', 'AC-UX-03', 'AC-UX-04'],
  );
  assert.ok(
    Object.values(adjudicationTemplate.lanes).every((lane) =>
      lane.gateDecisions.every(
        ({ contentDecision, authenticityDecision }) =>
          contentDecision === 'NOT_VERIFIED'
          && authenticityDecision === 'NOT_VERIFIED',
      ),
    ),
  );
  assert.ok(
    plan.manifest.files.some(
      ({ path: manifestPath, role }) =>
        manifestPath === 'tools/adjudicate-external-evidence.mjs'
        && role === 'external_evidence_adjudication_recorder',
    ),
  );
  assert.match(returnChecklist, /all eight external gates/iu);
  assert.match(returnChecklist, /candidate release manifest left immutable/iu);
});

test('checker rejects stale directory or archive bytes and regeneration repairs them', () => {
  generateExternalValidationKit();
  const readmePath = resolve(
    EXTERNAL_VALIDATION_KIT_PATHS.outputDirectory,
    'README-FIRST.md',
  );
  writeFileSync(readmePath, 'tampered\n');
  assert.throws(() => verifyExternalValidationKit(), /payload is stale/u);

  generateExternalValidationKit();
  writeFileSync(EXTERNAL_VALIDATION_KIT_PATHS.archive, 'tampered');
  assert.throws(() => verifyExternalValidationKit(), /ZIP is stale/u);

  generateExternalValidationKit();
  assert.doesNotThrow(() => verifyExternalValidationKit());
});
