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
<b>🇮🇩 Bahasa Indonesia</b> ·
<a href="README.de.md">🇩🇪 Deutsch</a> ·
<a href="README.ja.md">🇯🇵 日本語</a> ·
<a href="README.mr.md">🇮🇳 मराठी</a> ·
<a href="README.te.md">🇮🇳 తెలుగు</a> ·
<a href="README.tr.md">🇹🇷 Türkçe</a> ·
<a href="README.uk.md">🇺🇦 Українська</a>
</h3>
<!-- /languages -->

**Cashflow** melacak keuangan pribadi tanpa mencatat setiap pengeluaran. Anda menyiapkan
akun, utang, serta pemasukan dan pembayaran rutin sekali saja. Sesekali Anda melakukan
**rekonsiliasi**: memasukkan saldo sebenarnya. Aplikasi menghitung berapa uang yang tak
tercatat, memperkirakan bulan-bulan ke depan, memberi tahu berapa lama uang akan bertahan,
dan kapan Anda bisa membeli yang Anda inginkan.

Seluruh aplikasi ini adalah satu berkas HTML mandiri yang berfungsi tanpa koneksi internet:
tanpa akun, tanpa cloud, tanpa permintaan jaringan. Datanya adalah basis data SQLite (SQLite
yang dikompilasi menjadi WebAssembly, di dalam berkas itu sendiri) yang disimpan browser di
perangkat ini. Halaman yang sama juga merupakan PWA yang bisa dipasang dan berjalan di
jendelanya sendiri.

![Cashflow: akun menurut mata uang, uang pribadi, laporan, dan perkiraan](../cashflow.png)

## Cara penggunaan

1. Buka versi daringnya di <https://cash.marketkernel.com>, atau unduh
   `cashflow-<version>.html` dari rilis (atau bangun sendiri: `./build.sh`) dan buka di
   browser — dibuka dari disk pun tidak masalah.
2. Pilih mata uang dasar: setiap total ditampilkan dalam mata uang ini. Di **Pengaturan**,
   tambahkan mata uang lain yang Anda miliki beserta kursnya — dimasukkan secara manual,
   aplikasi tidak pernah terhubung ke internet.
3. Di **Akun**, tambahkan akun Anda (kartu, uang tunai, deposito, bursa) dan utang Anda
   (kartu kredit, pinjaman, uang yang dipinjam), masing-masing dengan saldo saat ini.
4. Tekan **Rekonsiliasi** (atau <kbd>R</kbd>). Setiap kolom sudah berisi saldo yang
   diharapkan; perbaiki yang berbeda lalu simpan. Perkiraan dimulai dari sini.
5. Di **Berulang**, tambahkan gaji, sewa, langganan, pembayaran bulanan kartu — harian,
   mingguan, bulanan, atau tahunan. Di **Insidental**, tambahkan yang tidak tercakup oleh
   yang rutin: pembelian, bonus, liburan yang direncanakan.
6. Setiap satu atau dua minggu, lakukan rekonsiliasi lagi. Laporan memberi tahu apa yang tak
   tercatat, berapa lama uang akan bertahan, dan target-target di **Target** memberi tahu
   kapan masing-masing bisa dibeli.

### Di ponsel

Tab berpindah ke bilah di bagian bawah, dan formulir terbuka sebagai lembar di bagian bawah
layar; papan ketik tidak menutupi kolom yang sedang diisi. Pasang versi daringnya dari
<https://cash.marketkernel.com>: di Android, menu ⋮ Chrome → Instal aplikasi; di iOS, Bagikan →
Tambahkan ke Layar Utama. Tidak
ada sinkronisasi antar perangkat: untuk memindahkan data, ekspor di satu perangkat dan impor
di perangkat lainnya (Pengaturan → Data).

## Cara kerjanya

### Rekonsiliasi

Rekonsiliasi adalah potret saldo sebenarnya dari semua akun dan utang pada satu momen.
Formulir menampilkan, untuk setiap akun, apa yang diharapkan catatan: saldo yang ditemukan
terakhir kali ditambah setiap operasi sejak saat itu yang menjadi milik akun tersebut. Anda
hanya mengubah yang berbeda. Potret ini menyimpan saldo, nama, biaya, dan kurs pada momen
itu, dan tidak pernah dihitung ulang: mengganti nama akun, mengarsipkannya, mengedit sebuah
operasi, atau mengubah mata uang dasar membuat rekonsiliasi lama tetap persis seperti
sebelumnya. Hanya yang terakhir yang bisa dihapus — untuk membatalkan rekonsiliasi yang
dibuat karena kesalahan.

