#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..', '..');
const targetVersion = '0.4.0';
const releaseDirectory = path.join(projectRoot, 'release', `v${targetVersion}`);

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const auditRootArgument = argumentValue('--audit-root');
if (!auditRootArgument) {
  throw new Error('Missing required --audit-root argument.');
}
const auditRoot = path.resolve(auditRootArgument);
const securityEvidenceDirectory = path.join(auditRoot, 'security_evidence');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function packageNameFromLockPath(lockPath) {
  const marker = 'node_modules/';
  const index = lockPath.lastIndexOf(marker);
  if (index < 0) {
    throw new Error(`Cannot derive package name from lock path: ${lockPath}`);
  }
  return lockPath.slice(index + marker.length);
}

function safeCoordinate(name, version) {
  return `${name.replace(/^@/, '').replaceAll('/', '__')}@${version}`;
}

function purlFor(name, version) {
  if (name.startsWith('@')) {
    const [scope, packageName] = name.slice(1).split('/');
    return `pkg:npm/%40${encodeURIComponent(scope)}/${encodeURIComponent(packageName)}@${encodeURIComponent(version)}`;
  }
  return `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}

function normalizeRepository(repository) {
  const raw = typeof repository === 'string' ? repository : repository?.url;
  if (!raw) return null;
  let value = raw.trim();
  if (value.startsWith('github:')) {
    value = `https://github.com/${value.slice('github:'.length)}`;
  }
  value = value
    .replace(/^git\+https:\/\//, 'https://')
    .replace(/^git:\/\//, 'https://')
    .replace(/^git\+ssh:\/\/git@github\.com\//, 'https://github.com/')
    .replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '');
  return value;
}

function declaredLicense(lockEntry, packageJson) {
  const value = packageJson?.license ?? lockEntry.license;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const expressions = value
      .map((item) => (typeof item === 'string' ? item : item?.type))
      .filter(Boolean);
    return expressions.length ? expressions.join(' OR ') : null;
  }
  if (value && typeof value.type === 'string') return value.type;
  return null;
}

function licenseFilesFor(packageDirectory, licenseDeclaration) {
  if (!fs.existsSync(packageDirectory)) return [];
  const filenames = fs
    .readdirSync(packageDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        /^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));
  const referencedFilename = licenseDeclaration?.match(
    /SEE LICEN[CS]E IN\s+([^\s)]+)/i,
  )?.[1];
  if (
    referencedFilename &&
    fs.existsSync(path.join(packageDirectory, referencedFilename)) &&
    !filenames.includes(referencedFilename)
  ) {
    filenames.push(referencedFilename);
  }
  return filenames.sort((left, right) => left.localeCompare(right, 'en'));
}

function cycloneDxLicense(licenseDeclaration) {
  const spdxIds = new Set(['Apache-2.0', 'ISC', 'MIT', 'MPL-2.0', 'Zlib']);
  if (spdxIds.has(licenseDeclaration)) {
    return { license: { id: licenseDeclaration } };
  }
  const tokens = licenseDeclaration
    .replaceAll('(', '')
    .replaceAll(')', '')
    .split(/\s+(?:AND|OR)\s+/);
  if (tokens.length > 1 && tokens.every((token) => spdxIds.has(token))) {
    return { expression: licenseDeclaration };
  }
  return { license: { name: licenseDeclaration } };
}

