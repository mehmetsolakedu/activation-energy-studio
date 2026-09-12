#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..', '..');
const releaseDirectory = path.join(projectRoot, 'release', 'v0.4.0');
const historicalHtml = path.join(
  projectRoot,
  'release',
  'v0.3.2',
  'Activation-Energy-Studio-v0.3.2.html',
);
const historicalHtmlSha256 =
  '4cf5d37b8a97f1cdf11beb866b56e0c5550e8f890534f41c9a4c673d8859b4a8';

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const auditRootArgument = argumentValue('--audit-root');
if (!auditRootArgument) throw new Error('Missing required --audit-root argument.');
const auditRoot = path.resolve(auditRootArgument);
const securityEvidenceDirectory = path.join(auditRoot, 'security_evidence');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(read(filePath));
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right, 'en'));
}

const checks = [];
function check(name, action) {
  action();
  checks.push({ name, status: 'PASS' });
}

const rootCitationPath = path.join(projectRoot, 'CITATION.cff');
const releaseCitationPath = path.join(releaseDirectory, 'CITATION.cff');
const rootCitation = read(rootCitationPath);
const releaseCitation = read(releaseCitationPath);

check('root and candidate CFF files are byte-identical', () => {
  assert.equal(rootCitation, releaseCitation);
});
check('CFF identifies Mehmet Solak as the sole author', () => {
  assert.equal((rootCitation.match(/^\s*authors:/gm) ?? []).length, 2);
  assert.equal((rootCitation.match(/^  - family-names: Solak$/gm) ?? []).length, 1);
  assert.equal((rootCitation.match(/^    - family-names: Solak$/gm) ?? []).length, 1);
  assert.equal((rootCitation.match(/given-names: Mehmet$/gm) ?? []).length, 2);
  assert.equal(
    (rootCitation.match(
      /affiliation: Biosystems Engineering, Siirt University, Siirt, T\u00fcrkiye$/gm,
    ) ?? []).length,
    2,
  );
  assert.doesNotMatch(rootCitation, /contributors/i);
  assert.doesNotMatch(rootCitation, /orcid/i);
});
check('CFF is an unreleased v0.4.0 candidate without a fabricated release date', () => {
  assert.match(rootCitation, /^version: 0\.4\.0$/m);
  assert.match(rootCitation, /^  version: 0\.4\.0$/m);
  assert.doesNotMatch(rootCitation, /^date-released:/m);
});

const rootLicense = read(path.join(projectRoot, 'LICENSE'));
const releaseLicense = read(path.join(releaseDirectory, 'LICENSE'));
check('project license attributes copyright to Mehmet Solak', () => {
  assert.equal(rootLicense, releaseLicense);
  assert.match(rootLicense, /^Copyright \(c\) 2026 Mehmet Solak$/m);
  assert.doesNotMatch(rootLicense, /Activation Energy Studio contributors/);
});

