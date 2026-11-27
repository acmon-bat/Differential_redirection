/**
 * Popup rendering. Uses DOM construction with textContent only; page-derived
 * strings are never interpreted as HTML (threat T-5).
 */
import type {
  Assessment, CategoryResult, CheckResult, DataTypeGuidance, Evidence, GuidanceLevel, ObservationSnapshot,
} from '../../../../packages/core/src/types.ts';

type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

const OUTCOME_ICON: Record<CheckResult['outcome'], string> = { pass: '✓', partial: '◐', fail: '✗', unknown: '?', 'not-applicable': '–' };
const LEVEL_TEXT: Record<GuidanceLevel, string> = {
  ok: 'Reasonable to share if needed',
  caution: 'Share with caution',
  'prefer-alternative': 'Prefer an alternative',
  avoid: 'Avoid sharing',
};

function evidenceChips(ids: string[], evidence: Map<string, Evidence>): HTMLElement {
  const wrap = el('ul', { class: 'evidence' });
  for (const id of ids) {
    const e = evidence.get(id);
    if (!e) continue;
    wrap.append(el('li', {}, el('span', { class: `chip chip-${e.label}` }, e.label), ' ', e.summary));
  }
  return wrap;
}

function checkItem(c: CheckResult, evidence: Map<string, Evidence>): HTMLElement {
  return el('li', { class: `check outcome-${c.outcome}` },
    el('div', { class: 'check-head' },
      el('span', { class: 'outcome', 'aria-label': c.outcome }, OUTCOME_ICON[c.outcome]),
      el('strong', {}, c.title),
      c.score !== null ? el('span', { class: 'muted' }, ` ${Math.round(c.score * 100)}% · weight ${c.weight}`) : el('span', { class: 'muted' }, ` ${c.outcome}`)),
    el('p', {}, c.explanation),
    c.recommendation ? el('p', { class: 'recommendation' }, '→ ', c.recommendation) : null,
    evidenceChips(c.evidenceIds, evidence));
}

function categoryBlock(c: CategoryResult, evidence: Map<string, Evidence>): HTMLElement {
  const label = c.status === 'scored' ? `${c.score}/100` : c.status === 'insufficient-evidence' ? 'Not enough evidence' : 'Not applicable';
  return el('details', { class: 'category' },
    el('summary', {},
      el('span', { class: `light light-${c.light}${c.status === 'scored' && c.limitedEvidence ? ' light-limited' : ''}`, 'aria-hidden': 'true' }),
      el('span', { class: 'cat-title' }, c.title),
      el('span', { class: 'cat-score' }, label),
      c.status === 'scored' && c.limitedEvidence ? el('span', { class: 'badge', title: 'Based on limited evidence: not verified' }, 'limited visibility') : null,
      el('span', { class: 'muted small' }, ` evidence ${Math.round(c.evidenceQuality * 100)}%`)),
    el('ul', { class: 'checks' }, ...c.checks.filter((x) => x.outcome !== 'not-applicable').map((x) => checkItem(x, evidence))));
}

function guidanceItem(g: DataTypeGuidance): HTMLElement {
  return el('details', { class: `guidance level-${g.level}` },
    el('summary', {},
      el('span', { class: `pill pill-${g.level}` }, LEVEL_TEXT[g.level]),
      el('span', {}, g.label),
      g.requestedOnPage ? el('span', { class: 'badge' }, 'asked on this page') : null),
    el('ul', {}, ...g.reasons.map((r) => el('li', {}, r))),
    el('p', { class: 'tip' }, 'Tip: ', g.tip));
}

export function renderAssessment(root: HTMLElement, a: Assessment, snapshot: ObservationSnapshot): void {
  const evidence = new Map(a.evidence.map((e) => [e.id, e]));
  const gradeText = a.grade ?? '—';
  const gradeNote = a.gradeStatus === 'withheld'
    ? 'Grade withheld: not enough reliable evidence'
    : a.gradeStatus === 'provisional' ? 'Provisional grade' : 'Grade';

  root.replaceChildren(
    el('section', { class: 'summary' },
      el('div', { class: `grade grade-${a.grade ?? 'none'}`, 'data-testid': 'grade' }, gradeText),
      el('div', { class: 'summary-text' },
        el('div', { class: 'origin' }, a.subject),
        el('div', {}, gradeNote, a.score !== null ? ` · ${a.score}/100${a.scoreCapped ? ' (capped)' : ''}` : ''),
        el('div', {}, 'Confidence: ', el('strong', { 'data-testid': 'confidence' }, a.confidence),
          ` · Evidence quality ${Math.round(a.evidenceQuality * 100)}%`))),
    ...a.caps.map((c) => el('div', { class: 'alert' }, `Capped at ${c.maxGrade}: ${c.reason}`)),
    el('details', { class: 'confidence' },
      el('summary', {}, 'Why this confidence?'),
      el('ul', {}, ...a.confidenceReasons.map((r) => el('li', {}, r)))),

    el('h2', {}, 'What to share here'),
    el('div', { class: 'guidance-list' }, ...a.guidance.map(guidanceItem)),

    el('h2', {}, 'Privacy categories'),
    ...a.categories.map((c) => categoryBlock(c, evidence)),

    el('h2', {}, `Third-party domains observed (${a.thirdPartyDomains.length})`),
    a.thirdPartyDomains.length === 0
      ? el('p', { class: 'muted' }, 'None observed. Visibility is partial (see below), so this is not proof that there are none.')
      : el('ul', { class: 'third-parties' }, ...a.thirdPartyDomains.map((t) =>
        el('li', {}, el('strong', {}, t.domain), ` · ${t.requests} request(s)`,
          t.tracker ? el('span', { class: 'chip chip-cached' }, `${t.tracker.owner}: ${t.tracker.categories.join(', ')}`) : null))),

    el('h2', {}, 'Privacy-enhancing technologies'),
    el('p', {}, el('span', { class: `chip chip-${a.pet.label}` }, a.pet.label), ` Level ${a.pet.level}: ${a.pet.summary}`),
    el('p', { class: 'muted small' }, 'Informational only; this does not affect the score. Differential privacy cannot be observed from a browser.'),

    el('h2', {}, 'What Plaster could not see'),
    el('ul', { class: 'unobservable', 'data-testid': 'unobservable' }, ...a.unobservable.map((u) => el('li', {}, u))),

    el('details', { class: 'raw' },
      el('summary', {}, 'Everything Plaster collected from this page'),
      el('p', { class: 'muted small' }, 'This value-free observation is the only input to the assessment. It stays in this popup and is discarded when the popup closes.'),
      el('pre', { 'data-testid': 'raw-snapshot' }, JSON.stringify(snapshot, null, 2))),
  );
}

export function renderMessage(root: HTMLElement, message: string): void {
  root.replaceChildren(el('p', { class: 'message' }, message));
}
