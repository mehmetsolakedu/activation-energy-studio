# MVP Kabul Kriterleri ve Tamamlanma Kapıları

**Durum:** Normatif v1.0  
**Tarih:** 2026-07-18  
**Üst hedef:** [`../ULTIMATE_GOAL.md`](../ULTIMATE_GOAL.md)  
**Misyon:** [`00_MISSION_LOCK.md`](00_MISSION_LOCK.md)  
**Bilimsel şartname:** [`01_SCIENTIFIC_SPEC_V1.md`](01_SCIENTIFIC_SPEC_V1.md)

## 1. Kabul kuralı

MVP ancak bu belgedeki bütün `P0` kapıları için güncel, yeniden çalıştırılabilir kanıt mevcutsa tamamlanmış sayılır. Bir testin varlığı, kapsadığı gerekliliğin dışında kanıt değildir.

Her kapı şu durumlardan biriyle kaydedilir:

- `PASS`: belirtilen kanıt mevcut ve kriteri doğrudan karşılıyor;
- `FAIL`: kanıt kriterle çelişiyor;
- `MISSING`: gerekli kanıt yok;
- `WEAK`: dolaylı veya yetersiz kanıt;
- `N/A`: yalnız bu belgede açıkça izin verilen gerekçeyle.

`MISSING`, `WEAK` veya `FAIL` bir `P0` kapısı varken ürün “doğrulanmış MVP” değildir.

## 2. Tamamlanma kanıt paketi

Release candidate şu makine-okunur/insan-okunur artefaktları üretmelidir:

- test komutu ve tam test özeti;
- fixture manifesti, lisans/kaynak, SHA-256 ve beklenen değerler;
- formül bazlı numerical validation report;
- refusal/warning scenario matrix sonucu;
- gerçek ham-veri cross-validation raporu;
- PDF/CSV/JSON consistency raporu;
- Windows, macOS ve Linux offline smoke-test raporu;
- usability walkthrough kaydı;
- bilinen sınırlar ve açık sorun listesi;
- release binary/bundle hash’leri.

Artefakt dosya adları uygulama içinde farklı olabilir; release checklist hepsinin exact path’ini ve hash’ini göstermelidir.

## 3. Gereklilik–kapı izleme matrisi

| Üst hedef gerekliliği | Kanıt kapıları |
|---|---|
| birkaç tıkla CSV/XLSX yükleme | `AC-IO-*`, `AC-UX-*` |
| veri uygunluk motoru | `AC-EL-*`, `AC-RF-*` |
| FWO/KAS/Starink/Friedman | `AC-NUM-01..08` |
| ayrı Kissinger | `AC-NUM-09`, `AC-EL-08`, `AC-RF-12` |
| birim/α/aşama/kalite | `AC-IO-05`, `AC-ALPHA-*`, `AC-EL-*` |
| güvensiz durumda reddetme | `AC-RF-*` |
| Ea(α), tanı ve belirsizlik | `AC-REG-*`, `AC-REP-*` |
| PDF/CSV/JSON yeniden üretilebilir rapor | `AC-REP-*` |
| sentetik/elle/ham-gerçek doğrulama | `AC-VAL-*` |
| Windows/macOS/Linux offline | `AC-PLAT-*` |
| 231 kaynak PDF kayıtlı yerel kanıt izi | `AC-SCI-*` |

## 4. P0 kapıları

### 4.1 Misyon ve bilimsel yönetişim

#### AC-SCI-01 — Normatif belge seti

**Kriter:** `00_MISSION_LOCK.md`, `01_SCIENTIFIC_SPEC_V1.md` ve `02_ACCEPTANCE_CRITERIA.md` aynı release’te bulunur; birbirine ve parent `../ULTIMATE_GOAL.md` dosyasına bağlanır.  
**Kanıt:** link checker + release manifest.  
**P0:** Evet.

#### AC-SCI-02 — Kanıt izi

**Kriter:** Beş yöntem için en az bir implemented method-matrix satırı ve bir rendered/quality visual veya ready/extraction note yolu raporlanır. Citation-only satır uygulanmış kanıt yerine kullanılamaz.  
**Kanıt:** otomatik traceability audit ve elle spot check.  
**P0:** Evet.

#### AC-SCI-03 — Claim boundary

