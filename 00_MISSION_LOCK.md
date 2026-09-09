# Aktivasyon Enerjisi Yazılımı — MVP Misyon Kilidi

**Belge durumu:** Normatif v1.0  
**Tarih:** 2026-07-18  
**Üst hedef:** [`../ULTIMATE_GOAL.md`](../ULTIMATE_GOAL.md)  
**Bilimsel sözleşme:** [`01_SCIENTIFIC_SPEC_V1.md`](01_SCIENTIFIC_SPEC_V1.md)  
**Tamamlanma kapıları:** [`02_ACCEPTANCE_CRITERIA.md`](02_ACCEPTANCE_CRITERIA.md)

## 1. Kilitli ana hedef

231 yerel kaynak PDF kaydından oluşturulmuş kanıt korpusuna dayanan; Windows, macOS ve Linux üzerinde çevrimdışı çalışan; uzman olmayan bir kullanıcının çoklu ısıtma hızlı TGA/DTG CSV–XLSX verilerini birkaç yönlendirilmiş adımda yükleyip **bilimsel olarak izlenebilir görünür aktivasyon enerjisi** hesaplayabildiği doğrulanmış bir MVP geliştirmek.

Korpus birimi özellikle **PDF kaydıdır**: güncel bütünlük defteri 230 primary PDF ve `paper_008` yayınına bağlı bir supplementary PDF (`paper_009`) bulunduğunu doğrular. Bu nedenle “231 ayrı makale” veya bütün kayıtlar için “Q1/Q2” ifadesi yerel bir journal-quartile defteri oluşturulmadan yazılım iddiası değildir.

MVP şu yöntemleri kapsar:

- dönüşüme bağlı `Eα` için FWO/OFW, KAS ve Starink;
- türev verisi yeterliyse koşullu Friedman;
- ayrı ve açıkça “tepe yöntemi” olarak sunulan Kissinger;
- veri uygunluğu, birim, dönüşüm `α`, reaksiyon aşaması ve kalite kontrolleri;
- güvensiz/kararsız durumda hesaplamayı reddetme;
- `Eα`, regresyon tanıları, regresyon belirsizliği ve yeniden üretilebilir PDF–CSV–JSON raporu;
- sentetik, elle hesaplanmış ve ham verisi erişilebilir gerçek verilerle sayısal doğrulama.

## 2. Çözülen gerçek problem

Kullanıcıdan denklem, logaritma tabanı, Kelvin dönüşümü, dönüşüm sıcaklığı eşleştirmesi veya eğim katsayısı bilmesi beklenmeyecektir. Yazılım bu hata-prone iş akışını denetlenebilir bir hesaplama zincirine dönüştürür:

`dosya → sütun/birim eşleme → bağlam ve aşama kontrolü → α → ortak α aralığı → yöntem uygunluğu → regresyon → görünür Ea → tanılar → rapor`

Ürün yalnızca sayı üreten bir “formula calculator” değildir. Doğru yöntemin gerekli girdilere sahip olup olmadığını sınayan ve bilimsel sınırı görünür kılan bir karar-destek aracıdır.

## 3. Hedef kullanıcı

- TGA/DTG cihaz çıktısı bulunan fakat kinetik yöntem uzmanı olmayan araştırmacı, mühendis ve öğrenci;
- hesabı yeniden üretmek, denetlemek veya hakeme sunmak isteyen uzman kullanıcı;
- çevrimdışı/veri mahremiyetli bir çalışma ortamına ihtiyaç duyan laboratuvar.

Yazılım yöntemi kullanıcı adına “doğru mekanizma” ilan etmez. Uygun yöntemleri önerir, hesaplar, sınırları açıklar ve karar izini saklar.

## 4. V1 girdi sözleşmesi

### 4.1 Eğri analizi

V1’in ana girdisi aynı numune–süreç–atmosfer–aşama bağlamına ait, pozitif ve yaklaşık sabit en az üç farklı ısıtma hızında kaydedilmiş non-izotermal TGA/DTG eğrileridir.

Desteklenen dosyalar:

- `.csv` ve `.tsv`;
- `.xlsx` — birden çok sayfa varsa kullanıcı sayfayı açıkça seçer.

Gerekli nicelikler:

- sıcaklık ve birimi;
- ısıtma hızı ve birimi — sütun veya dosyaya/run’a özgü açık metadata;
- doğrudan `α` **veya** kütle/kütle yüzdesi;
- Friedman için tercihen `dα/dt`; yoksa zaman veya sıcaklık ekseninden sayısal türev üretmek için yeterli örnekleme;
- run kimliği ile numune, atmosfer ve reaksiyon aşaması bağlamı.

