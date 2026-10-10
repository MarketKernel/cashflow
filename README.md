# Cashflow

<!-- languages -->
<h3 align="center">
<b>🇬🇧 English</b> ·
<a href="docs/readme/README.zh.md">🇨🇳 中文</a> ·
<a href="docs/readme/README.hi.md">🇮🇳 हिन्दी</a> ·
<a href="docs/readme/README.es.md">🇪🇸 Español</a> ·
<a href="docs/readme/README.fr.md">🇫🇷 Français</a> ·
<a href="docs/readme/README.ar.md">🇸🇦 العربية</a> ·
<a href="docs/readme/README.bn.md">🇧🇩 বাংলা</a> ·
<a href="docs/readme/README.pt.md">🇧🇷 Português</a> ·
<a href="docs/readme/README.ru.md">🇷🇺 Русский</a> ·
<a href="docs/readme/README.ur.md">🇵🇰 اردو</a> ·
<a href="docs/readme/README.id.md">🇮🇩 Bahasa Indonesia</a> ·
<a href="docs/readme/README.de.md">🇩🇪 Deutsch</a> ·
<a href="docs/readme/README.ja.md">🇯🇵 日本語</a> ·
<a href="docs/readme/README.mr.md">🇮🇳 मराठी</a> ·
<a href="docs/readme/README.te.md">🇮🇳 తెలుగు</a> ·
<a href="docs/readme/README.tr.md">🇹🇷 Türkçe</a> ·
<a href="docs/readme/README.uk.md">🇺🇦 Українська</a>
</h3>
<!-- /languages -->

**Cashflow** keeps track of personal finances without recording every expense. You set up your
accounts, debts and regular income and payments once. Now and then you **reconcile**: type in
the real balances. The app works out how much money went unrecorded, forecasts the months
ahead, says how long the money lasts and when you can buy what you want.

The whole app is one standalone HTML file that works offline: no account, no cloud, no network
requests. The data is an SQLite database (SQLite compiled to WebAssembly, inside the file) that
the browser keeps on this device. The same page is also a PWA that can be installed and runs in
its own window.

![Cashflow: accounts by currency, personal money, the report and the forecast](docs/cashflow.png)

## How to use

1. Open the online version at <https://cash.marketkernel.com>, or download
   `cashflow-<version>.html` from the releases (or build it: `./build.sh`) and open it in a
   browser — from disk is fine.
2. Choose the base currency: every total is shown in it. In **Settings**, add the other
   currencies you hold, with their rates — typed in by hand, the app never goes online.
3. On **Accounts**, add your accounts (a card, cash, a deposit, an exchange) and debts (a
   credit card, a loan, money borrowed), each with its balance now.
4. Press **Reconcile** (or <kbd>R</kbd>). Every field already holds the expected balance;
   correct what differs and save. The forecast starts here.
5. On **Recurring**, add the salary, rent, subscriptions, the card's monthly payment — daily,
   weekly, monthly or yearly. On **One-off**, add what the regular ones do not cover: a
   purchase, a bonus, a planned holiday.
6. Every week or two, reconcile again. The report tells you what went unaccounted (and offers
   to plan for it if it keeps happening), how long the money lasts, and the goals on **Goals**
   tell you when they can be bought.

### On a phone

The tabs move to a bar along the bottom, and the forms open as sheets at the bottom of the
screen; the keyboard does not cover the field being typed in. Install the online version from
<https://cash.marketkernel.com>: on Android, Chrome's ⋮ menu → Install app; on iOS, Share → Add
to Home Screen. There is no sync between
devices: to move the data, export it on one and import it on the other (Settings → Data).

## How it works

### Reconciliation

A reconciliation is a snapshot of the real balances of all accounts and debts at one moment.
The form shows, for every account, what the records expect: the balance found last time plus
every operation since that belongs to that account. You change only what differs. The
snapshot keeps the balances, the names, the fees and the rates of that moment, and is never
recomputed: renaming an account, archiving it, editing an operation or changing the base
currency leaves past reconciliations exactly as they were. Only the last one can be deleted —
to undo a reconciliation made by mistake.

