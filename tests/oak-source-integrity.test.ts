import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import manifest from './fixtures/real/oak/manifest.json';
import reference from './fixtures/real/oak/expected-output.json';

const FIXTURE_ROOT = path.resolve('tests/fixtures/real/oak');
const PROJECT_ROOT = path.resolve('.');

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

describe('Oak immutable source and provenance locks', () => {
  it('locks every fixture and supporting publication-audit artifact', () => {
    expect(manifest).toMatchObject({
      schema: 'activation-energy-studio/oak-fixture-manifest/v1',
      fixtureId: 'chilean-oak-mendeley-v2-alpha-005-085',
      classification: 'gold-candidate',
      sourceMetadata: {
        datasetDoi: '10.17632/gkhjh4v8tg.2',
        datasetVersion: 2,
        license: 'CC BY 4.0',
        articleDoi: '10.1016/j.indcrop.2025.121296',
        heatingRatesKPerMin: [5, 10, 20, 40],
      },
      validationContract: {
        publicationValuesAreOracle: false,
        methods: ['FWO', 'KAS', 'FRIEDMAN'],
      },
      platformStatus: {
        localMacOS: 'passed',
        hostedLinux: 'pending',
        hostedWindows: 'pending',
        parallelsRequired: false,
      },
    });

    for (const file of manifest.files) {
      const filePath = path.resolve(FIXTURE_ROOT, file.path);
      const bytes = readFileSync(filePath);
      expect(bytes.byteLength, file.path).toBe(file.bytes);
      expect(sha256(filePath), file.path).toBe(file.sha256);
    }
    for (const file of manifest.supportingEvidence) {
      const filePath = path.resolve(PROJECT_ROOT, file.path);
      expect(sha256(filePath), file.path).toBe(file.sha256);
    }

    const sourceHashes = Object.fromEntries(
      reference.source.audits.map(({ file, sha256: hash }) => [file, hash]),
    );
    for (const file of manifest.files.filter(({ role }) =>
      role.startsWith('immutable_official_raw_source_')
    )) {
      expect(file.sha256).toBe(sourceHashes[path.basename(file.path)]);
    }
    expect(readFileSync(path.resolve('.gitattributes'), 'utf8'))
      .toContain('tests/fixtures/real/oak/source/*.csv -text');
  });

  it('keeps the source and publication discrepancies explicitly quarantined', () => {
    expect(
      manifest.knownHumanProducedSourceIssues.map(({ code }) => code),
    ).toEqual(expect.arrayContaining([
      'AUTHOR_KELVIN_OFFSET_273_00',
      'INVERSE_TEMPERATURE_LABEL_FACTOR_1000',
      'NONMONOTONIC_ALPHA_MICRONOISE',
      'OAK_10_TRAILING_PARTIAL_ROW_4802',
      'N2_FLOW_METADATA_CONFLICT',
    ]));
    expect(manifest.publicationAdjudication.kas).toMatch(/quarantined/i);
    expect(manifest.publicationAdjudication.friedman).toMatch(/quarantined/i);
    expect(reference.scientificPolicy.publicationValuesAreOracle).toBe(false);
  });
});
