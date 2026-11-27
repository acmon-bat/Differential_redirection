/**
 * Plaster core types.
 *
 * Everything in this file describes VALUE-FREE metadata. No type here has a
 * field capable of carrying a form value, cookie value, request body, page
 * text or full URL. Adding such a field would violate invariants I-1 to I-3
 * (docs/invariants.md).
 */

// ---------------------------------------------------------------------------
// Capability profile: what the adapter could observe (Invariant I-7)
// ---------------------------------------------------------------------------

/** Signal families an adapter may be able to observe. */
export const SIGNALS = [
  'subresourceHosts',     // hosts of resources the page loaded
  'documentHeaders',      // security headers of the main document response
  'cookies',              // cookie metadata (never values)
  'forms',                // form structure (never values)
  'pageLinks',            // e.g. presence of a privacy-policy link
  'disclosures',          // claims detected on a privacy-policy page, locally
  'fingerprintingApis',   // JS API usage associated with fingerprinting
] as const;
export type Signal = (typeof SIGNALS)[number];

/**
 * available     – observed with no known coverage gaps
 * partial       – observed, but with known gaps (see limitations)
 * unavailable   – this adapter/browser cannot observe it
 * not-permitted – observable in principle, but the user has not granted permission
 */
export type CapabilityStatus = 'available' | 'partial' | 'unavailable' | 'not-permitted';

export interface CapabilityProfile {
  adapter: string;                       // e.g. "chromium-mv3-activetab"
  signals: Record<Signal, CapabilityStatus>;
  limitations: string[];                 // human-readable, shown to the user
}

// ---------------------------------------------------------------------------
// Observation snapshot: the engine's only input
// ---------------------------------------------------------------------------

export type ResourceKind =
  | 'script' | 'stylesheet' | 'image' | 'font' | 'media'
  | 'xhr' | 'fetch' | 'beacon' | 'iframe' | 'other';

export interface SubresourceObservation {
  host: string;                 // lower-case hostname only; never a path or query
  scheme: 'https' | 'http' | 'other';
  kind: ResourceKind;
  count: number;                // number of requests aggregated into this entry
}

export interface DocumentHeaderObservation {
  strictTransportSecurity: boolean | null;  // null = header visibility unknown
  contentSecurityPolicy: boolean | null;    // header OR <meta> CSP
  referrerPolicy: string | null;            // normalised token, or null if absent/unknown
  permissionsPolicy: boolean | null;
}

export type SameSite = 'strict' | 'lax' | 'none' | 'unspecified';

export interface CookieObservation {
  domain: string;               // cookie domain (no leading dot), never the name or value
  secure: boolean;
  httpOnly: boolean | null;     // null when the source cannot tell
  sameSite: SameSite;
  session: boolean;
  lifetimeDays: number | null;  // null for session cookies or unknown
}

/**
 * Sensitive data categories a form field may request. Derived from input type,
 * `autocomplete` tokens and (conservatively) name/label hints. NEVER from values.
 */
