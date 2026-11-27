import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess, assessSnapshot } from '../src/assess.ts';
import { SIGNALS, type Assessment, type ConfidenceLevel, type ObservationSnapshot } from '../src/types.ts';
import { capabilities, clone, goodSnapshot, kb, trackerHeavySnapshot } from './helpers.ts';

const run = (s: ObservationSnapshot): Assessment => {
  const r = assess(s, kb);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.assessment;
};
const rank: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };

test('privacy-respecting site with full visibility gets a final A with high confidence', () => {
  const a = run(goodSnapshot());
  assert.equal(a.grade, 'A');
  assert.equal(a.gradeStatus, 'final');
  assert.equal(a.confidence, 'high');
  assert.ok(a.score !== null && a.score >= 85);
  assert.equal(a.caps.length, 0);
});

test('tracker-heavy site scores poorly, with red tracking and explanations naming the trackers', () => {
  const a = run(trackerHeavySnapshot());
  const tracking = a.categories.find((c) => c.id === 'tracking')!;
  assert.equal(tracking.light, 'red');
  assert.ok(a.score !== null && a.score < run(goodSnapshot()).score!);
  const replay = tracking.checks.find((c) => c.checkId === 'tracking.session-replay')!;
  assert.equal(replay.outcome, 'fail');
  assert.match(replay.explanation, /hotjar\.com/);
  assert.ok(replay.recommendation, 'failed checks carry a recommendation');
  const tp = a.thirdPartyDomains.find((d) => d.domain === 'doubleclick.net');
  assert.equal(tp?.tracker?.owner, 'Google');
});

test('HARD CAP: a password field on an HTTP page caps the grade at F, even with otherwise good signals', () => {
  const s = goodSnapshot();
  s.page.origin = 'http://shop.example.co.uk';
  s.forms = [{ actionOrigin: null, method: 'post', fieldKinds: ['password'] }];
  const a = run(s);
  assert.equal(a.grade, 'F');
  assert.ok(a.score! <= 39);
  assert.ok(a.caps.some((c) => c.checkId === 'transport.secure-form-submission' && c.maxGrade === 'F'));
});

test('INVARIANT I-8: with nothing observable, the grade is withheld (never a default "A")', () => {
  const s: ObservationSnapshot = {
    schemaVersion: 1,
    page: { origin: 'https://unknown.example' },
    capabilities: capabilities({}, 'unavailable'),
    window: { coversPageLoad: true, durationMs: 1000 },
  };
  const a = run(s);
  assert.equal(a.grade, null);
  assert.equal(a.score, null);
  assert.equal(a.gradeStatus, 'withheld');
  assert.equal(a.confidence, 'low');
  const tracking = a.categories.find((c) => c.id === 'tracking')!;
  assert.equal(tracking.status, 'insufficient-evidence');
  assert.equal(tracking.light, 'grey', '"no trackers seen" must not appear green when trackers were not observable');
  assert.ok(a.unobservable.some((u) => u.includes('third-party')));
});

test('INVARIANT I-8: removing any signal never increases evidence quality or confidence', () => {
  for (const base of [goodSnapshot(), trackerHeavySnapshot()]) {
    const full = run(base);
    for (const signal of SIGNALS) {
      const s = clone(base);
      s.capabilities.signals[signal] = 'unavailable';
      const reduced = run(s);
      assert.ok(reduced.evidenceQuality <= full.evidenceQuality, `evidence quality rose when ${signal} was removed`);
      assert.ok(rank[reduced.confidence] <= rank[full.confidence], `confidence rose when ${signal} was removed`);
    }
  }
});

test('unknown is neutral for risk: unobservable checks carry no score, rather than a penalty or a bonus', () => {
  const s = goodSnapshot();
  s.capabilities.signals.documentHeaders = 'unavailable';
  const a = run(s);
  const protections = a.categories.find((c) => c.id === 'browserProtections')!;
  assert.equal(protections.status, 'insufficient-evidence');
  assert.ok(protections.checks.every((c) => c.outcome === 'unknown' && c.score === null));
  // The remaining, observed categories are still scored on their own merits.
  assert.equal(a.categories.find((c) => c.id === 'transport')!.score, 100);
  assert.ok(a.evidenceQuality < run(goodSnapshot()).evidenceQuality);
});

