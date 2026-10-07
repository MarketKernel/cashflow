# Cashflow

<!-- languages -->
<h3 align="center">
<a href="../../README.md">🇬🇧 English</a> ·
<a href="README.zh.md">🇨🇳 中文</a> ·
<a href="README.hi.md">🇮🇳 हिन्दी</a> ·
<a href="README.es.md">🇪🇸 Español</a> ·
<a href="README.fr.md">🇫🇷 Français</a> ·
<a href="README.ar.md">🇸🇦 العربية</a> ·
<a href="README.bn.md">🇧🇩 বাংলা</a> ·
<a href="README.pt.md">🇧🇷 Português</a> ·
<a href="README.ru.md">🇷🇺 Русский</a> ·
<a href="README.ur.md">🇵🇰 اردو</a> ·
<a href="README.id.md">🇮🇩 Bahasa Indonesia</a> ·
<a href="README.de.md">🇩🇪 Deutsch</a> ·
<a href="README.ja.md">🇯🇵 日本語</a> ·
<a href="README.mr.md">🇮🇳 मराठी</a> ·
<a href="README.te.md">🇮🇳 తెలుగు</a> ·
<b>🇹🇷 Türkçe</b> ·
<a href="README.uk.md">🇺🇦 Українська</a>
</h3>
<!-- /languages -->

**Cashflow**, her harcamayı kaydetmeden kişisel finansları takip eder. Hesaplarınızı,
borçlarınızı ve düzenli gelir ile ödemelerinizi bir kez kurarsınız. Arada bir **mutabakat
yaparsınız**: gerçek bakiyeleri girersiniz. Uygulama ne kadar paranın kayıt dışı kaldığını
hesaplar, önümüzdeki ayları tahmin eder, paranın ne kadar süre yeteceğini ve istediğinizi ne
zaman alabileceğinizi söyler.

