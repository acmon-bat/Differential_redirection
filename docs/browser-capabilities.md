# Browser Capabilities: What an Extension Can Actually Observe

**Status:** Findings from the MVP sprint (Chromium only). Items are marked
**Verified** (exercised by an automated test in this repository),
**Documented** (from browser documentation or well-established behaviour, not yet tested here), or
**Unverified** (needs investigation).

Invariant I-7: Plaster must not claim to observe what the browser cannot reliably expose.

## 1. The permission trade-off (decision D-12)

| Approach | What it gives | Cost |
|---|---|---|
| `webRequest` + host permissions | All request URLs and response headers (HSTS, CSP, Set-Cookie attributes) | Chromium only reports requests where the extension holds host permission for the request URL (and, per Chromium's documentation, its initiator). Observing third-party requests in practice means `<all_urls>`: "read and change all your data on all websites". **Documented** |
| `cookies` + host permissions | Cookie metadata (and values, which Plaster would have to discard) | Same broad host access. **Documented** |
| **`activeTab` + `scripting`** (implemented) | After the user clicks the toolbar button: script injection into the current tab's main frame | No install-time host access and no warning about reading all sites. Observation is limited to what the page itself can see. **Verified** |

**MVP choice:** `activeTab` + `scripting` only. An optional "enhanced observation" tier
(optional `webRequest` host permissions granted per site) is planned but not built. It
needs a clear consent UX and a fresh threat-model review.

## 2. Signals in the implemented tier (`chromium-mv3-activetab`)

| Signal | Mechanism | Status declared to the engine | Verified? | Gaps |
|---|---|---|---|---|
| Page origin and scheme | `location.origin` | n/a (always known) | **Verified** | Opaque origins (sandboxed frames) are rejected by validation |
| Third-party hosts | Resource Timing API (`performance.getEntriesByType('resource')`), host only | `partial` | **Verified**: detects scripts, images and beacons, **including requests that failed** (e.g. an HSTS-upgraded request the test proxy refused) | Excludes requests from cross-origin iframes, service workers and WebSockets. Pages can clear the buffer, which defaults to 250 entries. Iframe hosts are added from `iframe[src]` |
| Security headers | `<meta http-equiv="Content-Security-Policy">`, `<meta name="referrer">` only | `partial` | **Verified** (capability reporting) | Real HTTP headers are invisible. A missing `<meta>` tag is reported as **unknown**, never "absent" |
| Cookies | Not collected | `unavailable` | **Verified** (reported as unavailable) | Reading `document.cookie` would expose values, so it was deliberately not used |
| Form structure | DOM attributes: `type`, `autocomplete`, `name`, `id`, page-authored label/aria/placeholder text | `available` | **Verified**: classifies email, password, payment and name fields while secrets are typed into them, and the secrets never appear in the output | Main frame only. Forms in cross-origin iframes (e.g. payment widgets) and inside shadow DOM (web components) are not visible, so sensitive fields there go unreported. |
| Form destination | `action` attribute origin only | (part of forms) | **Verified**: no `action` attribute gives **unknown**, not "same site" | Script-submitted forms (`fetch`) cannot be attributed without reading request bodies, which Plaster never does |
| Privacy-policy link | Anchor text and `href` heuristic | `available` | **Verified** | Heuristic; may miss unusual wording |
| Policy claims (PETs and DP) | Local regex over page text, **only** on pages that look like privacy policies. Only flags are returned | `partial` on policy pages | **Verified**: the text is not retained | Keyword heuristics only. Claims are *disclosed*, never verified |
| Fingerprinting API use | Not implemented | `unavailable` | n/a | Needs MAIN-world instrumentation (D-11): detectable, may break sites |

## 3. Security-relevant browser behaviour observed

| Finding | Status |
|---|---|
| The collector runs in the extension's **isolated world**: page scripts cannot read its globals or monkey-patch the built-ins it uses. The data it reads (the DOM, Resource Timing) is still page-controlled, so its output is validated as untrusted. | **Documented**; output validation **Verified** |
| Extension-page CSP `connect-src 'none'` blocks `fetch()` and `img` loads from the popup at runtime. | **Verified** |
| The extension CSP does **not** apply to content scripts. The collector's "no network" guarantee therefore rests on static scans (direct APIs **and** indirect sinks such as `createElement('img')` or `.src =`) plus the runtime zero-egress tests, not on the CSP. | **Documented**; both controls **Verified** by mutation checks |
| `textContent` of a `<label>` does not include values typed into nested inputs or textareas, but **does** include `<option>` text (e.g. "Visa ending 4242"). The collector now reads page-authored text nodes only, skipping controls. | **Verified** |
| `document.body.innerText` **includes text typed into `contenteditable` regions** (comment boxes, rich-text editors). v0.1 used it on policy pages, so typed text could change claim flags. Fixed: policy text now comes from page-authored text nodes, skipping editable regions and controls. | **Verified** (regression test fails with the old code) |
| `navigator.sendBeacon()` **returns `true` even when CSP blocks the request**. Tests must assert on actual network traffic, not return values. | **Verified** (nothing reached the network) |
| Content-script requests appear as requests from the page. The zero-egress test therefore watches the tab, the popup **and** a proxy that sees all browser traffic. A deliberately injected `fetch` in the collector made the test fail (mutation check). | **Verified** |
| Chromium makes its own background requests (e.g. `accounts.google.com`). These are not attributable to Plaster and are excluded by host in the zero-egress test. | **Verified** |
| The **production** build (`dist/extension`) loads in Chromium with exactly `activeTab` + `scripting`, no host permissions, no console errors and no test hook (Day 2 check). | **Verified** (manual scripted check, not part of the automated suite) |
| Automated testing: Playwright's default headless shell **does not run extensions**. The full Chromium build (`channel: 'chromium'`, new headless mode) does. | **Verified** |
| `activeTab` is granted only by a real user gesture, which automation cannot perform. The **test build** adds a host permission for `*.plaster-fixture.test` and a test hook. A static test asserts that these are the only differences from production. | **Verified** |

## 4. Not yet investigated

- Firefox MV3: host-permission UX, the `dns` API for CNAME-cloaking detection, and Resource Timing parity. **Unverified**
- Behaviour on real-world sites at scale (SPAs, large pages, buffer overflow frequency). **Unverified**
- `chrome.scripting` behaviour on pages with strict CSP or `sandbox`. **Unverified**
- Optional `webRequest` tier: whether per-site optional host permissions are enough to see third-party requests initiated by that site. **Unverified**
