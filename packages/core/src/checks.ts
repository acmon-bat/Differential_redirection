/**
 * Rule registry for methodology 0.1.0.
 *
 * Each check is a small, documented, deterministic function. A check returns:
 *   pass / partial / fail  -> a score in 0..1 plus the reliability of its evidence
 *   unknown                -> the signal could not be observed (NO score; lowers evidence quality)
 *   not-applicable         -> the check does not apply to this page (excluded entirely)
 *
 * "Unknown" never contributes a score in either direction (Invariant I-8).
 * Weights and thresholds are initial, uncalibrated values; see
 * docs/scoring-methodology.md §5 and its "Limitations" section.
 */
import type { AssessmentContext, ThirdPartyDomain } from './context.ts';
import { SENSITIVE_KINDS } from './context.ts';
import { RELIABILITY, observedReliability } from './evidence.ts';
import { parseOrigin, registrableDomain } from './domains.ts';
import type { CategoryId, CheckOutcome, CheckResult, ScoreCap, TrackerCategory } from './types.ts';

export interface CheckDefinition {
  id: string;
  category: CategoryId;
  title: string;
  weight: number;
  run(ctx: AssessmentContext): Omit<CheckResult, 'checkId' | 'category' | 'title' | 'weight'>;
}

type Body = ReturnType<CheckDefinition['run']>;

const outcomeFor = (score: number): CheckOutcome => (score >= 0.999 ? 'pass' : score <= 0.001 ? 'fail' : 'partial');

function scored(score: number, reliability: number, evidenceIds: string[], explanation: string, recommendation?: string): Body {
  const body: Body = { outcome: outcomeFor(score), score, evidenceReliability: reliability, evidenceIds, explanation };
  if (recommendation && score < 0.999) body.recommendation = recommendation;
  return body;
}
function unknown(evidenceIds: string[], explanation: string): Body {
  return { outcome: 'unknown', score: null, evidenceReliability: 0, evidenceIds, explanation };
}
function notApplicable(explanation: string): Body {
  return { outcome: 'not-applicable', score: null, evidenceReliability: 0, evidenceIds: [], explanation };
}

/** Piecewise step function: thresholds are [maxCountInclusive, score] pairs. */
function stepScore(count: number, steps: Array<[number, number]>, otherwise: number): number {
  for (const [max, score] of steps) if (count <= max) return score;
  return otherwise;
}

function trackerEvidence(ctx: AssessmentContext, category: TrackerCategory, found: ThirdPartyDomain[]): string[] {
  const status = ctx.capability('subresourceHosts');
  const ids = [ctx.evidence.add({
    id: 'requests.third-party-hosts',
    summary: `${ctx.thirdParties?.length ?? 0} third-party domain(s) observed loading resources` +
      (status === 'partial' ? ' (partial visibility)' : ''),
    provenance: 'observed',
    data: { domains: (ctx.thirdParties ?? []).map((t) => t.domain).slice(0, 50) },
  })];
  ids.push(ctx.evidence.add({
    id: `knowledge.trackers.${category}`,
    summary: found.length > 0
      ? `Bundled tracker data classifies ${found.map((t) => t.domain).join(', ')} as ${category}`
      : `No observed domain is classified as ${category} in the bundled tracker data`,
    provenance: 'observed',
    freshness: ctx.knowledgeFreshness,
    data: { domains: found.map((t) => t.domain) },
  }));
  return ids;
}

/** Reliability of a tracker finding: limited by request visibility AND by cached classification. */
function trackerReliability(ctx: AssessmentContext): number {
  return Math.min(observedReliability(ctx.capability('subresourceHosts')), RELIABILITY.cached);
}

/** Caveat for "none observed" findings. Tracker findings also depend on the (non-exhaustive) bundled list. */
function noneObservedCaveat(ctx: AssessmentContext, dependsOnTrackerList = true): string {
  if (ctx.capability('subresourceHosts') === 'partial') return ' Request visibility is partial, so "none observed" does not mean "none present".';
  return dependsOnTrackerList ? ' The bundled tracker list is not exhaustive.' : '';
}

