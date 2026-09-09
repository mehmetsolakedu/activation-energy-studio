#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  constants as fsConstants,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import puppeteer from 'puppeteer-core';

export const WARNING_EVIDENCE_SCHEMA =
  'activation-energy-studio/warning-visibility-evidence/v1';
export const WARNING_EVIDENCE_STATUS =
  'LOCAL_AUTOMATED_8_OF_8_REQUIRES_HUMAN_VISUAL_REVIEW';
export const WARNING_EVIDENCE_MANIFEST = 'WARNING_VISIBILITY_EVIDENCE.json';
export const WARNING_EVIDENCE_SIDECAR = 'WARNING_VISIBILITY_EVIDENCE.sha256';
export const DEFAULT_WARNING_EVIDENCE_DIRECTORY =
  'evidence/usability/v0.3.1/warning-visibility-current';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const RELEASE_PATH =
  'release/v0.3.1/Activation-Energy-Studio-v0.3.1.html';
const UX_FIXTURE_MANIFEST_PATH =
  'evidence/usability/v0.3.1/UX_FIXTURE_MANIFEST.json';
const CURRENT_STUDY_VERSION = 'UX-v0.3.1';
const CURRENT_INTERFACE_LANGUAGE = 'en';
const DEFAULT_TIMEOUT_MS = 45_000;
const RAW_DISPOSITION_ENUMS = Object.freeze([
  'REPORTABLE_WITH_CAUTION',
  'CALCULATED_UNRELIABLE',
  'CALCULATION_REJECTED',
]);

export const WARNING_CASES = Object.freeze([
  Object.freeze({
    id: 'W1',
    code: 'LIMITED_HEATING_RATES',
    expectedDispositionLabels: ['REPORTABLE WITH CAUTION'],
    fixturePath:
      'evidence/usability/v0.3.1/study_bundle/W1_three_rates.csv',
  }),
  Object.freeze({
    id: 'W2',
    code: 'NUMERICAL_DERIVATIVE',
    expectedDispositionLabels: ['REPORTABLE WITH CAUTION'],
    fixturePath:
      'evidence/usability/v0.3.1/study_bundle/W2_synthetic_kas_150.csv',
  }),
  Object.freeze({
    id: 'W3',
    code: 'LOW_R2',
    expectedDispositionLabels: ['CALCULATED BUT UNRELIABLE'],
    fixturePath:
      'evidence/usability/v0.3.1/study_bundle/W3_low_r2.csv',
  }),
  Object.freeze({
    id: 'W4',
    code: 'MULTISTEP_EA_VARIATION',
    expectedDispositionLabels: [
      'REPORTABLE WITH CAUTION',
      'CALCULATED BUT UNRELIABLE',
    ],
    fixturePath:
      'evidence/usability/v0.3.1/study_bundle/W4_multistep.csv',
  }),
]);

export class WarningVisibilityEvidenceError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'WarningVisibilityEvidenceError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = undefined) {
  throw new WarningVisibilityEvidenceError(code, message, details);
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

function projectPath(projectRoot, relativePath) {
  return path.resolve(projectRoot, relativePath);
}

function portablePath(value) {
  return value.split(path.sep).join('/');
}

function relativeOutputPath(outputDirectory, filePath) {
  const relative = path.relative(outputDirectory, filePath);
  if (
    relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    fail(
      'EVIDENCE_PATH_ESCAPE',
      `Evidence path escapes the output directory: ${filePath}.`,
    );
  }
  return portablePath(relative);
}

function ensureNewOrEmptyDirectory(outputDirectory) {
  if (existsSync(outputDirectory)) {
    const entries = readdirSync(outputDirectory);
    if (entries.length > 0) {
      fail(
        'OUTPUT_DIRECTORY_NOT_EMPTY',
        `Warning evidence output must be new or empty: ${outputDirectory}.`,
      );
    }
  } else {
    mkdirSync(outputDirectory, { recursive: true });
  }
}

function descriptor(outputDirectory, filePath, role) {
  const bytes = readFileSync(filePath);
  return {
    role,
    path: relativeOutputPath(outputDirectory, filePath),
    bytes: bytes.byteLength,
    sha256: sha256Bytes(bytes),
  };
}

function sourceDescriptor(projectRoot, relativePath, role) {
  const absolutePath = projectPath(projectRoot, relativePath);
  const bytes = readFileSync(absolutePath);
  return {
    role,
    path: relativePath,
    bytes: bytes.byteLength,
    sha256: sha256Bytes(bytes),
  };
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function pngDimensions(bytes, label) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
    fail('PNG_INVALID', `${label} is not a valid PNG container.`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (
    width < 240 ||
    height < 120 ||
    width > 10_000 ||
    height > 20_000
  ) {
    fail(
      'PNG_DIMENSIONS_INVALID',
      `${label} dimensions ${width}x${height} are outside evidence bounds.`,
    );
  }
  return { width, height };
}

function pdfPageCount(bytes, label) {
  const latin1 = bytes.toString('latin1');
  if (!latin1.startsWith('%PDF-')) {
    fail('PDF_INVALID', `${label} does not start with a PDF header.`);
  }
  const matches = latin1.match(/\/Type\s*\/Page\b/gu) ?? [];
  if (matches.length < 1 || matches.length > 50) {
    fail(
      'PDF_PAGE_COUNT_INVALID',
      `${label} has an invalid page count (${matches.length}).`,
    );
  }
  return matches.length;
}

function listFilesRecursive(rootDirectory, relativeDirectory = '') {
  const directory = path.resolve(rootDirectory, relativeDirectory);
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const nextRelative = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      output.push(...listFilesRecursive(rootDirectory, nextRelative));
    } else if (entry.isFile()) {
      output.push(portablePath(nextRelative));
    } else {
      fail(
        'EVIDENCE_FILE_TYPE_UNSUPPORTED',
        `Evidence contains a non-regular file: ${nextRelative}.`,
      );
    }
  }
  return output.sort();
}

