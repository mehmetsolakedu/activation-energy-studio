#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import Papa from 'papaparse';

export const CORPUS_LEDGER_SCHEMA =
  'activation-energy-studio/corpus-integrity-ledger/v1';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
export const DEFAULT_EVIDENCE_ROOT = resolve(
  DEFAULT_PROJECT_ROOT,
  '../01_PDF_Evidence_Extraction',
);
export const DEFAULT_OUTPUT = resolve(
  DEFAULT_PROJECT_ROOT,
  'evidence/corpus/CORPUS_INTEGRITY_LEDGER.json',
);

const PROCESSING_ORDER = '00_Start_Here/paper_processing_order.csv';
const CANONICAL_EVIDENCE =
  '05_Canonical_Evidence_Table/activation_energy_evidence.csv';
const METHOD_MATRIX = '06_Method_Evidence_Matrix/method_evidence_matrix.csv';
const EXPECTED_PAPER_IDS = Array.from({ length: 231 }, (_, index) =>
  String(index + 1).padStart(3, '0'),
);
const IMPLEMENTED_METHOD_ROUTES = [
  { method: 'FWO', paperId: '056', matrixMethod: 'Flynn-Wall-Ozawa (FWO) method' },
  { method: 'KAS', paperId: '002', matrixMethod: 'Kissinger-Akahira-Sunose (KAS)' },
  { method: 'STARINK', paperId: '063', matrixMethod: 'Starink method' },
  { method: 'FRIEDMAN', paperId: '010', matrixMethod: 'Friedman method' },
  { method: 'KISSINGER', paperId: '064', matrixMethod: 'Kissinger method' },
];

function fail(message) {
  throw new Error(message);
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function nonemptyFile(path, label) {
  if (!existsSync(path)) fail(`Missing ${label}: ${path}`);
  const stat = statSync(path);
  if (!stat.isFile() || stat.size <= 0) fail(`Empty or non-file ${label}: ${path}`);
  return stat;
}

function nonemptyDirectory(path, label) {
  if (!existsSync(path)) fail(`Missing ${label}: ${path}`);
  const stat = statSync(path);
  if (!stat.isDirectory() || readdirSync(path).length === 0) {
    fail(`Empty or non-directory ${label}: ${path}`);
  }
  return stat;
}

function parseCsv(path, label) {
  const parsed = Papa.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length > 0) {
    fail(`${label} CSV parse failed: ${parsed.errors[0].message}`);
  }
  return parsed.data;
}

function exactPaperIdSet(rows, label, allowBlank = false) {
  const ids = rows.map((row) => String(row.paper_id ?? '').trim());
  const blanks = ids.filter((id) => id === '').length;
  if (!allowBlank && blanks > 0) fail(`${label} contains ${blanks} blank paper_id rows.`);
  const nonblank = ids.filter(Boolean);
  const invalid = [...new Set(nonblank.filter((id) => !/^\d{3}$/.test(id)))].sort();
  if (invalid.length > 0) fail(`${label} has invalid paper IDs: ${invalid.join(', ')}.`);
  const unique = [...new Set(nonblank)].sort();
  const missing = EXPECTED_PAPER_IDS.filter((id) => !unique.includes(id));
  const unexpected = unique.filter((id) => !EXPECTED_PAPER_IDS.includes(id));
  return { blanks, unique, missing, unexpected };
}

function inferBlankMethodPaperId(row) {
  const sample = String(row.samples ?? '').toLowerCase();
  const method = String(row.method_name ?? '').toLowerCase();
  const all = Object.values(row).join(' | ').toLowerCase();
  const matches = [];

  if (/\bperas\b|\bperpf\b|perindopril/.test(all)) matches.push('011');
  if (
    /\bscb\b|soft wood|sugarcane|cellulose/.test(sample) ||
    /xrd crystallinity|vyazovkin, coats-redfern/.test(method)
  ) {
    matches.push('012');
  }
  if (
    /\bpeo\b|macromonomer|polymacromonomer/.test(sample) ||
    /table 6 ofw|table 7 kissinger|ofw and kissinger literature/.test(method)
  ) {
    matches.push('013');
  }

  const unique = [...new Set(matches)];
  if (unique.length !== 1) {
    fail(
      `Cannot uniquely assign blank method-matrix row "${row.method_name}": ${
        unique.length === 0 ? 'no candidate' : unique.join(', ')
      }.`,
    );
  }
  return unique[0];
}

function correctionFingerprint(row) {
  return sha256Bytes(
    Buffer.from(
      Object.entries(row)
        .filter(([key]) => key !== 'paper_id')
        .map(([key, value]) => `${key}=${String(value ?? '')}`)
        .join('\0'),
      'utf8',
    ),
  );
}