Uygulamanın tamamı, çevrimdışı çalışan tek bir bağımsız HTML dosyasıdır: hesap yok, bulut yok,
ağ isteği yok. Veriler, tarayıcının bu cihazda tuttuğu bir SQLite veritabanıdır (dosyanın
içinde, WebAssembly'ye derlenmiş SQLite). Aynı sayfa, kurulabilen ve kendi penceresinde
çalışan bir PWA'dır.

![Cashflow: para birimine göre hesaplar, kişisel para, rapor ve tahmin](../cashflow.png)

## Nasıl kullanılır

1. Sürümlerden `cashflow-<version>.html` dosyasını indirin (veya kendiniz derleyin:
   `./build.sh`) ve bir tarayıcıda açın — diskten açmak sorun değil.
2. Baz para birimini seçin: tüm toplamlar bu birimde gösterilir. **Ayarlar**'da, sahip
   olduğunuz diğer para birimlerini kurlarıyla birlikte ekleyin — elle girilir, uygulama
   hiçbir zaman internete bağlanmaz.
3. **Hesaplar**'da, hesaplarınızı (bir kart, nakit, bir mevduat, bir borsa) ve borçlarınızı
   (bir kredi kartı, bir kredi, ödünç alınan para) güncel bakiyeleriyle birlikte ekleyin.
4. **Mutabakat yap**'a basın (veya <kbd>R</kbd>). Her alanda zaten beklenen bakiye bulunur;
   farklı olanı düzeltin ve kaydedin. Tahmin buradan başlar.
5. **Düzenli**'de maaşı, kirayı, abonelikleri, kartın aylık ödemesini ekleyin — günlük,
   haftalık, aylık veya yıllık olarak. **Tek seferlik**'te düzenli olanların kapsamadığını
   ekleyin: bir satın alma, bir prim, planlanan bir tatil.
6. Her bir iki haftada bir yeniden mutabakat yapın. Rapor size neyin kayıt dışı kaldığını,
   paranın ne kadar süre yeteceğini söyler; **Hedefler**'deki hedefler ise ne zaman
   alınabileceklerini gösterir.

### Telefonda

Sekmeler alt tarafta bir çubuğa taşınır ve formlar ekranın altında sayfa olarak açılır;
klavye, yazılmakta olan alanı kapatmaz. Çevrimiçi sürümü kurun: Android'de Chrome'un ⋮ menüsü
→ Uygulamayı yükle; iOS'ta Paylaş → Ana Ekrana Ekle. Cihazlar arasında senkronizasyon yoktur:
verileri taşımak için birinde dışa, diğerinde içe aktarın (Ayarlar → Veriler).

## Nasıl çalışır

### Mutabakat

Bir mutabakat, belirli bir andaki tüm hesap ve borçların gerçek bakiyelerinin bir anlık
görüntüsüdür. Form, her hesap için kayıtların ne beklediğini gösterir: son seferinde bulunan
bakiye artı o hesaba ait, o zamandan beri gerçekleşen her işlem. Yalnızca farklı olanı
değiştirirsiniz. Anlık görüntü, o anın bakiyelerini, adlarını, ücretlerini ve kurlarını saklar
ve asla yeniden hesaplanmaz: bir hesabı yeniden adlandırmak, arşivlemek, bir işlemi düzenlemek
veya baz para birimini değiştirmek geçmiş mutabakatları olduğu gibi bırakır. Yalnızca
sonuncusu silinebilir — yanlışlıkla yapılan bir mutabakatı geri almak için.

### Kayıt dışı para nereden gelir

Uygulama, her para birimi için beklediği miktarı toplar — son seferinde bulunan bakiyeler, o
zamandan beri oluşturulan hesapların açılış bakiyeleri ve aralıktaki her düzenli ve tek
seferlik işlem — ve bunu girdiğinizle karşılaştırır. Fark, kayıt dışı paradır: eksi,
kaydedilmemiş bir harcama anlamına gelir; artı, kaydedilmemiş bir gelir anlamına gelir. Bu,
baz para birimindeki toplam üzerinden değil, her para birimi için ayrı ayrı hesaplanır; böylece
iki mutabakat arasındaki bir kur değişikliği harcama sayılmaz. Yeni bir hesap kendi açılış
bakiyesiyle gelir, bu yüzden birini oluşturmak kayıt dışı gelir sayılmaz; içinde para kalan
birini arşivlemek paranın nereye gittiğini sorar (başka bir hesaba mı, yoksa harcandı mı),
böylece bu da kayıt dışı kalmaz.

### Tahmin ve "Para şu tarihe kadar yeter"

Tahmin, son mutabakattan başlar ve o zamandan beri gerçekleşen her işlemi ekler — bu "şu an
beklenen" değerdir. Oradan itibaren ufka kadar (varsayılan olarak beş yıl) gün gün ilerler:
düzenli işlemler, planlanan tek seferlik işlemler ve kapatılmadığı sürece kayıt dışı
harcamanın ortalama hızı (son 90 gündeki mutabakatların kayıt dışı parası, gün sayısına
bölünerek). Kayıt dışı gelir hesaba katılmaz. "Para şu tarihe kadar yeter", hesaplardaki
paranın sıfıra ulaştığı ilk andır; kişisel para (hesaplar eksi borçlar) daha önce sıfırın
altına inerse, o tarih ikinci sırada gösterilir. İkisi de ufuk içinde gerçekleşmezse rapor
paranın daha uzun süre yeteceğini söyler — ya da para artıyorsa, ayda ne kadar arttığını. Bir
hedefin tarihi, tahminin eşiğine ulaştığı ilk andır.

### Ücretler ve bir borcun ücreti onu neden büyütür

Bir hesabın ücreti, parası baz para birimine çevrildiğinde kaybedilen paydır: %1 ücretli bir
hesaptaki 1 000 USD, 1 000 × 41.5 × 0.99 = 41 085 UAH değerindedir. Bir borcun ücreti tam
tersi yönde çalışır — **bu bir varsayılan karardır**: bir borcu başka bir para biriminde veya
aradaki biri üzerinden geri ödemek, nominal değerinden daha pahalıya mal olur; bu yüzden %2
ücretli 200 USD'lik bir borç, 200 × 41.5 × 1.02 = 8 466 UAH borç olarak sayılır. Hesapların
dışındaki para ve hedeflerin fiyatları çıplak kurdan çevrilir.

### Bir işlemi silmek neden geçmişi değiştirmez

Düzenli bir işlemin sürümleri vardır. Düzenlemek, şu anda geçerli olan sürümü kapatır ve şu
andan itibaren yeni bir sürüm açar; silmek ise yalnızca kapatır. Son mutabakattan bu yana
geçen süre, o zaman geçerli olan sürümle sayılmaya devam eder; böylece bir sonraki mutabakat
şaşırtmaz ve zaten yapılmış mutabakatlar asla değişmez. Son mutabakattan önceki bir tarihe
sahip tek seferlik bir işlem kapalı bir dönemdedir: bir not olarak tutulabilir ama hiçbir
şeyi değiştirmez.

Kredi faizleri modellenmez: düzenli bir gider olarak ekleyin, geri ödemenin kendisini ise
borca yapılan bir transfer olarak ekleyin.

## Özellikler

- Para birimine göre gruplanmış, katlanabilir hesaplar ve borçlar; hem o para biriminde hem
  baz para biriminde toplamla; kişisel para büyük puntoyla.
- 2-10 harf ve rakamdan oluşan herhangi bir para birimi kodu (USD, EUR, USDT, BTC), kendi
  ondalık basamak sayısıyla; tutarlar küçük birimlerde tam sayı olarak tutulur, böylece
  yuvarlama kayması olmaz.
- Virgül veya nokta ile, binler arasında boşluk veya kesme işaretiyle girilen tutarlar ve
  basit aritmetik: `1200+350-50*2`.
- Günlük (bir saatle), haftalık, aylık (bir gün veya son gün) ya da yıllık düzenli işlemler;
  belirli bir andan itibaren ve bir tarihe kadar geçerli; kısa bir ayda 31'i o ayın son günü
  olur ve normal bir yılda 29 Şubat, 28'i olur. Saatler yereldir, bu yüzden günlük 09:00,
  saat değişiminde de 09:00 olarak kalır.
- Hızlı bir formla tek seferlik işlemler: imleç tutar alanında, Enter kaydeder, son
  kullanılan hesap hatırlanır.
- Farklı para birimlerindeki hesaplar arasında, alacaklı tarafa geçen tutarla transferler;
  bir borca yapılan transfer onu kapatır.
- Bir hafta, bir ay, 3 veya 6 ay ya da bir yıl için tahmin grafiği: kişisel para,
  hesaplardaki para, sıfır çizgisi ve hedefler; değerleri gösteren bir artı imleç ve aynı
  sayılar bir tablo olarak da.
- "Para artacak şekilde" (kişisel para en az fiyat artı bir pay kadar) veya "pay olarak"
  (fiyat kişisel paranın en fazla bir payı kadar) alınan hedefler; Alındı gideri kaydeder.
- Geçmiş bir mutabakat, Hesaplar sekmesini o zamanki hâliyle açar: ne beklendiğini, ne
  bulunduğunu ve aradaki dönemde ne kaydedildiğini gösterir.
- JSON olarak veya doğrudan SQLite dosyası olarak dışa ve içe aktarma; Chrome ve Edge'de, her
  değişiklikten sonra seçtiğiniz bir dosyaya yazılan otomatik bir kopya.
- Ayarlar'daki "Yeni veritabanı…": her şey, dışa aktarma sunan ve varsa PIN'i isteyen bir
  uyarının ardından boş bir veritabanıyla değiştirilir.
- Veritabanı oluşturulduğunda istenen dört rakamlı bir PIN: PIN girilene kadar sayfa hiçbir şey
  göstermez, ve her yanlış PIN bir sonraki denemeden önceki bekleme süresini bir saniyeden bir
  saate kadar ikiye katlar.
- Açık ve koyu temalar, 17 dil, Arapça ve Urduca için sağdan sola yazım, bir telefon düzeni.

## Klavye kısayolları

| Tuş | Ne yapar |
| --- | --- |
| <kbd>R</kbd> | Mutabakat yap |
| <kbd>N</kbd> | Açık sekmede yeni bir hesap, düzenli işlem veya hedef; Tek seferlik'te hızlı formun tutarı |
| <kbd>Enter</kbd> | Bir formda: sonraki alana geçer; sonuncusunda kaydeder |
| <kbd>Esc</kbd> | İletişim kutusunu kapatır |

Dokunmatik bir ekranda tuş ipuçları gösterilmez.

## Güvenlik ve gizlilik

- Hiçbir şey sayfadan dışarı çıkmaz. `src/app/template.html` içindeki İçerik Güvenliği
  Politikası'nda `default-src 'none'` ve `connect-src 'none'` bulunur; SQLite için
  WebAssembly'ye (`'wasm-unsafe-eval'`), dışa aktarma indirmesi için `blob:`'a izin verilir.
  Derleme, herhangi bir dış `src` veya `href` bulursa durur ve CI bunu tekrar kontrol eder.
- Veriler bu tarayıcının IndexedDB'sinde yaşar: SQLite veritabanının baytlarını tutan tek bir
  kayıt, her değişiklikten sonra bütün olarak yazılır, böylece bir kayıt asla yarım kalmaz.
  `localStorage` yalnızca dili, temayı, açık sekmeyi, katlanmış grupları, grafiğin dönemini ve
  yanlış bir PIN'den sonraki bekleme süresini tutar.
- Veritabanını veya içe aktarılan bir dosyayı okumak her alanı denetler: bozuk bir değer,
  uygulamayı durdurmak yerine varsayılanıyla değiştirilir.
- İlk kayıttan sonra uygulama, tarayıcıdan depolama alanını korumasını ister
  (`navigator.storage.persist()`), böylece azalan disk alanı verileri silmez.
- PIN, kilidi açık bir bilgisayarın başındaki birini uzak tutar, tarayıcının dosyalarını
  kopyalayan birini değil: veriler şifrelenmez. Yalnızca hash'i saklanır (bir tuzla birlikte
  PBKDF2), veritabanındaki ayarlar arasında, böylece bir dışa aktarma onu da taşır ve nereye
  aktarılırsa aktarılsın aynı PIN'i ister. Unutulan bir PIN kurtarılamaz: "PIN'i mi unuttunuz?"
  veritabanını siler ve yeni, boş bir tane başlatır.