function discoverBrowserExecutable(requestedPath = null) {
  const candidates = [
    requestedPath,
    process.env.CHROME_PATH,
    process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : null,
    process.platform === 'linux' ? '/usr/bin/google-chrome' : null,
    process.platform === 'linux' ? '/usr/bin/google-chrome-stable' : null,
    process.platform === 'win32' && process.env.PROGRAMFILES
      ? path.join(
          process.env.PROGRAMFILES,
          'Google',
          'Chrome',
          'Application',
          'chrome.exe',
        )
      : null,
    process.platform === 'win32' && process.env['PROGRAMFILES(X86)']
      ? path.join(
          process.env['PROGRAMFILES(X86)'],
          'Google',
          'Chrome',
          'Application',
          'chrome.exe',
        )
      : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    if (process.platform !== 'win32') {
      try {
        accessSync(candidate, fsConstants.X_OK);
      } catch {
        continue;
      }
    }
    return path.resolve(candidate);
  }
  fail(
    'SYSTEM_CHROME_NOT_FOUND',
    'A real system Google Chrome executable is required for warning evidence capture.',
  );
}

async function setInputValue(page, selector, value) {
  await page.waitForSelector(selector, { timeout: DEFAULT_TIMEOUT_MS });
  await page.$eval(
    selector,
    (element, nextValue) => {
      if (!(element instanceof HTMLInputElement)) {
        throw new Error(`Expected input for ${element.getAttribute('data-testid')}.`);
      }
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      if (!setter) {
        throw new Error('Native input setter is unavailable.');
      }
      element.focus();
      setter.call(element, nextValue);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.blur();
    },
    value,
  );
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await page.waitForFunction(
    (target, expected) => {
      const element = document.querySelector(target);
      return element instanceof HTMLInputElement && element.value === expected;
    },
    { timeout: DEFAULT_TIMEOUT_MS },
    selector,
    value,
  );
}

