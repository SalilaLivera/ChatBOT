# `src/llm` — M7 conversational response

The LLM pipeline. **Not wired to any route** — C6 orchestration calls
`LlmService.generate()`; this module never reaches into C6.

```
buildMessages → provider → parse → sanitise → outboundFilterPartial → content | fallback
```

## ⛔ Two gates that are closed

**D-6 — third-party inference provider.** Sending pregnancy-domain user messages
to Groq is a **privacy/ethics decision that is UNRESOLVED**. `LLM_PROVIDER`
defaults to `mock`; enabling `groq` requires an explicit name *and* a key *and*
a model. `describeProvider().d6Gate` reports which side of the gate the process
is on. Possessing an API key is capability, not approval.

**B-1 — `response_mode` cannot be computed.** ⛔ **This is a C6 DEPENDENCY, not
an LLM one, and no value is invented here.**

`MOOD_STATE_SPEC` §A3.3 makes `response_mode` the output of **M6, the Adaptive
Response Policy**, computed from `mood_state` **and** `safety_state`. Neither
input is available:

| | status |
|---|---|
| `safety_state` (M8) | ⛔ cannot be built — trigger lists are `[EVIDENCE REQUIRED]`, needing bilingual clinical review; escalation wording is `DRAFT PENDING ETHICS REVIEW` |
| M6's mood→`response_mode` mapping | ⛔ **never authored** |

`response_mode` is a required field of the live frontend contract, and D-5
forbids setting `safety_state = "none"` — that claims a detector ran and found
nothing, when no detector exists. **"Safety not evaluated" and "safety found
nothing" are different claims, and only the first is true.**

**C6 must resolve this before any chat route is correct.** Proposed resolution
in `docs/plan/backend/LLM_INTEGRATION_PLAN.md` §13 (B-1). This module produces
only `message` and `sections`; `response_mode`, `mood`, `content_suggestion`,
`message_id`, `session_id` and `language` are all application-controlled and are
assembled by the caller.

## What the LLM never receives

FER probabilities · fused scores · `confidence` · `modalities_used` · `W_face`,
`W_text`, any `τ` · internal reasons · model versions · **content IDs, titles or
URLs**. The mood enum is consumed by `prompt.ts` and converted to a style
directive; no state name reaches the model.

## Files

| file | role |
|---|---|
| `provider.ts` | the abstraction. Nothing provider-shaped crosses it |
| `providers/mock.ts` | deterministic, **no network**. The default |
| `providers/groq.ts` | adapter. Injected `fetch`; `#apiKey` is ECMAScript-private so `JSON.stringify` cannot serialise it |
| `factory.ts` | the D-6 gate. `mock` unless explicitly overridden |
| `contract.ts` | `ChatResponse`, caps, and the supportive-content boundary |
| `parse.ts` | schema validation. One structural repair, then fail |
| `sanitise.ts` | restricted Markdown. **Authoritative** — the frontend is defence in depth |
| `outboundFilterPartial.ts` | SAFETY_POLICY §4.3, **partially**. `coverage()` reports the gap |
| `prompt.ts` | mood→tone, system/user boundary |
| `service.ts` | the composed pipeline. **Never throws** |

Tests: `test/unit/llm/` — 109 covering all of the above.
