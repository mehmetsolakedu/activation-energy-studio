# Activation Energy Studio — Kullanılabilirlik Doğrulama Protokolü

**Kapsam:** `AC-UX-01`–`AC-UX-04`  
**Protokol durumu:** `APPROVED DESIGN / NOT YET RUN`  
**Son güncelleme:** 2026-07-18

Bu belge bir test planıdır; tamamlanmış kullanıcı testi değildir. Henüz katılımcı
oturumu, ekran kaydı, tıklama sayımı veya anlama skoru yoktur. Bu nedenle bu
protokol tek başına hiçbir `AC-UX-*` kapısını `PASS` yapmaz.

## 1. Amaç ve çalışma tasarımı

Amaç, aktivasyon enerjisi yöntemlerinde uzman olmayan bir kullanıcının yazılımı
formül yazmadan çalıştırabildiğini; bilimsel retleri anlayabildiğini; `Ea(α)` ile
Kissinger tek-tepe sonucunu karıştırmadığını ve zorunlu uyarıları ana sonuç
yüzeyinde ve PDF'de görebildiğini ölçmektir.

- Tasarım: bire bir, moderatörlü görev testi. Her oturum için birbirinden ayrı,
  hash'li bir ekran kaydı ve bir ses kaydı tutulur; yalnız ekran görüntüsü veya
  rapor PDF'si oturum kanıtı değildir. Tek-kare `screenshot` yalnız isteğe bağlı
  ek kanıttır; zorunlu ekran veya ses kaydının yerini tutmaz.
- Asgari örneklem: **5 geçerli katılımcı**. Geçersiz/yarım oturumların yerine yeni
  katılımcı alınır; başarısız oturumlar örneklemden çıkarılmaz.
- Tahmini süre: 35–45 dakika.
- Ortam: aynı hash'e sahip tek-HTML release, temiz tarayıcı profili, `%100` zoom,
  ağ kapalı, yalnız sentetik çalışma dosyaları. Recorder `%100` dışındaki hiçbir
  zoom değerini kabul etmez.
- Moderatör görev sırasında öğretmez. Yalnız “Ekranda ne görüyorsunuz?” ve
  “Bundan sonra ne yapmayı düşünüyorsunuz?” tarafsız sorularını sorabilir.
  Doğru kontrolü veya düzeltici adımı söylemek **rescue** sayılır.

## 2. Katılımcı ölçütleri

Her katılımcı aşağıdakilerin tamamını sağlamalıdır:

1. Mühendislik/fen/tarım/çevre gibi sayısal bir alanda öğrenci, araştırmacı,
   teknisyen veya mühendis olmak.
2. CSV/XLSX açma ve temel grafik/tablo okuma deneyimine sahip olmak.
3. TGA/DTG'yi hiç görmemiş veya temel düzeyde görmüş olabilir; fakat son iki yıl
   içinde rutin olarak FWO, KAS, Starink, Friedman ya da Kissinger hesabı yapmamış
   olmak.
4. Bu ürünün koduna, tasarımına veya kabul kriterlerine katkı vermemiş olmak.
5. Test dilindeki Türkçe bilimsel açıklamaları okuyabilmek.

Örneklemde en az iki kişi daha önce TGA verisi görmüş, en az iki kişi ise yalnız
genel sayısal veri deneyimine sahip olmalıdır. Kinetik yöntem geliştiricileri,
ürün geliştiricileri ve önceki katılımcının ekranını görmüş kişiler dışlanır.

## 3. Onam ve gizlilik

Oturumdan önce katılımcıya şu noktalar yazılı ve sözlü açıklanır: çalışma gönüllüdür;
istediği anda gerekçe göstermeden durabilir; ürün değil kullanıcı değil arayüz test
edilmektedir; ekran ve ses kaydedilecektir; yalnız sentetik veri kullanılacaktır;
kişisel/kurumsal dosya yüklememelidir.

