/**
 * Local, conservative detection of privacy-enhancing-technology claims in the
 * text of a privacy-policy page the USER has opened (decision D-7, option b).
 *
 * The text is processed in place and only claim flags are returned; the text
 * itself is never stored or transmitted. Detected claims are "disclosed"
 * evidence: what the site says, not what it does.
 *
 * Methodology §7: vague wording ("anonymised", "aggregated") is NOT evidence of
 * differential privacy. A DP mechanism or parameters only count when DP itself
 * is explicitly mentioned.
 */
import type { DisclosureClaim, DisclosureObservation, EvidenceLabel, PetFinding } from './types.ts';

export const MAX_DISCLOSURE_TEXT = 200_000;

const VAGUE = /\b(anonymi[sz](?:ed|ation|e)|aggregated?|de-?identified|pseudonymi[sz](?:ed|ation))\b/i;
const DP = /\bdifferential(?:ly)?[\s-]+priva(?:te|cy)\b/i;
const DP_MECHANISM = /\b(laplace|gaussian)\s+(?:mechanism|noise)\b|\brandomi[sz]ed\s+response\b|\bprivacy\s+budget\b|\bcalibrated\s+noise\b/i;
const DP_PARAMETERS = /(?:\bepsilon\b|ε)\s*(?:=|≤|<=|of|value of|set to)?\s*\d+(?:\.\d+)?/i;

export function detectDisclosureClaims(text: string): DisclosureClaim[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  const t = text.slice(0, MAX_DISCLOSURE_TEXT);
  const claims: DisclosureClaim[] = [];
  if (VAGUE.test(t)) claims.push('vague-anonymisation');
  if (DP.test(t)) {
    claims.push('differential-privacy-mentioned');
    if (DP_MECHANISM.test(t)) claims.push('differential-privacy-mechanism');
    if (DP_PARAMETERS.test(t)) claims.push('differential-privacy-parameters');
  }
  return claims;
}

/** Map disclosure claims to the PET evidence ladder (methodology §7). Score effect is always 0 in 0.1.x. */
export function petFinding(disclosures: DisclosureObservation[] | undefined): PetFinding {
  const claims = new Set((disclosures ?? []).flatMap((d) => d.claims));
  const label: EvidenceLabel = claims.size > 0 ? 'disclosed' : 'unknown';
  const f = (level: PetFinding['level'], summary: string): PetFinding => ({ level, summary, label, scoreEffect: 0 });
  if (claims.has('differential-privacy-mentioned') && claims.has('differential-privacy-mechanism') && claims.has('differential-privacy-parameters')) {
    return f(4, 'The policy describes differential privacy with a mechanism and published parameters. This is a disclosed claim that Plaster cannot verify.');
  }
  if (claims.has('differential-privacy-mentioned') && claims.has('differential-privacy-mechanism')) {
    return f(3, 'The policy describes a differential privacy mechanism, but no parameters (e.g. epsilon) were found. Disclosed, not verified.');
  }
  if (claims.has('differential-privacy-mentioned')) {
    return f(2, 'The policy mentions differential privacy without describing a mechanism or parameters. Disclosed, not verified.');
  }
  if (claims.has('vague-anonymisation')) {
    return f(1, 'The policy uses terms such as "anonymised" or "aggregated". This is NOT evidence of differential privacy.');
  }
  return {
    level: 0,
    summary: disclosures && disclosures.length > 0
      ? 'No privacy-enhancing-technology claims were found on the policy page you visited.'
      : 'No privacy policy page has been analysed. Open the site\'s privacy policy to let Plaster look for disclosed claims locally.',
    label: 'unknown',
    scoreEffect: 0,
  };
}