### 4.2 Kissinger tepe analizi

Kissinger için her ısıtma hızına karşılık tek ve aynı fiziksel olaya ait `Tp/Tmax` değerleri kabul edilir. Tepe örtüşmesi veya tepenin hangi aşamaya ait olduğunun belirsiz olması otomatik hesabı durdurur.

## 5. V1 çıktı sözleşmesi

Her analiz aşağıdakileri üretir:

- giriş dosyası, satır ve sütun kökenini koruyan normalize veri özeti;
- her yöntem için `uygun`, `uyarıyla uygun` veya `reddedildi` kararı ve gerekçe kodu;
- FWO, KAS, Starink ve uygun olduğunda Friedman için `Eα(α)`;
- Kissinger için ayrı bir tek-tepe görünür `Ea` sonucu;
- her regresyon için kullanılan noktalar, eğim, kesişim, artıklar, SSE, `R²`, residual standard error, eğim standart hatası ve %95 Student-t güven aralığı;
- birim, logaritma tabanı, `α` aralığı, türev kaynağı, dışlanan gözlem ve bütün uyarılar;
- insan-okunur PDF, tidy CSV ve tam yeniden üretilebilir JSON raporu.

Sonuç etiketi bağlamsız “malzemenin aktivasyon enerjisi” olamaz. Asgari etiket:

> `[numune] — [süreç/aşama] — [atmosfer] — [yöntem] — [α aralığı veya Tp] için görünür aktivasyon enerjisi`

## 6. Değiştirilemez bilimsel ilkeler

1. **Görünürlük ilkesi:** Çıktı `apparent/görünür Ea` olarak adlandırılır; tek ve değişmez malzeme sabiti gibi sunulmaz.
2. **Birim ilkesi:** Kinetik denklemlerde sıcaklık Kelvin’dir. Belirsiz birim tahmin edilmez.
3. **Log ilkesi:** Her formül logaritma tabanını açıkça taşır; FWO’nun onluk ve doğal log biçimleri karıştırılmaz.
4. **Bağlam ilkesi:** Farklı numune, atmosfer veya fiziksel aşamalar tek regresyonda sessizce birleştirilmez.
5. **Ortak dönüşüm ilkesi:** İzokonversiyonel regresyon yalnız tüm run’larda gözlenen ortak `α` değerlerinde yapılır; extrapolation yasaktır.
6. **Şeffaf işleme ilkesi:** Sıralama, düzeltme, clipping, smoothing, veri silme veya birim varsayımı sessizce yapılmaz.
7. **Reddetme ilkesi:** Hesaplanabilir olmak bilimsel olarak uygun olmakla aynı değildir. Kritik koşul sağlanmıyorsa sayı üretilmez.
8. **Yöntem ayrımı:** Kissinger’ın tepeye dayalı tek değeri, izokonversiyonel `Eα` eğrisiymiş gibi gösterilmez.
9. **Belirsizlik ilkesi:** `R²` tek başına geçerlilik kanıtı değildir; regresyon belirsizliği ve artıklar raporlanır.
10. **İzlenebilirlik ilkesi:** Her rapor girdi satırına, dönüşüme, formül sürümüne, yazılım sürümüne ve uyarı kararına geri izlenebilir.
11. **Mekanizma sınırı:** FWO/KAS/Starink/Friedman sonucundan tek başına reaksiyon mekanizması veya `A` çıkarılmaz.
12. **Yerel çalışma ilkesi:** Analiz ve raporlama için ağ bağlantısı gerekmez; kullanıcı verisi varsayılan olarak cihazdan çıkmaz.

## 7. V1 kapsamı

### Kapsam içinde

- CSV/TSV/XLSX içe alma ve açık sütun/birim eşleme;
- non-izotermal, pozitif, yaklaşık doğrusal çoklu ısıtma programları;
- kütleden aşama-bazlı `α` hesabı veya doğrulanmış doğrudan `α` kullanımı;
- ortak `α` ızgarası ve doğrusal interpolasyon;
- FWO/OFW, KAS, Starink, koşullu Friedman;
- ayrı Kissinger `β–Tp` analizi;
- OLS regresyonu, %95 regresyon güven aralığı ve tanılar;
- yöntem uygunluk motoru, uyarı ve hard-refusal davranışı;
- PDF/CSV/JSON raporları;
- sentetik, elle hesaplanmış ve ham-gerçek veri doğrulaması;
- Windows/macOS/Linux çevrimdışı dağıtımı.

