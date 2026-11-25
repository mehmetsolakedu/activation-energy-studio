#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const FIXTURE_MANIFEST_SCHEMA =
  'activation-energy-studio/fixture-integrity-manifest/v1';
export const FIXTURE_MANIFEST_VERSION = '0.2.0';
export const FIXTURE_ROOT_RELATIVE_PATH = 'tests/fixtures';
export const FIXTURE_MANIFEST_RELATIVE_PATH =
  'evidence/validation/FIXTURE_MANIFEST.v0.2.0.json';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
export const DEFAULT_OUTPUT_PATH = path.resolve(
  DEFAULT_PROJECT_ROOT,
  FIXTURE_MANIFEST_RELATIVE_PATH,
);

function fail(message) {
  throw new Error(message);
}

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function toPortableProjectPath(projectRoot, absolutePath) {
  const relativePath = path.relative(projectRoot, absolutePath);
  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    fail(`Fixture path escapes the project root: ${absolutePath}`);
  }
  return relativePath.split(path.sep).join('/');
}

function collectFixtureFiles({
  projectRoot,
  fixtureRoot,
  manifestOutputPath,
}) {
  if (!existsSync(fixtureRoot)) {
    fail(`Fixture root is missing: ${fixtureRoot}`);
  }
  const rootStat = lstatSync(fixtureRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    fail(`Fixture root must be a real directory, not a symlink: ${fixtureRoot}`);
  }

  const manifestAbsolutePath = path.resolve(manifestOutputPath);
  const records = [];

  function walk(directory) {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      compareCodeUnits(left.name, right.name),
    );

    for (const entry of entries) {
      const absolutePath = path.resolve(directory, entry.name);
      if (absolutePath === manifestAbsolutePath) continue;

      const entryStat = lstatSync(absolutePath);
      if (entryStat.isSymbolicLink()) {
        fail(`Symlinks are not allowed under the fixture root: ${absolutePath}`);
      }
      if (entryStat.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entryStat.isFile()) {
        fail(`Only regular files are allowed under the fixture root: ${absolutePath}`);
      }

      const bytes = readFileSync(absolutePath);
      records.push({
        path: toPortableProjectPath(projectRoot, absolutePath),
        bytes: bytes.length,
        sha256: sha256(bytes),
      });
    }
  }

  walk(fixtureRoot);
  records.sort((left, right) => compareCodeUnits(left.path, right.path));
  return records;
}

export function buildFixtureManifest(
  projectRoot = DEFAULT_PROJECT_ROOT,
  { outputPath = path.resolve(projectRoot, FIXTURE_MANIFEST_RELATIVE_PATH) } = {},
) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const projectStat = existsSync(resolvedProjectRoot)
    ? statSync(resolvedProjectRoot)
    : undefined;
  if (!projectStat?.isDirectory()) {
    fail(`Project root is missing or not a directory: ${resolvedProjectRoot}`);
  }

  const fixtureRoot = path.resolve(
    resolvedProjectRoot,
    FIXTURE_ROOT_RELATIVE_PATH,
  );
  const fixtures = collectFixtureFiles({
    projectRoot: resolvedProjectRoot,
    fixtureRoot,
    manifestOutputPath: outputPath,
  });
  const totalBytes = fixtures.reduce((sum, fixture) => sum + fixture.bytes, 0);
  const fixtureSetSha256 = sha256(
    Buffer.from(
      fixtures
        .map(
          (fixture) =>
            `${fixture.path}\0${fixture.bytes}\0${fixture.sha256}`,
        )
        .join('\n'),
      'utf8',
    ),
  );

  return {
    schema: FIXTURE_MANIFEST_SCHEMA,
    version: FIXTURE_MANIFEST_VERSION,
    fixtureRoot: FIXTURE_ROOT_RELATIVE_PATH,
    hashAlgorithm: 'sha256',
    generation: {
      deterministic: true,
      generatedAtOmitted: true,
      recursive: true,
      pathFormat: 'project-relative-posix',
      manifestSelfExcluded: true,
      scopeBoundary:
        'Only regular files recursively contained by tests/fixtures are locked; node_modules, output, and release are outside this root.',
    },
    summary: {
      fixtureCount: fixtures.length,
      totalBytes,
      fixtureSetSha256,
    },
    fixtures,
  };
}

export function serializeFixtureManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function retainedFixtureMap(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { invalid: 'root must be a JSON object', map: new Map() };
  }
  if (!Array.isArray(manifest.fixtures)) {
    return { invalid: 'fixtures must be an array', map: new Map() };
  }

  const map = new Map();
  for (const fixture of manifest.fixtures) {
    if (
      !fixture ||
      typeof fixture !== 'object' ||
      typeof fixture.path !== 'string' ||
      !Number.isSafeInteger(fixture.bytes) ||
      fixture.bytes < 0 ||
      typeof fixture.sha256 !== 'string'
    ) {
      return { invalid: 'fixture entries must contain path, bytes, and sha256', map };
    }
    if (map.has(fixture.path)) {
      return { invalid: `duplicate fixture path ${fixture.path}`, map };
    }
    map.set(fixture.path, fixture);
  }
  return { invalid: undefined, map };
}

