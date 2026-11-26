# Activation Energy Studio — Release Packages and Historical Archives

This directory contains versioned offline release packages, integrity manifests, and shared import templates for **Activation Energy Studio**.

## Current release

- **[`v0.4.1/`](v0.4.1/)** — Current release package (`2026-11-23`).
  - Single-file offline application: [`v0.4.1/Activation-Energy-Studio-v0.4.1.html`](v0.4.1/Activation-Energy-Studio-v0.4.1.html) (`2,562,990` bytes; SHA-256 `1993e1cff6c015603e4267a25bf060823eba444c54560cd65bbb42208d0c9a2d`)
  - Package manifest and checksums: [`v0.4.1/MANIFEST.v0.4.1.json`](v0.4.1/MANIFEST.v0.4.1.json) and [`v0.4.1/SHA256SUMS.v0.4.1.txt`](v0.4.1/SHA256SUMS.v0.4.1.txt)
  - Production SBOM: [`v0.4.1/SBOM.production.cdx.json`](v0.4.1/SBOM.production.cdx.json)
  - Release notes and quick-start guide: [`v0.4.1/RELEASE_NOTES_v0.4.1.md`](v0.4.1/RELEASE_NOTES_v0.4.1.md) and [`v0.4.1/QUICK_START.md`](v0.4.1/QUICK_START.md)

## Immutable historical release packages

- **[`v0.4.0/`](v0.4.0/)** — Immutable `v0.4.0` release package (`MANIFEST.v0.4.0.json`, `SHA256SUMS.v0.4.0.txt`).
- **[`v0.3.2/`](v0.3.2/)** — Immutable `v0.3.2` release package (`MANIFEST.v0.3.2.json`, `SHA256SUMS.v0.3.2.txt`; archived on Zenodo at <https://doi.org/10.5281/zenodo.21921403>).
- **[`v0.3.1/`](v0.3.1/)** — Immutable `v0.3.1` release package (`MANIFEST.v0.3.1.json`, `SHA256SUMS.v0.3.1.txt`).
- **Legacy single-file archives (`v0.3.0` and `v0.2.0`):** `Activation-Energy-Studio-v0.3.0.html` (`MANIFEST.v0.3.0.json`, `SHA256SUMS.v0.3.0.txt`) and `Activation-Energy-Studio-v0.2.0.html` (`MANIFEST.v0.2.0.json`) are retained byte-unchanged for historical hash verification.

## Shared templates and verification

- **[`templates/`](templates/)** — Canonical CSV/TXT import templates (`curve-long.csv`, `supplied-dalpha-dt.txt`, and `beta-tp.csv`) bundled into current release packages.
- Run `npm run verify:release-manifest:v0.4.1` (or `npm run check`) from the repository root to verify current and historical package manifests and SHA-256 digests.
