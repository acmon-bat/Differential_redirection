export * from './types.ts';
export { assess, assessSnapshot, ENGINE_VERSION, METHODOLOGY_VERSION, type AssessOutcome } from './assess.ts';
export { validateSnapshot, LIMITS } from './validate.ts';
export { detectDisclosureClaims, petFinding, MAX_DISCLOSURE_TEXT } from './disclosures.ts';
export { normaliseHost, parseOrigin, registrableDomain, isThirdParty } from './domains.ts';
export { CHECKS } from './checks.ts';
export { CATEGORY_META, GRADE_THRESHOLDS, gradeFor } from './scoring.ts';
export { DATA_TYPE_META } from './guidance.ts';
export { classifyField, type FieldDescriptor } from './fields.ts';