## Çeviriler

İngilizce metin kodda kalır: şablonda `t('accounts', 'Reconcile')`, `tn('time', '{count} day
ago', '{count} days ago', n)` ve `data-i18n="context"` / `data-i18n-attr="context"`. İlk
argüman bağlamdır — bir dizenin arayüzün hangi bölümüne ait olduğudur; böylece aynı İngilizce
sözcük iki farklı yerde farklı şekilde çevrilebilir. `src/locales/<code>.json` sözlüğü, bağlamı
İngilizce metne ve çeviriye eşler:

```json
{
  "accounts": { "Reconcile": "Сверить" },
  "time": { "{count} days ago": { "one": "{count} день назад", "few": "{count} дня назад", "many": "{count} дней назад", "other": "{count} дня назад" } }
}
```

Sözlükte bulunmayan bir dize İngilizce olarak gösterilir. Sayı içeren bir metnin, dilin her
çoğul kategorisi için bir biçimi vardır (`Intl.PluralRules`), İngilizce çoğul biçimine göre
anahtarlanır. `npm run i18n`, her dil için henüz çevrilmemiş ve artık kullanılmayan dizeleri
listeler; `npm test`, her çevirinin İngilizce yer tutucularını koruduğunu ve tüm çoğul
biçimlere sahip olduğunu kontrol eder. "Cashflow" adı asla çevrilmez.

