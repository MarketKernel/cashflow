/**
 * Drives the built page in headless Chrome (tools/chrome.mjs), through the
 * scenarios of the task: the first start, the accounts and debts of section 4
 * and their totals, a reconciliation, a recurring expense and a one-off
 * income, the second reconciliation a week later with −1 500 unaccounted, a
 * deletion that leaves history alone, a past reconciliation and back, goals
 * of both kinds and "Bought", export → wipe → import, the database's PIN
 * and its pauses, several databases (the list on entry, switching, renaming,
 * an import as a new one, deleting), a reload, the page opened from disk
 * keeping its data, and a forgotten PIN starting a new database once the
 * database's name is typed.
 *
 * Time is not waited for: a script put in every document before the page's
 * own (Page.addScriptToEvaluateOnNewDocument) replaces Date.now() with the
 * moment the test keeps in localStorage, and the time zone is Europe/Kyiv.
 *
 * Needs `npm run build` first and a local Chrome (or CHROME=/path/to/chrome);
 * without one it says so and passes. `--shots DIR` saves a few screens.
 */
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHROME, sleep, startChrome } from '../tools/chrome.mjs';
import { checker, root } from '../tools/load.mjs';

if (!CHROME) {
  console.log('No Chrome found — set CHROME=/path/to/chrome. Skipping the browser tests.');
  process.exit(0);
}

const { check, done } = checker();
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
const APP = join(root, 'build', 'cashflow.html');
const PAGES = join(root, 'build', 'pages');

process.env.TZ = 'Europe/Kyiv';
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

