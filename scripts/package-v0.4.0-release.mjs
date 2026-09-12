#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { verifyProductionSbom } from './verify-production-sbom.mjs';

export const RELEASE_VERSION = '0.4.0';
export const MANIFEST_SCHEMA =
  'activation-energy-studio/release-package-manifest/v1';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const RELEASE_DIR = path.resolve(
  PROJECT_ROOT,
  'release',
  `v${RELEASE_VERSION}`,
);
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
  ['CHANGELOG.md', 'CHANGELOG.md'],
  ['SUPPORT.md', 'SUPPORT.md'],
  [
    '01_SCIENTIFIC_SPEC_V1_1_ADDENDUM.md',
    'SCIENTIFIC_SPEC_V1_1_ADDENDUM.md',
  ],
  ['src/report/project-report.schema.json', 'project-report.schema.json'],
  ['release/templates/curve-long.csv', 'templates/curve-long.csv'],
  [
    'release/templates/supplied-dalpha-dt.txt',
    'templates/supplied-dalpha-dt.txt',
  ],
  ['release/templates/beta-tp.csv', 'templates/beta-tp.csv'],
]);

const EXACT_ROLES = Object.freeze({
  '.gitattributes': 'line_ending_integrity_policy',
  [RELEASE_HTML_NAME]: 'offline_single_html_application',
  'index.html': 'english_release_landing_page',
  'README.md': 'english_release_readme',
  'QUICK_START.md': 'english_five_minute_quick_start',
  'RELEASE_NOTES_v0.4.0.md': 'research_preview_release_notes',
  'LICENSE': 'application_license',
  'CITATION.cff': 'software_citation_metadata',
  'THIRD_PARTY_NOTICES.md': 'dataset_and_dependency_attribution',
  'CHANGELOG.md': 'project_changelog',
  'SUPPORT.md': 'bug_reporting_path',
  'SCIENTIFIC_SPEC_V1_1_ADDENDUM.md':
    'normative_v0.4.0_scientific_correction_contract',
  'project-report.schema.json': 'reproducible_project_report_schema_v7',
  'SBOM.production.cdx.json': 'cyclonedx_production_dependency_sbom',
  'templates/curve-long.csv': 'long_curve_import_template',
  'templates/supplied-dalpha-dt.txt':
    'supplied_derivative_import_template',
  'templates/beta-tp.csv': 'kissinger_peak_import_template',
});

function fail(message) {
  throw new Error(`[package-v0.4.0-release] ${message}`);
}

function requireFile(filePath, purpose) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    fail(`Missing ${purpose}: ${path.relative(PROJECT_ROOT, filePath)}`);
  }
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

