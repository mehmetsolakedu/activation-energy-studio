# Chilean Oak Publication and Open Raw-Data Audit

Date: 2026-07-29  
Scope: Fernández-Andrade et al., *Industrial Crops & Products* 232 (2025)
121296; DOI `10.1016/j.indcrop.2025.121296`.

## Final decision

The dataset is genuine, openly licensed, and suitable for end-to-end software
testing. However, not every value in Table 3 of the publication can be treated
as a scientifically valid **hard oracle**.

- Raw-CSV integrity, sample identities, four heating rates, and the standard
  FWO, KAS, and Friedman equations are valid hard test inputs.
- Results recalculated with explicitly defined standard equations constitute a
  deterministic test oracle when the same preprocessing contract is used.
- The published FWO means are close to the independent raw-data reconstruction
  across five samples (MAE `1.008 kJ mol⁻¹`). They are useful as publication
  comparisons, but not as exact-equality oracles.
- The published KAS and Friedman means must be quarantined. Both contain a
  strong, method-consistent forensic signal that the FWO-only Doyle coefficient
  `1.052` may have been applied a second time.
- None of the `±` values is a hard oracle because the publication does not
  define the deviation statistic, the number of alpha points, or the filtering
  rule.
- The Torr3 Friedman deviation is internally inconsistent: Table 3 reports
  `±84`, whereas the main text reports `±87`.

The correct test policy is therefore not to reproduce the publication at any
cost. The standard equations and units must be verified first; any difference
from the publication is then reported as an explained external comparison.

## Primary sources and visual verification

