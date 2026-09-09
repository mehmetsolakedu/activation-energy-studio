#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
export const DEFAULT_EVIDENCE_ROOT = path.resolve(
  DEFAULT_PROJECT_ROOT,
  '../01_PDF_Evidence_Extraction',
);

export const METHOD_EVIDENCE = Object.freeze([
  {
    method: 'FWO',
    paperId: '056',
    matrixMethod: 'Flynn-Wall-Ozawa (FWO) method',
    visual: '07_Quality_Checks/paper_056_quality_crops/p05_fwo_cr_sce_eq6_9.png',
    note: '04_Paper_Extraction_Notes/paper_056_extraction_notes.md',
    readyFinding: '08_Ready_For_Methodology_Synthesis/paper_056_ready_findings.md',
  },
  {
    method: 'KAS',
    paperId: '002',
    matrixMethod: 'Kissinger-Akahira-Sunose (KAS)',
    visual: '02_Rendered_Pages/paper_002/page-06.png',
    note: '04_Paper_Extraction_Notes/paper_002_extraction_notes.md',
    readyFinding: '08_Ready_For_Methodology_Synthesis/paper_002_ready_findings.md',
  },
  {
    method: 'STARINK',
    paperId: '063',
    matrixMethod: 'Starink method',
    visual: '07_Quality_Checks/paper_063_quality_crops/paper_063_p04_evidence.png',
    note: '04_Paper_Extraction_Notes/paper_063_extraction_notes.md',
    readyFinding: '08_Ready_For_Methodology_Synthesis/paper_063_ready_findings.md',
  },
  {
    method: 'FRIEDMAN',
    paperId: '010',
    matrixMethod: 'Friedman method',
    visual: '02_Rendered_Pages/paper_010/page-05.png',
    note: '04_Paper_Extraction_Notes/paper_010_extraction_notes.md',
    readyFinding: '08_Ready_For_Methodology_Synthesis/paper_010_ready_findings.md',
  },
  {
    method: 'KISSINGER',
    paperId: '064',
    matrixMethod: 'Kissinger method',
    visual: '07_Quality_Checks/paper_064_quality_crops/paper_064_p02_evidence.png',
    note: '04_Paper_Extraction_Notes/paper_064_extraction_notes.md',
    readyFinding: '08_Ready_For_Methodology_Synthesis/paper_064_ready_findings.md',
    warning: '07_Quality_Checks/paper_064_quality_warnings.md',
  },
]);

function assertNonemptyFile(filePath, description) {
  if (!existsSync(filePath)) throw new Error(`Missing ${description}: ${filePath}`);
  const bytes = statSync(filePath).size;
  if (bytes <= 0) throw new Error(`Empty ${description}: ${filePath}`);
  return bytes;
}

function findImplementedMatrixRow(matrixText, descriptor) {
  const prefix = `${descriptor.paperId},${descriptor.matrixMethod},`;
  const row = matrixText.split(/\r?\n/).find((line) => line.startsWith(prefix));
  if (!row) {
    throw new Error(
      `Missing method-matrix row for ${descriptor.method} (${descriptor.paperId}).`,
    );
  }
  const leadingFields = row.split(',', 5);
  const implementationClass = leadingFields[3] ?? '';
  if (!implementationClass.startsWith('implemented')) {
    throw new Error(
      `${descriptor.method} row is not implemented evidence: ${implementationClass || 'missing'}.`,
    );
  }
  if (/citation_only|citation\/reference/.test(implementationClass)) {
    throw new Error(`${descriptor.method} row is citation-only evidence.`);
  }
  return implementationClass;
}

export function verifyScientificTraceability({
  projectRoot = DEFAULT_PROJECT_ROOT,
  evidenceRoot = DEFAULT_EVIDENCE_ROOT,
} = {}) {
  const matrixPath = path.resolve(
    evidenceRoot,
    '06_Method_Evidence_Matrix/method_evidence_matrix.csv',
  );
  const missionPath = path.resolve(projectRoot, '00_MISSION_LOCK.md');
  const specificationPath = path.resolve(projectRoot, '01_SCIENTIFIC_SPEC_V1.md');
  const criteriaPath = path.resolve(projectRoot, '02_ACCEPTANCE_CRITERIA.md');
  assertNonemptyFile(matrixPath, 'method evidence matrix');
  assertNonemptyFile(missionPath, 'mission lock');
  assertNonemptyFile(specificationPath, 'scientific specification');
  assertNonemptyFile(criteriaPath, 'acceptance criteria');
  const matrixText = readFileSync(matrixPath, 'utf8');
  const mission = readFileSync(missionPath, 'utf8');
  const specification = readFileSync(specificationPath, 'utf8');
  const criteria = readFileSync(criteriaPath, 'utf8');
  if (!matrixText.startsWith('paper_id,method_name,classification,implemented_or_citation_only,')) {
    throw new Error('Unexpected method evidence matrix header.');
  }

  const normativeDocuments = [
    {
      name: 'mission lock',
      text: mission,
      links: ['../ULTIMATE_GOAL.md', '01_SCIENTIFIC_SPEC_V1.md', '02_ACCEPTANCE_CRITERIA.md'],
    },
    {
      name: 'scientific specification',
      text: specification,
      links: ['../ULTIMATE_GOAL.md', '00_MISSION_LOCK.md', '02_ACCEPTANCE_CRITERIA.md'],
    },
    {
      name: 'acceptance criteria',
      text: criteria,
      links: ['../ULTIMATE_GOAL.md', '00_MISSION_LOCK.md', '01_SCIENTIFIC_SPEC_V1.md'],
    },
  ];
  for (const document of normativeDocuments) {
    for (const link of document.links) {
      if (!document.text.includes(`](${link})`)) {
        throw new Error(`${document.name} does not link ${link}.`);
      }
    }
  }

  const methods = METHOD_EVIDENCE.map((descriptor) => {
    const evidenceFiles = [
      descriptor.visual,
      descriptor.note,
      descriptor.readyFinding,
      ...(descriptor.warning ? [descriptor.warning] : []),
    ].map((relativePath) => ({
      path: relativePath,
      bytes: assertNonemptyFile(
        path.resolve(evidenceRoot, relativePath),
        `${descriptor.method} evidence`,
      ),
    }));
    const specificationLink = `../01_PDF_Evidence_Extraction/${descriptor.visual}`;
    if (!specification.includes(specificationLink)) {
      throw new Error(
        `Scientific specification does not link the ${descriptor.method} visual: ${specificationLink}`,
      );
    }
    return {
      method: descriptor.method,
      paperId: descriptor.paperId,
      implementationClass: findImplementedMatrixRow(matrixText, descriptor),
      specificationLink,
      evidenceFiles,
    };
  });

  return {
    status: 'PASS',
    normativeDocumentLinks: normativeDocuments.reduce(
      (count, document) => count + document.links.length,
      0,
    ),
    matrixPath: path.relative(projectRoot, matrixPath),
    methods,
    evidenceFileCount: methods.reduce(
      (count, method) => count + method.evidenceFiles.length,
      0,
    ),
  };
}

function runCli() {
  try {
    const result = verifyScientificTraceability();
    console.log(
      `PASS SCIENTIFIC_TRACEABILITY methods=${result.methods.length} evidenceFiles=${result.evidenceFileCount} normativeLinks=${result.normativeDocumentLinks}`,
    );
    for (const method of result.methods) {
      console.log(
        `PASS METHOD_TRACE method=${method.method} paper=${method.paperId} class=${method.implementationClass}`,
      );
    }
  } catch (error) {
    console.error(`FAIL SCIENTIFIC_TRACEABILITY ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