function integrityHash(integrity) {
  if (typeof integrity !== 'string') return null;
  const match = integrity.match(/^sha512-([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  return Buffer.from(match[1], 'base64').toString('hex');
}

function escapeMarkdown(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function relativeMarkdownLink(fromDirectory, absolutePath, label) {
  const relativePath = path.relative(fromDirectory, absolutePath).split(path.sep).join('/');
  return `[${label}](${relativePath})`;
}

function dependencyTarget(lockPackages, fromPath, dependencyName) {
  let cursor = fromPath;
  while (true) {
    const candidate = path.posix.join(cursor, 'node_modules', dependencyName);
    if (lockPackages[candidate]) return candidate;
    if (!cursor || cursor === '.') break;
    const parent = path.posix.dirname(cursor);
    cursor = parent === cursor ? '' : parent;
  }
  const rootCandidate = path.posix.join('node_modules', dependencyName);
  return lockPackages[rootCandidate] ? rootCandidate : null;
}

const packageLockPath = path.join(projectRoot, 'package-lock.json');
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageJsonBytes = fs.readFileSync(packageJsonPath);
const rootPackageJson = JSON.parse(packageJsonBytes.toString('utf8'));
const packageLockBytes = fs.readFileSync(packageLockPath);
const packageLock = JSON.parse(packageLockBytes.toString('utf8'));
const rootLockEntry = packageLock.packages?.[''];
if (!rootLockEntry?.dependencies) {
  throw new Error('package-lock.json does not contain a root dependency map.');
}

const productionLockEntries = Object.entries(packageLock.packages)
  .filter(([lockPath, entry]) => lockPath.startsWith('node_modules/') && entry.dev !== true)
  .sort(([left], [right]) => left.localeCompare(right, 'en'));

fs.mkdirSync(releaseDirectory, { recursive: true });
fs.mkdirSync(securityEvidenceDirectory, { recursive: true });
const licensesDirectory = path.join(releaseDirectory, 'licenses');
fs.rmSync(licensesDirectory, { recursive: true, force: true });
fs.mkdirSync(licensesDirectory, { recursive: true });

const inventory = productionLockEntries.map(([lockPath, lockEntry]) => {
  const name = packageNameFromLockPath(lockPath);
  const version = lockEntry.version;
  if (typeof version !== 'string' || !version) {
    throw new Error(`Missing version for ${lockPath}.`);
  }
  const installedDirectory = path.join(projectRoot, ...lockPath.split('/'));
  const installedPackageJsonPath = path.join(installedDirectory, 'package.json');
  const packageJson = fs.existsSync(installedPackageJsonPath)
    ? readJson(installedPackageJsonPath)
    : null;
  const repository = normalizeRepository(packageJson?.repository);
  const license = declaredLicense(lockEntry, packageJson);
  const coordinateDirectory = path.join(
    licensesDirectory,
    safeCoordinate(name, version),
  );
  const copiedLicenses = [];
  const installedLicenseFiles = licenseFilesFor(installedDirectory, license);
  const curatedLicenseDirectory = path.join(
    projectRoot,
    'third_party_license_fallbacks',
    safeCoordinate(name, version),
  );
  const licenseSourceDirectory = installedLicenseFiles.length
    ? installedDirectory
    : curatedLicenseDirectory;
  const licenseSourceFiles = installedLicenseFiles.length
    ? installedLicenseFiles
    : licenseFilesFor(curatedLicenseDirectory, license);

  for (const licenseFile of licenseSourceFiles) {
    fs.mkdirSync(coordinateDirectory, { recursive: true });
    const source = path.join(licenseSourceDirectory, licenseFile);
    const target = path.join(coordinateDirectory, licenseFile);
    const bytes = fs.readFileSync(source);
    fs.writeFileSync(target, bytes);
    copiedLicenses.push({
      source: path.relative(projectRoot, source).split(path.sep).join('/'),
      source_kind: installedLicenseFiles.length ? 'upstream-package' : 'curated-fallback',
      release_path: path.relative(releaseDirectory, target).split(path.sep).join('/'),
      sha256: sha256(bytes),
    });
  }

  const direct =
    Object.hasOwn(rootLockEntry.dependencies, name) &&
    lockPath === path.posix.join('node_modules', name);
  const dependencyNames = [
    ...Object.keys(lockEntry.dependencies ?? {}),
    ...Object.keys(lockEntry.optionalDependencies ?? {}),
  ];
  const dependencyPaths = [...new Set(dependencyNames)]
    .map((dependencyName) => dependencyTarget(packageLock.packages, lockPath, dependencyName))
    .filter((dependencyPath) => dependencyPath && packageLock.packages[dependencyPath]?.dev !== true)
    .sort((left, right) => left.localeCompare(right, 'en'));

  const unknowns = [];
  if (!packageJson) unknowns.push('installed package.json unavailable');
  if (!license) unknowns.push('declared license unavailable');
  if (!repository) unknowns.push('repository unavailable');
  if (!copiedLicenses.length) unknowns.push('shipped license text unavailable');

  return {
    name,
    version,
    lock_path: lockPath,
    direct,
    optional: lockEntry.optional === true,
    npm_override: rootPackageJson.overrides?.[name] ?? null,
    license,
    repository,
    resolved: lockEntry.resolved ?? null,
    integrity: lockEntry.integrity ?? null,
    license_files: copiedLicenses,
    dependency_paths: dependencyPaths,
    unknowns,
  };
});

const componentByPath = new Map(
  inventory.map((item) => [item.lock_path, purlFor(item.name, item.version)]),
);
const rootBomReference = `pkg:npm/activation-energy-studio@${targetVersion}`;
const directComponents = inventory.filter((item) => item.direct);
const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  version: 1,
  metadata: {
    component: {
      type: 'application',
      'bom-ref': rootBomReference,
      name: 'activation-energy-studio',
      version: targetVersion,
      authors: [{ name: 'Mehmet Solak' }],
      licenses: [{ license: { id: 'MIT' } }],
      properties: [
        { name: 'activation-energy-studio:release-status', value: 'unreleased-audit-candidate' },
        { name: 'activation-energy-studio:lockfile-root-version', value: rootLockEntry.version },
        { name: 'activation-energy-studio:package-lock-sha256', value: sha256(packageLockBytes) },
        {
          name: 'activation-energy-studio:npm-overrides',
          value: JSON.stringify(rootPackageJson.overrides ?? {}),
        },
      ],
    },
  },
  components: inventory.map((item) => {
    const component = {
      type: 'library',
      'bom-ref': componentByPath.get(item.lock_path),
      name: item.name,
      version: item.version,
      purl: purlFor(item.name, item.version),
      scope: item.optional ? 'optional' : 'required',
      properties: [
        { name: 'activation-energy-studio:lock-path', value: item.lock_path },
        { name: 'activation-energy-studio:direct-production-dependency', value: String(item.direct) },
        ...(item.npm_override
          ? [{ name: 'activation-energy-studio:npm-override', value: item.npm_override }]
          : []),
      ],
    };
    if (item.license) component.licenses = [cycloneDxLicense(item.license)];
    const integrity = integrityHash(item.integrity);
    if (integrity) component.hashes = [{ alg: 'SHA-512', content: integrity }];
    const externalReferences = [];
    if (item.repository) externalReferences.push({ type: 'vcs', url: item.repository });
    if (item.resolved) externalReferences.push({ type: 'distribution', url: item.resolved });
    if (externalReferences.length) component.externalReferences = externalReferences;
    return component;
  }),
  dependencies: [
    {
      ref: rootBomReference,
      dependsOn: directComponents.map((item) => componentByPath.get(item.lock_path)).sort(),
    },
    ...inventory.map((item) => ({
      ref: componentByPath.get(item.lock_path),
      dependsOn: item.dependency_paths
        .map((dependencyPath) => componentByPath.get(dependencyPath))
        .filter(Boolean)
        .sort(),
    })),
  ],
};

const sbomPath = path.join(releaseDirectory, 'SBOM.production.cdx.json');
writeJson(sbomPath, sbom);

const rootNoticePath = path.join(projectRoot, 'THIRD_PARTY_NOTICES.md');
const rootNotice = fs.readFileSync(rootNoticePath, 'utf8');
const dependencyMarker = /\n## (?:JavaScript dependencies|Production JavaScript dependencies)\n/;
const markerMatch = dependencyMarker.exec(rootNotice);
if (!markerMatch) {
  throw new Error('Could not locate the dependency section in THIRD_PARTY_NOTICES.md.');
}
const datasetNotice = rootNotice.slice(0, markerMatch.index).trimEnd();
const unknownInventory = inventory.filter((item) => item.unknowns.length);
function dependencyRowsFor(fromDirectory) {
  return inventory
    .map((item) => {
    const repository = item.repository
      ? `<${escapeMarkdown(item.repository)}>`
      : '**UNKNOWN**';
    const licensePointers = item.license_files.length
      ? item.license_files
          .map((entry) =>
            relativeMarkdownLink(
              fromDirectory,
              path.join(releaseDirectory, entry.release_path),
              path.basename(entry.release_path),
            ),
          )
          .join('<br>')
      : '**UNKNOWN**';
    return `| ${escapeMarkdown(item.name)} | ${escapeMarkdown(item.version)} | ${item.direct ? 'direct' : 'transitive'}${item.optional ? ', optional' : ''}${item.npm_override ? `, npm override ${escapeMarkdown(item.npm_override)}` : ''} | ${escapeMarkdown(item.license ?? 'UNKNOWN')} | ${repository} | ${licensePointers} |`;
    })
    .join('\n');
}

const unknownSection = unknownInventory.length
  ? `\n### Unresolved dependency metadata\n\n${unknownInventory
      .map(
        (item) =>
          `- \`${item.name}@${item.version}\`: ${item.unknowns.join('; ')}.`,
      )
      .join('\n')}\n`
  : '\n### Unresolved dependency metadata\n\nNone in the locked production dependency set.\n';

function dependencyNoticeFor(fromDirectory) {
  const sbomLink = relativeMarkdownLink(
    fromDirectory,
    sbomPath,
    'SBOM.production.cdx.json',
  );
  return `${datasetNotice}

## Production JavaScript dependencies

The following table is generated from the production closure in
\`package-lock.json\`. It covers ${inventory.length} locked production package
installations (${directComponents.length} direct and
${inventory.length - directComponents.length} transitive). Development-only
packages are intentionally excluded. The accompanying CycloneDX record is
${sbomLink}.

| Package | Version | Relationship | Declared license | Repository | Bundled license text |
| --- | --- | --- | --- | --- | --- |
${dependencyRowsFor(fromDirectory)}
${unknownSection}
The bundled license texts are copied byte-for-byte from the installed packages
that correspond to the lockfile snapshot. Their hashes and source paths are
recorded in the audit inventory. Package copyright and license terms remain
with their respective authors and rightsholders.

No dataset, article, dependency author, or rightsholder endorses Activation
Energy Studio.
`;
}