**Kriter:** UI, PDF, CSV ve JSON sonuçları “apparent/görünür” bağlamını ve sample–process/stage–atmosphere–method etiketini taşır. “Malzemenin gerçek/tek aktivasyon enerjisi” veya tek-aşama mekanizma iddiası bulunmaz.  
**Kanıt:** snapshot/string audit + bilimsel reviewer sign-off.  
**P0:** Evet.

#### AC-SCI-04 — `A` sınırı

**Kriter:** V1 core sonuçlarında interceptten mekanizmasız `A/ln A` nihai parametresi üretilmez; intercept yalnız diagnostic olarak etiketlenir.  
**Kanıt:** schema/UI/PDF audit.  
**P0:** Evet.

### 4.2 Dosya içe alma ve normalize veri

#### AC-IO-01 — CSV/TSV/XLSX

**Kriter:** Aynı canonical fixture `.csv`, `.tsv` ve tek-sheet `.xlsx` olarak içe alındığında normalize numeric kayıtlar toleranssız eşit olur.  
**Kanıt:** parameterized ingestion test.  
**P0:** Evet.

#### AC-IO-02 — Multi-sheet seçimi

**Kriter:** Birden fazla sheet içeren XLSX, sheet seçilmeden `needs_mapping` döndürür ve `records=[]`; seçim sonrası yalnız seçilen sheet’in provenance’lı kayıtlarını üretir.  
**Kanıt:** fixture ve unit/integration test.  
**P0:** Evet.

#### AC-IO-03 — Tablo türü belirsizliği

**Kriter:** Yalnız temperature+beta içeren ve peak header taşımayan tablo, explicit `tableKind` olmadan işlenmez. `curve`/`beta-tp` seçiminin sonucu deterministiktir.  
**Kanıt:** ambiguity fixture.  
**P0:** Evet.

#### AC-IO-04 — Required mapping

**Kriter:** Curve tablosu temperature+beta ve en az alpha/mass/massPercent olmadan `ready` olamaz. Duplicate alias, bare unit veya mixed-decimal ambiguity `needs_mapping` üretir; partial record üretmez.  
**Kanıt:** negative fixture matrix.  
**P0:** Evet.

#### AC-IO-05 — Birim dönüşümü

**Kriter:** K↔°C, s↔min, mg↔g, fraction↔%, K/s↔K/min ve °C/s↔K/min çiftleri canonical fixture üzerinde aynı normalized değerleri verir. Mutlak formül sıcaklığı K’dir.  
**Tolerans:** floating conversion için `≤1×10⁻¹²` relative veya machine precision.  
**Kanıt:** unit table test.  
**P0:** Evet.

#### AC-IO-06 — Provenance

**Kriter:** Her normalized row `fileName`, varsa `sheetName`, one-based `sourceRow`, `runId`, column mapping ve source unit içerir. Ara `TAlphaBetaRow` ve `BetaTpRow` provenance kaybetmez.  
**Kanıt:** schema assertion + round-trip test.  
**P0:** Evet.

#### AC-IO-07 — No partial calculation

**Kriter:** Her unresolved `needs_mapping` veya error diagnostic durumunda normalized records, processed tables ve method results boş kalır.  
**Kanıt:** end-to-end negative tests.  
**P0:** Evet.

### 4.3 `α`, aşama ve interpolasyon

#### AC-ALPHA-01 — Kütleden `α`

**Kriter:** Bilinen `m0`, `mf` ve ara mass değerleri için `α=(m0−m)/(m0−mf)` elle hesapla eşleşir; mass ve mass-percent aynı sonucu verir.  
**Tolerans:** `|Δα|≤1×10⁻¹²`.  
**Kanıt:** unit test + hand worksheet.  
**P0:** Evet.

#### AC-ALPHA-02 — Geçersiz anchor

**Kriter:** `m0=mf`, non-finite anchor, ters/kararsız aşama veya bağlamla uyumsuz anchor hard refusal üretir; clipping/imputation yapılmaz.  
**Kanıt:** negative fixture set.  
**P0:** Evet.

#### AC-ALPHA-03 — Monotonicity

**Kriter:** Azalan sıcaklık, non-monotone `α`, silent sort gerektiren run veya ambiguous plateau tanımlı refusal üretir; ham sıra korunur.  
**Kanıt:** permuted/noisy fixtures.  
**P0:** Evet.

#### AC-ALPHA-04 — Default grid

