import { describe, expect, it } from 'vitest';
import { UpstreamHttpClient } from '../../../src/clients/httpClient.js';
import { FerClient } from '../../../src/clients/fer.client.js';
import { SentimentClient } from '../../../src/clients/sentiment.client.js';
import { FakePool, asPool } from './fakePool.js';

const VALID_FER_CONTRACT = {
  model_version: 'fer-mobilenetv2-96-float32/1.0.0',
  service_version: '1.0.0',
  label_space: 'fer7',
  class_order: ['angry', 'disgust', 'fear', 'happy', 'neutral', 'sad', 'surprise'],
  input: {},
  output: {},
  calibration: {},
  limitations: [],
  out_of_scope: [],
};

const VALID_SENTIMENT_CONTRACT = {
  model_version: 'sinbert_small_maternalink_mood_exp02/0.1.0',
  service_version: '0.1.0',
  label_space: 'mood3',
  label_order: ['CALM', 'NEUTRAL', 'DISTRESSED'],
  deployed_evidence_keys: ['calm', 'neutral', 'distressed'],
  input: {},
  output: {},
  prediction_rule: 'softmax then argmax',
  device: 'cpu',
  dtype: 'float32',
  supported_language: 'si',
  english_in_scope: false,
  checkpoint: {},
  provenance: {},
  measured_performance: {},
  limitations: [],
  out_of_scope: [],
  error_codes: [],
};

describe('§9.6 — startup contract handshake fails readiness on divergence', () => {
  it('FER: an unmutated contract passes', async () => {
    const pool = new FakePool([{ type: 'response', status: 200, text: JSON.stringify(VALID_FER_CONTRACT) }]);
    const client = new FerClient(new UpstreamHttpClient({ baseUrl: 'http://fer', timeoutMs: 1000, pool: asPool(pool) }));
    const result = await client.verifyContract();
    expect(result.ok).toBe(true);
  });

  it('FER: a mutated class_order (same seven strings, reordered) FAILS the handshake', async () => {
    const mutated = { ...VALID_FER_CONTRACT, class_order: ['neutral', 'angry', 'disgust', 'fear', 'happy', 'sad', 'surprise'] };
    const pool = new FakePool([{ type: 'response', status: 200, text: JSON.stringify(mutated) }]);
    const client = new FerClient(new UpstreamHttpClient({ baseUrl: 'http://fer', timeoutMs: 1000, pool: asPool(pool) }));
    const result = await client.verifyContract();
    expect(result.ok).toBe(false);
  });

  it('FER: a mutated model_version FAILS the handshake', async () => {
    const mutated = { ...VALID_FER_CONTRACT, model_version: 'fer-mobilenetv2-96-float32/1.0.1' };
    const pool = new FakePool([{ type: 'response', status: 200, text: JSON.stringify(mutated) }]);
    const client = new FerClient(new UpstreamHttpClient({ baseUrl: 'http://fer', timeoutMs: 1000, pool: asPool(pool) }));
    const result = await client.verifyContract();
    expect(result.ok).toBe(false);
  });

  it('sentiment: an unmutated contract passes', async () => {
    const pool = new FakePool([{ type: 'response', status: 200, text: JSON.stringify(VALID_SENTIMENT_CONTRACT) }]);
    const client = new SentimentClient(
      new UpstreamHttpClient({ baseUrl: 'http://sentiment', timeoutMs: 1000, pool: asPool(pool) }),
    );
    const result = await client.verifyContract();
    expect(result.ok).toBe(true);
  });

  it('sentiment: a mutated label_order FAILS the handshake', async () => {
    const mutated = { ...VALID_SENTIMENT_CONTRACT, label_order: ['NEUTRAL', 'CALM', 'DISTRESSED'] };
    const pool = new FakePool([{ type: 'response', status: 200, text: JSON.stringify(mutated) }]);
    const client = new SentimentClient(
      new UpstreamHttpClient({ baseUrl: 'http://sentiment', timeoutMs: 1000, pool: asPool(pool) }),
    );
    const result = await client.verifyContract();
    expect(result.ok).toBe(false);
  });

  it('sentiment: a mutated model_version FAILS the handshake', async () => {
    const mutated = { ...VALID_SENTIMENT_CONTRACT, model_version: 'sinbert_small_maternalink_mood_exp02/0.2.0' };
    const pool = new FakePool([{ type: 'response', status: 200, text: JSON.stringify(mutated) }]);
    const client = new SentimentClient(
      new UpstreamHttpClient({ baseUrl: 'http://sentiment', timeoutMs: 1000, pool: asPool(pool) }),
    );
    const result = await client.verifyContract();
    expect(result.ok).toBe(false);
  });
});