### V1 kapsamı dışında

- DSC ısı-akışı ve soğutma/kristalizasyon analizleri;
- izotermal deneyler ve doğrusal olmayan sıcaklık programları;
- Vyazovkin, Coats–Redfern, DAEM, master plots, deconvolution ve global model fitting;
- otomatik reaksiyon mekanizması atama;
- güvenilirliği kanıtlanmamış `A`, `ln A`, termodinamik parametre veya ömür tahmini;
- üst üste binmiş pikleri otomatik ayırma;
- PDF/grafik görüntüsünden ham eğri sayısallaştırma;
- bulut hesabı, kullanıcı hesabı veya zorunlu telemetri;
- makalelerin sonuç değerlerini “ground truth” sayıp ham veri olmadan yeniden hesaplama iddiası.

Bu dış kapsam maddeleri nihai ekosistem hedefinden çıkarılmış değildir; yalnız doğrulanmış MVP tamamlanana kadar ertelenmiştir.

## 8. Başarı ve tamamlanma tanımı

MVP yalnız arayüz açıldığı veya örnek bir sayı verdiği için tamamlanmış sayılmaz. Tamamlanma için [`02_ACCEPTANCE_CRITERIA.md`](02_ACCEPTANCE_CRITERIA.md) içindeki bütün `P0` kapıları kanıt artefaktlarıyla geçmelidir.

Asgari bitiş kanıtı:

- beş yöntemin formül ve eğim dönüşümleri bağımsız referans hesapla eşleşir;
- uygunluk motoru tanımlı güvensiz senaryoların hiçbirinde sonuç üretmez;
- belirsizlik ve provenance alanları PDF/CSV/JSON’da tutarlıdır;
- sentetik, elle hesaplanmış ve en az bir ham-verisi erişilebilir gerçek test geçer;
- aynı fixture Windows, macOS ve Linux’ta ağsız çalışır;
- uzman olmayan kullanıcı formül girmeden hedef iş akışını tamamlar;
- açık kritik/major bilimsel hata veya çözümsüz `P0` kapısı kalmaz.

`Technical PASS`, gerçek MVP tamamlanmasıyla aynı şey değildir. Sayısal test, bilimsel gözden geçirme, üç-platform offline smoke test ve rapor yeniden üretilebilirlik kapıları ayrı ayrı kapanmalıdır.

## 9. Yerel kanıt ve yönetişim izi

Bu belge, korpusu alanın tamamını temsil eden bibliyometrik census olarak görmez. Korpus yöntem, denklem, girdi/çıktı ve hata-sınırı kanıtı sağlar.

2026-07-18 canlı kaynak denetimi: 231 source PDF, 231 extraction note, 231 ready-finding dosyası, 3.121 kanonik kanıt satırı ve 2.066 method-matrix satırı. Bu sayılar release sırasında yeniden hesaplanmalıdır; sabit uygulama verisi değildir.

Ana kaynaklar:

- üst hedef: [`../ULTIMATE_GOAL.md`](../ULTIMATE_GOAL.md)
- işleme sırası: [`../01_PDF_Evidence_Extraction/00_Start_Here/paper_processing_order.csv`](../01_PDF_Evidence_Extraction/00_Start_Here/paper_processing_order.csv)
- kanonik kanıt tablosu: [`../01_PDF_Evidence_Extraction/05_Canonical_Evidence_Table/activation_energy_evidence.csv`](../01_PDF_Evidence_Extraction/05_Canonical_Evidence_Table/activation_energy_evidence.csv)
- yöntem matrisi: [`../01_PDF_Evidence_Extraction/06_Method_Evidence_Matrix/method_evidence_matrix.csv`](../01_PDF_Evidence_Extraction/06_Method_Evidence_Matrix/method_evidence_matrix.csv)
- hazır bulgular: [`../01_PDF_Evidence_Extraction/08_Ready_For_Methodology_Synthesis`](../01_PDF_Evidence_Extraction/08_Ready_For_Methodology_Synthesis)
- kalite uyarıları ve görsel kanıtlar: [`../01_PDF_Evidence_Extraction/07_Quality_Checks`](../01_PDF_Evidence_Extraction/07_Quality_Checks)

Kaynak PDF’ler ve çıkarım korpusu read-only bilimsel girdidir; yazılım çalışma alanı bunları değiştirmez.