fs.writeFileSync(rootNoticePath, dependencyNoticeFor(projectRoot), 'utf8');
fs.writeFileSync(
  path.join(releaseDirectory, 'THIRD_PARTY_NOTICES.md'),
  dependencyNoticeFor(releaseDirectory),
  'utf8',
);

const inventoryRecord = {
  schema_version: 'activation-energy-studio/production-dependency-inventory/1',
  target_release_version: targetVersion,
  release_status: 'unreleased-audit-candidate',
  package_lock: {
    path: path.relative(projectRoot, packageLockPath).split(path.sep).join('/'),
    root_version: rootLockEntry.version,
    sha256: sha256(packageLockBytes),
    lockfile_version: packageLock.lockfileVersion,
  },
  package_json: {
    path: 'package.json',
    version: rootPackageJson.version,
    sha256: sha256(packageJsonBytes),
    npm_overrides: rootPackageJson.overrides ?? {},
  },
  selection_rule:
    'All package-lock.json packages entries below node_modules/ whose dev flag is not true.',
  counts: {
    production_installations: inventory.length,
    direct: directComponents.length,
    transitive: inventory.length - directComponents.length,
    optional: inventory.filter((item) => item.optional).length,
    unresolved_metadata: unknownInventory.length,
  },
  dependencies: inventory,
  generated_artifacts: {
    sbom: path.relative(projectRoot, sbomPath).split(path.sep).join('/'),
    notices: 'release/v0.4.0/THIRD_PARTY_NOTICES.md',
    license_directory: 'release/v0.4.0/licenses',
  },
};
const inventoryRecordPath = path.join(
  securityEvidenceDirectory,
  'production-dependency-inventory.v0.4.0.json',
);
writeJson(inventoryRecordPath, inventoryRecord);

