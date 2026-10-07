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
<b>🇩🇪 Deutsch</b> ·
<a href="README.ja.md">🇯🇵 日本語</a> ·
<a href="README.mr.md">🇮🇳 मराठी</a> ·
<a href="README.te.md">🇮🇳 తెలుగు</a> ·
<a href="README.tr.md">🇹🇷 Türkçe</a> ·
<a href="README.uk.md">🇺🇦 Українська</a>
</h3>
<!-- /languages -->

**Cashflow** behält die persönlichen Finanzen im Blick, ohne jede Ausgabe zu erfassen. Sie
richten einmal Ihre Konten, Schulden und regelmäßigen Einnahmen und Zahlungen ein. Hin und
wieder **gleichen Sie ab**: Sie geben die tatsächlichen Salden ein. Die App ermittelt, wie
viel Geld nicht erfasst wurde, prognostiziert die kommenden Monate, sagt, wie lange das Geld
reicht, und wann Sie sich das leisten können, was Sie wollen.

Die ganze App ist eine einzige eigenständige HTML-Datei, die offline funktioniert: kein Konto,
keine Cloud, keine Netzwerkanfragen. Die Daten liegen in einer SQLite-Datenbank (SQLite, zu
WebAssembly kompiliert, in der Datei enthalten), die der Browser auf diesem Gerät speichert.
Dieselbe Seite ist zugleich eine PWA, die installiert werden kann und in einem eigenen Fenster
läuft.

![Cashflow: Konten nach Währung, eigenes Geld, der Bericht und die Prognose](../cashflow.png)

## Verwendung

1. Öffnen Sie die Online-Version unter <https://cash.marketkernel.com>, oder laden Sie
   `cashflow-<version>.html` aus den Releases herunter (oder bauen Sie sie selbst: `./build.sh`)
   und öffnen Sie sie in einem Browser — auch von der Festplatte aus geht das.
2. Wählen Sie die Basiswährung: jede Summe wird darin angezeigt. Fügen Sie unter
   **Einstellungen** die weiteren Währungen hinzu, die Sie besitzen, mit ihren Kursen — von
   Hand eingegeben, die App geht nie online.
3. Fügen Sie unter **Konten** Ihre Konten hinzu (eine Karte, Bargeld, ein Depot, eine Börse)
   und Schulden (eine Kreditkarte, ein Kredit, geliehenes Geld), jeweils mit dem aktuellen
   Saldo.
4. Klicken Sie auf **Abgleichen** (oder <kbd>R</kbd>). Jedes Feld enthält bereits den
   erwarteten Saldo; korrigieren Sie, was abweicht, und speichern Sie. Die Prognose beginnt
   hier.
5. Fügen Sie unter **Wiederkehrend** das Gehalt, die Miete, Abos, die monatliche
   Kartenzahlung hinzu — täglich, wöchentlich, monatlich oder jährlich. Fügen Sie unter
   **Einmalig** hinzu, was die regelmäßigen nicht abdecken: einen Einkauf, einen Bonus, einen
   geplanten Urlaub.
6. Gleichen Sie alle ein, zwei Wochen erneut ab. Der Bericht zeigt, was nicht erfasst wurde
   und wie lange das Geld reicht, und die Ziele unter **Ziele** zeigen, wann sie gekauft werden
   können.

### Auf dem Smartphone

Die Tabs wandern in eine Leiste am unteren Rand, und die Formulare öffnen sich als Sheets am
unteren Bildschirmrand; die Tastatur verdeckt das gerade bearbeitete Feld nicht. Installieren
Sie die Online-Version von <https://cash.marketkernel.com>: unter Android über Chromes ⋮-Menü →
App installieren; unter iOS über Teilen → Zum Home-Bildschirm. Es gibt keine Synchronisierung
zwischen Geräten: um die Daten zu
übertragen, exportieren Sie sie auf dem einen Gerät und importieren Sie sie auf dem anderen
(Einstellungen → Daten).

## Funktionsweise

### Abgleich

Ein Abgleich ist eine Momentaufnahme der tatsächlichen Salden aller Konten und Schulden zu
einem bestimmten Zeitpunkt. Das Formular zeigt für jedes Konto, was die Aufzeichnungen
erwarten: den zuletzt vorgefundenen Saldo plus jede seitdem zu diesem Konto gehörende Buchung.
Sie ändern nur, was abweicht. Die Momentaufnahme behält die Salden, Namen, Gebühren und Kurse
dieses Zeitpunkts und wird nie neu berechnet: ein Konto umzubenennen, es zu archivieren, eine
Buchung zu bearbeiten oder die Basiswährung zu ändern, lässt vergangene Abgleiche genau so, wie
sie waren. Nur der letzte kann gelöscht werden — um einen versehentlich vorgenommenen Abgleich
rückgängig zu machen.