### Where unaccounted money comes from

For each currency, the app adds up what it expected — the balances found last time, the
opening balances of accounts created since, and every recurring and one-off operation in the
interval — and compares it with what you typed in. The difference is the unaccounted money:
minus means spending that was not recorded, plus income that was not. It is counted per
currency, not on the total in the base currency, so a change of the exchange rate between two
reconciliations is not taken for an expense. A new account brings its opening balance with
it, so creating one is not unaccounted income; archiving one with money left asks where the
money went (another account, or spent) so that nothing goes unaccounted either.

### The forecast and "Money lasts until"

The forecast starts from the last reconciliation and adds every operation since — that is
"expected now". From there it goes a day at a time to the horizon (five years by default):
the recurring operations and the planned one-offs, nothing else. "Money lasts until" is the
first moment the money on the accounts reaches zero; if personal money (the accounts minus the
debts) goes below zero earlier, that date comes second. If neither happens within the horizon,
the report says the money lasts longer — or, if it grows, by how much a month. Goals are bought
in their order, the top one first: a goal's date is the first moment, no earlier than the goal
above it, when the forecast reaches its threshold plus the prices of the goals above.

Unaccounted money is not planned for on its own: a lost wallet or a one-off repair should not
make every month ahead poorer. The report shows its average pace instead — the unaccounted
money of the reconciliations in the 90 days up to the last one, over their days — and, for
spending, offers to add it as a daily recurring expense with no account. Once it is added,
the forecast counts on it like on any other operation, and the next reconciliations show only
what is unaccounted beyond it. Unaccounted income is not counted on.

### Fees, and why a debt's fee makes it larger

An account's fee is the share lost when its money is turned into the base currency: 1 000 USD
on an account with a 1 % fee is worth 1 000 × 41.5 × 0.99 = 41 085 UAH. A debt's fee works
the other way — **this is a default decision**: paying back a debt in another currency, or
through someone in between, costs more than its face value, so a 200 USD debt with a 2 % fee
counts as 200 × 41.5 × 1.02 = 8 466 UAH owed. Money outside accounts and the prices of goals
convert at the bare rate.

### Why deleting an operation does not change the past

A recurring operation has versions. Editing it closes the version in force at this moment and
opens a new one from now; deleting it only closes it. The time since the last reconciliation is
still counted with the version that was in force then, so the next reconciliation is not
surprised, and reconciliations already made never change. A one-off operation dated before
the last reconciliation is in a closed period: it can be kept as a note, but changes nothing.

Interest on loans is not modelled: add it as a recurring expense, and the repayment itself as a
transfer to the debt.

## Features

- Accounts and debts grouped by currency, folding, with the total in the currency and in the
  base currency; personal money in large type.
- Any currency code of 2–10 letters and digits (USD, EUR, USDT, BTC), with its own number of
  decimals; amounts are integers in minor units, so there is no rounding drift.
- Amounts typed with a comma or a dot, spaces or apostrophes between thousands, and simple
  arithmetic: `1200+350-50*2`.
- Recurring operations daily (with a time), weekly, monthly (a day, or the last day) or yearly,
  in force from a moment and until a date; the 31st in a short month is its last day, and 29
  February in a common year is the 28th. Times are local, so a daily 09:00 stays at 09:00
  across the clock change.
- One-off operations in a form behind a button (or <kbd>N</kbd>): the cursor in the amount, Enter
  saves, the last account used. The list opens on what the next reconciliation takes in; a
  filter shows the interval between two past reconciliations, everything, or dates from–to,
  with what the operations shown come to.
- Transfers between accounts in different currencies, with the amount credited; a transfer to a
  debt pays it off.
- The forecast chart for a week, a month, 3 or 6 months or a year: personal money, money on the
  accounts, the zero line and the goals; a crosshair with the values, and the same numbers as a
  table.