Bu README de çevrilir: her dil için bir tane olmak üzere `docs/readme/README.<code>.md`, her
birinin başında dillerin listesiyle birlikte. Buradaki bir değişiklik çevirilere de
yansıtılmalıdır.

## Derleme

```sh
./build.sh            # gerekiyorsa bağımlılıkları kurar, ardından build/cashflow.html'yi derler
npm install
npm run build         # -> build/cashflow.html ve build/pages/
npm run watch         # src/ içindeki değişikliklerde yeniden derler
npm run typecheck     # tsc --noEmit
npm test              # money, valuation, schedules, reconciliation, forecast, goals, state, SQLite, dictionaries
npm run test:browser  # derlenmiş sayfa ve PWA, başsız (headless) Chrome'da
npm run i18n          # her sözlükte eksik olan veya artık gerekmeyen dizeler
npm run check         # typecheck, test, build ve test:browser'ı sırayla çalıştırır
npm run shots -- shots/after  # derler, sonra her sekmenin ekran görüntüsünü shots/after'a alır
node tools/icons.mjs  # assets/icon.svg'den PWA'nın PNG simgelerini üretir
```

`build.mjs`, `src/app/main.ts`'yi esbuild ile bir IIFE olarak paketler — SQLite'ın
WebAssembly'si esbuild'in ikili yükleyicisi aracılığıyla bayt olarak dahil edilir — ve bunu,
stillerle ve simgeyle (bir data URI) birlikte `src/app/template.html`'nin içine yerleştirir.
Sonuç, yaklaşık 1.4 MB'lık `build/cashflow.html` dosyasıdır: büyük kısmı SQLite, ardından 16
sözlük.