const packageLockPath = path.join(projectRoot, 'package-lock.json');
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageJsonBytes = fs.readFileSync(packageJsonPath);
const packageJson = JSON.parse(packageJsonBytes.toString('utf8'));
const packageLockBytes = fs.readFileSync(packageLockPath);
const packageLock = JSON.parse(packageLockBytes.toString('utf8'));
const expectedPaths = sorted(
  Object.entries(packageLock.packages)
    .filter(([lockPath, entry]) => lockPath.startsWith('node_modules/') && entry.dev !== true)
    .map(([lockPath]) => lockPath),
);
const inventoryPath = path.join(
  securityEvidenceDirectory,
  'production-dependency-inventory.v0.4.0.json',
);
const inventory = readJson(inventoryPath);
check('inventory matches the current package-lock production selection exactly', () => {
  assert.equal(packageJson.version, '0.4.0');
  assert.equal(packageLock.version, '0.4.0');
  assert.equal(packageLock.packages[''].version, '0.4.0');
  assert.equal(inventory.package_lock.sha256, sha256(packageLockBytes));
  assert.equal(inventory.package_json.sha256, sha256(packageJsonBytes));
  assert.deepEqual(
    sorted(inventory.dependencies.map((dependency) => dependency.lock_path)),
    expectedPaths,
  );
  assert.equal(inventory.counts.production_installations, expectedPaths.length);
  assert.equal(
    inventory.counts.direct,
    Object.keys(packageLock.packages[''].dependencies).length,
  );
});
check('DOMPurify advisory remediation is pinned in metadata', () => {
  assert.equal(packageJson.overrides?.dompurify, '3.4.15');
  assert.equal(inventory.package_json.npm_overrides?.dompurify, '3.4.15');
  const dompurify = inventory.dependencies.find(
    (dependency) => dependency.name === 'dompurify',
  );
  assert.ok(dompurify);
  assert.equal(dompurify.version, '3.4.15');
  assert.equal(dompurify.npm_override, '3.4.15');
});
const npmListResult = spawnSync('npm', ['ls', '--omit=dev', '--all', '--json'], {
  cwd: projectRoot,
  encoding: 'utf8',
  timeout: 60_000,
  maxBuffer: 20 * 1024 * 1024,
});
const npmList = JSON.parse(npmListResult.stdout || '{}');
check('installed production dependency tree is internally valid', () => {
  assert.equal(npmListResult.status, 0, npmListResult.stderr);
  assert.equal(npmList.problems, undefined);
  assert.equal(npmList.version, '0.4.0');
  assert.equal(npmList.dependencies.dompurify, undefined);
  assert.equal(npmList.dependencies.jspdf.dependencies.dompurify.version, '3.4.15');
});
check('every production dependency has license, repository, and copied license text', () => {
  assert.equal(inventory.counts.unresolved_metadata, 0);
  for (const dependency of inventory.dependencies) {
    assert.ok(dependency.license, `${dependency.name} license`);
    assert.ok(dependency.repository, `${dependency.name} repository`);
    assert.ok(dependency.license_files.length > 0, `${dependency.name} license files`);
    assert.deepEqual(dependency.unknowns, []);
    for (const licenseFile of dependency.license_files) {
      const source = path.join(projectRoot, licenseFile.source);
      const bundled = path.join(releaseDirectory, licenseFile.release_path);
      assert.equal(sha256(fs.readFileSync(source)), licenseFile.sha256);
      assert.equal(sha256(fs.readFileSync(bundled)), licenseFile.sha256);
    }
  }
});

const sbomPath = path.join(releaseDirectory, 'SBOM.production.cdx.json');
const sbom = readJson(sbomPath);
check('CycloneDX production SBOM covers the inventory exactly', () => {
  assert.equal(sbom.bomFormat, 'CycloneDX');
  assert.equal(sbom.specVersion, '1.6');
  assert.equal(sbom.metadata.component.version, '0.4.0');
  assert.equal(sbom.metadata.component.authors.length, 1);
  assert.equal(sbom.metadata.component.authors[0].name, 'Mehmet Solak');
  assert.equal(sbom.components.length, inventory.dependencies.length);
  assert.deepEqual(
    sorted(sbom.components.map((component) => `${component.name}@${component.version}`)),
    sorted(inventory.dependencies.map((dependency) => `${dependency.name}@${dependency.version}`)),
  );
  assert.equal(sbom.dependencies.length, sbom.components.length + 1);
});

