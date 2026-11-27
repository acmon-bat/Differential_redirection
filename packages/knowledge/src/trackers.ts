/**
 * Demonstration tracker seed (hand-curated for Plaster; not comprehensive).
 *
 * Entries list REGISTRABLE domains only. Categories describe the primary
 * function of the service as commonly documented by the vendor; a single
 * vendor may appear in several categories.
 *
 * PROVENANCE: written for Plaster from public vendor documentation; not copied
 * from any third-party tracker list. Company and product names are used only
 * descriptively, to identify the services.
 */
import type { TrackerCategory } from '../../core/src/types.ts';

export interface TrackerEntry {
  owner: string;
  categories: readonly TrackerCategory[];
  domains: readonly string[];
}

export const TRACKERS: readonly TrackerEntry[] = [
  // Advertising
  { owner: 'Google', categories: ['advertising'], domains: ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com'] },
  { owner: 'Amazon', categories: ['advertising'], domains: ['amazon-adsystem.com'] },
  { owner: 'Microsoft (Xandr)', categories: ['advertising'], domains: ['adnxs.com'] },
  { owner: 'Criteo', categories: ['advertising'], domains: ['criteo.com', 'criteo.net'] },
  { owner: 'Taboola', categories: ['advertising'], domains: ['taboola.com'] },
  { owner: 'Outbrain', categories: ['advertising'], domains: ['outbrain.com'] },
  { owner: 'The Trade Desk', categories: ['advertising'], domains: ['adsrvr.org'] },
  { owner: 'PubMatic', categories: ['advertising'], domains: ['pubmatic.com'] },
  { owner: 'Magnite', categories: ['advertising'], domains: ['rubiconproject.com'] },
  { owner: 'OpenX', categories: ['advertising'], domains: ['openx.net'] },
  { owner: 'Quantcast', categories: ['advertising', 'analytics'], domains: ['quantserve.com', 'quantcount.com'] },
  { owner: 'Comscore', categories: ['analytics', 'advertising'], domains: ['scorecardresearch.com'] },
  { owner: 'X Corp.', categories: ['advertising', 'social'], domains: ['ads-twitter.com'] },

  // Social / advertising pixels
  { owner: 'Meta', categories: ['advertising', 'social'], domains: ['facebook.net', 'facebook.com'] },
  { owner: 'LinkedIn (Microsoft)', categories: ['advertising', 'social'], domains: ['licdn.com', 'linkedin.com'] },
  { owner: 'TikTok', categories: ['advertising', 'social'], domains: ['tiktok.com'] },
  { owner: 'Pinterest', categories: ['advertising', 'social'], domains: ['pinterest.com'] },

  // Analytics & tag management
  { owner: 'Google', categories: ['analytics'], domains: ['google-analytics.com'] },
  { owner: 'Google', categories: ['tag-manager'], domains: ['googletagmanager.com'] },
  { owner: 'Adobe', categories: ['analytics'], domains: ['omtrdc.net', 'demdex.net'] },
  { owner: 'Mixpanel', categories: ['analytics'], domains: ['mixpanel.com'] },
  { owner: 'Amplitude', categories: ['analytics'], domains: ['amplitude.com'] },
  { owner: 'HubSpot', categories: ['analytics'], domains: ['hs-analytics.net', 'hubspot.com'] },
  { owner: 'Chartbeat', categories: ['analytics'], domains: ['chartbeat.com', 'chartbeat.net'] },
  { owner: 'New Relic', categories: ['analytics'], domains: ['nr-data.net'] },
  { owner: 'Twilio Segment', categories: ['customer-data-platform', 'analytics'], domains: ['segment.com', 'segment.io'] },

  // Session replay
  { owner: 'Hotjar (Contentsquare)', categories: ['session-replay', 'analytics'], domains: ['hotjar.com', 'hotjar.io'] },
  { owner: 'Contentsquare', categories: ['session-replay', 'analytics'], domains: ['contentsquare.net'] },
  { owner: 'FullStory', categories: ['session-replay'], domains: ['fullstory.com'] },
  { owner: 'Microsoft Clarity', categories: ['session-replay', 'analytics'], domains: ['clarity.ms'] },
  { owner: 'Mouseflow', categories: ['session-replay'], domains: ['mouseflow.com'] },
  { owner: 'Smartlook', categories: ['session-replay'], domains: ['smartlook.com'] },
  { owner: 'LogRocket', categories: ['session-replay'], domains: ['logrocket.com', 'lr-ingest.io'] },
  { owner: 'Quantum Metric', categories: ['session-replay'], domains: ['quantummetric.com'] },

  // Device fingerprinting / identification
  { owner: 'Fingerprint', categories: ['fingerprinting'], domains: ['fpjs.io', 'fpapi.io'] },
];
