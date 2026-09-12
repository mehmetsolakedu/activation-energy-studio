#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const LOCK_PATH_PROPERTY = 'activation-energy-studio:lock-path';
const DIRECT_PROPERTY =
  'activation-energy-studio:direct-production-dependency';

function fail(message) {
  throw new Error(`[verify-production-sbom] ${message}`);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function propertyValue(properties, name) {
  const matches = Array.isArray(properties)
    ? properties.filter((property) => property?.name === name)
    : [];
  if (matches.length !== 1 || typeof matches[0].value !== 'string') {
    fail(`Expected exactly one string property ${name}.`);
  }
  return matches[0].value;
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right, 'en'));
}

export function verifyProductionSbom({
  projectRoot,
  sbomPath = 'release/v0.4.0/SBOM.production.cdx.json',
}) {
  const resolvedRoot = path.resolve(projectRoot);
  const packageJsonPath = path.resolve(resolvedRoot, 'package.json');
  const packageLockPath = path.resolve(resolvedRoot, 'package-lock.json');
  const resolvedSbomPath = path.resolve(resolvedRoot, sbomPath);
  const packageJsonBytes = readFileSync(packageJsonPath);
  const packageLockBytes = readFileSync(packageLockPath);
  const packageJson = readJson(packageJsonPath, 'package.json');
  const packageLock = readJson(packageLockPath, 'package-lock.json');
  const sbom = readJson(resolvedSbomPath, 'production SBOM');

  if (sbom.bomFormat !== 'CycloneDX' || sbom.specVersion !== '1.6') {
    fail('SBOM must use CycloneDX 1.6.');
  }
  if (
    packageJson.version !== packageLock.version
    || packageJson.version !== packageLock.packages?.['']?.version
    || packageJson.version !== sbom.metadata?.component?.version
  ) {
    fail('Package, lockfile, and SBOM root versions do not match.');
  }
  if (sbom.metadata?.component?.name !== packageJson.name) {
    fail('SBOM root component name does not match package.json.');
  }

  const metadataProperties = sbom.metadata?.component?.properties;
  const lockSha = propertyValue(
    metadataProperties,
    'activation-energy-studio:package-lock-sha256',
  );
  const observedLockSha = sha256(packageLockBytes);
  if (lockSha !== observedLockSha) {
    fail(
      `SBOM package-lock SHA-256 mismatch: expected ${observedLockSha}, observed ${lockSha}`,
    );
  }
  if (
    propertyValue(
      metadataProperties,
      'activation-energy-studio:lockfile-root-version',
    ) !== packageLock.version
  ) {
    fail('SBOM lockfile root version property is stale.');
  }
  if (
    propertyValue(
      metadataProperties,
      'activation-energy-studio:npm-overrides',
    ) !== JSON.stringify(packageJson.overrides ?? {})
  ) {
    fail('SBOM npm-overrides property does not match package.json.');
  }

  const expectedPackages = new Map(
    Object.entries(packageLock.packages ?? {}).filter(
      ([lockPath, entry]) =>
        lockPath.startsWith('node_modules/') && entry?.dev !== true,
    ),
  );
  if (!Array.isArray(sbom.components)) {
    fail('SBOM components must be an array.');
  }
  const observedComponents = new Map();
  const directComponentRefs = [];
  for (const component of sbom.components) {
    const lockPath = propertyValue(component.properties, LOCK_PATH_PROPERTY);
    if (observedComponents.has(lockPath)) {
      fail(`Duplicate SBOM component lock path: ${lockPath}`);
    }
    const lockEntry = expectedPackages.get(lockPath);
    if (!lockEntry) fail(`Unexpected SBOM component lock path: ${lockPath}`);
    if (component.version !== lockEntry.version) {
      fail(`SBOM version mismatch for ${lockPath}.`);
    }
    if (typeof component['bom-ref'] !== 'string' || component['bom-ref'] === '') {
      fail(`Missing SBOM bom-ref for ${lockPath}.`);
    }
    if (typeof lockEntry.integrity === 'string' && lockEntry.integrity.startsWith('sha512-')) {
      const expectedIntegrity = Buffer.from(
        lockEntry.integrity.slice('sha512-'.length),
        'base64',
      ).toString('hex');
      const sha512 = (component.hashes ?? []).find(
        (entry) => entry?.alg === 'SHA-512',
      )?.content;
      if (sha512 !== expectedIntegrity) {
        fail(`SBOM SHA-512 integrity mismatch for ${lockPath}.`);
      }
    }
    if (propertyValue(component.properties, DIRECT_PROPERTY) === 'true') {
      directComponentRefs.push(component['bom-ref']);
    }
    observedComponents.set(lockPath, component);
  }
  const expectedPaths = sorted(expectedPackages.keys());
  const observedPaths = sorted(observedComponents.keys());
  if (JSON.stringify(expectedPaths) !== JSON.stringify(observedPaths)) {
    const observedSet = new Set(observedPaths);
    const expectedSet = new Set(expectedPaths);
    const missing = expectedPaths.filter((entry) => !observedSet.has(entry));
    const unexpected = observedPaths.filter((entry) => !expectedSet.has(entry));
    fail(
      `SBOM production component set mismatch; missing=${JSON.stringify(missing)}, unexpected=${JSON.stringify(unexpected)}`,
    );
  }

  const directDependencyNames = sorted(
    Object.keys(packageJson.dependencies ?? {}),
  );
  const directComponents = sbom.components.filter(
    (component) =>
      propertyValue(component.properties, DIRECT_PROPERTY) === 'true',
  );
  if (
    JSON.stringify(sorted(directComponents.map((component) => component.name)))
    !== JSON.stringify(directDependencyNames)
  ) {
    fail('SBOM direct-production component set does not match package.json.');
  }

  const rootRef = sbom.metadata.component['bom-ref'];
  const dependencyRows = Array.isArray(sbom.dependencies) ? sbom.dependencies : [];
  const dependencyRefs = dependencyRows.map((entry) => entry?.ref);
  const expectedRefs = [rootRef, ...sbom.components.map((component) => component['bom-ref'])];
  if (
    new Set(dependencyRefs).size !== dependencyRefs.length
    || JSON.stringify(sorted(dependencyRefs)) !== JSON.stringify(sorted(expectedRefs))
  ) {
    fail('SBOM dependency rows do not cover the root and component refs exactly once.');
  }
  const knownRefs = new Set(expectedRefs);
  for (const dependency of dependencyRows) {
    if (!Array.isArray(dependency.dependsOn)) {
      fail(`SBOM dependency row ${dependency.ref} lacks dependsOn.`);
    }
    for (const referenced of dependency.dependsOn) {
      if (!knownRefs.has(referenced)) {
        fail(`SBOM dependency row ${dependency.ref} references unknown ${referenced}.`);
      }
    }
  }
  const rootDependencyRow = dependencyRows.find((entry) => entry.ref === rootRef);
  if (
    JSON.stringify(sorted(rootDependencyRow?.dependsOn ?? []))
    !== JSON.stringify(sorted(directComponentRefs))
  ) {
    fail('SBOM root dependency edges do not match direct production dependencies.');
  }

  return {
    version: packageJson.version,
    componentCount: sbom.components.length,
    packageLockSha256: observedLockSha,
    packageJsonSha256: sha256(packageJsonBytes),
    sbomSha256: sha256(readFileSync(resolvedSbomPath)),
  };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const projectRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
    );
    const result = verifyProductionSbom({ projectRoot });
    process.stdout.write(
      `PASS PRODUCTION_SBOM_CURRENT v${result.version} components=${result.componentCount} lock=${result.packageLockSha256}\n`,
    );
  } catch (error) {
    process.stderr.write(`FAIL PRODUCTION_SBOM_INTEGRITY ${error.message}\n`);
    process.exitCode = 1;
  }
}
