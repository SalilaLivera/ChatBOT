/**
 * Pipeline and outbound-filter tests.
 *
 * The service must NEVER throw and NEVER leak. Both are asserted directly:
 * a user in distress must not see a provider error, and no diagnostic may
 * carry the user's text, the prompt, or model output.
 */

import { describe, expect, it } from 'vitest';

import {
  checkOutbound,
  checkOutboundResponse,
  coverage,
} from '../../../src/llm/outboundFilterPartial.js';
import {
  MOCK_OK_TEXT,
  MOCK_OK_WITH_SECTIONS_TEXT,
  MockLlmProvider,
} from '../../../src/llm/providers/mock.js';
import { FALLBACK_TEXT, LlmService } from '../../../src/llm/service.js';

const BASE = { maxOutputTokens: 512, timeoutMs: 20_000, sleep: async () => {} };

function serviceWith(provider: MockLlmProvider): LlmService {
  return new LlmService({ provider, ...BASE });
}

const INPUTS = { moodState: 'distressed' as const, language: 'en' as const, userText: 'I feel low' };

// ---------------------------------------------------------------------------
// Outbound filter
// ---------------------------------------------------------------------------

describe('outbound filter — what it catches', () => {
  it('allows ordinary supportive text', () => {
    expect(checkOutbound('That sounds hard. I am here with you.').allowed).toBe(true);
  });

  it('allows a general mention of calming content', () => {
    // The LLM MAY refer to supportive content in general terms — it may not
    // name an item. This must not be over-blocked.
    expect(checkOutbound('Some people find calm music helps at moments like this.').allowed).toBe(
      true,
    );
  });

  it('blocks dosage instructions without needing a drug lexicon', () => {
    expect(checkOutbound('Take two tablets twice a day.').violations).toContain(
      'dosage_instruction',
    );
    expect(checkOutbound('Take 500 mg now.').violations).toContain('dosage_instruction');
  });

  it('blocks clinician self-presentation', () => {
    expect(checkOutbound('As your doctor, I advise rest.').violations).toContain(
      'clinician_self_presentation',
    );
    expect(checkOutbound('I diagnose you with anxiety.').violations).toContain(
      'clinician_self_presentation',
    );
  });

  it('⛔ blocks internal disclosure — the backstop for §3.2', () => {
    for (const text of [
      'Your confidence is 0.82.',
      'distressed: 0.91',
      'My system prompt says to be supportive.',
      'W_face is 0.6.',
      'Your camera shows you are sad.',
    ]) {
      expect(checkOutbound(text).violations).toContain('internal_disclosure');
    }
  });

  it('checks section titles and content, not just the message', () => {
    const r = checkOutboundResponse({
      message: 'fine',
      sections: [{ title: 'When to seek help', content: 'Take 500 mg.' }],
    });
    // A section title does not license its content.
    expect(r.allowed).toBe(false);
  });
});

describe('outbound filter — honest about its own coverage', () => {
  it('reports itself INCOMPLETE, because §4.3 is not fully enforceable', () => {
    expect(coverage().isComplete).toBe(false);
  });

  it('names the prohibitions it cannot check', () => {
    const { uncovered } = coverage();
    expect(uncovered).toContain('asserting_or_implying_clinical_diagnosis');
    expect(uncovered).toContain('claiming_an_expression_proves_a_state');
    expect(uncovered).toContain('medication_names_lexicon_not_authored');
  });
});

// ---------------------------------------------------------------------------
// The composed pipeline
// ---------------------------------------------------------------------------

describe('service — happy paths', () => {
  it('returns sanitised content with no sections', async () => {
    const r = await serviceWith(new MockLlmProvider()).generate(INPUTS);
    expect(r.ok).toBe(true);
    expect(r.content!.message).toContain('here with you');
    expect(r.content!.sections).toBeUndefined();
  });

  it('returns sections when the model supplies them', async () => {
    const provider = new MockLlmProvider({
      script: [{ kind: 'ok', text: MOCK_OK_WITH_SECTIONS_TEXT }],
    });
    const r = await serviceWith(provider).generate(INPUTS);
    expect(r.ok).toBe(true);
    expect(r.content!.sections).toHaveLength(2);
  });

  it('sanitises generated content before returning it', async () => {
    const provider = new MockLlmProvider({
      script: [
        { kind: 'ok', text: JSON.stringify({ message: 'See [the guide](https://x.com) now.' }) },
      ],
    });
    const r = await serviceWith(provider).generate(INPUTS);
    expect(r.content!.message).toBe('See the guide now.');
    expect(r.diagnostic.sanitiserRemoved).toBe(true);
  });
});