- Kimlik bilgisi ayrı onam dosyasında tutulur; ölçüm kaydı yalnız `P01`…`Pnn`
  takma kimliğini içerir.
- E-posta, isim, ekran görüntüsündeki kişisel klasörler ve hassas veri kanıt
  paketine girmez. Dosya seçici başlamadan önce çalışma klasörüne sabitlenir.
- Kayıt yerel ve şifreli diskte tutulur; bulut senkronizasyonu kapatılır.
- Ham ses/ekran kaydı son QA kararından 90 gün sonra silinir. Kimliksiz skor,
  fixture/build hash'leri ve karar özeti sürüm kanıtı olarak saklanabilir.
- Katılımcı kayıt onamı vermezse çalışmaya alınmaz; yalnız not tutulan farklı bir
  oturum bu protokolün kanıtı sayılmaz.

## 4. Build ve fixture dondurma

Test hedefi:
`release/Activation-Energy-Studio-v0.2.0.html`.

Oturumlardan önce koordinatör bir `UX_FIXTURE_MANIFEST.json` oluşturur ve şu
alanları dondurur: build SHA-256, her fixture SHA-256, üretim komutu/sürümü ve
beklenen tanı kodları. Deterministik manifestin içine volatile zaman yazılmaz;
çalışma paketinin oluşturulduğu UTC zaman ayrı koordinatör kaydında tutulur. Oturumlar arasında build veya fixture
değişirse önceki ve sonraki sonuçlar tek örneklemde birleştirilmez.

Normatif çalışma kopyaları ve manifest şu komutla deterministik üretilir:

```bash
npm run fixtures:usability
npm run verify:usability-fixtures
```

Güncel kilit `evidence/usability/v0.2.0/UX_FIXTURE_MANIFEST.json` dosyasıdır.
Koordinatör çalışma başlangıcında bu klasörü salt-okunur study paketine kopyalar;
elle düzenlenen bir fixture aynı çalışma revizyonuna kabul edilmez.

Ana kaynak `examples/synthetic_kas_150.csv` deneysel veri değildir; 5, 10, 20 ve
40 K/min olmak üzere dört koşulu içerir. Aşağıdaki çalışma kopyaları kaynak dosya
değiştirilmeden deterministik olarak üretilir:

