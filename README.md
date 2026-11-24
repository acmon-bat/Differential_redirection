# Plaster

> **Find the gaps. Understand the risks. Make the internet safer.**

Plaster is a **local-first privacy browser extension** built on a **reusable privacy assessment engine**. It helps ordinary people understand:

- how privacy-friendly a website appears to be;
- what personal information they should be cautious about sharing with it;
- which privacy weaknesses or concerning behaviours can actually be observed;
- how confident Plaster is in that assessment;
- whether safer alternatives might exist.

The name comes from the idea of finding the holes in someone's digital privacy and patching them.

## Principles

1. **Local-first.** Assessments run entirely in the user's browser. During an assessment Plaster makes no network requests of its own and sends nothing anywhere. See [`docs/local-first-spec.md`](docs/local-first-spec.md).
2. **Evidence-based and honest.** Every result traces back to evidence, and that evidence is labelled as *observed*, *disclosed*, *cached* or *unknown*. Unknown never counts as safe.
3. **Explainable.** Scores, grades and recommendations come from a transparent, versioned methodology. See [`docs/scoring-methodology.md`](docs/scoring-methodology.md).
4. **User-centred.** The output is practical guidance ("use an email alias here") rather than a technical dump.
5. **Reusable.** The core engine is plain TypeScript with no dependency on browser APIs, UI frameworks or networking.

The non-negotiable rules are in [`docs/invariants.md`](docs/invariants.md).

## Status

**Phase 0: Foundation.** The repository currently holds design documents only, with no product code yet. See [`docs/roadmap.md`](docs/roadmap.md).

## Documentation

| Document | Purpose |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Component boundaries, proposed monorepo layout, data flow |
| [`docs/invariants.md`](docs/invariants.md) | Security and privacy invariants (non-negotiable) |
| [`docs/local-first-spec.md`](docs/local-first-spec.md) | Local-first and offline operation specification |
| [`docs/threat-model.md`](docs/threat-model.md) | Assets, adversaries, threats, mitigations |
| [`docs/scoring-methodology.md`](docs/scoring-methodology.md) | Scoring design (not yet a final algorithm) |
| [`docs/roadmap.md`](docs/roadmap.md) | Phased development plan |
| [`docs/open-decisions.md`](docs/open-decisions.md) | Unresolved technical decisions needing discussion |
| [`docs/network-egress-register.md`](docs/network-egress-register.md) | Every component that can make an external request |

## Language and tooling

The core engine is written in TypeScript, and all other tooling choices are still open (see `docs/open-decisions.md`). The project deliberately keeps dependencies and infrastructure to a minimum.
