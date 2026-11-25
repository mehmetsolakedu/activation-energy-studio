# Chilean Oak yayını ve açık ham veri denetimi

Tarih: 2026-07-29  
Kapsam: Fernández-Andrade ve ark., *Industrial Crops & Products* 232
(2025) 121296; DOI `10.1016/j.indcrop.2025.121296`.

## Kesin karar

Bu veri seti gerçek, açık lisanslı ve yazılımın uçtan uca sınanması için
uygundur. Ancak yayındaki Tablo 3'ün bütün sayıları bilimsel olarak doğru
birer **hard oracle** kabul edilemez.

- Ham CSV bütünlüğü, örnekler, dört ısıtma hızı ve standart FWO/KAS/Friedman
  denklemleri hard test girdisi olabilir.
- Standart denklemlerle açıkça tanımlanmış yeniden hesap sonuçları, aynı
  ön-işleme sözleşmesi kullanıldığında deterministik test oracle'ıdır.
- Yayındaki FWO ortalamaları ham veriden bağımsız yeniden hesapla yakındır
  (beş örnekte MAE `1.008 kJ mol⁻¹`); yayın karşılaştırması için yararlı fakat
  tam eşitlik oracle'ı değildir.
- Yayındaki KAS ve Friedman ortalamaları karantinaya alınmalıdır. İki yöntemde
  de, yalnız FWO denklemine ait olan `1.052` Doyle katsayısının sonuçlara
  fazladan uygulanmış olabileceğine ilişkin güçlü ve yöntemler arası tutarlı
  bir adli sinyal vardır.
- `±` değerlerinin hangi sapma tanımına, kaç alfa noktasına ve hangi
  filtrelemeye dayandığı açıklanmadığı için hiçbir `±` değeri hard oracle
  değildir.
- Torr3 Friedman sapması yayın içinde çelişkilidir: Tablo 3 `±84`, ana metin
  `±87` verir.

Bu nedenle doğru test politikası “yayını ne pahasına olursa olsun aynen
üretmek” değil; önce standart denklemi ve birimleri doğrulamak, ardından yayın
farkını açıklamalı bir dış karşılaştırma olarak raporlamaktır.

## Birincil kaynaklar ve görsel kontrol