| Kimlik | Çalışma dosyası ve kesin üretim kuralı | Beklenen hedef |
|---|---|---|
| UX01 | `study_bundle/UX01_four_run_mass_ambiguous.csv`: ana kaynaktan `Alpha [0-1]` sütununu çıkar; başlığı tam olarak `Temperature,Mass percent,Heating rate,Run,Sample,Atmosphere` yap; diğer tüm hücreleri koru. | Dört koşulu guided happy path; sıcaklık=`°C`, kütle=`%`, β=`K/min`, aşama=`300–380 °C`. |
| R1 | `study_bundle/R1_two_rates.csv`: ana kaynağın yalnız β=5 ve 10 satırlarını, özgün başlıkla koru. | `INSUFFICIENT_DISTINCT_HEATING_RATES` |
| R2 | `study_bundle/R2_no_common_alpha.csv`: her β için ana kaynağın ilk üç satırını tut; α değerlerini sırasıyla β=5 için `.10,.20,.30`, β=10 için `.40,.50,.60`, β=20 için `.70,.80,.90`, β=40 için `.80,.90,.95` yap; diğer hücreleri koru. | `NO_COMMON_ALPHA_RANGE` |
| R3 | `study_bundle/R3_nonmonotonic_alpha.csv`: ana kaynağı kopyala; yalnız β=40, α=.60 hücresini `.45` yap. | `NON_MONOTONIC_ALPHA` |
| R4 | `study_bundle/R4_context_conflict.csv`: ana kaynağı kopyala; β=40 satırlarında `Sample` değerini `synthetic-other` yap. | `INCONSISTENT_CONTEXT` |
| R5 | `study_bundle/R5_nonlinear_time.csv`: ana kaynağa `Time [min]` sütunu ekle; her koşu içinde satır sırasına göre `0,1,…,8` yaz; diğer hücreleri koru. | `NONLINEAR_HEATING_UNSUPPORTED` |
| C1 | `study_bundle/C1_peaks.tsv`: aşağıdaki dört β–Tp satırını kullan; her Tp aynı β koşusunun ana kaynakta α=0.50 satırındaki °C sıcaklığının K'ye tam dönüşümüdür. UX03'te değiştirilmemiş ana kaynakla birlikte yükle. | Ayrı `Ea(α)` ve Kissinger sonucu |
| W1 | `study_bundle/W1_three_rates.csv`: ana kaynağın yalnız β=5,10,20 satırlarını koru. | `LIMITED_HEATING_RATES` |
| W2 | Değiştirilmemiş `examples/synthetic_kas_150.csv`. | `NUMERICAL_DERIVATIVE` |
| W3 | `study_bundle/W3_low_r2.csv`: β=`5,10,20,40` için merkez sıcaklıkları sırasıyla `600,700,620,760 K`; her koşuda `(α,T)` satırları `(.4,T-5),(.5,T),(.6,T+5)`; run=`noisy-β`, sample=`synthetic-noisy`, atmosphere=`N2`. | `LOW_R2` |
| W4 | `study_bundle/W4_multistep.csv`: ana kaynağı kopyala; α≥.60 satırlarında sıcaklığa β=5,10,20,40 için sırasıyla `0,5,15,35 °C` ekle. | `MULTISTEP_EA_VARIATION` |

`C1_peaks.tsv` içeriği:

```text
beta [K/min]\tTp [K]\trun\tsample\tatmosphere
5\t589.582119\tbeta-5\tsynthetic-kas\tN2
10\t602.381849\tbeta-10\tsynthetic-kas\tN2
20\t615.731123\tbeta-20\tsynthetic-kas\tN2
40\t629.665286\tbeta-40\tsynthetic-kas\tN2
```

Önceki taslak C1 değerleri eğrilerin ölçülen sıcaklık aralığı dışında kaldığı için
`KISSINGER_PEAK_OUTSIDE_RUN_RANGE` ile reddedildi. İnsan oturumu başlamadan yapılan
bu negatif ön kontrol korunmuş, C1 kuralı kaynak-içi α=0.50 sıcaklığına revize
edilmiş ve fixture hash'i yeniden kilitlenmiştir.

İnsan oturumu başlamadan otomatik ön kontrol her R/W dosyasının içe aktarılabildiğini
ve tabloda yazan hedef kodu gerçekten ürettiğini göstermelidir. Hedef kod çıkmayan
fixture sessizce düzeltilmez; yeni hash ve manifest revizyonu gerekir.

## 5. AC-UX-01 — Beş karar aşamalı mutlu yol

Moderatörün aynen okuyacağı görev:

> “Bu sentetik dört koşulu TGA dosyasından aktivasyon enerjisi analizi oluşturun.
> Sıcaklık °C, kütle yüzde, ısıtma hızı K/min'dir. Numune `synthetic-kas`, atmosfer
> N2 ve incelenecek kütle kaybı aşaması 300–380 °C'dir. Proje adını `UX01 Four Run`,
> süreci `sentetik kütle kaybı` yapın. Geçerli yöntemleri çalıştırın ve PDF raporu
> dışa aktarın. Formül veya harici hesap makinesi kullanmayın.”

Beklenen makro karar yolu yalnız şunlardan oluşur:

1. `UX01_four_run_mass_ambiguous.csv` dosyasını yüklemek.
2. Sütun eşleştirmesini ve üç birimi doğrulamak.
3. Numune/atmosfer bilgisini ve `300–380 °C` aşama bağlamını doğrulamak.
4. **Geçerli yöntemleri çalıştır** seçimini yapmak.
5. **PDF raporu** dışa aktarmak ve dosyanın açıldığını doğrulamak.

