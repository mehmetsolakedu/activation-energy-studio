# Third-party notices and real-example attribution

Activation Energy Studio source code and locally authored documentation are
MIT-licensed as described in `LICENSE`. The materials below retain their own
licenses. Their inclusion does not transfer those licenses to the application,
and the application license does not transfer to them.

## Chilean Oak raw TGA example

- Work: *Experimental data of a kinetic and thermodynamic study of Chilean Oak
  pyrolysis*, Mendeley Data, version 2.
- Source: <https://doi.org/10.17632/gkhjh4v8tg.2>
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- Included material: the four deposited CSV exports at 5, 10, 20, and
  40 K/min, embedded byte-for-byte for the one-click example.
- Application-side treatment: the Celsius column is converted with +273.15;
  a unique upward conversion branch is projected at alpha 0.05 through 0.85.
  Source files are not repaired or overwritten.
- Scientific boundary: publication values are comparison evidence, not a
  hard-coded oracle. Source/publication irregularities remain disclosed in the
  bundled example and report.

## Paper010 rhubarb supplied-derivative example

- Work: official supporting-information S2 workbook associated with the PLOS
  ONE article, rhubarb TG and -DTG data.
- Source: <https://doi.org/10.1371/journal.pone.0173946.s002>
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- Included material: a deterministic CSV derived from the official workbook.
  Alpha is initial-mass-normalized; T-alpha is found by first upward
  piecewise-linear crossing; supplied d(alpha)/dt is interpolated from the
  official positive mass-loss-rate ordinate and divided by 100.
- Changes: temperatures are quantized to 1e-9 degrees Celsius and d(alpha)/dt
  to 1e-12 per minute under the locked fixture recipe.
- Scientific boundary: the equation-correct Friedman result does not exactly
  reproduce the publication's S5/Table 4 result. The discrepancy is retained;
  the publication table is not used as ground truth.

## Paper063 XPS beta-Tp example

- Work: *Pyrolysis Kinetic Properties of Thermal Insulation Waste Extruded
  Polystyrene by Multiple Thermal Analysis Methods*.
- Source: <https://doi.org/10.3390/ma13245595>
- Article license: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- Included material: five heating-rate/peak-temperature pairs transcribed from
  Figure 1 for the primary XPS pyrolysis peak.
- Changes: the printed values were placed in a machine-readable CSV without
  changing their reported 1 K resolution.
- Required disclosure: **there is no separately deposited raw dataset or
  separate dataset license for this example.** It is article-derived content
  under the article's CC BY 4.0 license, not an instrument export.
- Scientific boundary: it validates only the separate beta-Tp Kissinger path.
  It cannot validate alpha-dependent methods or establish a universal
  one-step mechanism.

## Production JavaScript dependencies

The following table is generated from the production closure in
`package-lock.json`. It covers 33 locked production package
installations (6 direct and
27 transitive). Development-only
packages are intentionally excluded. The accompanying CycloneDX record is
[SBOM.production.cdx.json](SBOM.production.cdx.json).

