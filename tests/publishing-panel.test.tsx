import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ACTIVATION_ENERGY_STUDIO_CITATION,
  PublishingPanel,
} from '../src/components/PublishingPanel';

function renderPanel(): Document {
  const html = renderToStaticMarkup(<PublishingPanel />);
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('PublishingPanel', () => {
  it('renders the English v0.3 package and only local relative links', () => {
    const document = renderPanel();
    const panel = document.querySelector('[data-testid="publishing-panel"]');
    const links = [...(panel?.querySelectorAll<HTMLAnchorElement>('a') ?? [])];

    expect(panel?.textContent).toContain('Five-minute quick start');
    expect(panel?.textContent).toContain('Single-HTML offline edition');
    expect(panel?.textContent).toContain('Exact software citation');
    expect(panel?.textContent).toContain(ACTIVATION_ENERGY_STUDIO_CITATION);
    expect(panel?.textContent).toContain('Report through SUPPORT.md');
    expect(panel?.textContent).toContain('curve-long.csv');
    expect(panel?.textContent).toContain('supplied-dalpha-dt.txt');
    expect(panel?.textContent).toContain('beta-tp.csv');
    expect(panel?.textContent).toContain('THIRD_PARTY_NOTICES.md');
    expect(panel?.querySelectorAll('.publishing-step-list > li')).toHaveLength(3);
    expect(panel?.querySelector('[data-testid="support-link"]')?.getAttribute('href'))
      .toBe('./SUPPORT.md');
    expect(links.length).toBeGreaterThanOrEqual(8);
    expect(links.every((link) => link.getAttribute('href')?.startsWith('./'))).toBe(true);
    expect(links.some((link) => link.getAttribute('href')?.startsWith('http'))).toBe(false);
  });
});