function trackerCheck(
  id: string, title: string, weight: number, category: TrackerCategory,
  steps: Array<[number, number]>, otherwise: number, label: string, recommendation: string,
): CheckDefinition {
  return {
    id, category: 'tracking', title, weight,
    run(ctx) {
      if (!ctx.thirdParties) return unknown([ctx.evidence.unknown('requests.unobserved', 'Third-party requests could not be observed')], `Plaster could not observe which third parties this page contacts, so ${label} cannot be assessed.`);
      const found = ctx.trackersIn(category);
      const score = stepScore(found.length, steps, otherwise);
      const explanation = found.length === 0
        ? `No known ${label} were observed.${noneObservedCaveat(ctx)}`
        : `Observed ${found.length} known ${label}: ${found.map((t) => `${t.domain} (${t.tracker?.owner})`).join(', ')}.`;
      return scored(score, trackerReliability(ctx), trackerEvidence(ctx, category, found), explanation, recommendation);
    },
  };
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const pageHttps: CheckDefinition = {
  id: 'transport.page-https', category: 'transport', title: 'Page served over HTTPS', weight: 3,
  run(ctx) {
    const https = ctx.page.scheme === 'https';
    const ev = ctx.evidence.add({ id: 'transport.page-scheme', summary: `Page origin uses ${ctx.page.scheme}`, provenance: 'observed', data: { scheme: ctx.page.scheme } });
    return scored(https ? 1 : 0, RELIABILITY.observedFull, [ev],
      https ? 'The page is served over HTTPS, protecting data in transit.' : 'The page is NOT served over HTTPS. Anything entered can be read or modified by others on the network.',
      'Avoid entering any personal information on this page.');
  },
};

const hsts: CheckDefinition = {
  id: 'transport.hsts', category: 'transport', title: 'HTTP Strict Transport Security', weight: 1,
  run(ctx) {
    if (ctx.page.scheme !== 'https') return notApplicable('HSTS only applies to HTTPS pages.');
    const value = ctx.observed('documentHeaders') ? ctx.snapshot.documentHeaders?.strictTransportSecurity ?? null : null;
    if (value === null) return unknown([ctx.evidence.unknown('headers.hsts', 'HSTS header visibility unavailable')], 'Response headers are not visible to Plaster in this mode, so HSTS is unknown.');
    const ev = ctx.evidence.add({ id: 'headers.hsts', summary: value ? 'Strict-Transport-Security header present' : 'Strict-Transport-Security header absent', provenance: 'observed' });
    return scored(value ? 1 : 0, observedReliability(ctx.capability('documentHeaders')), [ev],
      value ? 'The site instructs browsers to always use HTTPS.' : 'The site does not send HSTS, leaving first visits open to downgrade attacks.');
  },
};

const mixedContent: CheckDefinition = {
  id: 'transport.no-mixed-content', category: 'transport', title: 'No insecure (HTTP) subresources', weight: 2,
  run(ctx) {
    if (ctx.page.scheme !== 'https') return notApplicable('Mixed content only applies to HTTPS pages.');
    if (ctx.insecureSubresources === undefined) return unknown([ctx.evidence.unknown('requests.unobserved', 'Third-party requests could not be observed')], 'Subresource requests were not observable.');
    const n = ctx.insecureSubresources;
    const ev = ctx.evidence.add({ id: 'requests.insecure', summary: `${n} insecure (http) subresource request(s) observed`, provenance: 'observed', data: { count: n } });
    return scored(n === 0 ? 1 : 0, observedReliability(ctx.capability('subresourceHosts')), [ev],
      n === 0 ? `No insecure subresources were observed.${noneObservedCaveat(ctx, false)}` : `${n} resource(s) were loaded over plain HTTP from an HTTPS page.`);
  },
};

/**
 * Forms that cannot be submitted securely.
 * On an HTTP page EVERY form is insecure, even one whose action is https://:
 * the page itself can be modified in transit (e.g. the action rewritten), which
 * is why browsers flag password fields on HTTP pages regardless of destination.
 * On an HTTPS page, a form is insecure if its declared action is http://.
 */
function insecureForms(ctx: AssessmentContext) {
  const forms = ctx.snapshot.forms ?? [];
  if (ctx.page.scheme !== 'https') return forms;
  return forms.filter((f) => f.actionOrigin !== null && parseOrigin(f.actionOrigin)?.scheme === 'http');
}

const secureFormSubmission: CheckDefinition = {
  id: 'transport.secure-form-submission', category: 'transport', title: 'Forms submit over HTTPS', weight: 3,
  run(ctx) {
    if (!ctx.observed('forms')) return unknown([ctx.evidence.unknown('forms.unobserved', 'Form structure could not be observed')], 'Form structure was not observable.');
    const forms = ctx.snapshot.forms ?? [];
    if (forms.length === 0) return notApplicable('No forms were observed on this page.');
    const bad = insecureForms(ctx);
    const ev = ctx.evidence.add({ id: 'forms.insecure-submission', summary: `${bad.length} of ${forms.length} form(s) submit over an insecure connection`, provenance: 'observed', data: { insecure: bad.length, total: forms.length } });
    return scored(bad.length === 0 ? 1 : 0, observedReliability(ctx.capability('forms')), [ev],
      bad.length === 0 ? 'All observed forms with a declared destination submit over HTTPS (script-submitted forms cannot be verified).'
        : ctx.page.scheme !== 'https' ? `${bad.length} form(s) are on a page that is not served over HTTPS, so the form and anything typed into it can be read or altered in transit.`
        : `${bad.length} form(s) would send data without encryption.`,
      'Do not submit these forms.');
  },
};

// ---------------------------------------------------------------------------
// Tracking & third parties
// ---------------------------------------------------------------------------

const advertising = trackerCheck('tracking.advertising', 'Known advertising trackers', 3, 'advertising',
  [[0, 1], [1, 0.5], [3, 0.25]], 0, 'advertising trackers',
  'Consider a content blocker and avoid signing in or sharing identifiers (email, phone) unnecessarily.');
const sessionReplay = trackerCheck('tracking.session-replay', 'Known session-replay scripts', 3, 'session-replay',
  [[0, 1]], 0, 'session-replay services',
  'Session-replay tools can record page interactions. Be cautious typing sensitive information here.');
const analytics = trackerCheck('tracking.analytics', 'Known analytics services', 1, 'analytics',
  [[0, 1], [1, 0.7], [2, 0.4]], 0.1, 'analytics services', 'Analytics usage is common; consider a content blocker if this concerns you.');
const fingerprinting = trackerCheck('tracking.fingerprinting-vendors', 'Known fingerprinting vendors', 2, 'fingerprinting',
  [[0, 1]], 0, 'fingerprinting vendors', 'Fingerprinting can track you without cookies; consider a browser with fingerprinting protection.');

const thirdPartyBreadth: CheckDefinition = {
  id: 'tracking.third-party-breadth', category: 'tracking', title: 'Number of third-party domains', weight: 2,
  run(ctx) {
    if (!ctx.thirdParties) return unknown([ctx.evidence.unknown('requests.unobserved', 'Third-party requests could not be observed')], 'Third-party requests were not observable.');
    const n = ctx.thirdParties.length;
    const score = stepScore(n, [[2, 1], [5, 0.7], [10, 0.4], [20, 0.2]], 0);
    const ids = trackerEvidence(ctx, 'advertising', ctx.trackersIn('advertising')).slice(0, 1);
    return scored(score, observedReliability(ctx.capability('subresourceHosts')), ids,
      `${n} distinct third-party domain(s) were observed. Each third party can receive your IP address and browser details.` + (ctx.capability('subresourceHosts') === 'partial' ? ' Visibility is partial, so the real number may be higher.' : ''),
      'Fewer third parties generally means less data shared with other companies.');
  },
};

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------

function cookiesUnknown(ctx: AssessmentContext): Body {
  return unknown([ctx.evidence.unknown('cookies.unobserved', 'Cookie metadata not observable in this mode')], 'Cookie metadata was not observable in this mode.');
}

const thirdPartyCookies: CheckDefinition = {
  id: 'cookies.third-party', category: 'cookies', title: 'Third-party cookies', weight: 2,
  run(ctx) {
    if (!ctx.observed('cookies')) return cookiesUnknown(ctx);
    const third = (ctx.snapshot.cookies ?? []).filter((c) => registrableDomain(c.domain, ctx.kb) !== ctx.page.site);
    const ev = ctx.evidence.add({ id: 'cookies.third-party', summary: `${third.length} third-party cookie(s) observed`, provenance: 'observed', data: { count: third.length } });
    return scored(stepScore(third.length, [[0, 1], [3, 0.5]], 0), observedReliability(ctx.capability('cookies')), [ev],
      third.length === 0 ? 'No third-party cookies were observed.' : `${third.length} cookie(s) were set by other domains, which can be used to recognise you across sites.`,
      'Consider blocking third-party cookies in your browser settings.');
  },
};

const longLivedCookies: CheckDefinition = {
  id: 'cookies.long-lived', category: 'cookies', title: 'Cookie lifetimes', weight: 1,
  run(ctx) {
    if (!ctx.observed('cookies')) return cookiesUnknown(ctx);
    const persistent = (ctx.snapshot.cookies ?? []).filter((c) => !c.session && c.lifetimeDays !== null);
    if (persistent.length === 0) return notApplicable('No persistent cookies with a known lifetime were observed.');
    const long = persistent.filter((c) => (c.lifetimeDays ?? 0) > 395);
    const ev = ctx.evidence.add({ id: 'cookies.long-lived', summary: `${long.length} of ${persistent.length} persistent cookie(s) last longer than 13 months`, provenance: 'observed', data: { long: long.length, persistent: persistent.length } });
    return scored(1 - long.length / persistent.length, observedReliability(ctx.capability('cookies')), [ev],
      long.length === 0 ? 'No cookies with lifetimes over 13 months were observed.' : `${long.length} cookie(s) persist for more than 13 months (a commonly cited upper bound, e.g. in CNIL guidance).`);
  },
};

const cookieHardening: CheckDefinition = {
  id: 'cookies.hardening', category: 'cookies', title: 'Cookie security attributes', weight: 1,
  run(ctx) {
    if (!ctx.observed('cookies')) return cookiesUnknown(ctx);
    const cookies = ctx.snapshot.cookies ?? [];
    if (cookies.length === 0) return notApplicable('No cookies were observed.');
    const hardened = cookies.filter((c) => (ctx.page.scheme !== 'https' || c.secure) && c.sameSite !== 'unspecified');
    const ev = ctx.evidence.add({ id: 'cookies.hardening', summary: `${hardened.length} of ${cookies.length} cookie(s) set Secure (on HTTPS) and an explicit SameSite`, provenance: 'observed' });
    return scored(hardened.length / cookies.length, observedReliability(ctx.capability('cookies')), [ev],
      `${hardened.length} of ${cookies.length} cookies use recommended security attributes.`);
  },
};

// ---------------------------------------------------------------------------
// Data collection surface
// ---------------------------------------------------------------------------

const sensitiveFieldsWithTrackers: CheckDefinition = {
  id: 'data.sensitive-fields-with-trackers', category: 'dataCollection', title: 'Sensitive fields alongside known trackers', weight: 3,
  run(ctx) {
    if (!ctx.requestedKinds) return unknown([ctx.evidence.unknown('forms.unobserved', 'Form structure could not be observed')], 'Form structure was not observable.');
    if (ctx.requestedKinds.size === 0) return notApplicable('No sensitive form fields were observed.');
    const kinds = [...ctx.requestedKinds];
    const formEv = ctx.evidence.add({ id: 'forms.sensitive-fields', summary: `Page requests: ${kinds.join(', ')}`, provenance: 'observed', data: { kinds } });
    if (!ctx.thirdParties) return unknown([formEv, ctx.evidence.unknown('requests.unobserved', 'Third-party requests could not be observed')], 'Sensitive fields are present, but Plaster could not see which third parties are on the page.');
    const replay = ctx.trackersIn('session-replay');
    const ads = ctx.trackersIn('advertising');
    const analyticsFound = ctx.trackersIn('analytics');
    // The most serious category present determines the score, and its evidence is linked.
    const [score, trigger, found]: [number, TrackerCategory, ThirdPartyDomain[]] =
      replay.length > 0 ? [0, 'session-replay', replay]
      : ads.length > 0 ? [0.4, 'advertising', ads]
      : analyticsFound.length > 0 ? [0.7, 'analytics', analyticsFound]
      : [1, 'session-replay', []];
    const ids = [formEv, ...trackerEvidence(ctx, trigger, found)];
    const explanation = score === 1
      ? `Sensitive fields (${kinds.join(', ')}) are requested; no known trackers were observed on the same page.${noneObservedCaveat(ctx)}`
      : `Sensitive fields (${kinds.join(', ')}) are requested on a page that also loads ${trigger} scripts (${found.map((t) => t.domain).join(', ')}). Third-party scripts run with full access to the page.`;
    return scored(score, Math.min(trackerReliability(ctx), observedReliability(ctx.capability('forms'))), ids, explanation,
      'Share only what is strictly required on this page.');
  },
};

const crossSiteSubmission: CheckDefinition = {
  id: 'data.cross-site-submission', category: 'dataCollection', title: 'Where sensitive forms submit', weight: 2,
  run(ctx) {
    if (!ctx.requestedKinds) return unknown([ctx.evidence.unknown('forms.unobserved', 'Form structure could not be observed')], 'Form structure was not observable.');
    const sensitiveForms = (ctx.snapshot.forms ?? []).filter((f) => f.fieldKinds.some((k) => SENSITIVE_KINDS.has(k)));
    if (sensitiveForms.length === 0) return notApplicable('No forms with sensitive fields were observed.');
    const declared = sensitiveForms.filter((f) => f.actionOrigin !== null);
    if (declared.length === 0) {
      return unknown([ctx.evidence.unknown('forms.destination-unknown', 'Sensitive forms are submitted by script; destination not observable without reading request bodies')],
        'These forms are submitted by script. Plaster deliberately does not inspect request contents, so the destination cannot be determined.');
    }
    const cross = declared.filter((f) => {
      const o = parseOrigin(f.actionOrigin!);
      return o !== null && registrableDomain(o.host, ctx.kb) !== ctx.page.site;
    });
    const ev = ctx.evidence.add({ id: 'forms.cross-site-submission', summary: `${cross.length} of ${declared.length} sensitive form(s) submit to another site`, provenance: 'observed', data: { destinations: cross.map((f) => f.actionOrigin!) } });
    return scored(cross.length === 0 ? 1 : 0.5, observedReliability(ctx.capability('forms')), [ev],
      cross.length === 0 ? 'Sensitive forms submit to the same site.' : `${cross.length} sensitive form(s) submit to a different site (${cross.map((f) => f.actionOrigin).join(', ')}). This is sometimes legitimate (e.g. a payment provider) but means another organisation receives the data.`,
      'Check that you recognise and trust the organisation receiving this form.');
  },
};

// ---------------------------------------------------------------------------
// Browser-side protections
// ---------------------------------------------------------------------------

function headerValue<K extends 'contentSecurityPolicy' | 'permissionsPolicy'>(ctx: AssessmentContext, key: K): boolean | null {
  if (!ctx.observed('documentHeaders')) return null;
  return ctx.snapshot.documentHeaders?.[key] ?? null;
}

const csp: CheckDefinition = {
  id: 'protections.csp', category: 'browserProtections', title: 'Content Security Policy', weight: 1,
  run(ctx) {
    const v = headerValue(ctx, 'contentSecurityPolicy');
    if (v === null) return unknown([ctx.evidence.unknown('headers.csp', 'CSP header not visible; only <meta> CSP can be detected in this mode')], 'No CSP was detected, but HTTP response headers are not visible in this mode, so this is unknown rather than absent.');
    const ev = ctx.evidence.add({ id: 'headers.csp', summary: v ? 'Content Security Policy present' : 'No Content Security Policy', provenance: 'observed' });
    return scored(v ? 1 : 0, observedReliability(ctx.capability('documentHeaders')), [ev],
      v ? 'A Content Security Policy is present. Depending on its directives (which Plaster does not evaluate), it can restrict which scripts and resources load.' : 'No Content Security Policy was found.');
  },
};

const STRICT_REFERRER = new Set(['no-referrer', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin']);
const referrer: CheckDefinition = {
  id: 'protections.referrer-policy', category: 'browserProtections', title: 'Referrer policy', weight: 1,
  run(ctx) {
    const status = ctx.capability('documentHeaders');
    const policy = ctx.observed('documentHeaders') ? ctx.snapshot.documentHeaders?.referrerPolicy ?? null : null;
    if (policy === null && status !== 'available') return unknown([ctx.evidence.unknown('headers.referrer-policy', 'Referrer-Policy header not visible in this mode')], 'Referrer-Policy headers are not visible in this mode.');
    const ev = ctx.evidence.add({ id: 'headers.referrer-policy', summary: policy ? `Referrer policy: ${policy}` : 'No explicit referrer policy', provenance: 'observed' });
    if (policy === null) return scored(0.6, observedReliability(status), [ev], 'No explicit referrer policy; modern browsers default to strict-origin-when-cross-origin, which limits leakage.');
    const score = STRICT_REFERRER.has(policy) ? 1 : policy === 'unsafe-url' || policy === 'no-referrer-when-downgrade' ? 0 : 0.6;
    const explanation = score === 1
      ? `Referrer policy "${policy}" limits what other sites learn about the pages you visit.`
      : score === 0
        ? `Referrer policy "${policy}" can send full page addresses (including paths and query strings) to other sites.`
        : `Referrer policy "${policy}" sends this site's origin to other sites, including over insecure connections.`;
    return scored(score, observedReliability(status), [ev], explanation);
  },
};

const permissionsPolicy: CheckDefinition = {
  id: 'protections.permissions-policy', category: 'browserProtections', title: 'Permissions Policy', weight: 0.5,
  run(ctx) {
    const v = headerValue(ctx, 'permissionsPolicy');
    if (v === null) return unknown([ctx.evidence.unknown('headers.permissions-policy', 'Permissions-Policy header not visible in this mode')], 'Permissions-Policy headers are not visible in this mode.');
    const ev = ctx.evidence.add({ id: 'headers.permissions-policy', summary: v ? 'Permissions-Policy present' : 'No Permissions-Policy', provenance: 'observed' });
    return scored(v ? 1 : 0.5, observedReliability(ctx.capability('documentHeaders')), [ev],
      v ? 'The site restricts powerful browser features for embedded content.' : 'No Permissions-Policy; this is common and only a minor concern.');
  },
};

// ---------------------------------------------------------------------------
// Transparency
// ---------------------------------------------------------------------------

const privacyPolicyLink: CheckDefinition = {
  id: 'transparency.privacy-policy-link', category: 'transparency', title: 'Privacy policy link', weight: 1,
  run(ctx) {
    if (!ctx.observed('pageLinks')) return unknown([ctx.evidence.unknown('links.unobserved', 'Page links could not be inspected')], 'Page links were not inspected.');
    const found = ctx.snapshot.pageLinks?.privacyPolicyLink === true;
    const ev = ctx.evidence.add({ id: 'links.privacy-policy', summary: found ? 'Privacy policy link found on page' : 'No privacy policy link detected on page', provenance: 'observed' });
    return scored(found ? 1 : 0, RELIABILITY.heuristic, [ev],
      found ? 'A privacy policy link is present. Plaster does not verify what the policy says.' : 'No link that looks like a privacy policy was detected (detection is heuristic and may miss unusual wording).',
      'Look for the site\'s privacy policy before sharing personal information.');
  },
};

export const CHECKS: readonly CheckDefinition[] = [
  pageHttps, hsts, mixedContent, secureFormSubmission,
  advertising, sessionReplay, analytics, fingerprinting, thirdPartyBreadth,
  thirdPartyCookies, longLivedCookies, cookieHardening,
  sensitiveFieldsWithTrackers, crossSiteSubmission,
  csp, referrer, permissionsPolicy,
  privacyPolicyLink,
];

/**
 * Hard caps: serious, high-certainty observed failures (methodology §11.5).
 * A cap is a MAXIMUM, not a determination: a site capped at C may deserve worse.
 */
export function computeCaps(ctx: AssessmentContext): ScoreCap[] {
  const caps: ScoreCap[] = [];
  if (ctx.page.scheme !== 'https') {
    caps.push({
      checkId: 'transport.page-https', maxGrade: 'C', maxScore: 69,
      reason: 'The page is not served over HTTPS, so what you view and send here can be read or altered by others on the network.',
    });
  }
  if (ctx.observed('forms')) {
    const critical = insecureForms(ctx).filter((f) => f.fieldKinds.some((k) => k === 'password' || k === 'paymentCard'));
    if (critical.length > 0) {
      caps.push({
        checkId: 'transport.secure-form-submission', maxGrade: 'F', maxScore: 39,
        reason: 'A password or payment field cannot be submitted securely from this page.',
      });
    }
  }
  return caps;
}