- Goals bought "with money to spare" (personal money at least the price plus a margin) or "as a
  share" (the price at most a part of personal money), in a list by priority: drag one higher to
  buy it sooner. Bought records the expense.
- A past reconciliation opens the Accounts tab as it was, with what it expected and what it
  found, and what was recorded in the interval.
- Export and import as JSON or as the SQLite file itself, the latter also encrypted with a
  password for a copy kept elsewhere; in Chrome and Edge, an automatic copy written to a file of
  your choice after every change.
- Several databases in one browser — for the family and for a business, say — each with its own
  accounts, goals and PIN. With more than one, the app opens on their list, and the open one's
  name is in the top bar (a click goes back to the list). A file is imported in place of the
  open database or as a new one beside it.
- "Delete this database…" in Settings, after a warning that offers an export and, with a PIN,
  asks for it; the only database gives way to a new, empty one.
- A four-digit PIN for the database, asked when it is created: the page shows nothing until it
  is typed, and each wrong one doubles the pause before the next try, from a second up to an hour.
- Light and dark themes, 17 languages, right to left for Arabic and Urdu, a phone layout.

## Keyboard shortcuts

| Key | What it does |
| --- | --- |
| <kbd>R</kbd> | Reconcile |
| <kbd>N</kbd> | A new account, recurring, one-off operation or goal on the open tab |
| <kbd>Enter</kbd> | In a form: the next field; in the last one, save |
| <kbd>Esc</kbd> | Close the dialog |

On a touch screen the key hints are not shown.

## Security and privacy

- Nothing leaves the page. The Content Security Policy in `src/app/template.html` has
  `default-src 'none'` and `connect-src 'none'`; WebAssembly is allowed for SQLite
  (`'wasm-unsafe-eval'`), `blob:` for the export download. The build stops on any external
  `src` or `href`, and CI checks again.
- The data lives in IndexedDB of this browser: one record per database holding its SQLite
  bytes, written whole after every change, so a save is never half done, and one with the list
  of databases. `localStorage` holds only the language, the theme, the open tab, folded groups,
  the chart's period and the pause after a wrong PIN; `sessionStorage`, which database the tab
  opened.
- Reading the database or an imported file checks every field: a broken value is replaced by
  its default rather than stopping the app.
- After the first save the app asks the browser to keep its storage
  (`navigator.storage.persist()`), so a disk running low does not take the data.
- The PIN keeps out someone at an unlocked computer, not someone who copies the browser's
  files: the data is not encrypted. Only its hash is stored (PBKDF2 with a salt), among the
  settings in the database, so an export carries it and asks for the same PIN wherever it is
  imported. A forgotten PIN cannot be recovered: "Forgot the PIN?" deletes the database and
  starts a new, empty one — once the database's name is typed, so a child pressing buttons
  does not wipe it.
- For a copy kept in a cloud folder or on a stick, "Export encrypted…" writes the SQLite file
  encrypted with a password of at least 8 characters: AES-256-GCM with a key derived by
  PBKDF2-SHA-256 (600 000 iterations, a random salt). Without the password nobody can open the
  file — Cashflow included — and a forgotten one cannot be recovered. Importing it asks for the
  password. The data in the browser stays as it was, behind the PIN.

## Translations

The English text stays in the code: `t('accounts', 'Reconcile')`, `tn('time', '{count} day
ago', '{count} days ago', n)`, and `data-i18n="context"` / `data-i18n-attr="context"` in the
template. The first argument is the context — the part of the interface a string belongs to,
so the same English word can be translated differently in two places. A dictionary,
`src/locales/<code>.json`, maps context → English text → translation:

```json
{
  "accounts": { "Reconcile": "Сверить" },
  "time": { "{count} days ago": { "one": "{count} день назад", "few": "{count} дня назад", "many": "{count} дней назад", "other": "{count} дня назад" } }
}
```

A string the dictionary lacks is shown in English. A text with a number has one form per plural
category of the language (`Intl.PluralRules`), keyed by the English plural form. `npm run i18n`
lists, per language, the strings not translated yet and the ones no longer used; `npm test`
checks that every translation keeps the English placeholders and has all plural forms. The
name "Cashflow" is never translated.

