/**
 * Aggregation: check results -> category results -> overall score, grade,
 * evidence quality and confidence. Risk, evidence quality and confidence are
 * computed SEPARATELY (see docs/scoring-methodology.md §5).
 */
import type {
  CategoryId, CategoryResult, CheckResult, ConfidenceLevel, Grade, ObservationWindow, ScoreCap, TrafficLight,
} from './types.ts';

export const CATEGORY_META: Record<CategoryId, { title: string; weight: number }> = {
  transport:          { title: 'Connection security',       weight: 25 },
  tracking:           { title: 'Tracking & third parties',  weight: 30 },
  cookies:            { title: 'Cookies',                   weight: 10 },
  dataCollection:     { title: 'Personal data collection',  weight: 15 },
  browserProtections: { title: 'Browser-side protections',  weight: 10 },
  transparency:       { title: 'Transparency',              weight: 10 },
};

export const CATEGORY_ORDER: readonly CategoryId[] = ['transport', 'tracking', 'dataCollection', 'cookies', 'browserProtections', 'transparency'];

/** A category needs at least this share of its applicable weight evaluated to be scored. */
export const MIN_CATEGORY_COVERAGE = 0.5;

/**
 * Minimum share of applicable category weight that must be SCORED for a grade
 * to be shown. Unscored (unknown) categories are excluded from the risk score
 * to stay neutral, so a large blind spot could otherwise hide bad behaviour and
 * raise the score. Below this coverage, confidence is low and the grade withheld.
 */
export const MIN_SCORED_COVERAGE = 0.75;

/**
 * Categories without which no grade is shown. Tracking carries the largest
 * weight and is where unobserved behaviour most changes the result.
 */
export const REQUIRED_CATEGORIES: readonly CategoryId[] = ['tracking'];

/** A scored category below this evidence quality is flagged so a green light is not read as verified. */
export const LIMITED_EVIDENCE_THRESHOLD = 0.75;

export const GRADE_THRESHOLDS: ReadonlyArray<[Grade, number]> = [['A', 85], ['B', 70], ['C', 55], ['D', 40], ['F', 0]];

export function gradeFor(score: number): Grade {
  for (const [grade, min] of GRADE_THRESHOLDS) if (score >= min) return grade;
  return 'F';
}

function lightFor(score: number): TrafficLight {
  return score >= 75 ? 'green' : score >= 50 ? 'amber' : 'red';
}

export function aggregateCategory(id: CategoryId, checks: CheckResult[]): CategoryResult {
  const meta = CATEGORY_META[id];
  const applicable = checks.filter((c) => c.outcome !== 'not-applicable');
  const evaluated = applicable.filter((c) => c.score !== null);
  const applicableWeight = applicable.reduce((s, c) => s + c.weight, 0);
  const evaluatedWeight = evaluated.reduce((s, c) => s + c.weight, 0);

  const base = { id, title: meta.title, weight: meta.weight, checks };
  if (applicableWeight === 0) {
    return { ...base, score: null, light: 'grey', evidenceQuality: 0, status: 'not-applicable', limitedEvidence: false };
  }
  const evidenceQuality = evaluated.reduce((s, c) => s + c.weight * c.evidenceReliability, 0) / applicableWeight;
  if (evaluatedWeight / applicableWeight < MIN_CATEGORY_COVERAGE) {
    return { ...base, score: null, light: 'grey', evidenceQuality, status: 'insufficient-evidence', limitedEvidence: true };
  }
  const score = Math.round((100 * evaluated.reduce((s, c) => s + c.weight * (c.score ?? 0), 0)) / evaluatedWeight);
  return { ...base, score, light: lightFor(score), evidenceQuality, status: 'scored', limitedEvidence: evidenceQuality < LIMITED_EVIDENCE_THRESHOLD };
}

export interface Overall {
  rawScore: number | null;
  evidenceQuality: number;
  confidence: ConfidenceLevel;
  confidenceReasons: string[];
}