**Kriter:** Override yoksa hedefler tam `0.10..0.90`, step `0.10`’dur. Override yalnız finite, unique, `0<α<1` değerleri kabul eder.  
**Kanıt:** API/core unit tests.  
**P0:** Evet.

#### AC-ALPHA-05 — Common range ve interpolation

**Kriter:** Her target bütün run’ların ortak `α` kesişiminde olmalıdır. Bilinen piecewise-linear fixture’da `Tα` analitik değerle eşleşir; ortak aralık dışına extrapolation yapılmaz.  
**Tolerans:** `|ΔT|≤1×10⁻⁹ K`.  
**Kanıt:** interpolation golden tests.  
**P0:** Evet.

#### AC-ALPHA-06 — Aşama homojenliği

**Kriter:** Çelişkili sample/atmosphere/stage metadata tek analizde hard refusal üretir. Çoklu/örtüşen DTG piki otomatik olarak tek aşama sayılmaz.  
**Kanıt:** context/stage fixture matrix.  
**P0:** Evet.

### 4.4 Yöntem uygunluğu ve refusal

#### AC-EL-01 — Minimum bağımsız hız

**Kriter:** Üçten az distinct pozitif `β` bütün beş yöntem için hard refusal’dır. Replicate aynı hız farklı hız sayılmaz. Aynı `β` tekrarları `β`, `Tα`/`Tp` ve Friedman için `dα/dt` fiziksel büyüklükleri üzerinde aritmetik ortalanıp OLS'ye tek eşit ağırlıklı nokta verir; ham koşular izlenebilir kalır ve `nβ`/`df` artmaz. Tam üç distinct hız `LIMITED_HEATING_RATES` uyarısı üretir.  
**Kanıt:** 2/3/4-rate parameterized tests + `replicate-regression-contract.test.ts`.  
**P0:** Evet.

#### AC-EL-02 — Hız aralığı

**Kriter:** Duplicate beta `DUPLICATE_HEATING_RATE`; `βmax/βmin<2` `NARROW_HEATING_RATE_SPAN` üretir. Kissinger’da `<5` hız veya ratio `<5`, `KISSINGER_COMPLEXITY_UNDERPOWERED` üretir.  
**Kanıt:** warning matrix.  
**P0:** Evet.

#### AC-EL-03 — Heating direction/program

**Kriter:** `β≤0` `COOLING_UNSUPPORTED`; within-run max relative beta deviation default `%2` üstünde `NONLINEAR_HEATING_UNSUPPORTED` üretir. Hiçbir method result oluşmaz.  
**Kanıt:** cooling/nonlinear fixtures.  
**P0:** Evet.

#### AC-EL-04 — Global context refusal

**Kriter:** Unknown unit, inconsistent context, ambiguous stage, no common alpha veya non-finite critical data ilgili analysis’i durdurur ve exact reason code üretir.  
**Kanıt:** refusal table snapshot.  
**P0:** Evet.

#### AC-EL-05 — Integral isoconversional eligibility

**Kriter:** FWO/KAS/Starink her target alpha için en az üç distinct hızdan finite `Tα` olmadıkça sonuç üretmez. Başka alpha’ların durumu raporda ayrı kalır.  
**Kanıt:** partial-alpha coverage fixture.  
**P0:** Evet.

#### AC-EL-06 — Friedman eligibility

**Kriter:** Sağlanmış `dα/dt`, time finite-difference ve `β dα/dT` yollarının her biri test edilir. Sayısal yollar `NUMERICAL_DERIVATIVE` üretir. Sağlanmış türev serisi kısmen eksik veya nonfinite ise `INVALID_PROVIDED_DERIVATIVE` ile hard refusal oluşur; sayısal fallback yapılmaz. Nonpositive finite hız log’a sokulmaz; kullanılabilir distinct hız `<3` ise o alpha reddedilir.  
**Kanıt:** derivative fixture trio + negative derivative fixture + `provided-derivative-failclosed.test.ts`.  
**P0:** Evet.

#### AC-EL-07 — No hidden smoothing

**Kriter:** V1 core, Friedman veya diğer yöntemlerde smoothing yapmaz. Aynı input aynı derivative/output’u bit-for-bit veya tanımlı float toleransında üretir; rapor derivative source’u taşır.  
**Kanıt:** source/config audit + deterministic test.  
**P0:** Evet.

#### AC-EL-08 — Kissinger eligibility

