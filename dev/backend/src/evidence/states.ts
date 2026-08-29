/**
 * The fixed three-state order (MOOD_STATE_SPEC.md A4 / fusion contract.py
 * SUBSTANTIVE_STATES). ORDER IS LOAD-BEARING wherever an ordered array or a
 * `scores` object is built — fusion checks the key ORDER, not just the set.
 */
export const SUBSTANTIVE_STATES = ['calm', 'neutral', 'distressed'] as const;

export type SubstantiveState = (typeof SUBSTANTIVE_STATES)[number];

export type Scores = Record<SubstantiveState, number>;

/**
 * Argmax over the three substantive states, ties broken by the FIRST maximum
 * in SUBSTANTIVE_STATES order (calm, neutral, distressed) — identical
 * semantics to fusion's own `argmax_state()` (dev/fusion/fusion/contract.py),
 * which matches numpy argmax. A different tie-break would disagree with
 * fusion on an exact tie and reject a perfectly valid response.
 */
export function argmaxState(scores: Scores): SubstantiveState {
  let bestState: SubstantiveState = SUBSTANTIVE_STATES[0];
  let bestValue = scores[bestState];
  for (const state of SUBSTANTIVE_STATES.slice(1)) {
    const value = scores[state];
    if (value > bestValue) {
      bestValue = value;
      bestState = state;
    }
  }
  return bestState;
}
