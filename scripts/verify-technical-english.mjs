#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const TEXT_EXTENSIONS = new Set([
  '.cff',
  '.css',
  '.csv',
  '.html',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.txt',
]);

const ACTIVE_DIRECTORIES = [
  'src',
  'scripts',
  'tests',
  'docs/technical-english',
  'release/v0.3.1',
  'release/v0.3.2',
  'release/v0.4.0',
];

const ACTIVE_FILES = [
  'package.json',
  'index.html',
  'dist/index.html',
  'README.md',
  'CHANGELOG.md',
  'CITATION.cff',
  'SUPPORT.md',
  'THIRD_PARTY_NOTICES.md',
  '01_SCIENTIFIC_SPEC_V1_1_ADDENDUM.md',
  'evidence/EXTERNAL_HUMAN_LANES_DISPATCH.md',
  'evidence/validation/REAL_DATA_VALIDATION_FINAL_REPORT.en.md',
  'evidence/validation/oak-publication-audit/OAK_PUBLICATION_AUDIT.en.md',
];

const HISTORICAL_ACTIVE_FILES = new Set([
  'scripts/package-v0.3-release.mjs',
  'scripts/generate-scientific-review-package.mjs',
  'scripts/run-paper010-raw-to-report.mjs',
]);
const IMMUTABLE_V02_FILES = [
  '00_MISSION_LOCK.md',
  '01_SCIENTIFIC_SPEC_V1.md',
  '02_ACCEPTANCE_CRITERIA.md',
  'CURRENT_VALIDATION_STATUS.md',
  'PLATFORM_VALIDATION_PROTOCOL.md',
  'REAL_DATA_VALIDATION_GOAL.md',
  'SCIENTIFIC_REVIEW_SIGNOFF_PROTOCOL.md',
  'USABILITY_VALIDATION_PROTOCOL.md',
  'scripts/generate-scientific-review-package.mjs',
];

// Exact exceptions are limited to historical/negative test fixtures and the
// author's official proper-noun affiliation. Removing one occurrence must also
// remove its allowance here, so the exception set cannot silently grow.
const EXACT_TEXT_ALLOWANCES = new Map([
  [
    'tests/english-only-ui-contract.test.tsx',
    [
      ['[data-testid="language', 'en"]'].join('-'),
      '[\u00c7\u011e\u0130\u00d6\u015e\u00dc\u00e7\u011f\u0131\u00f6\u015f\u00fc]',
    ],
  ],
  [
    'tests/validation-status-boundary.test.ts',
    [
      'Yaln\u0131z `PASS` kap\u0131y\u0131 kapat\u0131r.',
      'insan oturumlar\u0131na ait UI/PDF kay\u0131tlar\u0131 toplanmam\u0131\u015ft\u0131r',
    ],
  ],
  [
    'tests/platform-human-review-record.test.ts',
    ['Dr. Ay\u015fe Kaya'],
  ],
  [
    'CITATION.cff',
    [
      'authors:\n  - family-names: Solak\n    given-names: Mehmet\n    affiliation: Biosystems Engineering, Siirt University, Siirt, T\u00fcrkiye\nversion:',
      'preferred-citation:\n  type: software\n  title: Activation Energy Studio\n  authors:\n    - family-names: Solak\n      given-names: Mehmet\n      affiliation: Biosystems Engineering, Siirt University, Siirt, T\u00fcrkiye\n  year:',
    ],
  ],
  [
    'release/v0.4.0/CITATION.cff',
    [
      'authors:\n  - family-names: Solak\n    given-names: Mehmet\n    affiliation: Biosystems Engineering, Siirt University, Siirt, T\u00fcrkiye\nversion:',
      'preferred-citation:\n  type: software\n  title: Activation Energy Studio\n  authors:\n    - family-names: Solak\n      given-names: Mehmet\n      affiliation: Biosystems Engineering, Siirt University, Siirt, T\u00fcrkiye\n  year:',
    ],
  ],
]);

const PDF_TRANSLITERATION_ALLOWANCES = [
  ['\u015f', 's'],
  ['\u015e', 'S'],
  ['\u011f', 'g'],
  ['\u011e', 'G'],
  ['\u0131', 'i'],
  ['\u0130', 'I'],
  ['\u00e7', 'c'],
  ['\u00c7', 'C'],
  ['\u00f6', 'o'],
  ['\u00d6', 'O'],
  ['\u00fc', 'u'],
  ['\u00dc', 'U'],
].map(([source, replacement]) => `.replaceAll(\`${source}\`,\`${replacement}\`)`);

