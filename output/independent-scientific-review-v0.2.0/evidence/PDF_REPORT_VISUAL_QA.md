# Schema-v4 PDF Report Visual QA

**Inspection date:** 2026-07-29  
**Artifact:** `output/pdf/activation-energy-report-schema-v4-qa.pdf`  
**Artifact SHA-256:** `fa04ca87dab3b7170a14eaabfdc925aa3f1cfeb7d088db9f0fd03f68469b1e49`  
**Artifact size:** `120117 bytes`  
**Result:** **PASS — the byte-current schema-v4 artifact was rendered with Poppler at 120 dpi and every page was visually inspected.**

## Reproduction and contract checks

Run `npm run qa:pdf` to regenerate the checked-in artifact. The report-content-derived PDF file identifier and fixed fixture timestamp make repeated generation deterministic. The artifact test creates the report from the locked schema-v4 fixture and compares the newly generated PDF byte-for-byte with the checked-in PDF, preventing a stale visual artifact from passing the suite.

The retained inspection used `pdfinfo` and Poppler rendering at 120 dpi:

```bash
pdftoppm -png -r 120 output/pdf/activation-energy-report-schema-v4-qa.pdf tmp/pdfs-final-v4/schema-v4-qa-page
```

`pdfinfo` reported a four-page, unencrypted A4 PDF with no forms or embedded
JavaScript. The PDF contract test directly asserts the required text/section
markers, including Eligibility, isoconversional results, apparent Ea(alpha),
regression and residual diagnostics, the regression-only uncertainty boundary,
separate Kissinger peak analysis, canonical input units and preprocessing, and
the scientific claim boundary.

## Page-by-page inspection

| Page | Required content observed | Visual result |
|---:|---|---|
| 1 | Analysis context, explicit Eligibility decision and per-method retained-result summary, beginning of the isoconversional table with `nβ/raw/df` | PASS — no clipping, overlap, orphan heading, or unreadable text |
| 2 | Continued FWO/KAS/Starink/Friedman result table with repeated header | PASS — continuation and footer are intact; no row collision or cutoff |
| 3 | Multi-method Ea(alpha) plot, KAS transformed-point OLS fit, residual plot, exact regression-CI boundary, separate Kissinger peak panel | PASS — axes, legends, points, fit line, residual zero line, labels, and boundary text are legible |
| 4 | Canonical units, preprocessing/mapping, derivative and mass-reference provenance, diagnostics, formula identifiers, source hash, scientific boundary | PASS — all sections and the boundary box fit within the page |

Poppler emitted a local Fontconfig configuration warning during rendering, but all expected glyphs were present and no font substitution artifact, black box, or missing label was visible on any page.

## Current direct-macOS Chrome reports

The current local offline diagnostic report,
`evidence/platform/local-macos/v0.2.0-current-release/platform-golden-report.pdf`,
is a four-page A4 PDF (`117090` bytes; SHA-256
`e5098916b365a45ecda4302153dc74ed360b26e6fa50c2a258ad553775ba2b98`).
All four pages were freshly rendered at 120 dpi and visually inspected. Tables,
Ea(alpha) and regression graphics, diagnostics, traceability, and the scientific
boundary are legible with no clipping, overlap, broken glyph, or black box. The
page-4 `INPUT UNITS ... CONTINUED` block completes a mapping row begun on page
3; it is a valid pagination continuation, not missing content.

The official raw-Paper010 two-pass evidence contains:

- `pass-1/paper010-raw-to-report-report.pdf`: five A4 pages, `167606` bytes,
  SHA-256 `10a516e5adc0f7ccc2bafb8d966c3c4d66d89840d38ce1d4bfc896496669b994`;
- `pass-2/paper010-raw-to-report-report.pdf`: five A4 pages, `167606` bytes,
  SHA-256 `51604fc1fa2bb1e5afa4f7b68c00c61696053adccd6626a9c8d949d497bd31be`.

Both paths are relative to
`evidence/validation/paper010-raw-to-report-v0.2.0-local/`. All ten pages were
freshly rendered at 120 dpi and visually inspected. Tables, plots, transformed
regressions, diagnostics, source hashes, and claim-boundary boxes are legible
without clipping, overlap, broken glyphs, or black boxes. The PDF bytes differ
because the visible generation timestamp differs; the retained manifest
separately proves exact equality of the canonical scientific JSON and CSV.

## Scientific boundary

This PASS validates report completeness and rendering for the deterministic QA
fixture and current direct-macOS Chrome artifacts. No Parallels or VM evidence
is used. It does not validate experimental truth, total uncertainty,
Windows/Linux behavior, independent review, or non-expert usability. Those
remain governed by their separate acceptance gates.
