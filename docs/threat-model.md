# Threat Model

**Status:** Initial draft. To be revisited at each phase boundary and whenever permissions, egress or data storage change.

## 1. Scope

The Plaster browser extension (Chromium and Firefox, MV3), the core engine, bundled knowledge data, the optional discovery feature, and the build and release pipeline.

## 2. Key observation

**Plaster is itself a privacy-sensitive product.** Doing its job means seeing which sites a user visits, what requests those sites make, and what forms they present. The most important threat to users is therefore Plaster becoming the leak or the surveillance point. The invariants exist mainly to prevent that.

## 3. Assets

| Asset | Sensitivity |
|---|---|
| A-1 User browsing activity (visited origins, timing) | High |
| A-2 Form contents, credentials, payment data | Critical (Plaster must never touch it) |
| A-3 Locally stored assessments and history | High (it amounts to a browsing history) |
| A-4 Integrity of assessments (scores, guidance) | High: users make decisions from it |
| A-5 Extension code and bundled knowledge data | High: tampering affects every user |
| A-6 User consent state for optional features | Medium |
| A-7 Discovery requests and their recipients | Medium to high, depending on payload |

## 4. Adversaries

| ID | Adversary | Capability |
|---|---|---|
| ADV-1 | Malicious or manipulative website | Full control of page DOM and JS. Can detect the extension and serve different content to it. Can post messages and craft hostile input. |
| ADV-2 | Third-party trackers on a site | Same as ADV-1 within their script context. Can cloak themselves (CNAME, first-party proxying). |
| ADV-3 | Network attacker | Can observe or modify traffic. Relevant to discovery requests and update channels. |
| ADV-4 | Supply-chain attacker | Compromises a dependency, build tool, CI or store account. |
| ADV-5 | Operator of an online service Plaster talks to (including us) | Receives discovery payloads and could log or correlate them. |
| ADV-6 | Other extensions, or local malware / a shared-device user | Can read local profile data and possibly message the extension. |
| ADV-7 | Plaster developers (accidental) | Regressions that add egress, over-collect or mislabel evidence. |

## 5. Threats and mitigations

| ID | Threat | Adversary | Asset | Mitigations |
|---|---|---|---|---|
| T-1 | Plaster leaks browsing activity through its own requests (analytics, favicons, fonts, discovery over-sharing) | ADV-7, ADV-5 | A-1 | I-3, I-4, S-1, S-3. Extension CSP `connect-src`. Egress register. Automated zero-egress test. |
| T-2 | Plaster reads form values (including passwords) through a bug or overreach | ADV-7 | A-2 | I-1. Structure-only observer API. Lint ban on `.value` access in observers, plus code review. No `requestBody`. No input listeners. |
| T-3 | Local assessment history exposes browsing history to a local attacker or other software | ADV-6 | A-3 | S-4: origin-level minimisation, retention limits, one-click clear, nothing stored from private windows, history storage optional. |
| T-4 | A site **games the assessment**: it hides trackers until after observation, detects Plaster, serves clean content, or delays loading trackers | ADV-1, ADV-2 | A-4 | Continuous per-tab observation, not just a snapshot. Assess as observed-so-far, with timestamps. Confidence reflects observation window and coverage. State the limits honestly. Don't instrument in ways that are trivially fingerprintable without need (D-11). |
| T-5 | A site **injects hostile data** (huge DOMs, crafted labels, prototype-pollution payloads, HTML in strings) | ADV-1 | A-4, A-5 | S-6: schema validation, size caps and truncation at the adapter boundary. Render text only (no `innerHTML`). Never use `eval`. Isolated world for content scripts. |
| T-6 | A site or other extension **messages the extension** to spoof signals or results | ADV-1, ADV-6 | A-4 | No `externally_connectable` by default. Validate `sender` (tab ID, frame, extension ID) on every message. MAIN-world instrumentation (if used) passes data through a narrowly validated channel and is treated as untrusted. |
| T-7 | CNAME cloaking or first-party proxying hides trackers | ADV-2 | A-4 | Document it as a known limitation. Possible Firefox-only DNS signal (needs egress review). Lower confidence instead of claiming "no trackers". |
| T-8 | **Supply-chain compromise** inserts exfiltration code or poisons knowledge data | ADV-4 | A-5, A-1 | Minimal dependencies. Lockfile with integrity hashes. Dependency review policy. Reproducible builds as a goal. Data provenance metadata and checksums. CI with least-privilege tokens. 2FA and restricted access for store accounts. CSP as runtime backstop. |
| T-9 | **False sense of safety**: a high grade misleads the user ("A means safe") | Systemic | A-4 | I-8 (unknown ≠ safe). Confidence shown alongside grade. Grade withheld at low confidence (D-13). Language like "appears" and "observed". Visible "what Plaster cannot see" section. |
| T-10 | **Unfair negative assessment** of a legitimate site (reputational or legal risk) | Systemic | A-4 | Transparent, versioned methodology. Evidence links. Wording about observations rather than accusations. Mechanism to report errors (offline-capable, such as a copy-to-clipboard report with no auto-send). |
| T-11 | Discovery feature leaks more than disclosed, or is intercepted or correlated by its operator | ADV-3, ADV-5 | A-7, A-1 | Consent per LF-11 to LF-13. HTTPS only. Minimal payload, preferring a bulk-download design (D-15). No identifiers or cookies. Exact payload tests. Documented retention. |
| T-12 | Malicious knowledge update, if an update channel exists | ADV-3, ADV-4 | A-5 | Prefer shipping data only through store releases (D-9). If a separate channel exists: signed data, data only (never code), schema-validated. |
| T-13 | Permission over-reach makes Plaster a high-value target and erodes trust | ADV-4, systemic | A-1 | I-6. Optional and runtime host permissions (D-12). A justification for every permission. |
| T-14 | Instrumenting page APIs (MAIN world) breaks sites or creates a fingerprint unique to Plaster users | ADV-1 | A-1, A-4 | Optional and off by default until evaluated (D-11). Minimal, non-mutating wrappers if used. Performance budget. |
| T-15 | Differential privacy or another privacy-enhancing technology is claimed on weak evidence, inflating scores | ADV-7, ADV-1 | A-4 | S-8. DP signals are isolated and have no score effect in 0.x (`scoring-methodology.md` §1.4, D7). Disclosed-only evidence is labelled as such. |

