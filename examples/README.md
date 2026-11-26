# Bundled example datasets

This directory contains clean tabular examples embedded in Activation Energy Studio for local workflow demonstration and end-to-end verification:

- `rhubarb_supplied_dalpha_dt.csv` — deterministic supplied-derivative table derived from the official PLOS ONE S2 rhubarb combustion TG/DTG workbook (`pone.0173946.s002.xlsx`, DOI `10.1371/journal.pone.0173946.s002`, CC BY 4.0) across heating rates 5, 10, and 20 K min⁻¹ (`alpha = 0.05–0.80`).
- `xps_kissinger_peaks.csv` — five-rate peak-temperature (`beta–Tp`) table transcribed at printed 1 K resolution from Jiang et al. (2020, DOI `10.3390/ma13245595`, CC BY 4.0) for testing the separate Kissinger peak pathway.
- `synthetic_kas_150.csv` — exact synthetic reference table constructed so that KAS recovers 150 kJ mol⁻¹ across `alpha = 0.10–0.90` at 5, 10, 20, and 40 K min⁻¹ for verifying the import-to-report pipeline.