function portableOrder(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function portablePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function walkRegularFiles(directory, relativeDirectory = '') {
  const absoluteDirectory = path.resolve(directory, relativeDirectory);
  const result = [];
  const entries = readdirSync(absoluteDirectory, { withFileTypes: true })
    .sort((left, right) => portableOrder(left.name, right.name));
  for (const entry of entries) {
    const relativePath = relativeDirectory
      ? path.join(relativeDirectory, entry.name)
      : entry.name;
    const absolutePath = path.resolve(directory, relativePath);
    if (entry.isSymbolicLink() || lstatSync(absolutePath).isSymbolicLink()) {
      fail(`Symlinks are forbidden in the release package: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      result.push(...walkRegularFiles(directory, relativePath));
    } else if (entry.isFile()) {
      result.push(portablePath(relativePath));
    } else {
      fail(`Unsupported release entry: ${relativePath}`);
    }
  }
  return result.sort(portableOrder);
}

function roleFor(relativePath) {
  if (EXACT_ROLES[relativePath]) return EXACT_ROLES[relativePath];
  if (/^licenses\/[^/]+\/[^/]+$/u.test(relativePath)) {
    return 'third_party_dependency_license_text';
  }
  fail(`Unclassified file in v0.4.0 package: ${relativePath}`);
}

function packageEntry(relativePath) {
  const absolutePath = path.resolve(RELEASE_DIR, ...relativePath.split('/'));
  requireFile(absolutePath, roleFor(relativePath));
  return {
    path: `release/v${RELEASE_VERSION}/${relativePath}`,
    role: roleFor(relativePath),
    bytes: statSync(absolutePath).size,
    sha256: sha256(absolutePath),
  };
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
rmSync(MANIFEST_PATH, { force: true });
rmSync(CHECKSUM_PATH, { force: true });
copyFileSync(DIST_HTML, RELEASE_HTML);

for (const [sourceRelativePath, destinationRelativePath] of SOURCE_COPIES) {
  const source = path.resolve(PROJECT_ROOT, sourceRelativePath);
  const destination = path.resolve(RELEASE_DIR, destinationRelativePath);
  requireFile(source, `publication source ${sourceRelativePath}`);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

const requiredAuthoredFiles = [
  '.gitattributes',
  'index.html',
  'README.md',
  'QUICK_START.md',
  'RELEASE_NOTES_v0.4.0.md',
  'SBOM.production.cdx.json',
  'THIRD_PARTY_NOTICES.md',
];
for (const relativePath of requiredAuthoredFiles) {
  requireFile(
    path.resolve(RELEASE_DIR, relativePath),
    `v0.4.0 package source ${relativePath}`,
  );
}

const sbomVerification = verifyProductionSbom({
  projectRoot: PROJECT_ROOT,
  sbomPath: 'release/v0.4.0/SBOM.production.cdx.json',
});

const packagePaths = walkRegularFiles(RELEASE_DIR)
  .filter((relativePath) =>
    relativePath !== MANIFEST_NAME && relativePath !== CHECKSUM_NAME,
  );
const files = packagePaths.map(packageEntry);
const releaseHtml = files.find(
  ({ path: filePath }) =>
    filePath === `release/v${RELEASE_VERSION}/${RELEASE_HTML_NAME}`,
);
if (!releaseHtml) fail('The packaged HTML was not included in the file set.');

const packageJsonPath = path.resolve(PROJECT_ROOT, 'package.json');
const packageLockPath = path.resolve(PROJECT_ROOT, 'package-lock.json');
requireFile(packageJsonPath, 'package.json');
requireFile(packageLockPath, 'package-lock.json');

const manifest = {
  schema: MANIFEST_SCHEMA,
  release: {
    name: 'Activation Energy Studio',
    version: RELEASE_VERSION,
    status: 'RELEASED_RESEARCH_PREVIEW',
    classification: 'RESEARCH_PREVIEW',
    releaseDate: '2026-09-12',
    externalPublicationApproved: true,
    releaseAuthority: 'Mehmet Solak',
    canonicalRepository:
      'https://github.com/mehmetsolakedu/activation-energy-studio',
    canonicalWebApplication:
      'https://mehmetsolak.cc/activation-energy-studio/',
    artifact: releaseHtml.path,
    bytes: releaseHtml.bytes,
    sha256: releaseHtml.sha256,
  },
  integrityScope: {
    claim:
      'This manifest binds exact Research Preview release-package bytes and records the author\'s publication approval. It does not by itself prove deployment at a URL, journal revision, scientific-validity certification, or independent human/platform approval.',
    hashAlgorithm: 'sha256',
    hashInput: 'raw_file_bytes',
    deterministic: true,
    generatedTimestampOmitted: true,
  },
  sourceInputs: {
    packageJsonSha256: sha256(packageJsonPath),
    packageLockSha256: sha256(packageLockPath),
    builtArtifactSha256: sha256(DIST_HTML),
    reportSchemaSha256: sha256(
      path.resolve(PROJECT_ROOT, 'src/report/project-report.schema.json'),
    ),
  },
  auditProvenance: {
    frozenCandidateCommit: '7ea6575342c822eae609ba3d32a785dcb5a94b6e',
    frozenCandidateTree: 'a5519de096dbee8cdc884beb77e1cac756946135',
    frozenCandidateHtmlSha256:
      '5835a87ce4c8526158b15ed3350428cc17455455ebcc9993e6d6cf8b3cc6157e',
    verdict:
      'CONDITIONAL PASS — SAFE RESEARCH PREVIEW WITH LISTED LIMITATIONS',
    promotionScope:
      'Release-state UI copy, documentation, citation, package metadata, and their tests only; scientific and calculation code is unchanged from the frozen candidate.',
  },
  scientificMethods: {
    isoconversional: ['FWO', 'KAS', 'STARINK', 'FRIEDMAN'],
    peakBasedSeparateWorkflow: ['KISSINGER'],
    reportSchema: 'activation-energy-studio/project-report/v7',
    scientificCore: 'activation-energy-core/v3',
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
    'Regression confidence intervals do not cover every source of experimental and model-form uncertainty, including temperature lag.',
    'The x-spread refusal floor is a numerical-conditioning guard, not an instrument-specific metrological threshold.',
    'A device-profile match is advisory and must be confirmed before ingestion options are applied.',
    'Generic DTG is not automatically equivalent to direct d(alpha)/dt.',
    'Paper063 has an article CC BY 4.0 license but no separate raw-dataset license.',
  ],
  files,
  generation: {
    generator: 'scripts/package-v0.4.0-release.mjs',
    command: 'npm run package:v0.4.0',
    sourceArtifact: 'dist/index.html',
    manifestPath: `release/v${RELEASE_VERSION}/${MANIFEST_NAME}`,
    checksumPath: `release/v${RELEASE_VERSION}/${CHECKSUM_NAME}`,
    manifestSelfHashExcluded: true,
    checksumSelfHashExcluded: true,
  },
};

writeJson(MANIFEST_PATH, manifest);

const checksumEntries = [
  ...files.map(({ path: filePath, sha256: digest }) => ({
    path: filePath.replace(`release/v${RELEASE_VERSION}/`, ''),
    sha256: digest,
  })),
  { path: MANIFEST_NAME, sha256: sha256(MANIFEST_PATH) },
].sort((left, right) => portableOrder(left.path, right.path));

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
    `Manifest files ${files.length}`,
    `SBOM components ${sbomVerification.componentCount}`,
    `Wrote ${path.relative(PROJECT_ROOT, MANIFEST_PATH)}`,
    `Wrote ${path.relative(PROJECT_ROOT, CHECKSUM_PATH)}`,
  ].join('\n') + '\n',
);
