import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDisclosureClaims, petFinding } from '../src/disclosures.ts';
import { assess } from '../src/assess.ts';
import { goodSnapshot, kb } from './helpers.ts';

test('S-8: "anonymised" or "aggregated" wording is NOT treated as differential privacy', () => {
  const claims = detectDisclosureClaims('We share anonymised and aggregated statistics with partners.');
  assert.deepEqual(claims, ['vague-anonymisation']);
  const pet = petFinding([{ sourceOrigin: 'https://a.example', claims }]);
  assert.equal(pet.level, 1);
  assert.match(pet.summary, /NOT evidence of differential privacy/);
});

test('epsilon values without an explicit differential-privacy claim do not count', () => {
  assert.deepEqual(detectDisclosureClaims('Our model uses epsilon = 0.5 as a learning rate.'), []);
});

test('evidence ladder: mention -> mechanism -> parameters', () => {
  const l2 = detectDisclosureClaims('We use differential privacy for some reports.');
  assert.equal(petFinding([{ sourceOrigin: 'https://a.example', claims: l2 }]).level, 2);
  const l3 = detectDisclosureClaims('Reports are differentially private: we add Laplace noise calibrated to each query.');
  assert.equal(petFinding([{ sourceOrigin: 'https://a.example', claims: l3 }]).level, 3);
  const l4 = detectDisclosureClaims('Telemetry is differentially private using the Gaussian mechanism with epsilon = 1.0 per user per day.');
  assert.equal(petFinding([{ sourceOrigin: 'https://a.example', claims: l4 }]).level, 4);
});

test('no policy analysed => level 0 with "unknown" label, not "no DP"', () => {
  const pet = petFinding(undefined);
  assert.equal(pet.level, 0);
  assert.equal(pet.label, 'unknown');
});

test('D-14: PET claims are informational and never change the score in methodology 0.1', () => {
  const base = goodSnapshot();
  const withDp = goodSnapshot();
  withDp.disclosures = [{ sourceOrigin: base.page.origin, claims: ['differential-privacy-mentioned', 'differential-privacy-mechanism', 'differential-privacy-parameters'] }];
  const a = assess(base, kb);
  const b = assess(withDp, kb);
  assert.ok(a.ok && b.ok);
  assert.equal(b.assessment.pet.level, 4);
  assert.equal(b.assessment.pet.scoreEffect, 0);
  assert.equal(b.assessment.score, a.assessment.score);
  assert.equal(b.assessment.evidence.find((e) => e.id === 'disclosures.pet')?.label, 'disclosed');
});

test('input text is bounded and only flags are returned (never the text)', () => {
  const huge = 'differential privacy '.repeat(50_000);
  const claims = detectDisclosureClaims(huge);
  assert.deepEqual(claims, ['differential-privacy-mentioned']);
  assert.ok(claims.every((c) => c.length < 40));
});