| Package | Version | Relationship | Declared license | Repository | Bundled license text |
| --- | --- | --- | --- | --- | --- |
| @babel/runtime | 7.29.7 | transitive | MIT | <https://github.com/babel/babel> | [LICENSE](licenses/babel__runtime@7.29.7/LICENSE) |
| @types/pako | 2.0.4 | transitive | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> | [LICENSE](licenses/types__pako@2.0.4/LICENSE) |
| @types/raf | 3.4.3 | transitive, optional | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> | [LICENSE](licenses/types__raf@3.4.3/LICENSE) |
| @types/trusted-types | 2.0.7 | transitive, optional | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> | [LICENSE](licenses/types__trusted-types@2.0.7/LICENSE) |
| base64-arraybuffer | 1.0.2 | transitive, optional | MIT | <https://github.com/niklasvh/base64-arraybuffer> | [LICENSE](licenses/base64-arraybuffer@1.0.2/LICENSE) |
| canvg | 3.0.11 | transitive, optional | MIT | <https://github.com/canvg/canvg> | [LICENSE](licenses/canvg@3.0.11/LICENSE) |
| core-js | 3.50.0 | transitive, optional | MIT | <https://github.com/zloirock/core-js> | [LICENSE](licenses/core-js@3.50.0/LICENSE) |
| css-line-break | 2.1.0 | transitive, optional | MIT | <https://github.com/niklasvh/css-line-break> | [LICENSE](licenses/css-line-break@2.1.0/LICENSE) |
| dompurify | 3.4.15 | transitive, optional, npm override 3.4.15 | (MPL-2.0 OR Apache-2.0) | <https://github.com/cure53/DOMPurify> | [LICENSE](licenses/dompurify@3.4.15/LICENSE)<br>[LICENSE-MPL](licenses/dompurify@3.4.15/LICENSE-MPL) |
| fast-png | 6.4.0 | transitive | MIT | <https://github.com/image-js/fast-png> | [LICENSE](licenses/fast-png@6.4.0/LICENSE) |
| fflate | 0.8.3 | direct | MIT | <https://github.com/101arrowz/fflate> | [LICENSE](licenses/fflate@0.8.3/LICENSE) |
| graceful-fs | 4.2.11 | transitive | ISC | <https://github.com/isaacs/node-graceful-fs> | [LICENSE](licenses/graceful-fs@4.2.11/LICENSE) |
| html2canvas | 1.4.1 | transitive, optional | MIT | <https://github.com/niklasvh/html2canvas> | [LICENSE](licenses/html2canvas@1.4.1/LICENSE) |
| iobuffer | 5.4.0 | transitive | MIT | <https://github.com/image-js/iobuffer> | [LICENSE](licenses/iobuffer@5.4.0/LICENSE) |
| jspdf | 4.2.1 | direct | MIT | <https://github.com/parallax/jsPDF> | [LICENSE](licenses/jspdf@4.2.1/LICENSE) |
| node-int64 | 0.4.0 | transitive | MIT | <https://github.com/broofa/node-int64> | [LICENSE](licenses/node-int64@0.4.0/LICENSE) |
| pako | 2.2.0 | transitive | (MIT AND Zlib) | <nodeca/pako> | [LICENSE](licenses/pako@2.2.0/LICENSE) |
| papaparse | 5.5.4 | direct | MIT | <https://github.com/mholt/PapaParse> | [LICENSE](licenses/papaparse@5.5.4/LICENSE) |
| performance-now | 2.1.0 | transitive, optional | MIT | <https://github.com/braveg1rl/performance-now> | [license.txt](licenses/performance-now@2.1.0/license.txt) |
| raf | 3.4.1 | transitive, optional | MIT | <https://github.com/chrisdickinson/raf> | [LICENSE](licenses/raf@3.4.1/LICENSE) |
| react | 19.2.7 | direct | MIT | <https://github.com/facebook/react> | [LICENSE](licenses/react@19.2.7/LICENSE) |
| react-dom | 19.2.7 | direct | MIT | <https://github.com/facebook/react> | [LICENSE](licenses/react-dom@19.2.7/LICENSE) |
| read-excel-file | 9.3.10 | direct | MIT | <https://gitlab.com/catamphetamine/read-excel-file> | [LICENSE](licenses/read-excel-file@9.3.10/LICENSE) |
| regenerator-runtime | 0.13.11 | transitive, optional | MIT | <https://github.com/facebook/regenerator/tree/main/packages/runtime> | [LICENSE](licenses/regenerator-runtime@0.13.11/LICENSE) |
| rgbcolor | 1.0.1 | transitive, optional | MIT OR SEE LICENSE IN FEEL-FREE.md | <https://github.com/yetzt/node-rgbcolor> | [FEEL-FREE.md](licenses/rgbcolor@1.0.1/FEEL-FREE.md)<br>[LICENSE.md](licenses/rgbcolor@1.0.1/LICENSE.md) |
| saxen | 11.1.1 | transitive | MIT | <https://github.com/nikku/saxen> | [LICENSE](licenses/saxen@11.1.1/LICENSE) |
| scheduler | 0.27.0 | transitive | MIT | <https://github.com/facebook/react> | [LICENSE](licenses/scheduler@0.27.0/LICENSE) |
| stackblur-canvas | 2.7.0 | transitive, optional | MIT | <https://github.com/flozz/StackBlur> | [LICENSE-MIT.txt](licenses/stackblur-canvas@2.7.0/LICENSE-MIT.txt) |
| svg-pathdata | 6.0.3 | transitive, optional | MIT | <https://github.com/nfroidure/svg-pathdata> | [LICENSE](licenses/svg-pathdata@6.0.3/LICENSE) |
| text-segmentation | 1.0.3 | transitive, optional | MIT | <https://github.com/niklasvh/text-segmentation> | [LICENSE](licenses/text-segmentation@1.0.3/LICENSE) |
| unzipper-esm | 0.13.3 | transitive | MIT | <https://github.com/catamphetamine/node-unzipper> | [LICENSE](licenses/unzipper-esm@0.13.3/LICENSE) |
| utrie | 1.0.2 | transitive, optional | MIT | <https://github.com/niklasvh/utrie> | [LICENSE](licenses/utrie@1.0.2/LICENSE) |
| worker-f | 0.1.20 | transitive | MIT | <https://gitlab.com/catamphetamine/worker-f> | [LICENSE](licenses/worker-f@0.1.20/LICENSE) |

### Unresolved dependency metadata

None in the locked production dependency set.

The bundled license texts are copied byte-for-byte from the installed packages
that correspond to the lockfile snapshot. Their hashes and source paths are
recorded in the audit inventory. Package copyright and license terms remain
with their respective authors and rightsholders.

No dataset, article, dependency author, or rightsholder endorses Activation
Energy Studio.
