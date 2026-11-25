# Bilimsel Hesaplama Şartnamesi v1

**Durum:** Normatif MVP sözleşmesi  
**Tarih:** 2026-07-18  
**Misyon:** [`00_MISSION_LOCK.md`](00_MISSION_LOCK.md)  
**Kabul kapıları:** [`02_ACCEPTANCE_CRITERIA.md`](02_ACCEPTANCE_CRITERIA.md)

## 1. Amaç ve normatif dil

Bu belge TGA/DTG verisinden görünür aktivasyon enerjisi hesaplayan MVP’nin bilimsel ve sayısal davranışını tanımlar. `ZORUNLU`, `YASAK`, `REDDER` ve `ÜRETİR` ifadeleri normatiftir.

Kurallar iki kaynaktan birini taşır:

- **[K] Kanıt destekli:** Yerel korpustaki uygulanmış yöntem, görsel denklem, yöntem önerisi veya kalite uyarısıyla desteklenir.
- **[M] Mühendislik koruması:** Korpus tarafından evrensel eşik olarak verilmemiş, MVP’nin deterministik ve güvenli olması için açıkça seçilmiş korumadır. Sürümlemeli ve test edilmelidir.
- **[K+M]:** Bilimsel gereklilik korpusta desteklenir; kesin yazılım davranışı/eşiği MVP kararıdır.

Bir `[M]` eşiği bilimsel doğa yasası gibi raporlanamaz.

## 2. Kanıt otoritesi ve izlenebilirlik

Bilimsel iddialar tek CSV hücresine değil şu zincire dayanır:

`kaynak PDF → rendered page/quality crop → extraction note → quality warning → ready finding → canonical evidence → method matrix`

Normatif kaynak yolları, bu belgeye göre:

- [`../ULTIMATE_GOAL.md`](../ULTIMATE_GOAL.md)
- [`../01_PDF_Evidence_Extraction/05_Canonical_Evidence_Table/activation_energy_evidence.csv`](../01_PDF_Evidence_Extraction/05_Canonical_Evidence_Table/activation_energy_evidence.csv)
- [`../01_PDF_Evidence_Extraction/06_Method_Evidence_Matrix/method_evidence_matrix.csv`](../01_PDF_Evidence_Extraction/06_Method_Evidence_Matrix/method_evidence_matrix.csv)
- [`../01_PDF_Evidence_Extraction/04_Paper_Extraction_Notes`](../01_PDF_Evidence_Extraction/04_Paper_Extraction_Notes)
- [`../01_PDF_Evidence_Extraction/07_Quality_Checks`](../01_PDF_Evidence_Extraction/07_Quality_Checks)
- [`../01_PDF_Evidence_Extraction/08_Ready_For_Methodology_Synthesis`](../01_PDF_Evidence_Extraction/08_Ready_For_Methodology_Synthesis)

Formül doğrulama paketleri:

| Yöntem/sınır | Görsel veya rendered kanıt | Yapılandırılmış/yorumlu kanıt |
|---|---|---|
| FWO doğal-log Doyle biçimi | [`paper_056 p05 crop`](../01_PDF_Evidence_Extraction/07_Quality_Checks/paper_056_quality_crops/p05_fwo_cr_sce_eq6_9.png) | [`paper_056 extraction notes`](../01_PDF_Evidence_Extraction/04_Paper_Extraction_Notes/paper_056_extraction_notes.md), [`ready findings`](../01_PDF_Evidence_Extraction/08_Ready_For_Methodology_Synthesis/paper_056_ready_findings.md) |
| KAS | [`paper_002 rendered p06`](../01_PDF_Evidence_Extraction/02_Rendered_Pages/paper_002/page-06.png) | `paper_id=002`, method matrix KAS satırı |
| Starink | [`paper_063 p04 crop`](../01_PDF_Evidence_Extraction/07_Quality_Checks/paper_063_quality_crops/paper_063_p04_evidence.png) | [`paper_063 extraction notes`](../01_PDF_Evidence_Extraction/04_Paper_Extraction_Notes/paper_063_extraction_notes.md) |
| Friedman | [`paper_010 rendered p05`](../01_PDF_Evidence_Extraction/02_Rendered_Pages/paper_010/page-05.png) | `paper_id=010`, method matrix Friedman satırı |
| Kissinger ve varsayımları | [`paper_064 p02 crop`](../01_PDF_Evidence_Extraction/07_Quality_Checks/paper_064_quality_crops/paper_064_p02_evidence.png) | [`paper_064 extraction notes`](../01_PDF_Evidence_Extraction/04_Paper_Extraction_Notes/paper_064_extraction_notes.md), [`quality warnings`](../01_PDF_Evidence_Extraction/07_Quality_Checks/paper_064_quality_warnings.md) |
| Çok-adımlılık ve `Eα` değişimi | rendered p03–p07 izi | [`paper_057 extraction notes`](../01_PDF_Evidence_Extraction/04_Paper_Extraction_Notes/paper_057_extraction_notes.md), [`quality warnings`](../01_PDF_Evidence_Extraction/07_Quality_Checks/paper_057_quality_warnings.md) |

