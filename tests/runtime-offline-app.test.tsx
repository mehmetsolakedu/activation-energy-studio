import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import App from '../src/App';
import ux01Csv from '../evidence/usability/v0.2.0/study_bundle/UX01_four_run_mass_ambiguous.csv?raw';
import syntheticKasCsv from '../examples/synthetic_kas_150.csv?raw';
import ambiguousCsv from './fixtures/bare_ambiguous.csv?raw';
import realCsv from './fixtures/real/paper010_rh_t_alpha_beta.csv?raw';
import { confirmInterpretation, interpretationCheckbox } from './app-test-helpers';
import { createMinimalXlsxFile, type OoxmlCell } from './helpers/minimal-ooxml';

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };

interface NetworkAttempt {
  channel: string;
  target: string;
}

interface LocalDownload {
  filename: string;
  href: string;
}

interface RuntimeNetworkGuard {
  attempts: NetworkAttempt[];
  downloads: LocalDownload[];
  restore(): void;
}

const RESOURCE_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  AUDIO: ['src'],
  EMBED: ['src'],
  IFRAME: ['src'],
  IMG: ['src', 'srcset'],
  INPUT: ['src'],
  LINK: ['href'],
  OBJECT: ['data'],
  SCRIPT: ['src'],
  SOURCE: ['src', 'srcset'],
  TRACK: ['src'],
  VIDEO: ['src', 'poster'],
};

function installRuntimeNetworkGuard(): RuntimeNetworkGuard {
  const attempts: NetworkAttempt[] = [];
  const downloads: LocalDownload[] = [];
  const restores: Array<() => void> = [];
  let objectUrlSequence = 0;

  function replaceProperty(target: object, key: PropertyKey, value: unknown) {
    const previous = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { configurable: true, writable: true, value });
    restores.push(() => {
      if (previous) Object.defineProperty(target, key, previous);
      else Reflect.deleteProperty(target, key);
    });
  }

  function record(channel: string, target: unknown) {
    attempts.push({ channel, target: String(target) });
  }

  function isLocalOnlyUrl(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return normalized === ''
      || normalized.startsWith('#')
      || normalized.startsWith('about:')
      || normalized.startsWith('blob:')
      || normalized.startsWith('data:')
      || normalized.startsWith('javascript:');
  }

  function inspectResource(element: Element, channel: string): boolean {
    const attributes = RESOURCE_ATTRIBUTES[element.tagName];
    if (!attributes) return false;
    let detected = false;
    for (const attribute of attributes) {
      const value = element.getAttribute(attribute);
      if (value !== null && !isLocalOnlyUrl(value)) {
        detected = true;
        record(`${channel}:${element.tagName}.${attribute}`, value);
      }
    }
    return detected;
  }

  function inspectResourceTree(node: Node, channel: string): boolean {
    if (!(node instanceof Element)) return false;
    let detected = inspectResource(node, channel);
    for (const element of node.querySelectorAll(Object.keys(RESOURCE_ATTRIBUTES).join(','))) {
      detected = inspectResource(element, channel) || detected;
    }
    return detected;
  }

  replaceProperty(globalThis, 'fetch', ((input: RequestInfo | URL) => {
    const target = input instanceof Request ? input.url : input;
    record('fetch', target);
    return Promise.reject(new Error(`Network disabled by runtime guard: ${String(target)}`));
  }) as typeof fetch);

  const originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function guardedOpen(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    record(`XMLHttpRequest.open:${method}`, url);
    return originalXhrOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
  };
  restores.push(() => { XMLHttpRequest.prototype.open = originalXhrOpen; });

  const originalXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function guardedSend(body?: Document | XMLHttpRequestBodyInit | null) {
    record('XMLHttpRequest.send', this.responseURL || '(configured request)');
    throw new Error('Network disabled by runtime guard: XMLHttpRequest.send');
  };
  restores.push(() => { XMLHttpRequest.prototype.send = originalXhrSend; });

  replaceProperty(globalThis, 'WebSocket', class GuardedWebSocket {
    constructor(url: string | URL) {
      record('WebSocket', url);
      throw new Error(`Network disabled by runtime guard: ${String(url)}`);
    }
  });

  replaceProperty(globalThis, 'EventSource', class GuardedEventSource {
    constructor(url: string | URL) {
      record('EventSource', url);
      throw new Error(`Network disabled by runtime guard: ${String(url)}`);
    }
  });

  replaceProperty(navigator, 'sendBeacon', ((url: string | URL) => {
    record('navigator.sendBeacon', url);
    return false;
  }) as Navigator['sendBeacon']);

  const originalSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function guardedSetAttribute(name: string, value: string) {
    if (RESOURCE_ATTRIBUTES[this.tagName]?.includes(name.toLowerCase()) && !isLocalOnlyUrl(value)) {
      record(`Element.setAttribute:${this.tagName}.${name.toLowerCase()}`, value);
      throw new Error(`Network resource disabled by runtime guard: ${value}`);
    }
    return originalSetAttribute.call(this, name, value);
  };
  restores.push(() => { Element.prototype.setAttribute = originalSetAttribute; });

  const originalAppendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function guardedAppendChild<T extends Node>(node: T): T {
    if (inspectResourceTree(node, 'Node.appendChild')) {
      throw new Error('Network resource insertion disabled by runtime guard');
    }
    return originalAppendChild.call(this, node) as T;
  };
  restores.push(() => { Node.prototype.appendChild = originalAppendChild; });

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function guardedInsertBefore<T extends Node>(node: T, child: Node | null): T {
    if (inspectResourceTree(node, 'Node.insertBefore')) {
      throw new Error('Network resource insertion disabled by runtime guard');
    }
    return originalInsertBefore.call(this, node, child) as T;
  };
  restores.push(() => { Node.prototype.insertBefore = originalInsertBefore; });

  replaceProperty(URL, 'createObjectURL', ((_: Blob) => {
    objectUrlSequence += 1;
    return `blob:runtime-offline-test/${objectUrlSequence}`;
  }) as typeof URL.createObjectURL);
  replaceProperty(URL, 'revokeObjectURL', ((_: string) => undefined) as typeof URL.revokeObjectURL);

  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function guardedAnchorClick() {
    if (this.download && this.href.startsWith('blob:')) {
      downloads.push({ filename: this.download, href: this.href });
      return;
    }
    return originalAnchorClick.call(this);
  };
  restores.push(() => { HTMLAnchorElement.prototype.click = originalAnchorClick; });

  return {
    attempts,
    downloads,
    restore() {
      for (const restore of restores.reverse()) restore();
    },
  };
}