### Dari mana asalnya uang yang tak tercatat

Untuk setiap mata uang, aplikasi menjumlahkan yang diharapkannya — saldo yang ditemukan
terakhir kali, saldo awal akun yang dibuat sejak itu, dan setiap operasi rutin maupun
insidental dalam rentang waktu tersebut — lalu membandingkannya dengan yang Anda masukkan.
Selisihnya adalah uang yang tak tercatat: minus berarti pengeluaran yang tidak tercatat, plus
berarti pemasukan yang tidak tercatat. Ini dihitung per mata uang, bukan pada total dalam
mata uang dasar, sehingga perubahan kurs tukar antara dua rekonsiliasi tidak dianggap sebagai
pengeluaran. Akun baru membawa saldo awalnya sendiri, jadi membuat satu akun bukan pemasukan
yang tak tercatat; mengarsipkan akun yang masih menyisakan uang akan menanyakan ke mana
perginya uang itu (akun lain, atau dibelanjakan) sehingga itu pun tidak menjadi tak tercatat.

### Perkiraan dan "Uang bertahan hingga"

Perkiraan dimulai dari rekonsiliasi terakhir dan menambahkan setiap operasi sejak saat itu —
itulah "perkiraan sekarang". Dari sana, perkiraan berjalan hari demi hari hingga cakrawala
(lima tahun secara bawaan): operasi rutin, operasi insidental yang direncanakan, dan, kecuali
dimatikan, laju rata-rata pengeluaran tak tercatat (uang tak tercatat dari rekonsiliasi dalam
90 hari terakhir, dibagi jumlah harinya). Pemasukan yang tak tercatat tidak dihitung. "Uang
bertahan hingga" adalah momen pertama uang di akun mencapai nol; jika uang pribadi (akun
dikurangi utang) turun di bawah nol lebih dulu, tanggal itu muncul sebagai yang kedua. Jika
tidak ada yang terjadi dalam cakrawala tersebut, laporan mengatakan uang bertahan lebih lama
— atau, jika bertambah, berapa banyak per bulan. Tanggal sebuah target adalah momen pertama
perkiraan mencapai ambang batasnya.

### Biaya, dan mengapa biaya utang membuatnya lebih besar

Biaya sebuah akun adalah bagian yang hilang ketika uangnya diubah ke mata uang dasar: 1 000
USD pada akun dengan biaya 1 % bernilai 1 000 × 41.5 × 0.99 = 41 085 UAH. Biaya sebuah utang
bekerja dengan cara sebaliknya — **ini adalah keputusan bawaan**: melunasi utang dalam mata
uang lain, atau melalui perantara, menelan biaya lebih dari nilai nominalnya, sehingga utang
200 USD dengan biaya 2 % dihitung sebagai 200 × 41.5 × 1.02 = 8 466 UAH yang harus dibayar.
Uang di luar akun dan harga target dikonversi pada kurs telanjang.

### Mengapa menghapus sebuah operasi tidak mengubah masa lalu

Sebuah operasi berulang memiliki versi. Mengeditnya menutup versi yang berlaku saat ini dan
membuka versi baru mulai sekarang; menghapusnya hanya menutupnya saja. Waktu sejak
rekonsiliasi terakhir tetap dihitung dengan versi yang berlaku saat itu, sehingga
rekonsiliasi berikutnya tidak mengejutkan, dan rekonsiliasi yang sudah dibuat tidak pernah
berubah. Operasi insidental yang bertanggal sebelum rekonsiliasi terakhir berada dalam
periode yang tertutup: ia bisa disimpan sebagai catatan, tetapi tidak mengubah apa pun.

Bunga pinjaman tidak dimodelkan: tambahkan sebagai pengeluaran rutin, dan pembayarannya
sendiri sebagai transfer ke utang tersebut.

## Fitur

- Akun dan utang dikelompokkan menurut mata uang, bisa dilipat, dengan total dalam mata uang
  itu dan dalam mata uang dasar; uang pribadi ditampilkan dengan huruf besar.
