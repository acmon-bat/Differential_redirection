import { createKnowledgeBase } from '../../knowledge/src/index.ts';
import { SIGNALS, type CapabilityStatus, type ObservationSnapshot, type Signal } from '../src/types.ts';

export const kb = createKnowledgeBase();

export function capabilities(overrides: Partial<Record<Signal, CapabilityStatus>> = {}, defaultStatus: CapabilityStatus = 'available') {
  const signals = Object.fromEntries(SIGNALS.map((s) => [s, defaultStatus])) as Record<Signal, CapabilityStatus>;
  signals.fingerprintingApis = 'unavailable';
  return { adapter: 'test', signals: { ...signals, ...overrides }, limitations: [] as string[] };
}

/** A privacy-respecting site observed with full visibility. */
export function goodSnapshot(): ObservationSnapshot {
  return {
    schemaVersion: 1,
    page: { origin: 'https://shop.example.co.uk' },
    capabilities: capabilities(),
    window: { coversPageLoad: true, durationMs: 5000 },
    subresources: [
      { host: 'static.example.co.uk', scheme: 'https', kind: 'script', count: 4 },
      { host: 'fonts.example-cdn.com', scheme: 'https', kind: 'font', count: 1 },
    ],
    documentHeaders: { strictTransportSecurity: true, contentSecurityPolicy: true, referrerPolicy: 'strict-origin-when-cross-origin', permissionsPolicy: true },
    cookies: [{ domain: 'shop.example.co.uk', secure: true, httpOnly: true, sameSite: 'lax', session: true, lifetimeDays: null }],
    forms: [{ actionOrigin: 'https://shop.example.co.uk', method: 'post', fieldKinds: ['email', 'password'] }],
    pageLinks: { privacyPolicyLink: true },
  };
}

/** A tracker-heavy site observed with full visibility. */
export function trackerHeavySnapshot(): ObservationSnapshot {
  const s = goodSnapshot();
  s.page.origin = 'https://news.example.com';
  s.subresources = [
    { host: 'securepubads.g.doubleclick.net', scheme: 'https', kind: 'script', count: 12 },
    { host: 'connect.facebook.net', scheme: 'https', kind: 'script', count: 2 },
    { host: 'static.hotjar.com', scheme: 'https', kind: 'script', count: 3 },
    { host: 'www.google-analytics.com', scheme: 'https', kind: 'beacon', count: 5 },
    { host: 'c.amazon-adsystem.com', scheme: 'https', kind: 'script', count: 1 },
    { host: 'cdn.taboola.com', scheme: 'https', kind: 'script', count: 1 },
  ];
  s.cookies = [
    { domain: 'news.example.com', secure: true, httpOnly: false, sameSite: 'unspecified', session: false, lifetimeDays: 730 },
    { domain: '.doubleclick.net', secure: true, httpOnly: null, sameSite: 'none', session: false, lifetimeDays: 390 },
  ];
  s.forms = [{ actionOrigin: 'https://news.example.com', method: 'post', fieldKinds: ['email', 'paymentCard', 'name'] }];
  return s;
}

/** Deep clone that keeps the type. */
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
