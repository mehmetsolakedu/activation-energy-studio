import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import {
  PLATFORM_HUMAN_REVIEW_DECISION_IDS,
  PLATFORM_HUMAN_REVIEW_INPUT_SCHEMA,
  PLATFORM_HUMAN_REVIEW_RECORD_SCHEMA,
  PLATFORM_HUMAN_REVIEW_RECORD_STATE,
  PlatformHumanReviewValidationError,
  createPlatformHumanReviewRecord,
  main,
  serializePlatformHumanReviewRecord,
  writePlatformHumanReviewRecord,
} from '../scripts/record-platform-human-review.mjs';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const MATRIX_SCRIPT = resolve(PROJECT_ROOT, 'scripts/create-platform-matrix-record.mjs');
const CONTRACT_VERSION = process.env.AES_PLATFORM_VALIDATION_VERSION ?? '0.2.0';
const IS_V032_CONTRACT = CONTRACT_VERSION === '0.3.2';
const temporaryDirectories: string[] = [];

type Family = 'macos' | 'windows11' | 'ubuntu';
type JsonRecord = Record<string, any>;

const FAMILY_CONFIG: Record<
  Family,
  {
    runnerLabel: string;
    platform: string;
    architecture: string;
    runnerOS: string;
    osEdition: string;
    osBuild: string;
    osLocale: string;
    decimalSeparator: '.' | ',';
  }
> = {
  macos: {
    runnerLabel: 'macos-15',
    platform: 'darwin',
    architecture: 'arm64',
    runnerOS: 'macOS',
    osEdition: 'macOS 15.5',
    osBuild: '24F74',
    osLocale: 'tr-TR',
    decimalSeparator: ',',
  },
  windows11: {
    runnerLabel: 'windows-11-arm',
    platform: 'win32',
    architecture: 'arm64',
    runnerOS: 'Windows',
    osEdition: 'Windows 11 Pro',
    osBuild: '26100.4351',
    osLocale: 'en-US',
    decimalSeparator: '.',
  },
  ubuntu: {
    runnerLabel: 'ubuntu-24.04',
    platform: 'linux',
    architecture: 'x64',
    runnerOS: 'Linux',
    osEdition: 'Ubuntu 24.04.2 LTS',
    osBuild: '6.11.0-1018-azure',
    osLocale: 'en-US',
    decimalSeparator: '.',
  },
};