function findQuartileLedgerCandidates(evidenceRoot) {
  const candidates = [];
  const structuredExtensions = new Set(['.csv', '.json', '.jsonl', '.yaml', '.yml']);
  const keyPattern =
    /journal[_ -]?quartile|quartile[_ -]?(?:rank|status)|sjr[_ -]?quartile|jcr[_ -]?quartile/i;

  function walk(directory, depth) {
    if (depth > 4) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === '01_Source_PDFs') continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path, depth + 1);
      } else if (structuredExtensions.has(extname(entry.name).toLowerCase())) {
        const bytes = readFileSync(path);
        const preview = bytes.subarray(0, Math.min(bytes.length, 16_384)).toString('utf8');
        if (keyPattern.test(entry.name) || keyPattern.test(preview)) {
          candidates.push(relative(evidenceRoot, path));
        }
      }
    }
  }

  walk(evidenceRoot, 0);
  return candidates.sort();
}

function sourcePdfRecord(evidenceRoot, row) {
  const paperId = String(row.paper_id ?? '').trim();
  const sourcePath = String(row.source_pdf ?? '').trim();
  const activationEnergyRoot = dirname(evidenceRoot);
  const absolutePath = resolve(activationEnergyRoot, sourcePath);
  const stat = nonemptyFile(absolutePath, `source PDF ${paperId}`);
  return {
    paperId,
    path: relative(activationEnergyRoot, absolutePath),
    bytes: stat.size,
    sha256: sha256File(absolutePath),
    unitType: row.is_supplementary_pdf === 'yes' ? 'supplementary_pdf' : 'primary_pdf',
  };
}

function artifactCoverage(evidenceRoot, processingRows) {
  const activationEnergyRoot = dirname(evidenceRoot);
  const counts = {
    extractionNotes: 0,
    renderedPageDirectories: 0,
    contactSheets: 0,
    readyFindings: 0,
    qualityWarnings: 0,
  };
  for (const row of processingRows) {
    const paperId = String(row.paper_id).trim();
    nonemptyFile(
      resolve(activationEnergyRoot, String(row.note_file)),
      `extraction note ${paperId}`,
    );
    counts.extractionNotes += 1;
    nonemptyDirectory(
      resolve(activationEnergyRoot, String(row.render_dir)),
      `rendered pages ${paperId}`,
    );
    counts.renderedPageDirectories += 1;
    nonemptyFile(
      resolve(activationEnergyRoot, String(row.contact_sheet)),
      `contact sheet ${paperId}`,
    );
    counts.contactSheets += 1;
    nonemptyFile(
      resolve(evidenceRoot, `08_Ready_For_Methodology_Synthesis/paper_${paperId}_ready_findings.md`),
      `ready finding ${paperId}`,
    );
    counts.readyFindings += 1;
    nonemptyFile(
      resolve(evidenceRoot, `07_Quality_Checks/paper_${paperId}_quality_warnings.md`),
      `quality warning ${paperId}`,
    );
    counts.qualityWarnings += 1;
  }
  return counts;
}