export const FIELD_KINDS = [
  'password', 'email', 'phone', 'name', 'address', 'dateOfBirth',
  'paymentCard', 'governmentId', 'health', 'other',
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export interface FormObservation {
  /** Origin the form submits to, or null if it is submitted by script / unknown. */
  actionOrigin: string | null;
  method: 'get' | 'post' | 'dialog' | 'unknown';
  fieldKinds: FieldKind[];      // one entry per detected field
}

export interface PageLinkObservation {
  privacyPolicyLink: boolean;
}

/** Claims detected locally on a page the USER visited (never fetched). */
export type DisclosureClaim =
  | 'vague-anonymisation'           // "anonymised", "aggregated", "de-identified"
  | 'differential-privacy-mentioned'
  | 'differential-privacy-mechanism' // names a mechanism / scope
  | 'differential-privacy-parameters'; // publishes epsilon / privacy unit

export interface DisclosureObservation {
  sourceOrigin: string;         // origin of the policy page the user visited
  claims: DisclosureClaim[];
}

export interface ObservationWindow {
  /** True if observation started before the page began loading. */
  coversPageLoad: boolean;
  durationMs: number;
}

export interface ObservationSnapshot {
  schemaVersion: 1;
  page: { origin: string };     // origin only: scheme://host[:port]
  capabilities: CapabilityProfile;
  window: ObservationWindow;
  subresources?: SubresourceObservation[];
  documentHeaders?: DocumentHeaderObservation;
  cookies?: CookieObservation[];
  forms?: FormObservation[];
  pageLinks?: PageLinkObservation;
  disclosures?: DisclosureObservation[];
}

// ---------------------------------------------------------------------------
// Knowledge base interface (implemented by @plaster/knowledge)
// ---------------------------------------------------------------------------

export type TrackerCategory =
  | 'advertising' | 'analytics' | 'session-replay' | 'social' | 'tag-manager'
  | 'fingerprinting' | 'customer-data-platform';

export interface TrackerInfo {
  domain: string;               // registrable domain that matched
  owner: string;
  categories: TrackerCategory[];
}

export interface KnowledgeBase {
  version: string;              // e.g. "2026.11-demo"
  builtAt: string;              // ISO date; used for freshness
  description: string;
  /** Multi-label public suffixes (e.g. "co.uk"). Single-label TLDs are implicit. */
  isPublicSuffix(candidate: string): boolean;
  lookupTracker(registrableDomain: string): TrackerInfo | undefined;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export type Provenance = 'observed' | 'disclosed' | 'unknown';
export type Freshness =
  | { kind: 'live' }
  | { kind: 'cached'; source: string; asOf: string };

/** User-facing label combining provenance and freshness (see D-6). */
export type EvidenceLabel = 'observed' | 'disclosed' | 'cached' | 'unknown';

export interface Evidence {
  id: string;                   // e.g. "transport.page-https"
  summary: string;              // human readable, value-free
  provenance: Provenance;
  freshness: Freshness;
  label: EvidenceLabel;
  data?: Record<string, string | number | boolean | string[] | null>;
}

// ---------------------------------------------------------------------------
// Checks, categories and the assessment
// ---------------------------------------------------------------------------

export type CategoryId =
  | 'transport' | 'tracking' | 'cookies' | 'dataCollection'
  | 'browserProtections' | 'transparency';

export type CheckOutcome = 'pass' | 'partial' | 'fail' | 'unknown' | 'not-applicable';

export interface CheckResult {
  checkId: string;
  category: CategoryId;
  title: string;
  outcome: CheckOutcome;
  /** 0..1 for pass/partial/fail; null when unknown or not applicable. */
  score: number | null;
  weight: number;
  /** Reliability of the evidence this check relied on, 0..1 (see methodology §3). */
  evidenceReliability: number;
  evidenceIds: string[];
  explanation: string;
  /** Optional user-facing recommendation when the check is not a pass. */
  recommendation?: string;
}

export type TrafficLight = 'green' | 'amber' | 'red' | 'grey';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface CategoryResult {
  id: CategoryId;
  title: string;
  weight: number;
  /** Privacy score 0..100 (higher = better), or null if insufficient evidence. */
  score: number | null;
  light: TrafficLight;
  /** 0..1: share of applicable check weight backed by evidence, reliability-weighted. */
  evidenceQuality: number;
  status: 'scored' | 'insufficient-evidence' | 'not-applicable';
  /** True when the result rests on limited evidence (< 75%): a green light here is NOT verified. */
  limitedEvidence: boolean;
  checks: CheckResult[];
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface ScoreCap {
  checkId: string;
  maxGrade: Grade;
  maxScore: number;
  reason: string;
}

export type GuidanceLevel = 'ok' | 'caution' | 'prefer-alternative' | 'avoid';

export const DATA_TYPES = [
  'email', 'phone', 'name', 'address', 'dateOfBirth',
  'paymentCard', 'password', 'governmentId', 'health',
] as const;
export type DataType = (typeof DATA_TYPES)[number];

export interface DataTypeGuidance {
  dataType: DataType;
  label: string;
  level: GuidanceLevel;
  requestedOnPage: boolean;     // a form field for this type was observed
  reasons: string[];
  tip: string;
  evidenceIds: string[];
  confidence: ConfidenceLevel;
}

export interface PetFinding {
  level: 0 | 1 | 2 | 3 | 4;     // methodology §7 ladder
  summary: string;
  label: EvidenceLabel;
  /** Always 0 in methodology 0.1.x: PETs are informational only (D-14). */
  scoreEffect: 0;
}

export interface Assessment {
  subject: string;              // page origin
  methodologyVersion: string;
  engineVersion: string;
  knowledgeVersion: string;
  /** Privacy RISK result (posture). */
  score: number | null;         // 0..100, null if withheld
  grade: Grade | null;          // null if withheld
  gradeStatus: 'final' | 'provisional' | 'withheld';
  /** True when `score` is a cap ceiling, not the computed score. */
  scoreCapped: boolean;
  caps: ScoreCap[];
  /** EVIDENCE QUALITY result, independent of risk. */
  evidenceQuality: number;      // 0..1
  /** CONFIDENCE in the risk result, derived from evidence quality + window. */
  confidence: ConfidenceLevel;
  confidenceReasons: string[];
  categories: CategoryResult[];
  guidance: DataTypeGuidance[];
  pet: PetFinding;
  evidence: Evidence[];
  /** Things Plaster could not see, phrased for users (Invariant I-7). */
  unobservable: string[];
  thirdPartyDomains: Array<{ domain: string; requests: number; tracker?: TrackerInfo }>;
}

/** Result type for validation, avoiding exceptions at trust boundaries. */
export type Result<T> = { ok: true; data: T; warnings: string[] } | { ok: false; errors: string[] };