function staleReason(retained, expected) {
  const { invalid, map: retainedByPath } = retainedFixtureMap(retained);
  if (invalid) return `invalid retained manifest (${invalid})`;

  const expectedByPath = new Map(
    expected.fixtures.map((fixture) => [fixture.path, fixture]),
  );
  const untracked = expected.fixtures
    .filter((fixture) => !retainedByPath.has(fixture.path))
    .map((fixture) => fixture.path);
  const missing = [...retainedByPath.keys()]
    .filter((fixturePath) => !expectedByPath.has(fixturePath))
    .sort(compareCodeUnits);
  const changed = expected.fixtures
    .filter((fixture) => {
      const retainedFixture = retainedByPath.get(fixture.path);
      return (
        retainedFixture &&
        (retainedFixture.bytes !== fixture.bytes ||
          retainedFixture.sha256 !== fixture.sha256)
      );
    })
    .map((fixture) => fixture.path);

  const reasons = [];
  if (untracked.length > 0) {
    reasons.push(`untracked fixture(s): ${untracked.join(', ')}`);
  }
  if (missing.length > 0) {
    reasons.push(`missing fixture(s): ${missing.join(', ')}`);
  }
  if (changed.length > 0) {
    reasons.push(`changed fixture(s): ${changed.join(', ')}`);
  }
  if (reasons.length === 0) {
    reasons.push('manifest metadata or byte formatting differs');
  }
  return reasons.join('; ');
}

export function verifyFixtureManifest({
  projectRoot = DEFAULT_PROJECT_ROOT,
  outputPath = path.resolve(projectRoot, FIXTURE_MANIFEST_RELATIVE_PATH),
} = {}) {
  const resolvedOutputPath = path.resolve(outputPath);
  if (!existsSync(resolvedOutputPath)) {
    fail(`Fixture manifest is missing: ${resolvedOutputPath}`);
  }
  const outputStat = lstatSync(resolvedOutputPath);
  if (outputStat.isSymbolicLink() || !outputStat.isFile()) {
    fail(`Fixture manifest must be a regular file: ${resolvedOutputPath}`);
  }

  const retainedBytes = readFileSync(resolvedOutputPath, 'utf8');
  let retained;
  try {
    retained = JSON.parse(retainedBytes);
  } catch (error) {
    fail(
      `Fixture manifest is not valid JSON: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }

  const expected = buildFixtureManifest(projectRoot, {
    outputPath: resolvedOutputPath,
  });
  const expectedBytes = serializeFixtureManifest(expected);
  if (retainedBytes !== expectedBytes) {
    fail(
      `Fixture manifest is stale: ${staleReason(retained, expected)}. Regenerate ${resolvedOutputPath}.`,
    );
  }
  return expected;
}

function parseArgs(argv) {
  const parsed = {
    check: false,
    projectRoot: DEFAULT_PROJECT_ROOT,
    outputPath: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') {
      parsed.check = true;
    } else if (argument === '--project-root' || argument === '--output') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        fail(`${argument} requires a path.`);
      }
      if (argument === '--project-root') parsed.projectRoot = path.resolve(value);
      else parsed.outputPath = path.resolve(value);
      index += 1;
    } else {
      fail(`Unknown argument: ${argument}`);
    }
  }

  if (!parsed.outputPath) {
    parsed.outputPath = path.resolve(
      parsed.projectRoot,
      FIXTURE_MANIFEST_RELATIVE_PATH,
    );
  }
  return parsed;
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.check) {
    const manifest = verifyFixtureManifest({
      projectRoot: args.projectRoot,
      outputPath: args.outputPath,
    });
    console.log(
      `PASS FIXTURE_MANIFEST_CURRENT fixtures=${manifest.summary.fixtureCount} bytes=${manifest.summary.totalBytes} sha256=${manifest.summary.fixtureSetSha256}`,
    );
    return;
  }

  const manifest = buildFixtureManifest(args.projectRoot, {
    outputPath: args.outputPath,
  });
  mkdirSync(path.dirname(args.outputPath), { recursive: true });
  writeFileSync(args.outputPath, serializeFixtureManifest(manifest));
  console.log(
    `PASS FIXTURE_MANIFEST_GENERATED ${args.outputPath} fixtures=${manifest.summary.fixtureCount} bytes=${manifest.summary.totalBytes} sha256=${manifest.summary.fixtureSetSha256}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    runCli();
  } catch (error) {
    console.error(
      `FAIL FIXTURE_MANIFEST ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  }
}
