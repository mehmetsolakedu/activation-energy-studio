# Activation Energy Studio v0.3 — 5 dakikalık hızlı başlangıç

Uygulama çevrimdışı çalışan tek bir HTML dosyasıdır. Kurulum veya Parallels
gerekmez. `Activation-Energy-Studio-v0.3.0.html` dosyasını güncel bir Chrome,
Edge, Firefox veya Safari ile açın.

## 1. Örnek veya veri seçin

İlk kullanım için **Basit mod** ve üç gerçek örnekten birini seçin:

- **Şili Meşesi:** dört ham CSV, FWO/KAS/Starink, α=0,05–0,85.
- **Paper010 ravent:** resmi DTG'den türetilmiş dα/dt, Friedman,
  α=0,05–0,80.
- **Paper063 XPS:** bağımsız β–Tp tablosu, yalnız Kissinger.

Kendi veriniz için CSV, TSV, TXT veya XLSX dosyalarını bırakın. Isıtma hızları
farklı dosyalardaysa hepsini birlikte seçin.

## 2. Önizlemeyi doğrulayın

Eşleme kartında sıcaklık, kütle/α, dα/dt veya DTG anlamı, ısıtma hızı, birimler,
numune, atmosfer ve fiziksel aşamayı kontrol edin. Cihaz profili yalnız öneridir;
**onay vermeden uygulanmaz**. Özellikle genel DTG sütununu doğrudan dα/dt kabul
etmeyin; işareti, birimi ve kütle referanslarını doğrulayın.

Eğri önizlemesinde doğru bozunma aşamasını ve dönüşüm aralığını gördüğünüzden
emin olun. Kararsız birim, iki olası başlık/sayfa, örtüşen aşama veya eksik hız
varsa uygulama analizi durdurur.

## 3. Analiz edin, kararı okuyun, dışa aktarın

Yöntemi çalıştırın ve önce karar kartını okuyun:

1. **RAPORLANABİLİR**
2. **DİKKATLE RAPORLANABİLİR**
3. **HESAPLANDI FAKAT GÜVENİLMEZ**
4. **HESAPLAMA REDDEDİLDİ**

Ardından nedenleri, uyarıları, regresyonları, hız sayısını ve önerilen sonraki
deneyi inceleyin. JSON yeniden üretim kaydıdır; CSV sayısal sonuç tablosudur;
PDF okunabilir proje raporudur. Üçünü birlikte saklayın.

## Bilimsel sınır

Çıktı tek ve değişmez bir malzeme sabiti değildir. Görünür aktivasyon enerjisi;
numune, atmosfer, fiziksel aşama, yöntem, ön işleme ve seçilen α aralığına
bağlıdır. Regresyon güven aralığı tüm deneysel ve model belirsizliğini kapsamaz.

Paper063 örneği makale içeriğinden CC BY 4.0 altında türetilmiştir; ayrı bir ham
veri seti veya veri seti lisansı yoktur.

Dosya bütünlüğünü `SHA256SUMS.v0.3.0.txt` ile doğrulayın. Hata bildirimi için
`SUPPORT.md` dosyasını izleyin veya yeniden üretilebilir raporu
<mailto:mehmetsolak@siirt.edu.tr?subject=Activation%20Energy%20Studio%20v0.3%20bug%20report>
adresine gönderin.
