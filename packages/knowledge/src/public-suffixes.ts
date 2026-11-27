/**
 * Curated SUBSET of multi-label public suffixes (ICANN and common private
 * hosting suffixes) used to compute registrable domains (eTLD+1).
 *
 * LIMITATION: the full Public Suffix List (publicsuffix.org) has ~10,000
 * entries. Hosts under suffixes not listed here are grouped by their last two
 * labels, which can merge unrelated sites (e.g. two sites under an unlisted
 * "*.example-hosting.com" suffix). Bundling the full list at build time is
 * planned (roadmap Phase 6).
 *
 * PROVENANCE AND LICENCE: the suffix entries come from the Public Suffix
 * List (https://publicsuffix.org, Mozilla Foundation and contributors) and
 * remain under the Mozilla Public License 2.0 (https://mozilla.org/MPL/2.0/)
 * to the extent they are protectable. Plaster's Apache-2.0 licence does not
 * override that. See THIRD_PARTY_NOTICES.md. If the full list is bundled
 * later, include its MPL-2.0 notice.
 */
export const MULTI_LABEL_PUBLIC_SUFFIXES: readonly string[] = [
  // ICANN second-level suffixes
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'ltd.uk', 'plc.uk', 'me.uk', 'net.uk', 'nhs.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'org.nz', 'govt.nz',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp',
  'co.kr', 'or.kr',
  'com.br', 'com.cn', 'com.mx', 'com.ar', 'com.tr', 'com.sg', 'com.hk', 'com.tw',
  'co.in', 'co.za', 'co.il',
  // Private hosting suffixes (each subdomain is a separate site)
  'github.io', 'gitlab.io', 'pages.dev', 'workers.dev', 'vercel.app', 'netlify.app',
  'herokuapp.com', 'appspot.com', 'web.app', 'firebaseapp.com', 'blogspot.com',
  'cloudfront.net', 'azurewebsites.net',
];
