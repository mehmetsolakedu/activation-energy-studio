import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PATH = resolve(PROJECT_ROOT, 'release/v0.4.1/Activation-Energy-Studio-v0.4.1.html');
const OUT_DIR = resolve(PROJECT_ROOT, 'output/browser-verification-v0.4.1');
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

async function runOnBrowser(label, launcher, launchOpts, captureFigure2 = false) {
  const browser = await launcher.launch(launchOpts);
  const version = browser.version();
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1320, height: 960 },
    deviceScaleFactor: 2,
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

  // 2. Run Built-in Chilean Oak workflow
  await page.click('button[data-example-id="chilean-oak-raw"]');
  await page.waitForSelector('[data-testid="confirm-interpretation"]');
  await page.check('[data-testid="confirm-interpretation"]');
  await page.click('[data-testid="run-analysis"]');
  await page.waitForSelector('[data-testid="numeric-results"]', { timeout: 20000 });

  // Export Oak JSON & CSV
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

  // 3. Verify direct XLSX binary upload via file input (exercises read-excel-file + fflate in real browser!)
  await page.click('[data-testid="clear-files"]');
  await page.setInputFiles('[data-testid="thermal-file-input"]', RHUBARB_XLSX);
  await page.waitForSelector('section.mapping-wizard', { timeout: 15000 });
  await page.waitForFunction(
    () => {
      const body = document.body.textContent || '';
      return body.includes('pone.0173946.s002.xlsx') && body.includes('Mapping required');
    },
    { timeout: 15000 },
  );
  await page.waitForSelector('[data-testid="header-row-input"]', { timeout: 15000 });
  await page.fill('[data-testid="header-row-input"]', '3');
  await page.click('[data-testid="apply-mapping"]');
  await page.waitForFunction(
    () => (document.body.textContent || '').includes('2. weight'),
    { timeout: 15000 },
  );
  await page.waitForSelector('[data-testid="table-layout"]', { timeout: 15000 });
  const xlsxDetected = await page.evaluate(() => {
    const body = document.body.textContent || '';
    const layoutSelect = document.querySelector('[data-testid="table-layout"]');
    const wideOption = Array.from(layoutSelect?.querySelectorAll('option') || []).some(
      (opt) => opt.value === 'wide-series',
    );
    return {
      hasFilename: body.includes('pone.0173946.s002.xlsx'),
      mappingWizardOpened: Boolean(document.querySelector('section.mapping-wizard')),
      headerRow3RereadVerified: Boolean(layoutSelect) && wideOption && body.includes('2. weight'),
    };
  });

  // Also load the built-in rhubarb supplied-dalpha-dt example so we get full 4-method 64-result UI for verification + clean Fig 2 screenshots!
  await page.click('[data-testid="expert-mode"]');
  await page.click('button[data-example-id="paper010-supplied-dalpha-dt"]');
  await page.waitForSelector('[data-testid="confirm-interpretation"]');
  await page.check('[data-testid="confirm-interpretation"]');
  await page.click('[data-testid="run-analysis"]');
  await page.waitForSelector('[data-testid="numeric-results"]', { timeout: 20000 });

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
    // Capture crisp full-width component screenshots at 2x DPI for print-legible Figure 2!
    await page.setViewportSize({ width: 1120, height: 1400 });
    await page.waitForTimeout(300);
    // Find clean cards: summary cards, method selector / R2 threshold, research summary decision panel
    const summaryEl = page.locator('[data-testid="research-summary"]').first();
    if (await summaryEl.count()) {
      await summaryEl.screenshot({ path: resolve(SHOTS_DIR, 'v041_rhubarb_research_summary.png') });
    }
    const diagEl = page.locator('[data-testid="result-card-diagnostics"]').first();
    if (await diagEl.count()) {
      await diagEl.screenshot({ path: resolve(SHOTS_DIR, 'v041_rhubarb_diagnostics.png') });
    }
    const resultsTableEl = page.locator('[data-testid="numeric-results"]').first();
    if (await resultsTableEl.count()) {
      await resultsTableEl.screenshot({ path: resolve(SHOTS_DIR, 'v041_rhubarb_results_table.png') });
    }
    // Also capture the full page and key sections by DOM inspection
    const sections = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('section.card, article.card')).map((el, i) => ({
        idx: i,
        cls: el.className,
        testid: el.getAttribute('data-testid'),
        heading: el.querySelector('h2, h3')?.textContent?.trim() || '',
        rect: el.getBoundingClientRect().toJSON(),
      }));
    });
    writeFileSync(resolve(SHOTS_DIR, 'sections.json'), JSON.stringify(sections, null, 2));
    // Capture each key card cleanly
    const cards = page.locator('section.card, article.card');
    const cardCount = await cards.count();
    for (let i = 0; i < cardCount; i++) {
      const box = await cards.nth(i).boundingBox();
      if (box && box.height > 40 && box.height < 2200) {
        await cards.nth(i).screenshot({ path: resolve(SHOTS_DIR, `card_${i}.png`) });
      }
    }
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
    directXlsxUpload: xlsxDetected,
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
  const macChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chromeExecutable = process.env.CHROME_PATH || (existsSync(macChromePath) ? macChromePath : undefined);
  results.push(
    await runOnBrowser(
      'macos_chrome',
      chromium,
      chromeExecutable ? { executablePath: chromeExecutable, headless: true } : { headless: true },
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
    htmlPath: 'release/v0.4.1/Activation-Energy-Studio-v0.4.1.html',
    htmlSha256: sha256(readFileSync(HTML_PATH)),
    executedAt: new Date().toISOString(),
    os: `${process.platform} ${process.arch}`,
    allExternalRequestsZero: results.every((r) => r.externalRequestCount === 0),
    allConsoleErrorsZero: results.every((r) => r.consoleErrorCount === 0),
    oakCanonicalJsonIdenticalAcrossEngines: oakJsonHashes.size === 1,
    oakCsvIdenticalAcrossEngines: oakCsvHashes.size === 1,
    rhubarbCanonicalJsonIdenticalAcrossEngines: rhJsonHashes.size === 1,
    rhubarbCsvIdenticalAcrossEngines: rhCsvHashes.size === 1,
    runs: results,
  };
  writeFileSync(resolve(OUT_DIR, 'cross_browser_summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
