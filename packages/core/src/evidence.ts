/**
 * Evidence registry: collects value-free evidence items and assigns the
 * user-facing label (observed / disclosed / cached / unknown) from the two
 * internal axes, provenance and freshness (decision D-6).
 */
import type { CapabilityStatus, Evidence, EvidenceLabel, Freshness, Provenance } from './types.ts';

export function labelFor(provenance: Provenance, freshness: Freshness): EvidenceLabel {
  if (provenance === 'unknown') return 'unknown';
  if (freshness.kind === 'cached') return 'cached';
  return provenance;
}

/**
 * Reliability factors (methodology §3). They express how much an item of
 * evidence can be relied upon, NOT whether it is good or bad for privacy.
 */
export const RELIABILITY = {
  observedFull: 1.0,
  observedPartial: 0.7,   // observed via a channel with known coverage gaps
  cached: 0.8,            // bundled reference data (e.g. tracker classification)
  disclosed: 0.6,         // the site says so; not independently verified
  heuristic: 0.7,         // observed, but via a heuristic detector
  unknown: 0,
} as const;

export function observedReliability(status: CapabilityStatus): number {
  return status === 'available' ? RELIABILITY.observedFull : status === 'partial' ? RELIABILITY.observedPartial : 0;
}

export class EvidenceRegistry {
  readonly #items = new Map<string, Evidence>();

  add(item: { id: string; summary: string; provenance: Provenance; freshness?: Freshness; data?: Evidence['data'] }): string {
    const freshness = item.freshness ?? { kind: 'live' };
    if (!this.#items.has(item.id)) {
      const evidence: Evidence = {
        id: item.id,
        summary: item.summary,
        provenance: item.provenance,
        freshness,
        label: labelFor(item.provenance, freshness),
      };
      if (item.data) evidence.data = item.data;
      this.#items.set(item.id, evidence);
    }
    return item.id;
  }

  unknown(id: string, summary: string): string {
    return this.add({ id, summary, provenance: 'unknown' });
  }

  list(): Evidence[] {
    return [...this.#items.values()];
  }
}