const LEVELS: readonly ConfidenceLevel[] = ['low', 'medium', 'high'];
const downgrade = (c: ConfidenceLevel): ConfidenceLevel => LEVELS[Math.max(0, LEVELS.indexOf(c) - 1)]!;

export function aggregateOverall(categories: CategoryResult[], obsWindow: ObservationWindow): Overall {
  const applicable = categories.filter((c) => c.status !== 'not-applicable');
  const scored = applicable.filter((c) => c.status === 'scored');
  const applicableWeight = applicable.reduce((s, c) => s + c.weight, 0);
  const scoredWeight = scored.reduce((s, c) => s + c.weight, 0);

  const rawScore = scoredWeight === 0 ? null : Math.round(scored.reduce((s, c) => s + c.weight * (c.score ?? 0), 0) / scoredWeight);
  const evidenceQuality = applicableWeight === 0 ? 0 : applicable.reduce((s, c) => s + c.weight * c.evidenceQuality, 0) / applicableWeight;

  const reasons: string[] = [];
  let confidence: ConfidenceLevel = evidenceQuality >= 0.75 ? 'high' : evidenceQuality >= 0.5 ? 'medium' : 'low';
  reasons.push(`Evidence quality is ${Math.round(evidenceQuality * 100)}% (share of applicable checks backed by reliable evidence).`);

  const insufficient = applicable.filter((c) => c.status === 'insufficient-evidence');
  if (insufficient.length > 0) reasons.push(`Not enough evidence to score: ${insufficient.map((c) => c.title).join(', ')}.`);
  if (applicableWeight > 0 && scoredWeight / applicableWeight < MIN_SCORED_COVERAGE) {
    confidence = 'low';
    reasons.push(`Only ${Math.round((100 * scoredWeight) / applicableWeight)}% of the assessment could be scored (at least ${MIN_SCORED_COVERAGE * 100}% is needed to show a grade).`);
  }
  const missingRequired = applicable.filter((c) => REQUIRED_CATEGORIES.includes(c.id) && c.status !== 'scored');
  if (missingRequired.length > 0) {
    confidence = 'low';
    reasons.push(`${missingRequired.map((c) => c.title).join(', ')} could not be assessed, so no grade is shown: unobserved tracking could make the site look better than it is.`);
  }
  if (!obsWindow.coversPageLoad) {
    const before = confidence;
    confidence = downgrade(confidence);
    if (before !== confidence) reasons.push('Observation did not cover the full page load, so early activity may have been missed.');
  }
  return { rawScore, evidenceQuality, confidence, confidenceReasons: reasons };
}

export interface FinalGrade {
  score: number | null;
  grade: Grade | null;
  gradeStatus: 'final' | 'provisional' | 'withheld';
  /** True when the shown score is a cap ceiling rather than the computed score. */
  scoreCapped: boolean;
}

/**
 * Apply caps and confidence rules:
 *  - high confidence   -> final grade
 *  - medium confidence -> provisional grade
 *  - low confidence    -> score withheld (we will not show a number we cannot stand behind).
 *    The grade is also withheld, EXCEPT when a cap fixes it at F: an F cap is a
 *    high-certainty observed failure, and "at most F" means F. A higher cap
 *    (e.g. "at most C") is only a ceiling, so it is reported via `caps` but no
 *    letter is shown.
 */
export function finaliseGrade(overall: Overall, caps: ScoreCap[]): FinalGrade {
  const cap = caps.reduce<ScoreCap | null>((min, c) => (min === null || c.maxScore < min.maxScore ? c : min), null);
  if (overall.confidence === 'low' || overall.rawScore === null) {
    return cap?.maxGrade === 'F'
      ? { score: null, grade: 'F', gradeStatus: 'provisional', scoreCapped: false }
      : { score: null, grade: null, gradeStatus: 'withheld', scoreCapped: false };
  }
  const capped = cap === null ? overall.rawScore : Math.min(overall.rawScore, cap.maxScore);
  return {
    score: capped,
    grade: gradeFor(capped),
    gradeStatus: overall.confidence === 'high' ? 'final' : 'provisional',
    scoreCapped: cap !== null && overall.rawScore > cap.maxScore,
  };
}
