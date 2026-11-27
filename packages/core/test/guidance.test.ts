import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../src/assess.ts';
import type { DataType, ObservationSnapshot } from '../src/types.ts';
import { capabilities, goodSnapshot, kb, trackerHeavySnapshot } from './helpers.ts';

function guidance(s: ObservationSnapshot) {
  const r = assess(s, kb);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return (t: DataType) => r.assessment.guidance.find((g) => g.dataType === t)!;
}

test('clean site with full visibility: everyday data is "ok", special categories stay "caution"', () => {
  const g = guidance(goodSnapshot());
  assert.equal(g('email').level, 'ok');
  assert.equal(g('email').requestedOnPage, true);
  assert.equal(g('phone').requestedOnPage, false);
  assert.equal(g('health').level, 'caution');
  assert.equal(g('governmentId').level, 'caution');
});

test('HTTP page: passwords and payment details should not be shared', () => {
  const s = goodSnapshot();
  s.page.origin = 'http://shop.example.co.uk';
  const g = guidance(s);
  assert.equal(g('password').level, 'avoid');
  assert.equal(g('paymentCard').level, 'avoid');
  assert.equal(g('email').level, 'avoid', 'requested on an insecure page');
  assert.equal(g('name').level, 'caution', 'not requested, standard sensitivity');
});

test('session replay and advertising trackers raise guidance with explained reasons', () => {
  const g = guidance(trackerHeavySnapshot());
  assert.equal(g('paymentCard').level, 'prefer-alternative');
  assert.ok(g('paymentCard').reasons.some((r) => r.includes('session-replay')));
  assert.equal(g('email').level, 'prefer-alternative');
  assert.match(g('email').tip, /alias/);
  assert.equal(g('name').level, 'caution');
});

test('INVARIANT I-8: when third parties are unobservable, no data type is rated "ok"', () => {
  const s = goodSnapshot();
  s.capabilities = capabilities({ subresourceHosts: 'unavailable' });
  const r = assess(s, kb);
  assert.ok(r.ok);
  for (const g of r.assessment.guidance) {
    assert.notEqual(g.level, 'ok', `${g.dataType} must not be "ok" without third-party visibility`);
    assert.ok(g.reasons.some((x) => x.includes('could not observe')));
  }
});

test('cross-site form submission adds a caution for the requested data types', () => {
  const s = goodSnapshot();
  s.forms = [{ actionOrigin: 'https://payments.provider.example', method: 'post', fieldKinds: ['paymentCard'] }];
  const g = guidance(s);
  assert.equal(g('paymentCard').level, 'caution');
  assert.ok(g('paymentCard').reasons.some((r) => r.includes('different organisation')));
});

test('REVIEW R6: session replay leads to "caution" (not an impossible "alternative") for passwords', () => {
  const s = goodSnapshot();
  s.subresources = [{ host: 'static.hotjar.com', scheme: 'https', kind: 'script', count: 1 }];
  const g = guidance(s);
  assert.equal(g('password').level, 'caution');
  assert.match(g('password').reasons.join(' '), /mask password fields by default/);
  assert.equal(g('paymentCard').level, 'prefer-alternative');
});

test('REVIEW R7: only health is described as a GDPR special category', () => {
  const g = guidance(goodSnapshot());
  assert.match(g('health').reasons[0]!, /special category.*Article 9/);
  assert.doesNotMatch(g('governmentId').reasons.join(' '), /special category/);
});

test('REVIEW R11: the ad-matching warning applies to email and phone only', () => {
  const g = guidance(trackerHeavySnapshot());
  assert.equal(g('email').level, 'prefer-alternative');
  assert.equal(g('phone').level, 'prefer-alternative');
  assert.ok(!g('dateOfBirth').reasons.some((r) => r.includes('advertising platforms')));
  assert.ok(!g('governmentId').reasons.some((r) => r.includes('advertising platforms')));
});