Başka ayar ekranı, yöntem seçme kararı, formül girişi, veri düzeltme veya hata
kurtarma yeni bir makro aşama sayılır.

### Sayım kuralı

- **Makro karar:** yukarıdaki beş amaçtan biri. Aynı paneldeki sütun ve birim
  seçimleri tek makro aşama, ayrıca ayrı atomik kararlar olarak kaydedilir.
- **Semantik UI aktivasyonu:** dosya bırakma/seçme, bir select değerini değiştirme,
  bir metin alanını tamamlayıp terk etme veya bir düğmeyi etkinleştirme bir adettir.
  Tuş sayısı sayılmaz.
- **Ham pointer tıklaması:** ekran kaydından görülen her gerçek click/tap ayrıca
  sayılır. Native select ve işletim sistemi farkları bu sayıyı etkileyebileceği için
  geçiş eşiği semantik aktivasyona dayanır.
- Dosya seçicideki işletim sistemi tıklamaları `os_picker_clicks` olarak ayrı tutulur;
  uygulama sayısına katılmaz.
- Geri alma, yanlış seçim, aynı kontrolü tekrar değiştirme ve rescue sonrası her
  eylem sayılır; çıkarılmaz.

## 6. AC-UX-02 — Beş bilimsel ret metni

Her katılımcı R1–R5'in tamamını görür. Sıra etkisini azaltmak için döngüsel sıra
kullanılır: P01=`R1…R5`, P02=`R2…R5,R1`, …, P05=`R5,R1…R4`.

Her dosyada katılımcı analizi çalıştırır. Hedef ret görünür olduğunda moderatör
kod adını açıklamadan şu üç soruyu aynen sorar:

1. “Sorun nedir?”
2. “Bu neden bilimsel olarak risklidir?”
3. “Devam edebilmek için veride veya analiz bağlamında neyi düzeltirsiniz?”

Her yanıt `0=yanlış/boş`, `1=arayüz metniyle uyumlu` olarak üç boyutta bağımsız
puanlanır. Katılımcının kodu ezberden okuması yeterli değildir. Yanıtlar önce bir
değerlendirici tarafından puanlanır; rastgele seçilen kayıtların en az `%40`ı
ikinci değerlendirici tarafından kör puanlanır ve uyuşmazlıklar kayda geçirilir.
Her R1–R5 gözlemi, aynı katılımcının tutulmuş ekran ve ses kaydı SHA-256
değerlerini ve `startSeconds < endSeconds` kayıt aralığını taşımalıdır. Serbest
metin yanıtın kayıt içindeki yeri bu aralıkla insan denetçiye gösterilir.

Beş katılımcı × beş ret senaryosu için ikinci değerlendirici örneklemi sonradan
elle seçilmez. Manifest bir `seed`, `method=SHA256_SEEDED_ASC_V1` ve 10 scenario
ID taşır. Her `Pnn:Rn` kimliği için
`SHA256(UTF-8(seed + NUL + scenarioId))` hesaplanır; digest artan, eşitlikte
scenario ID artan sıralanır ve ilk 10/25 kayıt seçilir. Recorder bu listeyi exact
olarak yeniden hesaplar; listede olmayan ikinci puanlamayı reddeder.

## 7. AC-UX-03 — Ea(α) / Kissinger anlama sorusu

Katılımcı değiştirilmemiş ana kaynak ile `C1_peaks.tsv` dosyasını birlikte yükleyip
analizi çalıştırır. İki sonuç görünürken moderatör aynen sorar:

> “Ekrandaki Ea(α) eğrisi ile Kissinger tek-tepe Ea değeri aynı sonucun iki farklı
> sunumu mudur? Her biri hangi dönüşüm veya fiziksel olaya dayanır ve birbirinin
> yerine raporlanabilir mi?”

