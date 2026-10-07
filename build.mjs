/**
 * Bundles src/ into ONE self-contained build/cashflow.html.
 *
 * Styles, SQLite (sql.js: its WebAssembly is inlined as bytes by esbuild's
 * binary loader), the icon and the compiled TypeScript all go inside, so the
 * result opens from a file:// URL with no network access and no sibling files.
 *
 * Beside it goes build/pages/: the same page as an installable PWA for GitHub
 * Pages — a manifest, icons and a service worker that keeps it offline.
 *
 * The version is package.json's and nowhere else: the page shows it, the PWA's
 * cache is named after it.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const at = (...parts) => join(root, ...parts);
const watch = process.argv.includes('--watch');
const outFile = at('build', 'cashflow.html');

/**
 * package.json's version, x.y.z, and the one the page shows: the same for a
 * build of the commit tagged v<version>, with the commit added for any other —
 * 0.8.0+1a2b3c4 — so a page built from main is not taken for the release.
 */
async function readRelease() {
  const { version } = JSON.parse(await readFile(at('package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`package.json: the version must be x.y.z, not ${version}`);
  const git = (...args) => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return '';
    }
  };
  // The release workflow names the tag it builds; a checkout of a tag may not list it.
  const tagged = process.env.RELEASE_TAG === `v${version}` || git('tag', '--points-at', 'HEAD').split('\n').includes(`v${version}`);
  const commit = tagged ? '' : git('rev-parse', '--short', 'HEAD');
  return { version, label: commit ? `${version}+${commit}` : version };
}

/** Set by buildOnce() before anything is bundled. */
let release;

/** `</script` inside a string literal would close the inline tag early. */
const guard = (code) => code.replace(/<\/(script|style)/gi, '<\\/$1');

/**
 * `<!--` followed by `<script` before any `-->` puts the HTML parser into the
 * "script data double escaped" state: the closing </script> stops closing, and
 * the page runs nothing at all. Library strings can hold such a pair.
 */
function assertScriptCloses(code) {
  for (let from = code.indexOf('<!--'); from >= 0; from = code.indexOf('<!--', from + 4)) {
    const close = code.indexOf('-->', from + 4);
    const script = code.slice(from + 4).search(/<script/i);
    if (script >= 0 && (close < 0 || from + 4 + script < close)) {
      throw new Error(`"<!--" followed by "<script" in the bundle would break the page: …${code.slice(Math.max(0, from - 40), from + 40)}…`);
    }
  }
}

/**
 * sql.js's Node build reaches for fs, path and crypto; the browser build esbuild
 * picks (its "browser" export) does not, but a stray import must not pull Node
 * shims into the page either.
 */
const nodeOnlyStubs = {
  name: 'node-only-stubs',
  setup(builder) {
    builder.onResolve({ filter: /^(fs|path|crypto)$/ }, (args) => ({ path: args.path, namespace: 'stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'module.exports = {};', loader: 'js' }));
  },
};

async function bundle(entry) {
  const result = await build({
    entryPoints: [at(entry)],
    bundle: true,
    format: 'iife',
    target: ['es2022'],
    platform: 'browser',
    minify: !watch,
    sourcemap: false,
    legalComments: 'none',
    charset: 'utf8',
    // SQLite's WebAssembly comes in as a Uint8Array: no file next to the page, no fetch.
    loader: { '.wasm': 'binary' },
    define: { __APP_VERSION__: JSON.stringify(release.label) },
    write: false,
    plugins: [nodeOnlyStubs],
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error('esbuild returned an empty result');
  return output.text;
}

/** The whole point of the build: nothing may be fetched at runtime. */
function assertSelfContained(html) {
  // Only the markup is searched for attributes: the bundled script builds its own elements, from data: and blob: only.
  const markup = html.replace(/<script>[\s\S]*?<\/script>/g, '');
  const offenders = [
    [/<script[^>]+\ssrc=/i, '<script src=…>'],
    [/<link[^>]+href=["'](?!data:)/i, '<link href=…>'],
    [/@import\s+(url\()?["']?(?!data:)/i, '@import'],
    [/url\(\s*["']?(https?:)?\/\//i, 'url(http…) or url(//…)'],
    [/<(iframe|object|embed|frame)\b/i, 'an embedded page'],
    [/http-equiv=["']?refresh/i, 'a refresh to elsewhere'],
  ];
  const attributes = /\s(src|href|srcset|data|action|poster)\s*=\s*["']?(?!data:|blob:|#|["'])/i;
  for (const [pattern, name] of offenders) {
    if (pattern.test(html)) throw new Error(`An external reference is left in the file: ${name}`);
  }
  const found = attributes.exec(markup);
  if (found) throw new Error(`An external reference is left in the file: ${found[0].trim()}…`);
  if (!html.includes('http-equiv="Content-Security-Policy"')) {
    throw new Error('The Content-Security-Policy meta tag is missing');
  }
}

/** Under assets/; each goes to build/pages/ under its own name. */
const PWA_ICONS = ['icon.svg', 'pwa/icon-192.png', 'pwa/icon-512.png', 'pwa/icon-maskable-512.png', 'pwa/apple-touch-icon.png'];

/**
 * The page's CSP forbids every fetch; the installed app needs its manifest, its
 * service worker and its icons, all from its own origin. connect-src stays 'none',
 * so the page itself still reaches nothing.
 */
function allowPwa(html) {
  const pattern = /(http-equiv="Content-Security-Policy" content=")([^"]*)/;
  if (!pattern.test(html)) throw new Error('The Content-Security-Policy meta tag is missing');
  return html.replace(pattern, (_, attr, policy) => {
    const directives = new Map(policy.split(';').map((d) => d.trim().split(/\s+/)).map(([name, ...sources]) => [name, sources]));
    if (!directives.has('img-src')) throw new Error('The Content-Security-Policy has no img-src');
    directives.get('img-src').push("'self'");
    directives.set('manifest-src', ["'self'"]);
    directives.set('worker-src', ["'self'"]);
    return attr + [...directives].map(([name, sources]) => [name, ...sources].join(' ')).join('; ');
  });
}

/**
 * build/pages/: the page plus what makes it installable. Every path is
 * relative, so it works under a project site's /<repo>/ prefix.
 */
async function buildPages(html) {
  const dir = at('build', 'pages');
  const head = [
    '<link rel="manifest" href="manifest.webmanifest">',
    '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
    '<meta name="theme-color" content="#f7f7f4" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#16181b" media="(prefers-color-scheme: dark)">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
    // The page registers the worker itself (update.ts): this is how it knows it is the PWA.
    '<meta name="service-worker" content="sw.js">',
  ].join('\n');
  const page = allowPwa(html).replace('</head>', () => `${head}\n</head>`);
  // A deploy between two releases changes the page, not the version: the hash tells them apart.
  const cache = `${release.version}-${createHash('sha256').update(page).digest('hex').slice(0, 12)}`;

  const manifest = {
    name: 'Cashflow',
    short_name: 'Cashflow',
    description: 'Personal finances without the bookkeeping, offline',
    id: './',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#f7f7f4',
    theme_color: '#1f7a5c',
    icons: [
      { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const worker = (await readFile(at('src/pwa/sw.js'), 'utf8')).replaceAll('__CACHE__', cache).replaceAll('__VERSION__', release.label);
  await Promise.all([
    writeFile(join(dir, 'index.html'), page, 'utf8'),
    writeFile(join(dir, 'sw.js'), worker, 'utf8'),
    writeFile(join(dir, 'manifest.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    // Without it Pages runs the files through Jekyll, which is only wasted time here.
    writeFile(join(dir, '.nojekyll'), '', 'utf8'),
    ...PWA_ICONS.map((path) => copyFile(at('assets', path), join(dir, basename(path)))),
  ]);
  console.log(`build/pages/ — PWA for GitHub Pages (cache ${cache})`);
}

async function buildOnce() {
  release = await readRelease();
  const [template, styles, icon, appJs] = await Promise.all([
    readFile(at('src/app/template.html'), 'utf8'),
    readFile(at('src/app/styles.css'), 'utf8'),
    readFile(at('assets/icon.svg'), 'utf8'),
    bundle('src/app/main.ts'),
  ]);

  const svg = icon.replace(/<\?xml[\s\S]*?\?>/, '').trim();
  const iconUri = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

  const code = guard(appJs);
  assertScriptCloses(code);
  const html = template
    .replace('/*__STYLES__*/', () => styles)
    .replace('/*__APP__*/', () => code)
    .replaceAll('__ICON__', () => iconUri);

  assertSelfContained(html);

  await mkdir(at('build'), { recursive: true });
  await writeFile(outFile, html, 'utf8');
  const kb = (n) => (n / 1024).toFixed(1);
  console.log(
    `build/cashflow.html ${release.label} — ${kb(Buffer.byteLength(html, 'utf8'))} KB ` +
      `(code ${kb(appJs.length)} KB, styles ${kb(styles.length)} KB)`,
  );
  await buildPages(html);
}

await buildOnce();

if (watch) {
  const { watch: watchDir } = await import('node:fs');
  let pending = null;
  for (const dir of ['src', 'assets']) {
    watchDir(at(dir), { recursive: true }, () => {
      clearTimeout(pending);
      pending = setTimeout(() => buildOnce().catch((error) => console.error(error.message)), 120);
    });
  }
  console.log('watching src/ and assets/ …');
}