Korpus alan genelindeki kullanım sıklığını kanıtlayan bir census değildir. “Korpusta uygulanmış örnekler” ile “alanda çoğunlukla kullanılan yöntem” aynı iddia değildir.

## 3. Bilimsel temel ve semboller

### 3.1 Genel hız denklemi

**[K]** Tek-aşama gösterimi:

\[
\frac{d\alpha}{dt}=k(T)f(\alpha),\qquad
k(T)=A\exp\!\left(-\frac{E}{RT}\right)
\]

Bu eşitlik yazılımın bir reaksiyonun gerçekten tek-aşamalı olduğunu ilan etmesine izin vermez. Çok-aşamalı süreçte hesaplanan değer, yöntem ve dönüşüm aralığına bağlı görünür `Eα` olabilir.

### 3.2 Semboller ve kanonik birimler

| Sembol | Anlam | Hesap içi birim |
|---|---|---|
| `T`, `Tα`, `Tp` | mutlak sıcaklık | K |
| `β=dT/dt` | pozitif ısıtma hızı | K min⁻¹ |
| `t` | zaman | min (core derivative hesabı) |
| `α` | dönüşüm derecesi | boyutsuz, 0–1 |
| `dα/dt` | dönüşüm hızı | min⁻¹ |
| `E`, `Eα` | görünür aktivasyon enerjisi | J mol⁻¹ içte; kJ mol⁻¹ raporda |
| `A` | pre-exponential factor | zaman birimine bağlı |
| `R` | molar gaz sabiti | `8.31446261815324 J mol⁻¹ K⁻¹` |

**[K+M]** Girişte °C/K ve K s⁻¹/K min⁻¹/°C s⁻¹/°C min⁻¹ kabul edilebilir; bütün kinetik hesaplar yukarıdaki kanonik birimlerde yapılır. Ingestion katmanı zamanı provenance-korumalı olarak saniyeye normalize edebilir; core, türevden önce dakikaya dönüştürür. °C sıcaklık farkı ile K sıcaklık farkı eşit olsa da kinetik formüldeki `T` daima Kelvin’dir.

**[M]** Logaritması alınan boyutlu niceliklerin sayısal değeri seçilen birime bağlıdır. V1 bütün run’larda `β` ve `dα/dt` için K min⁻¹ ve min⁻¹ kullanır; bu seçim raporda kaydedilir. Sabit birim dönüşümü eğimi ve dolayısıyla `E`’yi değiştirmez, fakat intercept/`A` yorumunu değiştirir.

## 4. Girdi ve veri modeli

### 4.1 Dosya ve tablo türleri

**[M]** Desteklenen dosyalar `.csv`, `.tsv`, `.xlsx`’tir.

- Bir XLSX birden fazla sheet içeriyorsa `options.sheet` seçilmeden kayıt üretilmez.
- Tablo türü `curve` veya `beta-tp`’dir.
- Sadece sıcaklık ve `β` içeren belirsiz tablo, kullanıcı `tableKind` seçmeden yorumlanmaz.
- Tanınmış `Tp`, `Tmax` veya peak-temperature başlığı ile `β`, `beta-tp` adayıdır; yine bağlam doğrulaması yapılır.