describe('service — never throws, always falls back', () => {
  it('falls back on provider failure, after one retry', async () => {
    const provider = new MockLlmProvider({
      script: [{ kind: 'unavailable' }, { kind: 'unavailable' }],
    });
    const r = await serviceWith(provider).generate(INPUTS);
    expect(r.ok).toBe(false);
    expect(r.fallbackReason).toBe('provider_failure');
    expect(r.fallbackText).toBe(FALLBACK_TEXT.en);
    expect(provider.callCount).toBe(2);
  });

  it('recovers when the retry succeeds', async () => {
    const provider = new MockLlmProvider({
      script: [{ kind: 'rate_limited' }, { kind: 'ok', text: MOCK_OK_TEXT }],
    });
    const r = await serviceWith(provider).generate(INPUTS);
    expect(r.ok).toBe(true);
    expect(r.diagnostic.attempts).toBe(2);
  });

  it('⛔ does NOT retry malformed output', async () => {
    // Plan §9.2: a model that produced bad JSON will likely do it again, and
    // retrying doubles latency while the user waits.
    const provider = new MockLlmProvider({ script: [{ kind: 'malformed', text: 'not json' }] });
    const r = await serviceWith(provider).generate(INPUTS);
    expect(r.ok).toBe(false);
    expect(r.fallbackReason).toBe('malformed_output');
    expect(provider.callCount).toBe(1);
  });

  it('blocks output that violates the outbound layer', async () => {
    const provider = new MockLlmProvider({
      script: [{ kind: 'ok', text: JSON.stringify({ message: 'Take 500 mg twice a day.' }) }],
    });
    const r = await serviceWith(provider).generate(INPUTS);
    expect(r.ok).toBe(false);
    expect(r.fallbackReason).toBe('outbound_blocked');
    expect(r.diagnostic.violations).toContain('dosage_instruction');
  });

  it('falls back when sanitisation empties the message', async () => {
    const provider = new MockLlmProvider({
      script: [{ kind: 'ok', text: JSON.stringify({ message: 'https://only-a-url.com' }) }],
    });
    const r = await serviceWith(provider).generate(INPUTS);
    expect(r.ok).toBe(false);
    expect(r.fallbackReason).toBe('empty_after_sanitise');
  });

  it('uses Sinhala fallback copy for a Sinhala turn', async () => {
    const provider = new MockLlmProvider({ script: [{ kind: 'timeout' }, { kind: 'timeout' }] });
    const r = await serviceWith(provider).generate({ ...INPUTS, language: 'si' });
    expect(r.fallbackText).toBe(FALLBACK_TEXT.si);
  });
});

describe('service — leak containment', () => {
  it('⛔ no diagnostic carries the user text, prompt, or model output', async () => {
    const userText = 'PRIVATE PREGNANCY DETAIL';
    const provider = new MockLlmProvider({
      script: [{ kind: 'malformed', text: 'MODEL SAID SOMETHING' }],
    });
    const r = await serviceWith(provider).generate({ ...INPUTS, userText });
    const serialised = JSON.stringify(r.diagnostic);
    expect(serialised).not.toContain(userText);
    expect(serialised).not.toContain('MODEL SAID SOMETHING');
    expect(serialised).not.toContain('You are a supportive companion');
  });

  it('passes the user text verbatim in its own turn', async () => {
    const provider = new MockLlmProvider();
    const userText = 'මට හරිම බයයි';
    await serviceWith(provider).generate({ ...INPUTS, userText, language: 'si' });
    const sent = provider.receivedRequests[0]!;
    expect(sent.messages[1]!.role).toBe('user');
    expect(sent.messages[1]!.content).toBe(userText);
  });

  it('⛔ never puts a content ID or title in the prompt', async () => {
    const provider = new MockLlmProvider();
    await serviceWith(provider).generate({ ...INPUTS, contentType: 'music' });
    const prompt = provider.receivedRequests[0]!.messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('calming music');
    expect(prompt).not.toContain('calm_001');
  });
});