const rootNotice = read(path.join(projectRoot, 'THIRD_PARTY_NOTICES.md'));
const releaseNotice = read(path.join(releaseDirectory, 'THIRD_PARTY_NOTICES.md'));
check('notices enumerate every production dependency with valid relative links', () => {
  assert.equal(
    rootNotice.replaceAll('release/v0.4.0/', ''),
    releaseNotice,
  );
  assert.match(rootNotice, /## Production JavaScript dependencies/);
  assert.match(rootNotice, /Unresolved dependency metadata\n\nNone/);
  for (const dependency of inventory.dependencies) {
    assert.ok(
      rootNotice.includes(`| ${dependency.name} | ${dependency.version} |`),
      `${dependency.name}@${dependency.version} notice row`,
    );
    for (const licenseFile of dependency.license_files) {
      assert.ok(rootNotice.includes(`release/v0.4.0/${licenseFile.release_path}`));
      assert.ok(releaseNotice.includes(licenseFile.release_path));
    }
  }
  assert.ok(rootNotice.includes('release/v0.4.0/SBOM.production.cdx.json'));
  assert.ok(releaseNotice.includes('(SBOM.production.cdx.json)'));
});

check('complete candidate package remains explicitly unreleased', () => {
  const entries = fs.readdirSync(releaseDirectory);
  assert.ok(entries.includes('README.md'));
  assert.ok(entries.includes('RELEASE_NOTES_v0.4.0.md'));
  assert.ok(entries.includes('Activation-Energy-Studio-v0.4.0.html'));
  assert.ok(entries.includes('MANIFEST.v0.4.0.json'));
  assert.ok(entries.includes('SHA256SUMS.v0.4.0.txt'));
  assert.match(
    read(path.join(releaseDirectory, 'README.md')),
    /complete, hash-bound \*\*audit candidate package\*\*/,
  );
  assert.match(
    read(path.join(releaseDirectory, 'README.md')),
    /not\nan externally published release/,
  );
  assert.match(
    read(path.join(releaseDirectory, 'RELEASE_NOTES_v0.4.0.md')),
    /not externally released/,
  );
  const manifest = readJson(
    path.join(releaseDirectory, 'MANIFEST.v0.4.0.json'),
  );
  assert.equal(manifest.release.status, 'UNRELEASED_AUDIT_CANDIDATE');
  assert.equal(manifest.release.externalPublicationApproved, false);
});

check('historical v0.3.2 HTML remains byte-identical to the immutable baseline', () => {
  assert.equal(sha256(fs.readFileSync(historicalHtml)), historicalHtmlSha256);
});

const postFixAuditPath = path.join(
  securityEvidenceDirectory,
  'npm-audit-production.after-dompurify-override.summary.json',
);
const closurePath = path.join(
  securityEvidenceDirectory,
  'dependency-advisory-closure.v0.4.0.json',
);
check('production advisory recheck and closure evidence pass', () => {
  const postFixAudit = readJson(postFixAuditPath);
  assert.equal(postFixAudit.status, 'PASS');
  assert.equal(postFixAudit.vulnerability_counts.total, 0);
  assert.equal(postFixAudit.npm_overrides.dompurify, '3.4.15');
  assert.equal(postFixAudit.evidence.package_lock_sha256, sha256(packageLockBytes));
  const closure = readJson(closurePath);
  assert.equal(closure.status, 'PASS');
  assert.equal(closure.remediation.npm_overrides.dompurify, '3.4.15');
  assert.ok(
    closure.remediation.closed_advisories.some(
      (advisory) =>
        advisory.advisory_url ===
        'https://github.com/advisories/GHSA-55q2-fjhq-7xh7',
    ),
  );
  assert.equal(closure.post_fix.vulnerability_counts.total, 0);
});

const record = {
  schema_version: 'activation-energy-studio/release-metadata-validation/1',
  target_release_version: '0.4.0',
  release_status: 'unreleased-audit-candidate',
  result: 'PASS',
  check_count: checks.length,
  checks,
  evidence_hashes: {
    package_lock_sha256: sha256(packageLockBytes),
    package_json_sha256: sha256(packageJsonBytes),
    npm_list_production_sha256: sha256(Buffer.from(npmListResult.stdout)),
    root_citation_sha256: sha256(fs.readFileSync(rootCitationPath)),
    release_citation_sha256: sha256(fs.readFileSync(releaseCitationPath)),
    production_inventory_sha256: sha256(fs.readFileSync(inventoryPath)),
    production_sbom_sha256: sha256(fs.readFileSync(sbomPath)),
    third_party_notices_sha256: sha256(Buffer.from(releaseNotice)),
    candidate_html_sha256: sha256(fs.readFileSync(path.join(
      releaseDirectory,
      'Activation-Energy-Studio-v0.4.0.html',
    ))),
    candidate_manifest_sha256: sha256(fs.readFileSync(path.join(
      releaseDirectory,
      'MANIFEST.v0.4.0.json',
    ))),
    candidate_checksum_index_sha256: sha256(fs.readFileSync(path.join(
      releaseDirectory,
      'SHA256SUMS.v0.4.0.txt',
    ))),
    historical_v0_3_2_html_sha256: sha256(fs.readFileSync(historicalHtml)),
  },
  boundaries: [
    'The v0.4.0 HTML, manifest, and checksum index form a complete local audit-candidate package; they have not been externally published.',
    'This validation is not release, deployment, journal, or Zenodo approval.',
    'Development-dependency licensing is outside this production-only inventory.',
  ],
};
fs.mkdirSync(securityEvidenceDirectory, { recursive: true });
const recordPath = path.join(
  securityEvidenceDirectory,
  'release-metadata-validation.v0.4.0.json',
);
fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

process.stdout.write(
  `${JSON.stringify(
    {
      result: record.result,
      checks: record.check_count,
      production_dependencies: inventory.dependencies.length,
      historical_v0_3_2_html_sha256:
        record.evidence_hashes.historical_v0_3_2_html_sha256,
      record_sha256: sha256(fs.readFileSync(recordPath)),
    },
    null,
    2,
  )}\n`,
);
