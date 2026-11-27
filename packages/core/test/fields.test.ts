import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyField } from '../src/fields.ts';

test('classifies by input type and autocomplete tokens', () => {
  assert.equal(classifyField({ tag: 'input', type: 'password' }), 'password');
  assert.equal(classifyField({ tag: 'input', type: 'email' }), 'email');
  assert.equal(classifyField({ tag: 'input', type: 'tel' }), 'phone');
  assert.equal(classifyField({ tag: 'input', type: 'text', autocomplete: 'shipping street-address' }), 'address');
  assert.equal(classifyField({ tag: 'input', type: 'text', autocomplete: 'section-pay billing cc-number' }), 'paymentCard');
  assert.equal(classifyField({ tag: 'input', type: 'text', autocomplete: 'bday-day' }), 'dateOfBirth');
  assert.equal(classifyField({ tag: 'input', type: 'text', autocomplete: 'given-name' }), 'name');
});

test('falls back to page-authored name/id/label hints', () => {
  assert.equal(classifyField({ tag: 'input', name: 'passport_number' }), 'governmentId');
  assert.equal(classifyField({ tag: 'input', label: 'National Insurance number' }), 'governmentId');
  assert.equal(classifyField({ tag: 'textarea', label: 'Describe your symptoms' }), 'health');
  assert.equal(classifyField({ tag: 'input', id: 'card-number' }), 'paymentCard');
  assert.equal(classifyField({ tag: 'input', name: 'dob' }), 'dateOfBirth');
  assert.equal(classifyField({ tag: 'input', label: 'Date of birth' }), 'dateOfBirth');
  assert.equal(classifyField({ tag: 'select', name: 'country_of_birth' }), 'other', 'country of birth is not a date of birth');
  assert.equal(classifyField({ tag: 'input', name: 'search' }), 'other');
});

test('non-data controls are ignored', () => {
  for (const type of ['hidden', 'submit', 'checkbox', 'radio', 'button', 'file']) {
    assert.equal(classifyField({ tag: 'input', type, name: 'email' }), null);
  }
});

test('autocomplete="off" does not suppress hint-based classification', () => {
  assert.equal(classifyField({ tag: 'input', type: 'text', autocomplete: 'off', name: 'email' }), 'email');
});
