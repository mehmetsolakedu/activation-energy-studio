# Gerçek veri bilimsel doğrulama — kesin hüküm raporu

**Tarih:** 2026-07-29  
**Hedef:** `REAL_DATA_VALIDATION_GOAL.md`  
**Platform sınırı:** Parallels kullanılmadı.

## Kesin karar

Activation Energy Studio'nun test edilen FWO, KAS, Starink ve Friedman
denklemleri ile regresyon çekirdeğinde, bağımsız oracle'larla çelişen bir
matematik yazılım hatası bulunmadı. Beş resmî gerçek-veri hattındaki bütün
sert üretim/core hedefleri geçti.

Bu sonuç “yayındaki her sayı doğrudur” anlamına gelmez. Tam tersine, ham
ölçümden yeniden hesaplama yayın ve veri paketlerinde tekrarlanabilir insan
üretimi sorunlar gösterdi. Yazılım bu değerlere uydurulmadı.

Ürün için hüküm **sınırlandırılmış bilimsel çekirdek PASS**'tir. Hüküm
“bütün TGA/DTG dosyalarında evrensel doğruluk” veya “her bilgisayarda
doğrulanmış release” değildir; gerçek hosted üç-OS koşusu, bağımsız bilimsel
reviewer ve kullanıcı çalışması dış kapıları açık kalır.

## Veri hattı karar matrisi

| Hat | Sert yazılım/oracle sonucu | Yayın karşılaştırması | Kesin sınıflandırma |
|---|---|---|---|
| Paper 010 RH | 16 α × KAS/FWO/Starink/Friedman üretim yolu Decimal oracle ile eşleşti | KAS/FWO ve özellikle Friedman Table 4 ham S2'den denklem-doğru biçimde çıkmıyor | Ön işleme/protokol farkı + yayın yöntem/etiket sorunu |
| Chilean Oak | 17 α × FWO/KAS/Friedman; bağımsız Decimal ve α=0.50 `bc` hesabı eşleşti | FWO yakın; basılı KAS standart KAS/1.052 ile tam yuvarlanıyor; Friedman yalnız yaklaşık | KAS: yayın/yöntem-uygulama sorunu; Friedman: çözülemeyen yayın/ön-işleme belirsizliği |
| NR–CELS | 18 UTF-16 TG/dTG eğrisi, 546 nokta ve 273 Friedman sonucu; Ea+n+eğim+kesişim+R² oracle ile eşleşti | Depozit Kinetics Neo farkları düşük α'da 16–28 kJ/mol'a çıkıyor | Açıklanmamış baseline/smoothing nedeniyle ön işleme/protokol farkı; ayrıca küçük yayın/veri transkripsiyon sorunları |
| Dryad LPI-01 | 21 FWO/KAS/Friedman slope/R² kaydı üretim core ile eşleşti | Table 4 yalnız yaklaşık; HBPI-01/HBPI-03 T20/T50/residue hücreleri karşı numunenin ham izini takip ediyor | Table 4: protokol belirsizliği; Table 3: yayın/veri sorunu |
| Coal nominal-10 mg paraffin | İki tekrar × dört hız; bütün fiziksel gruplar, dönüşümler, OLS, GA ve 24 Ea oracle ile eşleşti | 80.22/80.67/85.67 kJ/mol değerleri oracle'ya yakın; v2 eksik ve yanlış etiketli | Üretim PASS; v2 ve kopya tablo bulguları yayın/veri sorunu |

## Nicel özet

| Veri | Yöntem | Bağımsız ortalama Ea (kJ/mol) | Basılı/depozit karşılık |
|---|---|---:|---:|
| Oak | FWO | 176.9955 | 176.9 |
| Oak | KAS | 176.1047 | 167.3 |
| Oak | Friedman | 177.5065 | 168.2 |
| NR–CELS 30/45/55 | Friedman | 244.1924 / 265.0257 / 260.4823 | 245.3158 / 270.1748 / 263.3849 |
| Dryad LPI-01 | FWO / KAS / Friedman | 316.0424 / 321.1499 / 301.0240 | 319 / 324 / 330 |
| Coal paraffin | FWO / KAS / Friedman | 85.3446 / 80.2546 / 80.3049 | 85.67 / 80.67 / 80.22 |

Paper 010'un bağımsız ortalamaları KAS 131.0216, FWO 133.8459, Starink
131.3079 ve denklem-doğru Friedman 131.4393 kJ/mol'dür. Yayının RH Table 4
değerleri sırasıyla 106.28, 110.36 ve 358.47 kJ/mol'dür; bu tablo yazılım
oracle'sı değildir.