- Kode mata uang apa pun dengan 2-10 huruf dan angka (USD, EUR, USDT, BTC), dengan jumlah
  desimalnya sendiri; jumlah disimpan sebagai bilangan bulat dalam unit terkecil, sehingga
  tidak ada selisih pembulatan.
- Jumlah yang diketik dengan koma atau titik, spasi atau tanda kutip di antara ribuan, dan
  aritmetika sederhana: `1200+350-50*2`.
- Operasi berulang harian (dengan waktu), mingguan, bulanan (satu tanggal, atau hari
  terakhir), atau tahunan, berlaku sejak suatu momen hingga suatu tanggal; tanggal 31 pada
  bulan yang lebih pendek menjadi hari terakhir bulan itu, dan 29 Februari pada tahun biasa
  menjadi tanggal 28. Waktu bersifat lokal, sehingga jam 09:00 harian tetap pada 09:00 saat
  pergantian waktu musim.
- Operasi insidental dengan formulir cepat: kursor berada di kolom jumlah, Enter menyimpan,
  akun terakhir yang digunakan diingat.
- Transfer antar akun dengan mata uang berbeda, dengan jumlah yang dikreditkan; transfer ke
  utang melunasinya.
- Grafik perkiraan untuk satu minggu, satu bulan, 3 atau 6 bulan, atau satu tahun: uang
  pribadi, uang di akun, garis nol, dan target; garis silang penunjuk dengan nilai-nilainya,
  dan angka yang sama juga sebagai tabel.
- Target dibeli "dengan uang tersisa" (uang pribadi setidaknya sebesar harga ditambah margin)
  atau "sebagai bagian" (harga paling banyak sebagian dari uang pribadi); Dibeli mencatat
  pengeluarannya.
- Rekonsiliasi lama membuka tab Akun seperti keadaan saat itu, dengan apa yang diharapkan dan
  apa yang ditemukan, serta apa yang tercatat dalam rentang waktu tersebut.
- Ekspor dan impor sebagai JSON atau sebagai berkas SQLite itu sendiri; di Chrome dan Edge,
  salinan otomatis ditulis ke berkas pilihan Anda setelah setiap perubahan.
- "Basis data baru…" di Pengaturan: semuanya diganti dengan basis data kosong, setelah
  peringatan yang menawarkan ekspor dan, jika ada PIN, memintanya.
- PIN empat angka untuk basis data, diminta saat basis data dibuat: halaman tidak menampilkan
  apa pun sampai PIN itu diketik, dan setiap PIN yang salah menggandakan jeda sebelum percobaan
  berikutnya, dari satu detik hingga satu jam.
- Tema terang dan gelap, 17 bahasa, tulisan kanan-ke-kiri untuk bahasa Arab dan Urdu, tata
  letak ponsel.

## Pintasan papan ketik

| Tombol | Fungsinya |
| --- | --- |
| <kbd>R</kbd> | Rekonsiliasi |
| <kbd>N</kbd> | Akun, operasi berulang, atau target baru di tab yang terbuka; jumlah pada formulir cepat di Insidental |
| <kbd>Enter</kbd> | Dalam formulir: pindah ke kolom berikutnya; pada kolom terakhir, menyimpan |
| <kbd>Esc</kbd> | Menutup dialog |

Pada layar sentuh, petunjuk tombol tidak ditampilkan.

## Keamanan dan privasi

- Tidak ada apa pun yang meninggalkan halaman. Content Security Policy dalam
  `src/app/template.html` memiliki `default-src 'none'` dan `connect-src 'none'`; WebAssembly
  diizinkan untuk SQLite (`'wasm-unsafe-eval'`), `blob:` untuk unduhan ekspor. Proses build
  berhenti jika ada `src` atau `href` eksternal apa pun, dan CI memeriksanya lagi.
- Data disimpan dalam IndexedDB browser ini: satu rekaman yang menyimpan byte basis data
  SQLite, ditulis utuh setelah setiap perubahan, sehingga penyimpanan tidak pernah setengah
  selesai. `localStorage` hanya menyimpan bahasa, tema, tab yang terbuka, grup yang dilipat,
  periode grafik, dan jeda setelah PIN yang salah.
- Membaca basis data atau berkas yang diimpor memeriksa setiap kolom: nilai yang rusak
  digantikan oleh nilai bawaannya, bukan menghentikan aplikasi.
