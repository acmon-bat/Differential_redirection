# Scoring Methodology: Design

**Status:** Design proposal, **not** a final algorithm. The numbers and weights here are placeholders that illustrate structure. They need agreement and calibration before implementation (Phase 3).

## 1. Objectives

1. **Transparent:** a user (or reviewer) can see exactly why a site got its result.
2. **Honest about uncertainty:** confidence is a first-class output, and unknown never counts as good.
3. **Versioned:** every assessment records `methodologyVersion`, so results can be reproduced and compared.
4. **Stable:** small evidence changes produce small score changes. Hard caps are used only for clear, serious failures.
5. **Useful:** the output drives practical guidance and is more than a number.

## 2. Three separate dimensions

The brief asks that these not be conflated:

| Dimension | Question | Output |
|---|---|---|
| **Website privacy posture** | How privacy-respecting does this site's observable behaviour and disclosure appear? | Score 0–100, grade A–F, category traffic lights |
| **User exposure / data-sharing risk** | Given that posture and what the page asks for, what should *this user* be careful about sharing *here*? | Per-data-type guidance (§6) |
| **Privacy-enhancing technologies (PETs)** | Is there credible evidence of techniques such as differential privacy? | A separate informational panel, with a small capped effect on the score (§7) |

**Proposal [D-13]:** the headline score and grade reflect **posture only**. Exposure is presented as guidance and does not move the headline number, though both draw on the same evidence. This avoids one site getting different grades depending on which page the user happens to be on.

## 3. Evidence model

Each evidence item carries the following.

- **Provenance** [D-6]:
  - `observed`: Plaster saw it directly in this browser, for example a third-party request or a missing HSTS header.
  - `disclosed`: the site states it, for example in a privacy policy, a consent banner, or well-known files the user visited.
  - `unknown`: Plaster could not determine it, either because it wasn't observable (capability profile) or wasn't observed.
- **Freshness:** `live` (this session) or `cached` (from the bundled knowledge base, with date and source).
  *Proposal:* treat "cached" as a freshness axis, separate from provenance. A cached fact is still either observed (by a dataset maintainer's crawl) or disclosed.
- **Reliability weight** (indicative): observed-live > observed-cached > disclosed-live > disclosed-cached. Unknown carries no positive weight.
- **Capability awareness:** if the browser or permissions can't observe a signal, the signal is `unknown (not observable)`, never "absent".

## 4. Categories (initial proposal)

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

## 5. Aggregation (structure, not numbers)

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

## 6. Personal information sharing guidance

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

## 7. Differential privacy and other PETs

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

## 8. Explanations

Every assessment contains `Explanation` records:

```
{ ruleId, ruleVersion, category, effect: "+3" | "-10" | "cap:F" | "confidence:-1",
  evidenceIds: [...], userText: "...", technicalText: "..." }
```

The UI shows `userText` by default and offers `technicalText` plus raw evidence on demand.

## 9. Versioning

- `methodologyVersion` uses semver. **Major** means the meaning of scores changes, **minor** means rules are added or reweighted, **patch** means fixes without intended score changes.
- The methodology is documented in this file, plus a machine-readable rule registry in `packages/core/src/scoring/` (Phase 3).
- A changelog of methodology versions is kept, with fixture snapshots showing score deltas for a reference set.

## 10. Calibration (Phase 3)

- Build a fixture set of recorded `RawSignals` for a diverse range of sites, from known-good to known-poor.
- Review results by hand. Calibrate weights so that grades match expert intuition and that "unknown" never improves the result.
- Publish the fixtures and expected outcomes alongside the methodology.