### 4.2 Curve tablosu

**[K+M]** Her run için:

- sıcaklık;
- `β` sütunu veya run/dosya için açık `β` metadata’sı;
- doğrudan `α` **ya da** mass/mass-percent;
- tercihen zaman veya doğrudan `dα/dt`;
- `runId`, `sample`, `atmosphere`, `stage` metadata’sı

gerekir.

Kabul edilen giriş birimleri:

| Alan | Kabul edilen birimler |
|---|---|
| sıcaklık | K, °C |
| zaman | s, min |
| kütle | mg, g |
| kütle yüzdesi | %, fraction |
| `α` | fraction, % |
| `β` | K/min, K/s, °C/min, °C/s |

Başlık birim söylemiyorsa veya aynı başlığa birden çok olası alan eşleşiyorsa status `needs_mapping` olur; kayıt listesi boş kalır. Ondalık ayıracı, table kind veya sheet belirsizliği sessizce çözülmez.

Her normalize satır şu provenance alanlarını taşır:

- `fileName`;
- varsa `sheetName`;
- birden başlayan `sourceRow`;
- `runId`;
- uygulanan sütun eşlemesi ve birim dönüşümü.

### 4.3 Beta–Tp tablosu

**[K]** Her satır aynı fiziksel aşamaya ait pozitif `β` ve Kelvin’e dönüştürülebilir `Tp` içerir. `Tp`, DSC/DTA/DTG sinyalindeki hız maksimumu/minimumuna karşılık gelen tepe sıcaklığıdır. V1’in kullanıcı hedefi TGA/DTG olduğundan, DSC içe alma genel ürün kapsamına ertelenmiştir.

### 4.4 Bağlam homojenliği

**[K]** Tek regresyondaki run’lar aynı numune tanımı, atmosfer, ölçülen süreç ve seçilmiş reaksiyon aşamasına ait olmalıdır. Birden fazla DTG piki/shoulder bulunması çok-adımlılığa işaret edebilir; tek görünür pik tek-aşama kanıtı değildir.

**[M]** Metadata çelişkisi veya aşama eşlemesinin kararsızlığı hard refusal’dır. Kullanıcı bunu açıkça yeni ve ayrı bir analiz grubu oluşturarak çözebilir; yazılım otomatik birleştirme yapmaz.

## 5. Ön işleme, `α` ve eşleme

### 5.1 Kütleden dönüşüm

Kütle kaybı yönündeki seçilmiş bir aşama için:

\[
\alpha(T)=\frac{m_0-m(T)}{m_0-m_f}
\]

Burada `m0` seçilmiş aşamanın başlangıç, `mf` bitiş kütlesidir.

**[K+M]** Aşama sınırları ve anchor’lar raporda saklanır. `m0=mf`, ters yön, non-finite değer, fiziksel olmayan `α` veya tekdüze olmayan dönüşüm sessiz clipping ile düzeltilmez. Kütle artışı/karma sinyal için bu formül otomatik uygulanmaz; doğrulanmış doğrudan `α` veya ayrı bir gelecek modül gerekir.

### 5.2 Ham veri bütünlüğü

**[M]** V1:

- ham satırları değiştirmez;
- sıcaklığı sessizce sort etmez;
- duplicate satırı sessizce silmez;
- smoothing uygulamaz;
- missing değeri impute etmez;
- `α`’yı `[0,1]` aralığına clip etmez.

Her curve run’ında sıcaklık sıkı artan, `α` azalmayan ve bütün kullanılan değerler finite olmalıdır. İzin verilen floating-point toleransı uygulama config’inde sürümlenir ve raporda yazılır.

### 5.3 Isıtma programı

**[K]** V1 pozitif, doğrusal ısıtma içindir. Soğutma (`β≤0`) FWO/KAS/Starink/Kissinger için desteklenmez; paper 064 özellikle Kissinger’da `ln β` nedeniyle soğutmanın geçersiz olduğunu gösterir.

**[M]** Run içinde satır-bazlı `β` varsa, medyan çevresindeki maksimum bağıl sapma varsayılan `%2`’yi aşarsa `NONLINEAR_HEATING_UNSUPPORTED` ile reddedilir. Eşik config ve raporda görünürdür; bu %2 evrensel bilimsel sınır değildir.