function buttonContaining(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.textContent?.includes(label));
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

function roleUnitSelect(container: HTMLElement, label: string): HTMLSelectElement {
  const role = [...container.querySelectorAll<HTMLElement>('.mapping-role')]
    .find((item) => item.textContent?.includes(label));
  const selects = role?.querySelectorAll<HTMLSelectElement>('select');
  if (!selects || selects.length < 2) throw new Error(`Unit selector not found for ${label}`);
  return selects[1];
}

function setSelect(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function setInput(container: HTMLElement, label: string, value: string) {
  const input = [...container.querySelectorAll<HTMLLabelElement>('label')]
    .find((candidate) => candidate.textContent?.includes(label))
    ?.querySelector<HTMLInputElement>('input');
  if (!input) throw new Error(`Input not found for ${label}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Native input value setter is unavailable');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function waitUntil(predicate: () => boolean, message: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
  }
  throw new Error(`Timed out: ${message}`);
}

async function uploadFile(container: HTMLElement, file: File): Promise<File> {
  const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!fileInput) throw new Error('File input not found');
  Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
  await act(async () => {
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  });
  return file;
}

async function uploadCsv(container: HTMLElement, contents: string, filename: string): Promise<File> {
  const file = new File([contents], filename, { type: 'text/csv' });
  Object.defineProperty(file, 'arrayBuffer', {
    configurable: true,
    value: async () => new TextEncoder().encode(contents).buffer,
  });
  return uploadFile(container, file);
}

describe('App runtime offline guard', () => {
  let host: HTMLDivElement;
  let root: Root | undefined;
  let guard: RuntimeNetworkGuard;

  beforeEach(async () => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    guard = installRuntimeNetworkGuard();
    root = createRoot(host);
    await act(async () => root?.render(<App />));
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    guard.restore();
    host.remove();
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('self-calibrates every guarded network channel without letting the request escape', async () => {
    await expect(fetch('https://network-guard.invalid/fetch')).rejects.toThrow('Network disabled');

    const request = new XMLHttpRequest();
    request.open('GET', 'https://network-guard.invalid/xhr');
    expect(() => request.send()).toThrow('Network disabled');
    expect(() => new WebSocket('wss://network-guard.invalid/socket')).toThrow('Network disabled');
    expect(() => new EventSource('https://network-guard.invalid/events')).toThrow('Network disabled');
    expect(navigator.sendBeacon('https://network-guard.invalid/beacon')).toBe(false);

    const script = document.createElement('script');
    expect(() => script.setAttribute('src', 'https://network-guard.invalid/app.js')).toThrow('Network resource');
    const image = document.createElement('img');
    image.src = 'https://network-guard.invalid/image.png';
    expect(() => document.body.appendChild(image)).toThrow('Network resource insertion');

    expect(new Set(guard.attempts.map((attempt) => attempt.channel))).toEqual(new Set([
      'fetch',
      'XMLHttpRequest.open:GET',
      'XMLHttpRequest.send',
      'WebSocket',
      'EventSource',
      'navigator.sendBeacon',
      'Element.setAttribute:SCRIPT.src',
      'Node.appendChild:IMG.src',
    ]));
  });

  it('maps an ambiguous device CSV without attempting any network channel', async () => {
    await uploadCsv(host, ambiguousCsv, 'instrument-units.csv');
    await waitUntil(() => host.querySelector('.mapping-wizard') !== null, 'mapping wizard');

    await act(async () => {
      setSelect(roleUnitSelect(host, 'Temperature'), 'K');
      setSelect(roleUnitSelect(host, 'Conversion α'), 'fraction');
      setSelect(roleUnitSelect(host, 'Heating rate β'), 'K/min');
    });
    await act(async () => buttonContaining(host, 'Validate selections').click());
    await waitUntil(() => host.querySelector('.mapping-wizard') === null, 'mapped file to become ready');

    expect(host.querySelector('.status-pill')?.textContent).toContain('Ready');
    await act(async () => setInput(host, 'Stage label', 'guided mapping stage'));
    await confirmInterpretation(host);
    expect(buttonContaining(host, 'Run eligible methods').disabled).toBe(false);
    expect(guard.attempts).toEqual([]);
  });

  it('loads real multi-rate data, analyzes it and exports JSON/CSV with zero network attempts', async () => {
    await uploadCsv(host, realCsv, 'paper010-rh-real.csv');
    await act(async () => setInput(host, 'Stage label', 'Paper010 supplied-alpha stage'));
    await waitUntil(
      () => [...host.querySelectorAll<HTMLButtonElement>('button')]
        .some((button) => button.textContent?.includes('Run eligible methods')),
      'real fixture ingestion controls',
    );
    const analysisButton = buttonContaining(host, 'Run eligible methods');
    await waitUntil(
      () => interpretationCheckbox(host)?.disabled === false,
      'real fixture interpretation',
    );
    await confirmInterpretation(host);
    expect(analysisButton.disabled).toBe(false);

    await act(async () => analysisButton.click());
    await waitUntil(() => !buttonContaining(host, 'Reproducible JSON').disabled, 'analysis result');

    await act(async () => buttonContaining(host, 'Reproducible JSON').click());
    await waitUntil(() => guard.downloads.length === 1, 'JSON download');
    await waitUntil(() => !buttonContaining(host, 'Results CSV').disabled, 'JSON export completion');
    await act(async () => buttonContaining(host, 'Results CSV').click());
    await waitUntil(() => guard.downloads.length === 2, 'CSV download');

    expect(guard.downloads.map((download) => download.filename)).toEqual([
      'new-activation-energy-analysis.json',
      'new-activation-energy-analysis-results.csv',
    ]);
    expect(guard.downloads.every((download) => download.href.startsWith('blob:'))).toBe(true);
    expect(guard.attempts).toEqual([]);
  });

  it('opens a real two-sheet OOXML workbook, confirms it, analyzes, and exports in nine app activations', async () => {
    let semanticActivations = 0;
    const rows: OoxmlCell[][] = syntheticKasCsv.trim().split(/\r?\n/).map((line, rowIndex) =>
      line.split(',').map((cell) => {
        if (rowIndex === 0) return cell;
        const numericValue = Number(cell);
        return cell !== '' && Number.isFinite(numericValue) ? numericValue : cell;
      }),
    );
    const workbook = createMinimalXlsxFile([
      { name: 'Readme', rows: [['This sheet intentionally contains no thermal data.']] },
      { name: 'Curves', rows },
    ], 'two-sheet-synthetic.xlsx');

    await uploadFile(host, workbook);
    semanticActivations += 1;
    await waitUntil(() => host.querySelector('.mapping-wizard') !== null, 'XLSX sheet selection');
    const sheetSelect = [...host.querySelectorAll<HTMLLabelElement>('label')]
      .find((label) => label.textContent?.includes('XLSX worksheet'))
      ?.querySelector<HTMLSelectElement>('select');
    if (!sheetSelect) throw new Error('XLSX sheet selector not found');
    await act(async () => setSelect(sheetSelect, 'Curves'));
    semanticActivations += 1;
    await act(async () => buttonContaining(host, 'Validate selections').click());
    semanticActivations += 1;
    await waitUntil(() => host.querySelector('.mapping-wizard') === null, 'selected XLSX sheet ready');

    expect(host.querySelector('.file-list')?.textContent).toContain('36 normalized records');
    await act(async () => setInput(host, 'Stage label', 'two-sheet supplied-alpha stage'));
    semanticActivations += 1;
    await confirmInterpretation(host);
    semanticActivations += 1;
    const analysisButton = buttonContaining(host, 'Run eligible methods');
    expect(analysisButton.disabled).toBe(false);
    await act(async () => analysisButton.click());
    semanticActivations += 1;
    await waitUntil(() => !buttonContaining(host, 'Reproducible JSON').disabled, 'XLSX result');
    expect(host.querySelector('[data-testid="result-type-comparison"]')).not.toBeNull();

    for (const label of ['Reproducible JSON', 'Results CSV', 'PDF report']) {
      await act(async () => buttonContaining(host, label).click());
      semanticActivations += 1;
      await waitUntil(() => guard.downloads.length === semanticActivations - 6, `${label} download`);
    }

    expect(semanticActivations).toBe(9);
    expect(guard.downloads.map((download) => download.filename)).toEqual([
      'new-activation-energy-analysis.json',
      'new-activation-energy-analysis-results.csv',
      'new-activation-energy-analysis-report.pdf',
    ]);
    expect(guard.attempts).toEqual([]);
  });

  it('runs the locked platform self-test and downloads its evidence under every network guard', async () => {
    await act(async () => buttonContaining(host, 'Run scientific self-test').click());
    await waitUntil(
      () => host.querySelector('[data-testid="platform-self-test-status"]')?.textContent === 'PASS',
      'platform self-test PASS',
    );

    await act(async () => buttonContaining(host, 'Platform evidence JSON').click());
    await waitUntil(() => guard.downloads.length === 1, 'platform self-test JSON download');

    expect(guard.downloads).toEqual([{
      filename: 'activation-energy-platform-self-test-v0.3.2-pass.json',
      href: 'blob:runtime-offline-test/1',
    }]);
    expect(guard.attempts).toEqual([]);
  });

  it('completes the UX01 guided mass-to-alpha path with confirmation and PDF export in 12 semantic activations', async () => {
    let semanticActivations = 0;
    await uploadCsv(host, ux01Csv, 'UX01_four_run_mass_ambiguous.csv');
    semanticActivations += 1;
    await waitUntil(() => host.querySelector('.mapping-wizard') !== null, 'UX01 mapping wizard');

    await act(async () => {
      setSelect(roleUnitSelect(host, 'Temperature'), 'C');
      semanticActivations += 1;
      setSelect(roleUnitSelect(host, 'Mass percentage'), '%');
      semanticActivations += 1;
      setSelect(roleUnitSelect(host, 'Heating rate β'), 'K/min');
      semanticActivations += 1;
    });
    await act(async () => buttonContaining(host, 'Validate selections').click());
    semanticActivations += 1;
    await waitUntil(() => host.querySelector('.mapping-wizard') === null, 'UX01 mapping validation');

    await act(async () => {
      setInput(host, 'Project name', 'UX01 Four Run');
      semanticActivations += 1;
      setInput(host, 'Process', 'synthetic mass loss');
      semanticActivations += 1;
      setInput(host, 'Stage start', '300');
      semanticActivations += 1;
      setInput(host, 'Stage end', '380');
      semanticActivations += 1;
    });

    await confirmInterpretation(host);
    semanticActivations += 1;
    const analysisButton = host.querySelector<HTMLButtonElement>('[data-testid="run-analysis"]');
    expect(analysisButton?.disabled).toBe(false);
    await act(async () => analysisButton?.click());
    semanticActivations += 1;
    await waitUntil(() => !buttonContaining(host, 'PDF report').disabled, 'UX01 analysis result');

    await act(async () => buttonContaining(host, 'PDF report').click());
    semanticActivations += 1;
    await waitUntil(() => guard.downloads.some(({ filename }) => filename === 'ux01-four-run-report.pdf'), 'UX01 PDF download');

    expect(semanticActivations).toBe(12);
    expect(host.querySelector('[data-testid="result-type-comparison"]')).not.toBeNull();
    expect(host.textContent).toContain('synthetic-kas');
    expect(guard.attempts).toEqual([]);
  });
});