### Woher nicht erfasstes Geld kommt

Für jede Währung addiert die App, was sie erwartet hat — die zuletzt vorgefundenen Salden, die
Eröffnungssalden seitdem angelegter Konten und jede wiederkehrende und einmalige Buchung im
Zeitraum — und vergleicht das mit dem, was Sie eingegeben haben. Die Differenz ist das nicht
erfasste Geld: Minus bedeutet nicht erfasste Ausgaben, Plus nicht erfasste Einnahmen. Es wird
je Währung gezählt, nicht an der Summe in der Basiswährung, sodass eine Änderung des
Wechselkurses zwischen zwei Abgleichen nicht für eine Ausgabe gehalten wird. Ein neues Konto
bringt seinen Eröffnungssaldo mit, daher ist das Anlegen keine nicht erfasste Einnahme; wird
ein Konto mit verbliebenem Geld archiviert, fragt die App, wohin das Geld ging (ein anderes
Konto, oder ausgegeben), damit auch dabei nichts unerfasst bleibt.

### Die Prognose und „Geld reicht bis"

Die Prognose beginnt beim letzten Abgleich und addiert jede Buchung seitdem — das ist „jetzt
erwartet". Von dort geht sie Tag für Tag bis zum Horizont (standardmäßig fünf Jahre): die
wiederkehrenden Buchungen, die geplanten einmaligen und, sofern nicht abgeschaltet, das
durchschnittliche Tempo nicht erfasster Ausgaben (das nicht erfasste Geld der Abgleiche der
letzten 90 Tage, auf deren Tage verteilt). Mit nicht erfassten Einnahmen wird nicht gerechnet.
„Geld reicht bis" ist der erste Zeitpunkt, an dem das Geld auf den Konten null erreicht; sinkt
das eigene Geld (die Konten abzüglich der Schulden) schon früher unter null, steht dieses
Datum an zweiter Stelle. Tritt beides nicht innerhalb des Horizonts ein, sagt der Bericht, dass
das Geld länger reicht — oder, wenn es wächst, um wie viel im Monat. Das Datum eines Ziels ist
der erste Zeitpunkt, an dem die Prognose seinen Schwellenwert erreicht.

### Gebühren, und warum die Gebühr einer Schuld sie größer macht

Die Gebühr eines Kontos ist der Anteil, der verloren geht, wenn sein Geld in die Basiswährung
umgerechnet wird: 1 000 USD auf einem Konto mit 1 % Gebühr sind 1 000 × 41.5 × 0.99 = 41 085
UAH wert. Die Gebühr einer Schuld wirkt umgekehrt — **dies ist eine Standardentscheidung**: eine
Schuld in einer anderen Währung oder über einen Mittelsmann zurückzuzahlen, kostet mehr als
ihren Nennwert, sodass eine Schuld von 200 USD mit 2 % Gebühr als 200 × 41.5 × 1.02 = 8 466 UAH
Schuld zählt. Geld außerhalb von Konten und die Preise von Zielen rechnen zum reinen Kurs um.

### Warum das Löschen einer Buchung die Vergangenheit nicht verändert

Eine wiederkehrende Buchung hat Versionen. Sie zu bearbeiten schließt die gerade gültige
Version und eröffnet ab jetzt eine neue; sie zu löschen schließt sie nur. Die Zeit seit dem
letzten Abgleich wird weiterhin mit der damals gültigen Version berechnet, sodass der nächste
Abgleich nicht überrascht wird und bereits vorgenommene Abgleiche sich nie ändern. Eine
einmalige Buchung mit einem Datum vor dem letzten Abgleich liegt in einem abgeschlossenen
Zeitraum: sie kann als Notiz behalten werden, ändert aber nichts.

Zinsen auf Kredite werden nicht abgebildet: fügen Sie sie als wiederkehrende Ausgabe hinzu,
und die Rückzahlung selbst als Überweisung an die Schuld.

## Funktionen

- Konten und Schulden nach Währung gruppiert, einklappbar, mit der Summe in der Währung und
  in der Basiswährung; eigenes Geld in großer Schrift.