## 6. Accepted limitations (to state publicly)

- Plaster sees only what the browser exposes to extensions. Server-side data handling, data sales and retention are invisible to it, except through disclosed or cached evidence.
- Observation starts when Plaster can observe. Activity before then (or before permissions are granted) is missed.
- Sophisticated sites can behave differently when they detect Plaster.
- Plaster is an assessment tool, not a blocker. Installing it does not by itself stop tracking.

## 7. Review triggers

Update this document when: a new permission is added; an egress component is added or changed; local storage of user data changes; MAIN-world instrumentation is enabled; a new data source is bundled; or the release pipeline changes.

## 8. Mitigation status in v0.1.0

| Threat | Implemented mitigation | Evidence |
|---|---|---|
| T-1 Plaster leaks browsing activity | No network code anywhere. Extension CSP `default-src 'none'; connect-src 'none'` for extension pages. **The content-script collector is not covered by the CSP**: static bans on direct and indirect request sinks plus runtime zero-egress tests. No storage. No background worker. | `tests/security/static.test.ts` (source and bundle scans, manifest). `tests/integration` (zero-egress with mutation check, CSP blocks fetch, image and beacon) |
| T-2 Plaster reads form values | Collector reads attributes only. Label and policy text come from page-authored text nodes, skipping controls and `contenteditable`. Validator allow-lists fields and drops everything else. Static ban on `.value`, `FormData`, input listeners and `requestBody`. | Unit test injecting secrets into the snapshot. Integration tests typing secrets into a real page and a DP claim into a comment box |
| T-3 Local history exposure | Nothing is persisted. The assessment lives only in the open popup. | Static ban on storage APIs; no `storage` permission |
| T-4 Site games the assessment | **Partial:** confidence reflects partial visibility. "None observed" explanations carry caveats. | Unit tests on partial-visibility caveats |
| T-5 Hostile page data | Validation with size and length bounds, strict origin parsing (no `URL` parser in core), rendering via `textContent` only. | Validation unit tests. Static ban on `innerHTML`-type sinks |
| T-6 Spoofed messages | No messaging surface at all (no `runtime.onMessage`, no `externally_connectable`). | Static test |
| T-8 Supply chain | Zero runtime dependencies. Four exactly pinned dev dependencies. Readable (unminified) bundles. | Static test on `package.json` |
| T-9 False sense of safety | Low confidence withholds the grade. Unknown is never "safe". A "What Plaster could not see" section. The footer does not claim protection. | Unit tests on invariant I-8 |
| T-13 Permission over-reach | `activeTab` + `scripting` only. | Static and integration manifest tests |
| T-15 DP claimed on weak evidence | Evidence ladder. Vague wording is never DP. Score effect is 0. | `disclosures.test.ts` |
| T-7, T-10, T-11, T-12, T-14 | Not yet addressed (features not built, or accepted limitations). | — |

**New residual risk introduced by the MVP:** the **test build** carries an extra host permission and a test hook. Mitigation: it is built to a separate directory with "(TEST BUILD)" in its name, and a static test asserts that the production manifest equals the reviewed source manifest and that the production bundle contains no hook.
