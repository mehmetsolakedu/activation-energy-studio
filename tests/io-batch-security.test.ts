import { describe, expect, it } from 'vitest';

import { ingestThermalFiles } from '../src/io';
import { INGESTION_LIMITS } from '../src/io/fileSecurity';

function validCsv(index: number): string {
  return [
    'Temperature [K],Alpha [0-1],beta [K/min],Run ID',
    `400,0.1,5,run-${index}`,
    `425,0.2,5,run-${index}`,
  ].join('\n');
}

describe('bounded batch ingestion', () => {
  it('rejects too many files before hashing or parsing', async () => {
    const files = Array.from(
      { length: INGESTION_LIMITS.batchFiles + 1 },
      (_, index) => new File([validCsv(index)], `run-${index}.csv`),
    );
    const result = await ingestThermalFiles(files);

    expect(result.status).toBe('error');
    expect(result.files).toEqual([]);
    expect(result.records).toEqual([]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'batch_file_limit_exceeded',
    }));
  });

  it('rejects excessive aggregate bytes before hashing or parsing', async () => {
    const declaredBytes = 15 * 1024 * 1024;
    const files = Array.from({ length: 9 }, (_, index) => {
      const file = new File([validCsv(index)], `run-${index}.csv`);
      Object.defineProperty(file, 'size', {
        configurable: true,
        value: declaredBytes,
      });
      return file;
    });
    const result = await ingestThermalFiles(files);

    expect(result.status).toBe('error');
    expect(result.files).toEqual([]);
    expect(result.records).toEqual([]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'batch_size_limit_exceeded',
    }));
  });

  it('makes byte-identical sources visible without guessing experimental identity', async () => {
    const bytes = validCsv(1);
    const result = await ingestThermalFiles([
      new File([bytes], 'first.csv'),
      new File([bytes], 'renamed-copy.csv'),
    ]);

    expect(result.status).toBe('ready');
    expect(result.records).toHaveLength(4);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning',
      code: 'duplicate_source_bytes_detected',
      sourceFile: 'renamed-copy.csv',
    }));
  });

  it('limits simultaneous file ingestion workers', async () => {
    let active = 0;
    let observedMaximum = 0;
    const files = Array.from({ length: 12 }, (_, index) => {
      const text = validCsv(index);
      const file = new File([text], `run-${index}.csv`);
      Object.defineProperty(file, 'arrayBuffer', {
        configurable: true,
        value: async () => {
          active += 1;
          observedMaximum = Math.max(observedMaximum, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
          return new TextEncoder().encode(text).buffer;
        },
      });
      return file;
    });

    const result = await ingestThermalFiles(files);

    expect(result.status, JSON.stringify(result.diagnostics)).toBe('ready');
    expect(observedMaximum).toBeGreaterThan(1);
    expect(observedMaximum).toBeLessThanOrEqual(
      INGESTION_LIMITS.batchConcurrency,
    );
  });
});