**Kriter:** Aynı fiziksel peak’e ait en az üç distinct `β–Tp` çifti gerekir. Ambiguous/overlapping peak veya missing Tp hard refusal’dır; peak result isoconversional result koleksiyonuna karışmaz.  
**Kanıt:** beta-Tp integration tests.  
**P0:** Evet.

### 4.5 Formül ve sayısal doğruluk

Tüm noise-free formül testlerinde `R=8.31446261815324 J mol⁻¹ K⁻¹`, `x=1/T[K]` ve canonical rate units kullanılır.

#### AC-NUM-01 — FWO natural-log formu

**Kriter:** `y=ln β`, `E=−Rb1/1.052`; formula metadata `−5.331` ve `−1.052E/(RT)` taşır. Noise-free known-slope fixture doğru `E` verir.  
**Tolerans:** `max(1×10⁻⁶ kJ mol⁻¹, 1×10⁻⁸ relative)`.  
**P0:** Evet.

#### AC-NUM-02 — FWO log-base trap

**Kriter:** Doğal-log `1.052` ile exact base-10 `1.052/ln(10)` referans hesapları aynı fixture’da AC-NUM-01 toleransında eşleşir. Yayın-yuvarlatmalı `0.4567` ayrı olarak `≤5×10⁻⁴` bağıl katsayı/E farkı içinde doğrulanır; uygulama `ln` ile `0.4567`yi birleştiremez.  
**Kanıt:** explicit regression test.  
**P0:** Evet.

#### AC-NUM-03 — KAS

**Kriter:** `y=ln(β/Tα²)`, `E=−Rb1`. Noise-free fixture expected `E`yi AC-NUM-01 toleransında verir.  
**P0:** Evet.

#### AC-NUM-04 — Starink

**Kriter:** `y=ln(β/Tα^1.92)`, `E=−Rb1/1.0008`. Üs ve katsayı yer değiştirme regression test’iyle korunur.  
**Tolerans:** AC-NUM-01 ile aynı.  
**P0:** Evet.

#### AC-NUM-05 — Friedman

**Kriter:** `y=ln(dα/dt)`, `E=−Rb1`. Sağlanmış derivative fixture known `E`yi AC-NUM-01 toleransında verir.  
**P0:** Evet.

#### AC-NUM-06 — Friedman derivative equivalence

**Kriter:** Analitik linear-α fixture’da supplied derivative, time finite difference ve `βdα/dT` yolları beklenen türevi ve `E`yi tanımlı discretization toleransında verir. Uç nokta one-sided davranışı golden değerle sabittir.  
**Tolerans:** fixture manifestinde gerekçeli; noise-free linear case için machine precision.  
**P0:** Evet.

#### AC-NUM-07 — Method independence

**Kriter:** Aynı `Tα–β` fixture üzerinde FWO/KAS/Starink kendi `y` dönüşümleriyle ayrı sonuç/diagnostics üretir; bir yöntemin sonucu diğerine alias değildir.  
**Kanıt:** object identity + numeric snapshot.  
**P0:** Evet.

#### AC-NUM-08 — Kelvin ve `1000/T` trap

**Kriter:** °C girişin K’ye dönüşümü ile doğrudan K girişi aynı `E`yi verir. Plot için `1000/T` seçimi calculation `x=1/T` sonucunu değiştirmez.  
**Kanıt:** paired fixture test.  
**P0:** Evet.

#### AC-NUM-09 — Kissinger

**Kriter:** `y=ln(β/Tp²)`, `x=1/Tp`, `E=−Rb1`; known-slope beta-Tp fixture expected peak `Ea`yı AC-NUM-01 toleransında verir. `resultType=peak`, `alpha=null` olmalıdır.  
**P0:** Evet.

#### AC-NUM-10 — Nonpositive Ea

**Kriter:** Pozitif slope’dan doğan `E≤0` finite ise sessizce silinmez; `NONPOSITIVE_APPARENT_EA` uyarısıyla tutulur. Kimyasal TGA için otomatik mekanizma açıklaması üretilmez.  
**Kanıt:** positive-slope fixture.  
**P0:** Evet.

### 4.6 Regresyon ve belirsizlik

#### AC-REG-01 — OLS referans eşleşmesi

