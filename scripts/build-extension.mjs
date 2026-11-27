/**
 * Builds the Chromium MV3 extension with esbuild.
 *
 *   node scripts/build-extension.mjs          -> dist/extension       (load unpacked in Chrome)
 *   node scripts/build-extension.mjs --test   -> dist/extension-test  (integration tests only)
 *
 * The test build differs from production in exactly two ways, both asserted by
 * tests/security/static.test.ts:
 *   1. host permission for the fixture domain *.plaster-fixture.test only, so
 *      the test can inject the collector without the toolbar click that grants
 *      activeTab;
 *   2. a test hook in the popup (compiled out of production via `define`).
 */
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isTest = process.argv.includes('--test');
const outdir = join(root, 'dist', isTest ? 'extension-test' : 'extension');
const ext = join(root, 'apps', 'extension');

export const TEST_HOST_PERMISSIONS = ['http://*.plaster-fixture.test/*'];

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: {
    popup: join(ext, 'src/popup/popup.ts'),
    collector: join(ext, 'src/content/collector.ts'),
  },
  outdir,
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  minify: false,          // readable output: reviewers (and store reviewers) can audit it
  minifySyntax: true,     // removes dead branches such as the test hook, keeps names and whitespace
  sourcemap: false,
  legalComments: 'none',
  define: { __PLASTER_TEST__: JSON.stringify(isTest) },
  logLevel: 'warning',
});

for (const f of ['popup.html', 'popup.css']) cpSync(join(ext, 'static', f), join(outdir, f));
const manifest = JSON.parse(readFileSync(join(ext, 'static', 'manifest.json'), 'utf8'));
if (isTest) {
  manifest.name += ' (TEST BUILD)';
  manifest.host_permissions = TEST_HOST_PERMISSIONS;
}
writeFileSync(join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${isTest ? 'TEST ' : ''}extension -> ${outdir}`);