Tam doğru yanıt şu dört öğenin tamamını içermelidir: (a) aynı sonuç olmadıkları;
(b) `Ea(α)`nın sabit dönüşüm düzeylerinde çoklu hız karşılaştırmasından oluşan ve
α boyunca değişebilen bir eğri olduğu; (c) Kissinger'ın aynı fiziksel aşamanın
β–Tp tepe kaymasından gelen tek, peak-specific değer olduğu; (d) iki sonucun
birbirinin yerine kullanılamayacağı. İpucu veya ikinci deneme verilmez.
Bu C1 ilk-yanıt gözlemi de exact ekran/ses kayıt hash'lerine ve pozitif uzunluklu
bir `startSeconds`–`endSeconds` aralığına bağlanır.

## 8. AC-UX-04 — Uyarı görünürlüğü

Bu bölüm katılımcı görüşü değil, gözlemci tarafından yapılan aynı-build görsel
denetimdir. W1–W4 ayrı ayrı çalıştırılır. Her hedef kod için:

1. Ana sonuç yüzeyinde, scroll ile erişilebilir açık metin/etiket olarak görünür;
   yalnız tooltip, konsol veya log içinde değildir.
2. Aynı analizden üretilen PDF'nin gövdesinde kod veya eşdeğer açık Türkçe uyarı
   görünür.
3. UI ekran görüntüsü, PDF, PDF sayfa render'ı ve SHA-256 değerleri kanıt paketine
   eklenir.

Dört kod × iki yüzeyden oluşan 8 hücreli matris doldurulur. Bir uyarının yalnız
genel “Sınırlı” rozetiyle temsil edilmesi hedef kod görünürlüğü sayılmaz.

### 8.1 Aynı-build teknik ön kanıt

Güncel locked release için makine-üretimli ön paket şu komutlarla yeniden
üretilebilir ve doğrulanabilir:

```bash
npm run capture:warning-visibility
npm run verify:warning-visibility
npm run test:warning-visibility-evidence
```

Paket
`evidence/usability/v0.2.0/warning-visibility-current/` altında her W1–W4 vakası
için gerçek sistem-Chrome sonuç-kartı PNG'sini, gerçek indirilen PDF'yi, bütün
PDF sayfa render'larını, vaka kaydını ve SHA-256 manifestini tutar. Aynı kodun
yöntem/α düzeyinde çok kez oluşması UI/PDF'de okunabilir bir grup ve kapsam
sayacıyla gösterilir; ham bulgular JSON denetim izinden silinmez.

Bu otomasyon yalnız **8/8 teknik yüzey kanıtıdır**. Manifestin
`humanVisualReview.status` alanı `NOT_PERFORMED` ve kapı-kapatma alanı `false`
kalmak zorundadır; testler yeniden-hash yapılmış sahte insan-PASS etiketini de
reddeder. İsimli gözlemci PNG/PDF render'larını bizzat inceleyip sekiz hücrenin
tamamını kaydetmeden AC-UX-04 `PASS` olmaz.

## 9. Önceden sabitlenmiş geçiş eşikleri

| Kapı | PASS eşiği |
|---|---|
| AC-UX-01 | 5/5 katılımcı rescue olmadan, formül yazmadan, en fazla 5 makro aşamada doğru PDF'yi üretir; semantik uygulama aktivasyonu medyanı ≤12 ve hiçbir katılımcıda >15 değildir. |
| AC-UX-02 | Beş hedef ret de UI'da `Sorun / Neden önemli / Çözüm` anlamını taşır; 25 senaryonun tamamında problem ve düzeltme doğru ifade edilir; 75 boyut puanının toplamı ≥%90 ve hiçbir ret senaryosu <%80 değildir. |
| AC-UX-03 | Geçerli katılımcıların **tamamı** ilk yanıtta dört maddelik rubriği 4/4 karşılar. 4/5 bile FAIL'dir. |
| AC-UX-04 | `LIMITED_HEATING_RATES`, `LOW_R2`, `NUMERICAL_DERIVATIVE`, `MULTISTEP_EA_VARIATION` için UI+PDF matrisi 8/8 ve bütün kanıt hash'leri mevcut olur. |

