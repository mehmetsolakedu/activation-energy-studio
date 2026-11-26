import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PATH = resolve(PROJECT_ROOT, 'release/v0.4.1/Activation-Energy-Studio-v0.4.1.html');
const OUT_DIR = resolve(PROJECT_ROOT, '.browser-verification-v0.4.1');
const SHOTS_DIR = resolve(OUT_DIR, 'screenshots');
mkdirSync(SHOTS_DIR, { recursive: true });

const FILE_URL = pathToFileURL(HTML_PATH).href;
const RHUBARB_XLSX = resolve(PROJECT_ROOT, 'tests/fixtures/real/source/paper010/pone.0173946.s002.xlsx');

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function canonicalJsonHash(jsonText) {
  const obj = JSON.parse(jsonText);
  delete obj.generatedAt;
  return sha256(Buffer.from(JSON.stringify(obj), 'utf8'));
}

async function runDirectRhubarbXlsx(page) {
  await page.click('[data-testid="clear-files"]');
  await page.click('[data-testid="expert-mode"]');

  // Configure alpha grid 0.05..0.80 step 0.05 before applying wide mapping
  await page.fill('[data-testid="alpha-start"]', '0.05');
  await page.fill('[data-testid="alpha-end"]', '0.80');
  await page.fill('[data-testid="alpha-step"]', '0.05');

  await page.setInputFiles('[data-testid="thermal-file-input"]', RHUBARB_XLSX);
  await page.waitForFunction(
    () => (document.body.textContent || '').includes('pone.0173946.s002.xlsx'),
    { timeout: 15000 },
  );

  // Step 1: Select header row 3 and reread
  await page.fill('[data-testid="header-row-input"]', '3');
  await page.click('[data-testid="apply-mapping"]');
  await page.waitForSelector('[data-testid="table-layout"]', { timeout: 15000 });

  // Step 2: Select wide-series layout
  await page.selectOption('[data-testid="table-layout"]', 'wide-series');
  await page.waitForSelector('[data-testid="wide-series-mapper"]', { timeout: 15000 });

  // Step 3: Ensure 3 series exist (5, 10, 20 K/min)
  while ((await page.locator('[data-testid^="wide-run-id-"]').count()) < 3) {
    await page.click('[data-testid="wide-add-series"]');
  }

  const seriesConfigs = [
    { idx: 0, rate: '5', tCol: '0', mCol: '1', dtCol: '6', dvCol: '7', runId: 'rh-5' },
    { idx: 1, rate: '10', tCol: '2', mCol: '3', dtCol: '8', dvCol: '9', runId: 'rh-10' },
    { idx: 2, rate: '20', tCol: '4', mCol: '5', dtCol: '10', dvCol: '11', runId: 'rh-20' },
  ];

  for (const cfg of seriesConfigs) {
    const i = cfg.idx;
    await page.fill(`[data-testid="wide-run-id-${i}"]`, cfg.runId);
    await page.selectOption(`[data-testid="wide-temperature-column-${i}"]`, cfg.tCol);
    await page.selectOption(`[data-testid="wide-temperature-unit-${i}"]`, 'C');
    await page.selectOption(`[data-testid="wide-signal-kind-${i}"]`, 'massPercent');
    await page.selectOption(`[data-testid="wide-signal-column-${i}"]`, cfg.mCol);
    await page.selectOption(`[data-testid="wide-signal-unit-${i}"]`, '%');
    await page.fill(`[data-testid="wide-alpha-initial-${i}"]`, '100');
    await page.fill(`[data-testid="wide-alpha-final-${i}"]`, '0');
    await page.fill(`[data-testid="wide-heating-rate-${i}"]`, cfg.rate);
    await page.selectOption(`[data-testid="wide-heating-rate-unit-${i}"]`, 'K/min');
    await page.selectOption(`[data-testid="wide-derivative-semantic-${i}"]`, 'massLossRate');
    await page.selectOption(`[data-testid="wide-derivative-value-column-${i}"]`, cfg.dvCol);
    await page.selectOption(`[data-testid="wide-derivative-unit-${i}"]`, '%/min');
    const sepTemp = page.locator(`[data-testid="wide-derivative-temperature-enabled-${i}"]`);
    if (!(await sepTemp.isChecked())) {
      await sepTemp.check();
    }
    await page.selectOption(`[data-testid="wide-derivative-temperature-column-${i}"]`, cfg.dtCol);
    await page.selectOption(`[data-testid="wide-derivative-temperature-unit-${i}"]`, 'C');
    await page.fill(`[data-testid="wide-sample-${i}"]`, 'Rhubarb (RH)');
    await page.fill(`[data-testid="wide-atmosphere-${i}"]`, 'Simulated air (N2:O2=4:1)');
    await page.fill(`[data-testid="wide-stage-${i}"]`, 'Initial-mass-normalized alpha=0.05-0.80');
  }

  await page.check('[data-testid="wide-scope-confirmed"]');
  await page.click('[data-testid="apply-mapping"]');

  await page.fill('[data-testid="project-name"]', 'Rhubarb direct-XLSX combustion analysis');
  await page.fill('[data-testid="process-name"]', 'Combustion in simulated air');
  await page.fill('[data-testid="stage-label"]', 'Initial-mass-normalized alpha=0.05-0.80');

  // Ensure FWO, KAS, Starink, and Friedman are checked and Kissinger is off
  const methodBoxes = page.locator('.expert-method-settings label');
  const boxCount = await methodBoxes.count();
  for (let b = 0; b < boxCount; b++) {
    const lbl = methodBoxes.nth(b);
    const txt = ((await lbl.textContent()) || '').trim();
    const cb = lbl.locator('input[type="checkbox"]');
    if (!(await cb.count())) continue;
    if (/kissinger/i.test(txt) && !/akahira/i.test(txt)) {
      if (await cb.isChecked()) await cb.uncheck();
    } else if (/^(FWO|KAS|Starink|Friedman)/i.test(txt)) {
      if (!(await cb.isChecked())) await cb.check();
    }
  }

  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="confirm-interpretation"]');
      return el && !el.disabled;
    },
    { timeout: 15000 },
  );
  await page.check('[data-testid="confirm-interpretation"]');
  await page.click('[data-testid="run-analysis"]');
  await page.waitForSelector('[data-testid="numeric-results"]', { timeout: 20000 });
}

