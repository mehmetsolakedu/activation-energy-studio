export const ACTIVATION_ENERGY_STUDIO_CITATION =
  'Solak, M. (2026). Activation Energy Studio (Version 0.4.0) [Computer software].';

interface TemplateLink {
  href: string;
  fileName: string;
  description: string;
}

const TEMPLATE_LINKS: readonly TemplateLink[] = [
  {
    href: './templates/curve-long.csv',
    fileName: 'curve-long.csv',
    description: 'Row-wise temperature, TG/DTG, time, and beta fields',
  },
  {
    href: './templates/supplied-dalpha-dt.txt',
    fileName: 'supplied-dalpha-dt.txt',
    description: 'Text export containing supplied dAlpha/dt',
  },
  {
    href: './templates/beta-tp.csv',
    fileName: 'beta-tp.csv',
    description: 'Separate beta–Tp peak-temperature table',
  },
];

export function PublishingPanel() {
  return (
    <section
      aria-labelledby="publishing-panel-title"
      className="card publishing-panel"
      data-testid="publishing-panel"
    >
      <div className="card-header publishing-panel-header">
        <div>
          <p className="publishing-kicker">
            {'Publication and download'}
          </p>
          <h2 id="publishing-panel-title">
            {'Activation Energy Studio v0.4.0 research preview'}
          </h2>
          <p>
            {'Move from an example to a scientifically bounded report in five minutes, or retain the offline package locally.'}
          </p>
        </div>
        <span className="status-pill ok">v0.4.0 · Audit candidate</span>
      </div>

      <div className="publishing-panel-body">
        <section
          aria-labelledby="five-minute-start-title"
          className="publishing-section publishing-quick-start"
        >
          <div className="publishing-section-heading">
            <span className="step-index">5</span>
            <div>
              <h3 id="five-minute-start-title">
                {'Five-minute quick start'}
              </h3>
              <p>{'Three main steps with visible scientific confirmations.'}</p>
            </div>
          </div>
          <ol className="publishing-step-list">
            <li>
              <strong>{'Open a file'}</strong>
              <span>
                {'Choose a licensed real example or upload your CSV, TSV, TXT, or XLSX file; confirm the suggested profile and column mapping.'}
              </span>
            </li>
            <li>
              <strong>{'Inspect and confirm the interpretation'}</strong>
              <span>
                {'Check the TG/DTG curve, reaction stage, m0/mf anchors, α conversion, and derivative source.'}
              </span>
            </li>
            <li>
              <strong>{'Calculate and download'}</strong>
              <span>
                {'Read the method-level scientific decision and reportable α range; download the PDF report and reproducible JSON record.'}
              </span>
            </li>
          </ol>
        </section>

        <section
          aria-labelledby="offline-download-title"
          className="publishing-section publishing-offline"
        >
          <div className="publishing-section-heading">
            <div>
              <h3 id="offline-download-title">
                {'Single-HTML offline edition'}
              </h3>
              <p>
                {'No server installation is required; open the file directly in a current browser.'}
              </p>
            </div>
          </div>
          <div className="publishing-download-row">
            <a
              className="primary-button"
              data-testid="download-offline-html"
              download
              href="./Activation-Energy-Studio-v0.4.0.html"
            >
              {'Download offline HTML'}
            </a>
            <code>Activation-Energy-Studio-v0.4.0.html</code>
          </div>
          <p className="publishing-build-note">
            {'To reproduce it from the source package, run'}{' '}
            <code>npm ci &amp;&amp; npm run build</code>{' '}
            {'in the project root. The self-contained output is dist/index.html; analysis remains on the user’s device.'}
          </p>
        </section>

        <section
          aria-labelledby="sample-templates-title"
          className="publishing-section publishing-templates"
        >
          <div className="publishing-section-heading">
            <div>
              <h3 id="sample-templates-title">
                {'Sample file templates'}
              </h3>
              <p>
                {'Keep the template headers and explicitly confirm units for your own data.'}
              </p>
            </div>
          </div>
          <ul className="publishing-template-list">
            {TEMPLATE_LINKS.map((template) => (
              <li key={template.fileName}>
                <a download href={template.href}>{template.fileName}</a>
                <span>{template.description}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="publishing-info-grid">
          <section aria-labelledby="license-title" className="publishing-section">
            <h3 id="license-title">{'License and data boundary'}</h3>
            <p>
              {'The application source code is licensed under the MIT License. Third-party datasets and article-derived examples are not relicensed by MIT; their original licenses and citations remain in force.'}
            </p>
            <div className="publishing-inline-links">
              <a href="./LICENSE">LICENSE</a>
              <a href="./THIRD_PARTY_NOTICES.md">THIRD_PARTY_NOTICES.md</a>
            </div>
          </section>

          <section aria-labelledby="citation-title" className="publishing-section">
            <h3 id="citation-title">{'Exact software citation'}</h3>
            <blockquote data-testid="software-citation">
              {ACTIVATION_ENERGY_STUDIO_CITATION}
            </blockquote>
            <a href="./CITATION.cff">CITATION.cff</a>
          </section>

          <section aria-labelledby="release-notes-title" className="publishing-section">
            <h3 id="release-notes-title">{'v0.4.0 release notes'}</h3>
            <p>
              {'Fail-closed time-series validation, grid-stable raw-series Friedman derivatives, revision-bound ingestion and export state, hash-bound source identities in reproducible JSON and PDF, and licensed-source citation and license fields in JSON, CSV, and PDF.'}
            </p>
            <a href="./RELEASE_NOTES_v0.4.0.md">{'Full release notes'}</a>
          </section>

          <section aria-labelledby="support-title" className="publishing-section publishing-support">
            <h3 id="support-title">{'Report a bug'}</h3>
            <p>
              {'Follow the local reporting route and data-privacy boundary in SUPPORT.md. Include this diagnostic bundle:'}
            </p>
            <ul>
              <li>{'application version and scientific build SHA-256'}</li>
              <li>{'operating system, browser, and offline/network state'}</li>
              <li>{'reproduction steps plus expected and actual behavior'}</li>
              <li>{'file type, instrument profile, mapping, unit, and stage selections'}</li>
              <li>{'diagnostic codes, platform self-test JSON, and reproducible report JSON'}</li>
            </ul>
            <a className="secondary-button" data-testid="support-link" href="./SUPPORT.md">
              {'Report through SUPPORT.md'}
            </a>
          </section>
        </div>

        <p className="publishing-boundary">
          {'v0.4.0 is an audit candidate; it is not certified instrument software, does not determine mechanism, and does not present apparent Ea as an immutable material constant.'}
        </p>
      </div>
    </section>
  );
}
