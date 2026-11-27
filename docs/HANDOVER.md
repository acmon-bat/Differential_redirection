# Plaster: Handover

**Version:** v0.1.0 · scoring methodology 0.3.0 · knowledge base 2026.11-demo
**State:** initial-release candidate: **an uncalibrated, fixture-tested prototype, not production-ready.** Reviewed twice (see [`review-2026-11.md`](review-2026-11.md)). Scoring thresholds are owner-approved judgement calls, not calibrated against real websites.
**Licence:** Apache-2.0 for project-owned material; third-party material keeps its own licence (see `THIRD_PARTY_NOTICES.md`).

## 1. What is implemented

| Component | Status | Notes |
|---|---|---|
| **Core assessment engine** (`packages/core`) | Implemented | Pure TypeScript with no browser APIs, network or dependencies. Validates untrusted input, then runs 18 rules across 6 categories. **Risk** (score, grade, lights), **evidence quality** and **confidence** are computed separately. Caps for HTTP pages and insecure credentials. A grade is shown only when tracking is assessed and ≥ 75% of the assessment is scored. |
| **Evidence model** | Implemented | Every item is labelled observed / disclosed / cached / unknown, and every explanation links to evidence. Unknown is never credited. |
| **Personal-information guidance** | Implemented (rule-based) | 9 data types × 4 levels, with reasons and tips. Never "reasonable to share" without third-party visibility. |
| **Differential-privacy / PET panel** | Partial | Keyword evidence ladder (L0–L4) on privacy-policy pages the user opens. Informational only; score effect 0. |
| **Knowledge base** (`packages/knowledge`) | Partial | ~40 hand-curated tracker domains and a public-suffix subset. Demonstration seed only. |
| **Chromium extension** (`apps/extension`) | Implemented, fixture-tested | `activeTab` + `scripting` only. Click-to-assess popup. Nothing stored. No background worker. Strict CSP. |
| **CLI demo** (`scripts/assess-fixture.ts`) | Implemented | Assesses a JSON snapshot without a browser |
| Firefox, enhanced (`webRequest`) tier, alternatives, online discovery, calibration | Planned | See `roadmap.md` |

## 2. How to install and demonstrate

Requires Node.js ≥ 22.18.

```bash
npm ci
```

**Demo A: engine only, no browser.**

```bash
npm run demo:cli -- fixtures/snapshots/tracker-heavy-news.json
```

```bash
npm run demo:cli -- fixtures/snapshots/insecure-login.json
```

```bash
npm run demo:cli -- fixtures/snapshots/privacy-friendly-activetab.json
```

| Fixture | Expected grade | Confidence | Talking point |
|---|---|---|---|
| tracker-heavy-news | **C** (56/100), final | high | Session replay next to a payment form; four advertising networks named with owners |
| insecure-login | **F** (39/100 capped), provisional | medium | Two caps: HTTP page (≤ C) and insecure password field (F). The shown number is the cap ceiling. |
| privacy-friendly-activetab | **A** (100/100), provisional | medium | Cookies and headers *unknown*, not "passed". Tracking flagged as limited visibility. |

**Demo B: browser extension.**

```bash
npm run build:extension
```

1. In Chrome or Chromium, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist/extension`.
2. Visit a website and click the Plaster toolbar button.
3. Points to show:
   - grade, confidence and evidence quality as three separate results;
   - expand a category to see explanations and evidence labels;
   - "What to share here";
   - "What Plaster could not see";
   - "Everything Plaster collected" (no values, paths or query strings).
4. Open the site's privacy policy and assess again. The PET panel shows disclosed claims, and "anonymised" wording is labelled as *not* differential privacy.

On live sites, expect partial visibility and *provisional* or *withheld* grades. That is by design.

## 3. How to run the tests

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run test:integration
```

| Suite | Count | Needs |
|---|---|---|
| Unit (`packages/core/test`) | 55 | Node ≥ 22.18 |
| Static security (`tests/security`) | 9 | Node ≥ 22.18 |
| Integration (`tests/integration`) | 9 | Playwright + its Chromium build. Skipped with a message if absent. |

