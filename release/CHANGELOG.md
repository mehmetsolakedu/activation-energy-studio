# Changelog

All notable user-facing changes are recorded here. This project follows
semantic versioning for packaged research-preview artifacts.

## 0.3.0 — 2026-07-30

### Added

- Simple and expert analysis modes with Turkish and English interface paths.
- Three one-click, licensed real-data examples:
  - four-rate Chilean Oak raw CSV for FWO, KAS, and Starink;
  - Paper010 official-DTG-derived supplied d(alpha)/dt for Friedman;
  - Paper063 article-derived beta-Tp values for a separate Kissinger result.
- Confirmation-gated suggestions for metadata-rich thermal TXT, generic XLSX,
  and guided fallback mapping.
- Bilingual five-minute quick starts, import templates, citation metadata,
  third-party attribution, support instructions, release notes, and a compact
  download page.
- Deterministic v0.3 packaging script with SHA-256 manifest and checksum index.

### Preserved

- Offline, single-HTML operation.
- The v0.2 scientific core, explicit unit/sign semantics, fail-closed
  ingestion, diagnostics, result exports, and provenance-rich PDF reporting.

### Scientific and release boundaries

- Results are method-, sample-, atmosphere-, stage-, preprocessing-, and
  conversion-range-specific apparent activation energies.
- Regression confidence intervals do not cover all experimental or model-form
  uncertainty.
- Paper063 is article-derived CC BY 4.0 content and has no separately licensed
  raw dataset.
- A generated manifest proves package byte integrity only. It does not replace
  scientific review, usability observation, or final-platform validation.

## 0.2.0

- Established the evidence-grounded scientific core, guided fail-closed
  ingestion, deterministic offline single-HTML build, JSON/CSV/PDF reporting,
  and bounded real-data validation lanes.
