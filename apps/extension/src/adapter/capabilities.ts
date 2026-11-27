/**
 * Capability profile for the Chromium MV3 "activeTab" adapter tier.
 *
 * This is the honest declaration of what this adapter can and cannot observe
 * (Invariant I-7). The core engine uses it to distinguish "not observed" from
 * "not present". See docs/browser-capabilities.md for the investigation.
 */
import type { CapabilityProfile } from '../../../../packages/core/src/types.ts';

/** Chromium's default Resource Timing buffer size (pages may change it). */
export const RESOURCE_TIMING_BUFFER_DEFAULT = 250;

export const ADAPTER_ID = 'chromium-mv3-activetab';

export function activeTabCapabilities(opts: { isPolicyPage: boolean; bufferMayHaveOverflowed: boolean }): CapabilityProfile {
  const limitations = [
    'Third-party hosts come from the page\'s Resource Timing data: requests made inside cross-origin iframes, by service workers, or over WebSockets are not included, and a page can clear this data.',
    'HTTP response headers (HSTS, CSP, Referrer-Policy, Permissions-Policy) are not visible with activeTab; only <meta> equivalents are detected.',
    'Cookies are not inspected in this mode (no cookie permission requested).',
    'Forms inside cross-origin iframes (e.g. embedded payment widgets) are not inspected.',
    'Forms submitted by script: the destination cannot be determined without reading request contents, which Plaster never does.',
  ];
  if (opts.bufferMayHaveOverflowed) {
    limitations.push('The page loaded more resources than the default Resource Timing buffer holds, so some requests were not recorded.');
  }
  return {
    adapter: ADAPTER_ID,
    signals: {
      subresourceHosts: 'partial',
      documentHeaders: 'partial',
      cookies: 'unavailable',
      forms: 'available',
      pageLinks: 'available',
      disclosures: opts.isPolicyPage ? 'partial' : 'unavailable',
      fingerprintingApis: 'unavailable',
    },
    limitations,
  };
}