- Setelah penyimpanan pertama, aplikasi meminta browser untuk mempertahankan penyimpanannya
  (`navigator.storage.persist()`), sehingga disk yang hampir penuh tidak mengambil data ini.
- PIN menahan seseorang di depan komputer yang tidak terkunci, bukan seseorang yang menyalin
  berkas-berkas browser: data tidak dienkripsi. Hanya hash-nya yang disimpan (PBKDF2 dengan
  garam), di antara pengaturan dalam basis data, sehingga sebuah ekspor membawanya dan meminta
  PIN yang sama di mana pun diimpor. PIN yang terlupa tidak dapat dipulihkan: "Lupa PIN?"
  menghapus basis data dan memulai yang baru dan kosong.

## Terjemahan

Teks bahasa Inggris tetap berada dalam kode: `t('accounts', 'Reconcile')`, `tn('time',
'{count} day ago', '{count} days ago', n)`, dan `data-i18n="context"` /
`data-i18n-attr="context"` dalam templat. Argumen pertama adalah konteks — bagian antarmuka
tempat sebuah string berada, sehingga kata bahasa Inggris yang sama bisa diterjemahkan
berbeda di dua tempat. Sebuah kamus, `src/locales/<code>.json`, memetakan konteks → teks
bahasa Inggris → terjemahan:

```json
{
  "accounts": { "Reconcile": "Сверить" },
  "time": { "{count} days ago": { "one": "{count} день назад", "few": "{count} дня назад", "many": "{count} дней назад", "other": "{count} дня назад" } }
}
```

String yang tidak ada dalam kamus ditampilkan dalam bahasa Inggris. Teks dengan angka
memiliki satu bentuk untuk setiap kategori jamak bahasa tersebut (`Intl.PluralRules`), dengan
kunci berupa bentuk jamak bahasa Inggrisnya. `npm run i18n` menampilkan, per bahasa, string
yang belum diterjemahkan dan yang sudah tidak digunakan lagi; `npm test` memeriksa bahwa
setiap terjemahan mempertahankan placeholder bahasa Inggris dan memiliki semua bentuk
jamaknya. Nama "Cashflow" tidak pernah diterjemahkan.

README ini juga diterjemahkan: `docs/readme/README.<code>.md`, satu untuk setiap bahasa,
dengan daftar bahasa di bagian atas masing-masing. Perubahan di sini juga perlu diterapkan
pada terjemahannya.

## Build

```sh
./build.sh            # memasang dependensi jika diperlukan, lalu membangun build/cashflow.html
npm install
npm run build         # -> build/cashflow.html dan build/pages/
npm run watch         # membangun ulang saat ada perubahan di src/
npm run typecheck     # tsc --noEmit
npm test              # money, valuation, schedules, reconciliation, forecast, goals, state, SQLite, dictionaries
npm run test:browser  # halaman hasil build dan PWA-nya di headless Chrome
npm run i18n          # string yang belum ada di tiap kamus atau yang sudah tidak diperlukan lagi
npm run check         # menjalankan typecheck, test, build, dan test:browser secara berurutan
npm run shots -- shots/after  # membangun, lalu mengambil tangkapan layar tiap tab ke shots/after
node tools/icons.mjs  # ikon PNG PWA dari assets/icon.svg
```

`build.mjs` menggabungkan `src/app/main.ts` dengan esbuild menjadi sebuah IIFE — WebAssembly
SQLite dimasukkan sebagai byte melalui binary loader esbuild — lalu menyisipkannya, beserta
gaya (styles) dan ikon (sebuah data URI), ke dalam `src/app/template.html`. Hasilnya adalah
`build/cashflow.html`, sekitar 1.4 MB: sebagian besar adalah SQLite, lalu 16 kamus.

Proses yang sama menulis `build/pages/`: halaman itu sebagai PWA yang bisa dipasang —
`index.html` dengan tautan manifest dan sebuah `<meta name="service-worker">` yang memberi
tahu halaman untuk mendaftarkan worker-nya, `manifest.webmanifest`, ikon-ikonnya, dan
`sw.js`, yang menyimpan halaman dalam cache agar bisa dibuka tanpa koneksi internet.