async function waitForStableFile(filePath) {
  let previousSize = -1;
  let stableCount = 0;
  const started = Date.now();
  while (Date.now() - started < DEFAULT_TIMEOUT_MS) {
    if (existsSync(filePath)) {
      const size = statSync(filePath).size;
      if (size > 0 && size === previousSize) stableCount += 1;
      else stableCount = 0;
      previousSize = size;
      if (stableCount >= 2) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  fail('DOWNLOAD_TIMEOUT', `Timed out waiting for ${filePath}.`);
}

async function downloadPdf(page, browserSession, caseDirectory) {
  const records = new Map();
  let resolveCompleted;
  let rejectCompleted;
  const completed = new Promise((resolve, reject) => {
    resolveCompleted = resolve;
    rejectCompleted = reject;
  });
  const timeout = setTimeout(() => {
    rejectCompleted(
      new WarningVisibilityEvidenceError(
        'DOWNLOAD_PROTOCOL_TIMEOUT',
        'Chrome did not report a completed PDF download.',
      ),
    );
  }, DEFAULT_TIMEOUT_MS);

  const onWillBegin = (event) => {
    records.set(event.guid, {
      guid: event.guid,
      suggestedFilename: event.suggestedFilename,
      url: event.url,
      state: 'will-begin',
      totalBytes: null,
    });
  };
  const onProgress = (event) => {
    const record = records.get(event.guid);
    if (!record) return;
    record.state = event.state;
    record.totalBytes = event.totalBytes;
    if (event.state === 'completed') resolveCompleted({ ...record });
    if (event.state === 'canceled') {
      rejectCompleted(
        new WarningVisibilityEvidenceError(
          'DOWNLOAD_CANCELED',
          'Chrome canceled the PDF download.',
        ),
      );
    }
  };

  browserSession.on('Browser.downloadWillBegin', onWillBegin);
  browserSession.on('Browser.downloadProgress', onProgress);
  try {
    await page.click('[data-testid="export-pdf"]');
    const record = await completed;
    if (
      typeof record.suggestedFilename !== 'string' ||
      !record.suggestedFilename.toLowerCase().endsWith('.pdf')
    ) {
      fail(
        'DOWNLOAD_FILENAME_INVALID',
        `Expected a PDF download, received ${record.suggestedFilename}.`,
      );
    }
    const downloadedPath = path.resolve(
      caseDirectory,
      record.suggestedFilename,
    );
    await waitForStableFile(downloadedPath);
    const retainedPath = path.resolve(caseDirectory, 'report.pdf');
    if (downloadedPath !== retainedPath) renameSync(downloadedPath, retainedPath);
    const retainedBytes = statSync(retainedPath).size;
    if (
      !Number.isFinite(record.totalBytes) ||
      record.totalBytes <= 0 ||
      retainedBytes !== record.totalBytes
    ) {
      fail(
        'DOWNLOAD_SIZE_MISMATCH',
        `Chrome reported ${record.totalBytes} bytes but retained ${retainedBytes}.`,
      );
    }
    return {
      retainedPath,
      protocol: {
        guid: record.guid,
        state: record.state,
        suggestedFilename: record.suggestedFilename,
        totalBytes: record.totalBytes,
        urlProtocol: new URL(record.url).protocol,
      },
    };
  } finally {
    clearTimeout(timeout);
    browserSession.off('Browser.downloadWillBegin', onWillBegin);
    browserSession.off('Browser.downloadProgress', onProgress);
  }
}

function renderPdf(pdfPath, renderDirectory) {
  mkdirSync(renderDirectory, { recursive: true });
  const prefix = path.resolve(renderDirectory, 'page');
  const rendered = spawnSync(
    'pdftoppm',
    ['-png', '-r', '150', pdfPath, prefix],
    {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (rendered.status !== 0) {
    fail(
      'PDF_RENDER_FAILED',
      `pdftoppm failed: ${(rendered.stderr || rendered.stdout || '').trim()}.`,
    );
  }
  const pages = readdirSync(renderDirectory)
    .filter((name) => /^page-\d+\.png$/u.test(name))
    .sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true }),
    )
    .map((name) => path.resolve(renderDirectory, name));
  if (pages.length === 0) {
    fail('PDF_RENDER_EMPTY', 'pdftoppm did not create any rendered pages.');
  }
  return pages;
}

async function captureCase({
  projectRoot,
  outputDirectory,
  releasePath,
  browserExecutable,
  definition,
  recordedAt,
}) {
  const caseDirectory = path.resolve(outputDirectory, definition.id);
  mkdirSync(caseDirectory, { recursive: true });
  const fixturePath = projectPath(projectRoot, definition.fixturePath);
  const screenshotPath = path.resolve(caseDirectory, 'warning-card.png');
  const caseRecordPath = path.resolve(caseDirectory, 'case-record.json');
  const requestUrls = [];
  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath: browserExecutable,
      headless: true,
      waitForInitialPage: false,
      defaultViewport: {
        width: 1440,
        height: 1400,
        deviceScaleFactor: 1,
      },
      args: [
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-features=OptimizationHints,MediaRouter',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-startup-window',
        '--password-store=basic',
        '--use-mock-keychain',
      ],
    });
    const browserSession = await browser.target().createCDPSession();
    await browserSession.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: caseDirectory,
      eventsEnabled: true,
    });
    const page = await browser.newPage();
    page.on('request', (request) => requestUrls.push(request.url()));
    await page.setBypassServiceWorker(true);
    await page.goto(pathToFileURL(releasePath).href, {
      waitUntil: ['domcontentloaded', 'load'],
      timeout: DEFAULT_TIMEOUT_MS,
    });
    await page.setOfflineMode(true);
    await page.waitForFunction(() => navigator.onLine === false, {
      timeout: DEFAULT_TIMEOUT_MS,
    });

    const input = await page.$('[data-testid="thermal-file-input"]');
    if (!input) {
      fail('UI_CONTRACT_MISSING', 'The thermal-file input is missing.');
    }
    await input.uploadFile(fixturePath);
    await input.dispose();
    await setInputValue(
      page,
      '[data-testid="project-name"]',
      `Warning visibility ${definition.id}`,
    );
    await setInputValue(
      page,
      '[data-testid="process-name"]',
      'warning-visibility validation',
    );
    await setInputValue(
      page,
      '[data-testid="stage-label"]',
      'direct-alpha analysis window',
    );
    try {
      await page.waitForFunction(
        () => {
          const checkbox = document.querySelector(
            '[data-testid="confirm-interpretation"]',
          );
          return checkbox instanceof HTMLInputElement && !checkbox.disabled;
        },
        { timeout: DEFAULT_TIMEOUT_MS },
      );
      await page.click('[data-testid="confirm-interpretation"]');
      await page.waitForFunction(
        () => {
          const checkbox = document.querySelector(
            '[data-testid="confirm-interpretation"]',
          );
          return checkbox instanceof HTMLInputElement && checkbox.checked;
        },
        { timeout: DEFAULT_TIMEOUT_MS },
      );
    } catch {
      const state = await page.evaluate(() => {
        const checkbox = document.querySelector(
          '[data-testid="confirm-interpretation"]',
        );
        return {
          confirmationPresent: checkbox instanceof HTMLInputElement,
          confirmationDisabled:
            checkbox instanceof HTMLInputElement ? checkbox.disabled : null,
          confirmationChecked:
            checkbox instanceof HTMLInputElement ? checkbox.checked : null,
        };
      });
      fail(
        'INTERPRETATION_CONFIRMATION_TIMEOUT',
        `${definition.id} interpretation confirmation was not ready.`,
        state,
      );
    }
    try {
      await page.waitForFunction(
        () => {
          const button = document.querySelector(
            '[data-testid="run-analysis"]',
          );
          return button instanceof HTMLButtonElement && !button.disabled;
        },
        { timeout: DEFAULT_TIMEOUT_MS },
      );
    } catch {
      const state = await page.evaluate(() => {
        const button = document.querySelector('[data-testid="run-analysis"]');
        return {
          runButtonPresent: button instanceof HTMLButtonElement,
          runButtonDisabled:
            button instanceof HTMLButtonElement ? button.disabled : null,
          mappingWizardPresent:
            document.querySelector('.mapping-wizard') !== null,
          visibleText: document.body.innerText.replace(/\s+/gu, ' ')
            .trim().slice(-4_000),
        };
      });
      fail(
        'RUN_ANALYSIS_ENABLE_TIMEOUT',
        `${definition.id} analysis button did not become enabled.`,
        state,
      );
    }
    await page.click('[data-testid="run-analysis"]');
    try {
      await page.waitForSelector(
        '[data-testid="result-card-diagnostics"]',
        { visible: true, timeout: DEFAULT_TIMEOUT_MS },
      );
    } catch {
      const state = await page.evaluate(() => {
        const container = document.querySelector(
          '[data-testid="result-card-diagnostics"]',
        );
        return {
          resultDiagnosticsPresent: container instanceof HTMLElement,
          resultDiagnosticsText:
            container instanceof HTMLElement ? container.innerText : null,
          visibleText: document.body.innerText.replace(/\s+/gu, ' ')
            .trim().slice(-4_000),
        };
      });
      fail(
        'RESULT_DIAGNOSTICS_TIMEOUT',
        `${definition.id} did not expose a result diagnostics card after analysis.`,
        state,
      );
    }

    const uiObservation = await page.evaluate((expectedCode) => {
      const container = document.querySelector(
        '[data-testid="result-card-diagnostics"]',
      );
      const pdfButton = document.querySelector('[data-testid="export-pdf"]');
      if (!(container instanceof HTMLElement)) {
        throw new Error('Result-card diagnostics are missing.');
      }
      const text = container.innerText.trim();
      return {
        expectedCodeVisible: text.includes(expectedCode),
        problemVisible: text.includes('Problem:'),
        riskVisible: text.includes('Why it matters:'),
        actionVisible: text.includes('Action:'),
        text,
        pdfExportEnabled:
          pdfButton instanceof HTMLButtonElement && !pdfButton.disabled,
        documentProtocol: window.location.protocol,
        interfaceLanguage: document.documentElement.lang,
        navigatorOnLine: navigator.onLine,
      };
    }, definition.code);
    if (
      !uiObservation.expectedCodeVisible ||
      !uiObservation.problemVisible ||
      !uiObservation.riskVisible ||
      !uiObservation.actionVisible ||
      !uiObservation.pdfExportEnabled ||
      uiObservation.documentProtocol !== 'file:' ||
      uiObservation.interfaceLanguage !== CURRENT_INTERFACE_LANGUAGE ||
      uiObservation.navigatorOnLine !== false
    ) {
      fail(
        'UI_WARNING_CONTRACT_FAILED',
        `${definition.id} did not expose the expected technical-English warning contract.`,
        uiObservation,
      );
    }

    const warningCard = await page.$(
      '[data-testid="result-card-diagnostics"]',
    );
    if (!warningCard) {
      fail('UI_CONTRACT_MISSING', 'The warning card disappeared before capture.');
    }
    await warningCard.screenshot({ path: screenshotPath, type: 'png' });
    await warningCard.dispose();
    const screenshotBytes = readFileSync(screenshotPath);
    const screenshotDimensions = pngDimensions(
      screenshotBytes,
      `${definition.id} warning screenshot`,
    );

    const downloaded = await downloadPdf(
      page,
      browserSession,
      caseDirectory,
    );
    const pdfBytes = readFileSync(downloaded.retainedPath);
    const pageCount = pdfPageCount(pdfBytes, `${definition.id} report`);
    const pdfText = pdfBytes.toString('latin1');
    const pdfCodeEmbedded = pdfText.includes(definition.code);
    if (!pdfCodeEmbedded) {
      fail(
        'PDF_WARNING_CODE_MISSING',
        `${definition.code} is not embedded in the exported PDF body.`,
      );
    }
    const rawDispositionEnum = RAW_DISPOSITION_ENUMS.find((value) =>
      pdfText.includes(value));
    if (rawDispositionEnum) {
      fail(
        'PDF_RAW_DISPOSITION_ENUM',
        `${definition.id} PDF exposes raw disposition enum ${rawDispositionEnum}.`,
      );
    }
    const missingDispositionLabel = definition.expectedDispositionLabels.find(
      (value) => !pdfText.includes(value),
    );
    if (missingDispositionLabel) {
      fail(
        'PDF_DISPOSITION_LABEL_MISSING',
        `${definition.id} PDF is missing ${missingDispositionLabel}.`,
      );
    }
    const renderDirectory = path.resolve(caseDirectory, 'render');
    const renderedPages = renderPdf(
      downloaded.retainedPath,
      renderDirectory,
    );
    if (renderedPages.length !== pageCount) {
      fail(
        'PDF_RENDER_PAGE_COUNT_MISMATCH',
        `${definition.id} PDF has ${pageCount} pages but ${renderedPages.length} renders.`,
      );
    }
    const rendered = renderedPages.map((filePath, index) => {
      const bytes = readFileSync(filePath);
      return {
        ...descriptor(
          outputDirectory,
          filePath,
          `pdf-render-${definition.id}-page-${index + 1}`,
        ),
        dimensions: pngDimensions(
          bytes,
          `${definition.id} PDF render page ${index + 1}`,
        ),
      };
    });
    const externalRequestUrls = [
      ...new Set(
        requestUrls.filter((url) => {
          const protocol = new URL(url).protocol;
          return protocol === 'http:' || protocol === 'https:';
        }),
      ),
    ];
    if (externalRequestUrls.length > 0) {
      fail(
        'EXTERNAL_NETWORK_REQUEST',
        `${definition.id} attempted external requests: ${externalRequestUrls.join(', ')}.`,
      );
    }

    const browserVersion = await browser.version();
    const record = {
      schema: 'activation-energy-studio/warning-visibility-case/v1',
      studyVersion: CURRENT_STUDY_VERSION,
      interfaceLanguage: CURRENT_INTERFACE_LANGUAGE,
      claimStatus: WARNING_EVIDENCE_STATUS,
      recordedAt,
      caseId: definition.id,
      expectedCode: definition.code,
      source: {
        release: sourceDescriptor(projectRoot, RELEASE_PATH, 'release-html'),
        fixture: sourceDescriptor(
          projectRoot,
          definition.fixturePath,
          `fixture-${definition.id}`,
        ),
      },
      runtime: {
        browser: browserVersion,
        executable: browserExecutable,
        documentProtocol: uiObservation.documentProtocol,
        interfaceLanguage: uiObservation.interfaceLanguage,
        navigatorOnLine: uiObservation.navigatorOnLine,
        externalRequestUrls,
      },
      ui: {
        status: 'VISIBLE',
        expectedCodeVisible: true,
        problemVisible: true,
        riskVisible: true,
        actionVisible: true,
        text: uiObservation.text,
        screenshot: {
          ...descriptor(
            outputDirectory,
            screenshotPath,
            `ui-warning-${definition.id}`,
          ),
          dimensions: screenshotDimensions,
        },
      },
      pdf: {
        status: 'VISIBLE_CODE_EMBEDDED_RENDERED',
        expectedCodeEmbedded: true,
        expectedDispositionLabels: definition.expectedDispositionLabels,
        rawDispositionEnumsAbsent: true,
        pageCount,
        downloadProtocol: downloaded.protocol,
        artifact: descriptor(
          outputDirectory,
          downloaded.retainedPath,
          `pdf-report-${definition.id}`,
        ),
        renders: rendered,
      },
      humanVisualReview: {
        status: 'NOT_PERFORMED',
        claimBoundary:
          'PNG and PDF containers, hashes, dimensions, and code presence are technically verified; visual meaning still requires a named human observer.',
      },
    };
    writeJson(caseRecordPath, record);
    return {
      definition,
      record,
      caseRecordPath,
      screenshotPath,
      pdfPath: downloaded.retainedPath,
      renderedPages,
    };
  } finally {
    if (browser) await browser.close();
  }
}

