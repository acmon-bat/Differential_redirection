# Open Technical Decisions

Each entry lists the options, trade-offs and a **recommendation**. None of these have been decided. Outcomes should be recorded as ADRs in `docs/decisions/NNNN-title.md`.

Priority: **P0** blocks Phase 1, **P1** blocks Phase 2–4, **P2** is needed later.

---

### D-1 · Package manager and monorepo tooling · P0
- **Options:** npm workspaces · pnpm workspaces · Yarn · add-ons (Turborepo or Nx).
- **Trade-offs:** npm needs no extra tool but allows phantom dependencies. pnpm has strict dependency isolation, a fast content-addressed store and good supply-chain hygiene, at the cost of one extra tool. Turborepo or Nx add infrastructure we don't need at this scale.
- **Recommendation:** **pnpm workspaces, without Turborepo or Nx.** Revisit if build times grow.

### D-2 · Package granularity · P0
- **Options:** (a) one package per brief boundary (about 8 packages); (b) four packages: `core`, `knowledge`, `discovery`, `extension`, with internal modules enforced by lint; (c) a single package.
- **Trade-offs:** (a) gives maximum separation but a lot of config overhead for no current consumer. (c) can't enforce network isolation well. (b) isolates the boundaries that carry security weight (network, browser APIs, data licensing).
- **Recommendation:** **(b)**. Split further when a second consumer appears.

### D-3 · Build tooling for the extension · P1
- **Options:** `tsc` + esbuild scripts · Vite (plain) · WXT · Plasmo.
- **Trade-offs:** WXT and Plasmo speed up cross-browser MV3 work (manifest generation, hot reload) but bring large dependency trees and framework conventions. esbuild is tiny and transparent, though we would write our own manifest handling.
- **Recommendation:** **esbuild (or plain Vite) with hand-written manifests per browser.** Re-evaluate WXT after the Phase 2 spike. `core` builds with `tsc` only.

### D-4 · UI framework for the extension · P1
- **Options:** none (vanilla TS + templates) · Preact · React · Svelte · Lit.
- **Trade-offs:** the core is framework-independent regardless. The UI is small (popup or side panel), so bundle size and dependency count matter. React is familiar but heavy.
- **Recommendation:** **Preact or vanilla.** Decide in Phase 4.

