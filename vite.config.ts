import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { defineConfig } from 'vitest/config';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = dirname(fileURLToPath(import.meta.url));
const HAS_EXTERNAL_PDF_CORPUS = existsSync(
  resolve(
    PROJECT_ROOT,
    '../01_PDF_Evidence_Extraction/00_Start_Here/paper_processing_order.csv',
  ),
);

function scientificBuildFingerprint(): string {
  const sourceFiles = [
    ...readdirSync(resolve(PROJECT_ROOT, 'src/core'))
      .filter((name) => name.endsWith('.ts'))
      .map((name) => resolve(PROJECT_ROOT, 'src/core', name)),
    ...readdirSync(resolve(PROJECT_ROOT, 'src/io'))
      .filter((name) => name.endsWith('.ts'))
      .map((name) => resolve(PROJECT_ROOT, 'src/io', name)),
    ...readdirSync(resolve(PROJECT_ROOT, 'src/report'))
      .filter((name) => name.endsWith('.ts'))
      .map((name) => resolve(PROJECT_ROOT, 'src/report', name)),
    resolve(PROJECT_ROOT, 'src/alphaGrid.ts'),
    resolve(PROJECT_ROOT, 'src/integration.ts'),
    resolve(PROJECT_ROOT, 'src/platformSelfTest.ts'),
    resolve(PROJECT_ROOT, 'src/product/disposition.ts'),
    resolve(PROJECT_ROOT, 'examples/synthetic_kas_150.csv'),
  ].sort();
  const digest = createHash('sha256');
  for (const path of sourceFiles) {
    const portablePath = relative(PROJECT_ROOT, path).split(sep).join('/');
    digest.update(portablePath);
    digest.update('\0');
    digest.update(readFileSync(path));
    digest.update('\0');
  }
  return digest.digest('hex');
}

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  define: {
    __SCIENTIFIC_BUILD_SHA256__: JSON.stringify(scientificBuildFingerprint()),
  },
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
  },
  test: {
    environment: 'jsdom',
    testTimeout: 15_000,
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      'tests/usability-study-evidence-record.test.mjs',
      'tests/scientific-review-evidence-record.test.mjs',
      ...(HAS_EXTERNAL_PDF_CORPUS
        ? ['tests/corpus-integrity-ledger.test.mjs']
        : []),
    ],
  },
});