export async function captureWarningVisibilityEvidence({
  projectRoot = DEFAULT_PROJECT_ROOT,
  outputDirectory = projectPath(
    projectRoot,
    DEFAULT_WARNING_EVIDENCE_DIRECTORY,
  ),
  browserExecutable = null,
  recordedAt = new Date().toISOString(),
} = {}) {
  const absoluteProjectRoot = path.resolve(projectRoot);
  const absoluteOutputDirectory = path.resolve(outputDirectory);
  const absoluteReleasePath = projectPath(
    absoluteProjectRoot,
    RELEASE_PATH,
  );
  const absoluteBrowserExecutable =
    discoverBrowserExecutable(browserExecutable);
  ensureNewOrEmptyDirectory(absoluteOutputDirectory);

  const sourceFiles = [
    sourceDescriptor(absoluteProjectRoot, RELEASE_PATH, 'release-html'),
    sourceDescriptor(
      absoluteProjectRoot,
      UX_FIXTURE_MANIFEST_PATH,
      'ux-fixture-manifest',
    ),
    ...WARNING_CASES.map((definition) =>
      sourceDescriptor(
        absoluteProjectRoot,
        definition.fixturePath,
        `fixture-${definition.id}`,
      ),
    ),
  ];
  const cases = [];
  for (const definition of WARNING_CASES) {
    cases.push(
      await captureCase({
        projectRoot: absoluteProjectRoot,
        outputDirectory: absoluteOutputDirectory,
        releasePath: absoluteReleasePath,
        browserExecutable: absoluteBrowserExecutable,
        definition,
        recordedAt,
      }),
    );
  }

  const artifacts = cases.flatMap((entry) => [
    descriptor(
      absoluteOutputDirectory,
      entry.caseRecordPath,
      `case-record-${entry.definition.id}`,
    ),
    descriptor(
      absoluteOutputDirectory,
      entry.screenshotPath,
      `ui-warning-${entry.definition.id}`,
    ),
    descriptor(
      absoluteOutputDirectory,
      entry.pdfPath,
      `pdf-report-${entry.definition.id}`,
    ),
    ...entry.renderedPages.map((filePath, index) =>
      descriptor(
        absoluteOutputDirectory,
        filePath,
        `pdf-render-${entry.definition.id}-page-${index + 1}`,
      ),
    ),
  ]);
  const matrix = cases.map(({ definition, record }) => ({
    caseId: definition.id,
    code: definition.code,
    ui: {
      status: 'PASS_TECHNICAL',
      expectedCodeVisible: record.ui.expectedCodeVisible,
      artifactPath: record.ui.screenshot.path,
    },
    pdf: {
      status: 'PASS_TECHNICAL',
      expectedCodeVisible: record.pdf.expectedCodeEmbedded,
      artifactPath: record.pdf.artifact.path,
      renderPaths: record.pdf.renders.map(({ path: renderPath }) => renderPath),
    },
  }));
  const manifest = {
    schema: WARNING_EVIDENCE_SCHEMA,
    studyVersion: CURRENT_STUDY_VERSION,
    interfaceLanguage: CURRENT_INTERFACE_LANGUAGE,
    claimStatus: WARNING_EVIDENCE_STATUS,
    recordedAt,
    sourceFiles,
    matrix,
    matrixSummary: {
      expectedCells: 8,
      technicallyObservedCells: matrix.reduce(
        (sum, row) =>
          sum +
          Number(row.ui.expectedCodeVisible) +
          Number(row.pdf.expectedCodeVisible),
        0,
      ),
    },
    artifacts,
    humanVisualReview: {
      status: 'NOT_PERFORMED',
      platformOrUsabilityGateClosed: false,
    },
    claimBoundary:
      'This retained package proves an offline real-Chrome UI/PDF warning path and container integrity. It is not a human-observer verdict and does not close AC-UX-04 by itself.',
  };
  if (manifest.matrixSummary.technicallyObservedCells !== 8) {
    fail(
      'WARNING_MATRIX_INCOMPLETE',
      `Expected 8 technical warning cells, received ${manifest.matrixSummary.technicallyObservedCells}.`,
    );
  }
  const manifestPath = path.resolve(
    absoluteOutputDirectory,
    WARNING_EVIDENCE_MANIFEST,
  );
  writeJson(manifestPath, manifest);
  const manifestSha256 = sha256File(manifestPath);
  const sidecarPath = path.resolve(
    absoluteOutputDirectory,
    WARNING_EVIDENCE_SIDECAR,
  );
  writeFileSync(
    sidecarPath,
    `${manifestSha256}  ${WARNING_EVIDENCE_MANIFEST}\n`,
    'utf8',
  );
  return verifyWarningVisibilityEvidence({
    projectRoot: absoluteProjectRoot,
    outputDirectory: absoluteOutputDirectory,
  });
}