**Kriter:** `b0`, `b1`, residuals, SSE, `R²`, residual SE ve slope SE bağımsız güvenilir implementation/hand calculation ile eşleşir.  
**Tolerans:** `1×10⁻¹⁰ relative` veya fixture’ın numerik conditioning gerekçesi.  
**P0:** Evet.

#### AC-REG-02 — Student-t CI

**Kriter:** `n=nβ` eşit ağırlıklı distinct ısıtma hızı grupları ve `df=nβ−2` ile iki-taraflı `%95` slope CI ve yönteme dönüştürülmüş `E CI` bağımsız referansla eşleşir; tekrar koşu sayısı `nβ` veya `df`yi artırmaz ve nβ=3 için t-critical normal dağılım katsayısıyla değiştirilemez.  
**Kanıt:** n=3,4,5 fixtures.  
**P0:** Evet.

#### AC-REG-03 — Regression-only etiketi

**Kriter:** UI/PDF/JSON, CI’nin yalnız agregasyon sonrası regresyon saçılımını kapsadığını; aynı-β tekrar değişkenliği, calibration, anchor, baseline ve derivative-method uncertainty’yi kapsamadığını belirtir.  
**Kanıt:** report snapshot.  
**P0:** Evet.

#### AC-REG-04 — Low R²

**Kriter:** Config default `0.98` altında `LOW_R2` oluşur; finite sonuç otomatik silinmez. R² tek başına “valid/invalid mechanism” kararı vermez.  
**Kanıt:** low-fit fixture.  
**P0:** Evet.

#### AC-REG-05 — Degenerate regression

**Kriter:** `Sxx=0`, `Syy=0`, `df<1` veya nonfinite regression hard refusal’dır; NaN/∞ rapor sonucu oluşmaz.  
**Kanıt:** degenerate fixtures.  
**P0:** Evet.

#### AC-REG-06 — `Eα` değişim tanısı

**Kriter:** Ana common `α` aralığında `(Emax−Emin)/Emean` `%10–20` ise `POSSIBLE_MULTISTEP_EA_VARIATION`, `>%20` ise `MULTISTEP_EA_VARIATION` oluşur. Sabit `Eα` tek-aşama ispatı olarak yazılmaz.  
**Kanıt:** constructed profile tests + report wording audit.  
**P0:** Evet.

### 4.7 Refusal/warning senaryo matrisi

#### AC-RF-01..12

Aşağıdaki her satır için ayrı fixture ve exact code assertion zorunludur:

| ID | Senaryo | Beklenen |
|---|---|---|
| AC-RF-01 | unknown temperature/beta unit | `UNKNOWN_TEMPERATURE_UNIT` veya `UNKNOWN_HEATING_RATE_UNIT`, no results |
| AC-RF-02 | 2 distinct beta | `INSUFFICIENT_DISTINCT_HEATING_RATES`, no results |
| AC-RF-03 | exactly 3 distinct beta | result + `LIMITED_HEATING_RATES` |
| AC-RF-04 | duplicate beta replicates | `DUPLICATE_HEATING_RATE`; fiziksel ölçekte β başına tek eşit ağırlıklı nokta; ham tekrar korunur; `nβ`/`df` artmaz |
| AC-RF-05 | no common alpha | `NO_COMMON_ALPHA_RANGE`, no isoconversional result |
| AC-RF-06 | inconsistent sample/atmosphere/stage | `INCONSISTENT_CONTEXT`, no results |
| AC-RF-07 | nonmonotone T or alpha | exact monotonicity refusal, no silent sort/clip |
| AC-RF-08 | cooling or nonlinear heating | exact refusal, no results |
| AC-RF-09 | Friedman nonpositive derivatives leave `<3` rates | alpha-specific refusal |
| AC-RF-10 | low R² but finite fit | result retained + `LOW_R2` |
| AC-RF-11 | positive slope | result retained + `NONPOSITIVE_APPARENT_EA` |
| AC-RF-12 | overlapping/ambiguous Kissinger peak | `OVERLAPPING_PEAKS`/`AMBIGUOUS_STAGE`, no Kissinger result |

**P0:** Bütün satırlar.

### 4.8 Raporlar ve yeniden üretilebilirlik

#### AC-REP-01 — JSON completeness

**Kriter:** Scientific spec §9.1’deki bütün provenance, config, units, formula ID, warning/refusal, fit ve observation alanları schema validation’dan geçer.  
**Kanıt:** JSON Schema + fixture validation.  
**P0:** Evet.

