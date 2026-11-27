import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseHost, parseOrigin, registrableDomain, isThirdParty } from '../src/domains.ts';
import { kb } from './helpers.ts';

test('normaliseHost lower-cases, strips trailing dot and rejects junk', () => {
  assert.equal(normaliseHost('WWW.Example.COM.'), 'www.example.com');
  assert.equal(normaliseHost('127.0.0.1'), '127.0.0.1');
  assert.equal(normaliseHost('localhost'), 'localhost');
  assert.equal(normaliseHost('999.1.1.1'), null);
  assert.equal(normaliseHost('bad host'), null);
  assert.equal(normaliseHost('-bad.com'), null);
  assert.equal(normaliseHost('<script>.com'), null);
  assert.equal(normaliseHost(''), null);
});

test('parseOrigin accepts origins only, never paths or query strings', () => {
  assert.deepEqual(parseOrigin('https://Example.com:8443'), { scheme: 'https', host: 'example.com', port: '8443' });
  assert.deepEqual(parseOrigin('http://example.com/'), { scheme: 'http', host: 'example.com', port: null });
  assert.equal(parseOrigin('https://example.com/account?id=42'), null);
  assert.equal(parseOrigin('https://example.com#frag'), null);
  assert.equal(parseOrigin('https://user:pass@example.com'), null);
  assert.equal(parseOrigin('javascript:alert(1)'), null);
});

test('registrableDomain respects multi-label and private public suffixes', () => {
  assert.equal(registrableDomain('a.b.example.com', kb), 'example.com');
  assert.equal(registrableDomain('shop.example.co.uk', kb), 'example.co.uk');
  assert.equal(registrableDomain('alice.github.io', kb), 'alice.github.io');
  assert.equal(registrableDomain('example.com', kb), 'example.com');
  assert.equal(registrableDomain('10.0.0.1', kb), '10.0.0.1');
});

test('third-party classification compares registrable domains', () => {
  assert.equal(isThirdParty('static.example.co.uk', 'shop.example.co.uk', kb), false);
  assert.equal(isThirdParty('other.co.uk', 'shop.example.co.uk', kb), true);
  assert.equal(isThirdParty('bob.github.io', 'alice.github.io', kb), true);
});