### 5.4 `α` ızgarası ve ortak aralık

**[M]** Varsayılan hedefler:

`α = 0.10, 0.20, …, 0.90`

Caller yalnız finite, unique ve `0<α<1` hedefleri verebilir. Her hedef, bütün run’ların gözlediği ortak aralıkta bulunmalıdır.

**[K+M]** `α=0.1–0.9` uç dalgalanmalarını azaltan ana yorum aralığıdır; paper 057 bu aralıkta `Eα` değişiminin yorumlanmasını önerir. Bu, her veri setinin 0.1–0.9’u mutlaka kapsadığı anlamına gelmez.

Her run’da `Tα`, monotone `α(T)` üzerinde iki komşu ölçüm arasında piecewise-linear interpolation ile bulunur:

\[
T_\alpha=T_j+
\frac{\alpha-\alpha_j}{\alpha_{j+1}-\alpha_j}
(T_{j+1}-T_j)
\]

Extrapolation yasaktır. Exact plateau hedefi için `Tα` tekil değilse nokta otomatik uydurulmaz; `AMBIGUOUS_ALPHA_CROSSING` üretilir.

### 5.5 Friedman türevi

**[K+M]** `dα/dt` öncelik sırası:

1. birimi açık, kullanıcı tarafından sağlanmış `dα/dt`;
2. zaman varsa merkez sonlu fark; uçlarda tek-taraflı fark;
3. zaman yoksa merkez `dα/dT` sonlu farkı ile `dα/dt=β(dα/dT)`; uçlarda tek-taraflı fark.

Sağlanmış türev sütunu ya her noktada sonlu olmalı ya da tamamen kaldırılmalıdır. Kısmen
eksik, `NaN` veya sonsuz değer içeren sağlanmış seri `INVALID_PROVIDED_DERIVATIVE`
ile hard refusal üretir; kusurlu kullanıcı girdisi sessizce sayısal türeve çevrilmez.

V1 smoothing yapmaz. Sayısal türev kullanıldıysa `NUMERICAL_DERIVATIVE` uyarısı zorunludur. Her `α` için non-finite veya `dα/dt≤0` gözlem logaritmaya sokulmaz; geriye üçten az kullanılabilir bağımsız hız kalırsa o `α` Friedman sonucu reddedilir.

## 6. Yöntem denklemleri

Tüm regresyonlarda:

\[
x_i=1/T_i\quad [K^{-1}],\qquad y_i=b_0+b_1x_i+\varepsilon_i
\]

**[M] Aynı `β` tekrarları:** Regresyon birimi fiziksel koşu sayısı değil, farklı
ısıtma hızıdır. Aynı kanonik `β` anahtarındaki tekrarların `β`, `Tα`/`Tp` ve
Friedman için `dα/dt` değerleri önce fiziksel ölçekte aritmetik ortalanır; yöntem
`x/y` dönüşümü bu ortalama büyüklüklerden sonra yeniden hesaplanır. Her farklı
`β` OLS'ye bir ve eşit ağırlıklı nokta verir. Otomatik aykırı değer silme veya
tekrar sayısına göre ağırlıklandırma yapılmaz. Ham koşular, kaynak kimlikleri,
tekrar sayısı ve grup içi betimsel saçılım denetim izi içinde korunur.

`x=1000/T` yalnız görsel eksen olarak kullanılabilir. Hesap motoru `x=1/T` kullanır; böylece gizli `1000` ölçek hatası oluşmaz.

### 6.1 FWO/OFW — doğal-log Doyle biçimi

**[K]** Rendered paper 056 p.5 ile doğrulanan biçim:

\[
\ln\beta=
\ln\!\left(\frac{A E_\alpha}{R g(\alpha)}\right)
-5.331
-1.052\frac{E_\alpha}{RT_\alpha}
\]

Regresyon:

\[
y=\ln\beta,\qquad x=1/T_\alpha,\qquad
E_\alpha=-\frac{R}{1.052}b_1
\]

