import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  OAK_ORACLE_PATH,
  runOakOracle,
} from '../scripts/run-oak-oracle.mjs';

const EXPECTED_PATH = path.resolve(
  'tests/fixtures/real/oak/expected-output.json',
);

test('Oak standard-library Decimal oracle reproduces the locked output', () => {
  const result = runOakOracle(['--check'], { stdio: 'pipe' });
  assert.equal(result.status, 0, result.stderr);
  const recomputed = Buffer.from(result.stdout, 'utf8');
  const locked = readFileSync(EXPECTED_PATH);
  assert.deepEqual(recomputed, locked);
});

test('Oak oracle remains independent of application source', () => {
  const implementation = readFileSync(OAK_ORACLE_PATH, 'utf8');
  assert.doesNotMatch(implementation, /(?:from|import)\s+.*src[./]/);
  assert.match(implementation, /from decimal import Decimal/);
  assert.match(implementation, /python-standard-library-only/);
  assert.equal(
    createHash('sha256').update(readFileSync(OAK_ORACLE_PATH)).digest('hex'),
    '72f6ca9255a2effa83bf305882467c1e5341d6356c7f7a1359ea2a4636f6f79e',
  );
});
