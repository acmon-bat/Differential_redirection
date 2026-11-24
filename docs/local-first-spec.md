# Local-First and Offline Operation Specification

**Status:** Normative for requirements (MUST/SHOULD); explanatory elsewhere.
Key words follow RFC 2119.

## 1. Definitions

- **Plaster-initiated request:** any network activity caused by Plaster code, including `fetch`/XHR/WebSocket, loading remote images, fonts, scripts or stylesheets in extension UI, DNS resolution through extension APIs, beacons, and any request made by a content script.
- **Site-initiated request:** network activity by the website itself. Plaster may *observe* these, but must not cause, alter or add to them.
- **Local assessment:** the pipeline observe → normalise → enrich (local data) → evaluate → score → guide → present.
- **Optional online feature:** any feature that needs a Plaster-initiated request. These are currently limited to alternative discovery and possibly knowledge updates.

## 2. Requirements

### 2.1 Assessment path

- **LF-1** Local assessment MUST NOT make any Plaster-initiated request.
- **LF-2** Local assessment MUST produce a complete result (score, grade or explicit withholding, categories, guidance, confidence, explanations) with the device fully offline.
- **LF-3** Local assessment MUST NOT depend on any remote service being reachable, including Plaster-operated ones.
- **LF-4** Content scripts MUST NOT make network requests. In Chromium, content-script fetches carry the page's origin and would look like site traffic, which is deceptive and leaks data.
- **LF-5** Plaster MUST NOT inject resources into pages that cause requests, such as remote images or tracking pixels.
- **LF-6** Plaster MUST NOT modify site requests as part of assessment. Blocking or protection features, if ever added, are a separate decision.

### 2.2 Local data

- **LF-7** All reference data used for assessment (tracker lists, entity maps, curated facts, alternatives) MUST be bundled with the extension or stored locally after an explicit user-approved update.
- **LF-8** Bundled data MUST carry a version, build date, source and licence, and the assessment MUST record the data version used.
- **LF-9** Local data age SHOULD be shown to the user when it is relevant, for example "Tracker data from 2026-11". Stale data SHOULD lower confidence in evidence derived from it. It MUST NOT trigger an automatic fetch.
- **LF-10** Assessment results stored locally MUST be minimised: origin-level, no paths, query strings or page titles. Retention MUST be user-controllable and data MUST be clearable. Nothing is persisted from private windows (see D-10).

### 2.3 Optional online features

- **LF-11** Optional online features MUST be off by default and invoked only by a deliberate user action per use. A setting may allow "always for this feature" only after an initial informed opt-in (to be decided under D-15).
- **LF-12** Before the first use, the user MUST see a disclosure that says: what is sent (field by field), to whom, why, what is retained by the recipient, and how to revoke consent.
- **LF-13** The payload MUST be exactly what was disclosed. Payload construction MUST live in `packages/discovery` and be covered by tests that assert its exact shape.
- **LF-14** Failure or unavailability of online features MUST NOT degrade local assessment.
- **LF-15** Every online feature MUST be registered in `network-egress-register.md`.

## 3. What the website still does

Plaster does not stop the site's own requests. The website continues to load, track and transmit as it would without Plaster. The UI must not imply that Plaster protects the user just by being installed. This needs particular care to avoid a false sense of safety (see threat T-9 in `threat-model.md`).

## 4. Offline behaviour matrix

| Capability | Offline | Notes |
|---|---|---|
| Observe current page signals | ✅ | Observation is of the page's own traffic; if the page loaded from cache there may be fewer signals |
| Score, grade, categories | ✅ | Confidence may be lower if few signals were seen |
| Personal-information guidance | ✅ | |
| Local alternative suggestions | ✅ | From bundled data |
| Online alternative discovery | ❌ | Shown as unavailable, with no automatic retry |
| Knowledge updates | ❌ | Uses the existing local version |

## 5. Technical enforcement

1. **Static:** `core` and `knowledge` cannot type-check network APIs, and lint bans network globals outside `discovery` (`architecture.md` §7).
2. **Manifest CSP:** `content_security_policy.extension_pages` includes `connect-src 'self'` (plus at most the documented discovery origin when that feature exists). This blocks network calls from the service worker and extension pages at runtime, even if code regresses. *(Exact MV3 CSP behaviour in Chromium and Firefox is to be verified in Phase 2.)*
3. **No remote assets:** bundle all fonts and icons. Favicons come from the browser's local cache API or aren't shown.
4. **Test:** an automated browser test loads fixture pages with the extension, runs assessments, and asserts that no request originated from the extension (by extension origin or initiator, and by a proxy log of unexpected hosts).
5. **Review:** any PR that touches `discovery`, the manifest CSP or permissions requires explicit reviewer sign-off against this spec.

## 6. Non-goals

- Server-side scoring, cloud reputation lookups, or "phone home" checks of any kind during assessment.
- Sending page content, policy text or screenshots to any AI or remote service.