`tests/app.mjs` menjalankan halaman hasil build di headless Chrome lewat protokol DevTools
(`tools/chrome.mjs`, tanpa dependensi): mulai pertama kali, akun-akun dari contoh pada tugas
beserta totalnya, dua rekonsiliasi berjarak satu minggu dengan −1 500 tak tercatat,
menghapus operasi tanpa mengubah riwayat, rekonsiliasi lama, target, ekspor → hapus → impor,
PWA tanpa koneksi dan pembaruannya, sebuah ponsel, dan halaman yang dibuka dari disk tetap
menyimpan datanya. Waktu tidak ditunggu secara nyata: sebuah skrip yang disisipkan sebelum
skrip milik halaman sendiri menggantikan `Date.now()`, dan zona waktunya adalah Europe/Kyiv,
sehingga satu minggu dengan pergantian waktu musim pun ikut diuji.

## Versi dan rilis

Versi ditulis di satu tempat, `package.json`. Build menempatkannya ke dalam halaman (di
bagian bawah pengaturan) dan ke dalam nama cache PWA. Build dari commit yang ditandai
(tagged) `v<version>` menampilkannya apa adanya; build lainnya menambahkan commit-nya,
`0.1.0+1a2b3c4`, sehingga halaman dari `main` tidak dikira sebagai rilis resmi.

```sh
npm version minor           # 0.1.0 -> 0.2.0: package.json, package-lock.json, sebuah commit, dan tag v0.2.0
git push --follow-tags      # tag ini memicu .github/workflows/release.yml
```

Alur kerja rilis berhenti jika tag dan `package.json` tidak sesuai, lalu melampirkan
`cashflow-<tag>.html` dan `SHA256SUMS.txt`.

## GitHub Pages

`.github/workflows/pages.yml` membangun dan menguji setiap push ke `main`, lalu menyebarkan
`build/pages/` ke GitHub Pages (Settings → Pages → Source: GitHub Actions). Ia dilayani di
<https://cash.marketkernel.com>: domainnya diatur di Settings → Pages → Custom domain, dengan
Enforce HTTPS aktif — service worker membutuhkan HTTPS. Penyebaran lewat workflow tidak
membutuhkan berkas `CNAME` sama sekali. Setiap path di `build/pages/` bersifat relatif, sehingga
build yang sama berfungsi baik di akar sebuah domain maupun di bawah awalan `/<repo>/` suatu
situs proyek.

Data versi daring dimiliki oleh alamatnya sendiri; salinan yang dibuka dari disk memiliki
datanya sendiri. Alamat lama, `marketkernel.github.io/cashflow/`, sekarang mengalihkan ke
domain tersebut, tetapi datanya tetap berada di sana: siapa pun yang memakainya sebaiknya
mengekspor datanya di sana terlebih dahulu (aplikasi yang terpasang dari alamat itu tetap
berjalan secara luring) lalu mengimpornya di alamat yang baru.

Setiap penyebaran mengubah nama cache di `sw.js`, sehingga browser mengambil worker baru
dengan sendirinya — saat dibuka dengan koneksi internet, setiap beberapa jam selagi aplikasi
terbuka, atau ketika Pengaturan → Periksa pembaruan diminta. Worker baru mengunduh versinya
ke dalam cache-nya sendiri dan menunggu; worker yang sedang berjalan tetap menyajikan halaman
lama, termasuk saat tanpa koneksi. Pengaturan, dengan titik pada tabnya, kemudian mengatakan
"Versi … sudah siap": Perbarui menyimpan yang sedang menunggu, membiarkan worker baru masuk,
dan memuat ulang halaman, yang sekali mengatakan bahwa ia telah diperbarui. Tanpa menekan
tombol, versi baru mulai berlaku begitu semua jendela aplikasi telah ditutup. Berkas yang
sudah diunduh tetap pada versi itu; untuk versi yang tetap di disk, ambil
`cashflow-<tag>.html` dari sebuah rilis dan bandingkan dengan `SHA256SUMS.txt`.

## Struktur