Bir eşik karşılanmazsa sonuç `FAIL`dir; “neredeyse geçti” veya katılımcı çıkarmayla
`PASS` yapılmaz. Teknik hata oturumu gerçekten geçersiz kılarsa neden, kayıt zamanı
ve yeniden test kimliği açıkça yazılır; ilk kayıt silinmez.

## 10. Kanıt kayıt şeması

Her katılımcı için bir JSON kayıt ve ilişik hash'li artefaktlar tutulur:

```json
{
  "studyId": "UX-v0.2.0-YYYYMMDD",
  "participantId": "P01",
  "eligibility": {"eligible": true, "quantitativeField": true,
    "csvXlsxAndPlotLiteracy": true, "tgaExperience": "basic|none",
    "routineKineticsLastTwoYears": false, "productContributor": false,
    "turkishScientificReading": true, "priorParticipantExposure": false,
    "excludedReason": null},
  "consent": {"version": "UX-CONSENT-v1", "signedAt": "ISO-8601",
    "recording": true, "signedConsentReference": "CONSENT-P01"},
  "environment": {"os": "...", "browser": "...", "zoomPercent": 100, "networkOff": true},
  "build": {"path": "release/Activation-Energy-Studio-v0.2.0.html", "sha256": "..."},
  "fixtureManifestSha256": "...",
  "happyPath": {
    "startedAt": "ISO-8601", "endedAt": "ISO-8601", "completed": true,
    "macroDecisionCount": 5, "semanticUiActivations": 11, "rawPointerClicks": 14,
    "osPickerClicks": 0, "rescues": 0, "formulaUsed": false,
    "exportPath": "...", "exportSha256": "...", "openedSuccessfully": true
  },
  "refusals": [{"fixtureId": "R1", "targetCode": "...", "visible": true,
    "problemScore": 0, "riskScore": 0, "actionScore": 0, "verbatimAnswer": "...",
    "recordingTimecode": {"screenRecordingSha256": "...",
      "audioRecordingSha256": "...", "startSeconds": 120, "endSeconds": 150}}],
  "comprehension": {"verbatimAnswer": "...", "score": 0, "hintGiven": false,
    "rubric": {"notSameResult": false, "eaAlphaIsConversionProfile": false,
      "kissingerIsPeakSpecific": false, "notInterchangeable": false},
    "recordingTimecode": {"screenRecordingSha256": "...",
      "audioRecordingSha256": "...", "startSeconds": 360, "endSeconds": 410}},
  "deviations": [],
  "evidence": [
    {"kind": "screen-recording", "path": "P01-session.mp4", "sha256": "..."},
    {"kind": "audio-recording", "path": "P01-session.wav", "sha256": "..."},
    {"kind": "screenshot", "path": "P01-result.png", "sha256": "..."}
  ],
  "observer": "O01", "scoredAt": "ISO-8601"
}
```

Her katılımcıda tam bir `screen-recording` ve tam bir `audio-recording` zorunludur.
Örnekteki `screenshot` isteğe bağlı ek kanıttır; recorder yalnız ekran ve ses
kaydını zorunlu tutar ve ekran görüntüsü bunlardan birinin yerine kullanılamaz.
Ekran kaydı `.m4v/.mkv/.mov/.mp4/.webm` ve en az 64 KiB; ses kaydı
`.aac/.caf/.flac/.m4a/.mp3/.ogg/.wav` ve en az 16 KiB olmalıdır. Dosyalar farklı
SHA-256 değerleri taşımalıdır. Uzantı ve minimum boyut yalnız kaba bütünlük
ön-kontrolüdür; oynatılabilirlik, süre, gerçek ekran içeriği ve duyulabilir ses
insan kanıt denetiminde kontrol edilir.