const EXACT_HTML_ALLOWANCES = new Map([
  ['dist/index.html', PDF_TRANSLITERATION_ALLOWANCES],
  [
    'release/v0.3.1/Activation-Energy-Studio-v0.3.1.html',
    PDF_TRANSLITERATION_ALLOWANCES,
  ],
  [
    'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html',
    PDF_TRANSLITERATION_ALLOWANCES,
  ],
  [
    'release/v0.4.0/Activation-Energy-Studio-v0.4.0.html',
    PDF_TRANSLITERATION_ALLOWANCES,
  ],
]);

const TURKISH_CHARACTERS = /[\u00c7\u011e\u0130\u00d6\u015e\u00dc\u00e7\u011f\u0131\u00f6\u015f\u00fc]/gu;

const asciiTurkishWords = [
  ['hesap', 'lama'].join(''),
  ['red', 'di'].join(''),
  ['par', 'mak'].join(''),
  ['duru', 'mu'].join(''),
  ['da', 'kika'].join(''),
  ['sa', 'niye'].join(''),
  ['yuz', 'de'].join(''),
  ['cali', 'stir'].join(''),
  ['or', 'nek'].join(''),
  ['so', 'nuc'].join(''),
  ['dos', 'ya'].join(''),
  ['yuk', 'le'].join(''),
];
const ASCII_TURKISH = new RegExp(
  `\\b(?:${asciiTurkishWords.join('|')})\\b`,
  'giu',
);

const forbiddenProductTokens = [
  ['language', 'tr'].join('-'),
  ['language', 'en'].join('-'),
  ['QUICK', 'START', 'TR'].join('_'),
  ['bilingual', 'download'].join('_'),
  ['bilingual', 'release'].join('_'),
  ['five', 'minute', 'quick', 'start', 'tr'].join('_'),
  ['diagnostics', 'tr'].join('/'),
  ['src', 'i18n'].join('/'),
];
const FORBIDDEN_PRODUCT_TOKENS = new RegExp(
  forbiddenProductTokens
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
    .join('|'),
  'giu',
);
const TURKISH_HTML_LANGUAGE = /<html\b[^>]*\blang\s*=\s*["']tr(?:-TR)?["']/giu;

function fail(message) {
  throw new Error(`[technical-english] ${message}`);
}

function projectPath(relativePath) {
  return path.resolve(PROJECT_ROOT, relativePath);
}

function portableRelative(absolutePath) {
  return path.relative(PROJECT_ROOT, absolutePath).split(path.sep).join('/');
}

function collectDirectory(relativeDirectory, output) {
  const absoluteDirectory = projectPath(relativeDirectory);
  if (!existsSync(absoluteDirectory) || !statSync(absoluteDirectory).isDirectory()) {
    fail(`Missing active directory: ${relativeDirectory}`);
  }
  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const absolutePath = path.resolve(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      collectDirectory(portableRelative(absolutePath), output);
      continue;
    }
    if (!entry.isFile() || !TEXT_EXTENSIONS.has(path.extname(entry.name))) continue;
    const relativePath = portableRelative(absolutePath);
    if (HISTORICAL_ACTIVE_FILES.has(relativePath)) continue;
    output.add(relativePath);
  }
}