```
src/core/             tanpa DOM: pengujian menjalankannya di Node
  money.ts            unit terkecil; membaca jumlah yang diketik dan aritmetika; memformat dalam suatu bahasa
  valuation.ts        akun dan utang dalam mata uang dasar, dengan biaya
  schedule.ts         kapan sebuah operasi berulang terjadi, dalam waktu lokal
  flows.ts            operasi sebagai pergerakan uang antar akun dan mata uang
  reconcile.ts        saldo yang diharapkan dan sebenarnya, potretnya, uang tak tercatat dan lajunya
  forecast.ts         kurva ke depan, kapan uang habis, kapan sebuah ambang batas tercapai
  goals.ts            ambang batas, kemajuan, dan tanggal sebuah target
  pin.ts              PIN basis data: hash yang diberi garam, pemeriksaannya, jeda setelah yang salah
  state.ts            tipe-tipe status, memeriksa yang dibaca, migrasi dokumen lama
  db.ts               status dalam SQLite: skema dan migrasinya, satu transaksi per penyimpanan
  sqlite.ts           sql.js dengan WebAssembly-nya disematkan
  i18n.ts             t()/tn(), daftar bahasa, menerjemahkan markup halaman
src/app/              halamannya: berkas tunggal dan PWA
  template.html       markup dengan placeholder __STYLES__/__APP__/__ICON__, CSP-nya
  styles.css          palet, tema terang dan gelap, tata letak ponsel
  main.ts             mulai, tab, menggambar, pintasan
  store.ts            status dalam memori, disimpan ke SQLite dan IndexedDB sesaat setelah tiap perubahan
  storage.ts          IndexedDB: byte basis data, handle berkas salinan otomatis; persist()
  lock.ts             layar yang meminta PIN, pertanyaan tentang basis data baru, kartunya di Pengaturan
  prefs.ts            localStorage: bahasa, tema, tab, grup yang dilipat, periode grafik
  accounts.ts         tab Akun, laporan, riwayat, rekonsiliasi lama
  account-dialog.ts   membuat, mengedit, mengarsipkan, dan menghapus akun dan utang
  reconcile-form.ts   formulir rekonsiliasi
  recurring.ts        tab Berulang dan formulirnya; versi-versi operasi
  oneoff.ts           tab Insidental dan formulir cepatnya
  op-fields.ts        kolom yang dipakai bersama oleh operasi: jenis, jumlah, akun atau mata uang, transfer
  goals.ts            tab Target, Dibeli
  chart.ts            grafik perkiraan, SVG dibuat manual
  settings.ts         tab Pengaturan: mata uang dan kurs, perkiraan, bahasa, tema, data, PIN
  backup.ts           ekspor dan impor (JSON dan SQLite), salinan otomatis
  update.ts           pembaruan PWA
  ui.ts, dom.ts       dialog, toast, kolom; membangun DOM
  format.ts, inputs.ts  jumlah dan tanggal dalam bahasa antarmuka; kolom jumlah
src/pwa/sw.js         service worker dari build Pages
src/locales/          satu kamus per bahasa
assets/               ikonnya; pwa/, ukuran-ukuran PNG-nya untuk PWA
tests/                pengujian unit inti dengan angka tetap dari tugas; app.mjs, halaman di Chrome
tools/                load.mjs, chrome.mjs, i18n.mjs, shots.mjs, sample.mjs, icons.mjs
docs/                 tangkapan layar di atas; readme/, README ini dalam bahasa-bahasa lain
build/                hasil build; build/pages/ adalah PWA untuk GitHub Pages
```

## Batasan

- Tidak ada sinkronisasi antar perangkat: data tetap berada di browser tempat data itu
  dimasukkan. Memindahkannya berarti ekspor di satu perangkat dan impor di perangkat lainnya.
- Kurs tukar dimasukkan secara manual: aplikasi tidak pernah terhubung ke internet untuk ini.
- Halaman yang dibuka dari disk menyimpan datanya dalam penyimpanan browser untuk berkas
  lokal. Chrome dan Edge mempertahankannya (pengujian browser memeriksa ini); Firefox dan
  Safari biasanya juga, tetapi beberapa konfigurasi dan jendela mode pribadi tidak — halaman
  kemudian menyatakannya di bagian atas dan bekerja hanya di memori: ekspor datanya, atau
  gunakan aplikasi yang sudah dipasang.
- Bunga pinjaman tidak dimodelkan; itu adalah pengeluaran rutin yang Anda tambahkan sendiri.
- Setiap target diukur sendiri-sendiri: membeli satu tidak mengurangi yang lain.

## Lisensi

MIT — lihat [LICENSE](../../LICENSE). sql.js (SQLite yang dikompilasi menjadi WebAssembly)
berlisensi MIT; SQLite itu sendiri berada dalam domain publik.
