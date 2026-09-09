import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { DiagnosticCode } from '../src/core/types';
import { diagnosticMessage, hasEnglishDiagnosticCopy } from '../src/diagnostics/en';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CORE_TYPES_PATH = resolve(TEST_DIRECTORY, '../src/core/types.ts');

function readCoreDiagnosticCodes(): DiagnosticCode[] {
  const source = readFileSync(CORE_TYPES_PATH, 'utf8');
  const declaration = source.match(/export type DiagnosticCode\s*=([\s\S]*?);/);

  if (!declaration?.[1]) {
    throw new Error('DiagnosticCode declaration could not be read from src/core/types.ts.');
  }

  return [...declaration[1].matchAll(/"([A-Z0-9_]+)"/g)].map(
    ([, code]) => code as DiagnosticCode,
  );
}

const coreDiagnosticCodes = readCoreDiagnosticCodes();

describe('English core diagnostic copy coverage', () => {
  it('covers the complete 58/58 DiagnosticCode source-of-truth set', () => {
    const coveredCodes = coreDiagnosticCodes.filter(hasEnglishDiagnosticCopy);

    expect(new Set(coreDiagnosticCodes).size).toBe(coreDiagnosticCodes.length);
    expect({ covered: coveredCodes.length, total: coreDiagnosticCodes.length }).toEqual({
      covered: 58,
      total: 58,
    });
  });

  it('never falls back and always gives Problem/Why it matters/Action guidance for a core code', () => {
    const failures = coreDiagnosticCodes.flatMap((code) => {
      const fallback = `__FALLBACK_FOR_${code}__`;
      const message = diagnosticMessage(code, fallback);
      const hasRequiredSections =
        message.startsWith('Problem: ') &&
        message.includes(' Why it matters: ') &&
        message.includes(' Action: ');

      return hasEnglishDiagnosticCopy(code) && message !== fallback && hasRequiredSections
        ? []
        : [{ code, message }];
    });

    expect(failures).toEqual([]);
  });
});
