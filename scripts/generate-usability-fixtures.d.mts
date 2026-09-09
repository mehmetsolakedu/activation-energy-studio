export interface UsabilityFixtureEntry {
  id: string;
  path: string;
  bytes: number;
  sha256: string;
  expected: { kind: string; code?: string };
}

export interface UsabilityFixtureManifest {
  schemaVersion: string;
  studyVersion: string;
  generator: string;
  source: { path: string; bytes: number; sha256: string; experimental: boolean };
  release: { path: string; bytes: number; sha256: string };
  fixedContext: {
    projectName: string;
    process: string;
    sample: string;
    atmosphere: string;
    stageCelsius: number[];
  };
  fixtures: UsabilityFixtureEntry[];
  boundary: string;
}

export interface UsabilityFixtureBundle {
  files: Map<string, string>;
  manifest: UsabilityFixtureManifest;
}

export const UX_FIXTURE_SCHEMA: string;
export const UX_STUDY_VERSION: string;
export const UX_FIXTURE_MANIFEST_PATH: string;
export const UX_FIXTURE_DIRECTORY: string;
export function buildUsabilityFixtureBundle(projectRoot?: string): UsabilityFixtureBundle;
export function writeUsabilityFixtureBundle(projectRoot?: string): UsabilityFixtureBundle;
export function checkUsabilityFixtureBundle(projectRoot?: string): UsabilityFixtureBundle;
