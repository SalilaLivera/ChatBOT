# C5 — ratio bounds proposal

**Status: ✅ signed by the owner, 2026-08-30.** `LOW = 0.1`, `HIGH = 0.6` — unchanged from the
proposal below. Per `C5_PLAN.md` §2 / §5.4, the backend did not choose these numbers; it
proposed them here, with the rationale and a small labelled sample, and the owner approved
them as-is.

`LANGUAGE_SI_RATIO_HIGH` / `LANGUAGE_SI_RATIO_LOW` in `.env.example` and `src/config/env.ts`
carry the signed values. The `mixed` band's routing (currently identical to `other` — see
`src/language/policy.ts`) is the **signed SAFE DEFAULT pending ML measurement** — not
permanent, and never silently upgraded to `si`.

## Owner sign-off, 2026-08-30

> Signed by the project owner, 2026-08-30. This is **judgement, not measurement** — no
> boundary case was tested; the labelled sample below has no ratio between 0.2 and 0.808.
> `HIGH = 0.6` is an **unmeasured bet on SinBERT's tolerance for embedded Latin**. `HIGH` was
> **deliberately not raised to 0.9**, because that would discard ordinary Sinhala containing
> English acronyms and remove the recovery path for FER's **measured 24.3% distress miss
> rate**. `mixed → face-only` is the **SAFE DEFAULT PENDING ML MEASUREMENT**, not permanent.
>
> A habitually code-switching user receives NO text evidence in any turn, and is therefore
> exposed to FER's 24.3% distress miss rate with no recovery path. This is a KNOWN, ACCEPTED,
> TEMPORARY exposure pending the ratio-sweep measurement.

## ML-track corrections to this proposal (received with the ruling)

**(a) The labelled sample does not test either boundary.** Nothing in it falls between `0.2`
and `0.808` — the sample shows the extremes (pure Sinhala, pure English/Singlish) behave
sensibly, but it gives **no evidence about where the lines themselves belong**. This document
must not be read as though the sample validated `0.1` / `0.6` — it validates only that neither
number misclassifies an extreme case in the sample.

**(b) `HIGH` is a distribution question, not a language question.** It decides how much Latin
text SinBERT is asked to swallow inside a message still classified `si` — a question about the
model's tolerance for code-mixed input, on a model whose code-mixed behaviour is **unmeasured**.
It is not settled by reasoning about what "real Sinhala" looks like.

## The two numbers proposed

| symbol | proposed value | meaning |
|---|---|---|
| `LANGUAGE_SI_RATIO_HIGH` | **0.6** | `sinhalaRatio >= 0.6` → classified `si` |
| `LANGUAGE_SI_RATIO_LOW` | **0.1** | `sinhalaRatio <= 0.1` → classified `other`. Between the two → `mixed` |

## Rationale

- Real Sinhala Unicode text — including messages with embedded digits, English proper nouns,
  emoji, or punctuation-heavy chat style — should land comfortably above `0.6`, because the
  denominator excludes non-letter characters and the vast majority of *letters* in a genuinely
  Sinhala message are Sinhala-script. `0.6` leaves headroom below `1.0` for exactly this kind of
  incidental Latin content (a name, an emoji shortcode) without misclassifying real Sinhala as
  `mixed`.
- English (and Singlish, which is Latin-script indistinguishable from English to a script test —
  §5.6.1) score **exactly `0.0`** — the §8.2 failure this phase exists to catch. `0.1` is
  comfortably above `0.0`, so ordinary English text is never accidentally pulled into `mixed` by,
  e.g., a single stray Sinhala character from a copy-pasted emoji variation selector or a
  mis-encoded byte.
- The gap between `0.1` and `0.6` is deliberately wide rather than a single cutoff, so that
  genuinely code-switched messages (§5.6.8, e.g. *"mata හරිම amaruyi today"*) land in `mixed`
  rather than being forced into `si` or `other` by a single narrow threshold — the point of a
  `mixed` band is to make that case visible and deliberately routed, not silently absorbed by
  whichever side a single cutoff happens to favour.
- Both numbers are round, easy to reason about, and were not fit to any dataset — no labelled
  Sinhala/English/code-switched corpus with a ground-truth ratio distribution currently exists
  for this project to fit against. **This is a proposal to be sanity-checked against real
  messages, not a calibrated result.**

## Labelled sample

Ratios computed by `detectLanguage()` (letters-only denominator; Sinhala block U+0D80–U+0DFF).

| message | sinhala ratio | classification @ (0.1, 0.6) | notes |
|---|---|---|---|
| `"I feel anxious about the appointment today."` | 0.000 | `other` → face-only | the §8.2 English trap |
| `"mama gedara yanawa"` (Singlish) | 0.000 | `other` → face-only | indistinguishable from English to a script test (§5.6.1) — deferred, routes face-only per §6 |
| `"මට අද හරිම බයයි."` (native Sinhala) | 1.000 | `si` → sentiment | all letters Sinhala |
| `"මට COVID එකෙන් පස්සේ දුක හිතුනා."` (Sinhala + one English acronym) | 0.808 | `si` → sentiment | `COVID` is 5 Latin letters against 21 Sinhala letters (26 total); still clearly Sinhala |
| `"mata හරිම amaruyi today"` (code-switched, §5.6.8's own example) | 0.200 | `mixed` → routed as `other` for now (undefined until sign-off) | 4 Sinhala letters (හරිම) out of 20 total letters |
| `"😊👍123"` (emoji + digits only) | 0/0 → **0.000** | `other` → face-only | degenerate case (§3.2/D-26): zero letter characters, defined not crashed |
| `""` (empty string) | 0/0 → **0.000** | `other` → face-only | same degenerate case |

## What is NOT decided by this document

- Whether `mixed` should ultimately route to `sentiment`, `face_only`, or something else — that
  is exactly the question the sign-off answers. Until then, C5 routes `mixed` identically to
  `other` (safe default: no LLM, no network call, no sentiment forward pass on text the model
  may not handle).
- The exact numeric values above — they are a starting proposal, not a measurement. Owner may
  pick different numbers entirely; the detector (`src/language/detect.ts`) is parameterised by
  configuration precisely so that changing them requires no code change.
