/**
 * Trust-boundary validation for observation snapshots.
 *
 * Security properties (see docs/threat-model.md T-5 and Invariant I-1):
 *  - Output is constructed from scratch using ALLOW-LISTED fields only. Any
 *    unexpected property on the input (e.g. an accidental `value`) is dropped
 *    and never reaches the engine or the stored assessment.
 *  - Collections are size-bounded; strings are length-bounded.
 *  - Invalid input is rejected (structural errors) or dropped with a warning
 *    (individual malformed entries), never "repaired" into something trusted.
 */
import { normaliseHost, parseOrigin, formatOrigin } from './domains.ts';
import {
  SIGNALS, FIELD_KINDS,
  type CapabilityProfile, type CapabilityStatus, type CookieObservation,
  type DisclosureClaim, type DisclosureObservation, type DocumentHeaderObservation,
  type FieldKind, type FormObservation, type ObservationSnapshot, type ResourceKind,
  type Result, type SameSite, type Signal, type SubresourceObservation,
} from './types.ts';

export const LIMITS = {
  subresources: 2000,
  cookies: 500,
  forms: 100,
  fieldsPerForm: 200,
  disclosures: 20,
  limitations: 30,
  stringLength: 300,
} as const;

const CAPABILITY_STATUSES: readonly CapabilityStatus[] = ['available', 'partial', 'unavailable', 'not-permitted'];
const RESOURCE_KINDS: readonly ResourceKind[] = ['script', 'stylesheet', 'image', 'font', 'media', 'xhr', 'fetch', 'beacon', 'iframe', 'other'];
const SAME_SITE: readonly SameSite[] = ['strict', 'lax', 'none', 'unspecified'];
const METHODS = ['get', 'post', 'dialog', 'unknown'] as const;
const REFERRER_POLICIES = [
  'no-referrer', 'no-referrer-when-downgrade', 'origin', 'origin-when-cross-origin',
  'same-origin', 'strict-origin', 'strict-origin-when-cross-origin', 'unsafe-url',
] as const;
const CLAIMS: readonly DisclosureClaim[] = [
  'vague-anonymisation', 'differential-privacy-mentioned',
  'differential-privacy-mechanism', 'differential-privacy-parameters',
];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): v is T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v);
const boolOrNull = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const boundedString = (v: unknown): string | null =>
  typeof v === 'string' ? v.slice(0, LIMITS.stringLength) : null;
const finiteNonNeg = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

function takeArray(v: unknown, limit: number, name: string, warnings: string[]): unknown[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) {
    warnings.push(`${name}: not an array, treated as unknown`);
    return undefined;
  }
  if (v.length > limit) warnings.push(`${name}: truncated from ${v.length} to ${limit} entries`);
  return v.slice(0, limit);
}

function validateCapabilities(v: unknown, errors: string[]): CapabilityProfile | null {
  if (!isObj(v) || !isObj(v.signals)) {
    errors.push('capabilities: missing or malformed');
    return null;
  }
  const signals = {} as Record<Signal, CapabilityStatus>;
  for (const s of SIGNALS) {
    const status = v.signals[s];
    // Missing capability information is treated as "unavailable", never "available".
    signals[s] = oneOf(status, CAPABILITY_STATUSES) ? status : 'unavailable';
  }
  const limitations = (Array.isArray(v.limitations) ? v.limitations : [])
    .slice(0, LIMITS.limitations)
    .map(boundedString)
    .filter((s): s is string => s !== null);
  return { adapter: boundedString(v.adapter) ?? 'unknown', signals, limitations };
}

function validateSubresource(v: unknown): SubresourceObservation | null {
  if (!isObj(v)) return null;
  const host = typeof v.host === 'string' ? normaliseHost(v.host) : null;
  if (!host) return null;
  const scheme = v.scheme === 'https' || v.scheme === 'http' ? v.scheme : 'other';
  const kind = oneOf(v.kind, RESOURCE_KINDS) ? v.kind : 'other';
  const count = finiteNonNeg(v.count);
  return { host, scheme, kind, count: count === null ? 1 : Math.max(1, Math.min(Math.floor(count), 100000)) };
}

function validateHeaders(v: unknown): DocumentHeaderObservation | undefined {
  if (!isObj(v)) return undefined;
  const rp = typeof v.referrerPolicy === 'string' ? v.referrerPolicy.trim().toLowerCase() : null;
  return {
    strictTransportSecurity: boolOrNull(v.strictTransportSecurity),
    contentSecurityPolicy: boolOrNull(v.contentSecurityPolicy),
    referrerPolicy: rp !== null && oneOf(rp, REFERRER_POLICIES) ? rp : null,
    permissionsPolicy: boolOrNull(v.permissionsPolicy),
  };
}

function validateCookie(v: unknown): CookieObservation | null {
  if (!isObj(v) || typeof v.domain !== 'string') return null;
  const domain = normaliseHost(v.domain.replace(/^\./, ''));
  if (!domain) return null;
  const session = v.session === true;
  const lifetime = finiteNonNeg(v.lifetimeDays);
  return {
    domain,
    secure: v.secure === true,
    httpOnly: boolOrNull(v.httpOnly),
    sameSite: oneOf(v.sameSite, SAME_SITE) ? v.sameSite : 'unspecified',
    session,
    lifetimeDays: session ? null : lifetime === null ? null : Math.min(lifetime, 36500),
  };
}