const reportLines = [
  '# Production dependency and license audit: v0.4.0 candidate',
  '',
  '- Scope: lockfile-defined production package installations only.',
  `- Package-lock SHA-256: \`${inventoryRecord.package_lock.sha256}\`.`,
  `- Direct production dependencies: ${inventoryRecord.counts.direct}.`,
  `- Transitive production dependencies: ${inventoryRecord.counts.transitive}.`,
  `- Optional production installations: ${inventoryRecord.counts.optional}.`,
  `- Dependency coordinates with unresolved metadata: ${inventoryRecord.counts.unresolved_metadata}.`,
  `- npm overrides: ${Object.keys(inventoryRecord.package_json.npm_overrides).length ? Object.entries(inventoryRecord.package_json.npm_overrides).map(([name, version]) => `\`${name}=${version}\``).join(', ') : 'none'}.`,
  '- Development dependencies are outside this production-license inventory and remain auditable from the lockfile.',
  '- This is metadata evidence for an unreleased candidate; it is not release approval.',
  '',
  '## Completeness checks',
  '',
  ...inventory.map(
    (item) =>
      `- ${item.unknowns.length ? 'FAIL' : 'PASS'} \`${item.name}@${item.version}\`: license=${item.license ?? 'UNKNOWN'}; repository=${item.repository ?? 'UNKNOWN'}; license texts=${item.license_files.length}.`,
  ),
];
const licenseReportPath = path.join(
  securityEvidenceDirectory,
  'license-compliance-report.v0.4.0.md',
);
fs.writeFileSync(licenseReportPath, `${reportLines.join('\n')}\n`, 'utf8');

const output = {
  package_lock_sha256: inventoryRecord.package_lock.sha256,
  production_installations: inventory.length,
  direct: directComponents.length,
  transitive: inventory.length - directComponents.length,
  unresolved_metadata: unknownInventory.length,
  sbom_sha256: sha256(fs.readFileSync(sbomPath)),
  notices_sha256: sha256(fs.readFileSync(path.join(releaseDirectory, 'THIRD_PARTY_NOTICES.md'))),
  inventory_sha256: sha256(fs.readFileSync(inventoryRecordPath)),
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