- [Publisher record and DOI](https://www.sciencedirect.com/science/article/pii/S0926669025008428)
- [Author-uploaded 18-page full-text PDF](https://www.researchgate.net/profile/Serguei-Alejandro-Martin-2/publication/392531022_Assessing_the_contribution_of_torrefaction_during_Chilean_Oak_pyrolysis_A_kineticthermodynamic_study_and_evolved_gases_compositional_analysis/links/6849af3f43aad60b4c1642a6/Assessing-the-contribution-of-torrefaction-during-Chilean-Oak-pyrolysis-A-kinetic-thermodynamic-study-and-evolved-gases-compositional-analysis.pdf?download=1&source=post_page)
- [Mendeley Data v2, DOI 10.17632/gkhjh4v8tg.2](https://data.mendeley.com/datasets/gkhjh4v8tg/2)

Printed page 3 of the full-text PDF (TGA conditions and Equations 7–11) and
printed page 8 (Figure 5, conversion range, main-text result, and Table 3) were
rendered and inspected manually. The caption of Figure 6 on printed page 9 also
confirms that three isoconversional methods were used for every sample. A
persistent PNG copy could not be retained because of remote-server rate
limiting; the direct PDF link and printed page numbers above form the audit
trail.

## Experimental and data contract

According to the methods section of the PDF:

- Sample: dried, untreated Chilean Oak (*Nothofagus obliqua*).
- Torr1: `523 K, 30 min`.
- Torr2: `573 K, 15 min`.
- Torr3: `573 K, 30 min`.
- Torr4: `523 K, 15 min`.
- Instrument: PerkinElmer STA 6000.
- Sample mass: approximately `10–15 mg`, alumina crucible.
- Main TGA ramp: `323–1073 K`.
- Heating rates: `5, 10, 20, 40 K min⁻¹`.
- Reported N₂ flow: `20 mL min⁻¹`.
- Whole-biomass isoconversional range: `α=0.01–0.85`.
- The later pseudo-component/deconvolution section uses `α=0.01–0.98` and
  must not be conflated with the Table 3 oracle.

Mendeley v2 contains four TGA CSV files for each of the five samples, for a
total of 20 files. The SHA-256 values of the downloaded files match the
Mendeley API records exactly; details are in `source_file_manifest.csv`.

## Equations used in the publication

Standardized forms of Equations 8, 10, and 11 are:

Friedman:

`ln[(dα/dt)α] = ln[Aα f(α)] − Eα/(R Tα)`

Flynn–Wall–Ozawa:

`ln(βi) = ln[Aα Eα/(R g(α))] − 5.331 − 1.052 Eα/(R Tα,i)`

Kissinger–Akahira–Sunose:

`ln[βi/T²α,i] = ln[Aα R/(Eα g(α))] − Eα/(R Tα,i)`

The critical distinction is that `1.052` is used only when extracting energy
from the FWO slope. It does not occur in the KAS or Friedman equations.

After giving Ea in `kJ mol⁻¹`, the article labels `R=8.314 kJ mol⁻¹ K⁻¹`.
That unit label is dimensionally incorrect. Consistent alternatives are
`R=8.314 J mol⁻¹ K⁻¹` followed by division of the result by 1000, or direct
use of `R=0.008314 kJ mol⁻¹ K⁻¹`. The magnitude of the published results also
shows that the value 8.314 was used in joules.

## Manually verified publication values from Table 3

The complete transcription is in `publication_table3_targets.csv`.

| Sample | FWO Ea / adjusted r² | KAS Ea / adjusted r² | Friedman Ea / adjusted r² |
|---|---:|---:|---:|
| Oak | 176.9 ±7 / 0.9992 | 167.3 ±7 / 0.9991 | 168.2 ±9 / 0.9982 |
| Torr4 | 207.5 ±16 / 0.9857 | 197.9 ±16 / 0.9844 | 192.9 ±22 / 0.9727 |
| Torr1 | 194.5 ±12 / 0.9927 | 184.9 ±12 / 0.9919 | 189.2 ±24 / 0.9940 |
| Torr2 | 214.8 ±31 / 0.9831 | 205.0 ±31 / 0.9816 | 213.4 ±55 / 0.9813 |
| Torr3 | 221.2 ±64 / 0.9655 | 211.3 ±64 / 0.9623 | 213.7 ±84 / 0.9626 |

The main text rounds the Friedman means in Oak, Torr1, Torr2, Torr3, Torr4
order to `168±9, 189±24, 213±55, 214±87, 193±22 kJ mol⁻¹`. The Torr3 mean
is consistent with Table 3 after rounding (`213.7 → 214`), but its deviation
is reported as `87` instead of `84`.

The publication does not define the `±` symbol. It does not state whether this
is the population standard deviation across alpha, the sample standard
deviation, another deviation statistic, or which alpha increment was used for
the mean. The table caption states only “average Activation Energy.”

## Independent raw-data reconstruction

The open and reproducible contract used in this audit is:

1. `α=0.01, 0.02, …, 0.85` (85 points).
2. First upward crossing of the target alpha in each heating-rate curve,
   followed by linear interpolation.
3. Temperature taken directly from `Temperature (K)`; `1/T` recalculated.
4. Ordinary least squares across the four rates.
5. `R=8.314462618 J mol⁻¹ K⁻¹`; output in `kJ mol⁻¹`.
6. Doyle `1.052` for FWO only; no such coefficient for standard KAS or
   Friedman.
7. Dataset-supplied `dα/dt (min⁻¹)` for Friedman.
8. No additional smoothing.
9. Adjusted `r²`: `n=4` and one explanatory variable for each alpha regression.

All results are in `independent_standard_reproduction.csv`.

| Sample | Mean FWO | Mean KAS | Mean Friedman |
|---|---:|---:|---:|
| Oak | 176.450 | 175.589 | 176.253 |
| Torr4 | 207.473 | 208.175 | 202.625 |
| Torr1 | 192.685 | 192.591 | 196.646 |
| Torr2 | 212.898 | 213.695 | 219.906 |
| Torr3 | 220.355 | 221.402 | 222.416 |

Mean absolute errors between the standard reconstruction and publication
means are:

- FWO: `1.008 kJ mol⁻¹`
- KAS: `9.010 kJ mol⁻¹`
- Friedman: `8.089 kJ mol⁻¹`

The close FWO agreement supports data matching and the basic interpolation
contract. The approximately five-percent, same-direction reductions reported
for KAS and Friedman are difficult to explain through preprocessing alone and
instead indicate a shared scale factor. The approximate Oak per-alpha range of
`156–186 kJ mol⁻¹` reported by the article is consistent with both standard FWO
(`155.3–185.4`) and standard KAS (`155.0–184.6`) in this audit. This supports
the conclusion that the raw temperature shifts and standard integral methods
use the correct data family.

## Forensic test of the `1.052` coefficient

Multiplying the published KAS values back by `1.052` brings them within a mean
absolute `1.040 kJ mol⁻¹` of the standard raw-data KAS calculation across all
five samples. Applying the same reverse operation to the published Friedman
values brings them within a mean absolute `2.076 kJ mol⁻¹` of the standard
Friedman calculation. Details are in `factor_1_052_forensic_test.csv`.

For Oak, the `α=0.05, 0.10, …, 0.85` grid provides a particularly strong
control:

- standard FWO: `176.908` (publication `176.9`);
- standard KAS: `176.015`; `176.015/1.052 = 167.315` (publication `167.3`);
- standard Friedman: `177.419`; `177.419/1.052 = 168.649`
  (publication `168.2`).

Incorrect use of Celsius in the KAS `T²` term is another explanation that
brings the values closer (MAE approximately `1.033 kJ mol⁻¹` across the five
samples), but it does not explain the Friedman discrepancy. The FWO-specific
`1.052` coefficient explains both the KAS and Friedman differences
simultaneously and is therefore the more parsimonious and method-consistent
signal.

Without the original worksheet or author confirmation, this finding is not a
proven author error. The precise conclusion is: **the publication values are
highly consistent with an additional application of the FWO 1.052 coefficient
to KAS and possibly Friedman results.**

There is a cautionary counter-signal for Friedman. The article states that the
Torr3 energy in Figure 6D exceeds `600 kJ mol⁻¹`. The standard Friedman series
in this audit reaches `608.6 kJ mol⁻¹` near `α=0.85`; dividing the same series
by `1.052` reduces the peak to approximately `578.6 kJ mol⁻¹`. The authors'
derivative or smoothing procedure may have produced a higher peak, or the
error may be limited to mean-value cells in Table 3. The `1.052` signal is
therefore very strong for KAS and strong but less conclusive for Friedman.

An additional concern is that every KAS `±` value in Table 3 is identical to
its FWO counterpart (`7, 16, 12, 31, 64`). Although the independent standard
KAS and FWO curves have similar dispersion, exact repetition of all rounded
values, especially the largest ones, cannot be treated as a reliable oracle
without a methodological explanation or source worksheet.

## Raw-data and metadata quality warnings

1. The CSV column `1/T (K-1)` actually contains `1000/T`. At `T=326.21 K`,
   for example, the value is `3.0655`; true `1/T` is `0.0030655 K⁻¹`. The
   column label and data-dictionary description are mis-scaled by approximately
   `1000×`. Software must ignore this column and recalculate the reciprocal
   from Kelvin temperature.
2. `metadata_files.csv` gives TGA `heating_rate` values of `0.083333333,
   0.166666667, 0.333333333, 0.666666667`. These are the K s⁻¹ equivalents of
   5/10/20/40 K min⁻¹, but the column unit is undefined. The first row and
   filename of each raw TGA file explicitly use K min⁻¹ and must prevail.
3. The same metadata reports `gas_flow=40` for TGA rows, whereas the methods
   page states `20 mL min⁻¹` for N₂. This does not affect the Ea slope, but it
   remains an unresolved source conflict in experimental provenance.
4. The data dictionary says “state numerical differentiation method” for
   `dα/dT` and `dα/dt`, but does not specify the derivative or smoothing
   algorithm. This uncertainty is material to the failure to reproduce
   Friedman results exactly.
5. The conversion column lies within `[0,1]` in most files, but reaches
   `1.000008` in Torr4-10. The derivative contains zero or negative noise
   outside the reaction region. Logarithmic Friedman regression must enforce
   a positive-rate check and a valid alpha window.
6. The 40 K min⁻¹ files begin near 394 K, while the other rates begin near
   326 K. All `α=0.01–0.85` targets are still present; tests must not assume an
   identical starting temperature across heating rates.

## Oracle policy for test layers

### Hard pass

- Names, sizes, and SHA-256 values of the 20 raw TGA files.
- Five samples × four heating rates.
- Parsing of raw `Temperature (K)`, mass, conversion, and derivative columns.
- Recalculated `1/T` from Kelvin.
- Standard-equation contract: `1.052` in FWO, absent from KAS and Friedman.
- Values in `independent_standard_reproduction.csv` when the explicit
  preprocessing contract above is selected exactly.

### Soft publication comparison

- Table 3 FWO means may be used for a methodological proximity/warning
  threshold, not exact equality.
- The publication's sample ordering, conversion range, and general claim that
  mean adjusted r² exceeds `0.9`.

### Quarantined; not an oracle

- Treating Table 3 KAS and Friedman means as mandatory standard-correct values.
- Every `±` value and every exact mean adjusted-r² value.
- Torr3 Friedman `±84/±87`.
- Metadata `1/T`, undefined `heating_rate` unit, and `gas_flow`.

## Only definitive route to close the remaining uncertainties

The following working details must be obtained from the authors or additional
supporting material:

- exact list of alpha points used;
- alpha–temperature interpolation method for each rate;
- derivative and smoothing algorithms and parameters;
- whether invalid or poorly fitted points were filtered;
- definition of `±`;
- per-alpha FWO/KAS/Friedman values and regression tables;
- actual worksheet-cell expression used for KAS/Friedman energy.

Until that information is available, software that applies the standard
equations correctly must not be marked as failed solely because it differs
from a publication target. The publication comparison should be classified as
`MANUAL_REVIEW_EXPECTED`.