Çalışma düzeyinde ayrıca katılımcı akış diyagramı, dışlanan/yarım oturum listesi,
AC bazında pay ve güven aralığı, tıklama dağılımı, ikinci değerlendirici uyuşması,
8 hücreli warning matrisi, tüm sapmalar ve nihai `PASS/FAIL/NOT TESTED` kararı
raporlanır. Kişisel isimler bu rapora girmez.

Çalışma manifesti katılımcı JSON yollarına ek olarak exact build/fixture hash'ini,
dışlanan oturumları, 25 ret senaryosunun en az %40'ı için kör ikinci puanlamayı,
seed'li SHA-256 sıralamasından gelen exact `secondRaterSelection` listesini,
W1–W4 × UI/PDF sekiz hücreli hash'li warning matrisini ve koordinatörün imzalı
kayıt referansını taşır. Bütünlük ve önceden sabitlenmiş eşikler şu komutla
fail-closed değerlendirilir:

```json
"secondRaterSelection": {
  "seed": "UX-v0.2.0-YYYYMMDD-second-rater-v1",
  "method": "SHA256_SEEDED_ASC_V1",
  "selectedScenarioIds": ["P03:R4", "P01:R2", "... exact 10 deterministic ID ..."]
}
```

```bash
npm run record:usability-study -- \
  --manifest evidence/usability/observed-study/study-input.json \
  --output evidence/usability/observed-study/evidence-record.json
```

`scripts/record-usability-study.mjs` kişisel kimlik alanlarını, e-posta adreslerini,
hash uyuşmazlıklarını, yanlış fixture/build'i, eksik onamı, `%100` dışındaki
zoom'u, eksik/aynı/çok küçük/yanlış uzantılı ekran-ses kayıtlarını, geçersiz veya
yanlış hash'e bağlanan R1–R5/C1 zaman kodlarını, deterministik olmayan ikinci
puanlama seçimini, yinelenen senaryoyu ve yetersiz kör ikinci puanlama kapsamını
reddeder. Araç eşikleri hesaplar; ancak medya dosyalarını decode etmez ve
oynatılabilir süreyi, yakalanmış ekran/ses içeriğini, katılımcı kimliğini, onamın
gerçekliğini veya gözlemin doğruluğunu doğrulayamaz. Her kayıt insan tarafından
içerik denetiminden geçmelidir; üretilen kayıt bu nedenle
`AUTOMATED_THRESHOLDS_RECORDED_AWAITING_HUMAN_EVIDENCE_AUDIT` sınırında kalır.

## 11. Mevcut durum ve kapanış kuralı

Arayüz bileşenleri ve otomatik copy testlerine ek olarak 11 dosyalık fixture
manifesti deterministik olarak dondurulmuş; UX01 guided seçimleri, R1–R5 exact
retleri, W1–W4 exact uyarıları ve revize C1 çift-sonuç yolu gerçek ingestion→core
ön kontrolünden geçirilmiştir. Katılımcı/cohort kayıtlarının bütünlüğünü ve
önceden sabit eşikleri doğrulayan fail-closed recorder testlidir. Bağımsız katılımcılar çalıştırılmamış, anlama
sorusu puanlanmamış ve insan oturumlarına ait UI/PDF kayıtları toplanmamıştır.
Dolayısıyla insan kullanılabilirlik kapıları **henüz kapanmamıştır**.

`CURRENT_VALIDATION_STATUS.md` ancak imzalı onamların varlığı (kimliksiz referansla),
tam JSON kayıtları, hash'li ekran/PDF kanıtları ve yukarıdaki önceden belirlenmiş
eşiklerin hesaplanmasından sonra güncellenebilir.