- Jeder Währungscode aus 2–10 Buchstaben und Ziffern (USD, EUR, USDT, BTC), mit eigener Anzahl
  Nachkommastellen; Beträge sind Ganzzahlen in Untereinheiten, sodass es keine Rundungsfehler
  gibt.
- Beträge werden mit Komma oder Punkt eingegeben, mit Leerzeichen oder Apostrophen zwischen
  den Tausendern, und einfache Arithmetik: `1200+350-50*2`.
- Wiederkehrende Buchungen täglich (mit Uhrzeit), wöchentlich, monatlich (ein Tag, oder der
  letzte Tag) oder jährlich, gültig ab einem Zeitpunkt und bis zu einem Datum; der 31. in einem
  kürzeren Monat ist dessen letzter Tag, und der 29. Februar in einem Gemeinjahr ist der 28.
  Die Uhrzeiten sind lokal, sodass ein tägliches 09:00 Uhr auch über die Zeitumstellung hinweg
  um 09:00 Uhr bleibt.
- Einmalige Buchungen mit einem Schnellformular: der Cursor im Betragsfeld, Enter speichert,
  das zuletzt verwendete Konto.
- Überweisungen zwischen Konten in unterschiedlichen Währungen, mit dem gutgeschriebenen
  Betrag; eine Überweisung an eine Schuld tilgt sie.
- Das Prognosediagramm für eine Woche, einen Monat, 3 oder 6 Monate oder ein Jahr: eigenes
  Geld, Geld auf den Konten, die Nulllinie und die Ziele; ein Fadenkreuz mit den Werten, und
  dieselben Zahlen als Tabelle.
- Ziele, gekauft „mit Geld übrig" (eigenes Geld mindestens der Preis plus ein Spielraum) oder
  „als Anteil" (der Preis höchstens ein Teil des eigenen Geldes); Gekauft erfasst die Ausgabe.
- Ein vergangener Abgleich öffnet den Tab Konten so, wie er damals war, mit dem, was erwartet
  und was vorgefunden wurde, und was im Zeitraum erfasst wurde.
- Export und Import als JSON oder als die SQLite-Datei selbst; in Chrome und Edge eine
  automatische Kopie, die nach jeder Änderung in eine Datei Ihrer Wahl geschrieben wird.
- „Neue Datenbank…" in den Einstellungen: alles wird durch eine leere Datenbank ersetzt, nach
  einer Warnung, die einen Export anbietet und, falls eine PIN gesetzt ist, danach fragt.
- Eine vierstellige PIN für die Datenbank, abgefragt bei ihrer Erstellung: die Seite zeigt
  nichts, bis sie eingegeben ist, und jede falsche verdoppelt die Pause bis zum nächsten
  Versuch, von einer Sekunde bis zu einer Stunde.
- Helles und dunkles Design, 17 Sprachen, rechts nach links für Arabisch und Urdu, ein
  Smartphone-Layout.

## Tastenkombinationen

| Taste | Wirkung |
| --- | --- |
| <kbd>R</kbd> | Abgleichen |
| <kbd>N</kbd> | Ein neues Konto, eine neue wiederkehrende Buchung oder ein neues Ziel auf dem offenen Tab; der Betrag des Schnellformulars unter Einmalig |
| <kbd>Enter</kbd> | In einem Formular: das nächste Feld; im letzten speichert es |
| <kbd>Esc</kbd> | Schließt den Dialog |

Auf einem Touchscreen werden die Tastenhinweise nicht angezeigt.

## Sicherheit und Datenschutz

- Nichts verlässt die Seite. Die Content Security Policy in `src/app/template.html` hat
  `default-src 'none'` und `connect-src 'none'`; WebAssembly ist für SQLite erlaubt
  (`'wasm-unsafe-eval'`), `blob:` für den Export-Download. Der Build bricht bei jedem externen
  `src` oder `href` ab, und CI prüft es erneut.
- Die Daten liegen in der IndexedDB dieses Browsers: ein Datensatz mit den Bytes der
  SQLite-Datenbank, nach jeder Änderung vollständig neu geschrieben, sodass ein Speichern nie
  halb fertig ist. `localStorage` enthält nur die Sprache, das Design, den offenen Tab,
  eingeklappte Gruppen, den Zeitraum des Diagramms und die Pause nach einer falschen PIN.
