# Security and Privacy Invariants

**Status:** Normative. These rules are non-negotiable. A change that would break one needs an explicit, documented project decision first, and never an implementation shortcut.

Every pull request should be checked against this list.

## The invariants

| # | Invariant | What it means in practice |
|---|---|---|
| I-1 | **Never collect or transmit actual form values.** | Plaster may inspect form *structure*: field types, `autocomplete` tokens, `name`/`id`/label text and the form `action` origin. It must never read `.value`, listen for `input`/`change`/`keydown` content, read clipboard data, or request `requestBody` from `webRequest`. |
| I-2 | **Never transmit passwords, payment details or personal information.** | This holds even with consent. No feature may need it. |
| I-3 | **Never transmit browsing history.** | No URLs, origins, titles or visit lists leave the device, except the minimum the user explicitly approves for an optional feature (see I-5). |
| I-4 | **No external requests during local assessment.** | The assessment path (observe → normalise → evaluate → score → guide) makes zero Plaster-initiated network requests. That covers fetches, image or font loads, DNS lookups, favicon fetches, beacons and analytics. |
| I-5 | **Optional online features are explicit and consent-based.** | They start only after a deliberate user action, after a plain-language disclosure of exactly what will be sent and to whom. Consent is specific to the feature and revocable. Plaster never auto-triggers them or re-prompts persistently. |
| I-6 | **Minimum browser permissions.** | Each permission is justified in `docs/architecture.md` (permissions table, to be added in Phase 2). Prefer optional and runtime-granted permissions over install-time ones. |
| I-7 | **Do not claim to observe what browser APIs cannot reliably expose.** | Capabilities are documented per browser in a capability matrix. When a signal is unavailable, the UI says "not observable in this browser", never "none found". |
| I-8 | **Missing evidence is not proof of good privacy.** | Missing (unknown) evidence is never credited as positive. It lowers evidence quality and confidence, and is shown to the user. **No grade is shown unless the Tracking category is assessed and at least 75% of the applicable category weight is scored**; the only exception is an F cap from an observed insecure password or payment field. Plaster does **not** claim that removing unknown evidence can never increase the underlying numerical score: excluding a minor unscored category can shift it (methodology 0.3.0 §1.6). *Wording approved by the owner, 2026-11-25 (Q-6).* |
| I-9 | **Evidence, scoring and recommendations are explainable.** | Every score component and recommendation links to the evidence and the rule that produced it. The methodology is versioned. |
| I-10 | **Document every component that can make an external network request.** | Every such component is listed in [`network-egress-register.md`](network-egress-register.md). Code that isn't listed must not do network I/O. |

## Supporting rules

These follow from the invariants and are enforced the same way.

- **S-1: No telemetry, analytics or remote crash reporting**, opt-in or otherwise, unless a future documented decision says so.
- **S-2: No remote code.** All executable code ships in the extension package, with no remotely loaded scripts, rules that execute code, or `eval`. (MV3 store policies require this too.)
- **S-3: No third-party resources in extension UI.** Fonts, icons and images are bundled. Site favicons, if shown, come only from the browser's local favicon cache API, never a fetch.
- **S-4: Plaster's own local data is sensitive.** Stored assessments are themselves a partial browsing history. They are minimised (origin-level, no full URLs or query strings), user-clearable, and never persisted from private/incognito windows (see `open-decisions.md` D-10).
- **S-5: The core engine is network-incapable by construction.** `packages/core` has no access to `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`, DOM or Node network types (see the enforcement section in `architecture.md`).
- **S-6: Untrusted input.** All page-derived data is treated as hostile. It is never rendered as HTML, and it is validated and size-bounded before entering the engine.
- **S-7: Honest language.** User-facing text says "appears", "observed" or "the site states". It doesn't present inferences as facts about a site's real behaviour.
- **S-8: Differential privacy and other privacy-enhancing technologies are never inferred from vague wording** such as "anonymised" or "aggregated". See `scoring-methodology.md` Part 2, D7 (evidence ladder); in 0.3.0 PET claims have no score effect (§1.4).

## Enforcement (planned)

| Mechanism | Covers | Phase |
|---|---|---|
| `packages/core` tsconfig with `lib: ["ES2022"]` (no `DOM`), no `@types/node` | S-5, I-4 | 1 |
| Lint rule banning network globals and imports outside allow-listed packages | I-4, I-10 | 1 |
| Dependency allow-list and review for new dependencies | Supply chain | 1 |
| Extension CSP `connect-src 'self'` (plus only the discovery host, if enabled) | I-4, S-3 | 4–5 |
| Automated test: run an assessment with network egress monitoring and assert zero Plaster-initiated requests | I-4 | 4 |
| PR checklist referencing this document | All | 1 |
