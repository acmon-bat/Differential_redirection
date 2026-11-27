import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot, LIMITS } from '../src/validate.ts';
import { assess } from '../src/assess.ts';
import { capabilities, goodSnapshot, kb, clone } from './helpers.ts';

const SECRET = 'hunter2-SECRET-VALUE';

test('rejects structurally invalid input', () => {
  assert.equal(validateSnapshot(null).ok, false);
  assert.equal(validateSnapshot('x').ok, false);
  assert.equal(validateSnapshot({ ...goodSnapshot(), schemaVersion: 2 }).ok, false);
  assert.equal(validateSnapshot({ ...goodSnapshot(), capabilities: undefined }).ok, false);
});

test('refuses full URLs as the page identity (origin only, no paths or queries)', () => {
  const s = clone(goodSnapshot()) as unknown as { page: { origin: string } };
  s.page.origin = 'https://shop.example.co.uk/orders?email=alice@example.com';
  const r = validateSnapshot(s);
  assert.equal(r.ok, false);
});

test('PRIVACY: unexpected properties (e.g. form values) are dropped and never reach the assessment', () => {
  const s = clone(goodSnapshot()) as unknown as Record<string, any>;
  s.forms[0].value = SECRET;
  s.forms[0].fields = [{ type: 'password', value: SECRET }];
  s.cookies[0].value = SECRET;
  s.cookies[0].name = 'session_id';
  s.page.title = SECRET;
  s.page.url = `https://shop.example.co.uk/?q=${SECRET}`;
  s.requestBodies = [SECRET];
  s.subresources[0].url = `https://static.example.co.uk/a.js?token=${SECRET}`;

  const v = validateSnapshot(s);
  assert.ok(v.ok);
  assert.ok(!JSON.stringify(v.data).includes(SECRET), 'validated snapshot must not contain the secret');
  assert.ok(!JSON.stringify(v.data).includes('session_id'), 'cookie names are not retained either');

  const a = assess(s, kb);
  assert.ok(a.ok);
  assert.ok(!JSON.stringify(a.assessment).includes(SECRET), 'assessment must not contain the secret');
});

test('missing capability information is treated as unavailable, never available', () => {
  const s = clone(goodSnapshot()) as unknown as Record<string, any>;
  delete s.capabilities.signals.cookies;
  const v = validateSnapshot(s);
  assert.ok(v.ok);
  assert.equal(v.data.capabilities.signals.cookies, 'unavailable');
  assert.equal(v.data.cookies, undefined, 'data for an unavailable signal is ignored');
  assert.ok(v.warnings.some((w) => w.includes('cookies')));
});

test('data supplied for a signal declared not-permitted is ignored', () => {
  const s = goodSnapshot();
  s.capabilities = capabilities({ documentHeaders: 'not-permitted' });
  const v = validateSnapshot(s);
  assert.ok(v.ok);
  assert.equal(v.data.documentHeaders, undefined);
});

test('collections are size-bounded and malformed entries are dropped', () => {
  const s = clone(goodSnapshot()) as unknown as Record<string, any>;
  s.subresources = Array.from({ length: LIMITS.subresources + 50 }, (_, i) => ({ host: `h${i}.example.org`, scheme: 'https', kind: 'script', count: 1 }));
  s.subresources.push({ host: 'not a host!!', scheme: 'https', kind: 'script', count: 1 });
  s.forms[0].fieldKinds = ['password', 'not-a-kind', 42];
  s.capabilities.limitations = ['x'.repeat(10_000)];
  const v = validateSnapshot(s);
  assert.ok(v.ok);
  assert.equal(v.data.subresources!.length, LIMITS.subresources);
  assert.deepEqual(v.data.forms![0]!.fieldKinds, ['password']);
  assert.equal(v.data.capabilities.limitations[0]!.length, LIMITS.stringLength);
  assert.ok(v.warnings.some((w) => w.includes('truncated')));
});

test('unknown referrer-policy tokens and non-boolean header flags become unknown', () => {
  const s = clone(goodSnapshot()) as unknown as Record<string, any>;
  s.documentHeaders = { strictTransportSecurity: 'yes', contentSecurityPolicy: true, referrerPolicy: '<img src=x>', permissionsPolicy: 1 };
  const v = validateSnapshot(s);
  assert.ok(v.ok);
  assert.deepEqual(v.data.documentHeaders, { strictTransportSecurity: null, contentSecurityPolicy: true, referrerPolicy: null, permissionsPolicy: null });
});
