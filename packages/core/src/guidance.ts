/**
 * Personal-information sharing guidance (methodology §6).
 *
 * For each data type, rules raise the guidance level; the most severe rule
 * wins. Guidance never claims more certainty than the evidence: when relevant
 * signals are unknown, "ok" is not available (Invariant I-8).
 */
import type { AssessmentContext } from './context.ts';
import { parseOrigin, registrableDomain } from './domains.ts';
import {
  DATA_TYPES, type ConfidenceLevel, type DataType, type DataTypeGuidance, type FieldKind, type GuidanceLevel,
} from './types.ts';

const ORDER: readonly GuidanceLevel[] = ['ok', 'caution', 'prefer-alternative', 'avoid'];
const max = (a: GuidanceLevel, b: GuidanceLevel): GuidanceLevel => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

interface DataTypeMeta {
  label: string;
  /** Reason shown when the baseline is above "ok". */
  baselineReason?: string;
  sensitivity: 'standard' | 'high';
  /** Identifiers widely used, typically hashed, to match people across advertising platforms (email, phone). */
  linkable: boolean;
  tip: string;
  baseline: GuidanceLevel;
}

export const DATA_TYPE_META: Record<DataType, DataTypeMeta> = {
  email:        { label: 'Email address',      sensitivity: 'standard', linkable: true,  baseline: 'ok',      tip: 'Consider an email alias or masking service so this site cannot link you across services.' },
  phone:        { label: 'Phone number',       sensitivity: 'standard', linkable: true,  baseline: 'ok',      tip: 'Only provide a phone number if it is genuinely required; it is hard to change and widely used to link identities.' },
  name:         { label: 'Full name',          sensitivity: 'standard', linkable: false, baseline: 'ok',      tip: 'Check whether your real name is actually required.' },
  address:      { label: 'Postal address',     sensitivity: 'standard', linkable: false, baseline: 'ok',      tip: 'Only share an address when something needs to be delivered to you.' },
  dateOfBirth:  { label: 'Date of birth',      sensitivity: 'high',     linkable: false,  baseline: 'ok',      tip: 'Date of birth is often used for identity verification; avoid sharing it unless required.' },
  paymentCard:  { label: 'Payment card',       sensitivity: 'high',     linkable: false, baseline: 'ok',      tip: 'Prefer a trusted payment provider or a virtual/masked card number.' },
  password:     { label: 'Password',           sensitivity: 'high',     linkable: false, baseline: 'ok',      tip: 'Use a unique password from a password manager and enable two-factor authentication.' },
  governmentId: { label: 'Government ID',      sensitivity: 'high',     linkable: false,  baseline: 'caution', baselineReason: 'Government identity numbers are highly sensitive and can enable identity fraud if misused.', tip: 'Share identity documents only when legally required and with organisations you trust.' },
  health:       { label: 'Health information', sensitivity: 'high',     linkable: false, baseline: 'caution', baselineReason: 'Health information is a special category of personal data under data-protection law (e.g. UK and EU GDPR Article 9).', tip: 'Health data is highly sensitive; share it only with services that clearly need it.' },
};

const FIELD_TO_DATA: Partial<Record<FieldKind, DataType>> = {
  password: 'password', email: 'email', phone: 'phone', name: 'name', address: 'address',
  dateOfBirth: 'dateOfBirth', paymentCard: 'paymentCard', governmentId: 'governmentId', health: 'health',
};

export function buildGuidance(ctx: AssessmentContext, confidence: ConfidenceLevel): DataTypeGuidance[] {
  const forms = ctx.snapshot.forms ?? [];
  const requested = new Set<DataType>();
  for (const k of ctx.requestedKinds ?? []) {
    const d = FIELD_TO_DATA[k];
    if (d) requested.add(d);
  }
  const insecure = ctx.page.scheme !== 'https';
  const replay = ctx.trackersIn('session-replay');
  const ads = ctx.trackersIn('advertising');
  const thirdPartiesVisible = ctx.thirdParties !== undefined;

  return DATA_TYPES.map((dataType): DataTypeGuidance => {
    const meta = DATA_TYPE_META[dataType];
    let level = meta.baseline;
    const reasons: string[] = [];
    const evidenceIds: string[] = [];
    const isRequested = requested.has(dataType);

    if (meta.baselineReason) reasons.push(meta.baselineReason);

    if (insecure) {
      level = max(level, meta.sensitivity === 'high' || isRequested ? 'avoid' : 'caution');
      reasons.push('This page is not served over HTTPS, so data can be intercepted in transit.');
      evidenceIds.push('transport.page-scheme');
    }

    if (replay.length > 0) {
      const domains = replay.map((t) => t.domain).join(', ');
      if (dataType === 'password') {
        // There is no "alternative" to entering a password; major replay vendors document masking password inputs by default.
        level = max(level, 'caution');
        reasons.push(`A known session-replay service (${domains}) is present. These tools generally mask password fields by default, but misconfigurations have exposed sensitive input in the past.`);
      } else {
        level = max(level, meta.sensitivity === 'high' ? 'prefer-alternative' : 'caution');
        reasons.push(`A known session-replay service (${domains}) is present; such tools can record what is typed or shown on the page if not configured to mask it.`);
      }
      evidenceIds.push('knowledge.trackers.session-replay');
    }

    if (ads.length > 0 && meta.linkable) {
      level = max(level, 'prefer-alternative');
      reasons.push('Advertising trackers are present. Email addresses and phone numbers are widely used, typically in hashed form, to match people across advertising platforms.');
      evidenceIds.push('knowledge.trackers.advertising');
    }

    if (isRequested) {
      const crossSite = forms.some((f) =>
        f.fieldKinds.some((k) => FIELD_TO_DATA[k] === dataType) && f.actionOrigin !== null &&
        registrableDomain(parseOrigin(f.actionOrigin)?.host ?? '', ctx.kb) !== ctx.page.site);
      if (crossSite) {
        level = max(level, 'caution');
        reasons.push('The form requesting this submits to a different organisation\'s website.');
        evidenceIds.push('forms.cross-site-submission');
      }
      evidenceIds.push('forms.sensitive-fields');
    }

    if (!thirdPartiesVisible) {
      level = max(level, 'caution');
      reasons.push('Plaster could not observe which third parties are present, so it cannot rule out tracking.');
      evidenceIds.push('requests.unobserved');
    }

    if (reasons.length === 0) {
      reasons.push(ctx.capability('subresourceHosts') === 'partial'
        ? 'No specific concerns were observed (visibility is partial, so this is not a guarantee).'
        : 'No specific concerns were observed for this data type.');
    }

    return {
      dataType, label: meta.label, level, requestedOnPage: isRequested, reasons, tip: meta.tip,
      evidenceIds: [...new Set(evidenceIds)],
      confidence,
    };
  });
}
