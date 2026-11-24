# Architecture Overview

**Status:** Proposal for discussion. Items marked **[D-n]** are open decisions (see `open-decisions.md`).

## 1. Goals that shape the architecture

1. **The core is reusable.** It is a pure TypeScript engine that works in an extension, a CLI, a test harness or a future app.
2. **Local-first by construction.** Network capability is physically isolated in one optional package, which keeps it out of the assessment path.
3. **Browser differences are explicit.** Adapters declare what they can observe, and the engine reasons about what is missing.
4. **Explainability is part of the data model.** Every conclusion carries references back to its evidence and the rules that produced it.

## 2. Layered view

```
┌──────────────────────────────────────────────────────────────────┐
│ apps/extension  (browser-specific; the only place browser APIs live) │
│  ┌──────────────┐   ┌────────────────────┐   ┌────────────────┐   │
│  │ Content       │   │ Background /        │   │ UI (popup,     │   │
│  │ scripts       │──▶│ service worker      │──▶│ side panel,    │   │
│  │ (DOM signals) │   │ (webRequest,        │   │ options)       │   │
│  └──────────────┘   │ cookies, storage)   │   └────────────────┘   │
│                     └─────────┬──────────┘                         │
│        browser adapters emit RawSignals + a CapabilityProfile      │
└───────────────────────────────┼────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│ packages/core  (pure TS: no DOM, no browser APIs, no network)      │
│                                                                    │
│  observation/   RawSignals ──normalise──▶ Evidence[]                │
│  evidence/      Evidence model, provenance, confidence             │
│  scoring/       Rules ──▶ category results ──▶ score, grade        │
│  guidance/      Personal-information sharing recommendations       │
│  alternatives/  Local alternative matching (against knowledge)     │
│  assessment/    Orchestration ──▶ Assessment (versioned, explained) │
└───────────────────────────────┬────────────────────────────────────┘
                                │ reads (injected interface)
┌───────────────────────────────▼────────────────────────────────────┐
│ packages/knowledge  (local evidence database: bundled, versioned data) │
│  tracker/entity lists, domain → organisation, category data,       │
│  curated alternatives, cached disclosed facts                      │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ packages/discovery  (OPTIONAL; the ONLY runtime package allowed to   │
│ make network requests; invoked only via explicit user consent flow)  │
└────────────────────────────────────────────────────────────────────┘
```

**Dependency rule (enforced by lint):**
`extension → core, knowledge, discovery` · `core → (nothing runtime; knowledge only via interface)` · `discovery → core types only` · **nothing depends on `extension`**, and **`core` never depends on `discovery`.**

## 3. Component responsibilities

| Boundary (from brief) | Location | Responsibility | Must not |
|---|---|---|---|
| Core assessment engine | `core/assessment` | Run the pipeline, produce a versioned `Assessment` with explanations | Touch browser APIs, the DOM or the network |
| Browser observation | `apps/extension/src/observers` | Collect raw, value-free signals via browser APIs | Read form values or request bodies |
| Normalisation | `core/observation` | Turn browser-agnostic `RawSignals` into typed `Evidence` with provenance | Assume a signal's absence means it doesn't exist (needs the capability profile) |
| Privacy scoring | `core/scoring` | Apply versioned rules to evidence, giving category results, score, grade and confidence | Use opaque or learned weights |
| Personal information guidance | `core/guidance` | Map assessment plus page context to per-data-type recommendations | Give certainty it doesn't have |
| Local evidence database | `packages/knowledge` | Ship and look up versioned reference data | Fetch updates by itself **[D-9]** |
| Local alternative matching | `core/alternatives` + knowledge data | Suggest alternatives from bundled data only | Use the network |
| Optional online discovery | `packages/discovery` | Consent-gated lookup of alternatives | Run without consent, or send more than disclosed **[D-15]** |
| Extension interface and adapters | `apps/extension` | Wire browser APIs to the core and render the UI | Contain scoring logic |

## 4. Key data types (sketch, not final)

```ts
type Provenance = 'observed' | 'disclosed' | 'unknown';      // [D-6]
type Freshness  = { kind: 'live' } | { kind: 'cached'; observedAt: string; source: string };

interface Evidence {
  id: string;                    // stable ID, e.g. "transport.https"
  subject: string;               // origin the evidence is about
  value: unknown;                // typed per evidence ID
  provenance: Provenance;
  freshness: Freshness;
  confidence: 'high' | 'medium' | 'low';
  source: string;                // which observer or dataset produced it
  limitations?: string[];        // e.g. "HttpOnly cookies not visible from content script"
}

interface CapabilityProfile {    // declared by each browser adapter
  browser: 'chromium' | 'firefox' | string;
  signals: Record<string, 'available' | 'partial' | 'unavailable' | 'not-permitted'>;
}

interface Assessment {
  subject: string;
  methodologyVersion: string;    // e.g. "0.1.0"
  knowledgeVersion: string;
  engineVersion: string;
  score?: number;                // 0–100; may be withheld at low confidence [D-13]
  grade?: 'A'|'B'|'C'|'D'|'E'|'F';
  confidence: 'high' | 'medium' | 'low';
  categories: CategoryResult[];  // traffic-light per category
  guidance: DataTypeGuidance[];
  explanations: Explanation[];   // rule → evidence links
}
```

The `CapabilityProfile` is central. It lets the engine tell apart "no third-party trackers observed" from "this browser and permission set could not observe third-party requests" (Invariant I-7).

