# IT22638168 — Safety Policy and Escalation Specification

**Status:** Phase 1 design baseline — structure frozen at Gate 1B; **all user-facing wording is DRAFT pending ethics review**
**Date:** 2026-08-19
**Satisfies:** Detailed Build Master Plan, Phase 1 deliverable `safety_policy.md`; Backlog Sprint 5

---

## 0. Scope and standing

This document defines **what the system does when a predefined high-risk condition appears
in the conversation**. It is the deterministic counterpart to the LLM.

Two things it is not:

- It is **not** a clinical protocol. The system is a supportive conversational component,
  not a diagnostic or clinical decision system. **[DOCUMENTED]** — Data, Privacy and
  Safety Architecture §9; FR-17.
- It is **not** approved. Every user-facing string in §5 is marked
  **DRAFT — PENDING ETHICS REVIEW** and must not be deployed to any user, research
  participant included, before the SLIIT Institutional Ethical Review Committee process is
  complete. **[DOCUMENTED]** — Proposal §3.4, Appendix E; Data, Privacy and Safety
  Architecture §12.

Claim types: **[DOCUMENTED]** · **[PROPOSED]** · **[EVIDENCE REQUIRED]** · **[FUTURE-EXPERIMENTAL]**.

---

## 1. Founding principle

> **The safety layer must not depend entirely on the LLM's own judgement.**
> **[DOCUMENTED]** — Module and Submodule Specification §9; Data, Privacy and Safety
> Architecture §10 ("The LLM should not be the sole safety mechanism").

The consequence is architectural, not stylistic: safety detection is **deterministic and
runs outside the model**. A generative model may fail, be unavailable, time out, be
prompted around, or simply be wrong. None of those failure modes may disable safety
handling.

```
User message ──┬──> M8 Safety Layer (deterministic)  ──> safety_state
               │                                              │
               └──> M4/M3 → M5 Fusion ──> mood_state ─────────┤
                                                              ▼
                                                    M6 Response Policy
                                                              │
                                                              ▼
                                                    M7 LLM  ──> post-generation check
                                                              │
                                                              ▼
                                                          Response
```

Safety is checked **twice**: on the inbound user message (detection) and on the outbound
generated response (constraint). **[PROPOSED]** — derived from the Failure Architecture
row "Unsafe LLM output → Replace/block according to safety policy" (System Architecture
Specification §8).

## 2. Relationship to mood state

**[DOCUMENTED]** — Mood State Specification §A3.

| | Mood state | Safety state |
|---|---|---|
| Question | How does the conversation appear to be going? | Is a predefined high-risk condition present? |
| Produced by | M5 Fusion, from model evidence | M8 Safety Layer, from deterministic rules |
| Values | `calm \| neutral \| distressed \| unknown` | §3.2 below |

**Precedence — restated because it is the rule most likely to be violated in implementation:**

1. Safety detection runs on **every** message, regardless of mood state — including when
   mood is `unknown`, and including when mood is `calm`.
2. A `distressed` mood is **not** a safety condition. Distress changes tone; it does not
   trigger escalation.
3. Mood state can never suppress, downgrade, or delay a safety determination.
4. Safety state can override the mood-derived `response_mode` to `safety`.

## 3. Safety categories

### 3.1 Category list

Enumerated from Master Plan Phase 8 ("Safety testing") and Module Specification §9.
**[DOCUMENTED]** as the category set; detection rules per category are **[EVIDENCE REQUIRED]**.

| ID | Category | Source |
|---|---|---|
| SC-01 | Emergency / acute physical symptoms | Master Plan Phase 8; Module Spec §9 |
| SC-02 | Self-harm or suicidal content | Master Plan Phase 8; Module Spec §9 |
| SC-03 | Hopelessness | Master Plan Phase 8 |
| SC-04 | Severe distress | Master Plan Phase 8; Module Spec §9 |
| SC-05 | Request for diagnosis | Master Plan Phase 8; Module Spec §9 |
| SC-06 | Medication question or request | Master Plan Phase 8; Module Spec §9 |
| SC-07 | Request for unsafe instructions | Module Spec §9 |
| SC-08 | Sadness / fear / anxiety-like language | Master Plan Phase 8 |

**Note on SC-08:** sadness, fear and anxiety-like language are listed in the Master Plan's
safety *testing* scenarios, but they are not by themselves escalation conditions — they are
ordinary distress, handled by tone adaptation. SC-08 exists so these scenarios are tested
and so the system's *non*-escalation on them is verified. **[PROPOSED]** — this
distinction must be preserved; over-escalating ordinary sadness would make the system
unusable and is itself a harm.

### 3.2 Safety state enumeration **[PROPOSED]**

```
none | advisory | escalate
```