- Beim Lesen der Datenbank oder einer importierten Datei wird jedes Feld geprüft: ein defekter
  Wert wird durch seinen Standardwert ersetzt, statt die App anzuhalten.
- Nach dem ersten Speichern bittet die App den Browser, seinen Speicher zu behalten
  (`navigator.storage.persist()`), damit knapper werdender Speicherplatz die Daten nicht nimmt.
- Die PIN hält jemanden an einem entsperrten Computer ab, nicht jemanden, der die Dateien des
  Browsers kopiert: die Daten sind nicht verschlüsselt. Gespeichert wird nur ihr Hash (PBKDF2
  mit einem Salt), unter den Einstellungen in der Datenbank, sodass ein Export ihn mitführt und
  überall, wohin er importiert wird, dieselbe PIN verlangt. Eine vergessene PIN lässt sich nicht
  wiederherstellen: „PIN vergessen?" löscht die Datenbank und beginnt eine neue, leere.

## Übersetzungen

Der englische Text bleibt im Code: `t('accounts', 'Reconcile')`, `tn('time', '{count} day
ago', '{count} days ago', n)`, und `data-i18n="context"` / `data-i18n-attr="context"` in der
Vorlage. Das erste Argument ist der Kontext — der Teil der Oberfläche, zu dem eine
Zeichenkette gehört, sodass dasselbe englische Wort an zwei Stellen unterschiedlich übersetzt
werden kann. Ein Wörterbuch, `src/locales/<code>.json`, bildet Kontext → englischer Text →
Übersetzung ab:

```json
{
  "accounts": { "Reconcile": "Сверить" },
  "time": { "{count} days ago": { "one": "{count} день назад", "few": "{count} дня назад", "many": "{count} дней назад", "other": "{count} дня назад" } }
}
```

Eine Zeichenkette, die im Wörterbuch fehlt, wird auf Englisch angezeigt. Ein Text mit einer
Zahl hat eine Form je Pluralkategorie der Sprache (`Intl.PluralRules`), benannt nach der
englischen Pluralform. `npm run i18n` listet je Sprache die noch nicht übersetzten und die
nicht mehr benötigten Zeichenketten auf; `npm test` prüft, dass jede Übersetzung die englischen
Platzhalter behält und alle Pluralformen hat. Der Name „Cashflow" wird nie übersetzt.

Auch dieses README wird übersetzt: `docs/readme/README.<code>.md`, eine Datei je Sprache, mit
der Liste der Sprachen oben in jeder. Eine Änderung hier gehört auch in die Übersetzungen.

## Build

```sh
./build.sh            # installiert bei Bedarf die Abhängigkeiten und baut dann build/cashflow.html
npm install
npm run build         # -> build/cashflow.html und build/pages/
npm run watch         # neu bauen bei Änderungen in src/
npm run typecheck     # tsc --noEmit
npm test              # money, valuation, schedules, reconciliation, forecast, goals, state, SQLite, Wörterbücher
npm run test:browser  # die gebaute Seite und die PWA in einem headless Chrome
npm run i18n          # Zeichenketten, die jedem Wörterbuch fehlen oder nicht mehr gebraucht werden
npm run check         # typecheck, test, build und test:browser nacheinander
npm run shots -- shots/after  # baut, dann Screenshots jedes Tabs nach shots/after
node tools/icons.mjs  # die PNG-Icons der PWA aus assets/icon.svg
```

`build.mjs` bündelt `src/app/main.ts` mit esbuild zu einem IIFE — SQLites WebAssembly kommt
dabei als Bytes über esbuilds Binärlader hinein — und setzt es zusammen mit den Styles und dem
Icon (einem Data-URI) in `src/app/template.html` ein. Das Ergebnis ist `build/cashflow.html`,
etwa 1.4 MB groß: das meiste davon SQLite, dann die 16 Wörterbücher.

Derselbe Durchlauf schreibt `build/pages/`: diese Seite als installierbare PWA — `index.html`
mit einem Manifest-Link und einem `<meta name="service-worker">`, das der Seite sagt, ihren
Worker zu registrieren, `manifest.webmanifest`, die Icons und `sw.js`, das die Seite
zwischenspeichert, damit sie offline öffnet.

