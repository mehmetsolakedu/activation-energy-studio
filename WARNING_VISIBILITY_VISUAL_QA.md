# Warning Visibility Visual QA

**Inspection date:** 2026-07-29  
**Locked release:** `release/Activation-Energy-Studio-v0.2.0.html`  
**Release SHA-256:** `ce716471586b098806007853992bed6601dfa359d53e59fe1b50c849d911dbb7`  
**Evidence manifest:** `evidence/usability/v0.2.0/warning-visibility-current/WARNING_VISIBILITY_EVIDENCE.json`  
**Manifest SHA-256:** `7fb4e899b71ee5009626a0e053d06a9a66b58ea01dc866db33f616c9d79bc02f`

## Claim state

This is an AI-assisted technical visual QA pass over retained real-Chrome
screenshots and rendered PDF pages. It is not a named human-observer review,
does not represent a participant usability result, and does not close
AC-UX-04. The retained manifest remains
`LOCAL_AUTOMATED_8_OF_8_REQUIRES_HUMAN_VISUAL_REVIEW`.

## Inspected surfaces

| Case | Required code | UI screenshot | PDF pages inspected | Result |
|---|---|---|---:|---|
| W1 | `LIMITED_HEATING_RATES` | `W1/warning-card.png` | 4/4 | No clipping, overlap, blank page, or unreadable warning |
| W2 | `NUMERICAL_DERIVATIVE` | `W2/warning-card.png` | 4/4 | No clipping, overlap, blank page, or unreadable warning |
| W3 | `LOW_R2` | `W3/warning-card.png` | 3/3 | Repeated raw findings are grouped by code; scope counts remain visible |
| W4 | `MULTISTEP_EA_VARIATION` | `W4/warning-card.png` | 4/4 | Repeated method findings are grouped; method scope remains visible |

All paths in the table are relative to
`evidence/usability/v0.2.0/warning-visibility-current/`.

## Focused repair

The first capture exposed a severe presentation defect: W3 and W4 rendered the
same user-facing warning card repeatedly for method/alpha-level findings. The
UI now groups identical severity/code combinations and displays the retained
record count. The PDF groups repeated codes and reports occurrence, method,
alpha, and run scope. The raw analysis records remain unchanged in the JSON
audit trail.

After rebuilding and recapturing the same four fixtures:

- the technical UI/PDF matrix remained 8/8;
- the W3 PDF decreased from five pages to three without dropping raw JSON
  diagnostics;
- all four warning-card PNGs and all 15 current PDF page renders were visually
  inspected;
- fresh 150 dpi Poppler renders matched the 15 retained page PNGs byte-for-byte;
- each required code was visible in both its UI card and its PDF diagnostics;
- no severe layout defect, clipped key value, broken chart, blank page, black
  square, or unreadable color combination was observed.

W2 page 4 begins with a continuation heading and completes one mapping row from
the preceding page. The row remains readable and no content is clipped or lost.

## Open independent action

A named human observer must inspect the retained PNG and rendered PDF files,
record identity/date/confirmation for all eight matrix cells, and review the
scientific meaning of the warning copy before AC-UX-04 can move beyond
`PARTIAL`.