function validateForm(v: unknown, warnings: string[]): FormObservation | null {
  if (!isObj(v)) return null;
  let actionOrigin: string | null = null;
  if (typeof v.actionOrigin === 'string') {
    const parsed = parseOrigin(v.actionOrigin);
    if (parsed) actionOrigin = formatOrigin(parsed);
    else warnings.push('forms: unparseable actionOrigin treated as unknown');
  }
  const kinds = (takeArray(v.fieldKinds, LIMITS.fieldsPerForm, 'forms.fieldKinds', warnings) ?? [])
    .filter((k): k is FieldKind => oneOf(k, FIELD_KINDS));
  return { actionOrigin, method: oneOf(v.method, METHODS) ? v.method : 'unknown', fieldKinds: kinds };
}

function validateDisclosure(v: unknown): DisclosureObservation | null {
  if (!isObj(v) || typeof v.sourceOrigin !== 'string') return null;
  const parsed = parseOrigin(v.sourceOrigin);
  if (!parsed) return null;
  const claims = Array.isArray(v.claims) ? [...new Set(v.claims.filter((c): c is DisclosureClaim => oneOf(c, CLAIMS)))] : [];
  return { sourceOrigin: formatOrigin(parsed), claims };
}

function compact<T>(items: unknown[] | undefined, fn: (v: unknown) => T | null, name: string, warnings: string[]): T[] | undefined {
  if (items === undefined) return undefined;
  const out: T[] = [];
  let dropped = 0;
  for (const item of items) {
    const r = fn(item);
    if (r === null) dropped++;
    else out.push(r);
  }
  if (dropped > 0) warnings.push(`${name}: dropped ${dropped} malformed entries`);
  return out;
}

/** Validate untrusted input into an ObservationSnapshot. */
export function validateSnapshot(input: unknown): Result<ObservationSnapshot> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ['snapshot: not an object'] };
  if (input.schemaVersion !== 1) errors.push('schemaVersion: unsupported (expected 1)');

  const page = isObj(input.page) && typeof input.page.origin === 'string' ? parseOrigin(input.page.origin) : null;
  if (!page) errors.push('page.origin: missing or not a valid origin');

  const capabilities = validateCapabilities(input.capabilities, errors);

  const win = isObj(input.window) ? input.window : {};
  const observationWindow = {
    coversPageLoad: win.coversPageLoad === true,
    durationMs: Math.min(finiteNonNeg(win.durationMs) ?? 0, 86_400_000),
  };

  if (errors.length > 0 || !page || !capabilities) return { ok: false, errors };

  const snapshot: ObservationSnapshot = {
    schemaVersion: 1,
    page: { origin: formatOrigin(page) },
    capabilities,
    window: observationWindow,
  };

  const subresources = compact(takeArray(input.subresources, LIMITS.subresources, 'subresources', warnings), validateSubresource, 'subresources', warnings);
  if (subresources) snapshot.subresources = subresources;
  const headers = validateHeaders(input.documentHeaders);
  if (headers) snapshot.documentHeaders = headers;
  const cookies = compact(takeArray(input.cookies, LIMITS.cookies, 'cookies', warnings), validateCookie, 'cookies', warnings);
  if (cookies) snapshot.cookies = cookies;
  const forms = compact(takeArray(input.forms, LIMITS.forms, 'forms', warnings), (f) => validateForm(f, warnings), 'forms', warnings);
  if (forms) snapshot.forms = forms;
  if (isObj(input.pageLinks) && typeof input.pageLinks.privacyPolicyLink === 'boolean') {
    snapshot.pageLinks = { privacyPolicyLink: input.pageLinks.privacyPolicyLink };
  }
  const disclosures = compact(takeArray(input.disclosures, LIMITS.disclosures, 'disclosures', warnings), validateDisclosure, 'disclosures', warnings);
  if (disclosures) snapshot.disclosures = disclosures;

  // Data supplied for a signal the adapter declares unobservable is suspicious:
  // ignore it rather than trust it.
  const declaredUnavailable = (s: Signal) =>
    capabilities.signals[s] === 'unavailable' || capabilities.signals[s] === 'not-permitted';
  const signalFields: Array<[Signal, keyof ObservationSnapshot]> = [
    ['subresourceHosts', 'subresources'], ['documentHeaders', 'documentHeaders'], ['cookies', 'cookies'],
    ['forms', 'forms'], ['pageLinks', 'pageLinks'], ['disclosures', 'disclosures'],
  ];
  for (const [signal, field] of signalFields) {
    if (snapshot[field] !== undefined && declaredUnavailable(signal)) {
      delete snapshot[field];
      warnings.push(`${field}: ignored because capability "${signal}" is declared ${capabilities.signals[signal]}`);
    }
  }

  return { ok: true, data: snapshot, warnings };
}