## Elle doğrulama ve yayın/data adjudication

- Oak α=0.50 noktası, sekiz ham bracketing satırından ayrı GNU `bc`
  scale-50 hesabıyla yeniden kuruldu. Standart KAS sonucu yayına değil
  Decimal oracle'ya eşleşti.
- Oak basılı KAS'ın, yalnız FWO'ya ait `1.052` katsayısının KAS'a taşınmasıyla
  basılı ondalığa geldiği bağımsız katsayı testiyle gösterildi.
- Dryad HBPI-01/HBPI-03 değerleri doğrudan iki numunenin resmî Weight/DTG
  izlerinden T20, T50, DTG tepe ve 580 °C residue olarak yeniden hesaplandı.
  Yalnız T20/T50/residue alanlarının karşı satırı izlediği kanıtlandı.
- Coal Mendeley v1/v2 dosyaları workbook topolojisi ve fiziksel koşu kimliği
  düzeyinde elle karşılaştırıldı. Tam 40 koşuyu koruyan v1 seçildi; eksik ve
  yanlış adlandırılmış v2 karantinaya alındı.
- NR–CELS için depozit dTG yolu, TG'den yedi noktalı yerel doğrusal türev yolu
  ve Kinetics Neo export'u birbirinden bağımsız tutuldu. İki ham
  rekonstrüksiyon orta α trendini doğrularken, yayımlanmayan proprietary
  preprocessing nedeniyle bire bir Kinetics paritesi iddia edilmedi.

## Yazılımda bulunan ve düzeltilen sorunlar

Bilimsel denklemlerde hata bulunmadı; ancak gerçek cihaz verisiyle çalışmayı ve
rapor izlenebilirliğini etkileyen ürün sorunları bulundu ve regresyon
testleriyle düzeltildi:

1. `.txt`, UTF-16LE/BE ve Windows-1252 cihaz dışa aktarımları için deterministik
   tarayıcı-içi decoding ve yapısal delimiter seçimi eklendi.
2. Metadata preamble'ı sonrası gerçek header satırı ve fiziksel boş satır
   numaraları kaynak provenance'ında korundu.
3. Otomatik zaman sütunu açıkça kapsam dışı bırakılabilir hale getirildi;
   hazır eşlemeyi yeniden inceleme yüzeyi eklendi.
4. Farklı sütuna remap edilirken eski birimin taşınması engellendi ve yeni
   birim doğrulaması zorunlu kılındı.
5. Uygulanmamış eşleme değişikliklerinin eski sonuçlarla yeni provenance
   üretmesi engellendi; analiz ve export yeniden okuma tamamlanana kadar
   kapatıldı.
6. TXT `textEncoding` ve sıfır-bazlı `headerRow` JSON rapor sözleşmesine
   eklendi; `stage` rolünün schema eksikliği düzeltildi.
7. Deneysel izotonik α düzeltmesi bağımsız incelemede sağlanmış α/dαdt'yi
   tutarsızlaştırma riski taşıdığı için final üründen tamamen çıkarıldı.
   Kabul edilen NR hattı ham TG+dTG semantiğini korur.

## Kanıt konumları

- Oak: `evidence/validation/oak-local/` ve
  `evidence/validation/oak-publication-audit/`
- NR–CELS: `evidence/validation/nr-cels/`
- Dryad: `evidence/validation/dryad-polyisoprene/`
- Coal: `evidence/validation/coal-spt-paraffin/`
- Makine-okunur kaynak/oracle kilitleri: `tests/fixtures/real/`
- Bütün fixture byte kilidi:
  `evidence/validation/FIXTURE_MANIFEST.v0.2.0.json`

## Açık sınırlar

- GitHub-hosted Windows 11, macOS ve Ubuntu gerçek koşu artefaktları henüz
  üretilmemiştir; workflow hazırdır ve Parallels gerektirmez.
- Bağımsız bilimsel reviewer imzası ve kimlik/imza gerçekliği denetimi yoktur.
- Beş uzman olmayan kullanıcıyla kullanılabilirlik çalışması yapılmamıştır.
- Bazı cihaz formatları vendor-binary olabilir; bu sürüm CSV/TSV/TXT/XLSX ile
  sınırlıdır.
- Aktivasyon enerjisi sonuçları numune, atmosfer, reaksiyon aşaması, yöntem ve
  α aralığına özgü görünür değerlerdir; tek ve değişmez malzeme sabiti değildir.