This README is translated as well: `docs/readme/README.<code>.md`, one per language, with the
list of languages at the top of each. A change here belongs in the translations too.

## Build

```sh
./build.sh            # installs the dependencies if needed, then builds build/cashflow.html
npm install
npm run build         # -> build/cashflow.html and build/pages/
npm run watch         # rebuild on changes in src/
npm run typecheck     # tsc --noEmit
npm test              # money, valuation, schedules, reconciliation, forecast, goals, state, SQLite, dictionaries
npm run test:browser  # the built page and the PWA in headless Chrome
npm run i18n          # strings each dictionary lacks or no longer needs
npm run check         # typecheck, test, build and test:browser in a row
npm run shots -- shots/after  # build, then screenshots of every tab into shots/after
node tools/icons.mjs  # the PWA's PNG icons from assets/icon.svg
```

`build.mjs` bundles `src/app/main.ts` with esbuild into an IIFE — SQLite's WebAssembly goes in
as bytes through esbuild's binary loader — and substitutes it, with the styles and the icon (a
data URI), into `src/app/template.html`. The result is `build/cashflow.html`, about 1.4 MB: most
of it SQLite, then the 16 dictionaries.

The same run writes `build/pages/`: that page as an installable PWA — `index.html` with a
manifest link and a `<meta name="service-worker">` that tells the page to register its worker,
`manifest.webmanifest`, the icons and `sw.js`, which caches the page so it opens offline.

`tests/app.mjs` drives the built page in headless Chrome over the DevTools protocol
(`tools/chrome.mjs`, no dependencies): the first start, the accounts of the task's examples and
their totals, two reconciliations a week apart with −1 500 unaccounted, deleting an operation
without changing history, a past reconciliation, goals, export → wipe → import, the PWA offline
and its update, a phone, and the page opened from disk keeping its data. Time is not waited
for: a script put in before the page's own replaces `Date.now()`, and the time zone is
Europe/Kyiv, so a week with a clock change is tested too.

## Versions and releases

The version is written in one place, `package.json`. The build puts it into the page (the bottom
of the settings) and into the PWA's cache name. A build of the commit tagged `v<version>` shows
it as it is; any other adds its commit, `0.1.0+1a2b3c4`, so a page from `main` is not taken for
the release.

```sh
npm version minor           # 0.1.0 -> 0.2.0: package.json, package-lock.json, a commit and the tag v0.2.0
git push --follow-tags      # the tag starts .github/workflows/release.yml
```

The release workflow stops if the tag and `package.json` disagree, then attaches
`cashflow-<tag>.html` and `SHA256SUMS.txt`.

## GitHub Pages

`.github/workflows/pages.yml` builds and tests every push to `main` and deploys `build/pages/`
to GitHub Pages (Settings → Pages → Source: GitHub Actions). It is served at
<https://cash.marketkernel.com>: the domain is set in Settings → Pages → Custom domain, with
Enforce HTTPS on — a service worker needs HTTPS. A workflow deploy needs no `CNAME` file. Every
path in `build/pages/` is relative, so the same build works at a domain's root and under a
project site's `/<repo>/` prefix.

The data of the online version belongs to its address; a copy opened from disk has data of its
own. The old address, `marketkernel.github.io/cashflow/`, now redirects to the domain, but its
data stays where it was: whoever used it should export the data there first (an app installed
from it keeps running offline) and import it at the new address.

Each deploy changes the cache name in `sw.js`, so the browser picks up the new worker by itself
— on a launch with a connection, every few hours while the app is open, or when Settings →
Check for updates asks. The new worker downloads its version into a cache of its own and waits;
the running one keeps serving the old page, offline too. The settings, with a dot on their tab,
then say "Version … is ready": Update saves what is waiting, lets the new worker in and reloads
the page, which says once that it has been updated. Without the button the new version starts
once every window of the app has been closed. A downloaded file stays the version it is; for a
version fixed on disk, take `cashflow-<tag>.html` from a release and compare it with
`SHA256SUMS.txt`.