test('partial visibility: "none observed" passes but with reduced reliability and confidence', () => {
  const s = goodSnapshot();
  s.capabilities.signals.subresourceHosts = 'partial';
  const a = run(s);
  const adv = a.categories.find((c) => c.id === 'tracking')!.checks.find((c) => c.checkId === 'tracking.advertising')!;
  assert.equal(adv.outcome, 'pass');
  assert.ok(adv.evidenceReliability < 0.8);
  assert.match(adv.explanation, /does not mean "none present"/);
});

test('observation that missed the page load downgrades confidence', () => {
  const s = goodSnapshot();
  s.window.coversPageLoad = false;
  const a = run(s);
  assert.equal(a.confidence, 'medium');
  assert.equal(a.gradeStatus, 'provisional');
  assert.ok(a.confidenceReasons.some((r) => r.includes('page load')));
});

test('risk, evidence quality and confidence are reported separately', () => {
  // Same risk signals, different visibility: the score can match while evidence quality differs.
  const full = run(goodSnapshot());
  const s = goodSnapshot();
  s.capabilities.signals.cookies = 'unavailable';
  const fewer = run(s);
  assert.ok(typeof full.evidenceQuality === 'number' && typeof fewer.evidenceQuality === 'number');
  assert.ok(fewer.evidenceQuality < full.evidenceQuality);
  assert.equal(fewer.categories.find((c) => c.id === 'cookies')!.status, 'insufficient-evidence');
});

test('EXPLAINABILITY: every evidence reference in checks and guidance resolves to an evidence item', () => {
  for (const s of [goodSnapshot(), trackerHeavySnapshot(), { ...goodSnapshot(), capabilities: capabilities({}, 'unavailable') }]) {
    const a = run(s);
    const ids = new Set(a.evidence.map((e) => e.id));
    for (const c of a.categories.flatMap((c) => c.checks)) {
      for (const id of c.evidenceIds) assert.ok(ids.has(id), `check ${c.checkId} references missing evidence ${id}`);
      assert.ok(c.explanation.length > 0);
    }
    for (const g of a.guidance) for (const id of g.evidenceIds) assert.ok(ids.has(id), `guidance ${g.dataType} references missing evidence ${id}`);
  }
});

test('evidence carries the correct provenance labels (observed / cached / unknown)', () => {
  const a = run(trackerHeavySnapshot());
  const byId = new Map(a.evidence.map((e) => [e.id, e]));
  assert.equal(byId.get('transport.page-scheme')?.label, 'observed');
  assert.equal(byId.get('knowledge.trackers.advertising')?.label, 'cached');
  assert.equal(byId.get('knowledge.trackers.advertising')?.freshness.kind, 'cached');
  const none = run({ ...goodSnapshot(), capabilities: capabilities({ cookies: 'unavailable' }) });
  assert.equal(none.evidence.find((e) => e.id === 'cookies.unobserved')?.label, 'unknown');
});

test('script-submitted sensitive forms are reported as an unknown destination, not as safe', () => {
  const s = goodSnapshot();
  s.forms = [{ actionOrigin: null, method: 'unknown', fieldKinds: ['email', 'password'] }];
  const a = run(s);
  const check = a.categories.flatMap((c) => c.checks).find((c) => c.checkId === 'data.cross-site-submission')!;
  assert.equal(check.outcome, 'unknown');
  assert.match(check.explanation, /does not inspect request contents/);
});

test('determinism: the same snapshot always produces the same assessment', () => {
  const s = trackerHeavySnapshot();
  assert.deepEqual(assessSnapshot(clone(s), kb), assessSnapshot(clone(s), kb));
});

