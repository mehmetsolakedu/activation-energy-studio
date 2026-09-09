import assert from 'node:assert/strict';
import test from 'node:test';

import {
  METHOD_EVIDENCE,
  verifyScientificTraceability,
} from '../scripts/verify-scientific-traceability.mjs';

test('all five implemented methods retain a non-citation evidence chain', () => {
  const result = verifyScientificTraceability();
  assert.equal(result.status, 'PASS');
  assert.deepEqual(
    result.methods.map(({ method }) => method),
    ['FWO', 'KAS', 'STARINK', 'FRIEDMAN', 'KISSINGER'],
  );
  assert.equal(result.methods.length, METHOD_EVIDENCE.length);
  assert.equal(result.evidenceFileCount, 16);
  assert.equal(result.normativeDocumentLinks, 9);
  for (const method of result.methods) {
    assert.match(method.implementationClass, /^implemented/);
    assert.doesNotMatch(method.implementationClass, /citation/);
    assert.ok(method.specificationLink.startsWith('../01_PDF_Evidence_Extraction/'));
    assert.ok(method.evidenceFiles.length >= 3);
    for (const evidence of method.evidenceFiles) assert.ok(evidence.bytes > 0);
  }
});

test('the method trace uses five distinct source papers and visuals', () => {
  assert.equal(new Set(METHOD_EVIDENCE.map(({ paperId }) => paperId)).size, 5);
  assert.equal(new Set(METHOD_EVIDENCE.map(({ visual }) => visual)).size, 5);
});
