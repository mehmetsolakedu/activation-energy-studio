import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import App from '../src/App';

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};

describe('English-only application contract', () => {
  let host: HTMLDivElement;
  let root: Root;
  let originalDocumentLanguage: string;
  let originalDocumentTitle: string;

  beforeEach(async () => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    originalDocumentLanguage = document.documentElement.lang;
    originalDocumentTitle = document.title;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(<App />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    document.documentElement.lang = originalDocumentLanguage;
    document.title = originalDocumentTitle;
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('uses English document metadata and has no language switch', () => {
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Activation Energy Studio · Research Preview');
    expect(host.querySelector('[data-testid="language-en"]')).toBeNull();
    expect(host.querySelector('[aria-label="Language"]')).toBeNull();
  });

  it('renders the initial workflow in standard technical English', () => {
    expect(host.textContent).toContain('Thermal-analysis files');
    expect(host.textContent).toContain('Review and confirm');
    expect(host.textContent).toContain('Scientific decision, calculation, and report');
    expect(host.textContent).toContain('Run eligible methods');
    expect(host.textContent).not.toMatch(/[ÇĞİÖŞÜçğıöşü]/u);
  });
});
