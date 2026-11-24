# Development Roadmap

Each phase has a clear goal, deliverables and exit criteria. Phases are sequential unless noted. Each one ends with a review of the invariants, the threat model and the open decisions.

## Phase 0: Foundation *(current)*

**Goal:** agree on direction before writing product code.
- Deliverables: README, architecture, threat model, local-first spec, scoring design, invariants, egress register, roadmap, open decisions.
- **Exit:** open decisions D-1, D-2, D-5, D-6 and D-12 are discussed, and outcomes are recorded as ADRs in `docs/decisions/`.

## Phase 1: Repository skeleton and core domain model

**Goal:** a typed, tested, network-incapable core, with no scoring yet.
- Monorepo tooling (per D-1/D-2), strict TypeScript, lint and test setup, CI.
- Network-incapability enforcement for `core` (tsconfig, lint rules).
- Types: `Evidence`, `Provenance`, `Freshness`, `CapabilityProfile`, `RawSignals`, `Assessment`, `Explanation`.
- Input validation and size bounding at the `RawSignals` boundary.
- PR checklist template referencing the invariants.
- **Exit:** `core` builds with zero runtime dependencies, type-checks with no DOM or Node types, and has unit tests for the evidence model.

## Phase 2: Browser capability spike *(can run in parallel with Phase 1)*

**Goal:** find out what Chromium and Firefox MV3 extensions *can actually observe*, before promising anything.
- Throwaway prototype extensions. They are not product code.
- Investigate: `webRequest` observation and header visibility (`extraHeaders`), cookies API and partitioning, MV3 service-worker lifecycle and missed events, `activeTab` versus host permissions, MAIN-world instrumentation cost, CSP `connect-src` enforcement for extension contexts, iframe and shadow DOM form detection, Firefox `dns` API.
- **Deliverables:** `docs/capability-matrix.md` (signal × browser × permission → available/partial/unavailable), a final permission proposal, and an updated threat model.
- **Exit:** the evidence catalogue is limited to reliably observable signals, and decisions D-11 and D-12 are made.

## Phase 3: Normalisation and scoring v0.1

**Goal:** a deterministic, explainable assessment from recorded signals.
- Normalisers `RawSignals → Evidence` using capability profiles.
- Rule registry, category evaluation, aggregation, unknown handling, caps, confidence.
- Fixture corpus and snapshot tests, plus calibration review.
- **Exit:** methodology v0.1.0 is agreed, documented and reproducible on fixtures, and tests prove that unknown never raises a score.

## Phase 4: Extension MVP (local only)

**Goal:** real users can assess the current tab offline.
- Browser adapters producing `RawSignals` and a `CapabilityProfile` (Chromium and Firefox, per D-5).
- Minimal UI: score, grade, confidence, category lights, "why" drill-down, "what Plaster can't see".
- CSP `connect-src` lockdown, and an automated zero-egress test.
- **Exit:** the zero-egress test passes on both browsers, permissions match the Phase 2 proposal, and a threat model review is done.

## Phase 5: Personal information guidance

**Goal:** practical per-data-type recommendations.
- Data-type sensitivity table, guidance rules and page-context detection (structure only).
- UI integration with practical tips.
- **Exit:** guidance is covered by fixtures and never more certain than the underlying evidence.

## Phase 6: Local knowledge base

**Goal:** better evidence through bundled reference data.
- Choose datasets (D-8), build-time ingestion tools, provenance and licence metadata, versioning, and a decision on the update strategy (D-9).
- **Exit:** data licences are cleared, data age is shown in the UI, and the effect of stale data on confidence is implemented.

## Phase 7: Local alternative matching

**Goal:** offline suggestions for safer alternatives.
- Curated alternatives dataset, category mapping, and matching logic in `core/alternatives`.
- **Exit:** works fully offline, and suggestions are explained (why each alternative was suggested).

## Phase 8: Optional online alternative discovery

**Goal:** a consent-gated extension of Phase 7.
- Design the payload (D-15), the consent and disclosure UI, and the service architecture.
- Register it in the egress register, add exact-payload tests, and update the threat model.
- **Exit:** a privacy review is passed, the feature is off by default, and core works unchanged when it is disabled or unreachable.

## Phase 9: Hardening, release and research

- Accessibility, internationalisation, performance budgets, store submissions, reproducible builds.
- A research track on PETs and differential privacy: a curated evidence process for L3/L4 entries, and whether and how DP should matter per site category.
- An opt-in, offline-capable error-reporting flow (copy or export, no auto-send).
- Exploring reuse of `core` in other hosts (CLI, other apps).
