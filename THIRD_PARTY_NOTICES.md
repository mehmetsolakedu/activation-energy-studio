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

## JavaScript dependencies

The offline application incorporates packages including React, React DOM,
jsPDF, Papa Parse, and read-excel-file. Their copyright and license notices
remain with their respective authors. Exact versions are locked in
`package-lock.json`; downstream distributors must retain any notices required
by those packages.

No dataset or article author endorses Activation Energy Studio.
