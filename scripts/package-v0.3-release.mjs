#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const RELEASE_VERSION = '0.3.0';
export const RELEASE_DATE = '2026-07-30';
export const MANIFEST_SCHEMA =
  'activation-energy-studio/release-package-manifest/v1';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const RELEASE_DIR = path.resolve(PROJECT_ROOT, 'release');
const DIST_HTML = path.resolve(PROJECT_ROOT, 'dist/index.html');
const RELEASE_HTML_NAME =
  `Activation-Energy-Studio-v${RELEASE_VERSION}.html`;
const RELEASE_HTML = path.resolve(RELEASE_DIR, RELEASE_HTML_NAME);
const MANIFEST_NAME = `MANIFEST.v${RELEASE_VERSION}.json`;
const MANIFEST_PATH = path.resolve(RELEASE_DIR, MANIFEST_NAME);
const CHECKSUM_NAME = `SHA256SUMS.v${RELEASE_VERSION}.txt`;
const CHECKSUM_PATH = path.resolve(RELEASE_DIR, CHECKSUM_NAME);

const SOURCE_COPIES = Object.freeze([
  ['LICENSE', 'LICENSE'],
  ['CITATION.cff', 'CITATION.cff'],
  ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
  ['CHANGELOG.md', 'CHANGELOG.md'],
  ['SUPPORT.md', 'SUPPORT.md'],
]);

const PACKAGE_FILES = Object.freeze([
  {
    path: RELEASE_HTML_NAME,
    role: 'offline_single_html_application',
  },
  {
    path: 'index.html',
    role: 'bilingual_download_landing_page',
  },
  {
    path: 'README.md',
    role: 'bilingual_release_readme',
  },
  {
    path: 'QUICK_START_TR.md',
    role: 'five_minute_quick_start_tr',
  },
  {
    path: 'QUICK_START_EN.md',
    role: 'five_minute_quick_start_en',
  },
  {
    path: 'RELEASE_NOTES_v0.3.0.md',
    role: 'release_notes',
  },
  {
    path: 'LICENSE',
    role: 'application_license',
  },
  {
    path: 'CITATION.cff',
    role: 'software_citation_metadata',
  },
  {
    path: 'THIRD_PARTY_NOTICES.md',
    role: 'dataset_and_dependency_attribution',
  },
  {
    path: 'CHANGELOG.md',
    role: 'project_changelog',
  },
  {
    path: 'SUPPORT.md',
    role: 'bug_reporting_path',
  },
  {
    path: 'templates/curve-long.csv',
    role: 'long_curve_import_template',
  },
  {
    path: 'templates/supplied-dalpha-dt.txt',
    role: 'supplied_derivative_import_template',
  },
  {
    path: 'templates/beta-tp.csv',
    role: 'kissinger_peak_import_template',
  },
]);

function fail(message) {
  throw new Error(`[package-v0.3-release] ${message}`);
}