test('assessments record methodology, engine and knowledge versions', () => {
  const a = run(goodSnapshot());
  assert.match(a.methodologyVersion, /^\d+\.\d+\.\d+$/);
  assert.match(a.engineVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(a.knowledgeVersion, kb.version);
});

// ---------------------------------------------------------------------------
// Regression tests from the v0.1 review (docs/review-2026-11.md)
// ---------------------------------------------------------------------------

test('REVIEW R1: a login form on an HTTP page is capped at F even if its action is https://', () => {
  const s = goodSnapshot();
  s.page.origin = 'http://shop.example.co.uk';
  s.forms = [{ actionOrigin: 'https://shop.example.co.uk', method: 'post', fieldKinds: ['email', 'password'] }];
  const a = run(s);
  assert.equal(a.grade, 'F');
  const check = a.categories.flatMap((c) => c.checks).find((c) => c.checkId === 'transport.secure-form-submission')!;
  assert.equal(check.outcome, 'fail');
});

test('REVIEW R2: an HTTP page without sensitive forms can never grade above C', () => {
  const s = goodSnapshot();
  s.page.origin = 'http://blog.example.co.uk';
  s.forms = [];
  const a = run(s);
  assert.ok(a.score !== null && a.score <= 69, `score ${a.score}`);
  assert.ok(['C', 'D', 'F'].includes(a.grade!));
  assert.ok(a.caps.some((c) => c.checkId === 'transport.page-https' && c.maxGrade === 'C'));
});

test('REVIEW R3: at low confidence no numeric score is shown, even when a cap applies', () => {
  const lowWithF: ObservationSnapshot = {
    schemaVersion: 1, page: { origin: 'http://x.example' },
    capabilities: capabilities({ forms: 'available' }, 'unavailable'),
    window: { coversPageLoad: true, durationMs: 1 },
    forms: [{ actionOrigin: null, method: 'post', fieldKinds: ['password'] }],
  };
  const a = run(lowWithF);
  assert.equal(a.confidence, 'low');
  assert.equal(a.score, null);
  assert.equal(a.grade, 'F', 'an F cap is a determination: "at most F" is F');

  const lowWithC: ObservationSnapshot = { ...lowWithF, forms: [] };
  const b = run(lowWithC);
  assert.equal(b.confidence, 'low');
  assert.equal(b.score, null);
  assert.equal(b.grade, null, 'a C cap is only a ceiling, so no letter is shown at low confidence');
  assert.ok(b.caps.some((c) => c.maxGrade === 'C'), 'the ceiling is still reported');
});

test('REVIEW R4: referrer-policy explanations match what each policy actually sends', () => {
  const text = (policy: string) => {
    const s = goodSnapshot();
    s.documentHeaders!.referrerPolicy = policy;
    return run(s).categories.flatMap((c) => c.checks).find((c) => c.checkId === 'protections.referrer-policy')!.explanation;
  };
  assert.doesNotMatch(text('origin'), /full page address/);
  assert.match(text('origin'), /origin/);
  assert.match(text('unsafe-url'), /full page addresses/);
});

test('REVIEW R5: categories scored on limited evidence are flagged, so green is not read as verified', () => {
  const s = goodSnapshot();
  s.capabilities.signals.subresourceHosts = 'partial';
  const tracking = run(s).categories.find((c) => c.id === 'tracking')!;
  assert.equal(tracking.light, 'green');
  assert.equal(tracking.limitedEvidence, true);
  assert.equal(run(goodSnapshot()).categories.find((c) => c.id === 'tracking')!.limitedEvidence, false);
});

// ---------------------------------------------------------------------------
// Regression tests from the Day 2 release review (docs/review-2026-11.md §4)
// ---------------------------------------------------------------------------

test('REVIEW R8: if tracking cannot be assessed, no grade is shown (hidden trackers cannot raise the result)', () => {
  const s = trackerHeavySnapshot();
  s.capabilities.signals.subresourceHosts = 'unavailable';
  const a = run(s);
  assert.equal(a.grade, null);
  assert.equal(a.score, null);
  assert.equal(a.gradeStatus, 'withheld');
  assert.ok(a.confidenceReasons.some((r) => r.includes('Tracking')));
});

test('REVIEW R8: removing any one signal never improves the presented grade letter or its status', () => {
  const letter = { A: 5, B: 4, C: 3, D: 2, F: 1 } as const;
  const status = { withheld: 0, provisional: 1, final: 2 } as const;
  for (const base of [goodSnapshot(), trackerHeavySnapshot()]) {
    const full = run(base);
    for (const signal of SIGNALS) {
      const s = clone(base);
      s.capabilities.signals[signal] = 'unavailable';
      const reduced = run(s);
      if (reduced.grade !== null) {
        assert.ok(full.grade !== null && letter[reduced.grade] <= letter[full.grade], `${signal}: grade improved ${full.grade} -> ${reduced.grade}`);
      }
      assert.ok(status[reduced.gradeStatus] <= status[full.gradeStatus], `${signal}: status improved`);
    }
  }
});

test('REVIEW R9: the data-collection check links the evidence that actually triggered it', () => {
  const s = goodSnapshot();
  s.subresources = [{ host: 'securepubads.g.doubleclick.net', scheme: 'https', kind: 'script', count: 1 }];
  const check = run(s).categories.flatMap((c) => c.checks).find((c) => c.checkId === 'data.sensitive-fields-with-trackers')!;
  assert.equal(check.score, 0.4);
  assert.ok(check.evidenceIds.includes('knowledge.trackers.advertising'));
  assert.ok(!check.evidenceIds.includes('knowledge.trackers.session-replay'));
  assert.match(check.explanation, /advertising scripts \(doubleclick\.net\)/);
});

test('REVIEW R10: a score limited by a cap is marked as capped', () => {
  const s = goodSnapshot();
  s.page.origin = 'http://shop.example.co.uk';
  const a = run(s);
  assert.equal(a.score, 39);
  assert.equal(a.scoreCapped, true);
  assert.equal(run(goodSnapshot()).scoreCapped, false);
});

// ---------------------------------------------------------------------------
// Approved decision Q-6 (owner, 2026-11-25): grade display conditions
// ---------------------------------------------------------------------------

test('Q-6: tracking assessed but only 70% of category weight scored -> grade withheld', () => {
  // Applicable weights: transport 25, tracking 30, data 15, cookies 10, protections 10, transparency 10 = 100.
  // Removing cookies, protections and transparency leaves 70 / 100 = 70% scored (< 75%).
  const s = goodSnapshot();
  s.capabilities.signals.cookies = 'unavailable';
  s.capabilities.signals.documentHeaders = 'unavailable';
  s.capabilities.signals.pageLinks = 'unavailable';
  const a = run(s);
  assert.equal(a.categories.find((c) => c.id === 'tracking')!.status, 'scored', 'tracking is assessed');
  const scored = a.categories.filter((c) => c.status === 'scored').reduce((n, c) => n + c.weight, 0);
  const applicable = a.categories.filter((c) => c.status !== 'not-applicable').reduce((n, c) => n + c.weight, 0);
  assert.equal(scored / applicable, 0.7);
  assert.equal(a.gradeStatus, 'withheld');
  assert.equal(a.grade, null);
  assert.equal(a.score, null);
  assert.ok(a.confidenceReasons.some((r) => r.includes('70%') && r.includes('75%')));
});

test('Q-6: tracking assessed and 80% of category weight scored -> grade shown', () => {
  const s = goodSnapshot();
  s.capabilities.signals.cookies = 'unavailable';
  s.capabilities.signals.documentHeaders = 'unavailable';
  const a = run(s);
  const scored = a.categories.filter((c) => c.status === 'scored').reduce((n, c) => n + c.weight, 0);
  const applicable = a.categories.filter((c) => c.status !== 'not-applicable').reduce((n, c) => n + c.weight, 0);
  assert.equal(scored / applicable, 0.8);
  assert.notEqual(a.gradeStatus, 'withheld');
  assert.ok(a.grade !== null && a.score !== null);
});

test('Q-6: not-applicable categories are excluded from the coverage denominator', () => {
  // No forms -> data collection is not applicable (weight 15 leaves the denominator).
  // Cookies + protections unavailable -> scored 65 of applicable 85 = 76% (>= 75%): grade shown.
  const s = goodSnapshot();
  s.forms = [];
  s.capabilities.signals.cookies = 'unavailable';
  s.capabilities.signals.documentHeaders = 'unavailable';
  const a = run(s);
  assert.equal(a.categories.find((c) => c.id === 'dataCollection')!.status, 'not-applicable');
  assert.notEqual(a.gradeStatus, 'withheld');
});
