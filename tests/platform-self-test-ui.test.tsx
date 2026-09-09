import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import App from '../src/App';

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };

async function waitUntil(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function buttonContaining(host: HTMLElement, label: string): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.textContent?.includes(label));
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

describe('platform self-test application surface', () => {
  let host: HTMLDivElement;
  let root: Root;
  let originalFetch: typeof fetch;
  let originalCreateObjectUrl: typeof URL.createObjectURL;
  let originalRevokeObjectUrl: typeof URL.revokeObjectURL;
  let originalAnchorClick: typeof HTMLAnchorElement.prototype.click;
  let networkAttempts: string[];
  let downloads: string[];

  beforeEach(async () => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    networkAttempts = [];
    downloads = [];
    originalFetch = globalThis.fetch;
    originalCreateObjectUrl = URL.createObjectURL;
    originalRevokeObjectUrl = URL.revokeObjectURL;
    originalAnchorClick = HTMLAnchorElement.prototype.click;
    globalThis.fetch = ((input: RequestInfo | URL) => {
      networkAttempts.push(String(input));
      return Promise.reject(new Error('Network is forbidden in the self-test.'));
    }) as typeof fetch;
    URL.createObjectURL = ((_: Blob) => 'blob:platform-self-test') as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
    HTMLAnchorElement.prototype.click = function captureDownload() {
      if (this.download) downloads.push(this.download);
    };
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<App />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    HTMLAnchorElement.prototype.click = originalAnchorClick;
    host.remove();
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('runs in one activation, exposes the locked expectations, and downloads JSON without network', async () => {
    const panel = host.querySelector<HTMLElement>('[data-testid="platform-self-test-panel"]');
    expect(panel?.textContent).toContain('KAS');
    expect(panel?.textContent).toContain('149.999–150.001 kJ/mol');
    expect(panel?.textContent).toContain('R² ≥ 0.9999995');

    await act(async () => buttonContaining(host, 'Run scientific self-test').click());
    await waitUntil(
      () => host.querySelector('[data-testid="platform-self-test-status"]')?.textContent === 'PASS',
      'platform self-test PASS',
    );

    expect(panel?.textContent).toContain('11/11 checks passed');
    expect(panel?.textContent).toContain('2b53c8311cf5b4fda612a455d92e00a6e3b9eaa6ad24e293430af05ee4eae2ba');
    expect(networkAttempts).toEqual([]);

    await act(async () => buttonContaining(host, 'Platform evidence JSON').click());
    expect(downloads).toEqual(['activation-energy-platform-self-test-v0.3.2-pass.json']);
    expect(networkAttempts).toEqual([]);
  });
});