function readArtifact(outputDirectory, artifact) {
  if (
    !artifact ||
    typeof artifact.path !== 'string' ||
    typeof artifact.sha256 !== 'string' ||
    typeof artifact.bytes !== 'number'
  ) {
    fail('ARTIFACT_DESCRIPTOR_INVALID', 'Evidence artifact descriptor is incomplete.');
  }
  const absolutePath = path.resolve(outputDirectory, artifact.path);
  if (
    !absolutePath.startsWith(`${path.resolve(outputDirectory)}${path.sep}`)
  ) {
    fail(
      'ARTIFACT_PATH_ESCAPE',
      `Artifact path escapes the output directory: ${artifact.path}.`,
    );
  }
  if (!existsSync(absolutePath)) {
    fail(
      'ARTIFACT_MISSING',
      `Warning evidence artifact is missing: ${artifact.path}.`,
    );
  }
  const bytes = readFileSync(absolutePath);
  if (bytes.byteLength !== artifact.bytes) {
    fail(
      'ARTIFACT_SIZE_MISMATCH',
      `${artifact.path}: expected ${artifact.bytes}, received ${bytes.byteLength}.`,
    );
  }
  const actualHash = sha256Bytes(bytes);
  if (actualHash !== artifact.sha256) {
    fail(
      'ARTIFACT_HASH_MISMATCH',
      `${artifact.path}: expected ${artifact.sha256}, received ${actualHash}.`,
    );
  }
  return bytes;
}