Korpusta görülen yayın-yuvarlatmalı onluk-log biçimi:

\[
\log_{10}\beta=C-0.4567\frac{E_\alpha}{RT_\alpha}
\]

Tam log-tabanı dönüşüm katsayısı `1.052/ln(10)=0.456877794962...` olur. Basılı `0.4567` bu değerin Doyle/literatür yuvarlatmasıdır ve tam katsayıdan yaklaşık `3.89×10⁻⁴` bağıl farklıdır.

**[M]** V1 yalnız doğal-log biçimini uygular ve `methodFormulaId=fwo_doyle_ln_1.052_v1` olarak kaydeder. `0.4567` katsayısı `ln` ile birlikte kullanılamaz ve exact cross-base eşitlik sabiti olarak kullanılamaz. `-5.331` intercepti etkiler, eğimden `Eα` hesabını etkilemez.

### 6.2 KAS — Kissinger–Akahira–Sunose

**[K]** Rendered paper 002 p.6 ile doğrulanan biçim:

\[
\ln\!\left(\frac{\beta}{T_\alpha^2}\right)=
\ln\!\left(\frac{AR}{E_\alpha g(\alpha)}\right)
-\frac{E_\alpha}{RT_\alpha}
\]

Regresyon:

\[
y=\ln(\beta/T_\alpha^2),\qquad x=1/T_\alpha,\qquad
E_\alpha=-Rb_1
\]

Korpusta intercept teriminin tipografik/cebirsel varyantları vardır. **[M]** V1 `Eα`yı yalnız eğimden hesaplar; mekanizma `g(α)` seçilmeden interceptten `A` üretmez.

### 6.3 Starink

**[K]** Rendered paper 063 p.4 ile doğrulanan biçim:

\[
\ln\!\left(\frac{\beta}{T_\alpha^{1.92}}\right)=
\ln\!\left(\frac{A E_\alpha}{R g(\alpha)}\right)
-0.312
-1.0008\frac{E_\alpha}{RT_\alpha}
\]

Regresyon:

\[
y=\ln(\beta/T_\alpha^{1.92}),\qquad x=1/T_\alpha,\qquad
E_\alpha=-\frac{R}{1.0008}b_1
\]

`1.92` sıcaklık üssü, `1.0008` ise eğim–enerji katsayısıdır; yer değiştiremezler.

### 6.4 Friedman — diferansiyel izokonversiyonel

**[K]** Sabit `α` için:

\[
\ln\!\left(\frac{d\alpha}{dt}\right)_{\alpha,i}
=\ln[A_\alpha f(\alpha)]
-\frac{E_\alpha}{RT_{\alpha,i}}
\]

Doğrusal ısıtmada eşdeğer hız:

\[
\frac{d\alpha}{dt}=\beta\frac{d\alpha}{dT}
\]

Regresyon:

\[
y=\ln(d\alpha/dt),\qquad x=1/T_\alpha,\qquad
E_\alpha=-Rb_1
\]

**[K]** Friedman türev ve gürültüye integral yöntemlerden daha duyarlıdır; bu yüzden yöntem “koşullu”dur. Pozitif olmayan hız logaritması hesaplanamaz.

### 6.5 Kissinger — ayrı tepe yöntemi

**[K]** Genel tek-aşama türetim biçimi:

