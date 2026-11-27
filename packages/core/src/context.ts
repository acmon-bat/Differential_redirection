/**
 * Derived facts computed once from a validated snapshot and shared by checks
 * and guidance. Pure; no I/O.
 */
import { parseOrigin, registrableDomain } from './domains.ts';
import { EvidenceRegistry } from './evidence.ts';
import type {
  CapabilityStatus, FieldKind, KnowledgeBase, ObservationSnapshot, Signal, TrackerCategory, TrackerInfo,
} from './types.ts';

export interface ThirdPartyDomain {
  domain: string;
  requests: number;
  hasInsecureRequest: boolean;
  tracker?: TrackerInfo;
}

export interface AssessmentContext {
  snapshot: ObservationSnapshot;
  kb: KnowledgeBase;
  evidence: EvidenceRegistry;
  page: { scheme: string; host: string; site: string };
  capability(signal: Signal): CapabilityStatus;
  /** True when the adapter supplied data for this signal (it may be partial). */
  observed(signal: Signal): boolean;
  /** Third-party registrable domains; undefined if subresources were not observed. */
  thirdParties: ThirdPartyDomain[] | undefined;
  /** Count of insecure (http) subresources; undefined if not observed. */
  insecureSubresources: number | undefined;
  trackersIn(category: TrackerCategory): ThirdPartyDomain[];
  /** Sensitive field kinds requested on the page; undefined if forms not observed. */
  requestedKinds: Set<FieldKind> | undefined;
  knowledgeFreshness: { kind: 'cached'; source: string; asOf: string };
}

export const SENSITIVE_KINDS: ReadonlySet<FieldKind> = new Set<FieldKind>([
  'password', 'email', 'phone', 'name', 'address', 'dateOfBirth', 'paymentCard', 'governmentId', 'health',
]);

const SIGNAL_FIELD: Record<Signal, keyof ObservationSnapshot | null> = {
  subresourceHosts: 'subresources',
  documentHeaders: 'documentHeaders',
  cookies: 'cookies',
  forms: 'forms',
  pageLinks: 'pageLinks',
  disclosures: 'disclosures',
  fingerprintingApis: null, // no adapter implements this yet (D-11)
};

export function buildContext(snapshot: ObservationSnapshot, kb: KnowledgeBase): AssessmentContext {
  const origin = parseOrigin(snapshot.page.origin);
  if (!origin) throw new Error('buildContext: snapshot must be validated first');
  const site = registrableDomain(origin.host, kb);

  const capability = (s: Signal): CapabilityStatus => snapshot.capabilities.signals[s];
  const observed = (s: Signal): boolean => {
    const field = SIGNAL_FIELD[s];
    const status = capability(s);
    return field !== null && snapshot[field] !== undefined && (status === 'available' || status === 'partial');
  };

  let thirdParties: ThirdPartyDomain[] | undefined;
  let insecureSubresources: number | undefined;
  if (observed('subresourceHosts')) {
    const byDomain = new Map<string, ThirdPartyDomain>();
    insecureSubresources = 0;
    for (const r of snapshot.subresources ?? []) {
      if (r.scheme === 'http') insecureSubresources += r.count;
      const domain = registrableDomain(r.host, kb);
      if (domain === site) continue;
      const entry = byDomain.get(domain) ?? { domain, requests: 0, hasInsecureRequest: false };
      entry.requests += r.count;
      entry.hasInsecureRequest ||= r.scheme === 'http';
      byDomain.set(domain, entry);
    }
    for (const entry of byDomain.values()) {
      const tracker = kb.lookupTracker(entry.domain);
      if (tracker) entry.tracker = tracker;
    }
    thirdParties = [...byDomain.values()].sort((a, b) => b.requests - a.requests || a.domain.localeCompare(b.domain));
  }

  let requestedKinds: Set<FieldKind> | undefined;
  if (observed('forms')) {
    requestedKinds = new Set();
    for (const f of snapshot.forms ?? []) for (const k of f.fieldKinds) if (SENSITIVE_KINDS.has(k)) requestedKinds.add(k);
  }

  return {
    snapshot,
    kb,
    evidence: new EvidenceRegistry(),
    page: { scheme: origin.scheme, host: origin.host, site },
    capability,
    observed,
    thirdParties,
    insecureSubresources,
    trackersIn: (category) => (thirdParties ?? []).filter((t) => t.tracker?.categories.includes(category)),
    requestedKinds,
    knowledgeFreshness: { kind: 'cached', source: `Plaster knowledge base ${kb.version}`, asOf: kb.builtAt },
  };
}
