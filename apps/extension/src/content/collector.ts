/**
 * Plaster page collector (Chromium MV3, activeTab tier).
 *
 * Injected on demand with chrome.scripting.executeScript AFTER the user clicks
 * the Plaster toolbar button. Runs in the extension's ISOLATED WORLD, so page
 * scripts cannot read its state or tamper with the built-ins it uses.
 *
 * PRIVACY RULES (docs/invariants.md), enforced by tests/security/static.test.ts:
 *  - Never read form field values, cookies, storage or clipboard.
 *  - Never retain paths, query strings or fragments of any URL: hosts only.
 *  - Never make network requests.
 *  - Page text is read ONLY on pages that look like privacy policies, ONLY
 *    from page-authored text nodes (never editable regions or form controls),
 *    is processed in place by a pure detector, and only claim flags are returned.
 */
import { classifyField, detectDisclosureClaims, MAX_DISCLOSURE_TEXT, type FieldDescriptor } from '../../../../packages/core/src/index.ts';
import type {
  DocumentHeaderObservation, FieldKind, FormObservation, ObservationSnapshot, ResourceKind, SubresourceObservation,
} from '../../../../packages/core/src/types.ts';
import { activeTabCapabilities, RESOURCE_TIMING_BUFFER_DEFAULT } from '../adapter/capabilities.ts';

const MAX_FORMS = 100;
const MAX_FIELDS = 200;

function hostAndScheme(raw: string): { host: string; scheme: SubresourceObservation['scheme'] } | null {
  try {
    const u = new URL(raw, document.baseURI);
    if (!u.hostname) return null;
    const scheme = u.protocol === 'https:' ? 'https' : u.protocol === 'http:' ? 'http' : 'other';
    return { host: u.hostname, scheme }; // path, query and fragment are discarded here
  } catch {
    return null;
  }
}