Aynı çalıştırma `build/pages/`'i de yazar: bu sayfanın kurulabilir bir PWA hâli — bir
manifest bağlantısı ve sayfaya kendi worker'ını kaydetmesini söyleyen bir
`<meta name="service-worker">` ile `index.html`, `manifest.webmanifest`, simgeler ve sayfayı
çevrimdışı açılacak şekilde önbelleğe alan `sw.js`.

`tests/app.mjs`, derlenmiş sayfayı DevTools protokolü üzerinden başsız Chrome'da çalıştırır
(`tools/chrome.mjs`, bağımlılığı yok): ilk açılış, görevin örneklerindeki hesaplar ve
toplamları, bir hafta arayla −1 500 kayıt dışı olan iki mutabakat, geçmişi değiştirmeden bir
işlemi silme, geçmiş bir mutabakat, hedefler, dışa aktar → sil → içe aktar, PWA'nın çevrimdışı
çalışması ve güncellemesi, bir telefon ve diskten açılan sayfanın verilerini koruması. Zaman
beklenmez: sayfanınkinden önce yerleştirilen bir betik `Date.now()`'un yerini alır ve saat
dilimi Europe/Kyiv'dir, böylece saat değişimi olan bir hafta da test edilir.

## Sürümler ve yayınlar

Sürüm tek bir yerde, `package.json`'da yazılıdır. Derleme bunu sayfaya (ayarların altına) ve
PWA'nın önbellek adına yerleştirir. `v<version>` etiketli commit'in derlemesi sürümü olduğu
gibi gösterir; diğerleri commit'ini de ekler, `0.1.0+1a2b3c4`, böylece `main`'den bir sayfa
yayın sanılmaz.

```sh
npm version minor           # 0.1.0 -> 0.2.0: package.json, package-lock.json, bir commit ve v0.2.0 etiketi
git push --follow-tags      # etiket .github/workflows/release.yml'yi başlatır
```

Yayın iş akışı, etiket ile `package.json` uyuşmuyorsa durur; aksi hâlde
`cashflow-<tag>.html` ve `SHA256SUMS.txt`'yi ekler.

## GitHub Pages

`.github/workflows/pages.yml`, `main`'e her push'ta derler ve test eder, ardından
`build/pages/`'i GitHub Pages'e dağıtır (Settings → Pages → Source: GitHub Actions). Çevrimiçi
sürümün verileri kendi adresine aittir; diskten açılan bir kopyanın kendi verileri vardır.

Her dağıtım `sw.js` içindeki önbellek adını değiştirir, böylece tarayıcı yeni worker'ı
kendiliğinden fark eder — bağlantılı bir açılışta, uygulama açıkken birkaç saatte bir, veya
Ayarlar → Güncellemeleri kontrol et istendiğinde. Yeni worker kendi sürümünü kendi önbelleğine
indirir ve bekler; çalışan worker eski sayfayı sunmaya devam eder, çevrimdışıyken de. Ayarlar,
sekmesinde bir noktayla birlikte, o zaman "… sürümü hazır" der: Güncelle, bekleyeni kaydeder,
yeni worker'ın devreye girmesine izin verir ve sayfayı yeniden yükler; sayfa bir kez
güncellendiğini söyler. Düğme kullanılmazsa yeni sürüm, uygulamanın tüm pencereleri
kapatıldığında kendiliğinden başlar. İndirilen bir dosya olduğu sürüm olarak kalır; diskte
sabit bir sürüm için bir yayından `cashflow-<tag>.html` dosyasını alıp `SHA256SUMS.txt` ile
karşılaştırın.

## Yapı