export function buildCorpusIntegrityLedger({
  projectRoot = DEFAULT_PROJECT_ROOT,
  evidenceRoot = DEFAULT_EVIDENCE_ROOT,
} = {}) {
  const processingPath = resolve(evidenceRoot, PROCESSING_ORDER);
  const canonicalPath = resolve(evidenceRoot, CANONICAL_EVIDENCE);
  const matrixPath = resolve(evidenceRoot, METHOD_MATRIX);
  nonemptyFile(processingPath, 'paper processing order');
  nonemptyFile(canonicalPath, 'canonical evidence table');
  nonemptyFile(matrixPath, 'method evidence matrix');

  const processingRows = parseCsv(processingPath, 'paper processing order');
  const canonicalRows = parseCsv(canonicalPath, 'canonical evidence table');
  const matrixRows = parseCsv(matrixPath, 'method evidence matrix');
  const processingIds = exactPaperIdSet(processingRows, 'paper processing order');
  const canonicalIds = exactPaperIdSet(canonicalRows, 'canonical evidence table');
  const matrixIds = exactPaperIdSet(matrixRows, 'method evidence matrix', true);

  if (
    processingRows.length !== 231 ||
    processingIds.unique.length !== 231 ||
    processingIds.missing.length > 0 ||
    processingIds.unexpected.length > 0
  ) {
    fail('Paper processing order must contain exactly paper_id 001-231 once or more.');
  }
  if (
    canonicalIds.unique.length !== 231 ||
    canonicalIds.missing.length > 0 ||
    canonicalIds.unexpected.length > 0
  ) {
    fail('Canonical evidence table must cover exact paper_id 001-231.');
  }

  const sourcePdfs = processingRows.map((row) => sourcePdfRecord(evidenceRoot, row));
  const sourcePaths = new Set(sourcePdfs.map((item) => item.path));
  if (sourcePaths.size !== 231) fail('Paper processing order does not reference 231 unique PDF paths.');
  const primaryPdfs = sourcePdfs.filter((item) => item.unitType === 'primary_pdf');
  const supplementaryPdfs = sourcePdfs.filter((item) => item.unitType === 'supplementary_pdf');
  if (primaryPdfs.length !== 230 || supplementaryPdfs.length !== 1) {
    fail('Expected 230 primary PDF rows and one supplementary PDF row.');
  }
  if (supplementaryPdfs[0].paperId !== '009') {
    fail('Expected paper_id 009 to be the single supplementary PDF row.');
  }
  const relatedPrimary = primaryPdfs.find((item) => item.paperId === '008');
  if (
    !relatedPrimary ||
    !relatedPrimary.path.includes('1038_srep40535') ||
    !supplementaryPdfs[0].path.includes('1038_srep40535')
  ) {
    fail('Supplementary paper_id 009 is not linked to the paper_id 008 source family.');
  }
  const processingStatusCounts = processingRows.reduce((counts, row) => {
    const status = String(row.processing_status ?? '').trim() || 'blank';
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});

  const blankAssignments = [];
  for (const [index, row] of matrixRows.entries()) {
    if (String(row.paper_id ?? '').trim() !== '') continue;
    blankAssignments.push({
      csvDataRow: index + 1,
      methodName: row.method_name,
      samples: row.samples,
      assignedPaperId: inferBlankMethodPaperId(row),
      rowFingerprintSha256: correctionFingerprint(row),
      correctionType: 'derived_non_destructive_assignment',
    });
  }
  const correctionCounts = Object.fromEntries(
    ['011', '012', '013'].map((paperId) => [
      paperId,
      blankAssignments.filter((row) => row.assignedPaperId === paperId).length,
    ]),
  );
  if (
    blankAssignments.length !== 30 ||
    correctionCounts['011'] !== 10 ||
    correctionCounts['012'] !== 10 ||
    correctionCounts['013'] !== 10
  ) {
    fail(`Unexpected blank-ID correction topology: ${JSON.stringify(correctionCounts)}.`);
  }
  const correctedIds = [
    ...matrixIds.unique,
    ...blankAssignments.map((row) => row.assignedPaperId),
  ];
  const correctedUniqueIds = [...new Set(correctedIds)].sort();
  const correctedMissingIds = EXPECTED_PAPER_IDS.filter(
    (paperId) => !correctedUniqueIds.includes(paperId),
  );
  if (correctedUniqueIds.length !== 231 || correctedMissingIds.length > 0) {
    fail('Derived method-matrix assignments do not restore exact 001-231 coverage.');
  }

  const implementedRoutes = IMPLEMENTED_METHOD_ROUTES.map((route) => {
    const row = matrixRows.find(
      (candidate) =>
        candidate.paper_id === route.paperId &&
        candidate.method_name === route.matrixMethod,
    );
    if (!row || !String(row.implemented_or_citation_only).startsWith('implemented')) {
      fail(`Implemented route ${route.method} is missing or citation-only.`);
    }
    return {
      ...route,
      implementationClass: row.implemented_or_citation_only,
    };
  });

  const quartileLedgerCandidates = findQuartileLedgerCandidates(evidenceRoot);
  const totalPdfBytes = sourcePdfs.reduce((sum, item) => sum + item.bytes, 0);
  const corpusAggregateSha256 = sha256Bytes(
    Buffer.from(
      sourcePdfs
        .map((item) => `${item.paperId}\0${item.path}\0${item.bytes}\0${item.sha256}`)
        .join('\n'),
      'utf8',
    ),
  );

  return {
    schemaVersion: CORPUS_LEDGER_SCHEMA,
    sourceLocks: {
      processingOrder: {
        path: relative(projectRoot, processingPath),
        bytes: statSync(processingPath).size,
        sha256: sha256File(processingPath),
      },
      canonicalEvidence: {
        path: relative(projectRoot, canonicalPath),
        bytes: statSync(canonicalPath).size,
        sha256: sha256File(canonicalPath),
      },
      methodEvidenceMatrix: {
        path: relative(projectRoot, matrixPath),
        bytes: statSync(matrixPath).size,
        sha256: sha256File(matrixPath),
      },
    },
    corpusAccounting: {
      processingEntryCount: processingRows.length,
      exactPaperIdRange: '001-231',
      uniquePdfPathCount: sourcePaths.size,
      primaryPdfEntryCount: primaryPdfs.length,
      supplementaryPdfEntryCount: supplementaryPdfs.length,
      supplementaryEntries: supplementaryPdfs.map((item) => ({
        ...item,
        relatedPrimaryPaperId: '008',
      })),
      processingStatusCounts,
      totalPdfBytes,
      corpusAggregateSha256,
      sourcePdfs,
      accountingStatus: 'PASS_231_PDF_FILES_ACCOUNTED',
      unitBoundary:
        'The source lock proves 231 PDF files: 230 rows marked primary and one supplementary PDF (paper_id 009) belonging to the paper_id 008 DOI family. It does not prove 231 distinct research articles.',
    },
    extractionCoverage: {
      ...artifactCoverage(evidenceRoot, processingRows),
      status: 'PASS_231_OF_231_PROCESSING_IDS',
    },
    canonicalEvidenceCoverage: {
      rowCount: canonicalRows.length,
      uniquePaperIdCount: canonicalIds.unique.length,
      blankPaperIdRows: canonicalIds.blanks,
      missingPaperIds: canonicalIds.missing,
      status: 'PASS_EXACT_001_231',
    },
    methodMatrixCoverage: {
      sourceRowCount: matrixRows.length,
      sourceNonblankRowCount: matrixRows.length - matrixIds.blanks,
      sourceBlankPaperIdRows: matrixIds.blanks,
      sourceUniquePaperIdCount: matrixIds.unique.length,
      sourceMissingPaperIds: matrixIds.missing,
      sourceStatus: 'SOURCE_HAS_KNOWN_BLANK_ID_DEFECT',
      sourceMutation: 'none',
      derivedCorrection: {
        assignmentCount: blankAssignments.length,
        assignmentCountsByPaperId: correctionCounts,
        assignments: blankAssignments,
        correctedUniquePaperIdCount: correctedUniqueIds.length,
        correctedMissingPaperIds: correctedMissingIds,
        status: 'PASS_DERIVED_EXACT_001_231',
        boundary:
          'The raw method matrix remains immutable. These deterministic row-fingerprint assignments repair corpus accounting only; they do not create new paper evidence or change method classifications.',
      },
    },
    softwareMethodRoutes: {
      routes: implementedRoutes,
      status: 'PASS_FIVE_IMPLEMENTED_NON_CITATION_ROUTES',
      boundary:
        'Five implemented routes support the current software methods. This is a traceability sample over the corpus, not a claim that every corpus row was implemented.',
    },
    journalQuartileEvidence: {
      candidateLedgerPaths: quartileLedgerCandidates,
      verifiedPaperCount: 0,
      status: 'NOT_VERIFIED',
      boundary:
        'No authoritative per-paper journal-quartile ledger was found. Q1/Q2 status is user-supplied context and must not be presented as locally verified corpus metadata.',
    },
    overallBoundary:
      'Locally verified: 231 PDF files and complete 001-231 extraction accounting. Not locally verified: 231 distinct articles or Q1/Q2 status for every item.',
  };
}

