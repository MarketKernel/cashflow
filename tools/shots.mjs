/**
 * Screenshots of every tab, to look at a layout rather than assume it:
 * builds, opens build/cashflow.html from disk in headless Chrome, imports the
 * sample household (tools/sample.mjs) and captures each tab on a computer, the
 * reconciliation form and a past reconciliation, the dark theme, Arabic right
 * to left, and a phone.
 *
 *   npm run shots                  # -> shots/
 *   npm run shots -- shots/before  # -> shots/before/
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHROME, sleep, startChrome } from './chrome.mjs';
import { root } from './load.mjs';
import { sampleDocument } from './sample.mjs';

const dir = resolve(process.argv[2] ?? 'shots');
mkdirSync(dir, { recursive: true });
if (!CHROME) {
  console.log('No Chrome found — set CHROME=/path/to/chrome.');
  process.exit(1);
}
const built = spawnSync(process.execPath, ['build.mjs'], { cwd: root, stdio: 'inherit' });
if (built.status !== 0) process.exit(built.status ?? 1);

const temp = await mkdtemp(join(tmpdir(), 'cashflow-shots-'));
const sample = join(temp, 'sample.json');
await writeFile(sample, JSON.stringify(await sampleDocument()));
const url = pathToFileURL(join(root, 'build', 'cashflow.html')).href;

const chrome = await startChrome();
try {
  const [tab] = (await chrome.targets()).filter((t) => t.type === 'page');
  const s = await chrome.attach(tab.targetId, 'page');
  await chrome.send('Page.enable', {}, s);
  await chrome.send('DOM.enable', {}, s);
  const js = (expression) => chrome.evaluate(s, expression);
  const viewport = async (width, height, mobile = false) => {
    await chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile }, s);
    // A phone is a touch screen: no key hints.
    await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 }, s);
  };
  const ready = () => chrome.until(s, `document.readyState === 'complete' && !document.getElementById('app').classList.contains('app--starting')`, 15000);
  const open = async (prefs) => {
    await js(`localStorage.setItem('cashflow', ${JSON.stringify(JSON.stringify({ language: 'en', theme: 'light', ...prefs }))}), true`);
    await chrome.send('Page.reload', {}, s);
    await ready();
    await sleep(400);
  };
  const shot = async (name) => {
    const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' }, s);
    await writeFile(join(dir, `${name}.png`), Buffer.from(data, 'base64'));
  };
  const click = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).click(), true`);

  await viewport(1280, 900);
  await chrome.send('Page.navigate', { url }, s);
  // A new database asks for a PIN first: the sample goes in without one.
  await chrome.until(s, `!!document.querySelector('[data-key="pin-skip"]')`, 15000);
  await click('[data-key="pin-skip"]');
  await ready();
  // The new database is saved after a pause: a reload before it would ask for the PIN again.
  await sleep(800);
  // The sample goes in as a person would put it: Settings → Import.
  await open({ tab: 'settings' });
  const { root: document } = await chrome.send('DOM.getDocument', {}, s);
  const { nodeId } = await chrome.send('DOM.querySelector', { nodeId: document.nodeId, selector: '#import-file' }, s);
  await chrome.send('DOM.setFileInputFiles', { nodeId, files: [sample] }, s);
  await chrome.until(s, `!!document.querySelector('[data-key="confirm"]')`);
  await click('[data-key="confirm"]');
  await sleep(600);

  await open({ tab: 'accounts' });
  await shot('1-accounts');
  await js(`window.scrollTo(0, document.body.scrollHeight), true`);
  await sleep(200);
  await shot('1b-accounts-history');
  await click('[data-key="reconcile"]');
  await sleep(300);
  await shot('2-reconcile');
  await js(`document.querySelector('dialog').close(), true`);
  await click('[data-key^="rec-"]');
  await sleep(300);
  await shot('3-snapshot');
  await open({ tab: 'recurring', every: 'month' });
  await shot('4-recurring');
  await open({ tab: 'oneoff' });
  await shot('5-oneoff');
  await js(`(() => { const n = document.querySelector('[data-key="oneoff-filter"]'); n.value = 'dates'; n.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(200);
  await shot('5b-oneoff-dates');
  await click('[data-key="add-oneoff"]');
  await sleep(300);
  await shot('5c-oneoff-new');
  await js(`document.querySelector('dialog').close(), true`);
  await open({ tab: 'goals' });
  await shot('6-goals');
  await open({ tab: 'settings' });
  await shot('7-settings');
  await open({ tab: 'accounts', theme: 'dark' });
  await shot('8-dark');
  await open({ tab: 'goals', theme: 'dark' });
  await shot('8b-dark-goals');
  await open({ tab: 'accounts', language: 'ar' });
  await shot('9-arabic');
  await open({ tab: 'goals', language: 'ar' });
  await shot('9b-arabic-goals');

  await viewport(390, 844, true);
  await open({ tab: 'accounts' });
  await shot('10-phone-accounts');
  await open({ tab: 'recurring', every: 'day' });
  await shot('11-phone-recurring');
  await open({ tab: 'oneoff' });
  await shot('12-phone-oneoff');
  await js(`(() => { const n = document.querySelector('[data-key="oneoff-filter"]'); n.value = 'dates'; n.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(200);
  await shot('12b-phone-oneoff-dates');
  await open({ tab: 'goals' });
  await shot('12c-phone-goals');
  await open({ tab: 'accounts' });
  await click('[data-key="reconcile"]');
  await sleep(300);
  await shot('13-phone-reconcile');
  await open({ tab: 'accounts', theme: 'dark' });
  await shot('14-phone-dark');
  if (chrome.errors.length) console.log('page errors:', chrome.errors);
} finally {
  await chrome.close();
  await rm(temp, { recursive: true, force: true });
}
console.log(`screenshots in ${dir}`);
