/**
 * The PWA's PNG icons, rendered from assets/icon.svg by the same headless
 * Chrome the tests use — no ImageMagick: a transparent page of the icon's
 * size, a screenshot. The maskable icon puts the mark inside the middle 80 %
 * (the safe zone a launcher may crop to) on a full-bleed background; the
 * Apple one has no transparency, as iOS wants.
 *
 *   node tools/icons.mjs     # -> assets/pwa/*.png
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startChrome } from './chrome.mjs';
import { root } from './load.mjs';

const svg = (await readFile(join(root, 'assets', 'icon.svg'), 'utf8')).replace(/<\?xml[\s\S]*?\?>/, '');
const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const ICONS = [
  { name: 'icon-192.png', size: 192, html: (s) => `<img src="${uri}" width="${s}" height="${s}">` },
  { name: 'icon-512.png', size: 512, html: (s) => `<img src="${uri}" width="${s}" height="${s}">` },
  { name: 'icon-maskable-512.png', size: 512, html: (s) => `<div style="width:${s}px;height:${s}px;background:#1f7a5c;display:grid;place-items:center"><img src="${uri}" width="${s * 0.72}" height="${s * 0.72}"></div>` },
  { name: 'apple-touch-icon.png', size: 180, html: (s) => `<div style="width:${s}px;height:${s}px;background:#1f7a5c;display:grid;place-items:center"><img src="${uri}" width="${s * 0.86}" height="${s * 0.86}"></div>` },
];

const chrome = await startChrome();
try {
  const [tab] = (await chrome.targets()).filter((t) => t.type === 'page');
  const s = await chrome.attach(tab.targetId, 'page');
  await chrome.send('Page.enable', {}, s);
  await chrome.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }, s);
  for (const icon of ICONS) {
    await chrome.send('Emulation.setDeviceMetricsOverride', { width: icon.size, height: icon.size, deviceScaleFactor: 1, mobile: false }, s);
    const html = `<!doctype html><html><body style="margin:0;background:transparent">${icon.html(icon.size)}</body></html>`;
    await chrome.send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` }, s);
    await chrome.until(s, `document.readyState === 'complete' && [...document.images].every((i) => i.complete)`);
    const { data } = await chrome.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: icon.size, height: icon.size, scale: 1 } }, s);
    await writeFile(join(root, 'assets', 'pwa', icon.name), Buffer.from(data, 'base64'));
    console.log(`assets/pwa/${icon.name}`);
  }
} finally {
  await chrome.close();
}
