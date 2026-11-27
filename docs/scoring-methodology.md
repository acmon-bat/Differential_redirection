# Scoring Methodology

**Current version: 0.3.0** (`METHODOLOGY_VERSION` in `packages/core/src/assess.ts`).

This document has two parts:
- **Part 1, Methodology 0.3.0 as implemented.** This is the authoritative description. Where Part 1 and the code differ, the code is authoritative and Part 1 is a bug.
- **Part 2, Original design proposal (Phase 0).** Kept for history. Part 1.10 lists where the implementation departed from it.

> **Not calibrated.** The weights, thresholds and caps below are explainable judgement calls. They have **not** been calibrated against, or validated on, real-world websites. Plaster has so far been tested only against local fixture pages.

---

## Part 1: Methodology 0.3.0 (implemented)

Source of truth: `packages/core/src/checks.ts` (rules and caps), `scoring.ts` (aggregation, confidence, grade display), `guidance.ts`, `disclosures.ts`.

### 1.1 Three separate outputs

| Output | Question | How |
|---|---|---|
| **Privacy risk** (`score`, `grade`, category lights) | How privacy-respecting does the *observed* behaviour look? | Weighted mean of check scores over scored categories (§1.3) |
| **Evidence quality** (0–100%) | How much of the assessment rests on reliable evidence? | Applicable check weight × evidence reliability (§1.4) |
| **Confidence** (high / medium / low) | How far should the risk result be trusted? | Evidence quality, scoring coverage, required categories and observation window (§1.5) |

Risk is never computed from evidence quality or confidence. Confidence only decides **whether and how** the risk result is shown (final, provisional or withheld). A site can have a good risk score with low confidence.

### 1.2 Check outcomes

| Outcome | Score | Effect |
|---|---|---|
| `pass` / `partial` / `fail` | 1 / (0,1) / 0 | Counts towards risk, and towards evidence quality weighted by reliability |
| `unknown` | none | Never credited as a pass or failure. Excluded from risk; counts as zero evidence. |
| `not-applicable` | none | Excluded entirely (e.g. HSTS on an HTTP page) |

### 1.3 Checks, weights and grades

| Category (weight) | Check | Weight | Scoring |
|---|---|---|---|
| Connection security (25) | Page served over HTTPS | 3 | pass/fail |
| | HSTS | 1 | pass/fail; N/A on HTTP |
| | No insecure subresources | 2 | pass/fail; N/A on HTTP |
| | Forms submit securely | 3 | fail if any form is on an HTTP page, or posts to `http://`; N/A without forms |
| Tracking & third parties (30) | Known advertising trackers | 3 | 0 → 1, 1 → 0.5, 2–3 → 0.25, ≥4 → 0 |
| | Known session-replay scripts | 3 | none → 1, any → 0 |
| | Known analytics services | 1 | 0 → 1, 1 → 0.7, 2 → 0.4, ≥3 → 0.1 |
| | Known fingerprinting vendors | 2 | none → 1, any → 0 |
| | Number of third-party domains | 2 | ≤2 → 1, ≤5 → 0.7, ≤10 → 0.4, ≤20 → 0.2, else 0 |
| Personal data collection (15) | Sensitive fields alongside trackers | 3 | replay → 0, advertising → 0.4, analytics → 0.7, none → 1 (the triggering evidence is linked) |
| | Where sensitive forms submit | 2 | same site → 1, cross-site → 0.5, script-submitted → **unknown** |
| Cookies (10) | Third-party cookies | 2 | 0 → 1, 1–3 → 0.5, more → 0 |
| | Cookie lifetimes (> 13 months) | 1 | 1 − share of long-lived cookies |
| | Cookie security attributes | 1 | share with Secure (on HTTPS) and explicit SameSite |
| Browser-side protections (10) | Content Security Policy | 1 | present → 1, absent → 0 (directives not evaluated) |
| | Referrer policy | 1 | strict → 1; absent (header visible) → 0.6, since browsers default to strict-origin-when-cross-origin; `origin` / `origin-when-cross-origin` → 0.6; `unsafe-url` / `no-referrer-when-downgrade` → 0 |
| | Permissions Policy | 0.5 | present → 1, absent → 0.5 |
| Transparency (10) | Privacy policy link | 1 | pass/fail (heuristic reliability) |