#### AC-REP-02 — CSV consistency

**Kriter:** Tidy CSV’deki unrounded numeric result/CI/diagnostics JSON ile belirlenen tolerance içinde aynıdır; Kissinger `resultType=peak, alpha=null`dır.  
**Kanıt:** cross-format parser test.  
**P0:** Evet.

#### AC-REP-03 — PDF completeness

**Kriter:** PDF input bağlamı, units, preprocessing, eligibility, warning/refusal, formula/version, `Eα` plot/table, regression/CI ve ayrı Kissinger bölümünü içerir; sayfa render’ında kesik tablo/grafik yoktur.  
**Kanıt:** PDF text assertion + bütün sayfaların render visual QA’sı.  
**P0:** Evet.

#### AC-REP-04 — Determinism

**Kriter:** Aynı app/core/schema sürümü ve aynı input+config iki kez çalıştırıldığında tüm scientific numeric JSON/CSV alanları bire bir aynıdır. Timestamp/report ID gibi izinli volatile alanlar açık listelenir.  
**Kanıt:** double-run diff.  
**P0:** Evet.

#### AC-REP-05 — Round-trip audit

**Kriter:** Rapor içindeki her ham regression contribution kaynak file/sheet/sourceRow’a ve ait olduğu β-agregasyon grubuna; her `E` result formül ID ve inclusion/exclusion kararına geri izlenebilir.  
**Kanıt:** automated provenance traversal.  
**P0:** Evet.

### 4.9 Doğrulama veri katmanları

#### AC-VAL-01 — Sentetik noise-free

**Kriter:** FWO, KAS, Starink, Friedman ve Kissinger için en az birer known-E fixture AC-NUM toleransını geçer.  
**P0:** Evet.

#### AC-VAL-02 — Sentetik robustness/refusal

**Kriter:** Kontrollü noise, multi-step `Eα`, low-R², nonpositive derivative, missing common range ve invalid-unit fixtures doğru uyarı/refusal path’lerini çalıştırır.  
**P0:** Evet.

#### AC-VAL-03 — Elle hesap

**Kriter:** En az bir sabit `α` noktasında FWO/KAS/Starink/Friedman ve ayrı bir Kissinger seti, formül dönüşümleri ile bağımsız hand worksheet/notebook üzerinden doğrulanır. Worksheet input, ara `x/y`, slope, `E`, SE ve CI içerir.  
**Tolerans:** display rounding öncesi AC-NUM/REG toleransları.  
**P0:** Evet.

#### AC-VAL-04 — Ham-verisi erişilebilir gerçek test

**Kriter:** En az bir multi-rate gerçek TGA/DTG raw dataset için kaynak, lisans/izin, download/local hash, sample/atmosphere/stage metadata ve bağımsız reference implementation sonucu kayıtlıdır. Core sonuçları reference ile önceden tanımlı toleransta eşleşir; yayın tablosu tek başına ground truth değildir.  
**Tolerans:** dataset manifestinde gerekçeli ve release öncesi kilitli; sonuca bakarak gevşetilemez.  
**P0:** Evet.

#### AC-VAL-05 — Cross-method interpretation

**Kriter:** Real/synthetic rapor FWO/KAS/Starink/Friedman farkını gösterir; agreement “truth” ilan edilmez, divergence gizlenmez. Kissinger tek değer olarak ayrı kalır.  
**Kanıt:** scientific reviewer audit.  
**P0:** Evet.

#### AC-VAL-06 — Fixture immutability

**Kriter:** Fixture ve expected-output hash’leri manifestte kilitlidir. Değişiklik bilimsel sürüm notu ve yeniden-baseline gerekçesi olmadan yapılamaz.  
**P0:** Evet.

### 4.10 Çevrimdışı ve üç platform

#### AC-PLAT-01 — Offline execution

**Kriter:** Kurulum/bundle hazırlandıktan sonra analiz, grafik ve PDF/CSV/JSON export sırasında network kapalıyken bütün golden end-to-end akış geçer. Runtime network request sayısı `0`dır.  
**Kanıt:** network-denied test/log.  
**P0:** Evet.

#### AC-PLAT-02 — OS matrix

**Kriter:** Desteklenen release bundle aynı golden fixtures ile Windows 11, desteklenen macOS release ve Ubuntu 22.04+ üzerinde çalışır; scientific numeric JSON eşittir.  
**Kanıt:** üç ayrı machine/CI smoke log’u ve output hash/diff.  
**P0:** Evet.

