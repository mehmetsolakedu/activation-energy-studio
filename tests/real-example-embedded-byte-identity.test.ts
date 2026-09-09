import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  REAL_EXAMPLES,
  createRealExampleSession,
  type RealExampleId,
} from '../src/examples/catalog';

interface ExpectedFileIdentity {
  readonly name: string;
  readonly sourcePath: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly bom: boolean;
  readonly newline: 'CRLF' | 'LF';
  readonly lineBreaks: number;
}

interface ExpectedSessionIdentity {
  readonly id: RealExampleId;
  readonly files: readonly ExpectedFileIdentity[];
}

const EXPECTED_SESSIONS = [
  {
    id: 'chilean-oak-raw',
    files: [
      {
        name: 'TGA-Oak-5Kmin-1.csv',
        sourcePath: 'tests/fixtures/real/oak/source/TGA-Oak-5Kmin-1.csv',
        bytes: 531_531,
        sha256: 'cdefb2f643e26562400d6313ed5bc2cfe02a500e36242651c42cdcccbd014608',
        bom: true,
        newline: 'CRLF',
        lineBreaks: 7_202,
      },
      {
        name: 'TGA-Oak-10Kmin-1.csv',
        sourcePath: 'tests/fixtures/real/oak/source/TGA-Oak-10Kmin-1.csv',
        bytes: 309_500,
        sha256: 'ddf80f5e2252d77732207768be7c245a6e319349216d32eda7c208b6f6aed9a9',
        bom: true,
        newline: 'CRLF',
        lineBreaks: 7_169,
      },
      {
        name: 'TGA-Oak-20Kmin-1.csv',
        sourcePath: 'tests/fixtures/real/oak/source/TGA-Oak-20Kmin-1.csv',
        bytes: 137_848,
        sha256: '37f8e355b086479c62e74181d0b2ade298c7bdd63bdb10238dcf566ed0ef8fa1',
        bom: true,
        newline: 'CRLF',
        lineBreaks: 1_802,
      },
      {
        name: 'TGA-Oak-40Kmin-1.csv',
        sourcePath: 'tests/fixtures/real/oak/source/TGA-Oak-40Kmin-1.csv',
        bytes: 154_524,
        sha256: '967ccc4aac128a5a980fd1eea9154220e846cba4b7e853f3046c08fbc22d10a8',
        bom: true,
        newline: 'CRLF',
        lineBreaks: 7_189,
      },
    ],
  },
  {
    id: 'paper010-supplied-dalpha-dt',
    files: [
      {
        name: 'paper010_rh_t_alpha_beta.csv',
        sourcePath: 'tests/fixtures/real/paper010_rh_t_alpha_beta.csv',
        bytes: 4_732,
        sha256: 'a913d8111af91a4fa8a2fc3d1c8dd02ec0e216795dad9bfd77cff4912e76b27d',
        bom: false,
        newline: 'LF',
        lineBreaks: 49,
      },
    ],
  },
  {
    id: 'paper063-kissinger-beta-tp',
    files: [
      {
        name: 'paper063_kissinger_peaks.csv',
        sourcePath: 'tests/fixtures/real/paper063/paper063_kissinger_peaks.csv',
        bytes: 617,
        sha256: 'ab52fa64e40a18a522f96d711d75d6c3994624b4beea033f505bda1e1edcccee',
        bom: false,
        newline: 'LF',
        lineBreaks: 6,
      },
    ],
  },
] as const satisfies readonly ExpectedSessionIdentity[];

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function countByte(bytes: Uint8Array, value: number): number {
  let count = 0;
  for (const byte of bytes) {
    if (byte === value) count += 1;
  }
  return count;
}

function countCrlf(bytes: Uint8Array): number {
  let count = 0;
  for (let index = 1; index < bytes.length; index += 1) {
    if (bytes[index - 1] === 0x0d && bytes[index] === 0x0a) count += 1;
  }
  return count;
}

function expectTextEncodingIdentity(
  bytes: Uint8Array,
  expected: ExpectedFileIdentity,
): void {
  expect(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    .not.toThrow();
  expect(Buffer.from(bytes.subarray(0, UTF8_BOM.length)).equals(UTF8_BOM))
    .toBe(expected.bom);

  const lfCount = countByte(bytes, 0x0a);
  const crCount = countByte(bytes, 0x0d);
  const crlfCount = countCrlf(bytes);
  expect(lfCount).toBe(expected.lineBreaks);

  if (expected.newline === 'CRLF') {
    expect(crCount).toBe(expected.lineBreaks);
    expect(crlfCount).toBe(expected.lineBreaks);
    expect(Array.from(bytes.subarray(-2))).toEqual([0x0d, 0x0a]);
    return;
  }

  expect(crCount).toBe(0);
  expect(crlfCount).toBe(0);
  expect(bytes.at(-1)).toBe(0x0a);
}

describe('embedded licensed real-example byte identity', () => {
  it('preserves all six retained source files byte for byte in catalog order', async () => {
    const embeddedNames: string[] = [];

    for (const expectedSession of EXPECTED_SESSIONS) {
      const session = createRealExampleSession(expectedSession.id);
      expect(session.definition.fileNames).toEqual(
        expectedSession.files.map(({ name }) => name),
      );
      expect(session.files.map(({ name }) => name)).toEqual(
        expectedSession.files.map(({ name }) => name),
      );

      for (const [index, expectedFile] of expectedSession.files.entries()) {
        const file = session.files[index];
        const retainedBytes = readFileSync(path.resolve(expectedFile.sourcePath));
        const embeddedBytes = new Uint8Array(await file.arrayBuffer());

        embeddedNames.push(file.name);
        expect(file.name).toBe(expectedFile.name);
        expect(file.type).toBe('text/csv');
        expect(file.lastModified).toBe(0);
        expect(file.size).toBe(expectedFile.bytes);
        expect(retainedBytes.byteLength).toBe(expectedFile.bytes);
        expect(sha256(retainedBytes)).toBe(expectedFile.sha256);
        expect(sha256(embeddedBytes)).toBe(expectedFile.sha256);
        expect(Buffer.from(embeddedBytes).equals(retainedBytes)).toBe(true);
        expectTextEncodingIdentity(embeddedBytes, expectedFile);
      }
    }

    expect(embeddedNames).toEqual(
      EXPECTED_SESSIONS.flatMap(({ files }) => files.map(({ name }) => name)),
    );
    expect(embeddedNames).toHaveLength(6);
  });

  it('keeps the synthetic fixture outside the licensed real-example catalog', () => {
    const syntheticPath = path.resolve('examples/synthetic_kas_150.csv');
    const syntheticBytes = readFileSync(syntheticPath);
    const realExampleNames = REAL_EXAMPLES.flatMap(({ fileNames }) => fileNames);

    expect(syntheticBytes.byteLength).toBe(1_872);
    expect(sha256(syntheticBytes))
      .toBe('eeafd2d8a1dc11c385bc2906800b9b1d5647451a64cd400eafd50a83579f8b19');
    expect(realExampleNames).not.toContain('synthetic_kas_150.csv');
    expect(realExampleNames).not.toContain('synthetic-kas-150.csv');
  });
});