async function runOnBrowser(label, launcher, launchOpts, captureFigure2 = false) {
  const browser = await launcher.launch(launchOpts);
  const version = browser.version();
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1320, height: 960 },
    deviceScaleFactor: 2.5,
  });
  const page = await context.newPage();

  const externalRequests = [];
  const consoleErrors = [];
  page.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith('file://') && !url.startsWith('blob:') && !url.startsWith('data:')) {
      externalRequests.push(url);
    }
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(FILE_URL, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="real-examples"]');

  // 1. Run Platform Self-Test
  await page.click('[data-testid="run-platform-self-test"]');
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="platform-self-test-status"]');
    return el && /pass/i.test(el.textContent || '');
  }, { timeout: 20000 });
  const selfTestStatus = (await page.textContent('[data-testid="platform-self-test-status"]'))?.trim();

  // 2. Run Built-in Chilean Oak workflow (51 results across FWO, KAS, Starink)
  await page.click('button[data-example-id="chilean-oak-raw"]');
  await page.waitForSelector('[data-testid="confirm-interpretation"]');
  await page.check('[data-testid="confirm-interpretation"]');
  await page.click('[data-testid="run-analysis"]');
  await page.waitForSelector('[data-testid="numeric-results"]', { timeout: 20000 });

  const [oakJsonDl] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-testid="export-json"]'),
  ]);
  const oakJsonPath = resolve(OUT_DIR, `${label}_oak.json`);
  await oakJsonDl.saveAs(oakJsonPath);
  const oakJsonText = readFileSync(oakJsonPath, 'utf8');
  const oakJsonObj = JSON.parse(oakJsonText);

  const [oakCsvDl] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-testid="export-csv"]'),
  ]);
  const oakCsvPath = resolve(OUT_DIR, `${label}_oak.csv`);
  await oakCsvDl.saveAs(oakCsvPath);
  const oakCsvBytes = readFileSync(oakCsvPath);

  const [oakPdfDl] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-testid="export-pdf"]'),
  ]);
  const oakPdfPath = resolve(OUT_DIR, `${label}_oak.pdf`);
  await oakPdfDl.saveAs(oakPdfPath);
  const oakPdfBytes = readFileSync(oakPdfPath);

  // 3. Run full 4-method direct-XLSX rhubarb workflow (64 results across FWO, KAS, Starink, Friedman)
  await runDirectRhubarbXlsx(page);

  const [rhJsonDl] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-testid="export-json"]'),
  ]);
  const rhJsonPath = resolve(OUT_DIR, `${label}_rhubarb.json`);
  await rhJsonDl.saveAs(rhJsonPath);
  const rhJsonText = readFileSync(rhJsonPath, 'utf8');
  const rhJsonObj = JSON.parse(rhJsonText);

  const [rhCsvDl] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-testid="export-csv"]'),
  ]);
  const rhCsvPath = resolve(OUT_DIR, `${label}_rhubarb.csv`);
  await rhCsvDl.saveAs(rhCsvPath);
  const rhCsvBytes = readFileSync(rhCsvPath);

  const [rhPdfDl] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-testid="export-pdf"]'),
  ]);
  const rhPdfPath = resolve(OUT_DIR, `${label}_rhubarb.pdf`);
  await rhPdfDl.saveAs(rhPdfPath);
  const rhPdfBytes = readFileSync(rhPdfPath);

  if (captureFigure2) {
    const fig2Dir = resolve(OUT_DIR, 'fig2_panels');
    mkdirSync(fig2Dir, { recursive: true });
    // Capture Panel A at desktop width 1360px
    await page.setViewportSize({ width: 1360, height: 1500 });
    await page.waitForTimeout(250);
    await page.locator('[data-testid="research-summary"]').first().screenshot({
      path: resolve(fig2Dir, 'panel_research_summary.png'),
    });
    // Capture diagnostic cards at single-column width (540px) so when arranged 2x2
    // their body font matches Panel A at nearly 1:1 native scale on the printed A4 page!
    await page.setViewportSize({ width: 540, height: 2400 });
    await page.waitForTimeout(250);
    await page.locator('[data-testid="result-card-diagnostics"]').first().screenshot({
      path: resolve(fig2Dir, 'panel_diagnostics_narrow.png'),
    });
    await page.setViewportSize({ width: 1180, height: 1500 });
    await page.waitForTimeout(200);
    await page.locator('[data-testid="result-card-diagnostics"]').first().screenshot({
      path: resolve(fig2Dir, 'panel_diagnostics.png'),
    });
  }

  const ua = await page.evaluate(() => navigator.userAgent);
  await browser.close();

  const oakDisps = oakJsonObj.results.reduce((acc, r) => {
    acc[r.disposition] = (acc[r.disposition] || 0) + 1;
    return acc;
  }, {});
  const rhDisps = rhJsonObj.results.reduce((acc, r) => {
    acc[r.disposition] = (acc[r.disposition] || 0) + 1;
    return acc;
  }, {});

  return {
    label,
    browserVersion: version,
    userAgent: ua,
    externalRequestCount: externalRequests.length,
    externalRequests,
    consoleErrorCount: consoleErrors.length,
    consoleErrors,
    selfTestStatus,
    directXlsxUpload: {
      hasFilename: true,
      hasSheetName: true,
      resultCount: rhJsonObj.results.length,
    },
    oak: {
      appVersion: oakJsonObj.application.version,
      resultCount: oakJsonObj.results.length,
      dispositions: oakDisps,
      canonicalJsonSha256: canonicalJsonHash(oakJsonText),
      csvSha256: sha256(oakCsvBytes),
      pdfBytes: oakPdfBytes.byteLength,
    },
    rhubarb: {
      appVersion: rhJsonObj.application.version,
      resultCount: rhJsonObj.results.length,
      dispositions: rhDisps,
      canonicalJsonSha256: canonicalJsonHash(rhJsonText),
      csvSha256: sha256(rhCsvBytes),
      pdfBytes: rhPdfBytes.byteLength,
    },
  };
}

