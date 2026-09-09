# Offline Bundle Verification

## Automated static gate

Run from the project root:

```bash
npm run build
npm run verify:offline
```

`npm run check` also runs the verifier regression tests, rebuilds the app, and
executes this gate against the fresh `dist/` output.

The command exits with status `0` only when all three claims pass:

1. `dist/` contains exactly one file: `index.html`.
2. The built HTML contains no external or relative resource reference, CSS
   dependency, refresh redirect, or non-embedded JavaScript module import.
3. First-party files under `src/` contain no recognized browser network API,
   network-client package import, remote module import, remote CSS dependency,
   or runtime creation of a resource-loading HTML element.

The report prints the exact byte count and SHA-256 of the HTML it inspected.
The check is deterministic: it contains no time, network, or platform-dependent
input, and every reported file or violation list is sorted.

## Regression proof

```bash
npm run test:offline-verifier
```

The focused test suite proves that the gate:

- accepts an inline, one-file, local-only fixture;
- rejects an external script;
- rejects a first-party `fetch()` call; and
- rejects a second file in the build directory.

## Claim boundary

This is a **static offline-bundle PASS**, not a runtime zero-request proof.
Third-party libraries bundled into the HTML may contain dormant network-capable
branches even when this application never invokes them. Static inspection also
cannot prove behavior in every browser or operating system.

A separate runtime gate must open the built file, exercise upload, analysis,
and report-download paths while recording browser network activity, and observe
zero requests. Windows, macOS, and Linux smoke tests remain separate platform
evidence; this verifier must not be cited as a substitute for those tests.

## Complementary application-runtime guard

`tests/runtime-offline-app.test.tsx` instruments and self-calibrates `fetch`,
XMLHttpRequest, WebSocket, EventSource, `sendBeacon`, and dynamic external
script/image insertion. It then exercises ambiguous-file guided mapping and a
real multi-rate data analysis with JSON/CSV blob downloads; both paths record
zero attempts. This is a jsdom application-runtime guard, not a network log from
the built HTML in a real browser and not Windows/Linux compatibility evidence.