The integration tests use a local recording proxy and fake domains (`*.plaster-fixture.test`), so nothing reaches the internet. They use a **test build** (`dist/extension-test`) with one extra host permission and a test hook, because `activeTab` needs a real click. A static test asserts that these are the only differences from production.

## 4. Verification results (Day 2)

| Command | Result |
|---|---|
| `npm run typecheck` | Exit 0 |
| `node --test "packages/*/test/**/*.test.ts"` | 55 passed, 0 failed |
| `node --test "tests/security/**/*.test.ts"` | 9 passed, 0 failed |
| `npm run build:extension` | Exit 0; `dist/extension` built |
| `npm run test:integration` | 9 passed, 0 failed, 0 skipped |
| `npm run demo:cli -- <3 fixtures>` | Exit 0; grades as in §2 |
| Fresh copy + `npm ci` + tests + build + CLI | Pass |
| Production build loaded in Chromium (scripted check) | Permissions `activeTab`, `scripting`; no hosts; no errors; no test hook |

Mutation checks (each made its test fail, then was reverted):
- an exfiltration `fetch` in the collector;
- an `img.src` pixel in extension source;
- reverting the policy-text reader to `innerText`.

## 5. Known limitations

- **Partial visibility** (`activeTab`): Resource Timing misses cross-origin iframes, service workers and WebSockets, and can be cleared. HTTP headers and cookies are not visible. Main frame only; shadow-DOM forms are not inspected.
- **Tracker detection is not comprehensive** (a ~40-domain seed). First-party CDNs on other domains count as third parties.
- **Uncalibrated scoring:** weights, thresholds, caps and the 75% gate are judgement calls. The numeric score can shift a few points when a minor category is unknown (methodology §1.6).
- **Fixture-tested only;** Chromium only.
- **Heuristics:** field classification (English-centric), privacy-policy link, policy-page detection, DP keywords.
- **Snapshot in time;** server-side behaviour is invisible.

## 6. Outstanding security concerns

| # | Concern | Control | Residual |
|---|---|---|---|
| S1 | The content-script collector is not covered by the extension CSP | Static bans on direct and indirect sinks; zero-egress tests; mutation-checked | Low. Regex scanning is not a proof. |
| S2 | The proxy layer excludes Google hosts (browser traffic) | Tab and popup listeners; no background worker | Low; documented |
| S3 | Hostile pages can shape what the collector sees | Isolated world; validation; `textContent` rendering | Pages can game their assessment (T-4) |
| S4 | The policy heuristic may scan account pages | Page-authored text only; flags only | Low (Q-5) |
| S5 | The test build has extra privileges | Separate folder and name; static comparison with production | Low, provided it is never distributed |
| S6 | Supply chain | No runtime dependencies; 4 pinned dev dependencies; lockfile | No CI yet, so no automated `npm ci` integrity check |
| S7 | Over-reassurance from a provisional "A (100)" on partial evidence | Provisional label; limited-visibility flags; "could not see" list | Medium; owner decision (review §2.1) |

## 7. Release blockers and recommended scope

**Resolved on 2026-11-25:** licence (Apache-2.0) and methodology approvals Q-4, Q-6 and Q-7.

**Remaining before a public reference:**
1. **Publishing:** the work exists only in your downloaded copy and this environment. Commit and push from your machine.
2. **Optional:** replace "The Plaster Authors" in `NOTICE` with your name if you prefer a named copyright holder.

**Recommended initial release (`v0.1.0`):** core engine, CLI demo, Chromium `activeTab` extension (load unpacked; **not** a Chrome Web Store release), all documentation, and the test suites. Describe it as *"a reviewed, test-backed prototype; scoring uncalibrated; fixture-tested only"*.

**Out of scope for this release:**
- Chrome Web Store publication (needs live-site testing and a privacy policy for the extension itself).
- Firefox support.
- Calibration claims.

## 8. Recommended next steps

1. **Calibration corpus:** snapshots from 10–20 live sites, reviewed by hand. This also exercises the collector on real pages.
2. **CI:** typecheck, unit, static and integration tests on every push, with `npm ci`.
3. **Enhanced observation tier** (optional per-site `webRequest`), behind a consent UX and a threat-model update.
4. **Firefox adapter;** local alternatives; consent-gated online discovery only after D-15.