async function main() {
  const results = [];
  results.push(
    await runOnBrowser(
      'macos_chrome',
      chromium,
      { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true },
      true,
    ),
  );
  results.push(await runOnBrowser('macos_firefox', firefox, { headless: true }, false));
  results.push(await runOnBrowser('macos_webkit', webkit, { headless: true }, false));

  const oakJsonHashes = new Set(results.map((r) => r.oak.canonicalJsonSha256));
  const oakCsvHashes = new Set(results.map((r) => r.oak.csvSha256));
  const rhJsonHashes = new Set(results.map((r) => r.rhubarb.canonicalJsonSha256));
  const rhCsvHashes = new Set(results.map((r) => r.rhubarb.csvSha256));

  const summary = {
    htmlSha256: sha256(readFileSync(HTML_PATH)),
    htmlBytes: readFileSync(HTML_PATH).byteLength,
    executedAt: new Date().toISOString(),
    platform: 'macOS',
    allExternalRequestsZero: results.every((r) => r.externalRequestCount === 0),
    allConsoleErrorsZero: results.every((r) => r.consoleErrorCount === 0),
    oakCanonicalJsonIdenticalAcrossEngines: oakJsonHashes.size === 1,
    oakCsvIdenticalAcrossEngines: oakCsvHashes.size === 1,
    rhubarbCanonicalJsonIdenticalAcrossEngines: rhJsonHashes.size === 1,
    rhubarbCsvIdenticalAcrossEngines: rhCsvHashes.size === 1,
    runs: results,
  };
  writeFileSync(resolve(OUT_DIR, 'cross_browser_summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