\[
\ln\!\left(\frac{\beta}{T_p^2}\right)=
\ln\!\left[-\frac{AR}{E}f'(\alpha_p)\right]
-\frac{E}{RT_p}
\]

Eğim biçimi:

\[
y=\ln(\beta/T_p^2),\qquad x=1/T_p,\qquad E=-Rb_1
\]

**[K]** Sonuç tek bir peak-specific görünür `Ea`’dır; `Eα(α)` değildir. Lineer Kissinger grafiği tek-aşama kanıtı değildir. `αp`’nin `β` ile sistematik değişimi, peak overlap, nonlinear heating, cooling ve sıradan melting önemli geçersizlik sınırlarıdır.

**[K+M]** En az üç farklı hız sayısal eğim için hard gate’tir. Ancak paper 057/064, Kissinger nonlinearity’sini görebilmek için en az beş hız ve geniş hız aralığı gerektiğini belirtir. Üç–dört hızla hesap raporlanabilir fakat `KISSINGER_COMPLEXITY_UNDERPOWERED` uyarısı zorunludur.

### 6.6 Yöntem dönüşüm tablosu

| Yöntem | `y` | `T` | `E` dönüşümü | Çıktı türü |
|---|---|---|---|---|
| FWO | `ln β` | `Tα` | `-R b1/1.052` | `Eα` |
| KAS | `ln(β/Tα²)` | `Tα` | `-R b1` | `Eα` |
| Starink | `ln(β/Tα^1.92)` | `Tα` | `-R b1/1.0008` | `Eα` |
| Friedman | `ln(dα/dt)` | `Tα` | `-R b1` | `Eα` |
| Kissinger | `ln(β/Tp²)` | `Tp` | `-R b1` | tek peak-specific `Ea` |

Sonuç J mol⁻¹ hesaplanır, raporda `÷1000` ile kJ mol⁻¹ yazılır.

## 7. Regresyon ve belirsizlik

### 7.1 OLS

Her yöntem/`α` için interceptli ordinary least squares uygulanır:

\[
b_1=\frac{\sum_i(x_i-\bar{x})(y_i-\bar{y})}
{\sum_i(x_i-\bar{x})^2},\qquad
b_0=\bar{y}-b_1\bar{x}
\]

\[
e_i=y_i-(b_0+b_1x_i),\quad
SSE=\sum_i e_i^2,\quad
s=\sqrt{\frac{SSE}{n-2}}
\]

\[
SE(b_1)=\frac{s}{\sqrt{\sum_i(x_i-\bar{x})^2}},\qquad
R^2=1-\frac{SSE}{\sum_i(y_i-\bar{y})^2}
\]

`n≥3`, `df=n-2` ve `Σ(x−x̄)²>0` zorunludur.

### 7.2 Enerji belirsizliği

Yöntem katsayısı `c` FWO için `1.052`, Starink için `1.0008`, diğerleri için `1` olmak üzere:

\[
E=-\frac{R}{c}b_1,\qquad
SE(E)=\frac{R}{c}SE(b_1)
\]

İki taraflı `%95` regression-only güven aralığı:

\[
CI_{95}(E)=E\pm t_{0.975,n_\beta-2}SE(E)
\]

**[M]** `nβ` eşit ağırlıklı farklı ısıtma hızı gruplarının sayısıdır; residual
serbestlik derecesi `nβ−2`dir. Rapor hem eğim CI’sını hem dönüştürülmüş `E`
CI’sını verir. Bu aralık agregasyon sonrası regresyon saçılımını kapsar; aynı
`β` içindeki tekrar değişkenliği, cihaz kalibrasyonu, stage anchor seçimi,
baseline ve türev yöntemi belirsizliğini kapsadığı iddia edilmez.

### 7.3 Tanılar

Her fit zorunlu olarak şunları taşır:

- `nβ`, ham koşu sayısı, `df=nβ−2`, tekrar-agregasyon politikası, distinct `β`
  sayısı ve hız aralığı;
- `b0`, `b1`, `SE(b1)`, slope CI;
- `E`, `SE(E)`, `E CI`;
- `SSE`, residual standard error, `R²`;
- her gözlem için `x`, `y`, predicted `y`, residual ve provenance;
- dahil/dışarıda durumu ve gerekçe.

**[K+M]** `R²` fiziksel doğruluk kanıtı değildir. Varsayılan `R²<0.98` uyarı eşiğidir; sonuç otomatik silinmez. Eşik config’te ve raporda görünürdür.

## 8. Uygunluk, reddetme ve uyarı kuralları

### 8.1 Durum semantiği

- `ready`: kritik kontrol sorunu yok.
- `ready_with_warnings`: sayı hesaplanabilir, fakat yorum sınırı vardır.
- `refused`: bilimsel veya sayısal önkoşul eksik; ilgili sonuç üretilmez.

Ingestion status’ü `ready|needs_mapping|error` olabilir. Çözülmemiş `needs_mapping` veya herhangi bir error varsa normalize kayıt ve bütün downstream tablolar boş kalır; partial/silent calculation yasaktır.

### 8.2 Global hard refusal

| Kod | Kural | Tür |
|---|---|---|
| `AMBIGUOUS_TABLE_KIND` | curve/beta-tp ayrımı çözülemiyor | [M] |
| `MAPPING_REQUIRED` | gerekli sütun veya sheet seçimi belirsiz | [M] |
| `UNKNOWN_UNIT` | T, β, α/mass veya zaman/türev birimi çözülemiyor | [K+M] |
| `NONFINITE_DATA` | kullanılan nicelik NaN/∞ | [M] |
| `NON_MONOTONIC_TEMPERATURE` | curve sıcaklığı sıkı artmıyor | [K+M] |
| `NONLINEAR_HEATING_UNSUPPORTED` | v1 sabit-β sınırı sağlanmıyor | [K+M] |
| `COOLING_UNSUPPORTED` | `β≤0` | [K] |
| `INSUFFICIENT_DISTINCT_HEATING_RATES` | üçten az farklı pozitif β | [K+M] |
| `INCONSISTENT_CONTEXT` | sample/atmosphere/process/stage çelişkili | [K] |
| `AMBIGUOUS_STAGE` | aynı fiziksel aşama güvenle eşlenemiyor | [K] |
| `INVALID_ALPHA_ANCHORS` | `m0=mf` veya geçersiz stage anchor | [K+M] |
| `NON_MONOTONIC_ALPHA` | seçilmiş aşamada `α` tekdüze değil | [K+M] |
| `NO_COMMON_ALPHA_RANGE` | bütün run’larda ortak hedef `α` yok | [K] |

### 8.3 Yöntem-özel hard refusal

- FWO/KAS/Starink: hedef `α` için en az üç farklı hızdan finite `Tα` yoksa yalnız o yöntem–`α` sonucu reddedilir.
- Friedman: hedef `α` için en az üç farklı hızda finite, pozitif `dα/dt` yoksa yalnız o `α` sonucu reddedilir.
- Kissinger: aynı aşamaya ait en az üç farklı hızda tekil `Tp` yoksa, peak overlap/assignment belirsizse veya cooling/nonlinear heating varsa reddedilir.
- OLS: `Sxx=0`, `Syy=0`, `df<1` veya non-finite fit varsa sonuç reddedilir.

### 8.4 Zorunlu uyarılar

| Kod | Tetik | Davranış | Tür |
|---|---|---|---|
| `LIMITED_HEATING_RATES` | tam üç farklı β | sonucu koru; CI ve sınırlı güç vurgula | [M] |
| `DUPLICATE_HEATING_RATE` | aynı β’de replicate run | fiziksel ölçekte β başına tek eşit ağırlıklı regresyon noktasına agregat et; ham tekrarları koru; `nβ`/`df` artırma | [M] |
| `NARROW_HEATING_RATE_SPAN` | `βmax/βmin<2` | düşük leverage uyarısı | [M] |
| `KISSINGER_COMPLEXITY_UNDERPOWERED` | Kissinger’da `<5` hız veya `βmax/βmin<5` | tek-aşama çıkarımını yasakla | [K+M] |
| `NUMERICAL_DERIVATIVE` | Friedman türevi sonlu farktan | türev kaynağı/örnekleme sınırını raporla | [K+M] |
| `LOW_R2` | `R²<0.98` varsayılanı | sonucu silme; residual/CI incelemesini iste | [M] |
| `NONPOSITIVE_APPARENT_EA` | `E≤0` | sonucu koru; kimyasal TGA bağlamında açıklama iste | [K+M] |
| `MULTISTEP_EA_VARIATION` | `(Emax−Emin)/Emean>0.20` ana `α=0.1–0.9` aralığında | tek ortalamaya indirgeme; çok-adımlılık uyarısı | [K+M] |
| `POSSIBLE_MULTISTEP_EA_VARIATION` | oran `%10–20` | sınırda değişim uyarısı | [K] |
| `OVERLAPPING_PEAKS` | birden çok/omuzlu DTG peak | Kissinger’ı reddet veya manual stage doğrulaması iste | [K] |

Paper 057’deki `%10–20` değişim, tanısal rehberdir; sabit `Eα` tek-aşama kanıtı değildir. Ortalama/median ikincil özet olarak verilebilir, fakat değişken `Eα` eğrisinin yerini alamaz.

## 9. Çıktı ve yeniden üretilebilirlik sözleşmesi

### 9.1 JSON — otoritatif makine raporu

JSON en az şunları içerir:

- schema, app, core-math ve formül sürümleri;
- UTC oluşturma zamanı;
- giriş dosya SHA-256, file/sheet/sourceRow provenance;
- sütun eşleme ve giriş→kanonik birim dönüşümleri;
- sample/atmosphere/process/stage metadata;
- `m0`, `mf`, stage sınırları veya direct-α kaynağı;
- `α` grid’i, common range ve `Tα` matrisi;
- derivative source ve tüm preprocessing config;
- eligibility decision’ları, refusal/warning kodları;
- yöntem bazında formül ID, `x/y` noktaları, fit ve belirsizlik;
- Kissinger sonucunu isoconversional sonuçlardan ayıran result type;
- dışlanan her gözlemin gerekçesi.

### 9.2 CSV

Tidy CSV’de bir satır bir `method × α` sonucu; Kissinger için `alpha` boş ve `resultType=peak` olur. Numeric alanlar tam precision ile, display rounding’den önce yazılır.

### 9.3 PDF

PDF insan-okunur fakat JSON’un yerine geçmez. Asgari içerik:

- analiz kimliği ve bağlam etiketi;
- input/units/preprocessing özeti;
- uygunluk kararları ve görünür uyarılar;
- `Eα` tablo/grafikleri ve yöntem karşılaştırması;
- regresyon grafik/diagnostics/CI;
- ayrı Kissinger bölümü;
- yöntem formülü, sürümü ve yerel kanıt izi;
- “regression-only uncertainty” ve “apparent Ea” sınır metni.

### 9.4 `A` sınırı

**[K+M]** V1 core yöntem raporu `A` veya `ln A`yı bilimsel nihai sonuç olarak üretmez. FWO/KAS/Starink interceptleri `g(α)` ve yaklaşım formuna; Friedman intercepti `A f(α)` bileşimine; Kissinger intercepti `f′(αp)` varsayımına bağlıdır. Intercept regresyon tanısı olarak saklanır. `A` modülü, açık reaction model ve ayrı doğrulama sonrası gelecek sürümdür.

## 10. Sayısal doğrulama stratejisi

**[M]** Üç bağımsız kanıt sınıfı zorunludur:

1. **Sentetik:** Bilinen `E` ile üretilmiş noise-free ve kontrollü-noise fixture’lar; her yöntemin eğim dönüşümü ve refusal path’i.
2. **Elle hesaplanmış:** En az bir izokonversiyonel `α` noktası ve bir Kissinger seti, bağımsız notebook/spreadsheet veya ikinci uygulamayla satır satır doğrulanır.
3. **Ham-gerçek:** Lisansı/kaynağı ve hash’i kayıtlı en az bir erişilebilir ham TGA/DTG çok-hız veri seti; bağımsız referans implementation ile karşılaştırılır.

Makalede yalnız grafik/tablo halinde verilen `Ea` değerleri raw-data ground truth değildir. Onlar formül, beklenen raporlama ve metodolojik sınır kanıtıdır.

Toleranslar ve tamamlanma artefaktları [`02_ACCEPTANCE_CRITERIA.md`](02_ACCEPTANCE_CRITERIA.md) içinde normatiftir.

## 11. Sürümleme ve değişiklik kontrolü

Şunlardan herhangi biri değişirse scientific-spec minor/major sürümü artırılır ve golden fixtures yeniden çalıştırılır:

- formül/katsayı/log tabanı;
- `R` sabiti veya iç birim;
- `α` üretimi/interpolasyonu;
- türev algoritması;
- hard refusal/warning eşikleri;
- regression/CI hesabı;
- report schema veya result-type semantiği.

Bir yöntem yeni korpus kanıtıyla değiştirilecekse ilgili `paper_id`, rendered page/crop ve quality warning değişiklik kaydına eklenir.
