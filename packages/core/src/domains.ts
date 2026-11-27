/**
 * Hostname and origin utilities.
 *
 * Deliberately implemented without the WHATWG `URL` class so the core has no
 * dependency on host-environment APIs (core is compiled with lib ES2022 only).
 */
import type { KnowledgeBase } from './types.ts';

const HOST_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export interface ParsedOrigin {
  scheme: string;
  host: string;
  port: string | null;
}

/** Normalise and validate a hostname. Returns null if it is not a plausible host. */
export function normaliseHost(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  let host = raw.trim().toLowerCase();
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (host.length === 0 || host.length > 253) return null;
  if (host === 'localhost') return host;
  if (host.startsWith('[') && host.endsWith(']')) {
    // IPv6 literal: accept hex, colons and dots only.
    return /^\[[0-9a-f:.]+\]$/.test(host) ? host : null;
  }
  const ip = IPV4.exec(host);
  if (ip) return ip.slice(1).every((o) => Number(o) <= 255) ? host : null;
  const labels = host.split('.');
  return labels.every((l) => HOST_LABEL.test(l)) ? host : null;
}

/** Parse "scheme://host[:port]" (an origin, not a full URL). */
export function parseOrigin(raw: string): ParsedOrigin | null {
  if (typeof raw !== 'string' || raw.length > 300) return null;
  const m = /^([a-z][a-z0-9+.-]*):\/\/(\[[0-9a-fA-F:.]+\]|[^/:?#\s]+)(?::(\d{1,5}))?\/?$/.exec(raw.trim());
  if (!m) return null;
  const host = normaliseHost(m[2]!);
  if (!host) return null;
  return { scheme: m[1]!.toLowerCase(), host, port: m[3] ?? null };
}

export function formatOrigin(o: ParsedOrigin): string {
  return `${o.scheme}://${o.host}${o.port ? `:${o.port}` : ''}`;
}

function isIpOrLocal(host: string): boolean {
  return host === 'localhost' || host.startsWith('[') || IPV4.test(host);
}

/**
 * Registrable domain ("eTLD+1") using the knowledge base's public-suffix data.
 *
 * LIMITATION: the bundled suffix list is a curated subset of the Public Suffix
 * List. Hosts under unlisted multi-label suffixes are grouped too broadly.
 */
export function registrableDomain(host: string, kb: Pick<KnowledgeBase, 'isPublicSuffix'>): string {
  if (isIpOrLocal(host)) return host;
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  // Find the longest matching public suffix, then take one more label.
  for (let i = 1; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join('.');
    if (kb.isPublicSuffix(candidate)) return labels.slice(i - 1).join('.');
  }
  return labels.slice(-2).join('.');
}

export function isThirdParty(host: string, pageHost: string, kb: Pick<KnowledgeBase, 'isPublicSuffix'>): boolean {
  return registrableDomain(host, kb) !== registrableDomain(pageHost, kb);
}
