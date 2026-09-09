#!/usr/bin/env node

import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..', '..');

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const auditRootArgument = argumentValue('--audit-root');
if (!auditRootArgument) throw new Error('Missing required --audit-root argument.');
const label = argumentValue('--label') ?? 'snapshot';
if (!/^[a-z0-9][a-z0-9-]*$/.test(label)) {
  throw new Error('Audit label must contain only lowercase letters, digits, and hyphens.');
}
const baselineAuditArgument = argumentValue('--baseline-audit');
const auditRoot = path.resolve(auditRootArgument);
const evidenceDirectory = path.join(auditRoot, 'security_evidence');
const cacheDirectory = path.join(auditRoot, 'work', 'npm-audit-cache');
fs.mkdirSync(evidenceDirectory, { recursive: true });
fs.mkdirSync(cacheDirectory, { recursive: true });

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
  cwd: projectRoot,
  encoding: 'utf8',
  timeout: 120_000,
  env: { ...process.env, npm_config_cache: cacheDirectory },
  maxBuffer: 20 * 1024 * 1024,
});

const rawOutput = result.stdout || '';
const rawPath = path.join(evidenceDirectory, `npm-audit-production.${label}.raw.json`);
fs.writeFileSync(rawPath, rawOutput || '{}\n', 'utf8');

let parsed = null;
let parseError = null;
try {
  parsed = JSON.parse(rawOutput);
} catch (error) {
  parseError = error instanceof Error ? error.message : String(error);
}

const vulnerabilities = parsed?.metadata?.vulnerabilities ?? null;
const total = vulnerabilities?.total;
let status = 'UNRESOLVED';
if (typeof total === 'number') status = total === 0 ? 'PASS' : 'FAIL';

const record = {
  schema_version: 'activation-energy-studio/npm-production-audit/1',
  target_release_version: '0.4.0',
  release_status: 'unreleased-audit-candidate',
  command: ['npm', 'audit', '--omit=dev', '--json'],
  label,
  selection: 'production dependencies only; development dependencies omitted',
  status,
  process: {
    exit_code: result.status,
    signal: result.signal,
    timed_out: result.error?.code === 'ETIMEDOUT',
    error: result.error?.message ?? null,
    stderr: result.stderr?.trim() || null,
    parse_error: parseError,
  },
  vulnerability_counts: vulnerabilities,
  dependency_counts: parsed?.metadata?.dependencies ?? null,
  advisories: parsed?.vulnerabilities ?? null,
  evidence: {
    package_json_sha256: sha256(fs.readFileSync(path.join(projectRoot, 'package.json'))),
    package_lock_sha256: sha256(fs.readFileSync(path.join(projectRoot, 'package-lock.json'))),
    raw_output_path: path.relative(auditRoot, rawPath).split(path.sep).join('/'),
    raw_output_sha256: sha256(fs.readFileSync(rawPath)),
  },
  boundary:
    'This registry audit is a time-bounded dependency advisory check, not a proof that the application is vulnerability-free.',
};

const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
record.npm_overrides = packageJson.overrides ?? {};
const recordPath = path.join(
  evidenceDirectory,
  `npm-audit-production.${label}.summary.json`,
);
fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

const advisoryRows = parsed?.vulnerabilities
  ? Object.values(parsed.vulnerabilities).flatMap((vulnerability) =>
      (vulnerability.via ?? [])
        .filter((via) => typeof via === 'object')
        .map(
          (via) =>
            `| ${vulnerability.name} | ${vulnerability.severity} | ${via.title} | ${via.range} | ${vulnerability.fixAvailable ? 'yes' : 'no'} | <${via.url}> |`,
        ),
    )
  : [];
const report = `# Production dependency advisory audit: v0.4.0 candidate

- Command: \`npm audit --omit=dev --json\`.
- Scope: production dependencies; development dependencies omitted.
- Result: **${status}**.
- Process exit code: ${result.status ?? 'unavailable'}.
- Vulnerability counts: ${vulnerabilities ? `critical=${vulnerabilities.critical}, high=${vulnerabilities.high}, moderate=${vulnerabilities.moderate}, low=${vulnerabilities.low}, total=${vulnerabilities.total}` : 'unavailable'}.
- Package-lock SHA-256: \`${record.evidence.package_lock_sha256}\`.
- npm overrides: ${Object.keys(record.npm_overrides).length ? Object.entries(record.npm_overrides).map(([name, version]) => `\`${name}=${version}\``).join(', ') : 'none'}.

