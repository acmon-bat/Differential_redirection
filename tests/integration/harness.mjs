/**
 * Integration harness: real Chromium + the TEST build of the extension + a
 * local recording proxy that serves fixture sites for fake domains.
 *
 * Every HTTP request the browser makes goes through the proxy (including
 * loopback), so the test can see ALL network activity during an assessment.
 * Nothing in these tests reaches the internet: the proxy serves fixtures and
 * refuses everything else (HTTPS CONNECT tunnels are logged and rejected).
 */
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..');
export const EXTENSION_DIR = join(ROOT, 'dist', 'extension-test');
const FIXTURES = join(here, 'fixtures');

/** Playwright is pre-installed in some environments; it is not a project dependency. */
export function loadPlaywright() {
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {
    return null;
  }
}

/** Chromium derives an unpacked extension's ID from its absolute path. */
export function extensionIdForPath(path) {
  return [...createHash('sha256').update(path).digest('hex').slice(0, 32)]
    .map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

const ROUTES = {
  'shop.plaster-fixture.test': {
    '/': ['shop.html', 'text/html'],
    '/privacy': ['privacy.html', 'text/html'],
    '/privacy-comments': ['privacy-comments.html', 'text/html'],
    '/app.js': ['empty.js', 'text/javascript'],
  },
};

export async function startProxy() {
  const log = [];
  const server = http.createServer((req, res) => {
    let host = req.headers.host ?? '';
    let path = req.url ?? '/';
    if (/^https?:\/\//.test(path)) {
      const u = new URL(path);
      host = u.host;
      path = u.pathname;
    }
    log.push({ at: Date.now(), method: req.method, host, path, url: req.url });
    const route = ROUTES[host]?.[path];
    if (route) {
      res.writeHead(200, { 'content-type': route[1] });
      res.end(readFileSync(join(FIXTURES, route[0])));
      return;
    }
    // Third-party "tracker" hosts get an empty, successful response.
    res.writeHead(200, { 'content-type': path.endsWith('.js') ? 'text/javascript' : 'image/gif' });
    res.end('');
  });
  server.on('connect', (req, socket) => {
    log.push({ at: Date.now(), method: 'CONNECT', host: req.url, path: '', url: req.url });
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { log, port: server.address().port, close: () => new Promise((r) => server.close(r)) };
}

export async function launch(playwright, proxyPort) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'plaster-it-'));
  const context = await playwright.chromium.launchPersistentContext(userDataDir, {
    // Full Chromium in new headless mode: the default headless shell does not run extensions.
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      `--proxy-server=http://127.0.0.1:${proxyPort}`,
      '--proxy-bypass-list=<-loopback>',
    ],
  });
  return {
    context,
    extensionId: extensionIdForPath(EXTENSION_DIR),
    close: async () => {
      await context.close();
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}
