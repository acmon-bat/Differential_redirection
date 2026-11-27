/**
 * Assessment orchestration: the engine's public entry point.
 *
 *   unknown input --validate--> ObservationSnapshot --context--> checks
 *   --> categories --> overall (risk | evidence quality | confidence)
 *   --> guidance --> Assessment
 *
 * Pure and deterministic: same snapshot + same knowledge base => same result.
 * No I/O of any kind.
 */
import { CHECKS, computeCaps } from './checks.ts';
import { buildContext } from './context.ts';
import { petFinding } from './disclosures.ts';
import { buildGuidance } from './guidance.ts';
import { aggregateCategory, aggregateOverall, CATEGORY_ORDER, finaliseGrade } from './scoring.ts';
import { validateSnapshot } from './validate.ts';
import { SIGNALS, type Assessment, type CheckResult, type KnowledgeBase, type ObservationSnapshot, type Signal } from './types.ts';

export const ENGINE_VERSION = '0.1.0';
export const METHODOLOGY_VERSION = '0.3.0';

const SIGNAL_DESCRIPTIONS: Record<Signal, string> = {
  subresourceHosts: 'which third-party domains the page contacts',
  documentHeaders: 'HTTP security headers (HSTS, CSP, Referrer-Policy, Permissions-Policy)',
  cookies: 'cookie metadata',
  forms: 'form structure',
  pageLinks: 'links on the page (e.g. privacy policy)',
  disclosures: 'privacy-policy claims',
  fingerprintingApis: 'use of fingerprinting-related browser APIs (not implemented)',
};

function unobservable(snapshot: ObservationSnapshot): string[] {
  const out: string[] = [];
  for (const s of SIGNALS) {
    const status = snapshot.capabilities.signals[s];
    if (s === 'disclosures' && status !== 'available' && status !== 'partial') continue; // only meaningful on policy pages
    if (status === 'unavailable') out.push(`Not observable in this mode: ${SIGNAL_DESCRIPTIONS[s]}.`);
    else if (status === 'not-permitted') out.push(`Not permitted (you can grant access): ${SIGNAL_DESCRIPTIONS[s]}.`);
    else if (status === 'partial') out.push(`Only partially observable: ${SIGNAL_DESCRIPTIONS[s]}.`);
  }
  out.push(...snapshot.capabilities.limitations);
  out.push('Server-side data handling (retention, sharing, sale of data) is never visible to a browser extension.');
  return out;
}

/** Assess an already-validated snapshot. */
export function assessSnapshot(snapshot: ObservationSnapshot, kb: KnowledgeBase): Assessment {
  const ctx = buildContext(snapshot, kb);

  const checks: CheckResult[] = CHECKS.map((def) => ({ checkId: def.id, category: def.category, title: def.title, weight: def.weight, ...def.run(ctx) }));
  const categories = CATEGORY_ORDER.map((id) => aggregateCategory(id, checks.filter((c) => c.category === id)));
  const overall = aggregateOverall(categories, snapshot.window);
  const caps = computeCaps(ctx);
  const final = finaliseGrade(overall, caps);
  const guidance = buildGuidance(ctx, overall.confidence);

  const pet = petFinding(snapshot.disclosures);
  if (pet.level > 0) {
    ctx.evidence.add({ id: 'disclosures.pet', summary: pet.summary, provenance: 'disclosed', data: { level: pet.level } });
  }

  return {
    subject: snapshot.page.origin,
    methodologyVersion: METHODOLOGY_VERSION,
    engineVersion: ENGINE_VERSION,
    knowledgeVersion: kb.version,
    score: final.score,
    grade: final.grade,
    gradeStatus: final.gradeStatus,
    scoreCapped: final.scoreCapped,
    caps,
    evidenceQuality: Math.round(overall.evidenceQuality * 100) / 100,
    confidence: overall.confidence,
    confidenceReasons: overall.confidenceReasons,
    categories,
    guidance,
    pet,
    evidence: ctx.evidence.list(),
    unobservable: unobservable(snapshot),
    thirdPartyDomains: (ctx.thirdParties ?? []).map((t) => (t.tracker ? { domain: t.domain, requests: t.requests, tracker: t.tracker } : { domain: t.domain, requests: t.requests })),
  };
}

export type AssessOutcome =
  | { ok: true; assessment: Assessment; warnings: string[] }
  | { ok: false; errors: string[] };

/** Validate untrusted input, then assess. The recommended entry point for adapters. */
export function assess(input: unknown, kb: KnowledgeBase): AssessOutcome {
  const validated = validateSnapshot(input);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  return { ok: true, assessment: assessSnapshot(validated.data, kb), warnings: validated.warnings };
}