export function serializeCorpusIntegrityLedger(ledger) {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}

function parseArgs(argv) {
  const result = { check: false, output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') result.check = true;
    else if (arg === '--output') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) fail('--output requires a path.');
      result.output = resolve(argv[index + 1]);
      index += 1;
    } else fail(`Unknown argument: ${arg}`);
  }
  return result;
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const ledger = buildCorpusIntegrityLedger();
  const bytes = serializeCorpusIntegrityLedger(ledger);
  if (args.check) {
    if (!existsSync(args.output)) fail(`Corpus integrity ledger is missing: ${args.output}`);
    if (readFileSync(args.output, 'utf8') !== bytes) {
      fail(`Corpus integrity ledger is stale: ${args.output}`);
    }
    console.log(
      `PASS CORPUS_INTEGRITY_LEDGER_CURRENT pdfs=${ledger.corpusAccounting.uniquePdfPathCount} primary=${ledger.corpusAccounting.primaryPdfEntryCount} supplementary=${ledger.corpusAccounting.supplementaryPdfEntryCount} canonicalIds=${ledger.canonicalEvidenceCoverage.uniquePaperIdCount} correctedMethodIds=${ledger.methodMatrixCoverage.derivedCorrection.correctedUniquePaperIdCount} quartiles=${ledger.journalQuartileEvidence.status}`,
    );
    return;
  }
  mkdirSync(dirname(args.output), { recursive: true });
  writeFileSync(args.output, bytes);
  console.log(
    `PASS CORPUS_INTEGRITY_LEDGER_GENERATED ${args.output} pdfs=${ledger.corpusAccounting.uniquePdfPathCount} primary=${ledger.corpusAccounting.primaryPdfEntryCount} supplementary=${ledger.corpusAccounting.supplementaryPdfEntryCount} canonicalIds=${ledger.canonicalEvidenceCoverage.uniquePaperIdCount} correctedMethodIds=${ledger.methodMatrixCoverage.derivedCorrection.correctedUniquePaperIdCount} quartiles=${ledger.journalQuartileEvidence.status}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runCli();
  } catch (error) {
    console.error(`FAIL CORPUS_INTEGRITY_LEDGER ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