export function verifyWarningVisibilityEvidence({
  projectRoot = DEFAULT_PROJECT_ROOT,
  outputDirectory = projectPath(
    projectRoot,
    DEFAULT_WARNING_EVIDENCE_DIRECTORY,
  ),
} = {}) {
  const absoluteProjectRoot = path.resolve(projectRoot);
  const absoluteOutputDirectory = path.resolve(outputDirectory);
  const manifestPath = path.resolve(
    absoluteOutputDirectory,
    WARNING_EVIDENCE_MANIFEST,
  );
  const sidecarPath = path.resolve(
    absoluteOutputDirectory,
    WARNING_EVIDENCE_SIDECAR,
  );
  const sidecar = readFileSync(sidecarPath, 'utf8').trim();
  const sidecarMatch = sidecar.match(
    /^([0-9a-f]{64})  WARNING_VISIBILITY_EVIDENCE\.json$/u,
  );
  if (!sidecarMatch) {
    fail('SIDECAR_INVALID', 'Warning evidence SHA-256 sidecar is invalid.');
  }
  const manifestSha256 = sha256File(manifestPath);
  if (sidecarMatch[1] !== manifestSha256) {
    fail(
      'MANIFEST_HASH_MISMATCH',
      `Expected ${sidecarMatch[1]}, received ${manifestSha256}.`,
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (
    manifest.schema !== WARNING_EVIDENCE_SCHEMA ||
    manifest.studyVersion !== CURRENT_STUDY_VERSION ||
    manifest.interfaceLanguage !== CURRENT_INTERFACE_LANGUAGE ||
    manifest.claimStatus !== WARNING_EVIDENCE_STATUS
  ) {
    fail(
      'MANIFEST_STATUS_INVALID',
      'Warning evidence schema or claim status is invalid.',
    );
  }
  if (
    manifest.humanVisualReview?.status !== 'NOT_PERFORMED' ||
    manifest.humanVisualReview?.platformOrUsabilityGateClosed !== false
  ) {
    fail(
      'HUMAN_REVIEW_BOUNDARY_INVALID',
      'Automated warning evidence cannot claim human review or close a usability gate.',
    );
  }
  if (
    manifest.matrixSummary?.expectedCells !== 8 ||
    manifest.matrixSummary?.technicallyObservedCells !== 8
  ) {
    fail(
      'WARNING_MATRIX_INCOMPLETE',
      'Warning visibility matrix is not technically complete at 8/8.',
    );
  }

  const expectedSources = new Map(
    [
      [RELEASE_PATH, 'release-html'],
      [UX_FIXTURE_MANIFEST_PATH, 'ux-fixture-manifest'],
      ...WARNING_CASES.map((definition) => [
        definition.fixturePath,
        `fixture-${definition.id}`,
      ]),
    ],
  );
  if (
    !Array.isArray(manifest.sourceFiles) ||
    manifest.sourceFiles.length !== expectedSources.size
  ) {
    fail('SOURCE_SET_INVALID', 'Warning evidence source set is incomplete.');
  }
  for (const source of manifest.sourceFiles) {
    const expectedRole = expectedSources.get(source.path);
    if (!expectedRole || source.role !== expectedRole) {
      fail(
        'SOURCE_ROLE_INVALID',
        `Unexpected warning evidence source ${source.path}.`,
      );
    }
    const currentPath = projectPath(absoluteProjectRoot, source.path);
    const currentBytes = readFileSync(currentPath);
    if (
      currentBytes.byteLength !== source.bytes ||
      sha256Bytes(currentBytes) !== source.sha256
    ) {
      fail(
        'SOURCE_DRIFT',
        `Warning evidence source is no longer current: ${source.path}.`,
      );
    }
  }

  const expectedCases = new Map(
    WARNING_CASES.map((definition) => [definition.id, definition]),
  );
  if (!Array.isArray(manifest.matrix) || manifest.matrix.length !== 4) {
    fail('WARNING_MATRIX_INVALID', 'Warning evidence must contain four cases.');
  }
  for (const row of manifest.matrix) {
    if (
      expectedCases.get(row.caseId)?.code !== row.code ||
      row.ui?.status !== 'PASS_TECHNICAL' ||
      row.ui?.expectedCodeVisible !== true ||
      row.pdf?.status !== 'PASS_TECHNICAL' ||
      row.pdf?.expectedCodeVisible !== true ||
      !Array.isArray(row.pdf?.renderPaths) ||
      row.pdf.renderPaths.length < 1
    ) {
      fail(
        'WARNING_MATRIX_ROW_INVALID',
        `Warning evidence matrix row is invalid: ${row.caseId}.`,
      );
    }
  }

  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length < 16) {
    fail('ARTIFACT_SET_INVALID', 'Warning evidence artifact set is incomplete.');
  }
  const artifactPaths = new Set();
  const artifactRoles = new Map();
  for (const artifact of manifest.artifacts) {
    if (artifactPaths.has(artifact.path)) {
      fail(
        'ARTIFACT_PATH_DUPLICATE',
        `Duplicate warning evidence artifact path: ${artifact.path}.`,
      );
    }
    artifactPaths.add(artifact.path);
    if (artifactRoles.has(artifact.role)) {
      fail(
        'ARTIFACT_ROLE_DUPLICATE',
        `Duplicate warning evidence artifact role: ${artifact.role}.`,
      );
    }
    artifactRoles.set(artifact.role, artifact.path);
    const bytes = readArtifact(absoluteOutputDirectory, artifact);
    if (artifact.role.startsWith('ui-warning-')) {
      pngDimensions(bytes, artifact.path);
    } else if (artifact.role.startsWith('pdf-report-')) {
      pdfPageCount(bytes, artifact.path);
    } else if (artifact.role.startsWith('pdf-render-')) {
      pngDimensions(bytes, artifact.path);
    } else if (artifact.role.startsWith('case-record-')) {
      const record = JSON.parse(bytes.toString('utf8'));
      const expectedCase = expectedCases.get(record.caseId);
      const expectedCode = expectedCase?.code;
      if (
        record.claimStatus !== WARNING_EVIDENCE_STATUS ||
        record.studyVersion !== CURRENT_STUDY_VERSION ||
        record.interfaceLanguage !== CURRENT_INTERFACE_LANGUAGE ||
        record.expectedCode !== expectedCode ||
        record.runtime?.documentProtocol !== 'file:' ||
        record.runtime?.interfaceLanguage !== CURRENT_INTERFACE_LANGUAGE ||
        record.runtime?.navigatorOnLine !== false ||
        !Array.isArray(record.runtime?.externalRequestUrls) ||
        record.runtime.externalRequestUrls.length !== 0 ||
        record.ui?.expectedCodeVisible !== true ||
        !record.ui?.text?.includes(expectedCode) ||
        record.pdf?.expectedCodeEmbedded !== true ||
        record.pdf?.rawDispositionEnumsAbsent !== true ||
        JSON.stringify(record.pdf?.expectedDispositionLabels)
          !== JSON.stringify(expectedCase?.expectedDispositionLabels) ||
        record.pdf?.pageCount < 1 ||
        record.pdf?.renders?.length !== record.pdf?.pageCount ||
        record.humanVisualReview?.status !== 'NOT_PERFORMED'
      ) {
        fail(
          'CASE_RECORD_INVALID',
          `Warning evidence case record is invalid: ${artifact.path}.`,
        );
      }
      const reportBytes = readArtifact(
        absoluteOutputDirectory,
        record.pdf.artifact,
      );
      if (!reportBytes.toString('latin1').includes(expectedCode)) {
        fail(
          'PDF_WARNING_CODE_MISSING',
          `${expectedCode} is absent from ${record.pdf.artifact.path}.`,
        );
      }
      const reportText = reportBytes.toString('latin1');
      const rawDispositionEnum = RAW_DISPOSITION_ENUMS.find((value) =>
        reportText.includes(value));
      if (rawDispositionEnum) {
        fail(
          'PDF_RAW_DISPOSITION_ENUM',
          `${rawDispositionEnum} is exposed in ${record.pdf.artifact.path}.`,
        );
      }
      for (const label of expectedCase.expectedDispositionLabels) {
        if (!reportText.includes(label)) {
          fail(
            'PDF_DISPOSITION_LABEL_MISSING',
            `${label} is absent from ${record.pdf.artifact.path}.`,
          );
        }
      }
      readArtifact(absoluteOutputDirectory, record.ui.screenshot);
      for (const render of record.pdf.renders) {
        readArtifact(absoluteOutputDirectory, render);
      }
    } else {
      fail(
        'ARTIFACT_ROLE_INVALID',
        `Unexpected warning evidence artifact role: ${artifact.role}.`,
      );
    }
  }

  for (const row of manifest.matrix) {
    const expectedScreenshot = artifactRoles.get(`ui-warning-${row.caseId}`);
    const expectedPdf = artifactRoles.get(`pdf-report-${row.caseId}`);
    const expectedRenders = [...artifactRoles]
      .filter(([role]) =>
        role.startsWith(`pdf-render-${row.caseId}-page-`),
      )
      .map(([, artifactPath]) => artifactPath)
      .sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true }),
      );
    if (
      row.ui.artifactPath !== expectedScreenshot ||
      row.pdf.artifactPath !== expectedPdf ||
      JSON.stringify([...row.pdf.renderPaths].sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true }),
      )) !== JSON.stringify(expectedRenders)
    ) {
      fail(
        'WARNING_MATRIX_ARTIFACT_LINK_INVALID',
        `Warning matrix artifact links are invalid for ${row.caseId}.`,
      );
    }
  }

  const actualFiles = listFilesRecursive(absoluteOutputDirectory);
  const expectedFiles = [
    ...artifactPaths,
    WARNING_EVIDENCE_MANIFEST,
    WARNING_EVIDENCE_SIDECAR,
  ].sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    fail(
      'EVIDENCE_FILE_SET_MISMATCH',
      `Warning evidence file set differs.\nExpected: ${expectedFiles.join(', ')}\nActual: ${actualFiles.join(', ')}`,
    );
  }
  return {
    manifest,
    manifestSha256,
    outputDirectory: absoluteOutputDirectory,
    artifactCount: manifest.artifacts.length,
  };
}

