# Gerçek Veri Bilimsel Doğrulama Hedefi

**Başlangıç tarihi:** 2026-07-29  
**Platform sınırı:** Parallels kullanılmayacaktır. Yerel doğrulama native macOS'ta,
platform taşınabilirliği ise GitHub-hosted macOS, Ubuntu ve Windows 11
çalıştırıcılarında sınanacaktır.

## Hedef promptu

Activation Energy Studio'yu sonuçları yayımlanmış gerçek TGA/DTG verileriyle
bilimsel olarak doğrula. Chilean Oak, NR–CELS, Dryad Polyisoprene ve
Coal–SPT–Paraffin veri kümelerinde:

1. Resmî kaynak URL/DOI, veri kümesi sürümü, lisans, indirilen dosya adı,
   byte boyutu ve SHA-256 değerini kilitle.
2. Ham dosya semantiğini; sıcaklık, zaman, ısıtma hızı, kütle/TG, DTG,
   türev işareti ve türev zaman birimini açıkça kaydet.
3. Dönüşümü `α=(m0-m)/(m0-mf)` ile hesaplanan hatlarda `m0`, `mf`, reaksiyon
   aşaması ve sıcaklık penceresini görünür kıl. Sıralama, smoothing, baseline,
   clipping, interpolasyon veya dal seçimini sessizce yapma.
4. Uygun yöntemler için üretim yazılımından ve uygulama kodunu içe aktarmayan
   bağımsız bir referans hesaplayıcıdan α-bazlı Ea, regresyon girdileri,
   eğimler, R² ve özet değerler üret.
5. Bu sonuçları yayımlanmış değerlerle önceden tanımlanmış toleranslar içinde
   karşılaştır. Yayın tablosunu tek başına hakikat/oracle kabul etme.
6. Her uyuşmazlıkta ham ölçümden en az bir seçili noktayı elle veya ikinci,
   bağımsız hesaplama yolu ile yeniden hesapla. Kelvin/Celsius dönüşümü,
   β birimi, DTG işareti, dakika/saniye, log tabanı, yöntem katsayısı,
   α tanımı, stage/baseline/smoothing, yuvarlama ve olası transkripsiyon
   hatalarını denetle.
7. Kanıtı şu dört hükümden yalnız biriyle sınıflandır:
   `YAZILIM_HATASI`, `ON_ISLEME_VEYA_PROTOKOL_FARKI`,
   `YAYIN_VEYA_VERI_SORUNU`, `COZULEMEYEN_BELIRSIZLIK`.
8. Yazılım hatası bulunursa kodu düzelt, regresyon testi ekle ve bütün
   doğrulama zincirini aynı final build üzerinde yeniden çalıştır.
9. Son kararda hangi iddiaların geçtiğini, hangilerinin yalnız tanısal
   olduğunu ve hangi dış insan/platform kapılarının açık kaldığını açıkça yaz.

## Kabul ölçütü

En az bir resmî ham veri kümesinde kaynak dosyadan üretim girişine, bilimsel
çekirdeğe, bağımsız oracle'ya ve elle kontrole uzanan uçtan uca eşleşme
sağlanmalıdır. Diğer veri kümeleri için tam eşleşme zorunlu değildir; ancak
farkların kaynağı dürüst, yeniden üretilebilir ve kanıt-bağlı bir hükümle
raporlanmalıdır. Bir makale veya veri dosyasının insan üretimi olması nedeniyle
hata içerebileceği her zaman gerçek bir hipotez olarak sınanmalı, hiçbir sonuç
yayına uydurulmamalıdır.

## Evrensellik sınırı

Bu doğrulama, test edilen yöntem/formül/sürüm/veri azaltma yolları için
uygulama doğruluğu kanıtı sağlayabilir. Tek başına bütün malzemeler, bütün
cihazlar, bütün ön-işleme protokolleri veya “her bilgisayar” için evrensel
bilimsel doğruluk iddiası oluşturmaz.
