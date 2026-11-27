/**
 * Plaster knowledge base: bundled, versioned reference data.
 *
 * IMPORTANT: this is a SMALL, HAND-CURATED DEMONSTRATION SEED written for
 * Plaster. It is not a comprehensive tracker list and is not derived from
 * third-party lists (so no external licence applies). Choosing and licensing
 * production datasets is open decision D-8.
 *
 * The data is static and bundled. Nothing here fetches updates (decision D-9).
 */
import type { KnowledgeBase, TrackerCategory, TrackerInfo } from '../../core/src/types.ts';
import { TRACKERS, type TrackerEntry } from './trackers.ts';
import { MULTI_LABEL_PUBLIC_SUFFIXES } from './public-suffixes.ts';

export const KNOWLEDGE_VERSION = '2026.11-demo';
export const KNOWLEDGE_BUILT_AT = '2026-11-24';

export function createKnowledgeBase(
  trackers: readonly TrackerEntry[] = TRACKERS,
  suffixes: readonly string[] = MULTI_LABEL_PUBLIC_SUFFIXES,
): KnowledgeBase {
  const suffixSet = new Set(suffixes);
  const trackerMap = new Map<string, TrackerInfo>();
  for (const t of trackers) {
    for (const domain of t.domains) {
      trackerMap.set(domain, { domain, owner: t.owner, categories: [...t.categories] as TrackerCategory[] });
    }
  }
  return {
    version: KNOWLEDGE_VERSION,
    builtAt: KNOWLEDGE_BUILT_AT,
    description: `Plaster demonstration seed: ${trackerMap.size} tracker domains, ${suffixSet.size} multi-label public suffixes.`,
    isPublicSuffix: (candidate) => suffixSet.has(candidate),
    lookupTracker: (registrableDomain) => {
      const hit = trackerMap.get(registrableDomain);
      return hit ? { ...hit, categories: [...hit.categories] } : undefined;
    },
  };
}

export { TRACKERS, MULTI_LABEL_PUBLIC_SUFFIXES };
export type { TrackerEntry };