function shaBytes(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function shaFile(path: string): string {
  return shaBytes(readFileSync(path));
}

function portable(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeArtifact(
  root: string,
  family: Family,
  fileName: string,
  bytes: string | Buffer,
): { path: string; absolutePath: string; sha256: string } {
  const absolutePath = join(root, family, fileName);
  writeFileSync(absolutePath, bytes);
  return {
    path: portable(root, absolutePath),
    absolutePath,
    sha256: shaFile(absolutePath),
  };
}

function expectedDecisionHashes(
  id: (typeof PLATFORM_HUMAN_REVIEW_DECISION_IDS)[number],
  sourceSha: string,
  artifacts: Record<string, { sha256: string }>,
): string[] {
  const metadata = artifacts.hostedRunMetadata.sha256;
  const hashes = {
    HAR_NETWORK: [
      sourceSha,
      metadata,
      ...(IS_V032_CONTRACT ? [artifacts.rawCdpEvents.sha256] : []),
      artifacts.networkHar.sha256,
    ],
    SCREENSHOT_UI: [sourceSha, artifacts.screenshot.sha256],
    PDF_VISUAL_QA: [sourceSha, artifacts.reportPdf.sha256],
    JSON_CSV_PDF_CONSISTENCY: [
      sourceSha,
      artifacts.reportJson.sha256,
      artifacts.reportCsv.sha256,
      artifacts.reportPdf.sha256,
    ],
    RUNNER_OS_ARCH_IDENTITY: [
      sourceSha,
      metadata,
      artifacts.hostedWorkflowPreflight.sha256,
      artifacts.hostedUploadReceipt.sha256,
    ],
    DEVIATIONS: [sourceSha, metadata],
  };
  return hashes[id];
}

interface Fixture {
  root: string;
  inputPath: string;
  outputPath: string;
  matrixPath: string;
  input: JsonRecord;
  sourcePaths: Record<Family, string>;
  sourceRecords: Record<Family, JsonRecord>;
  metadataPaths: Record<Family, string>;
  preflightPaths: Record<Family, string>;
  uploadReceiptPaths: Record<Family, string>;
}

function createFixture(
  deviations: Partial<Record<Family, string[]>> = {},
): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'activation-energy-platform-human-review-'));
  temporaryDirectories.push(root);
  const sourcePaths = {} as Record<Family, string>;
  const sourceRecords = {} as Record<Family, JsonRecord>;
  const metadataPaths = {} as Record<Family, string>;
  const preflightPaths = {} as Record<Family, string>;
  const uploadReceiptPaths = {} as Record<Family, string>;
  const reviewArtifacts = {} as Record<Family, Record<string, any>>;
  const sourceHashes = {} as Record<Family, string>;
  const families = Object.keys(FAMILY_CONFIG) as Family[];

  for (const [index, family] of families.entries()) {
    const config = FAMILY_CONFIG[family];
    mkdirSync(join(root, family), { recursive: true });
    const reportJson = writeArtifact(
      root,
      family,
      'platform-golden.json',
      `${JSON.stringify({ family, rows: 36 })}\n`,
    );
    const reportCsv = writeArtifact(
      root,
      family,
      'platform-golden-results.csv',
      `method,alpha,ea\nKAS,0.5,${150 + index}\n`,
    );
    const reportPdf = writeArtifact(
      root,
      family,
      'platform-golden-report.pdf',
      `%PDF-1.7\n${family}\n%%EOF\n`,
    );
    const networkHar = writeArtifact(
      root,
      family,
      'network.har',
      `${JSON.stringify({ log: { version: '1.2', entries: [{ url: 'file:///app.html' }] } })}\n`,
    );
    const rawCdpEvents = IS_V032_CONTRACT
      ? writeArtifact(
          root,
          family,
          'raw-cdp-events.json',
          `${JSON.stringify({
            schema: 'activation-energy-studio/raw-cdp-network-events/v2',
            claimStatus: 'AUTOMATED_RUN_EVIDENCE_AWAITING_HUMAN_REVIEW',
            family,
            events: [{ method: 'Network.requestWillBeSent' }],
          })}\n`,
        )
      : null;
    const screenshot = writeArtifact(
      root,
      family,
      'final-state.png',
      Buffer.concat([
        Buffer.from('89504e470d0a1a0a', 'hex'),
        Buffer.from(`retained screenshot bytes for ${family}`),
      ]),
    );
    const runId = `gha-${family}-9000-1`;
    const startedAt = `2026-07-18T10:0${index}:00.000Z`;
    const endedAt = `2026-07-18T10:1${index}:00.000Z`;
    const navigatorLanguage = config.osLocale;
    const sourceRecord: JsonRecord = {
      schemaVersion: 'activation-energy-studio/platform-evidence-record/v1',
      runId,
      recordStatus: 'VALIDATED_RETAINED_ARTIFACT_SET',
      observer: {
        name: `Human Operator ${index + 1}`,
        organization: 'Activation Energy Validation Laboratory',
      },
      claimBoundary: {
        acPlat01: 'ONE_RUN_EVIDENCE_READY_FOR_REVIEW',
        acPlat02: 'AWAITING_THREE_PLATFORM_SCIENTIFIC_JSON_COMPARISON',
        statement: 'One retained run; not a platform PASS.',
      },
      timeWindow: { startedAt, endedAt },
      environment: {
        os: {
          family,
          edition: config.osEdition,
          build: config.osBuild,
          architecture: config.architecture,
        },
        runtime: {
          documentProtocol: 'file:',
          onlineStateDuringRun: false,
          userAgent: `Fixture ${family}`,
          javascriptEngine: 'V8 fixture',
        },
        browser: {
          name: 'Google Chrome (headless)',
          version: '150.0.7871.182',
          engine: 'Chromium 150; V8 fixture',
          navigatorLanguage,
          navigatorLanguages: [navigatorLanguage, navigatorLanguage === 'tr-TR' ? 'en-US' : 'tr-TR'],
        },
        locale: {
          osLocale: config.osLocale,
          timeZone: 'Europe/Istanbul',
          decimalSeparator: config.decimalSeparator,
        },
      },
      artifacts: {
        release: { path: 'release.html', sha256: '1'.repeat(64) },
        goldenInput: { path: 'golden.csv', sha256: '2'.repeat(64) },
        selfTestJson: {
          path: 'self-test.json',
          sha256: String.fromCharCode(97 + index).repeat(64),
        },
        reportJson: {
          path: basename(reportJson.absolutePath),
          sha256: reportJson.sha256,
        },
        reportCsv: {
          path: basename(reportCsv.absolutePath),
          sha256: reportCsv.sha256,
        },
        reportPdf: {
          path: basename(reportPdf.absolutePath),
          sha256: reportPdf.sha256,
        },
        networkHar: {
          path: basename(networkHar.absolutePath),
          sha256: networkHar.sha256,
        },
        screenshot: {
          path: basename(screenshot.absolutePath),
          sha256: screenshot.sha256,
        },
        ...(IS_V032_CONTRACT
          ? {
              rawCdpEvents: {
                path: basename(rawCdpEvents!.absolutePath),
                sha256: rawCdpEvents!.sha256,
              },
            }
          : {}),
      },
      selfTest: {
        recordStatus: 'PASS',
        platformGateStatus: 'NOT_CLOSED_BY_SELF_TEST',
        passedCheckCount: 11,
        inputSha256: '2'.repeat(64),
        scientificBuildSha256: '4'.repeat(64),
        scientificPayloadSha256: '5'.repeat(64),
      },
      protocolObservation: {
        networkCapture: {
          externalRequestAttempts: 0,
          totalEntries: 1,
          localRequestEntries: 1,
          pageCount: 1,
          creator: { name: 'Activation Energy Studio hosted CDP harness', version: '1' },
        },
        deviations: deviations[family] ?? [],
      },
      visualEvidence: {
        contentReviewStatus: 'AWAITING_HUMAN_VISUAL_REVIEW',
      },
      scientificReport: { canonicalSha256: '6'.repeat(64) },
      ...(IS_V032_CONTRACT
        ? {
            hostedOrigin: {
              rawCdpEvidence: {
                sha256: rawCdpEvents!.sha256,
              },
            },
          }
        : {}),
    };
    const sourcePath = join(root, family, `${family}-evidence-record.json`);
    writeJson(sourcePath, sourceRecord);
    sourcePaths[family] = sourcePath;
    sourceRecords[family] = sourceRecord;
    sourceHashes[family] = shaFile(sourcePath);

    const preflight = writeArtifact(
      root,
      family,
      'hosted-workflow-preflight.json',
      `${JSON.stringify(
        {
          schema: 'activation-energy-studio/hosted-workflow-preflight/v1',
          releaseVersion: CONTRACT_VERSION,
          claimStatus: 'WORKFLOW_STARTED_DIAGNOSTIC_NOT_PLATFORM_EVIDENCE',
          startedAtUtc: `2026-07-18T09:5${index}:00.000Z`,
          declaredTarget: {
            runnerLabel: config.runnerLabel,
            osFamily: family,
            nodeArchitecture: config.architecture,
          },
          observedEnvironment: {
            githubActions: 'true',
            runnerEnvironment: 'github-hosted',
            runnerOs: config.runnerOS,
            runnerArchitecture:
              config.architecture === 'x64' ? 'X64' : 'ARM64',
            imageOs: config.runnerLabel,
            imageVersion: '20260713.1',
            repository: 'thermal-lab/activation-energy-studio',
            workflow: IS_V032_CONTRACT
              ? 'Hosted Platform Validation v0.3.2'
              : 'Hosted Platform Validation',
            workflowRef:
              `thermal-lab/activation-energy-studio/.github/workflows/${IS_V032_CONTRACT ? 'platform-validation-v032.yml' : 'platform-validation.yml'}@refs/heads/main`,
            runId: '9000',
            runAttempt: '1',
            commitSha: '7'.repeat(40),
            gitRef: 'refs/heads/main',
            serverUrl: 'https://github.com',
          },
          runtime: {
            nodeVersion: 'v22.22.3',
            nodeArchitecture: config.architecture,
            nodeArchitectureScope:
              'BOOTSTRAP_NODE_BEFORE_SETUP_NODE_MAY_DIFFER_FROM_DECLARED_TARGET',
            platform: config.platform,
          },
          evidenceBoundary: {
            platformEvidence: false,
            softwareAuthenticatedRunnerIdentity: false,
            acceptanceGatesAutomaticallyApplied: false,
            humanReviewRequired: true,
            purpose:
              'Retain a diagnostic file when dependency installation or a pre-browser hosted check fails before the browser harness can write evidence.',
          },
        },
        null,
        2,
      )}\n`,
    );
    preflightPaths[family] = preflight.absolutePath;
    const metadata: JsonRecord = {
      schema: 'activation-energy-studio/hosted-platform-run/v1',
      claimStatus: 'AUTOMATED_RUN_EVIDENCE_AWAITING_HUMAN_REVIEW',
      humanReviewCompleted: false,
      operatorConfirmationsCompleted: false,
      family,
      runner: {
        runnerLabel: config.runnerLabel,
        family,
        platform: config.platform,
        architecture: config.architecture,
        osEdition: config.osEdition,
      },
      osBuild: config.osBuild,
      osLocale: config.osLocale,
      reportedArchitecture: config.architecture,
      nodeArchitecture: config.architecture,
      workflowPreflight: {
        path: 'hosted-workflow-preflight.json',
        bytes: readFileSync(preflight.absolutePath).length,
        sha256: preflight.sha256,
      },
      ...(IS_V032_CONTRACT
        ? {
            platformCriteriaClosed: [],
            claimBoundary:
              'Automated hosted evidence awaits human review and does not close a platform criterion by itself.',
            retainedFiles: {
              rawCdpEvents: {
                path: 'raw-cdp-events.json',
                bytes: readFileSync(rawCdpEvents!.absolutePath).length,
                sha256: rawCdpEvents!.sha256,
              },
            },
          }
        : {}),
      provenance: {
        provider: 'GitHub Actions',
        repository: 'thermal-lab/activation-energy-studio',
        workflow: IS_V032_CONTRACT
          ? 'Hosted Platform Validation v0.3.2'
          : 'Hosted Platform Validation',
        workflowRef:
          `thermal-lab/activation-energy-studio/.github/workflows/${IS_V032_CONTRACT ? 'platform-validation-v032.yml' : 'platform-validation.yml'}@refs/heads/main`,
        runId: '9000',
        runAttempt: '1',
        runUrl:
          'https://github.com/thermal-lab/activation-energy-studio/actions/runs/9000/attempts/1',
        commitSha: '7'.repeat(40),
        gitRef: 'refs/heads/main',
        runnerEnvironment: 'github-hosted',
        runnerName: `GitHub Actions ${family}`,
        runnerOS: config.runnerOS,
        runnerArchitecture: config.architecture === 'x64' ? 'X64' : 'ARM64',
        imageOS: config.runnerLabel,
        imageVersion: '20260713.1',
        browserExpectation: {
          product: 'Google Chrome',
          expectedMajor: 150,
          environment: 'AES_EXPECTED_GOOGLE_CHROME_MAJOR',
        },
        actions: {
          checkout: {
            commitSha: 'd23441a48e516b6c34aea4fa41551a30e30af803',
            environment: 'AES_ACTION_CHECKOUT_SHA',
          },
          setupNode: {
            commitSha: '249970729cb0ef3589644e2896645e5dc5ba9c38',
            environment: 'AES_ACTION_SETUP_NODE_SHA',
          },
          uploadArtifact: {
            commitSha: 'b7c566a772e6b6bfb58ed0dc250532a479d7789f',
            environment: 'AES_ACTION_UPLOAD_ARTIFACT_SHA',
          },
        },
      },
      runtime: {
        navigatorLanguage,
        navigatorLanguages: sourceRecord.environment.browser.navigatorLanguages,
        timeZone: 'Europe/Istanbul',
        decimalSeparator: config.decimalSeparator,
      },
      startedAt,
      endedAt,
    };
    const metadataPath = join(root, family, 'hosted-run-metadata.json');
    writeJson(metadataPath, metadata);
    metadataPaths[family] = metadataPath;
    const artifactId = String(9100 + index);
    const uploadReceipt = writeArtifact(
      root,
      family,
      'hosted-upload-receipt.json',
      `${JSON.stringify(
        {
          schemaVersion:
            'activation-energy-studio/github-actions-artifact-receipt/v1',
          provider: 'GitHub Actions',
          repository: metadata.provenance.repository,
          workflow: metadata.provenance.workflow,
          runId: metadata.provenance.runId,
          runAttempt: metadata.provenance.runAttempt,
          commitSha: metadata.provenance.commitSha,
          artifactId,
          artifactName:
            `hosted-platform-${IS_V032_CONTRACT ? 'v0.3.2-' : ''}${family}-${metadata.provenance.runId}-${metadata.provenance.runAttempt}`,
          artifactUrl:
            `https://github.com/${metadata.provenance.repository}/actions/runs/${metadata.provenance.runId}/artifacts/${artifactId}`,
          artifactDigest: String.fromCharCode(100 + index).repeat(64),
          capturedAtUtc: `2026-07-18T10:2${index}:00.000Z`,
          claimBoundary:
            'DECLARED_GITHUB_ACTIONS_UPLOAD_OUTPUT_NOT_AUTHENTICATED_BY_SOFTWARE',
        },
        null,
        2,
      )}\n`,
    );
    uploadReceiptPaths[family] = uploadReceipt.absolutePath;
    reviewArtifacts[family] = {
      hostedRunMetadata: {
        path: portable(root, metadataPath),
        absolutePath: metadataPath,
        sha256: shaFile(metadataPath),
      },
      hostedWorkflowPreflight: preflight,
      hostedUploadReceipt: uploadReceipt,
      reportJson,
      reportCsv,
      reportPdf,
      networkHar,
      screenshot,
      ...(IS_V032_CONTRACT ? { rawCdpEvents } : {}),
    };
  }

  const matrixPath = join(root, 'platform-matrix-record.json');
  execFileSync(
    process.execPath,
    [
      MATRIX_SCRIPT,
      '--record',
      sourcePaths.macos,
      '--record',
      sourcePaths.windows11,
      '--record',
      sourcePaths.ubuntu,
      '--output',
      matrixPath,
    ],
    { cwd: PROJECT_ROOT, stdio: 'pipe' },
  );

  const input: JsonRecord = {
    schemaVersion: PLATFORM_HUMAN_REVIEW_INPUT_SCHEMA,
    reviewId: 'platform-human-review-2026-07-18',
    locks: {
      matrix: { path: portable(root, matrixPath), sha256: shaFile(matrixPath) },
      sourceRecords: families.map((family) => ({
        osFamily: family,
        path: portable(root, sourcePaths[family]),
        sha256: sourceHashes[family],
      })),
    },
    reviewer: {
      name: 'Dr. Ayşe Kaya',
      affiliation: 'Independent Thermal Analysis Laboratory',
      professionalProfile: 'https://orcid.org/0000-0002-1825-0097',
      role: 'Independent platform evidence reviewer',
      relevantExperience: 'Twelve years of thermal-analysis software and laboratory QA.',
      declarations: {
        personallyReviewedAllReferencedEvidence: true,
        understandsIdentityIsNotAuthenticatedBySoftware: true,
        understandsAcceptanceGatesAreNotAutomaticallyClosed: true,
      },
    },
    review: {
      startedAtUtc: '2026-07-18T11:00:00.000Z',
      endedAtUtc: '2026-07-18T12:00:00.000Z',
      recordedAtUtc: '2026-07-18T12:05:00.000Z',
      environment: {
        operatingSystem: 'macOS 15.5',
        browser: 'Google Chrome 150',
        locale: 'tr-TR',
      },
    },
    platformReviews: families.map((family, index) => {
      const artifacts = reviewArtifacts[family];
      const assessments = (deviations[family] ?? []).map((deviation) => ({
        deviation,
        disposition: 'ACCEPTED_NON_MATERIAL',
        comment: `The retained ${family} deviation was reviewed and is non-material.`,
      }));
      return {
        osFamily: family,
        runId: sourceRecords[family].runId,
        sourceRecordSha256: sourceHashes[family],
        startedAtUtc: `2026-07-18T11:${index}0:00.000Z`,
        endedAtUtc: `2026-07-18T11:${index}5:00.000Z`,
        artifacts: Object.fromEntries(
          Object.entries(artifacts).map(([role, artifact]) => [
            role,
            { path: artifact.path, sha256: artifact.sha256 },
          ]),
        ),
        decisions: PLATFORM_HUMAN_REVIEW_DECISION_IDS.map((id) => ({
          id,
          reviewStatus: 'REVIEWED',
          decision: 'PASS',
          reviewedEvidenceSha256: expectedDecisionHashes(
            id,
            sourceHashes[family],
            artifacts,
          ),
          comment: `${family} ${id} retained evidence was personally reviewed.`,
          ...(id === 'DEVIATIONS' ? { deviationAssessments: assessments } : {}),
        })),
      };
    }),
    reviewerMatrixDisposition: 'PASS',
  };
  const inputPath = join(root, 'platform-human-review-input.json');
  writeJson(inputPath, input);
  return {
    root,
    inputPath,
    outputPath: join(root, 'platform-human-review-record.json'),
    matrixPath,
    input,
    sourcePaths,
    sourceRecords,
    metadataPaths,
    preflightPaths,
    uploadReceiptPaths,
  };
}

function saveInput(fixture: Fixture): void {
  writeJson(fixture.inputPath, fixture.input);
}

function platformInput(fixture: Fixture, family: Family): JsonRecord {
  return fixture.input.platformReviews.find(
    (platform: JsonRecord) => platform.osFamily === family,
  );
}

function decisionInput(
  fixture: Fixture,
  family: Family,
  id: (typeof PLATFORM_HUMAN_REVIEW_DECISION_IDS)[number],
): JsonRecord {
  return platformInput(fixture, family).decisions.find(
    (decision: JsonRecord) => decision.id === id,
  );
}

function replaceEvidenceHash(
  platform: JsonRecord,
  oldHash: string,
  newHash: string,
): void {
  for (const decision of platform.decisions) {
    decision.reviewedEvidenceSha256 = decision.reviewedEvidenceSha256.map((hash: string) =>
      hash === oldHash ? newHash : hash,
    );
  }
}

function rehashReviewArtifact(
  fixture: Fixture,
  family: Family,
  role: string,
): void {
  const platform = platformInput(fixture, family);
  const descriptor = platform.artifacts[role];
  const oldHash = descriptor.sha256;
  const absolutePath = resolve(
    fixture.root,
    ...String(descriptor.path).split('/'),
  );
  descriptor.sha256 = shaFile(absolutePath);
  replaceEvidenceHash(platform, oldHash, descriptor.sha256);
}

function rehashPreflightAndMetadata(
  fixture: Fixture,
  family: Family,
): void {
  rehashReviewArtifact(fixture, family, 'hostedWorkflowPreflight');
  const metadata = JSON.parse(readFileSync(fixture.metadataPaths[family], 'utf8'));
  const preflightDescriptor = platformInput(
    fixture,
    family,
  ).artifacts.hostedWorkflowPreflight;
  metadata.workflowPreflight = {
    path: 'hosted-workflow-preflight.json',
    bytes: readFileSync(fixture.preflightPaths[family]).length,
    sha256: preflightDescriptor.sha256,
  };
  writeJson(fixture.metadataPaths[family], metadata);
  rehashReviewArtifact(fixture, family, 'hostedRunMetadata');
}

function expectCode(callback: () => unknown, code: string): void {
  expect(callback).toThrowError(
    expect.objectContaining({
      name: 'PlatformHumanReviewValidationError',
      code,
    }),
  );
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((path) => {
    rmSync(path, { recursive: true, force: true });
  });
});

describe('platform human-review recorder', () => {
  it('hash-binds three OS records, hosted provenance, artifacts, and all decisions without closing gates', () => {
    const fixture = createFixture();
    const record = createPlatformHumanReviewRecord({ inputPath: fixture.inputPath });

    expect(record.schemaVersion).toBe(PLATFORM_HUMAN_REVIEW_RECORD_SCHEMA);
    expect(record.recordState).toBe(PLATFORM_HUMAN_REVIEW_RECORD_STATE);
    expect(record.platforms.map((platform) => platform.osFamily)).toEqual([
      'macos',
      'windows11',
      'ubuntu',
    ]);
    expect(record.platforms.every((platform) => platform.decisions.length === 6)).toBe(true);
    expect(record.platforms.every((platform) => platform.reviewerDisposition === 'PASS')).toBe(
      true,
    );
    expect(record.matrixIntegrity.status).toBe('TECHNICALLY_VERIFIED');
    expect(record.reviewerMatrixDisposition).toBe('PASS');
    expect(record.eligibleForHumanGateDisposition).toBe(true);
    expect(record.acceptanceGateStatus).toBe('NOT_AUTOMATICALLY_APPLIED');
    expect(record.authenticityStatus).toBe('NOT_VERIFIED_BY_SOFTWARE');
    expect(record.gateDispositionBoundary.acPlat01).not.toBe('PASS');
    expect(record.gateDispositionBoundary.acPlat02).not.toBe('PASS');
    expect(record.retainedArtifacts).toHaveLength(IS_V032_CONTRACT ? 31 : 28);
    expect(
      record.platforms.every(
        (platform) =>
          platform.runProvenance.workflowPreflight.claimStatus
          === 'WORKFLOW_STARTED_DIAGNOSTIC_NOT_PLATFORM_EVIDENCE',
      ),
    ).toBe(true);
    expect(
      record.platforms.every(
        (platform) =>
          platform.runProvenance.uploadReceipt.claimBoundary
          === 'DECLARED_GITHUB_ACTIONS_UPLOAD_OUTPUT_NOT_AUTHENTICATED_BY_SOFTWARE',
      ),
    ).toBe(true);
    expect(record.sourceInput.sha256).toBe(shaFile(fixture.inputPath));
  });

  it('serializes deterministically and writes atomically without changing the structural boundary', () => {
    const fixture = createFixture();
    const expected = createPlatformHumanReviewRecord({ inputPath: fixture.inputPath });
    const written = writePlatformHumanReviewRecord({
      inputPath: fixture.inputPath,
      outputPath: fixture.outputPath,
    });
    expect(written).toEqual(expected);
    expect(readFileSync(fixture.outputPath, 'utf8')).toBe(
      serializePlatformHumanReviewRecord(expected),
    );
    expect(JSON.parse(readFileSync(fixture.outputPath, 'utf8')).recordState).toBe(
      PLATFORM_HUMAN_REVIEW_RECORD_STATE,
    );
  });

  it('rejects a declared matrix hash that differs from actual bytes', () => {
    const fixture = createFixture();
    fixture.input.locks.matrix.sha256 = '0'.repeat(64);
    saveInput(fixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: fixture.inputPath }),
      'REVIEW_HASH_MISMATCH',
    );
  });

  it('rejects a source record changed after its hash was declared', () => {
    const fixture = createFixture();
    writeFileSync(fixture.sourcePaths.macos, '\n', { flag: 'a' });
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: fixture.inputPath }),
      'REVIEW_HASH_MISMATCH',
    );
  });

  it('rejects a rehashed source record when the actual matrix no longer derives from it', () => {
    const fixture = createFixture();
    fixture.sourceRecords.macos.observer.name = 'Changed Human Operator';
    writeJson(fixture.sourcePaths.macos, fixture.sourceRecords.macos);
    fixture.input.locks.sourceRecords[0].sha256 = shaFile(fixture.sourcePaths.macos);
    saveInput(fixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: fixture.inputPath }),
      'REVIEW_MATRIX_SOURCE_MISMATCH',
    );
  });

  it('rejects a rehashed matrix object that is not the exact recomputed matrix', () => {
    const fixture = createFixture();
    const matrix = JSON.parse(readFileSync(fixture.matrixPath, 'utf8'));
    matrix.claimBoundary.statement = 'Altered but rehashed matrix statement.';
    writeJson(fixture.matrixPath, matrix);
    fixture.input.locks.matrix.sha256 = shaFile(fixture.matrixPath);
    saveInput(fixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: fixture.inputPath }),
      'REVIEW_MATRIX_SOURCE_MISMATCH',
    );
  });

  it('rejects duplicate source-record locks and duplicate platform reviews', () => {
    const sourceFixture = createFixture();
    sourceFixture.input.locks.sourceRecords[1] = structuredClone(
      sourceFixture.input.locks.sourceRecords[0],
    );
    saveInput(sourceFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: sourceFixture.inputPath }),
      'REVIEW_SOURCE_SET_INVALID',
    );

    const platformFixture = createFixture();
    platformFixture.input.platformReviews[1] = structuredClone(
      platformFixture.input.platformReviews[0],
    );
    saveInput(platformFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: platformFixture.inputPath }),
      'REVIEW_PLATFORM_SET_INVALID',
    );
  });

  it('rejects placeholder reviewer identity and incomplete reviewer declarations', () => {
    const placeholderFixture = createFixture();
    placeholderFixture.input.reviewer.name = 'REPLACE_WITH_REAL_HUMAN';
    saveInput(placeholderFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: placeholderFixture.inputPath }),
      'REVIEW_PLACEHOLDER',
    );

    const declarationFixture = createFixture();
    declarationFixture.input.reviewer.declarations.personallyReviewedAllReferencedEvidence =
      false;
    saveInput(declarationFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: declarationFixture.inputPath }),
      'REVIEW_DECLARATION_INVALID',
    );
  });

  it('rejects impossible global and per-platform review timelines', () => {
    const globalFixture = createFixture();
    globalFixture.input.review.recordedAtUtc = '2026-07-18T11:59:00.000Z';
    saveInput(globalFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: globalFixture.inputPath }),
      'REVIEW_TIME_ORDER_INVALID',
    );

    const runFixture = createFixture();
    platformInput(runFixture, 'macos').startedAtUtc = '2026-07-18T10:05:00.000Z';
    saveInput(runFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: runFixture.inputPath }),
      'REVIEW_TIME_ORDER_INVALID',
    );
  });

  it('rejects calendar-impossible UTC values before applying timeline rules', () => {
    const globalFixture = createFixture();
    globalFixture.input.review.startedAtUtc =
      '2026-02-29T11:00:00.000Z';
    saveInput(globalFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: globalFixture.inputPath }),
      'REVIEW_INVALID_UTC_TIME',
    );

    const receiptFixture = createFixture();
    const receipt = JSON.parse(
      readFileSync(receiptFixture.uploadReceiptPaths.macos, 'utf8'),
    );
    receipt.capturedAtUtc = '2026-02-29T10:20:00.000Z';
    writeJson(receiptFixture.uploadReceiptPaths.macos, receipt);
    rehashReviewArtifact(receiptFixture, 'macos', 'hostedUploadReceipt');
    saveInput(receiptFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: receiptFixture.inputPath }),
      'REVIEW_INVALID_UTC_TIME',
    );
  });

  it('rejects tampered hosted metadata and rehashed self-hosted provenance', () => {
    const hashFixture = createFixture();
    writeFileSync(hashFixture.metadataPaths.macos, '\n', { flag: 'a' });
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: hashFixture.inputPath }),
      'REVIEW_HASH_MISMATCH',
    );

    const provenanceFixture = createFixture();
    const metadata = JSON.parse(readFileSync(provenanceFixture.metadataPaths.macos, 'utf8'));
    metadata.provenance.runnerEnvironment = 'self-hosted';
    writeJson(provenanceFixture.metadataPaths.macos, metadata);
    rehashReviewArtifact(provenanceFixture, 'macos', 'hostedRunMetadata');
    saveInput(provenanceFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: provenanceFixture.inputPath }),
      'REVIEW_HOSTED_PROVENANCE_INVALID',
    );
  });

  it('rejects non-canonical GitHub run URLs, workflow identity, and action pins', () => {
    const mutations: Array<(metadata: JsonRecord) => void> = [
      (metadata) => {
        metadata.provenance.runUrl =
          'https://example.com/thermal-lab/activation-energy-studio/actions/runs/9000/attempts/1';
      },
      (metadata) => {
        metadata.provenance.runUrl += '?forged=true';
      },
      (metadata) => {
        metadata.provenance.workflow = 'Different Workflow';
      },
      (metadata) => {
        metadata.provenance.workflowRef =
          'thermal-lab/activation-energy-studio/.github/workflows/other.yml@refs/heads/main';
      },
      (metadata) => {
        metadata.provenance.actions.checkout.commitSha = '8'.repeat(40);
      },
    ];
    for (const mutate of mutations) {
      const fixture = createFixture();
      const metadata = JSON.parse(readFileSync(fixture.metadataPaths.macos, 'utf8'));
      mutate(metadata);
      writeJson(fixture.metadataPaths.macos, metadata);
      rehashReviewArtifact(fixture, 'macos', 'hostedRunMetadata');
      saveInput(fixture);
      expectCode(
        () => createPlatformHumanReviewRecord({ inputPath: fixture.inputPath }),
        'REVIEW_HOSTED_PROVENANCE_INVALID',
      );
    }
  });

  it('requires the actual strict preflight bytes and cross-binds them to hosted metadata', () => {
    const tamperedFixture = createFixture();
    writeFileSync(tamperedFixture.preflightPaths.macos, '\n', { flag: 'a' });
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: tamperedFixture.inputPath }),
      'REVIEW_HASH_MISMATCH',
    );

    const schemaFixture = createFixture();
    const schemaPreflight = JSON.parse(
      readFileSync(schemaFixture.preflightPaths.macos, 'utf8'),
    );
    schemaPreflight.unexpected = true;
    writeJson(schemaFixture.preflightPaths.macos, schemaPreflight);
    rehashPreflightAndMetadata(schemaFixture, 'macos');
    saveInput(schemaFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: schemaFixture.inputPath }),
      'REVIEW_PREFLIGHT_INVALID',
    );

    const provenanceFixture = createFixture();
    const provenancePreflight = JSON.parse(
      readFileSync(provenanceFixture.preflightPaths.macos, 'utf8'),
    );
    provenancePreflight.observedEnvironment.commitSha = '8'.repeat(40);
    writeJson(provenanceFixture.preflightPaths.macos, provenancePreflight);
    rehashPreflightAndMetadata(provenanceFixture, 'macos');
    saveInput(provenanceFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: provenanceFixture.inputPath }),
      'REVIEW_PREFLIGHT_PROVENANCE_MISMATCH',
    );

    const descriptorFixture = createFixture();
    const descriptorMetadata = JSON.parse(
      readFileSync(descriptorFixture.metadataPaths.macos, 'utf8'),
    );
    descriptorMetadata.workflowPreflight.bytes += 1;
    writeJson(descriptorFixture.metadataPaths.macos, descriptorMetadata);
    rehashReviewArtifact(descriptorFixture, 'macos', 'hostedRunMetadata');
    saveInput(descriptorFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: descriptorFixture.inputPath }),
      'REVIEW_PREFLIGHT_BINDING_MISMATCH',
    );

    const impossibleTimeFixture = createFixture();
    const impossibleTimePreflight = JSON.parse(
      readFileSync(impossibleTimeFixture.preflightPaths.macos, 'utf8'),
    );
    impossibleTimePreflight.startedAtUtc =
      '2026-02-29T09:50:00.000Z';
    writeJson(
      impossibleTimeFixture.preflightPaths.macos,
      impossibleTimePreflight,
    );
    rehashPreflightAndMetadata(impossibleTimeFixture, 'macos');
    saveInput(impossibleTimeFixture);
    expectCode(
      () =>
        createPlatformHumanReviewRecord({
          inputPath: impossibleTimeFixture.inputPath,
        }),
      'REVIEW_PREFLIGHT_INVALID',
    );
  });

  it('rejects every inconsistent GitHub Actions artifact-receipt field and time boundary', () => {
    const mutations: Array<(receipt: JsonRecord) => void> = [
      (receipt) => {
        receipt.schemaVersion = 'invalid/schema';
      },
      (receipt) => {
        receipt.provider = 'Other Provider';
      },
      (receipt) => {
        receipt.repository = 'other/repository';
      },
      (receipt) => {
        receipt.workflow = 'Different Workflow';
      },
      (receipt) => {
        receipt.runId = '9001';
      },
      (receipt) => {
        receipt.runAttempt = '2';
      },
      (receipt) => {
        receipt.commitSha = '8'.repeat(40);
      },
      (receipt) => {
        receipt.artifactId = '0';
      },
      (receipt) => {
        receipt.artifactName = 'wrong-name';
      },
      (receipt) => {
        receipt.artifactUrl = 'https://github.com/wrong';
      },
      (receipt) => {
        receipt.artifactDigest = 'A'.repeat(64);
      },
      (receipt) => {
        receipt.capturedAtUtc = '2026-07-18T10:10:00.000Z';
      },
      (receipt) => {
        receipt.capturedAtUtc = '2026-07-18T11:01:00.000Z';
      },
      (receipt) => {
        receipt.claimBoundary = 'AUTHENTICATED';
      },
    ];
    for (const mutate of mutations) {
      const fixture = createFixture();
      const receipt = JSON.parse(
        readFileSync(fixture.uploadReceiptPaths.macos, 'utf8'),
      );
      mutate(receipt);
      writeJson(fixture.uploadReceiptPaths.macos, receipt);
      rehashReviewArtifact(fixture, 'macos', 'hostedUploadReceipt');
      saveInput(fixture);
      expectCode(
        () => createPlatformHumanReviewRecord({ inputPath: fixture.inputPath }),
        'REVIEW_UPLOAD_RECEIPT_INVALID',
      );
    }
  });

  it('rejects rehashed runner/OS/architecture and locale contradictions', () => {
    const runnerFixture = createFixture();
    const runnerMetadata = JSON.parse(
      readFileSync(runnerFixture.metadataPaths.windows11, 'utf8'),
    );
    runnerMetadata.runner.runnerLabel = 'ubuntu-24.04';
    writeJson(runnerFixture.metadataPaths.windows11, runnerMetadata);
    rehashReviewArtifact(runnerFixture, 'windows11', 'hostedRunMetadata');
    saveInput(runnerFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: runnerFixture.inputPath }),
      'REVIEW_RUNNER_IDENTITY_MISMATCH',
    );

    const localeFixture = createFixture();
    const localeMetadata = JSON.parse(
      readFileSync(localeFixture.metadataPaths.macos, 'utf8'),
    );
    localeMetadata.runtime.decimalSeparator = '.';
    writeJson(localeFixture.metadataPaths.macos, localeMetadata);
    rehashReviewArtifact(localeFixture, 'macos', 'hostedRunMetadata');
    saveInput(localeFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: localeFixture.inputPath }),
      'REVIEW_LOCALE_MISMATCH',
    );
  });

  it('rejects missing, duplicate, unknown, and unreviewed decisions', () => {
    const missingFixture = createFixture();
    platformInput(missingFixture, 'macos').decisions.pop();
    saveInput(missingFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: missingFixture.inputPath }),
      'REVIEW_DECISION_SET_INVALID',
    );

    const duplicateFixture = createFixture();
    platformInput(duplicateFixture, 'macos').decisions[1] = structuredClone(
      platformInput(duplicateFixture, 'macos').decisions[0],
    );
    saveInput(duplicateFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: duplicateFixture.inputPath }),
      'REVIEW_DECISION_SET_INVALID',
    );

    const unknownFixture = createFixture();
    platformInput(unknownFixture, 'macos').decisions[0].id = 'UNKNOWN_DECISION';
    saveInput(unknownFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: unknownFixture.inputPath }),
      'REVIEW_DECISION_SET_INVALID',
    );

    const unreviewedFixture = createFixture();
    decisionInput(unreviewedFixture, 'macos', 'HAR_NETWORK').reviewStatus = 'NOT_REVIEWED';
    saveInput(unreviewedFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: unreviewedFixture.inputPath }),
      'REVIEW_UNREVIEWED',
    );
  });

  it('rejects missing, duplicate, or wrong decision evidence hashes', () => {
    const wrongFixture = createFixture();
    decisionInput(wrongFixture, 'macos', 'HAR_NETWORK').reviewedEvidenceSha256[0] =
      'f'.repeat(64);
    saveInput(wrongFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: wrongFixture.inputPath }),
      'REVIEW_EVIDENCE_BINDING_MISMATCH',
    );

    const duplicateFixture = createFixture();
    const hashes = decisionInput(
      duplicateFixture,
      'macos',
      'JSON_CSV_PDF_CONSISTENCY',
    ).reviewedEvidenceSha256;
    hashes[1] = hashes[0];
    saveInput(duplicateFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: duplicateFixture.inputPath }),
      'REVIEW_EVIDENCE_BINDING_MISMATCH',
    );
  });

  it('rejects artifact tampering and rehashed artifacts that differ from source-record hashes', () => {
    const tamperedFixture = createFixture();
    const csvPath = resolve(
      tamperedFixture.root,
      ...platformInput(tamperedFixture, 'ubuntu').artifacts.reportCsv.path.split('/'),
    );
    writeFileSync(csvPath, 'tampered\n', { flag: 'a' });
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: tamperedFixture.inputPath }),
      'REVIEW_HASH_MISMATCH',
    );

    const reboundFixture = createFixture();
    const reboundPath = resolve(
      reboundFixture.root,
      ...platformInput(reboundFixture, 'ubuntu').artifacts.reportCsv.path.split('/'),
    );
    writeFileSync(reboundPath, 'tampered and rehashed\n', { flag: 'a' });
    rehashReviewArtifact(reboundFixture, 'ubuntu', 'reportCsv');
    saveInput(reboundFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: reboundFixture.inputPath }),
      'REVIEW_EVIDENCE_BINDING_MISMATCH',
    );
  });

  it.runIf(IS_V032_CONTRACT)(
    'requires raw CDP review evidence and rejects a hash-rebound raw substitution',
    () => {
      const missingFixture = createFixture();
      delete platformInput(missingFixture, 'macos').artifacts.rawCdpEvents;
      saveInput(missingFixture);
      expectCode(
        () => createPlatformHumanReviewRecord({ inputPath: missingFixture.inputPath }),
        'REVIEW_INVALID_OBJECT',
      );

      const substitutedFixture = createFixture();
      const platform = platformInput(substitutedFixture, 'macos');
      const rawPath = resolve(
        substitutedFixture.root,
        ...String(platform.artifacts.rawCdpEvents.path).split('/'),
      );
      writeFileSync(rawPath, '{"tampered":true}\n');
      rehashReviewArtifact(substitutedFixture, 'macos', 'rawCdpEvents');
      const metadata = JSON.parse(
        readFileSync(substitutedFixture.metadataPaths.macos, 'utf8'),
      );
      metadata.retainedFiles.rawCdpEvents = {
        path: 'raw-cdp-events.json',
        bytes: readFileSync(rawPath).length,
        sha256: shaFile(rawPath),
      };
      writeJson(substitutedFixture.metadataPaths.macos, metadata);
      rehashReviewArtifact(substitutedFixture, 'macos', 'hostedRunMetadata');
      saveInput(substitutedFixture);
      expectCode(
        () => createPlatformHumanReviewRecord({ inputPath: substitutedFixture.inputPath }),
        'REVIEW_EVIDENCE_BINDING_MISMATCH',
      );
    },
  );

  it('rejects placeholder comments, unknown input fields, and unsafe paths', () => {
    const placeholderFixture = createFixture();
    decisionInput(placeholderFixture, 'macos', 'SCREENSHOT_UI').comment = 'TBD';
    saveInput(placeholderFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: placeholderFixture.inputPath }),
      'REVIEW_PLACEHOLDER',
    );

    const unknownFixture = createFixture();
    unknownFixture.input.acceptanceGateStatus = 'PASS';
    saveInput(unknownFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: unknownFixture.inputPath }),
      'REVIEW_UNKNOWN_FIELD',
    );

    const pathFixture = createFixture();
    pathFixture.input.locks.matrix.path = '../platform-matrix-record.json';
    saveInput(pathFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: pathFixture.inputPath }),
      'REVIEW_PATH_INVALID',
    );
  });

  it('rejects false overall PASS but preserves a coherent negative human review', () => {
    const falsePassFixture = createFixture();
    decisionInput(falsePassFixture, 'windows11', 'PDF_VISUAL_QA').decision = 'FAIL';
    saveInput(falsePassFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: falsePassFixture.inputPath }),
      'REVIEW_FALSE_PASS',
    );

    const negativeFixture = createFixture();
    decisionInput(negativeFixture, 'windows11', 'PDF_VISUAL_QA').decision = 'FAIL';
    negativeFixture.input.reviewerMatrixDisposition = 'FAIL';
    saveInput(negativeFixture);
    const record = createPlatformHumanReviewRecord({ inputPath: negativeFixture.inputPath });
    expect(record.reviewerMatrixDisposition).toBe('FAIL');
    expect(record.eligibleForHumanGateDisposition).toBe(false);
    expect(record.acceptanceGateStatus).toBe('NOT_AUTOMATICALLY_APPLIED');
    expect(
      record.platforms.find((platform) => platform.osFamily === 'windows11')
        ?.reviewerDisposition,
    ).toBe('FAIL');
  });

  it('requires exact deviation coverage and prevents PASS over a material deviation', () => {
    const missingFixture = createFixture({ macos: ['KNOWN_NON_MATERIAL_RENDERING_NOTE'] });
    decisionInput(missingFixture, 'macos', 'DEVIATIONS').deviationAssessments = [];
    saveInput(missingFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: missingFixture.inputPath }),
      'REVIEW_DEVIATION_INVALID',
    );

    const falsePassFixture = createFixture({
      macos: ['KNOWN_NON_MATERIAL_RENDERING_NOTE'],
    });
    decisionInput(
      falsePassFixture,
      'macos',
      'DEVIATIONS',
    ).deviationAssessments[0].disposition = 'MATERIAL_FAILURE';
    saveInput(falsePassFixture);
    expectCode(
      () => createPlatformHumanReviewRecord({ inputPath: falsePassFixture.inputPath }),
      'REVIEW_FALSE_PASS',
    );

    const negativeFixture = createFixture({
      macos: ['KNOWN_NON_MATERIAL_RENDERING_NOTE'],
    });
    const deviationDecision = decisionInput(negativeFixture, 'macos', 'DEVIATIONS');
    deviationDecision.deviationAssessments[0].disposition = 'MATERIAL_FAILURE';
    deviationDecision.decision = 'FAIL';
    negativeFixture.input.reviewerMatrixDisposition = 'FAIL';
    saveInput(negativeFixture);
    const record = createPlatformHumanReviewRecord({ inputPath: negativeFixture.inputPath });
    expect(record.eligibleForHumanGateDisposition).toBe(false);
  });

  it('refuses to overwrite the review input, matrix, or a retained artifact', () => {
    const inputFixture = createFixture();
    expectCode(
      () =>
        writePlatformHumanReviewRecord({
          inputPath: inputFixture.inputPath,
          outputPath: inputFixture.inputPath,
        }),
      'REVIEW_OUTPUT_INVALID',
    );

    const matrixFixture = createFixture();
    expectCode(
      () =>
        writePlatformHumanReviewRecord({
          inputPath: matrixFixture.inputPath,
          outputPath: matrixFixture.matrixPath,
        }),
      'REVIEW_OUTPUT_INVALID',
    );
  });

  it('exposes a non-mutating help path and fail-closed CLI errors', () => {
    expect(main(['--help'])).toBe(0);
    expect(main(['--input'])).toBe(1);
    expect(main(['--unknown', 'value'])).toBe(1);
    expect(
      () =>
        new PlatformHumanReviewValidationError(
          'REVIEW_TEST',
          'typed validation error',
        ),
    ).not.toThrow();
  });
});