`tests/app.mjs` steuert die gebaute Seite in einem headless Chrome über das DevTools-Protokoll
(`tools/chrome.mjs`, ohne Abhängigkeiten): den ersten Start, die Konten der Beispiele der
Aufgabe und ihre Summen, zwei Abgleiche eine Woche auseinander mit −1 500 nicht erfasst, das
Löschen einer Buchung ohne Änderung der Historie, einen vergangenen Abgleich, Ziele,
Export → Löschen → Import, die PWA offline und ihr Update, ein Smartphone, und die von der
Festplatte geöffnete Seite, die ihre Daten behält. Auf Zeit wird nicht gewartet: ein vor dem
eigenen Skript der Seite eingefügtes Skript ersetzt `Date.now()`, und die Zeitzone ist
Europe/Kyiv, sodass auch eine Woche mit Zeitumstellung getestet wird.

## Versionen und Releases

Die Version steht an einer einzigen Stelle, `package.json`. Der Build schreibt sie in die
Seite (unten in den Einstellungen) und in den Cache-Namen der PWA. Ein Build des mit
`v<version>` getaggten Commits zeigt sie unverändert; jeder andere fügt seinen Commit hinzu,
`0.1.0+1a2b3c4`, damit eine Seite von `main` nicht für das Release gehalten wird.

```sh
npm version minor           # 0.1.0 -> 0.2.0: package.json, package-lock.json, ein Commit und der Tag v0.2.0
git push --follow-tags      # der Tag startet .github/workflows/release.yml
```

Der Release-Workflow bricht ab, wenn Tag und `package.json` nicht übereinstimmen, und hängt
sonst `cashflow-<tag>.html` und `SHA256SUMS.txt` an.

## GitHub Pages

`.github/workflows/pages.yml` baut und testet jeden Push nach `main` und veröffentlicht
`build/pages/` auf GitHub Pages (Settings → Pages → Source: GitHub Actions). Sie wird unter
<https://cash.marketkernel.com> bereitgestellt: die Domain ist in Settings → Pages → Custom
domain gesetzt, mit aktiviertem Enforce HTTPS — ein Service Worker braucht HTTPS. Ein
Workflow-Deployment braucht keine `CNAME`-Datei. Jeder Pfad in `build/pages/` ist relativ,
sodass derselbe Build sowohl im Stammverzeichnis einer Domain als auch unter dem `/<repo>/`-
Präfix einer Projektseite funktioniert.

Die Daten der Online-Version gehören zu ihrer Adresse; eine von der Festplatte geöffnete Kopie
hat ihre eigenen Daten. Die alte Adresse, `marketkernel.github.io/cashflow/`, leitet jetzt auf
die Domain um, aber ihre Daten bleiben dort, wo sie waren: wer sie benutzt hat, sollte die Daten
dort zuerst exportieren (eine von dort installierte App läuft offline weiter) und sie unter der
neuen Adresse importieren.

Jedes Deployment ändert den Cache-Namen in `sw.js`, sodass der Browser von sich aus den neuen
Worker übernimmt — beim Start mit einer Verbindung, alle paar Stunden während die App geöffnet
ist, oder wenn Einstellungen → Nach Updates suchen gefragt wird. Der neue Worker lädt seine
Version in einen eigenen Cache und wartet; der laufende bedient weiterhin die alte Seite, auch
offline. Die Einstellungen sagen dann, mit einem Punkt auf ihrem Tab, „Version … ist bereit":
Aktualisieren speichert, was wartet, lässt den neuen Worker herein und lädt die Seite neu, die
einmalig meldet, dass sie aktualisiert wurde. Ohne den Button startet die neue Version, sobald
jedes Fenster der App geschlossen wurde. Eine heruntergeladene Datei bleibt die Version, die
sie ist; für eine auf der Festplatte festgelegte Version nehmen Sie `cashflow-<tag>.html` aus
einem Release und vergleichen es mit `SHA256SUMS.txt`.

## Aufbau