function lineAndColumn(text, index) {
  const prefix = text.slice(0, index);
  const lines = prefix.split('\n');
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

function neutralizeExactAllowances(relativePath, source) {
  let text = source;
  const allowances = [
    ...(EXACT_TEXT_ALLOWANCES.get(relativePath) ?? []),
    ...(EXACT_HTML_ALLOWANCES.get(relativePath) ?? []),
  ];
  for (const allowed of allowances) {
    const firstIndex = text.indexOf(allowed);
    if (firstIndex < 0) {
      fail(`Stale exact allowance in ${relativePath}: ${JSON.stringify(allowed)}`);
    }
    if (text.indexOf(allowed, firstIndex + allowed.length) >= 0) {
      fail(`Exact allowance occurs more than once in ${relativePath}: ${JSON.stringify(allowed)}`);
    }
    text = `${text.slice(0, firstIndex)}${' '.repeat(allowed.length)}${text.slice(firstIndex + allowed.length)}`;
  }
  return text;
}

function scanPattern(relativePath, source, pattern, label, violations) {
  pattern.lastIndex = 0;
  for (const match of source.matchAll(pattern)) {
    const location = lineAndColumn(source, match.index ?? 0);
    violations.push(
      `${relativePath}:${location.line}:${location.column} ${label}: ${JSON.stringify(match[0])}`,
    );
  }
}

function sha256(absolutePath) {
  return createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
}

function verifyImmutableHistoricalFiles() {
  const manifestPath = projectPath('release/MANIFEST.v0.2.0.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const evidenceByPath = new Map(
    manifest.evidence.map((entry) => [entry.path, entry]),
  );
  for (const relativePath of IMMUTABLE_V02_FILES) {
    const entry = evidenceByPath.get(relativePath);
    if (!entry?.sha256) fail(`v0.2 manifest does not bind ${relativePath}`);
    const absolutePath = projectPath(relativePath);
    if (!existsSync(absolutePath)) fail(`Missing immutable v0.2 document: ${relativePath}`);
    const observed = sha256(absolutePath);
    if (observed !== entry.sha256) {
      fail(
        `Immutable v0.2 document changed: ${relativePath}; expected ${entry.sha256}, observed ${observed}`,
      );
    }
  }
}

function verifyImmutablePaper010Runner() {
  const manifestPath = projectPath(
    'evidence/validation/paper010-raw-to-report-v0.2.0-local/PAPER010_RAW_TO_REPORT_MANIFEST.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const relativePath = 'scripts/run-paper010-raw-to-report.mjs';
  const entry = manifest.implementationSources.find(
    (candidate) => candidate.path === relativePath,
  );
  if (!entry?.sha256) fail(`Historical Paper010 manifest does not bind ${relativePath}`);
  const observed = sha256(projectPath(relativePath));
  if (observed !== entry.sha256) {
    fail(
      `Immutable Paper010 v0.2 runner changed: expected ${entry.sha256}, observed ${observed}`,
    );
  }
}

function requireEnglishHtml(relativePath, source, violations) {
  if (!/<html\b[^>]*\blang\s*=\s*["']en["']/iu.test(source)) {
    violations.push(`${relativePath}: missing <html lang="en"> contract`);
  }
}

verifyImmutableHistoricalFiles();
verifyImmutablePaper010Runner();

for (const removedPath of [
  ['src', 'i18n.ts'].join('/'),
  ['src/diagnostics', 'tr.ts'].join('/'),
]) {
  if (existsSync(projectPath(removedPath))) fail(`Legacy locale module still exists: ${removedPath}`);
}

const activeFiles = new Set();
for (const relativeDirectory of ACTIVE_DIRECTORIES) {
  collectDirectory(relativeDirectory, activeFiles);
}
for (const relativePath of ACTIVE_FILES) {
  const absolutePath = projectPath(relativePath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    fail(`Missing active file: ${relativePath}`);
  }
  activeFiles.add(relativePath);
}

const violations = [];
for (const relativePath of [...activeFiles].sort()) {
  const original = readFileSync(projectPath(relativePath), 'utf8');
  const source = neutralizeExactAllowances(relativePath, original);
  scanPattern(relativePath, source, TURKISH_CHARACTERS, 'Turkish character', violations);
  scanPattern(relativePath, source, ASCII_TURKISH, 'high-confidence Turkish token', violations);
  scanPattern(relativePath, source, FORBIDDEN_PRODUCT_TOKENS, 'legacy locale/product token', violations);
  scanPattern(relativePath, source, TURKISH_HTML_LANGUAGE, 'Turkish HTML language', violations);
  if (
    relativePath === 'index.html'
    || relativePath === 'dist/index.html'
    || relativePath === 'release/v0.3.1/index.html'
    || relativePath === 'release/v0.3.1/Activation-Energy-Studio-v0.3.1.html'
    || relativePath === 'release/v0.3.2/index.html'
    || relativePath === 'release/v0.3.2/Activation-Energy-Studio-v0.3.2.html'
  ) {
    requireEnglishHtml(relativePath, source, violations);
  }
}

if (violations.length > 0) {
  fail(`English-only contract failed:\n${violations.map((item) => `- ${item}`).join('\n')}`);
}

process.stdout.write(
  `Technical-English gate passed: ${activeFiles.size} active text files scanned; `
    + `${IMMUTABLE_V02_FILES.length} immutable v0.2 files and one historical runner `
    + 'verified by SHA-256.\n',
);