function usage() {
  return [
    'Usage:',
    '  node scripts/capture-warning-visibility-evidence.mjs',
    '    [--output <new-or-empty-output-directory>]',
    '    [--browser-executable <absolute-Google-Chrome-path>]',
    '  node scripts/capture-warning-visibility-evidence.mjs',
    '    --check [--output <evidence-directory>]',
  ].join('\n');
}

function parseArguments(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const check = argv.includes('--check');
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--check') continue;
    if (!['--output', '--browser-executable'].includes(token)) {
      fail('ARGUMENT_INVALID', `Unknown warning evidence argument: ${token}.`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      fail('ARGUMENT_INVALID', `${token} requires a value.`);
    }
    if (values.has(token)) {
      fail('ARGUMENT_INVALID', `${token} was provided more than once.`);
    }
    values.set(token, value);
    index += 1;
  }
  if (check && values.has('--browser-executable')) {
    fail(
      'ARGUMENT_INVALID',
      '--browser-executable is not used with --check.',
    );
  }
  return {
    help: false,
    check,
    outputDirectory: path.resolve(
      values.get('--output') ??
        projectPath(
          DEFAULT_PROJECT_ROOT,
          DEFAULT_WARNING_EVIDENCE_DIRECTORY,
        ),
    ),
    browserExecutable: values.has('--browser-executable')
      ? path.resolve(values.get('--browser-executable'))
      : null,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = options.check
    ? verifyWarningVisibilityEvidence({
        projectRoot: DEFAULT_PROJECT_ROOT,
        outputDirectory: options.outputDirectory,
      })
    : await captureWarningVisibilityEvidence({
        projectRoot: DEFAULT_PROJECT_ROOT,
        outputDirectory: options.outputDirectory,
        browserExecutable: options.browserExecutable,
      });
  process.stdout.write(
    `PASS ${WARNING_EVIDENCE_STATUS} cells=8/8 artifacts=${result.artifactCount} manifestSha256=${result.manifestSha256}\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(
      `FAIL ${error?.code ?? 'UNCLASSIFIED_ERROR'} ${error?.message ?? String(error)}\n`,
    );
    if (error?.details !== undefined) {
      process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
    }
    process.exitCode = 1;
  });
}