#### AC-PLAT-03 — Locale safety

**Kriter:** Türkçe/İngilizce locale ve comma/dot decimal testleri aynı canonical numeric sonucu verir; ambiguous mixed format sessizce yorumlanmaz.  
**Kanıt:** locale matrix.  
**P0:** Evet.

#### AC-PLAT-04 — Privacy

**Kriter:** Kullanıcı verisi ve raporu explicit user export dışında makineden çıkmaz; analytics/telemetry varsayılan kapalıdır.  
**Kanıt:** network/static audit + privacy statement.  
**P0:** Evet.

### 4.11 Kullanılabilirlik — “birkaç tık” ölçümü

#### AC-UX-01 — Guided happy path

**Kriter:** Önceden hazırlanmış dört-run TGA fixture’ında uzman olmayan test kullanıcısı formül yazmadan şu beş karar adımını aşmamalıdır: dosya yükle, mapping/units doğrula, sample-stage bağlamını doğrula, “tüm uygun yöntemleri çalıştır”, raporu dışa aktar.  
**Kanıt:** moderated walkthrough; click/decision count.  
**P0:** Evet.

#### AC-UX-02 — Hata anlaşılabilirliği

**Kriter:** En az beş refusal senaryosunda kullanıcıya problem, neden bilimsel risk olduğu ve nasıl düzeltileceği Türkçe-first dilde gösterilir; yalnız hata kodu gösterilmez.  
**Kanıt:** usability review + copy snapshot.  
**P0:** Evet.

#### AC-UX-03 — Sonuç ayrımı

**Kriter:** Kullanıcı testi katılımcılarının tamamı ekran üzerinden “Eα curve” ile “Kissinger single peak Ea”nın farklı sonuç türleri olduğunu doğru ifade edebilir.  
**Kanıt:** task-comprehension question.  
**P0:** Evet.

#### AC-UX-04 — Warning visibility

**Kriter:** `LIMITED_HEATING_RATES`, `LOW_R2`, `NUMERICAL_DERIVATIVE` ve multistep warning sonuç kartı ve export raporunda görünür; yalnız log/tooltip içinde saklanmaz.  
**Kanıt:** UI/PDF snapshot.  
**P0:** Evet.

## 5. P1 — MVP sonrası fakat mimariyi engellememesi gereken kapılar

- Vyazovkin/flexible integral method;
- Coats–Redfern ve model-function expert mode;
- DAEM, master plots, deconvolution ve global fitting;
- DSC/cooling/isothermal workflows;
- reaction-model-aware `A/ln A`;
- baseline/smoothing sensitivity ensemble ve daha kapsamlı uncertainty propagation;
- cihaz-vendor template library;
- erişilebilirlik için WCAG kapsamlı audit ve çok-dilli yöntem rehberi.

P1 maddeleri P0 tamamlanmış gibi gösterilemez; fakat data model/provenance schema bunların eklenmesini engellememelidir.

## 6. Release bilimsel imza sırası

1. Math maintainer: formula IDs, unit/log/coefficients ve numerical fixtures.
2. Data/IO maintainer: mapping, provenance, no-partial-calculation ve locale.
3. Thermal-analysis reviewer: eligibility, stage, warnings ve claim boundary.
4. QA: report consistency, determinism, refusal matrix ve platform matrix.
5. Product owner: few-click usability ve offline/privacy.

Bu imzalardan biri eksikse durum en fazla `technical candidate` olabilir; “validated MVP” olamaz.

## 7. Son tamamlanma denetimi

Release sorumlusu her explicit requirement için otoritatif kanıt yolunu kaydeder. Audit yalnız “testler yeşil” demekle yetinmez:

- testin gerçekten ilgili formülü/eşiği kapsadığı doğrulanır;
- fixture expected değerinin aynı implementation tarafından üretilmediği gösterilir;
- rendered PDF görsel olarak incelenir;
- real raw-data izin/hash ve independent reference kontrol edilir;
- üç OS log’u ve offline ağ kanıtı güncel release hash’iyle eşleşir;
- açık issue listesinde bilimsel `critical` veya `major` kalmaz.

Bütün `P0` satırları `PASS` olmadan ana hedef tamamlandı olarak işaretlenmez.