## Advisories

${advisoryRows.length ? `| Package | Severity | Advisory | Affected range | Fix available | Source |\n| --- | --- | --- | --- | --- | --- |\n${advisoryRows.join('\n')}` : status === 'PASS' ? 'No production advisory was reported in this registry snapshot.' : 'The registry result could not be parsed; see the raw evidence and process fields.'}

## Gate interpretation

${status === 'PASS' ? 'The time-bounded production dependency advisory gate passed for this lockfile snapshot.' : status === 'FAIL' ? 'The production dependency advisory gate failed. Remediation and a fresh audit record are required before release approval.' : 'The production dependency advisory gate is unresolved and must be rerun successfully before release approval.'}

This registry check is time-bounded and does not prove that the application is
free of vulnerabilities. The raw registry response is retained byte-for-byte
in \`npm-audit-production.raw.json\`.
`;
const reportPath = path.join(
  evidenceDirectory,
  `production-dependency-security-report.${label}.v0.4.0.md`,
);
fs.writeFileSync(reportPath, report, 'utf8');

let closure = null;
if (baselineAuditArgument) {
  const baselinePath = path.resolve(auditRoot, baselineAuditArgument);
  const baselineBytes = fs.readFileSync(baselinePath);
  const baseline = JSON.parse(baselineBytes.toString('utf8'));
  const baselineCounts = baseline?.metadata?.vulnerabilities ?? null;
  const baselineAdvisories = Object.values(baseline?.vulnerabilities ?? {}).flatMap(
    (vulnerability) =>
      (vulnerability.via ?? [])
        .filter((via) => typeof via === 'object')
        .map((via) => ({
          package: vulnerability.name,
          severity: vulnerability.severity,
          title: via.title,
          advisory_url: via.url,
          affected_range: via.range,
          fix_available: vulnerability.fixAvailable,
        })),
  );
  const remainingUrls = new Set(
    Object.values(parsed?.vulnerabilities ?? {}).flatMap((vulnerability) =>
      (vulnerability.via ?? [])
        .filter((via) => typeof via === 'object')
        .map((via) => via.url),
    ),
  );
  const closedAdvisories = baselineAdvisories.filter(
    (advisory) => !remainingUrls.has(advisory.advisory_url),
  );
  closure = {
    schema_version: 'activation-energy-studio/dependency-advisory-closure/1',
    target_release_version: '0.4.0',
    release_status: 'unreleased-audit-candidate',
    status:
      baselineCounts?.total > 0 && total === 0 && closedAdvisories.length
        ? 'PASS'
        : 'UNRESOLVED',
    baseline: {
      path: path.relative(auditRoot, baselinePath).split(path.sep).join('/'),
      sha256: sha256(baselineBytes),
      vulnerability_counts: baselineCounts,
    },
    remediation: {
      npm_overrides: record.npm_overrides,
      package_json_sha256: record.evidence.package_json_sha256,
      package_lock_sha256: record.evidence.package_lock_sha256,
      closed_advisories: closedAdvisories,
    },
    post_fix: {
      path: path.relative(auditRoot, rawPath).split(path.sep).join('/'),
      sha256: record.evidence.raw_output_sha256,
      vulnerability_counts: vulnerabilities,
    },
    boundary:
      'Closure means the cited registry advisory is absent from this lockfile snapshot; it is not a timeless vulnerability-free claim.',
  };
  const closurePath = path.join(
    evidenceDirectory,
    'dependency-advisory-closure.v0.4.0.json',
  );
  fs.writeFileSync(closurePath, `${JSON.stringify(closure, null, 2)}\n`, 'utf8');
}
process.stdout.write(
  `${JSON.stringify(
    {
      status,
      exit_code: result.status,
      vulnerability_counts: vulnerabilities,
      raw_output_sha256: record.evidence.raw_output_sha256,
      summary_sha256: sha256(fs.readFileSync(recordPath)),
      report_sha256: sha256(fs.readFileSync(reportPath)),
      advisory_closure: closure?.status ?? null,
    },
    null,
    2,
  )}\n`,
);