- [Yayınevi kaydı ve DOI](https://www.sciencedirect.com/science/article/pii/S0926669025008428)
- [Yazar tarafından yüklenmiş 18 sayfalık tam metin PDF](https://www.researchgate.net/profile/Serguei-Alejandro-Martin-2/publication/392531022_Assessing_the_contribution_of_torrefaction_during_Chilean_Oak_pyrolysis_A_kineticthermodynamic_study_and_evolved_gases_compositional_analysis/links/6849af3f43aad60b4c1642a6/Assessing-the-contribution-of-torrefaction-during-Chilean-Oak-pyrolysis-A-kinetic-thermodynamic-study-and-evolved-gases-compositional-analysis.pdf?download=1&source=post_page)
- [Mendeley Data v2, DOI 10.17632/gkhjh4v8tg.2](https://data.mendeley.com/datasets/gkhjh4v8tg/2)

Tam metin PDF'nin basılı 3. sayfası (TGA koşulları ve Eş. 7–11) ile basılı
8. sayfası (Şekil 5, dönüşüm aralığı, ana metin sonucu ve Tablo 3) render
edilerek elle kontrol edildi. Basılı 9. sayfadaki Şekil 6 başlığı da bütün
örnekler için üç izokonversiyonel yöntemin kullanıldığını doğrular. Uzak
sunucu oran sınırlaması nedeniyle kalıcı PNG kopyası bu klasöre alınamadı;
yukarıdaki doğrudan PDF bağlantısı ve sayfa numaraları denetim izidir.

## Deney ve veri sözleşmesi

PDF'nin yöntem sayfasına göre:

- Numune: kurutulmuş/işlem görmemiş Chilean Oak (*Nothofagus obliqua*).
- Torr1: `523 K, 30 min`.
- Torr2: `573 K, 15 min`.
- Torr3: `573 K, 30 min`.
- Torr4: `523 K, 15 min`.
- Cihaz: PerkinElmer STA 6000.
- Numune kütlesi: yaklaşık `10–15 mg`, alümina kroze.
- Ana TGA rampası: `323–1073 K`.
- Isıtma hızları: `5, 10, 20, 40 K min⁻¹`.
- Yayının verdiği N₂ debisi: `20 mL min⁻¹`.
- Bütün-biyokütle izokonversiyonel aralığı: `α=0.01–0.85`.
- Sonraki psödo-bileşen/dekonvolüsyon bölümü `α=0.01–0.98` kullanır; bu,
  Tablo 3 oracle'ıyla karıştırılmamalıdır.

Mendeley v2 içinde beş örneğin her biri için dört TGA CSV'si, toplam 20 dosya
vardır. İndirilen dosyaların SHA-256 değerleri Mendeley API kaydıyla birebir
eşleşti; ayrıntı `source_file_manifest.csv` içindedir.

## Yayında kullanılan denklemler

Makalenin Eş. 8, 10 ve 11'inin standartlaştırılmış yazımı:

Friedman:

`ln[(dα/dt)α] = ln[Aα f(α)] − Eα/(R Tα)`

Flynn–Wall–Ozawa:

`ln(βi) = ln[Aα Eα/(R g(α))] − 5.331 − 1.052 Eα/(R Tα,i)`

Kissinger–Akahira–Sunose:

`ln[βi/T²α,i] = ln[Aα R/(Eα g(α))] − Eα/(R Tα,i)`

Kritik ayrım: `1.052` katsayısı yalnız FWO eğiminden enerji çıkarılırken
kullanılır. KAS ve Friedman denklemlerinde yoktur.

Makale, `Ea` birimini `kJ mol⁻¹` verdikten sonra `R=8.314 kJ mol⁻¹ K⁻¹`
yazar. Bu boyutsal olarak hatalı birim etiketidir. Tutarlı seçenekler
`R=8.314 J mol⁻¹ K⁻¹` ve sonucun 1000'e bölünmesi veya doğrudan
`R=0.008314 kJ mol⁻¹ K⁻¹` kullanılmasıdır. Yayın sonuçlarının mertebesi de
8.314 değerinin `J` olarak kullanıldığını gösterir.

## Tablo 3'ün elle doğrulanmış yayım değerleri

Tam döküm `publication_table3_targets.csv` içindedir.

| Örnek | FWO Ea / Adj. r² | KAS Ea / Adj. r² | Friedman Ea / Adj. r² |
|---|---:|---:|---:|
| Oak | 176.9 ±7 / 0.9992 | 167.3 ±7 / 0.9991 | 168.2 ±9 / 0.9982 |
| Torr4 | 207.5 ±16 / 0.9857 | 197.9 ±16 / 0.9844 | 192.9 ±22 / 0.9727 |
| Torr1 | 194.5 ±12 / 0.9927 | 184.9 ±12 / 0.9919 | 189.2 ±24 / 0.9940 |
| Torr2 | 214.8 ±31 / 0.9831 | 205.0 ±31 / 0.9816 | 213.4 ±55 / 0.9813 |
| Torr3 | 221.2 ±64 / 0.9655 | 211.3 ±64 / 0.9623 | 213.7 ±84 / 0.9626 |

Ana metin Friedman ortalamalarını Oak, Torr1, Torr2, Torr3, Torr4 sırasıyla
`168±9, 189±24, 213±55, 214±87, 193±22 kJ mol⁻¹` olarak yuvarlar. Torr3
ortalaması tabloyla yuvarlama düzeyinde uyumludur (`213.7 → 214`), fakat
sapma `84` yerine `87` yazılmıştır.

Yayın `±` işaretini tanımlamaz. Bunun alfa boyunca popülasyon standart
sapması mı, örnek standart sapması mı, başka bir “deviation” mı olduğu ve
ortalamanın hangi alfa adımıyla alındığı belirtilmemiştir. Tablo başlığı
sadece “average Activation Energy” der.

## Bağımsız ham-veri yeniden hesabı

Bu denetimde kullanılan açık ve yeniden üretilebilir sözleşme:

1. `α=0.01, 0.02, …, 0.85` (85 nokta).
2. Her hız eğrisinde hedef alfa için ilk yukarı geçiş ve doğrusal
   enterpolasyon.
3. Sıcaklık doğrudan `Temperature (K)` kolonundan; `1/T` yeniden hesaplandı.
4. Dört hız için sıradan en küçük kareler.
5. `R=8.314462618 J mol⁻¹ K⁻¹`; sonuç `kJ mol⁻¹`.
6. FWO'da Doyle `1.052`; standart KAS ve Friedman'da bu katsayı yok.
7. Friedman için veri setinin verdiği `dα/dt (min⁻¹)` kullanıldı.
8. Ek yumuşatma uygulanmadı.
9. Düzeltilmiş `r²`: her alfa regresyonunda `n=4`, tek açıklayıcı değişken.

Sonuçların tamamı `independent_standard_reproduction.csv` içindedir.

| Örnek | FWO ort. | KAS ort. | Friedman ort. |
|---|---:|---:|---:|
| Oak | 176.450 | 175.589 | 176.253 |
| Torr4 | 207.473 | 208.175 | 202.625 |
| Torr1 | 192.685 | 192.591 | 196.646 |
| Torr2 | 212.898 | 213.695 | 219.906 |
| Torr3 | 220.355 | 221.402 | 222.416 |

Yayın ortalamasına karşı standart yeniden hesabın MAE değerleri:

- FWO: `1.008 kJ mol⁻¹`
- KAS: `9.010 kJ mol⁻¹`
- Friedman: `8.089 kJ mol⁻¹`

FWO yakınlığı veri-eşleşmesini ve temel enterpolasyon sözleşmesini destekler.
KAS ile Friedman'ın aynı yönde, yaklaşık yüzde beş düşük yayımlanması ise
yalnız ön-işleme farkıyla açıklanması güç, ortak bir ölçek sinyalidir.
Makalenin Oak için verdiği yaklaşık `156–186 kJ mol⁻¹` per-alfa aralığı da
bu denetimdeki standart FWO (`155.3–185.4`) ve standart KAS
(`155.0–184.6`) aralıklarıyla uyumludur. Bu, en azından ham sıcaklık
kaymalarının ve standart integral hesapların doğru veri ailesini kullandığını
destekler.

## `1.052` katsayısı için adli sınama

Yayımlanan KAS değerleri `1.052` ile geri çarpıldığında standart KAS ham-veri
hesabına beş örnekte ortalama mutlak `1.040 kJ mol⁻¹` yaklaşır. Yayımlanan
Friedman değerlerinde aynı geri çarpma standart Friedman hesabına ortalama
mutlak `2.076 kJ mol⁻¹` yaklaşır. Ayrıntı `factor_1_052_forensic_test.csv`
içindedir.

Oak için ayrıca `α=0.05, 0.10, …, 0.85` ızgarası şu güçlü kontrolü verir:

- standart FWO: `176.908` (yayın `176.9`);
- standart KAS: `176.015`; `176.015/1.052 = 167.315` (yayın `167.3`);
- standart Friedman: `177.419`; `177.419/1.052 = 168.649`
  (yayın `168.2`).

KAS'ta `T²` teriminde yanlışlıkla Celsius kullanılması da sayıları yaklaştıran
alternatif bir açıklamadır (beş örnekte MAE yaklaşık `1.033 kJ mol⁻¹`).
Ancak bu açıklama Friedman sapmasını açıklamaz. FWO'ya özgü `1.052`
katsayısının hem KAS hem Friedman farkını aynı anda açıklaması daha yalın ve
yöntemler arası daha güçlü bir sinyaldir.

Bu bulgu doğrudan çalışma dosyası veya yazar teyidi olmadan “kanıtlanmış
yazar hatası” değildir. Kesin ifade: **yayın değerleri, KAS ve muhtemelen
Friedman sonuçlarına FWO'nun 1.052 katsayısının fazladan uygulanmış olmasıyla
yüksek ölçüde uyumludur.**

Friedman için karşı kanıt/temkin noktası da vardır: makale Şekil 6D'de Torr3
enerjisinin `600 kJ mol⁻¹` üstüne çıktığını söyler. Bu denetimin standart
Friedman serisi `α=0.85` yakınında `608.6 kJ mol⁻¹` değerine ulaşırken,
aynı seri `1.052` ile bölünürse tepe yaklaşık `578.6 kJ mol⁻¹` olur. Yazarların
türev/yumuşatma işlemi daha yüksek bir tepe üretmiş olabilir veya hata yalnız
Tablo 3 ortalama hücrelerinde bulunabilir. Bu yüzden KAS için `1.052` sinyali
çok güçlü, Friedman için ise güçlü fakat daha az kesin kabul edilmelidir.

Ek şüphe: Tablo 3'te KAS `±` değerleri beş örneğin tamamında FWO `±`
değerleriyle aynıdır (`7,16,12,31,64`). Bağımsız standart KAS eğrilerinin
saçılımı FWO'ya yakın olsa da özellikle büyük saçılımlarda tam aynı yuvarlak
değerlerin tekrarı, yöntemsel açıklama veya çalışma sayfası olmadan güvenilir
oracle kabul edilmemelidir.

## Ham veri/metadata kalite uyarıları

1. CSV kolonu `1/T (K-1)` gerçekte `1000/T` içerir. Örneğin
   `T=326.21 K` satırında değer `3.0655`'tir; gerçek `1/T`,
   `0.0030655 K⁻¹` olmalıdır. Kolon etiketi ve data dictionary açıklaması
   yaklaşık `1000×` ölçek hatalıdır. Yazılım bu kolonu kullanmamalı;
   Kelvin sıcaklıktan tersini yeniden hesaplamalıdır.
2. `metadata_files.csv` TGA `heating_rate` değerlerini `0.083333333,
   0.166666667, 0.333333333, 0.666666667` verir; bunlar 5/10/20/40 K min⁻¹
   hızlarının K s⁻¹ karşılığıdır, fakat kolon birimi tanımlanmamıştır. Ham
   TGA dosyasının ilk satırı ve dosya adı açıkça K min⁻¹ kullanılmalıdır.
3. Aynı metadata TGA satırlarında `gas_flow=40` verirken makalenin yöntem
   sayfası N₂ için `20 mL min⁻¹` verir. Bu, Ea eğimini değiştirmez fakat
   deney provenance alanı olarak çözülmemiş kaynak çelişkisidir.
4. Data dictionary, `dα/dT` ve `dα/dt` için “state numerical
   differentiation method” der fakat gerçek türev/yumuşatma algoritmasını
   belirtmez. Friedman yeniden üretiminin yayınla birebir olmamasında bu
   belirsizlik önemlidir.
5. Dönüşüm kolonu çoğu dosyada `[0,1]` aralığındadır; Torr4-10 dosyasında
   üst uç `1.000008`'e çıkar. Türevin reaksiyon dışı bölgelerde sıfır/negatif
   gürültüsü vardır. Logaritmik Friedman regresyonu pozitif hız ve geçerli
   alfa penceresi kontrolü yapmalıdır.
6. 40 K min⁻¹ dosyaları yaklaşık 394 K'de başlarken diğer hızlar yaklaşık
   326 K'de başlar. `α=0.01–0.85` hedefleri yine mevcuttur; dosya başı
   sıcaklığını bütün hızlarda eşit varsayan test yazılmamalıdır.

## Test katmanlarına aktarılacak oracle kararı

### Hard pass

- 20 ham TGA dosyasının adları, boyutları ve SHA-256 değerleri.
- Beş örnek × dört hız yapısı.
- Ham dosyanın `Temperature (K)`, kütle, dönüşüm ve türev kolonlarının
  ayrıştırılması.
- Kelvin üzerinden yeniden hesaplanan `1/T`.
- Standart denklem testi: FWO'da `1.052`, KAS ve Friedman'da yok.
- Yukarıdaki açık ön-işleme sözleşmesi aynen seçilirse
  `independent_standard_reproduction.csv` sayıları.

### Soft publication comparison

- Tablo 3 FWO ortalamaları: yöntemsel yakınlık/uyarı eşiği için kullanılabilir,
  tam eşitlik için değil.
- Yayının örnek sıralaması, dönüşüm aralığı ve ortalama Adj. r²'nin genel
  `>0.9` iddiası.

### Karantina / oracle değil

- Tablo 3 KAS ve Friedman ortalamalarının standart-doğru sonuç diye zorunlu
  kılınması.
- Bütün `±` değerleri ve exact ortalama Adj. r² değerleri.
- Torr3 Friedman `±84/±87`.
- Metadata'daki `1/T`, belirsiz `heating_rate` birimi ve `gas_flow`.

## Kalan belirsizlikleri kapatacak tek kesin yol

Yazarlardan veya ek materyalden şu çalışma bilgileri gerekir:

- kullanılan alfa noktalarının tam listesi;
- her hız için alfa–sıcaklık enterpolasyon yöntemi;
- türev ve yumuşatma algoritması/parametreleri;
- geçersiz veya düşük uyumlu noktaların filtrelenip filtrelenmediği;
- `±` tanımı;
- per-alfa FWO/KAS/Friedman değerleri ve regresyon tabloları;
- KAS/Friedman enerji formülünün çalışma sayfasındaki gerçek hücre ifadesi.

Bu bilgiler gelene kadar bir tutarsızlıkta standart denklemi doğru uygulayan
yazılım başarısız sayılmamalı; yayın hedefi “manual-review expected” olarak
işaretlenmelidir.