## Layout

```
src/core/             no DOM: the tests run it in Node
  money.ts            minor units; reading typed amounts and arithmetic; formatting in a language
  valuation.ts        accounts and debts in the base currency, with fees
  schedule.ts         when a recurring operation happens, in local time
  flows.ts            operations as movements of money between accounts and currencies
  reconcile.ts        expected and actual balances, the snapshot, unaccounted money and its pace
  forecast.ts         the curve ahead, when the money runs out, when a threshold is reached
  goals.ts            a goal's threshold, progress and date, in priority order
  pin.ts              the database's PIN: its salted hash, checking it, the pause after wrong ones
  encryption.ts       an export encrypted with a password: AES-256-GCM, the key from PBKDF2
  state.ts            the state's types, checking what is read, migrations of old documents
  db.ts               the state in SQLite: the schema and its migrations, one transaction per save
  sqlite.ts           sql.js with its WebAssembly inlined
  i18n.ts             t()/tn(), the language list, translating the page's markup
src/app/              the page: the single file and the PWA
  template.html       markup with the __STYLES__/__APP__/__ICON__ placeholders, the CSP
  styles.css          palette, light and dark themes, the phone layout
  main.ts             start, tabs, drawing, shortcuts
  store.ts            the state in memory, saved to SQLite and IndexedDB a moment after each change
  storage.ts          IndexedDB: each database's bytes and automatic copy's file handle, their list; persist()
  databases.ts        several databases: their list, the choice on entry, switching, the card in Settings
  lock.ts             the screen asking for the PIN, the question of a new database, its card in Settings
  prefs.ts            localStorage: language, theme, tab, folded groups, the chart's period
  accounts.ts         the Accounts tab, the report, the history, a past reconciliation
  account-dialog.ts   creating, editing, archiving and deleting accounts and debts
  reconcile-form.ts   the reconciliation form
  recurring.ts        the Recurring tab and its form; versions of operations
  oneoff.ts           the One-off tab, its filter by period and its form
  op-fields.ts        the fields operations share: type, amount, account or currency, transfer
  goals.ts            the Goals tab: the list by priority, dragging, Bought
  chart.ts            the forecast chart, SVG by hand
  settings.ts         the Settings tab: currencies and rates, forecast, language, theme, data, databases, PIN
  backup.ts           export and import (JSON, SQLite, encrypted), deleting a database, the automatic copy
  update.ts           the PWA's updates
  ui.ts, dom.ts       dialogs, toasts, fields; building the DOM
  format.ts, inputs.ts  amounts and dates in the interface language; the amount field
src/pwa/sw.js         the service worker of the Pages build
src/locales/          one dictionary per language
assets/               the icon; pwa/, its PNG sizes for the PWA
tests/                unit tests of the core with the task's fixed numbers; app.mjs, the page in Chrome
tools/                load.mjs, chrome.mjs, i18n.mjs, shots.mjs, sample.mjs, icons.mjs
docs/                 the screenshot above; readme/, this README in the other languages
build/                the build output; build/pages/ is the PWA for GitHub Pages
```

## Limitations

- No sync between devices: the data stays in the browser where it was entered. Moving it is an
  export on one device and an import on the other.
- Exchange rates are typed in by hand: the app never goes online for them.
- A page opened from disk keeps its data in that browser's storage for local files. Chrome and
  Edge keep it (the browser tests check this); Firefox and Safari normally do too, but some
  configurations and private windows do not — the page then says so at the top and works in
  memory only: export the data, or use the installed app.
- Interest on loans is not modelled; it is a recurring expense you add.
- Goals are bought one after another, in their order: a cheap goal lower in the list waits for
  the ones above it, even when it could be bought now.

## License

MIT — see [LICENSE](LICENSE). sql.js (SQLite compiled to WebAssembly) is MIT-licensed; SQLite
itself is in the public domain.
