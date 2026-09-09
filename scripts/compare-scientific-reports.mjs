#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function canonicalizeScientificReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('Report must be a JSON object.');
  }
  if (report.schemaVersion !== 'activation-energy-studio/project-report/v4') {
    throw new Error(`Unsupported report schema: ${String(report.schemaVersion)}`);
  }
  const withoutVolatileTime = { ...report };
  delete withoutVolatileTime.generatedAt;
  return stableValue(withoutVolatileTime);
}

export function canonicalScientificJson(report) {
  return `${JSON.stringify(canonicalizeScientificReport(report), null, 2)}\n`;
}

export function scientificReportHash(report) {
  return createHash('sha256').update(canonicalScientificJson(report)).digest('hex');
}

export function firstDifference(left, right, path = '$') {
  if (Object.is(left, right)) return undefined;
  if (typeof left !== typeof right || left === null || right === null) {
    return { path, left, right };
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return { path, left, right };
    if (left.length !== right.length) {
      return { path: `${path}.length`, left: left.length, right: right.length };
    }
    for (let index = 0; index < left.length; index += 1) {
      const difference = firstDifference(left[index], right[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return undefined;
  }
  if (typeof left === 'object') {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    const keyDifference = firstDifference(leftKeys, rightKeys, `${path}.__keys`);
    if (keyDifference) return keyDifference;
    for (const key of leftKeys) {
      const difference = firstDifference(left[key], right[key], `${path}.${key}`);
      if (difference) return difference;
    }
    return undefined;
  }
  return { path, left, right };
}

function readReport(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function main(paths) {
  if (paths.length < 2) {
    throw new Error(
      'Usage: node scripts/compare-scientific-reports.mjs <report-a.json> <report-b.json> [report-c.json ...]',
    );
  }
  const reports = paths.map((path) => ({ path, report: canonicalizeScientificReport(readReport(path)) }));
  const hashes = reports.map(({ report }) => createHash('sha256').update(`${JSON.stringify(report, null, 2)}\n`).digest('hex'));
  reports.forEach(({ path }, index) => console.log(`${hashes[index]}  ${path}`));

  for (let index = 1; index < reports.length; index += 1) {
    const difference = firstDifference(reports[0].report, reports[index].report);
    if (difference) {
      console.error(`FAIL SCIENTIFIC_JSON_MISMATCH ${reports[0].path} <> ${reports[index].path}`);
      console.error(`First difference at ${difference.path}`);
      console.error(`left=${JSON.stringify(difference.left)} right=${JSON.stringify(difference.right)}`);
      process.exitCode = 1;
      return;
    }
  }
  console.log('PASS SCIENTIFIC_JSON_EQUAL (generatedAt excluded; no numeric tolerance applied)');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
