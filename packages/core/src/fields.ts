/**
 * Classify a form field into a sensitive data category from STRUCTURAL
 * attributes only: input type, `autocomplete` tokens, and name/id/label hints.
 *
 * This function never receives, and must never be given, the field's value
 * (Invariant I-1). It is pure so adapters in any environment can reuse it.
 */
import type { FieldKind } from './types.ts';

export interface FieldDescriptor {
  tag: 'input' | 'select' | 'textarea';
  type?: string | null;          // input type attribute
  autocomplete?: string | null;  // autocomplete attribute
  name?: string | null;          // name attribute
  id?: string | null;            // id attribute
  label?: string | null;         // associated label / aria-label / placeholder text (page-authored)
}

/** Input types that never carry personal data entered by the user. */
const NON_DATA_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'range', 'color', 'file']);

const AUTOCOMPLETE: Array<[RegExp, FieldKind]> = [
  [/^(current-password|new-password)$/, 'password'],
  [/^cc-/, 'paymentCard'],
  [/^email$/, 'email'],
  [/^tel(-|$)/, 'phone'],
  [/^bday(-|$)/, 'dateOfBirth'],
  [/^(name|given-name|family-name|additional-name|honorific-prefix|honorific-suffix)$/, 'name'],
  [/^(street-address|address-line[123]|address-level[1-4]|postal-code|country|country-name)$/, 'address'],
];

const HINTS: Array<[RegExp, FieldKind]> = [
  [/passw(or)?d|passcode|\bpin\b/, 'password'],
  [/card.?(number|no)|cc.?(num|number)|\bcvc\b|\bcvv\b|security.?code|expir/, 'paymentCard'],
  [/passport|national.?(id|insurance)|\bssn\b|social.?security|driv(er|ing).?licen[cs]e|\bnino\b|tax.?id/, 'governmentId'],
  [/diagnos|medical|health|allerg|medication|symptom/, 'health'],
  [/date.?of.?birth|birth.?date|birthday|\bdob\b/, 'dateOfBirth'],
  [/e-?mail/, 'email'],
  [/phone|mobile|\btel\b|telephone/, 'phone'],
  [/first.?name|last.?name|full.?name|surname|given.?name|family.?name|^name$/, 'name'],
  [/address|post.?code|zip|\bcity\b/, 'address'],
];

/** Returns the field kind, or null if the field does not collect user data. */
export function classifyField(f: FieldDescriptor): FieldKind | null {
  const type = (f.type ?? 'text').toLowerCase().trim();
  if (f.tag === 'input' && NON_DATA_TYPES.has(type)) return null;
  if (type === 'password') return 'password';

  // autocomplete may contain section/shipping/billing prefixes: use the last token.
  const tokens = (f.autocomplete ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const token = tokens[tokens.length - 1];
  if (token && token !== 'off' && token !== 'on') {
    for (const [re, kind] of AUTOCOMPLETE) if (re.test(token)) return kind;
  }

  if (type === 'email') return 'email';
  if (type === 'tel') return 'phone';

  const hint = [f.name, f.id, f.label].filter((s): s is string => typeof s === 'string').join(' ').toLowerCase().slice(0, 300);
  for (const [re, kind] of HINTS) if (re.test(hint)) return kind;
  return 'other';
}
