/**
 * Static security tests: enforce Plaster's invariants (docs/invariants.md) at
 * the source, configuration and build level. Fast, and they need no browser.
 *
 * These complement, and do not replace, the behavioural integration tests in
 * tests/integration (which observe real network activity in Chromium).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

function filesUnder(dir: string, ext = /\.ts$/): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p, ext));
    else if (ext.test(name)) out.push(p);
  }
  return out;
}

/** Remove comments so documentation that *mentions* forbidden APIs is not flagged. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function violations(files: string[], patterns: Array<[RegExp, string]>): string[] {
  const found: string[] = [];
  for (const f of files) {
    const src = code(f);
    for (const [re, why] of patterns) if (re.test(src)) found.push(`${relative(ROOT, f)}: ${why}`);
  }
  return found;
}

const NETWORK: Array<[RegExp, string]> = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bsendBeacon\b/, 'navigator.sendBeacon'],
  [/\bimportScripts\b/, 'importScripts'],
  [/\bnew\s+Image\s*\(/, 'new Image() (network load)'],
  [/\bRTCPeerConnection\b/, 'WebRTC'],
];

const STORAGE: Array<[RegExp, string]> = [
  [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/, 'web storage'],
  [/\bchrome\.storage\b/, 'chrome.storage'],
  [/\bdocument\.cookie\b|\bchrome\.cookies\b|\bcookieStore\b/, 'cookie access'],
];

const RUNTIME_PACKAGES = [join(ROOT, 'packages/core/src'), join(ROOT, 'packages/knowledge/src')];
const EXTENSION_SRC = join(ROOT, 'apps/extension/src');

test('S-5 / I-4: core and knowledge packages use no network, DOM, browser, storage or Node APIs', () => {
  const files = RUNTIME_PACKAGES.flatMap((d) => filesUnder(d));
  assert.ok(files.length > 5);
  const found = violations(files, [
    ...NETWORK, ...STORAGE,
    [/(?<![.\w])(document|window|navigator|globalThis\.document)\s*\./, 'DOM globals'],
    [/\bchrome\s*\.|\bbrowser\s*\./, 'extension APIs'],
    [/from\s+['"]node:|require\s*\(/, 'Node built-ins / require'],
    [/\beval\s*\(|new\s+Function\s*\(/, 'dynamic code'],
  ]);
  assert.deepEqual(found, []);
});

test('S-5: core and knowledge are compiled without DOM or Node type definitions', () => {
  for (const pkg of ['packages/core', 'packages/knowledge']) {
    const cfg = readFileSync(join(ROOT, pkg, 'tsconfig.json'), 'utf8');
    assert.match(cfg, /"lib":\s*\["ES2022"\]/, `${pkg} must use lib ES2022 only`);
    assert.match(cfg, /"types":\s*\[\]/, `${pkg} must not include ambient types`);
  }
});

test('I-1: extension source never reads form values, request bodies or clipboard', () => {
  const found = violations(filesUnder(EXTENSION_SRC), [
    [/\.value\b/, '.value access'],
    [/\.valueAsNumber\b|\.valueAsDate\b|\.selectedOptions\b|\.checked\b/, 'form state access'],
    [/requestBody/, 'webRequest requestBody'],
    [/\bclipboard\b/i, 'clipboard access'],
    [/addEventListener\s*\(\s*['"](input|change|keydown|keyup|keypress|paste)['"]/, 'input event listener'],
    [/new\s+FormData\b/, 'FormData (reads values)'],
  ]);
  assert.deepEqual(found, []);
});

test('I-4 / S-2 / T-5: extension source makes no network requests, stores nothing and never interprets HTML', () => {
  const found = violations(filesUnder(EXTENSION_SRC), [
    ...NETWORK, ...STORAGE,
    [/\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write/, 'HTML injection sink'],
    [/\beval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*['"]/, 'dynamic code'],
    [/\bchrome\.runtime\.(sendMessage|connect)\b|externally_connectable/, 'messaging surface (none needed)'],
  ]);
  assert.deepEqual(found, []);
});

/**
 * The extension CSP protects extension PAGES only. The collector runs as a
 * content script, which the CSP does not cover, so indirect ways of causing a
 * request (creating resource elements, assigning URLs, navigation, workers,
 * dynamic import) are banned in all extension source.
 */