## 5. Proposed monorepo layout

```
plaster/
├── README.md
├── CLAUDE.md                   # agent working rules (points at invariants)
├── docs/                       # design docs (this folder)
│   └── decisions/              # ADRs once decisions are made
├── packages/
│   ├── core/                   # pure TS engine (no DOM lib, no node types)
│   │   └── src/{evidence,observation,scoring,guidance,alternatives,assessment}/
│   ├── knowledge/              # bundled datasets + typed lookup API
│   │   ├── data/               # versioned JSON, with source + licence metadata
│   │   └── src/
│   └── discovery/              # optional online feature (network isolated here)
├── apps/
│   └── extension/              # WebExtension (Chromium + Firefox, MV3)
│       └── src/{background,content,observers,ui,adapters}/
├── tools/                      # build-time scripts (e.g. list ingestion); may use network
└── fixtures/                   # recorded RawSignal sets for deterministic tests
```

**Why this split [D-2]:** It uses four packages, where the brief lists eight boundaries. The boundaries that matter most for *enforcement* get their own packages: core (no network), knowledge (data, separate licensing and versioning), discovery (the only network code) and extension (browser APIs). The other boundaries (scoring, guidance, observation normalisation, alternatives) start as modules inside `core`, with lint-enforced import rules. They can become separate packages later, cheaply, if another consumer needs them. This keeps tooling overhead low without blurring the important lines.

## 6. Assessment data flow

1. **Observe** (extension). Observers collect value-free raw signals for the active tab: request destinations, response security headers, cookie metadata, form structure, script origins and so on. Signals are buffered per tab and persisted to session storage, because MV3 service workers are ephemeral.
2. **Normalise** (core). `RawSignals + CapabilityProfile → Evidence[]`. Normalisation classifies first- and third-party requests using the `knowledge` lookups (passed in as an interface).
3. **Enrich** (core + knowledge). Bundled *cached* evidence is attached, such as known tracker entity ownership or curated disclosed facts, labelled as `cached`.
4. **Evaluate** (core). Versioned rules produce category results with explanations.
5. **Score and grade** (core). The results are aggregated into a score, grade and confidence (see `scoring-methodology.md`).
6. **Guide** (core). Per-data-type recommendations are produced, using page context such as the presence of a password or payment field.
7. **Present** (extension). The UI renders the result. Every number can be expanded to show "why".
8. **(Optional) Discover** (discovery). Only on explicit user request after disclosure.

Steps 1–7 make **zero Plaster-initiated network requests**.

## 7. Enforcing "core cannot use the network"

- `packages/core/tsconfig.json`: `"lib": ["ES2022"]`, `"types": []`. This means `fetch`, `document`, `window` and Node APIs don't type-check.
- Lint: `no-restricted-globals` / `no-restricted-imports` for `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator`, `importScripts`, `node:*`, `http(s)`, applied to everything except `packages/discovery`.
- Dependency rule: `core` has **zero runtime dependencies** unless a dependency is explicitly approved.
- Runtime defence in depth: extension CSP restricts `connect-src` (see `local-first-spec.md` §5).

## 8. Browser observation: realistic expectations

These need verifying in the Phase 2 capability spike before any UI promises are made.

| Signal | Likely mechanism | Known caveats |
|---|---|---|
| Third-party request destinations | `webRequest` (observational listeners are still allowed in Chromium MV3) | Needs host permissions for the observed URLs. Misses requests made before observation starts. CNAME-cloaked trackers look first-party (Firefox has a `dns` API, Chromium doesn't, and DNS lookups need an egress review). |
| Security headers (CSP, HSTS, Referrer-Policy, Permissions-Policy) | `webRequest.onHeadersReceived` | Some headers need `extraHeaders` in Chromium. Cached responses may not trigger events consistently. |
| Cookies (count, third-party, lifetime, flags) | `cookies` API, `Set-Cookie` headers | Needs host permissions. Partitioned cookies (CHIPS) and per-browser third-party cookie policies differ and change over time. |
| Form structure (password, payment, email fields) | Content script DOM inspection | Shadow DOM, iframes and dynamically built forms. **Never read values.** |
| Where form data is sent | Form `action` origin only | JS-submitted data (`fetch`) can't be attributed to a form without reading bodies, **which is forbidden**. This must be reported as a limitation. |
| Fingerprinting API use (canvas, audio, etc.) | MAIN-world script instrumentation | Detectable by pages, can be bypassed, has performance and breakage risks **[D-11]** |
| Privacy policy content | Only if the user visits the policy page **[D-7]** | Fetching it would be an extension-initiated request |
| GPC support (`/.well-known/gpc.json`) | Would need a fetch, so **not done by default** | Possible only through a consented or "user-visited" path |

## 9. Permissions (initial thinking) [D-12]

| Permission | Purpose | Notes |
|---|---|---|
| `storage` | Per-tab buffers, settings, optional history | Required |
| `activeTab` / `scripting` | On-demand assessment after a user gesture | Low-friction, but misses the page-load network activity unless the page reloads |
| `webRequest` + host permissions | Passive request and header observation | Broad host access is a significant trust ask. We prefer **optional** host permissions granted per site or opted into globally. |
| `cookies` | Cookie metadata | Needs host permissions |
| `favicon` (Chromium) | Local favicon cache for UI | Optional, avoids network fetches |

A final permission table will be produced after the capability spike.