function originOf(raw: string): string | null {
  try {
    const u = new URL(raw, document.baseURI);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

const INITIATOR_KIND: Record<string, ResourceKind> = {
  script: 'script', link: 'stylesheet', css: 'stylesheet', img: 'image', image: 'image',
  video: 'media', audio: 'media', xmlhttprequest: 'xhr', fetch: 'fetch', beacon: 'beacon',
  iframe: 'iframe', frame: 'iframe',
};

function collectSubresources(): { items: SubresourceObservation[]; bufferMayHaveOverflowed: boolean } {
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const agg = new Map<string, SubresourceObservation>();
  const add = (raw: string, kind: ResourceKind) => {
    const hs = hostAndScheme(raw);
    if (!hs) return;
    const key = `${hs.host}|${hs.scheme}|${kind}`;
    const prev = agg.get(key);
    if (prev) prev.count += 1;
    else agg.set(key, { host: hs.host, scheme: hs.scheme, kind, count: 1 });
  };
  for (const e of entries) add(e.name, INITIATOR_KIND[e.initiatorType] ?? 'other');
  // Iframes may not appear in resource timing; record their hosts from the DOM.
  const seenIframeHosts = new Set([...agg.values()].filter((v) => v.kind === 'iframe').map((v) => v.host));
  for (const frame of Array.from(document.querySelectorAll('iframe[src]'))) {
    const src = frame.getAttribute('src');
    const hs = src ? hostAndScheme(src) : null;
    if (hs && !seenIframeHosts.has(hs.host)) {
      seenIframeHosts.add(hs.host);
      add(src!, 'iframe');
    }
  }
  return { items: [...agg.values()], bufferMayHaveOverflowed: entries.length >= RESOURCE_TIMING_BUFFER_DEFAULT };
}

function collectMetaHeaders(): DocumentHeaderObservation {
  const csp = document.querySelector('meta[http-equiv="Content-Security-Policy" i]');
  const referrer = document.querySelector('meta[name="referrer" i]')?.getAttribute('content')?.trim().toLowerCase() ?? null;
  return {
    strictTransportSecurity: null,                // headers not visible in this tier
    contentSecurityPolicy: csp ? true : null,     // absent <meta> != absent header, so unknown
    referrerPolicy: referrer,
    permissionsPolicy: null,
  };
}

/** Elements whose text content can carry user input or page data unrelated to authored text. */
const NON_AUTHORED_TEXT = 'input, select, option, textarea, script, style, noscript, template, [contenteditable]:not([contenteditable="false"])';

/**
 * Page-authored text under `root`, skipping form controls (e.g. <option> text
 * such as "Visa ending 4242"), editable regions where the user types, and
 * scripts. Reads text nodes only; never `.value` or innerText of controls.
 */
function authoredText(root: Node, limit: number): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(NON_AUTHORED_TEXT) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let out = '';
  for (let n = walker.nextNode(); n !== null && out.length < limit; n = walker.nextNode()) out += `${n.nodeValue ?? ''} `;
  return out.slice(0, limit);
}

function labelFor(el: Element): string | null {
  const parts: string[] = [];
  const aria = el.getAttribute('aria-label');
  if (aria) parts.push(aria);
  const placeholder = el.getAttribute('placeholder'); // page-authored attribute, not user input
  if (placeholder) parts.push(placeholder);
  const id = el.getAttribute('id');
  if (id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (lbl) parts.push(authoredText(lbl, 200));
  }
  const wrapping = el.closest('label');
  if (wrapping) parts.push(authoredText(wrapping, 200));
  const joined = parts.join(' ').trim();
  return joined ? joined.slice(0, 200) : null;
}

/** Structural descriptor of a control. Reads attributes only, never `.value`. */
function describe(el: Element): FieldDescriptor | null {
  const tag = el.tagName.toLowerCase();
  if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return null;
  return {
    tag,
    type: el.getAttribute('type'),
    autocomplete: el.getAttribute('autocomplete'),
    name: el.getAttribute('name'),
    id: el.getAttribute('id'),
    label: labelFor(el),
  };
}

function kindsIn(controls: Element[]): FieldKind[] {
  const kinds: FieldKind[] = [];
  for (const el of controls.slice(0, MAX_FIELDS)) {
    const d = describe(el);
    const k = d ? classifyField(d) : null;
    if (k) kinds.push(k);
  }
  return kinds;
}

function collectForms(): FormObservation[] {
  const out: FormObservation[] = [];
  for (const form of Array.from(document.forms).slice(0, MAX_FORMS)) {
    const actionAttr = form.getAttribute('action');
    // No action attribute usually means script handling in modern sites: report as unknown, not "same site".
    const actionOrigin = actionAttr && !/^\s*javascript:/i.test(actionAttr) ? originOf(actionAttr) : null;
    const method = (form.getAttribute('method') ?? 'get').toLowerCase();
    out.push({
      actionOrigin,
      method: method === 'post' || method === 'get' || method === 'dialog' ? method : 'unknown',
      fieldKinds: kindsIn(Array.from(form.querySelectorAll('input, select, textarea'))),
    });
  }
  // Controls outside any <form> (common in single-page apps) are submitted by script.
  const orphans = Array.from(document.querySelectorAll('input, select, textarea')).filter((el) => !(el as HTMLInputElement).form);
  const orphanKinds = kindsIn(orphans);
  if (orphanKinds.length > 0) out.push({ actionOrigin: null, method: 'unknown', fieldKinds: orphanKinds });
  return out;
}

const POLICY_LINK = /privacy|datenschutz|confidentialit|privacidad|privacit|vie priv/i;

function hasPrivacyPolicyLink(): boolean {
  for (const a of Array.from(document.querySelectorAll('a[href]'))) {
    const text = (a.textContent ?? '').slice(0, 100);
    const href = a.getAttribute('href') ?? '';
    if (POLICY_LINK.test(text) || /privacy|datenschutz/i.test(href)) return true;
  }
  return false;
}

function looksLikePolicyPage(): boolean {
  const heading = document.querySelector('h1')?.textContent ?? '';
  return /privacy|datenschutz/i.test(location.pathname) || /privacy (policy|notice|statement)/i.test(`${document.title} ${heading}`);
}

export function collect(): ObservationSnapshot {
  const isPolicyPage = looksLikePolicyPage();
  const subresources = collectSubresources();
  const snapshot: ObservationSnapshot = {
    schemaVersion: 1,
    page: { origin: location.origin },
    capabilities: activeTabCapabilities({ isPolicyPage, bufferMayHaveOverflowed: subresources.bufferMayHaveOverflowed }),
    // Resource Timing is buffered from navigation start, so it covers the page load unless the buffer overflowed.
    window: { coversPageLoad: !subresources.bufferMayHaveOverflowed, durationMs: Math.round(performance.now()) },
    subresources: subresources.items,
    documentHeaders: collectMetaHeaders(),
    forms: collectForms(),
    pageLinks: { privacyPolicyLink: hasPrivacyPolicyLink() },
  };
  if (isPolicyPage) {
    // Page-authored text only (editable regions and form controls are skipped, so
    // nothing the user types can influence the result). The text is processed
    // here and discarded; only claim flags leave this function.
    const text = document.body ? authoredText(document.body, MAX_DISCLOSURE_TEXT) : '';
    snapshot.disclosures = [{ sourceOrigin: location.origin, claims: detectDisclosureClaims(text) }];
  }
  return snapshot;
}

// Expose the collector inside the isolated world only (not visible to page scripts).
(globalThis as unknown as { __plasterCollect?: () => ObservationSnapshot }).__plasterCollect = collect;