test('I-4: extension source contains no indirect request sinks (content scripts are not covered by the CSP)', () => {
  const found = violations(filesUnder(EXTENSION_SRC), [
    [/createElement\s*\(\s*['"`](img|script|link|iframe|frame|audio|video|source|object|embed|track|image)['"`]/i, 'creates a resource-loading element'],
    [/\bel\s*\(\s*['"`](img|script|link|iframe|audio|video|source|object|embed)['"`]/, 'creates a resource-loading element via el()'],
    [/\.(src|srcset|href|poster|data|action|formAction|ping|background)\s*=(?!=)/, 'assigns a URL-bearing property'],
    [/setAttribute\s*\(\s*['"`](src|srcset|href|poster|data|action|formaction|ping|background|style)['"`]/i, 'sets a URL-bearing attribute'],
    [/['"`](src|srcset|href|poster|ping|formaction)['"`]\s*:/, 'URL-bearing attribute in an attribute map'],
    [/\bwindow\.open\s*\(|\blocation\.(assign|replace)\s*\(|\blocation(\.href)?\s*=(?!=)/, 'navigation'],
    [/\bimport\s*\(/, 'dynamic import'],
    [/\bnew\s+(Shared)?Worker\s*\(|serviceWorker\.register/, 'worker'],
    [/\bnew\s+Audio\s*\(|\bfetchLater\b|\bFontFace\s*\(/, 'resource loading API'],
  ]);
  assert.deepEqual(found, []);
});

test('I-6: manifest requests only activeTab + scripting, with a strict CSP', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'apps/extension/static/manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting']);
  for (const key of ['host_permissions', 'optional_permissions', 'optional_host_permissions', 'content_scripts', 'background', 'externally_connectable', 'web_accessible_resources']) {
    assert.equal(manifest[key], undefined, `manifest must not declare ${key}`);
  }
  const csp: string = manifest.content_security_policy.extension_pages;
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /unsafe-eval|unsafe-inline|https?:|\*/);
});

test('build: production bundle has no test hook; test build differs only as documented', () => {
  execFileSync(process.execPath, [join(ROOT, 'scripts/build-extension.mjs')], { stdio: 'pipe' });
  execFileSync(process.execPath, [join(ROOT, 'scripts/build-extension.mjs'), '--test'], { stdio: 'pipe' });
  const prod = join(ROOT, 'dist/extension');
  const testBuild = join(ROOT, 'dist/extension-test');
  assert.ok(!readFileSync(join(prod, 'popup.js'), 'utf8').includes('__plasterTest'), 'test hook must be compiled out');
  const source = JSON.parse(readFileSync(join(ROOT, 'apps/extension/static/manifest.json'), 'utf8'));
  const prodManifest = JSON.parse(readFileSync(join(prod, 'manifest.json'), 'utf8'));
  assert.deepEqual(prodManifest, source, 'production manifest must equal the reviewed source manifest');
  const testManifest = JSON.parse(readFileSync(join(testBuild, 'manifest.json'), 'utf8'));
  const { host_permissions, name, ...rest } = testManifest;
  const { name: _n, ...sourceRest } = source;
  assert.deepEqual(rest, sourceRest);
  assert.deepEqual(host_permissions, ['http://*.plaster-fixture.test/*']);
  assert.match(name, /TEST BUILD/);
  // Bundled output also contains no network primitives (defence against a dependency sneaking one in).
  for (const f of ['popup.js', 'collector.js']) {
    const js = readFileSync(join(prod, f), 'utf8');
    for (const [re, why] of NETWORK) assert.doesNotMatch(js, re, `${f} contains ${why}`);
    assert.doesNotMatch(js, /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function\s*\(/, `${f} contains an HTML or dynamic-code sink`);
  }
});

test('I-10: network egress register lists no runtime component, matching the code', () => {
  const register = readFileSync(join(ROOT, 'docs/network-egress-register.md'), 'utf8');
  assert.match(register, /\| \*\(none\)\* \|/, 'register states that no runtime component makes requests');
  // ...and no runtime source file uses a network API (checked above), so the two agree.
});

test('supply chain: no runtime dependencies; dev dependencies are an explicit allow-list with exact versions', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ['@types/chrome', '@types/node', 'esbuild', 'playwright', 'typescript']);
  for (const v of Object.values(pkg.devDependencies) as string[]) assert.match(v, /^\d+\.\d+\.\d+$/, 'pin exact versions');
});