```
src/core/             kein DOM: die Tests laufen in Node
  money.ts            Untereinheiten; Einlesen eingegebener Beträge und Arithmetik; Formatierung in einer Sprache
  valuation.ts        Konten und Schulden in der Basiswährung, mit Gebühren
  schedule.ts         wann eine wiederkehrende Buchung stattfindet, in lokaler Zeit
  flows.ts            Buchungen als Geldbewegungen zwischen Konten und Währungen
  reconcile.ts        erwartete und tatsächliche Salden, die Momentaufnahme, nicht erfasstes Geld und sein Tempo
  forecast.ts         die Kurve voraus, wann das Geld ausgeht, wann ein Schwellenwert erreicht wird
  goals.ts            der Schwellenwert, Fortschritt und das Datum eines Ziels
  pin.ts              die PIN der Datenbank: ihr gesalzener Hash, ihre Prüfung, die Pause nach falschen Versuchen
  state.ts            die Typen des Zustands, Prüfung des Gelesenen, Migrationen alter Dokumente
  db.ts               der Zustand in SQLite: das Schema und seine Migrationen, eine Transaktion je Speichern
  sqlite.ts           sql.js mit eingebettetem WebAssembly
  i18n.ts             t()/tn(), die Sprachliste, Übersetzen des Markups der Seite
src/app/              die Seite: die einzelne Datei und die PWA
  template.html       Markup mit den Platzhaltern __STYLES__/__APP__/__ICON__, die CSP
  styles.css          Palette, helles und dunkles Design, das Smartphone-Layout
  main.ts             Start, Tabs, Zeichnen, Tastenkürzel
  store.ts            der Zustand im Speicher, kurz nach jeder Änderung in SQLite und IndexedDB gesichert
  storage.ts          IndexedDB: die Bytes der Datenbank, das Datei-Handle der automatischen Kopie; persist()
  lock.ts             der Bildschirm, der nach der PIN fragt, die Frage nach einer neuen Datenbank, ihre Karte in den Einstellungen
  prefs.ts            localStorage: Sprache, Design, Tab, eingeklappte Gruppen, der Zeitraum des Diagramms
  accounts.ts         der Tab Konten, der Bericht, die Historie, ein vergangener Abgleich
  account-dialog.ts   Anlegen, Bearbeiten, Archivieren und Löschen von Konten und Schulden
  reconcile-form.ts   das Abgleichformular
  recurring.ts        der Tab Wiederkehrend und sein Formular; Versionen von Buchungen
  oneoff.ts           der Tab Einmalig und sein Schnellformular
  op-fields.ts        die gemeinsamen Felder der Buchungen: Typ, Betrag, Konto oder Währung, Überweisung
  goals.ts            der Tab Ziele, Gekauft
  chart.ts            das Prognosediagramm, SVG von Hand
  settings.ts         der Tab Einstellungen: Währungen und Kurse, Prognose, Sprache, Design, Daten, PIN
  backup.ts           Export und Import (JSON und SQLite), die automatische Kopie
  update.ts           die Updates der PWA
  ui.ts, dom.ts       Dialoge, Toasts, Felder; Aufbau des DOM
  format.ts, inputs.ts  Beträge und Daten in der Sprache der Oberfläche; das Betragsfeld
src/pwa/sw.js         der Service Worker des Pages-Builds
src/locales/          ein Wörterbuch je Sprache
assets/               das Icon; pwa/, seine PNG-Größen für die PWA
tests/                Unit-Tests des Kerns mit den festen Zahlen der Aufgabe; app.mjs, die Seite in Chrome
tools/                load.mjs, chrome.mjs, i18n.mjs, shots.mjs, sample.mjs, icons.mjs
docs/                 der Screenshot oben; readme/, dieses README in den anderen Sprachen
build/                das Build-Ergebnis; build/pages/ ist die PWA für GitHub Pages
```

## Einschränkungen

- Keine Synchronisierung zwischen Geräten: die Daten bleiben in dem Browser, in dem sie
  eingegeben wurden. Sie zu übertragen bedeutet Export auf dem einen Gerät und Import auf dem
  anderen.
- Wechselkurse werden von Hand eingegeben: die App geht dafür nie online.
- Eine von der Festplatte geöffnete Seite behält ihre Daten im Speicher dieses Browsers für
  lokale Dateien. Chrome und Edge behalten sie (die Browser-Tests prüfen das); Firefox und
  Safari normalerweise auch, aber manche Konfigurationen und private Fenster nicht — die Seite
  sagt das dann oben und arbeitet nur im Arbeitsspeicher: exportieren Sie die Daten, oder nutzen
  Sie die installierte App.
- Zinsen auf Kredite werden nicht abgebildet; sie sind eine wiederkehrende Ausgabe, die Sie
  hinzufügen.
- Jedes Ziel wird für sich gemessen: der Kauf eines Ziels wird nicht von den anderen
  abgezogen.

## Lizenz

MIT — siehe [LICENSE](../../LICENSE). sql.js (SQLite, zu WebAssembly kompiliert) steht unter
der MIT-Lizenz; SQLite selbst ist gemeinfrei (public domain).