```
src/core/             DOM yok: testler onu Node'da çalıştırır
  money.ts            küçük birimler; yazılan tutarları okuma ve aritmetik; bir dilde biçimlendirme
  valuation.ts        hesaplar ve borçlar, baz para biriminde, ücretlerle birlikte
  schedule.ts         düzenli bir işlemin ne zaman gerçekleştiği, yerel saatte
  flows.ts            işlemler, hesaplar ve para birimleri arasındaki para hareketleri olarak
  reconcile.ts        beklenen ve gerçek bakiyeler, anlık görüntü, kayıt dışı para ve hızı
  forecast.ts         ilerideki eğri, paranın ne zaman biteceği, bir eşiğe ne zaman ulaşılacağı
  goals.ts            bir hedefin eşiği, ilerlemesi ve tarihi
  pin.ts              veritabanının PIN'i: tuzlanmış hash'i, onun denetlenmesi, yanlışlardan sonraki bekleme
  state.ts            durumun türleri, okunanın denetlenmesi, eski belgelerin göçleri
  db.ts               SQLite'taki durum: şema ve göçleri, her kayıtta bir işlem (transaction)
  sqlite.ts           WebAssembly'si satır içine gömülü sql.js
  i18n.ts             t()/tn(), dil listesi, sayfanın işaretlemesini çevirme
src/app/              sayfanın kendisi: tek dosya ve PWA
  template.html       __STYLES__/__APP__/__ICON__ yer tutucularıyla işaretleme, CSP
  styles.css          palet, açık ve koyu temalar, telefon düzeni
  main.ts             başlatma, sekmeler, çizim, kısayollar
  store.ts            bellekteki durum, her değişiklikten kısa bir süre sonra SQLite ve IndexedDB'ye kaydedilir
  storage.ts          IndexedDB: veritabanının baytları, otomatik kopyanın dosya tanıtıcısı; persist()
  lock.ts             PIN isteyen ekran, yeni bir veritabanı sorusu, Ayarlar'daki kartı
  prefs.ts            localStorage: dil, tema, sekme, katlanmış gruplar, grafiğin dönemi
  accounts.ts         Hesaplar sekmesi, rapor, geçmiş, geçmiş bir mutabakat
  account-dialog.ts   hesap ve borçları oluşturma, düzenleme, arşivleme ve silme
  reconcile-form.ts   mutabakat formu
  recurring.ts        Düzenli sekmesi ve formu; işlemlerin sürümleri
  oneoff.ts           Tek seferlik sekmesi ve hızlı formu
  op-fields.ts        işlemlerin paylaştığı alanlar: tür, tutar, hesap veya para birimi, transfer
  goals.ts            Hedefler sekmesi, Alındı
  chart.ts            tahmin grafiği, elle çizilmiş SVG
  settings.ts         Ayarlar sekmesi: para birimleri ve kurlar, tahmin, dil, tema, veriler, PIN
  backup.ts           dışa ve içe aktarma (JSON ve SQLite), otomatik kopya
  update.ts           PWA'nın güncellemeleri
  ui.ts, dom.ts       iletişim kutuları, bildirimler, alanlar; DOM'u oluşturma
  format.ts, inputs.ts  arayüz dilinde tutarlar ve tarihler; tutar alanı
src/pwa/sw.js         Pages derlemesinin service worker'ı
src/locales/          her dil için bir sözlük
assets/               simge; pwa/, PWA için PNG boyutları
tests/                görevin sabit sayılarıyla çekirdeğin birim testleri; app.mjs, Chrome'daki sayfa
tools/                load.mjs, chrome.mjs, i18n.mjs, shots.mjs, sample.mjs, icons.mjs
docs/                 yukarıdaki ekran görüntüsü; readme/, bu README'nin diğer dillerdeki hâli
build/                derleme çıktısı; build/pages/, GitHub Pages için PWA
```

## Sınırlamalar

- Cihazlar arasında senkronizasyon yoktur: veriler girildiği tarayıcıda kalır. Taşımak, bir
  cihazda dışa aktarma, diğerinde içe aktarmadır.
- Döviz kurları elle girilir: uygulama bunlar için hiçbir zaman internete bağlanmaz.
- Diskten açılan bir sayfa, verilerini o tarayıcının yerel dosyalar için depolama alanında
  tutar. Chrome ve Edge bunu korur (tarayıcı testleri bunu kontrol eder); Firefox ve Safari
  normalde de korur, ancak bazı yapılandırmalar ve gizli pencereler korumaz — sayfa bu
  durumda üstte bunu belirtir ve yalnızca bellekte çalışır: verileri dışa aktarın veya kurulu
  uygulamayı kullanın.
- Kredi faizleri modellenmez; eklediğiniz düzenli bir gider olarak ele alınır.
- Her hedef kendi başına ölçülür: birini almak diğerlerinden düşülmez.

## Lisans

MIT — bkz. [LICENSE](../../LICENSE). sql.js (WebAssembly'ye derlenmiş SQLite) MIT lisanslıdır;
SQLite'ın kendisi kamu malıdır.