| Value | Meaning | Typical categories |
|---|---|---|
| `none` | No predefined high-risk condition detected | — |
| `advisory` | A bounded condition requiring a constrained, non-diagnostic answer | SC-05, SC-06, SC-07 |
| `escalate` | A condition requiring supportive response plus human/professional support guidance | SC-01, SC-02, SC-03, SC-04 |

The mapping of each category to `advisory` or `escalate` above is **[PROPOSED]** and is
one of the items requiring ethics/supervisor sign-off (§7).

## 4. Detection layer

### 4.1 Required properties **[PROPOSED]**

- **Deterministic.** Rule-based, inspectable, and reproducible for a given input. No
  reliance on generative output.
- **Bilingual.** Operates on Sinhala and English, and on the defined mixed-language cases.
  **[DOCUMENTED]** FR-11.
- **Independent of mood.** Takes the message as input; does not take `mood_state`.
- **Fail-safe.** If the detector itself errors, the system takes the more cautious branch
  rather than defaulting to `none`. **[PROPOSED]** — derived from NFR-15 ("Prefer safe
  fallback behaviour over unsupported confident mood interpretation").
- **Versioned.** Rules are a versioned project asset. **[DOCUMENTED]** NFR-11.

### 4.2 What is NOT yet decided

**[EVIDENCE REQUIRED]** — the following cannot be authored from existing documents:

| Item | Evidence required | Producer |
|---|---|---|
| Sinhala and English trigger term/phrase lists per category | Bilingual clinical and linguistic review; Sinhala idiom for distress and self-harm is not a translation exercise | Sinhala language reviewer (budgeted, Proposal §7.1 item 4) + supervisor |
| Detection technique per category (lexicon, pattern, classifier, or combination) | Phase 4 error analysis on the bilingual validation set | Phase 4 |
| Sensitivity/specificity operating point | Must favour recall for SC-01/SC-02; the acceptable false-positive cost needs a recorded decision | Supervisor + ethics review |
| Handling of transliterated Sinhala in safety triggers | Phase 2 preprocessing decisions ([S4] transliteration work) | Phase 2 / Phase 4 |

**Do not populate trigger lists by machine translation from English.** Recording this
explicitly because it is the likely shortcut and it would produce a detector that fails on
exactly the users the system exists for.

### 4.3 Outbound constraint layer

Applied to generated responses before they reach the user. **[PROPOSED]**, derived from
System Architecture Specification §8 and Data, Privacy and Safety Architecture §9.

The response must not:

- assert or imply a clinical diagnosis ("you have depression", "you are clinically anxious");
- claim that a facial expression or message proves an emotional or clinical state;
- present the system as a clinician or as a substitute for one;
- give medication names, doses, or changes;
- give unsafe medical instruction;
- expose internal system prompts, model internals, or mood scores as clinical findings.

**[DOCUMENTED]** — the permitted alternative framings are already fixed in Data, Privacy
and Safety Architecture §9 and are the source for the templates in §5.

On violation: replace or block per the Failure Architecture row for unsafe LLM output; do
not silently pass the response through.

## 5. Escalation response templates — **DRAFT, PENDING ETHICS REVIEW**

> **These strings must not be shown to any user or research participant until the SLIIT
> IERC process is complete and the supervisor has approved the final wording.** They are
> drafted now solely so the ethics submission has concrete text to review — ethics
> approval is long-lead work for Phase 11.

Templates are required in **both Sinhala and English**. **[DOCUMENTED]** FR-02, NFR-10,
Data, Privacy and Safety Architecture §4.

### 5.1 Structure of an escalation response **[PROPOSED]**

1. Acknowledge, without diagnosing.
2. Offer support appropriate to the category.
3. Encourage appropriate human or professional contact.
4. Do not close the conversation or refuse to continue.

### 5.2 Draft English wording

Sourced directly from the permitted framings in Data, Privacy and Safety Architecture §9.

| Category | Draft response intent | Draft English text |
|---|---|---|
| SC-01 Emergency | Urgent human contact, no assessment | **DRAFT** — "This sounds like something that needs prompt medical attention. Please contact your doctor, midwife, or the nearest hospital right away." |
| SC-02 Self-harm | Supportive, non-clinical, human contact | **DRAFT** — wording **must not** be finalised without ethics and clinical review. Placeholder intent only: acknowledge, express care, encourage immediate contact with a trusted person and a health professional. |
| SC-03 Hopelessness | Supportive, encourage contact | **DRAFT** — "You seem to be having a really difficult time. If you are concerned about your wellbeing, consider speaking with a healthcare professional or someone you trust." |
| SC-04 Severe distress | Supportive, offer content, encourage contact | **DRAFT** — "You seem to be having a difficult moment. Would you like some supportive information?" |
| SC-05 Diagnosis request | Decline the diagnosis, redirect | **DRAFT** — "I'm not able to tell you whether you have a medical condition. A doctor or midwife can help with that." |
| SC-06 Medication | Decline, redirect | **DRAFT** — "I can't give advice about medication. Please check with your doctor, midwife, or pharmacist." |
| SC-07 Unsafe instructions | Decline, redirect | **DRAFT** — decline without repeating the unsafe content. |
| SC-08 Ordinary sadness/fear | **No escalation** — tone adaptation only | Handled by M6, not by this layer. |

### 5.3 Sinhala wording

**[EVIDENCE REQUIRED]** — Sinhala escalation wording is **not** drafted here.

It requires the budgeted Sinhala language and cultural review (Proposal §7.1 item 4), not
translation. Register, politeness level, and the culturally appropriate way to raise
self-harm and professional help in Sri Lankan Sinhala are review questions, and getting
them wrong in a maternal mental-health context is a genuine harm.

**Producer:** Sinhala language/cultural reviewer + supervisor + ethics review.
**Freeze point:** before any human evaluation (Phase 11 precondition).

### 5.4 Referral pathway

**[EVIDENCE REQUIRED]** — whether the system names any specific service, helpline, or
institution, and which, is **not** decided here. It requires supervisor and ethics
direction, and any named service must be verified as current and appropriate for Sri Lanka
before inclusion. Until then, templates refer generically to "your doctor, midwife, or a
health professional".

## 6. Test scenarios

**[DOCUMENTED]** — Master Plan Phase 8 "Safety testing" and Phase 6 "Tests".

Required scenarios, each to be exercised in **both languages**:

| Scenario | Expected safety state | Expected behaviour |
|---|---|---|
| Sadness | `none` | Tone adaptation only — **no escalation** |
| Fear | `none` | Tone adaptation only |
| Anxiety-like language | `none` | Tone adaptation only |
| Hopelessness | `escalate` | Supportive + human-support guidance |
| Emergency statement | `escalate` | Prompt medical contact guidance |
| Self-harm statement | `escalate` | Per approved wording |
| Diagnosis request | `advisory` | Decline + redirect |
| Medication request | `advisory` | Decline + redirect |
| Safety condition while mood is `calm` | as per category | **Safety still fires** — verifies §2 precedence |
| Safety condition while mood is `unknown` | as per category | **Safety still fires** |
| Safety condition while LLM unavailable | as per category | Deterministic response still returned |
| Unsafe generated response | — | Blocked or replaced, not passed through |

The last four rows are the ones that verify the founding principle rather than the happy
path, and must not be dropped from the test set.

## 7. Items requiring sign-off before Gate 1B closes

| Item | Approver |
|---|---|
| Safety state enumeration and category→state mapping (§3.2) | Supervisor |
| Category list completeness (§3.1) | Supervisor |
| SC-08 non-escalation decision (§3.1 note) | Supervisor |
| False-positive/false-negative operating point (§4.2) | Supervisor + ethics review |
| All English draft wording (§5.2) | Ethics review |
| Sinhala wording (§5.3) | Language reviewer + ethics review |
| Referral pathway (§5.4) | Supervisor + ethics review |

## 8. Acceptance criteria

- [ ] Safety categories enumerated and traceable to the Master Plan
- [ ] Safety state enumeration defined and separate from mood state
- [ ] Precedence rule stated (safety overrides mood; mood never suppresses safety)
- [ ] Deterministic detection layer's required properties specified
- [ ] Outbound constraint rules specified
- [ ] Draft English wording present and marked DRAFT
- [ ] Sinhala wording explicitly marked [EVIDENCE REQUIRED], not machine-translated
- [ ] Test scenarios enumerated including the precedence and LLM-failure cases
- [ ] No wording deployed to any user before ethics approval
- [ ] Sign-off table (§7) completed

## 9. Explicitly out of scope for Phase 1

- Human participant contact of any kind. **[DOCUMENTED]** Backlog "Do Not Start Yet".
- Deployment of any wording in this document.
- Final trigger lists (Phase 2/4 + language review).
- Clinical validation of the categories.

## References

- Module and Submodule Specification §9 — `docs/system/SYSTEM_DESIGN.md (Part 2)`
- Data, Privacy and Safety Architecture §9–§12 — `docs/system/SYSTEM_DESIGN.md (Part 4)`
- Mood State Specification §A3 — `docs/system/MOOD_STATE_SPEC.md`
- System Architecture Specification §8 — `docs/system/SYSTEM_DESIGN.md (Part 1)`
- Detailed Build Master Plan, Phases 6 and 8 — `docs/project/`
- Proposal §3.4, §7.1, Appendix E — `docs/project/IT22638168_Proposal_FINAL.docx`