/* ------------------------------------------------------------------ *
 * A server for the single file at / and the PWA under /pages/.
 * ------------------------------------------------------------------ */

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
export const net = { down: false, nextVersion: null };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (!path.startsWith('/pages/')) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(await readFile(APP));
    return;
  }
  if (net.down) return req.socket.destroy();
  const name = path.endsWith('/') ? 'index.html' : basename(path);
  try {
    let body = await readFile(join(PAGES, name));
    if (name === 'sw.js' && net.nextVersion) body = body.toString().replace(/const VERSION = '[^']*'/, `const VERSION = '${net.nextVersion}'`).replace(/const CACHE = '[^']*'/, `const CACHE = 'cashflow-${net.nextVersion}'`);
    res.setHeader('content-type', TYPES[extname(name)] ?? 'application/octet-stream');
    res.setHeader('cache-control', 'no-cache');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const downloads = await mkdtemp(join(tmpdir(), 'cashflow-downloads-'));
const chrome = await startChrome();
let failure = null;

try {
  const [tab] = (await chrome.targets()).filter((t) => t.type === 'page');
  const s = await chrome.attach(tab.targetId, 'page');
  await chrome.send('Page.enable', {}, s);
  await chrome.send('DOM.enable', {}, s);
  await chrome.send('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Kyiv' }, s);
  await chrome.send('Emulation.setLocaleOverride', { locale: 'en-US' }, s);
  await chrome.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });
  // The clock, and no File System Access: exports take the download route the test can catch.
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const Real = Date;
      let stored = 0;
      try { stored = Number(localStorage.getItem('test-now')); } catch {}
      const fixed = () => stored || Real.now();
      class TestDate extends Real {
        constructor(...args) { if (args.length === 0) super(fixed()); else super(...args); }
        static now() { return fixed(); }
      }
      globalThis.Date = TestDate;
      delete window.showSaveFilePicker;
    })();`,
  }, s);

  // "Leave the page?" while a save is still waiting: the page saves in pagehide anyway, so the test says yes.
  chrome.listeners.add((message) => {
    if (message.method === 'Page.javascriptDialogOpening') void chrome.send('Page.handleJavaScriptDialog', { accept: true }, message.sessionId);
  });
  // Intl puts no-break spaces between a currency and its number; the checks are written with plain ones.
  const plain = (value) => (typeof value === 'string' ? value.replace(/[\u00a0\u202f]/g, ' ') : Array.isArray(value) ? value.map(plain) : value);
  const js = async (expression) => plain(await chrome.evaluate(s, expression));
  const until = (expression, timeout = 10000) => chrome.until(s, expression, timeout);
  const q = (selector) => JSON.stringify(selector);
  const text = (selector) => js(`document.querySelector(${q(selector)})?.textContent ?? null`);
  const exists = (selector) => js(`!!document.querySelector(${q(selector)})`);
  const click = async (selector) => {
    if (!(await until(`!!document.querySelector(${q(selector)})`, 5000))) throw new Error(`Nothing to click: ${selector}`);
    await js(`document.querySelector(${q(selector)}).click(), true`);
    await sleep(60);
  };
  /** Types into a field as a person would end up with: the value, then input and change. */
  const type = async (selector, value) => {
    if (!(await until(`!!document.querySelector(${q(selector)})`, 5000))) throw new Error(`No field: ${selector}`);
    await js(`(() => { const n = document.querySelector(${q(selector)}); n.focus(); n.value = ${q(value)}; n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  };
  const choose = (selector, value) => type(selector, value);
  const key = async (k) => {
    const code = k.length === 1 ? `Key${k.toUpperCase()}` : k;
    for (const kind of ['keyDown', 'keyUp']) await chrome.send('Input.dispatchKeyEvent', { type: kind, key: k, code, text: kind === 'keyDown' && k.length === 1 ? k : undefined, windowsVirtualKeyCode: k === 'Enter' ? 13 : k.toUpperCase().charCodeAt(0) }, s);
    await sleep(60);
  };
  const ready = () => until(`document.readyState === 'complete' && !document.getElementById('app').classList.contains('app--starting')`, 15000);
  /** The page's clock from the next load on. */
  const setNow = (ms) => js(`localStorage.setItem('test-now', '${ms}'), true`);
  const reload = async () => {
    await sleep(350);
    await chrome.send('Page.reload', {}, s);
    await ready();
    await sleep(150);
  };
  /** A reload into a new, empty database: its PIN question answered "without". */
  const reloadAnew = async () => {
    await sleep(350);
    await chrome.send('Page.reload', {}, s);
    if (!(await until(`!!document.querySelector('[data-key="pin-skip"]')`, 15000))) throw new Error('No question about a PIN');
    await click('[data-key="pin-skip"]');
    await ready();
    await sleep(150);
  };
  const go = (tab) => click(`[data-tab="${tab}"]`);
  /** Waits for the debounced save to reach IndexedDB. */
  const settle = () => sleep(500);
  const shot = async (name) => {
    if (!SHOTS) return;
    const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' }, s);
    await (await import('node:fs/promises')).writeFile(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
  };
  const personal = () => text('[data-test="personal"]');
  const dialogOpen = () => exists('dialog[open]');

  async function addAccount(kind, name, currency, fee, opening) {
    await click(`[data-key="add-${kind}"]`);
    await type('[data-key="account-name"]', name);
    await choose('[data-key="account-currency"]', currency);
    await type('[data-key="account-fee"]', String(fee));
    await type('[data-key="account-opening"]', opening);
    await click('[data-key="account-save"]');
    await until(`!document.querySelector('dialog[open]')`);
  }

  // ---------------------------------------------------------------- first start
  await chrome.send('Page.navigate', { url: `${ORIGIN}/` }, s);
  await until(`!!document.querySelector('[data-key="pin-skip"]')`, 15000);
  await setNow(at(2026, 10, 1, 9));
  await chrome.send('Page.reload', {}, s);
  check('first start: a PIN for the new database is asked', await until(`!!document.querySelector('[data-key="pin-skip"]')`, 15000), true);
  await shot('pin-new');
  await click('[data-key="pin-skip"]');
  await ready();
  check('first start: the invitation', (await text('.welcome h1')) ?? '', 'Choose the base currency and add the first account');
  check('first start: the base currency guessed from the locale', await js(`document.querySelector('[data-key="welcome-base"]').value`), 'USD');
  await choose('[data-key="welcome-base"]', 'UAH');
  await sleep(100);
  check('the base is now UAH', await js(`document.querySelector('[data-key="welcome-base"]').value`), 'UAH');

  // Rates, in the settings.
  await go('settings');
  for (const [code, rate] of [['USD', '41.5'], ['EUR', '45']]) {
    await type('[data-key="new-code"]', code);
    await type('[data-key="new-rate"]', rate);
    await click('.rates tfoot .button');
    await sleep(80);
  }
  check('currencies added', await js(`[...document.querySelectorAll('.rates tbody th')].map((n) => n.firstChild.textContent)`), ['UAH', 'USD', 'EUR']);
  await type('[data-key="new-code"]', 'usdt');
  await type('[data-key="new-rate"]', '41,4');
  await click('.rates tfoot .button');
  await sleep(80);
  check('a code of four letters, typed in lower case, and a comma rate', await js(`document.querySelector('[data-key="rate-USDT"]')?.value`), '41.4');
  await click('[aria-label="Remove USDT"]');
  await sleep(80);
  check('an unused currency can be removed', await exists('[data-key="rate-USDT"]'), false);
  check('a currency in use (the base) cannot', await js(`document.querySelector('.rates tbody tr:first-child td:last-child button') === null`), true);

  // ---------------------------------------------------------------- three accounts and two debts
  await go('accounts');
  await click('[data-key="welcome-add"]');
  await type('[data-key="account-name"]', 'Monobank');
  await type('[data-key="account-opening"]', '20 000');
  await click('[data-key="account-save"]');
  await until(`!document.querySelector('dialog[open]')`);
  await addAccount('asset', 'Wise', 'USD', 1, '1000');
  await addAccount('asset', 'Cash', 'EUR', 0, '500');
  await addAccount('debt', 'Card', 'UAH', 0, '15000');
  await addAccount('debt', 'Friend', 'USD', 0, '200');
  check('the accounts by currency', await js(`[...document.querySelectorAll('.group-code')].map((n) => n.textContent)`), ['UAH', 'USD', 'EUR', 'UAH', 'USD']);
  check('Wise at a 1 % fee is UAH 41,085', await js(`[...document.querySelectorAll('.account-row')].find((r) => r.textContent.includes('Wise')).querySelector('.account-value').textContent`), 'UAH 41,085.00');
  check('money on accounts: UAH 83,585', await js(`document.querySelectorAll('.card-total strong')[0].textContent`), 'UAH 83,585.00');
  check('owed in total: UAH 23,300', await js(`document.querySelectorAll('.card-total strong')[1].textContent`), 'UAH 23,300.00');
  check('personal money: UAH 60,285', await personal(), 'UAH 60,285.00');
  check('no forecast before the first reconciliation', (await text('.chart-empty')) ?? '', 'Make the first reconciliation: the forecast starts from it.');

  // A fold remembered.
  await click('[data-key="group-asset:EUR"]');
  check('a currency group folds', await js(`document.querySelector('[data-key="group-asset:EUR"]').getAttribute('aria-expanded')`), 'false');
  await reload();
  check('… and stays folded after a reload', await js(`document.querySelector('[data-key="group-asset:EUR"]').getAttribute('aria-expanded')`), 'false');
  await click('[data-key="group-asset:EUR"]');

  // ---------------------------------------------------------------- the first reconciliation, by the R key
  await setNow(at(2026, 10, 1, 10));
  await reload();
  await key('r');
  check('R opens the reconciliation', await dialogOpen(), true);
  check('each field holds the expected balance', await js(`[...document.querySelectorAll('[data-key^="reconcile-"].amount-input')].map((n) => n.value)`), ['20000', '1000', '500', '15000', '200']);
  await shot('1-reconcile');
  await click('[data-key="reconcile-save"]');
  await until(`!document.querySelector('dialog[open]')`);
  check('after the first reconciliation: still 60,285', await personal(), 'UAH 60,285.00');
  check('a forecast now', await exists('.chart-svg'), true);
  check('one reconciliation in the history', await js(`document.querySelectorAll('.history-row').length`), 1);
  check('… the first: nothing unaccounted', await text('.history-row .history-unaccounted'), 'first');
  check('nothing grows, nothing falls', await text('[data-test="lasts"]'), 'Finances are growing: UAH 0 a month');

  // ---------------------------------------------------------------- goals: margin, then share
  await go('goals');
  await key('n');
  await type('[data-key="goal-name"]', 'Laptop');
  await type('[data-key="goal-amount"]', '40000');
  await type('[data-key="goal-margin"]', '30000');
  await click('[data-key="goal-save"]');
  await until(`!document.querySelector('dialog[open]')`);
  check('margin: threshold 70,000', await text('[data-test="threshold"]'), 'UAH 70,000.00');
  check('margin: 9,715 lacking', await text('[data-test="lacking"]'), 'UAH 9,715.00');
  check('margin: not within the horizon', await text('[data-test="when"]'), 'Not within the forecast horizon');
  await click('[data-key^="goal-edit-"]');
  await click('[data-key="goal-rule-share"]');
  await type('[data-key="goal-percent"]', '50');
  await click('[data-key="goal-save"]');
  await until(`!document.querySelector('dialog[open]')`);
  check('share 50 %: threshold 80,000', await text('[data-test="threshold"]'), 'UAH 80,000.00');
  check('share 50 %: 75.36 %', await text('[data-test="progress"]'), '75.36 %');

  // A second goal waits for the first; dragged above it, it comes first.
  await key('n');
  await type('[data-key="goal-name"]', 'Mug');
  await type('[data-key="goal-amount"]', '1000');
  await click('[data-key="goal-save"]');
  await until(`!document.querySelector('dialog[open]')`);
  const goalOrder = () => js(`[...document.querySelectorAll('.goal .card-title')].map((n) => n.firstChild.textContent)`);
  const mug = '.goal:nth-child(2)';
  check('below the laptop: what it leaves, 20,285', await text(`${mug} [data-test="have"]`), 'UAH 20,285.00');
  check('below the laptop: after it', await text(`${mug} [data-test="ahead"]`), 'After the goals above, which take UAH 40,000.00');
  check('below a goal never reached: never either', await text(`${mug} [data-test="when"]`), 'Not within the forecast horizon');
  check('… because it waits for it', await text(`${mug} [data-test="waits"]`), 'Waits for Laptop');
  {
    const centre = (selector) => js(`(() => { const n = document.querySelector(${q(selector)}); n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    const [, top] = await centre('.goal:first-child .card-title');
    const [fx, fy] = await centre(`${mug} .goal-handle`);
    const mouse = (type, px, py) => chrome.send('Input.dispatchMouseEvent', { type, x: px, y: py, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }, s);
    await mouse('mousePressed', fx, fy);
    for (let step = 1; step <= 6; step += 1) await mouse('mouseMoved', fx, fy + ((top - 20 - fy) * step) / 6);
    await mouse('mouseReleased', fx, top - 20);
    await sleep(100);
  }
  check('dragged to the top', await goalOrder(), ['Mug', 'Laptop']);
  check('on top it can be bought now', await text('.goal:first-child [data-test="when"]'), 'Can buy now');
  check('the order is kept', await js(`document.querySelector('.goal:first-child .goal-rank').textContent`), '1');
  await js(`document.querySelector('.goal:first-child .goal-handle').focus(), true`);
  await key('ArrowDown');
  check('the arrow key moves it back down', await goalOrder(), ['Laptop', 'Mug']);
  check('… and the handle keeps the focus', await js(`document.activeElement?.dataset.key?.startsWith('goal-drag-') ?? false`), true);
  await shot('2-goals');
  await click(`${mug} [data-key^="goal-edit-"]`);
  await js(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === 'Delete').click(), true`);
  await click('[data-key="confirm"]');
  await until(`document.querySelectorAll('.goal').length === 1`);

  // ---------------------------------------------------------------- a recurring expense and a one-off income
  await go('recurring');
  await key('n');
  await type('[data-key="recurring-name"]', 'Food');
  await type('[data-key="recurring-amount"]', '300');
  await click('[data-key="recurring-every-day"]');
  await type('[data-key="recurring-time"]', '09:00');
  check('the account is the first one', await js(`document.querySelector('[data-key="recurring-account"]').selectedOptions[0].textContent`), 'Monobank · UAH');
  await click('[data-key="recurring-save"]');
  await until(`!document.querySelector('dialog[open]')`);
  check('daily: 30.44 payments a month', await text('[data-test="month-total"]'), 'A month: UAH 0.00 -UAH 9,131.06 = -UAH 9,131.06');

  await go('oneoff');
  check('one-off: an empty tab has no filter', await exists('[data-key="oneoff-filter"]'), false);
  await key('n');
  check('one-off: N opens the form, the cursor in the amount', [await dialogOpen(), await js(`document.activeElement?.dataset.key`)], [true, 'new-amount']);
  await click('[data-key="new-type-income"]');
  await type('[data-key="new-amount"]', '4000+1000');
  check('the arithmetic is shown', await text('dialog[open] .amount-preview'), '= 5,000');
  await type('[data-key="new-date"]', '2026-10-03');
  await type('[data-key="new-note"]', 'Bonus');
  await key('Enter');
  await until(`!document.querySelector('dialog[open]')`);
  check('the income is planned (it is 1 October)', await text('.card .card-title'), 'Planned');
  check('… for 5,000', await text('.op-row .op-amount'), '+UAH 5,000.00');
  check('… and in the period not reconciled yet', await text('[data-test="oneoff-total"]'), '1 operation: +UAH 5,000.00 UAH 0.00 = +UAH 5,000.00');
  await click('[data-key="add-oneoff"]');
  check('the next one is an income again', await js(`document.querySelector('[data-key="new-type-income"]').getAttribute('aria-checked')`), 'true');
  await type('[data-key="new-date"]', '2026-09-30');
  check('a date before the reconciliation warns of the closed period', await js(`!document.querySelector('dialog[open] .warning').hidden`), true);
  await click('dialog[open] .dialog-head .icon-button');
  await until(`!document.querySelector('dialog[open]')`);

  // ---------------------------------------------------------------- a week later: −1 500 unaccounted
  await setNow(at(2026, 10, 8, 10));
  await reload();
  await go('accounts');
  await key('r');
  check('Monobank is expected at 22,900', await js(`document.querySelector('.amount-input').value`), '22900');
  await type('.amount-input', '21400');
  check('the difference shows as it is typed', await text('.reconcile-diff'), '-UAH 1,500.00');
  check('… and the total', (await text('.reconcile-total'))?.trim(), 'Unaccounted since the last reconciliation: -UAH 1,500.00');
  await click('[data-key="reconcile-save"]');
  await until(`!document.querySelector('dialog[open]')`);
  check('unaccounted −1,500 in the report', (await text('[data-test="unaccounted"]'))?.startsWith('-UAH 1,500.00'), true);
  check('… −6,522 a month', (await text('[data-test="unaccounted"] small'))?.trim(), '-UAH 6,522.19 a month');
  check('the pace, as advice', (await text('[data-test="pace"] p'))?.trim(), 'Unaccounted on average: -UAH 214.29 a day, -UAH 6,522 a month (1 interval).');
  check('… not in the forecast: expected now as reconciled', await js(`document.querySelector('[data-test="expected-now"] strong').textContent`), 'UAH 61,685.00');
  await click('[data-key="add-unaccounted"]');
  await until(`document.querySelector('dialog[open]')`);
  check('… offered as a daily recurring expense', await js(`[document.querySelector('[data-key="recurring-name"]').value, document.querySelector('[data-key="recurring-amount"]').value, document.querySelector('[data-key="recurring-account"]').value, document.querySelector('[data-key="recurring-currency"]').value, document.querySelector('[data-key="recurring-every-day"]').getAttribute('aria-checked')]`), ['Unaccounted spending', '214.29', '', 'UAH', 'true']);
  await click('dialog[open] .dialog-head .icon-button');
  await until(`!document.querySelector('dialog[open]')`);
  check('history: −1,500 for the second', await text('.history-row .history-unaccounted'), '-UAH 1,500.00');
  await shot('3-accounts');

  // The bonus is in the interval just reconciled: the open period is empty, the filter finds it.
  await go('oneoff');
  const filterText = () => js(`document.querySelector('[data-key="oneoff-filter"]').selectedOptions[0].textContent`);
  const names = () => js(`[...document.querySelectorAll('.op-row .op-name')].map((n) => n.textContent)`);
  check('one-off: not reconciled yet, by default', await filterText(), 'Not reconciled yet: since Oct 8, 2026');
  check('… nothing in it', await text('.empty-line'), 'Nothing in this period.');
  check('the interval of the last reconciliation is offered', await js(`[...document.querySelectorAll('[data-key="oneoff-filter"] optgroup option')].map((o) => o.textContent)`), ['Oct 1, 2026 – Oct 8, 2026']);
  await choose('[data-key="oneoff-filter"]', await js(`document.querySelector('[data-key="oneoff-filter"] optgroup option').value`));
  check('… and holds the bonus', await names(), ['Bonus']);
  check('… not greyed out as closed', await exists('.op-row--closed'), false);
  await choose('[data-key="oneoff-filter"]', 'dates');
  check('dates: from the 1st of the month to today', await js(`['from', 'to'].map((end) => document.querySelector('[data-key="oneoff-filter-' + end + '"]').value)`), ['2026-10-01', '2026-10-08']);
  check('… the bonus of the 3rd', await names(), ['Bonus']);
  await type('[data-key="oneoff-filter-to"]', '2026-10-02');
  check('… not when they end on the 2nd', await names(), []);
  await type('[data-key="oneoff-filter-to"]', '2026-10-03');
  check('… the last day is included', await names(), ['Bonus']);
  await choose('[data-key="oneoff-filter"]', 'all');
  check('all: the bonus, closed', [await names(), await exists('.op-row--closed')], [['Bonus'], true]);
  await choose('[data-key="oneoff-filter"]', 'open');

  // ---------------------------------------------------------------- removing the expense leaves history alone
  await setNow(at(2026, 10, 9, 12));
  await reload();
  await go('recurring');
  await click('[data-key="every-day"]');
  await click('[data-key^="op-"]');
  await click('[data-key="recurring-delete"]');
  await click('[data-key="confirm"]');
  await until(`!document.querySelector('dialog[open]')`);
  check('deleted: gone from the list', await js(`document.querySelectorAll('.op-row').length`), 0);
  await go('accounts');
  check('history unchanged', await text('.history-row .history-unaccounted'), '-UAH 1,500.00');
  // Expected now: 21 400 and one payment (9 Oct 09:00) before the deletion; unaccounted money is not projected.
  check('expected now: one more payment', await js(`document.querySelector('[data-test="expected-now"] strong').textContent`), 'UAH 61,385.00');

  // ---------------------------------------------------------------- a past reconciliation, and back
  await click('.history-row');
  check('the snapshot bar', await text('.snapshot-bar > span'), 'Reconciliation of Oct 8, 2026, 10:00 AM');
  check('… nothing to edit', await js(`document.querySelectorAll('button.account-row, [data-key="add-asset"], [data-key="reconcile"]').length`), 0);
  check('… its unaccounted', await text('[data-test="snapshot-unaccounted"]'), '-UAH 1,500.00');
  check('… expected and found by currency', await js(`[...document.querySelectorAll('.compare tbody tr')].map((r) => [...r.children].map((c) => c.textContent))[0]`), ['UAH', 'UAH 7,900.00', 'UAH 6,400.00', '-UAH 1,500.00']);
  check('… what was recorded', await js(`[...document.querySelectorAll('.op-row .op-name')].map((n) => n.textContent)`), ['Food', 'Bonus']);
  check('… the last one can be deleted', await exists('[data-key="snapshot-delete"]'), true);
  await shot('4-snapshot');
  await click('[data-key="snapshot-back"]');
  check('back to now', await exists('.snapshot-bar'), false);
  await click('.history li:last-child .history-row');
  check('the first one cannot be deleted', await exists('[data-key="snapshot-delete"]'), false);
  await click('[data-key="snapshot-back"]');

  // ---------------------------------------------------------------- Bought
  await go('goals');
  await click('[data-key^="goal-bought-"]');
  check('bought: the price suggested', await js(`document.querySelector('[data-key="bought-amount"]').value`), '40000');
  await click('[data-key="bought-confirm"]');
  await until(`!document.querySelector('dialog[open]')`);
  check('the goal is among the reached', await text('.done-goals summary'), 'Reached (1)');
  await go('oneoff');
  check('an expense was recorded for it', (await js(`[...document.querySelectorAll('.op-row')].map((r) => r.textContent)`)).some((row) => row.startsWith('Laptop') && row.endsWith('-UAH 40,000.00')), true);

  // ---------------------------------------------------------------- two windows of the app
  {
    const { targetId } = await chrome.send('Target.createTarget', { url: `${ORIGIN}/` });
    const other = await chrome.attach(targetId, 'second window');
    await chrome.until(other, `document.readyState === 'complete' && !document.getElementById('app').classList.contains('app--starting')`, 15000);
    await chrome.evaluate(other, `document.querySelector('[data-tab="accounts"]').click(), true`);
    const names = (session) => chrome.evaluate(session, `[...document.querySelectorAll('.account-name')].map((n) => n.firstChild.textContent).join(',')`);
    await go('accounts');
    check('second window: the same accounts', await names(other), await names(s));
    // A change in this window reaches the other one without a reload.
    await go('accounts');
    await addAccount('asset', 'Piggy bank', 'UAH', 0, '100');
    await settle();
    check('second window: shows the new account by itself', await chrome.until(other, `[...document.querySelectorAll('.account-name')].some((n) => n.firstChild.textContent === 'Piggy bank')`, 5000), true);
    // The other window changes something and saves: this one follows, and nothing is lost either way.
    await chrome.evaluate(other, `document.querySelector('[data-key="add-asset"]').click(), true`);
    await chrome.evaluate(other, `(() => { const set = (k, v) => { const n = document.querySelector('[data-key="' + k + '"]'); n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); }; set('account-name', 'Jar'); set('account-opening', '5'); document.querySelector('[data-key="account-save"]').click(); return true; })()`);
    await settle();
    check('this window: shows the other window\'s account', await until(`[...document.querySelectorAll('.account-name')].some((n) => n.firstChild.textContent === 'Jar')`, 5000), true);
    check('… and keeps its own', await js(`[...document.querySelectorAll('.account-name')].some((n) => n.firstChild.textContent === 'Piggy bank')`), true);
    await chrome.send('Target.closeTarget', { targetId });
    // Both go again, so the numbers below stay those of the task.
    for (const name of ['Jar', 'Piggy bank']) {
      await js(`[...document.querySelectorAll('.account-row')].find((r) => r.textContent.startsWith(${q(name)})).click(), true`);
      await click('[data-key="account-delete"]');
      await click('[data-key="confirm"]');
      await until(`!document.querySelector('dialog[open]')`);
    }
    await settle();
    check('back to the five accounts', await js(`document.querySelectorAll('.account-row').length`), 5);
  }

  // ---------------------------------------------------------------- reload, export, wipe, import
  await settle();
  await reload();
  await go('accounts');
  const before = await personal();
  check('a reload keeps the data', before, 'UAH 21,385.00');
  await go('settings');
  let exports = 0;
  /** Presses an export button and returns the file it downloaded, moved aside so the next export does not take its place. */
  const exportOne = async (button, extension) => {
    for (const name of await readdir(downloads)) if (name.startsWith('cashflow-')) await rm(join(downloads, name));
    await click(`[data-key="${button}"]`);
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      const names = (await readdir(downloads)).filter((n) => n.startsWith('cashflow-') && n.endsWith(extension));
      if (names.length) {
        await sleep(200);
        const kept = join(downloads, `export-${(exports += 1)}${extension}`);
        await (await import('node:fs/promises')).rename(join(downloads, names[0]), kept);
        return kept;
      }
      await sleep(100);
    }
    throw new Error(`No ${extension} download`);
  };
  const json = await exportOne('export-json', '.json');
  const exported = await readFile(json, 'utf8');
  const doc = JSON.parse(exported);
  check('the export: everything in it', [doc.schema, doc.base, doc.accounts.length, doc.reconciliations.length, doc.goals.length], [1, 'UAH', 5, 2, 1]);
  const sqlite = await exportOne('export-sqlite', '.sqlite');
  check('the SQLite export is an SQLite file', (await readFile(sqlite)).subarray(0, 15).toString(), 'SQLite format 3');
  // Encrypted with a password: a short one and two different ones are refused.
  await click('[data-key="export-encrypted"]');
  await type('[data-key="export-password"]', 'short');
  await type('[data-key="export-password-again"]', 'short');
  await click('[data-key="export-encrypted-ok"]');
  check('encrypted: a short password is refused', [await dialogOpen(), await exists('[data-key="export-password"].invalid')], [true, true]);
  await type('[data-key="export-password"]', 'correct horse');
  await type('[data-key="export-password-again"]', 'correct horsf');
  await click('[data-key="export-encrypted-ok"]');
  check('encrypted: two different passwords are refused', [await dialogOpen(), await exists('[data-key="export-password-again"].invalid')], [true, true]);
  await shot('export-encrypted');
  await type('[data-key="export-password-again"]', 'correct horse');
  const encrypted = await exportOne('export-encrypted-ok', '.enc');
  const sealed = await readFile(encrypted);
  check('encrypted: our header, and nothing of SQLite to be seen', [sealed.subarray(0, 12).toString(), sealed.includes('SQLite format 3'), await dialogOpen()], ['CASHFLOW-ENC', false, false]);

  // Wipe: the database and the conveniences, as a new browser would be.
  await js(`new Promise((done) => { const r = indexedDB.deleteDatabase('cashflow'); r.onsuccess = r.onerror = r.onblocked = () => done(true); })`);
  await js(`localStorage.removeItem('cashflow'), true`);
  await reloadAnew();
  check('wiped: the first start again', await exists('.welcome'), true);

  const importFile = async (path) => {
    await go('settings');
    const { root: document } = await chrome.send('DOM.getDocument', {}, s);
    const { nodeId } = await chrome.send('DOM.querySelector', { nodeId: document.nodeId, selector: '#import-file' }, s);
    await chrome.send('DOM.setFileInputFiles', { nodeId, files: [path] }, s);
    await until(`!!document.querySelector('[data-key="confirm"]')`);
    await click('[data-key="confirm"]');
    await settle();
  };
  await importFile(json);
  await go('accounts');
  check('imported JSON: the same personal money', await personal(), before);
  const again = await readFile(await exportOne('export-json', '.json').catch(async () => {
    await go('settings');
    return exportOne('export-json', '.json');
  }), 'utf8');
  check('imported JSON: the same state', again, exported);

  await js(`new Promise((done) => { const r = indexedDB.deleteDatabase('cashflow'); r.onsuccess = r.onerror = r.onblocked = () => done(true); })`);
  await reloadAnew();
  await importFile(sqlite);
  await go('settings');
  const fromSqlite = await readFile(await exportOne('export-json', '.json'), 'utf8');
  check('imported SQLite: the same state', fromSqlite, exported);
  await reload();
  await go('accounts');
  check('after the import and a reload', await personal(), before);

  // A file that is not ours.
  const junk = join(downloads, 'junk.json');
  await (await import('node:fs/promises')).writeFile(junk, '{"hello": 1}');
  await go('settings');
  {
    const { root: document } = await chrome.send('DOM.getDocument', {}, s);
    const { nodeId } = await chrome.send('DOM.querySelector', { nodeId: document.nodeId, selector: '#import-file' }, s);
    await chrome.send('DOM.setFileInputFiles', { nodeId, files: [junk] }, s);
  }
  check('a file that is not ours is refused', await until(`[...document.querySelectorAll('.toast')].some((t) => t.textContent === 'This is not a Cashflow file')`, 3000), true);
  check('… and nothing is asked', await dialogOpen(), false);

  // ---------------------------------------------------------------- the PIN of the database
  await go('settings');
  await click('[data-key="pin-set"]');
  await type('[data-key="pin-new"]', '25801');
  await type('[data-key="pin-again"]', '25801');
  await click('[data-key="pin-save"]');
  check('pin: five digits are refused', [await dialogOpen(), await exists('[data-key="pin-new"].invalid')], [true, true]);
  await type('[data-key="pin-new"]', '2580');
  await type('[data-key="pin-again"]', '2581');
  await click('[data-key="pin-save"]');
  check('pin: two different PINs are refused', [await dialogOpen(), await exists('[data-key="pin-again"].invalid')], [true, true]);
  await type('[data-key="pin-again"]', '2580');
  await click('[data-key="pin-save"]');
  await until(`!document.querySelector('dialog[open]')`);
  check('pin: set', await until(`!!document.querySelector('[data-key="pin-change"]')`, 3000), true);
  await js(`document.querySelector('[data-key="pin-change"]').scrollIntoView(), true`);
  await shot('pin-settings');
  const pinned = await exportOne('export-json', '.json');
  const withPin = JSON.parse(await readFile(pinned, 'utf8'));
  check('pin: its hash is in the database, and so in the export', [withPin.pin?.hash.length, withPin.pin?.salt.length], [64, 32]);
  await sleep(350);
  await chrome.send('Page.reload', {}, s);
  check('pin: a reload asks for it', await until(`!!document.querySelector('[data-key="pin-unlock"]')`, 15000), true);
  await shot('pin-lock');
  check('… and draws none of the data', await js(`document.getElementById('app').classList.contains('app--starting') && document.getElementById('view').childElementCount === 0`), true);
  await js(`document.activeElement.blur(), true`);
  await key('r');
  check('… and the shortcuts wait', await dialogOpen(), false);
  const field = `document.querySelector('[data-key="pin-unlock"]')`;
  const message = `document.querySelector('.lock-message')?.textContent`;
  await type('[data-key="pin-unlock"]', '1111');
  check('pin: a wrong one, checked as soon as four digits are in, waits a second', await until(`${message} === 'Wrong PIN. Try again in 0:01.' && ${field}.disabled`, 3000), true);
  check('… then the field opens again', await until(`!${field}.disabled && ${message} === 'Wrong PIN'`, 3000), true);
  await type('[data-key="pin-unlock"]', '2222');
  check('pin: the next wrong one waits twice as long', await until(`${message} === 'Wrong PIN. Try again in 0:02.'`, 3000), true);
  await chrome.send('Page.reload', {}, s);
  check('pin: a reload does not skip the pause', await until(`${field}?.disabled === true && ${message} === 'Wrong PIN. Try again in 0:02.'`, 15000), true);
  await until(`!${field}.disabled`, 4000);
  await type('[data-key="pin-unlock"]', '2580');
  await ready();
  await go('accounts');
  check('pin: the right one opens the page', [await exists('.lock'), await personal()], [false, before]);
  check('… and the pause is forgotten', await js(`localStorage.getItem('cashflow-pin-wait')`), null);
  await go('settings');
  await click('[data-key="pin-change"]');
  await type('[data-key="pin-current"]', '2580');
  await type('[data-key="pin-new"]', '1357');
  await type('[data-key="pin-again"]', '1357');
  await click('[data-key="pin-save"]');
  await until(`!document.querySelector('dialog[open]')`);
  await sleep(350);
  await chrome.send('Page.reload', {}, s);
  await until(`!!document.querySelector('[data-key="pin-unlock"]')`, 15000);
  await type('[data-key="pin-unlock"]', '1357');
  check('pin: changed, the new one opens the page', await ready(), true);
  await go('settings');
  await click('[data-key="pin-remove"]');
  await type('[data-key="pin-current"]', '0000');
  await click('[data-key="pin-save"]');
  check('pin: removing it asks for the current one', await until(`!!document.querySelector('[data-key="pin-current"].invalid')`, 3000), true);
  await type('[data-key="pin-current"]', '1357');
  await click('[data-key="pin-save"]');
  await until(`!document.querySelector('dialog[open]')`);
  await reload();
  check('pin: removed, the page opens at once', [await exists('.lock'), await go('settings').then(() => exists('[data-key="pin-set"]'))], [false, true]);
  // An imported file brings its own PIN, asked before it takes this database's place.
  {
    const { root: document } = await chrome.send('DOM.getDocument', {}, s);
    const { nodeId } = await chrome.send('DOM.querySelector', { nodeId: document.nodeId, selector: '#import-file' }, s);
    await chrome.send('DOM.setFileInputFiles', { nodeId, files: [pinned] }, s);
  }
  await click('[data-key="confirm"]');
  check('pin: a file with a PIN asks for it', await until(`!!document.querySelector('[data-key="pin-file"]')`, 3000), true);
  await type('[data-key="pin-file"]', '0000');
  await click('[data-key="pin-file-ok"]');
  check('… a wrong one does not import it', await until(`!!document.querySelector('[data-key="pin-file"].invalid')`, 3000), true);
  await type('[data-key="pin-file"]', '2580');
  await click('[data-key="pin-file-ok"]');
  await until(`!document.querySelector('dialog[open]')`);
  await settle();
  check('… the right one does, and its PIN is now the PIN here', await until(`!!document.querySelector('[data-key="pin-change"]')`, 3000), true);
  await importFile(json);
  check('pin: a file without a PIN keeps the PIN in place', await exists('[data-key="pin-change"]'), true);
  await click('[data-key="pin-remove"]');
  await type('[data-key="pin-current"]', '2580');
  await click('[data-key="pin-save"]');
  await until(`!document.querySelector('dialog[open]')`);
  await settle();

  // ---------------------------------------------------------------- several databases
  /** Something the page does reloads it: waits for the new page to be ready. */
  const marked = () => js(`window.__before = true`);
  const reloaded = async () => {
    if (!(await until(`!window.__before`, 15000))) throw new Error('No reload');
    await ready();
    await sleep(150);
  };
  const accountNames = () => js(`[...document.querySelectorAll('.account-name')].map((n) => n.firstChild.textContent)`);
  const picks = () => js(`[...document.querySelectorAll('[data-key="database-pick"]')].map((b) => b.textContent)`);
  const pick = async (name) => {
    await until(`[...document.querySelectorAll('[data-key="database-pick"]')].some((b) => b.textContent === ${q(name)})`, 15000);
    await js(`[...document.querySelectorAll('[data-key="database-pick"]')].find((b) => b.textContent === ${q(name)}).click(), true`);
  };
  const storedKeys = () => js(`new Promise((done) => { const r = indexedDB.open('cashflow'); r.onsuccess = () => { const g = r.result.transaction('state').objectStore('state').getAllKeys(); g.onsuccess = () => { done(g.result.map(String).sort()); r.result.close(); }; }; })`);
  await go('settings');
  check('databases: one, no name in the bar', [await js(`document.querySelectorAll('.database-row').length`), await js(`document.getElementById('database-name').hidden`)], [1, true]);
  await click('[data-key="database-add"]');
  await type('[data-key="database-name"]', 'main');
  await click('[data-key="database-name-save"]');
  check('databases: a name in use is refused', [await dialogOpen(), await exists('[data-key="database-name"].invalid')], [true, true]);
  await type('[data-key="database-name"]', 'Business');
  await marked();
  await click('[data-key="database-name-save"]');
  check('databases: the new one opens, asking for its PIN', await until(`!window.__before && !!document.querySelector('[data-key="pin-skip"]')`, 15000), true);
  await click('[data-key="pin-skip"]');
  await ready();
  check('… empty, its name in the bar', [await exists('.welcome'), await text('#database-name')], [true, 'Business']);
  await click('[data-key="welcome-add"]');
  await type('[data-key="account-name"]', 'Till');
  await type('[data-key="account-opening"]', '500');
  await click('[data-key="account-save"]');
  await settle();
  await reload();
  check('databases: a reload stays in the same one', await accountNames(), ['Till']);
  // A new window, or the installed app: no choice made yet in this tab.
  await js(`sessionStorage.clear(), true`);
  await chrome.send('Page.reload', {}, s);
  check('databases: a new start opens on the list', await until(`document.querySelectorAll('[data-key="database-pick"]').length === 2`, 15000), true);
  check('… with both names', await picks(), ['Main', 'Business']);
  await shot('databases');
  await pick('Main');
  await ready();
  await go('accounts');
  check('databases: the first one, as it was', [await personal(), await text('#database-name')], [before, 'Main']);
  await go('settings');
  await marked();
  await click('[data-key="database-open"]');
  await reloaded();
  await go('accounts');
  check('databases: "Open" in Settings switches', await accountNames(), ['Till']);
  await go('settings');
  await click('[data-key="database-rename"]');
  await type('[data-key="database-name"]', 'Shop');
  await click('[data-key="database-name-save"]');
  await js(`document.querySelector('.database-rows').scrollIntoView(), true`);
  await shot('databases-settings');
  check('databases: renamed', [await text('#database-name'), await js(`[...document.querySelectorAll('.database-row-name')].map((n) => n.firstChild.textContent)`)], ['Shop', ['Main', 'Shop']]);
  // Its own PIN: the lock names the database and offers the others.
  await click('[data-key="pin-set"]');
  await type('[data-key="pin-new"]', '1234');
  await type('[data-key="pin-again"]', '1234');
  await click('[data-key="pin-save"]');
  await until(`!document.querySelector('dialog[open]')`);
  await sleep(350);
  await chrome.send('Page.reload', {}, s);
  check('databases: the PIN screen names the database', await until(`document.querySelector('[data-key="pin-database"]')?.textContent === 'Shop'`, 15000), true);
  await type('[data-key="pin-unlock"]', '0000');
  await until(`document.querySelector('.lock-message')?.textContent.startsWith('Wrong PIN')`, 3000);
  await click('[data-key="pin-another"]');
  await pick('Main');
  await ready();
  await go('accounts');
  check('… and goes back to the list, where the other opens without it', await personal(), before);
  const pauses = () => js(`Object.keys(localStorage).filter((k) => k.startsWith('cashflow-pin-wait')).length`);
  check('databases: the wrong try\'s pause stays with its database', await pauses(), 1);
  // The encrypted file, imported as a database of its own.
  await go('settings');
  await marked();
  {
    const { root: document } = await chrome.send('DOM.getDocument', {}, s);
    const { nodeId } = await chrome.send('DOM.querySelector', { nodeId: document.nodeId, selector: '#import-file' }, s);
    await chrome.send('DOM.setFileInputFiles', { nodeId, files: [encrypted] }, s);
  }
  check('encrypted: importing asks for the password', await until(`!!document.querySelector('[data-key="import-password"]')`, 3000), true);
  await type('[data-key="import-password"]', 'correct horsf');
  await click('[data-key="import-password-ok"]');
  check('… a wrong one does not open it', await until(`!!document.querySelector('[data-key="import-password"].invalid')`, 5000), true);
  await type('[data-key="import-password"]', 'correct horse');
  await click('[data-key="import-password-ok"]');
  await click('[data-key="import-new"]');
  await reloaded();
  await go('accounts');
  check('databases: an import as a new database opens it', [await personal(), await text('#database-name')], [before, 'export-3']);
  await go('settings');
  check('… beside the others', await js(`document.querySelectorAll('.database-row').length`), 3);
  await click('[data-key="delete-database"]');
  check('databases: deleting one names it', (await text('dialog[open] .dialog-body p'))?.startsWith('export-3 is deleted for good'), true);
  await marked();
  await click('[data-key="delete-database-confirm"]');
  check('… and the list comes up without it', await until(`!window.__before && document.querySelectorAll('[data-key="database-pick"]').length === 2`, 15000), true);
  await pick('Shop');
  await until(`!!document.querySelector('[data-key="pin-unlock"]')`, 15000);
  await until(`!document.querySelector('[data-key="pin-unlock"]').disabled`, 5000);
  await type('[data-key="pin-unlock"]', '1234');
  await ready();
  check('… and goes once that database is opened', await pauses(), 0);
  await go('settings');
  await click('[data-key="delete-database"]');
  await type('[data-key="delete-database-pin"]', '1234');
  await marked();
  await click('[data-key="delete-database-confirm"]');
  await reloaded();
  await go('accounts');
  check('databases: the one left opens with no list', [await personal(), await js(`document.getElementById('database-name').hidden`)], [before, true]);
  check('… and nothing of the deleted ones stays stored', await storedKeys(), ['databases', 'sqlite']);

  // ---------------------------------------------------------------- the PWA: offline, and updates by the button
  // The same origin as the single file above, so the same data shows.
  await chrome.send('Page.navigate', { url: `${ORIGIN}/pages/` }, s);
  await ready();
  check('pwa: the service worker takes control', await until(`navigator.serviceWorker.controller !== null`, 15000), true);
  check('pwa: the manifest parses', (await chrome.send('Page.getAppManifest', {}, s)).errors, []);
  check('pwa: installable', (await chrome.send('Page.getInstallabilityErrors', {}, s)).installabilityErrors, []);
  await go('accounts');
  check('pwa: the data is there', await personal(), before);
  net.down = true;
  await reload();
  check('pwa: loads with the server gone', await personal(), before);
  const workerVersion = () => js(`new Promise((resolve) => { const c = new MessageChannel(); c.port1.onmessage = (e) => resolve(e.data); navigator.serviceWorker.controller.postMessage('version', [c.port2]); })`);
  const running = await workerVersion();
  check('pwa: the worker knows its version', running === (await js(`document.querySelector('.about .version')?.textContent ?? ''`)).replace('Cashflow, version ', '') || running.length > 0, true);
  await go('settings');
  await click('[data-key="update-check"]');
  check('pwa: no server, no check', await until(`document.getElementById('update-state')?.textContent === 'No connection: try again later.'`), true);
  net.down = false;
  await click('[data-key="update-check"]');
  check('pwa: nothing new', await until(`document.getElementById('update-state')?.textContent === 'This is the latest version.'`), true);
  net.nextVersion = '9.9.9';
  await click('[data-key="update-check"]');
  check('pwa: a new version waits', await until(`document.getElementById('update-state')?.textContent === 'Version 9.9.9 is ready.'`, 15000), true);
  check('pwa: a dot on the Settings tab', await js(`!document.getElementById('update-dot').hidden`), true);
  check('pwa: the old worker still serves', await workerVersion(), running);
  await js(`window.__beforeUpdate = true`);
  await click('[data-key="update-now"]');
  check('pwa: Update reloads into the new version', await until(`!window.__beforeUpdate && document.readyState === 'complete' && !!document.querySelector('[data-test="personal"], .page-title')`, 15000), true);
  check('pwa: the new worker serves', await workerVersion(), '9.9.9');
  check('pwa: the old cache is gone', (await js(`caches.keys()`)).length, 1);
  check('pwa: the data came through', await (async () => { await go('accounts'); return personal(); })(), before);
  net.down = true;
  await reload();
  check('pwa: offline after the update', await personal(), before);
  net.down = false;
  // The page is the same bytes, only the worker changed: the version the app ran before is set back to see the note.
  await js(`localStorage.setItem('cashflow-version', '0.0.1'), true`);
  await reload();
  check('pwa: "updated" said once', await until(`[...document.querySelectorAll('.toast')].some((t) => t.textContent.startsWith('Updated to '))`), true);
  await reload();
  await sleep(300);
  check('pwa: … and not again', await js(`[...document.querySelectorAll('.toast')].some((t) => t.textContent.startsWith('Updated to '))`), false);
  net.nextVersion = null;
  await js(`navigator.serviceWorker.getRegistration().then((r) => r.unregister())`);

  // ---------------------------------------------------------------- a phone, by touch
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s);
  await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, s);
  await reload();
  await go('accounts');
  check('phone: the tabs along the bottom', await js(`Math.round(document.getElementById('tabs').getBoundingClientRect().bottom) === innerHeight`), true);
  check('phone: no key hints on a touch screen', await js(`getComputedStyle(document.querySelector('.kbd')).display`), 'none');
  check('phone: no sideways scrolling', await js(`document.documentElement.scrollWidth <= innerWidth`), true);
  await go('recurring');
  check('phone: the sub-tabs in a row on top', await js(`getComputedStyle(document.querySelector('.subtabs')).flexDirection`), 'row');
  await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: false }, s);
  await chrome.send('Emulation.clearDeviceMetricsOverride', {}, s);

  // ---------------------------------------------------------------- the page from disk keeps its data
  await chrome.send('Page.navigate', { url: pathToFileURL(APP).href }, s);
  await until(`!!document.querySelector('[data-key="pin-skip"]')`, 15000);
  await setNow(at(2026, 10, 1, 9));
  await reloadAnew();
  check('from disk: a page of its own, empty', await exists('.welcome'), true);
  await click('[data-key="welcome-add"]');
  await type('[data-key="account-name"]', 'On disk');
  await type('[data-key="account-opening"]', '123');
  await click('[data-key="account-save"]');
  await settle();
  await reload();
  check('from disk: IndexedDB kept the account across a reload', await js(`[...document.querySelectorAll('.account-name')].map((n) => n.firstChild.textContent)`), ['On disk']);
  // An overdrawn account archived as forgiven: the closing operation is an income, and it stays after a reload.
  await click('[data-key="add-asset"]');
  await type('[data-key="account-name"]', 'Overdraft');
  await type('[data-key="account-opening"]', '-50');
  await click('[data-key="account-save"]');
  await until(`!document.querySelector('dialog[open]')`);
  await js(`[...document.querySelectorAll('.account-row')].find((r) => r.textContent.startsWith('Overdraft')).click(), true`);
  await click('[data-key="account-archive"]');
  check('archiving an overdraft: it is owed money', (await text('dialog[open] .dialog-body p'))?.startsWith('$50.00 is still owed on it'), true);
  await click('[data-key="archive-mode-write-off"]');
  await click('[data-key="archive-confirm"]');
  await until(`!document.querySelector('dialog[open]')`);
  await settle();
  await reload();
  await go('oneoff');
  check('… written off as an income, kept after a reload', (await js(`[...document.querySelectorAll('.op-row')].map((r) => r.textContent)`)).some((row) => row.startsWith('Closing Overdraft') && row.endsWith('+$50.00')), true);
  await go('accounts');
  check('… and gone from the list', await js(`[...document.querySelectorAll('.account-name')].map((n) => n.firstChild.textContent)`), ['On disk']);

  // A forgotten PIN: a new, empty database takes this one's place, and asks for a PIN of its own.
  await go('settings');
  await click('[data-key="pin-set"]');
  await type('[data-key="pin-new"]', '1111');
  await type('[data-key="pin-again"]', '1111');
  await click('[data-key="pin-save"]');
  await until(`!document.querySelector('dialog[open]')`);
  await sleep(350);
  await chrome.send('Page.reload', {}, s);
  await click('[data-key="pin-forgot"]');
  check('forgot: asked before anything is deleted', await text('dialog[open] h2'), 'Start a new database?');
  await js(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === 'Cancel').click(), true`);
  await sleep(100);
  check('… and "Cancel" keeps it locked, the data in place', [await dialogOpen(), await exists('[data-key="pin-unlock"]')], [false, true]);
  await click('[data-key="pin-forgot"]');
  check('forgot: the name to type is shown', (await text('dialog[open] .field-label'))?.endsWith(': Main'), true);
  await click('[data-key="confirm"]');
  check('forgot: nothing typed, nothing deleted', [await dialogOpen(), await exists('[data-key="forgot-name"].invalid')], [true, true]);
  await type('[data-key="forgot-name"]', 'Mian');
  await click('[data-key="confirm"]');
  check('… nor with a wrong name', [await dialogOpen(), await exists('[data-key="forgot-name"].invalid')], [true, true]);
  await type('[data-key="forgot-name"]', ' main ');
  await click('[data-key="confirm"]');
  check('forgot: the new database asks for a PIN', await until(`!!document.querySelector('[data-key="pin-create"]')`, 5000), true);
  await type('[data-key="pin-new"]', '4321');
  await type('[data-key="pin-again"]', '4322');
  await click('[data-key="pin-create"]');
  check('… two different ones are refused', await text('.lock-message'), 'The two PINs differ');
  await type('[data-key="pin-again"]', '4321');
  await click('[data-key="pin-create"]');
  await ready();
  check('… and it starts empty', await exists('.welcome'), true);
  await sleep(350);
  await chrome.send('Page.reload', {}, s);
  await until(`!!document.querySelector('[data-key="pin-unlock"]')`, 15000);
  await type('[data-key="pin-unlock"]', '1111');
  check('forgot: the old PIN is gone with the old data', await until(`document.querySelector('.lock-message')?.textContent.startsWith('Wrong PIN')`, 3000), true);
  await until(`!document.querySelector('[data-key="pin-unlock"]').disabled`, 3000);
  await type('[data-key="pin-unlock"]', '4321');
  await ready();
  check('forgot: the new PIN opens the new database', [await exists('.lock'), await exists('.welcome')], [false, true]);
  await go('accounts');

  // "Delete this database…" in Settings, the only one: a warning that offers an export, the current PIN, then the new database's question.
  await click('[data-key="welcome-add"]');
  await type('[data-key="account-name"]', 'Doomed');
  await type('[data-key="account-opening"]', '1');
  await click('[data-key="account-save"]');
  await settle();
  await go('settings');
  await click('[data-key="delete-database"]');
  check('delete the only database: the warning offers an export and asks for the PIN', [await exists('[data-key="delete-database-export"]'), await exists('[data-key="delete-database-pin"]')], [true, true]);
  const kept = JSON.parse(await readFile(await exportOne('delete-database-export', '.json'), 'utf8'));
  check('… the export works from the warning, which stays open', [kept.accounts.map((a) => a.name), await dialogOpen()], [['Doomed'], true]);
  await shot('delete-database');
  await type('[data-key="delete-database-pin"]', '0000');
  await click('[data-key="delete-database-confirm"]');
  check('… a wrong PIN deletes nothing', await until(`!!document.querySelector('[data-key="delete-database-pin"].invalid')`, 3000), true);
  await type('[data-key="delete-database-pin"]', '4321');
  await click('[data-key="delete-database-confirm"]');
  check('delete the only database: a new one\'s PIN question comes up', await until(`!!document.querySelector('[data-key="pin-skip"]')`, 5000), true);
  await click('[data-key="pin-skip"]');
  check('… and it is empty, on Accounts', await until(`!!document.querySelector('.welcome')`, 3000), true);
  await reload();
  check('… and stays so, with no PIN', [await exists('.lock'), await exists('.welcome')], [false, true]);
  check('from disk: no warning about storage', await js(`document.getElementById('notice').hidden`), true);

  check('no errors in the page', chrome.errors, []);
} catch (error) {
  failure = error;
} finally {
  await chrome.close();
  server.close();
  await rm(downloads, { recursive: true, force: true });
}
if (failure) {
  console.error(failure);
  process.exit(1);
}
done('app');