- **Category score** = 100 × Σ(weight × score) / Σ(weight) over evaluated checks.
- **Insufficient evidence:** a category is `insufficient-evidence` (grey, unscored) when less than 50% of its applicable weight was evaluated.
- **Traffic lights:** ≥ 75 green, ≥ 50 amber, below 50 red, grey when unscored. A scored category below 75% evidence quality is flagged `limitedEvidence` and shown as an outlined light with a "limited visibility" badge.
- **Overall score** = category-weighted mean over *scored* categories.
- **Grades:** A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, F below 40. There is no E.

### 1.4 Evidence reliability

| Evidence | Reliability |
|---|---|
| Observed, full capability | 1.0 |
| Cached (bundled tracker classification) | 0.8 |
| Observed, partial capability (e.g. Resource Timing) | 0.7 |
| Observed through a heuristic detector (privacy-policy link) | 0.7 |
| Disclosed (site's own claims) | 0.6 (PET panel only; never scored in 0.x) |
| Unknown | 0 |

A tracker finding takes the **minimum** of request visibility and cached classification reliability.

### 1.5 Confidence, caps and what is shown

**Confidence:**
1. Evidence quality ≥ 75% gives **high**, ≥ 50% gives **medium**, otherwise **low**.
2. Forced to **low** if less than **75%** of applicable category weight is scored. Coverage = Σ weight of categories with status `scored` ÷ Σ weight of categories that are not `not-applicable`. For example, with no forms, Data collection (15) leaves the denominator.
3. Forced to **low** if **Tracking & third parties** is not `scored`. A category is `scored` when at least 50% of its applicable check weight was evaluated (not unknown). In practice, tracking is assessed when the adapter observed third-party requests (capability `available` or `partial`).

Items 2 and 3 are the approved display conditions (Q-6); they are verified by tests `REVIEW R8` and `Q-6`.
4. Downgraded one level if observation did not cover the page load.

**Display:**
- **High confidence:** final grade.
- **Medium confidence:** provisional grade.
- **Low confidence:** score and grade withheld. The only exception is an F cap, which shows the letter F with no score.

**Hard caps** are maxima for high-certainty observed failures. These are *initial, judgement-based thresholds, not empirically calibrated values* (approved, Q-4):
- **Page not served over HTTPS:** maximum 69 (grade C).
- **Password or payment field that cannot be submitted securely:** maximum 39 (grade F). On an HTTP page this applies to *every* form, even one whose action is `https://`, because the page itself can be altered in transit.

A cap is a ceiling, not a determination. When the computed score exceeds a cap, the shown score is the cap value and `scoreCapped` is set; the UI shows "(capped)".

### 1.6 What "unknown is neutral" does and does not guarantee

Plaster must not treat missing evidence as proof of good **or** bad privacy. With a single score, that has a consequence: leaving an unobserved category out of a neutral average **can raise the score** if that category would have been bad. No neutral point score can avoid this. The only way to rule it out entirely is to assume the worst for every unknown, which would treat missing evidence as bad.

0.3.0 therefore guarantees the following:

| Property | Status |
|---|---|
| An unknown check is never credited as a pass (no score; zero evidence) | By construction; unit tests |
| Removing evidence never raises evidence quality or confidence | Property test over fixtures (every signal) |
| If tracking cannot be assessed, or less than 75% of category weight is scored, no grade is shown | By construction; regression test R8 |
| Removing any one signal never improves the presented grade letter or its status (final / provisional / withheld) | Property test over the two reference fixtures (R8) |
| **Not guaranteed:** that the numeric score never rises when evidence is removed | **Not guaranteed.** Excluding a minor category can move the score a few points in either direction (fixtures: up to +4 within the same grade). The reduced evidence quality and confidence are shown alongside it. |

### 1.7 Personal-information guidance

There are nine data types and four levels: *reasonable to share*, *share with caution*, *prefer an alternative*, *avoid sharing*. Rules raise the level, and the most severe rule wins:

- **Insecure page:** high-sensitivity types, or any type requested on the page, go to *avoid*; others go to *caution*.
- **Known session replay:** high-sensitivity types go to *prefer an alternative*; others go to *caution*. **Passwords go to *caution***, since there is no alternative to entering one, and major replay vendors document masking password inputs by default.
- **Advertising trackers:** email and phone go to *prefer an alternative*. These identifiers are widely used, typically hashed, for cross-platform ad matching.
- **Cross-site form submission** for the requested type: *caution*.
- **Third parties unobservable:** at least *caution*. "Reasonable to share" is never given without third-party visibility.
- **Baseline *caution*:**
  - health, a special category under UK/EU GDPR Art. 9;
  - government ID, which is highly sensitive (not an Art. 9 category) and can enable identity fraud.

Each item carries reasons, a practical tip, evidence links and the overall confidence.

### 1.8 Known limitations of 0.3.0

1. **Uncalibrated.** Weights, thresholds and caps are judgement calls. They have not been fitted to, or validated against, a labelled set of real sites.
2. **Tracker knowledge is a ~40-domain demonstration seed.** Absence from the list is not evidence of being benign.
3. **First-party CDNs on other domains count as third parties.** Entity grouping by owner is not implemented.
4. **Public-suffix data is a subset.** Sites under unlisted multi-label suffixes may be grouped incorrectly.
5. **Counting is coarse.** Domain counts treat a font CDN and an ad exchange alike, apart from the tracker-specific checks.
6. **Double counting.** A vendor in two categories (e.g. Hotjar: session replay and analytics) affects both checks. Session replay also appears in the tracking category, the data-collection category and guidance.
7. **Snapshot in time:** activity after the popup opens is not seen.
8. **The privacy-policy link check rewards presence, not quality.**
9. **Observable posture only:** server-side practices (retention, sale of data, breaches) are invisible.
10. **Score monotonicity is not guaranteed** under evidence removal (§1.6).
11. **A clean site seen with partial visibility can show a provisional A (100).** It is flagged, but this remains an open question (review §2.1).
12. **The cap levels (C 69, F 39) and the 75% coverage threshold are initial, judgement-based values,** approved by the owner on 2026-11-25 (Q-4, Q-6). They are not empirically calibrated.

### 1.9 Changelog

| Version | Change | Reason (review finding) |
|---|---|---|
| 0.3.0 | No grade unless ≥ 75% of applicable category weight is scored (was 50%), and tracking is required | R8: a tracker-heavy site whose trackers were unobservable showed **A (91)** instead of **C (65)** |
| 0.3.0 | The data-collection check links the evidence that triggered it | R9: advertising-triggered results linked session-replay evidence |
| 0.3.0 | `scoreCapped` flag; UI and CLI mark capped scores | R10: a cap ceiling looked like a computed score |
| 0.3.0 | The ad-matching guidance applies to email and phone only | R11: overstated for date of birth and government ID |
| 0.2.0 | Every form on an HTTP page counts as insecure; F cap regardless of the form's action | R1: an HTTP login page posting to HTTPS scored **A (88)** |
| 0.2.0 | Cap: not HTTPS gives at most C (69) | R2: HTTP-only sites could score A |
| 0.2.0 | No numeric score at low confidence; only an F cap shows a letter | R3 |
| 0.2.0 | Referrer-policy and CSP explanations corrected | R4 |
| 0.2.0 | `limitedEvidence` flag and UI indicator | R5 |
| 0.2.0 | Password guidance under session replay; GDPR wording | R6, R7 |
| 0.1.0 | Initial implementation | — |

### 1.10 Where the implementation departed from the original design

| Topic | Original design (Part 2) | Implemented 0.3.0 | Why |
|---|---|---|---|
| Unknown handling | Recommended substituting a neutral-to-pessimistic default score (e.g. 50) for unknown categories | Excluded from the score, with coverage-gated display and a required tracking category | A fixed default pulls good sites down *and bad sites up*, so it isn't neutral either. Exclusion plus gating keeps blind spots from producing a shown grade (§1.6). |
| Grade scale | A–F including E (E ≥ 25) | A, B, C, D, F (no E) | Decision D-13 |
| Categories | Included "Transparency and controls" and "Cookies and storage" | Six categories (§1.3) | Limited to signals an `activeTab` extension can observe |
| PET / DP effect | Small capped bonus at L3/L4 | Score effect 0 (informational only) | Decision D-14; DP cannot be verified from a browser |
| Caps | Example: password on non-HTTPS gives F | F for insecure credentials, plus C for any HTTP page | Review findings R1, R2 |
| Low confidence | Grade provisional or withheld | Score always withheld; letter only for an F cap | Review finding R3 |
| Calibration | Planned fixture corpus and expert review (Phase 3) | **Not done** | Remaining release blocker for any claim of accuracy |

---

## Part 2: Original design proposal (Phase 0, historical)

> Written before implementation. Retained to show how the methodology was designed. **Where it conflicts with Part 1, Part 1 applies.** Numbers here were placeholders.

### D1. Objectives

1. **Transparent:** a user (or reviewer) can see exactly why a site got its result.
2. **Honest about uncertainty:** confidence is a first-class output, and unknown never counts as good.
3. **Versioned:** every assessment records `methodologyVersion`, so results can be reproduced and compared.
4. **Stable:** small evidence changes produce small score changes. Hard caps are used only for clear, serious failures.
5. **Useful:** the output drives practical guidance and is more than a number.

### D2. Three separate dimensions

The brief asks that these not be conflated:

| Dimension | Question | Output |
|---|---|---|
| **Website privacy posture** | How privacy-respecting does this site's observable behaviour and disclosure appear? | Score 0–100, grade A–F, category traffic lights |
| **User exposure / data-sharing risk** | Given that posture and what the page asks for, what should *this user* be careful about sharing *here*? | Per-data-type guidance (§6) |
| **Privacy-enhancing technologies (PETs)** | Is there credible evidence of techniques such as differential privacy? | A separate informational panel, with a small capped effect on the score (§7) |

**Proposal [D-13]:** the headline score and grade reflect **posture only**. Exposure is presented as guidance and does not move the headline number, though both draw on the same evidence. This avoids one site getting different grades depending on which page the user happens to be on.

### D3. Evidence model

Each evidence item carries the following.

- **Provenance** [D-6]:
  - `observed`: Plaster saw it directly in this browser, for example a third-party request or a missing HSTS header.
  - `disclosed`: the site states it, for example in a privacy policy, a consent banner, or well-known files the user visited.
  - `unknown`: Plaster could not determine it, either because it wasn't observable (capability profile) or wasn't observed.
- **Freshness:** `live` (this session) or `cached` (from the bundled knowledge base, with date and source).
  *Proposal:* treat "cached" as a freshness axis, separate from provenance. A cached fact is still either observed (by a dataset maintainer's crawl) or disclosed.
- **Reliability weight** (indicative): observed-live > observed-cached > disclosed-live > disclosed-cached. Unknown carries no positive weight.
- **Capability awareness:** if the browser or permissions can't observe a signal, the signal is `unknown (not observable)`, never "absent".

### D4. Categories (initial proposal)

| Category | Example evidence | Primary provenance |
|---|---|---|
| **Tracking and third parties** | Count and type of third-party domains, known tracker entities, cross-site cookies, session replay or fingerprinting scripts (known lists) | Observed + cached |
| **Transport and security hygiene** | HTTPS, HSTS, mixed content, password or payment forms on insecure origins, cross-origin form actions | Observed |
| **Data collection surface** | Sensitive form fields requested (password, payment, ID, health, DOB), autofill tokens, third-party scripts on pages with sensitive fields | Observed |
| **Cookies and storage** | Cookie count, lifetime, third-party cookies, partitioning | Observed |
| **Transparency and controls** | Privacy policy link present, consent mechanism present, honouring of GPC (if knowable without fetch) | Observed + disclosed |
| **Browser-side protections** | Referrer-Policy, Permissions-Policy, CSP present | Observed |
| **Privacy-enhancing technologies** | See §7 | Disclosed / cached (rarely observable) |

Each category yields:
- a category score from 0 to 100, or `insufficient evidence`;
- a traffic light: 🟢 good / 🟡 caution / 🔴 concern / ⚪ unknown;
- a category confidence;
- explanations listing every rule that fired, with evidence references.

### D5. Aggregation (structure, not numbers)

```
category_score_c   = f_c(evidence)                     # rule-based, each rule documented
overall_raw        = Σ w_c · category_score_c           # over categories with sufficient evidence
unknown_adjustment = penalty for unknown categories     # pulls toward a pessimistic prior, never up
overall            = min(overall_raw + unknown_adjustment, caps)
confidence         = g(coverage, provenance mix, capability profile, observation window, data age)
```

Design rules:

1. **Rules, not models.** Each rule is a small declarative function with an ID, a description, inputs, an output and a rationale. No machine-learned weights.
2. **Unknown handling (I-8).** A category without sufficient evidence is scored against a **neutral-to-pessimistic prior** (placeholder: 50) and reduces confidence. It is never excluded in a way that raises the average. *Options under discussion:* (a) prior substitution, (b) exclusion plus a confidence penalty, (c) exclusion plus a score cap. **Recommendation:** (a), because it is the simplest to explain and can't inflate a score.
3. **Hard caps** for serious, high-certainty failures. Placeholder example: a password field on a non-HTTPS origin caps the grade at **F**.
4. **Bonuses are rare and capped.** Good behaviour mostly shows up as the absence of penalties on *observed* evidence. Disclosed claims can add only bounded credit.
5. **Grade mapping (placeholder):** A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, E ≥ 25, F < 25. *(Whether to use E is open: US-style A–F usually omits E. D-13.)*
6. **Low confidence:** when confidence is `low`, show the grade as *provisional* or withhold it, with an explanation of what is missing [D-13].
7. **Determinism:** the same evidence plus the same methodology and knowledge versions always give the same result. This is covered by fixture-based tests.

### D6. Personal information sharing guidance

For each data type, Plaster gives one of four levels:

| Level | Meaning |
|---|---|
| ✅ Reasonable to share if needed | No specific concerns observed for this data type |
| 🟡 Share with caution | Consider minimising, for example by leaving optional fields blank |
| 🟠 Prefer an alternative | Use an alias, masked card, or burner number, or choose another site |
| 🔴 Avoid sharing | Serious observed concern, such as a payment field on an insecure origin |

**Data types (initial):** email, phone, full name, postal address, date of birth, location, payment card, bank details, government ID, health information, password, photos or biometrics, contacts.

**Inputs:** posture categories, especially tracking near sensitive fields and transport security; page context (which field types are present, using structure only); data-type sensitivity (static table); and confidence.

**Output for each data type:** level, short reason, practical tip ("Consider an email alias"), evidence links, and confidence. Guidance must not be more certain than the evidence supports.

### D7. Differential privacy and other PETs

Principles (S-8):

- DP is almost never **observable** from a browser extension. Evidence will usually be *disclosed* (technical documentation stating the mechanism and parameters) or *cached* (curated research entries).
- Vague wording ("anonymised", "aggregated", "de-identified", "privacy-preserving") is **not** evidence of DP. At most it is recorded as a disclosed, unverified claim with no score effect.
- Credible DP evidence should name the mechanism or scope (which data and which product) and ideally parameters such as ε, δ, or the privacy unit. It should also come from a primary source such as an engineering publication or official documentation.

Proposed evidence ladder (all `disclosed` or `cached`):

| Level | Description | Score effect (placeholder) |
|---|---|---|
| L0 | No claim | None (absence is neutral, not penalised: most sites have no reason to use DP) |
| L1 | Vague claim ("aggregated/anonymised") | None; shown as "unverified claim" |
| L2 | Explicit DP claim, no mechanism or parameters | None or negligible; informational |
| L3 | DP with documented scope and mechanism | Small bonus, ≤ +2 |
| L4 | L3 plus published parameters (ε, unit) or independent verification | Bonus ≤ +3 overall |

The PET contribution is **capped** and can never offset an observed hard-cap failure. It shows in its own panel so it does not dominate the assessment. *(Whether DP absence should ever matter for specific site categories, such as large-scale analytics platforms, is a research question for Phase 9.)*

### D8. Explanations

Every assessment contains `Explanation` records:

```
{ ruleId, ruleVersion, category, effect: "+3" | "-10" | "cap:F" | "confidence:-1",
  evidenceIds: [...], userText: "...", technicalText: "..." }
```

The UI shows `userText` by default and offers `technicalText` plus raw evidence on demand.

### D9. Versioning

- `methodologyVersion` uses semver. **Major** means the meaning of scores changes, **minor** means rules are added or reweighted, **patch** means fixes without intended score changes.
- The methodology is documented in this file, plus a machine-readable rule registry in `packages/core/src/scoring/` (Phase 3).
- A changelog of methodology versions is kept, with fixture snapshots showing score deltas for a reference set.

### D10. Calibration (Phase 3)

- Build a fixture set of recorded `RawSignals` for a diverse range of sites, from known-good to known-poor.
- Review results by hand. Calibrate weights so that grades match expert intuition and that "unknown" never improves the result.
- Publish the fixtures and expected outcomes alongside the methodology.