### D-5 · Browser targets · P0
- **Options:** Chromium first · Firefox first · both from the start · also Safari.
- **Trade-offs:** capabilities differ (for example, Firefox's blocking `webRequest`, `dns` API and host-permission UX). Supporting both early stops Chromium-only assumptions creeping into the evidence model. Safari adds Xcode packaging and different APIs.
- **Recommendation:** **Chromium and Firefox (both MV3) from Phase 2.** Safari is deferred.

### D-6 · Evidence provenance model · P0
- **Options:** (a) a single enum: observed / disclosed / cached / unknown, as in the brief; (b) two axes: provenance (observed / disclosed / unknown) × freshness (live / cached with date and source).
- **Trade-offs:** (a) is simpler to explain. (b) is more accurate, since a cached fact was originally observed or disclosed by someone, and that affects how far to trust it.
- **Recommendation:** **(b) internally, mapped to the four user-facing labels in the UI.**

### D-7 · Privacy policy analysis · P1
- **Options:** (a) none; (b) analyse only when the user visits the policy page (content script, local heuristics); (c) fetch the policy automatically (an extension-initiated request, which breaks LF-1); (d) fetch with explicit consent.
- **Trade-offs:** policy text gives useful *disclosed* evidence, but local NLP is limited and may mislead (see the DP wording rules). (c) breaks the local-first rule.
- **Recommendation:** **(a) for the MVP, then (b)** with conservative keyword or structure heuristics labelled `disclosed`, unverified. Reject (c). Consider (d) only later.

### D-8 · Knowledge data sources and licensing · P1
- **Candidates:** EasyPrivacy, Disconnect, DuckDuckGo Tracker Radar, Ghostery's TrackerDB, our own curated lists.
- **Trade-offs:** licences vary. Some are copyleft (GPL or CC BY-SA), and some are reportedly non-commercial (for example CC BY-NC-SA), which would restrict Plaster's licensing and distribution. Quality and update cadence also differ.
- **Recommendation:** decide **Plaster's own licence first (D-17)**, then pick compatible sources. Record source, licence and version per dataset. **Every licence needs verifying. They are not yet confirmed.**

### D-9 · Knowledge update channel · P2
- **Options:** (a) ship data only in extension releases; (b) a separate, user-approved data update (signed, data only); (c) automatic background updates.
- **Trade-offs:** (a) adds no new egress (the store update is browser-initiated) but data ages between releases. (b) gives fresher data, adds an egress component, and needs signing infrastructure. (c) breaks the consent principles.
- **Recommendation:** **(a)**, with data age shown in the UI. Revisit (b) if staleness becomes a real problem.

### D-10 · Local storage and retention of assessments · P1
- **Options:** keep nothing beyond the current tab · keep per-origin results with retention · full history.
- **Trade-offs:** history enables "compare sites" and caching, but creates a browsing-history artefact (T-3).
- **Recommendation:** **default: session-only, per tab.** Opt-in per-origin history with a retention limit (for example 30 days) and one-click clear. Never persist from private windows, and Plaster should be disabled in private windows unless the user enables it.

### D-11 · MAIN-world API instrumentation (fingerprinting detection) · P1
- **Options:** none · optional, off by default · on by default.
- **Trade-offs:** this is a strong signal for fingerprinting. But it can be detected and evaded, it can break sites, it costs performance, and it may make Plaster users fingerprintable themselves.
- **Recommendation:** **none for the MVP.** Rely on known-script lists. Evaluate during the Phase 2 spike.

### D-12 · Permission model · P0 (decide provisionally, confirm after Phase 2)
- **Options:** (a) broad host permissions at install (`<all_urls>`) for always-on passive observation; (b) `activeTab` only, with "reload to assess"; (c) optional host permissions granted per site, or globally by opt-in, with (b) as the baseline.
- **Trade-offs:** (a) gives the most complete observation but the biggest trust ask and attack value (T-13), plus store review friction. (b) has minimal permissions but misses page-load activity unless the user reloads. (c) balances the two but makes the UX more complex.
- **Recommendation:** **(c)**: start with `activeTab` and an explicit "Observe this site" or "Always observe" permission request. This is the most important product decision to discuss.

### D-13 · Score presentation · P1
- **Sub-questions:** Should the headline score cover posture only, or posture plus exposure? Should the grade scale be A–F with or without E? Should the grade be withheld or marked provisional at low confidence?
- **Recommendation:** **posture only** for the headline. **A, B, C, D, F** (familiar; drop E) unless there's a reason to keep six bands. **Show "provisional"** at medium confidence and **withhold the letter grade** at low confidence.

### D-14 · Treatment of differential privacy · P1
- **Options:** exclude from the score entirely (informational only) · small capped bonus at L3/L4 (as currently drafted) · a penalty for absence in certain categories.
- **Recommendation:** **informational only in v0.1**, with the capped bonus considered once a curated evidence process exists (Phase 9). No penalties for absence.

### D-15 · Online alternative discovery: privacy design · P2
- **Options:** (a) send the current domain to a server; (b) send only a coarse category ("email provider"); (c) bulk-download the whole alternatives dataset and match locally, so nothing site-specific is sent; (d) a privacy-preserving lookup (bucketed hash prefixes).
- **Trade-offs:** (a) is simplest but leaks browsing. (c) leaks nothing site-specific and works offline afterwards, but the dataset is larger. (b) and (d) sit in between.
- **Recommendation:** **(c) first**, which makes "online discovery" more like "refresh the alternatives dataset". Use (b) only if live search proves necessary.

### D-16 · Runtime validation approach · P1
- **Options:** hand-written type guards · a small schema library (Valibot or Zod).
- **Trade-offs:** hand-written guards add no dependency but are verbose and error-prone at the hostile-input boundary. A library adds a dependency to `core`.
- **Recommendation:** **hand-written guards in Phase 1.** Re-evaluate if the schema surface grows.

### D-17 · Licence for Plaster · P0
- **Options:** MIT/Apache-2.0 (permissive, easy reuse of `core`) · GPL-3.0/MPL-2.0 (copyleft, compatible with some tracker lists).
- **Trade-offs:** this decides which datasets can be bundled (D-8) and how reusable `core` is for third parties. Separate licences for code and data are possible.
- **Recommendation:** discuss, as it is a product decision. A common pattern is **code under Apache-2.0 or MPL-2.0, with data under each dataset's own licence in a separate package.**

**✅ APPROVED (owner, 2026-11-25): Apache-2.0 for project-owned code, documentation and data.** Applied in `LICENSE`, `NOTICE` and `package.json` (`"license": "Apache-2.0"`). Third-party material keeps its own licence and attribution (`THIRD_PARTY_NOTICES.md`), and Apache-2.0 does not override it. Options considered:

| Option | Implications |
|---|---|
| **Apache-2.0** (recommended) | Permissive, so the engine can be reused, including commercially. Includes an explicit patent grant and requires a `NOTICE` file to be retained. Same licence as TypeScript; widely accepted by employers. |
| MIT | Simplest permissive licence; no patent grant. |
| MPL-2.0 | File-level copyleft: changes to Plaster's own files must stay open, while embedding stays easy. Same licence as the Public Suffix List. |
| GPL-3.0 / AGPL-3.0 | Strong copyleft: derivatives must stay open and could bundle GPL tracker lists. Deters reuse of the engine. |
| No licence | All rights reserved: the public can view the repository but not legally reuse it. Contradicts the "reusable component" goal. |

**Third-party considerations for this release:**
- Runtime dependencies: none. Development dependencies: TypeScript (Apache-2.0), esbuild (MIT) and `@types/*` (MIT). None is bundled into the extension.
- Tracker seed: written for Plaster; vendor names are used descriptively.
- Public-suffix subset: entries from the Public Suffix List (MPL-2.0), noted in the source.
- Future third-party tracker lists may impose copyleft or non-commercial terms (D-8).

### D-18 · Test framework · P0
- **Options:** `node:test` (no dependency; Node 22 can run TypeScript through type stripping) · Vitest.
- **Recommendation:** **Vitest** for TypeScript ergonomics and snapshot support, which helps scoring fixtures. `node:test` is acceptable if we want zero dev dependencies.

### D-19 · Repository naming · P2
The repository is currently `Differential_redirection`. Should it be renamed to `plaster`? This affects links only, so there is low urgency.

### D-20 · User-facing wording and legal posture · P2
Grading named websites carries reputational and legal risk (T-10). Wording guidelines need to be agreed (observational, not accusatory), along with a disclaimer and an error-report path. Consider getting legal input before a public release.

---

## Owner decisions recorded (2026-11-25)

| Decision | Outcome |
|---|---|
| Q-4 Hard caps | ✅ Approved: C (69) for HTTP pages; F (39) for insecure password/payment submission. Initial judgement-based thresholds, not calibrated. |
| Q-6 Unknown evidence | ✅ Approved: Tracking must be assessed and ≥ 75% of applicable category weight scored before a grade is shown; I-8 reworded |
| Q-7 Methodology version | ✅ Approved: methodology 0.3.0; release version v0.1.0 |
| D-17 Licence | ✅ Approved: Apache-2.0 for project-owned material; third-party licences unaffected |
| Q-1, Q-2, Q-3, Q-5 and the sprint table below | Still open |

## Provisional decisions taken during the MVP sprint (owner approval needed)

These were taken to reach a demonstrable milestone. Each is easy to revisit, and none is recorded as an ADR until approved.

| Decision | Provisional choice | Deviation from recommendation? | Why | Cost of reversing |
|---|---|---|---|---|
| D-1 Package manager | npm, single root `package.json`, no workspaces | **Yes** (recommended pnpm) | Fewer moving parts; npm was enough for 4 dev dependencies | Low |
| D-2 Packages | `core`, `knowledge`, `apps/extension`; `discovery` not created | No | — | — |
| D-3 Build tool | esbuild, hand-written manifest, unminified output | No | — | — |
| D-4 UI framework | None (vanilla DOM, `textContent` only) | No | — | Low |
| D-5 Browsers | Chromium only | **Yes** (recommended both) | Delivery time; Firefox listed as unverified | Medium (adapter work) |
| D-6 Provenance | Two axes internally, four user-facing labels | No | — | — |
| D-7 Policy analysis | Option (b): local keyword detection on policy pages the user opens; flags only | No | — | — |
| D-8 Data sources | Own ~40-domain seed (no third-party licence) | n/a | Avoids licence questions for now | Low |
| D-10 Storage | Nothing stored at all | Stricter than recommended | Simplest privacy story for the MVP | Low |
| D-11 MAIN-world instrumentation | Not implemented | No | — | — |
| D-12 Permissions | `activeTab` + `scripting` only; optional `webRequest` tier planned | No | — | — |
| D-13 Presentation | Posture-only score; A/B/C/D/F; provisional at medium confidence, withheld at low; caps shown regardless | No | — | — |
| D-14 DP | Informational only, score effect 0 | No | — | — |
| D-16 Validation | Hand-written allow-list validator | No | — | — |
| D-18 Tests | `node:test` + Node type stripping; Playwright from the environment for integration | **Yes** (recommended Vitest) | Zero test dependencies | Low |

**New questions raised by the sprint:**
- **Q-1:** Should Playwright become a pinned dev dependency, so integration tests run on any machine (currently they are skipped when it is unavailable)? This adds a large dev dependency.
- **Q-2:** Should the 0.1 weights be reviewed by the owner before any public demo? They are judgement calls (`scoring-methodology.md` §1.8).
- **Q-3:** Should the enhanced (`webRequest`) tier be Plaster's next capability, or Firefox parity?
- **Q-4 · ✅ APPROVED (owner, 2026-11-25):** hard caps of **C (69)** for HTTP pages and **F (39)** for insecure password or payment submission. These are **initial, judgement-based thresholds, not empirically calibrated values**. Original question: approve the cap levels introduced in methodology 0.2.0: an HTTP page gives at most **C**, and an insecure password or payment field gives **F**. Alternatives: cap HTTP at D, or use no HTTP cap (relying on the transport category weight alone, which let an HTTP site score A).
- **Q-6 · ✅ APPROVED (owner, 2026-11-25):** no grade unless the Tracking category is assessed and ≥ 75% of applicable category weight is scored; I-8 reworded accordingly. Plaster does not claim that removing unknown evidence can never increase the underlying numerical score. Tests verify the withholding behaviour (`REVIEW R8`, `Q-6` tests in `packages/core/test/assess.test.ts`). Original question: approve methodology 0.3.0's display gating (≥ 75% of category weight scored; tracking required) and reword invariant I-8 from "Unknown values never raise a score" to the achievable guarantee: "Unknown evidence is never credited; it lowers confidence; blind spots withhold the grade". Alternatives: (a) a pessimistic default for unknowns, which treats missing evidence as bad and breaks neutrality; (b) show a score *range* (worst to best case over unknowns), which is a new feature.
- **Q-7 · ✅ APPROVED (owner, 2026-11-25):** methodology version **0.3.0**; the application/release version stays **v0.1.0**. Original question: approve the methodology version bump to **0.3.0** (scoring behaviour changed; see `scoring-methodology.md` §1.9).
- **Q-5 (from the v0.1 review):** Should policy-claim scanning also be skipped on pages that contain account or credential fields (e.g. `/account/privacy` settings pages)? Currently only page-authored text is read and only flags are kept, so the residual risk is low.