function requireFile(filePath, purpose) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    fail(`Missing ${purpose}: ${path.relative(PROJECT_ROOT, filePath)}`);
  }
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function packageEntry({ path: relativePath, role }) {
  const absolutePath = path.resolve(RELEASE_DIR, relativePath);
  requireFile(absolutePath, role);
  return {
    path: `release/${relativePath}`,
    role,
    bytes: statSync(absolutePath).size,
    sha256: sha256(absolutePath),
  };
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function portablePathOrder(left, right) {
  if (left.path < right.path) return -1;
  if (left.path > right.path) return 1;
  return 0;
}

requireFile(
  DIST_HTML,
  'built offline application; run the normal build before packaging',
);
const distHtml = readFileSync(DIST_HTML, 'utf8');
if (!/<!doctype html>/iu.test(distHtml) || !/<script\b/iu.test(distHtml)) {
  fail('dist/index.html is not a recognizable built application document.');
}

mkdirSync(RELEASE_DIR, { recursive: true });
copyFileSync(DIST_HTML, RELEASE_HTML);

for (const [sourceRelativePath, destinationRelativePath] of SOURCE_COPIES) {
  const source = path.resolve(PROJECT_ROOT, sourceRelativePath);
  const destination = path.resolve(RELEASE_DIR, destinationRelativePath);
  requireFile(source, `publication source ${sourceRelativePath}`);
  copyFileSync(source, destination);
}

const files = PACKAGE_FILES
  .map(packageEntry)
  .sort(portablePathOrder);
const releaseHtml = files.find(
  ({ path: filePath }) => filePath === `release/${RELEASE_HTML_NAME}`,
);
if (!releaseHtml) fail('The packaged HTML was not included in the file set.');

const manifest = {
  schema: MANIFEST_SCHEMA,
  release: {
    name: 'Activation Energy Studio',
    version: RELEASE_VERSION,
    releaseDate: RELEASE_DATE,
    classification: 'RESEARCH_PREVIEW',
    artifact: releaseHtml.path,
    bytes: releaseHtml.bytes,
    sha256: releaseHtml.sha256,
  },
  integrityScope: {
    claim:
      'This manifest binds exact package bytes. It does not establish scientific validity, human usability, or platform approval.',
    hashAlgorithm: 'sha256',
    hashInput: 'raw_file_bytes',
    deterministic: true,
    generatedTimestampOmitted: true,
  },
  realExamples: [
    {
      id: 'chilean-oak-raw',
      resultType: 'isoconversional',
      methods: ['FWO', 'KAS', 'STARINK'],
      sourceDoi: '10.17632/gkhjh4v8tg.2',
      license: 'CC-BY-4.0',
      alphaGrid: { start: 0.05, end: 0.85, step: 0.05 },
    },
    {
      id: 'paper010-supplied-dalpha-dt',
      resultType: 'isoconversional',
      methods: ['FRIEDMAN'],
      sourceDoi: '10.1371/journal.pone.0173946.s002',
      license: 'CC-BY-4.0',
      alphaGrid: { start: 0.05, end: 0.8, step: 0.05 },
      transformation:
        'Deterministically derived from official S2 TG and -DTG under the locked fixture recipe.',
    },
    {
      id: 'paper063-kissinger-beta-tp',
      resultType: 'peak',
      methods: ['KISSINGER'],
      sourceDoi: '10.3390/ma13245595',
      license: 'CC-BY-4.0 article content',
      separateDatasetLicense: null,
      boundary:
        'Article-derived five-row beta-Tp transcription at printed 1 K resolution; not raw curve data.',
    },
  ],
  claimBoundaries: [
    'Outputs are apparent activation energies conditional on sample, atmosphere, stage, preprocessing, method, and selected conversion range.',
    'Regression confidence intervals do not cover every source of experimental and model-form uncertainty.',
    'A device-profile match is advisory and must be confirmed before ingestion options are applied.',
    'Generic DTG is not automatically equivalent to direct d(alpha)/dt.',
    'Paper063 has an article CC BY 4.0 license but no separate raw-dataset license.',
  ],
  files,
  generation: {
    generator: 'scripts/package-v0.3-release.mjs',
    command:
      'npm run build && node scripts/package-v0.3-release.mjs',
    sourceArtifact: 'dist/index.html',
    manifestPath: `release/${MANIFEST_NAME}`,
    checksumPath: `release/${CHECKSUM_NAME}`,
    manifestSelfHashExcluded: true,
    checksumSelfHashExcluded: true,
  },
};

writeJson(MANIFEST_PATH, manifest);

const checksumEntries = [
  ...files.map(({ path: filePath, sha256: digest }) => ({
    path: filePath.replace(/^release\//u, ''),
    sha256: digest,
  })),
  {
    path: MANIFEST_NAME,
    sha256: sha256(MANIFEST_PATH),
  },
].sort(portablePathOrder);

writeFileSync(
  CHECKSUM_PATH,
  `${checksumEntries
    .map(({ path: filePath, sha256: digest }) => `${digest}  ${filePath}`)
    .join('\n')}\n`,
  'utf8',
);

process.stdout.write(
  [
    `Packaged ${path.relative(PROJECT_ROOT, RELEASE_HTML)}`,
    `SHA-256 ${releaseHtml.sha256}`,
    `Wrote ${path.relative(PROJECT_ROOT, MANIFEST_PATH)}`,
    `Wrote ${path.relative(PROJECT_ROOT, CHECKSUM_PATH)}`,
  ].join('\n') + '\n',
);
