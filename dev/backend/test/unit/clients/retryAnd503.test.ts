import { describe, expect, it } from 'vitest';
import { UpstreamHttpClient } from '../../../src/clients/httpClient.js';
import { SentimentClient } from '../../../src/clients/sentiment.client.js';
import { FakePool, asPool } from './fakePool.js';

describe('§6.4 / §7.2 — 503 is NEVER retried; 500 IS retried once', () => {
  it('503 (model_load_failed) makes exactly ONE upstream call — proven with a counting stub', async () => {
    const body = JSON.stringify({
      error: { code: 'model_load_failed', message: 'The sentiment model could not be loaded. The service is unavailable.' },
    });
    const pool = new FakePool([{ type: 'response', status: 503, text: body }]);
    const client = new SentimentClient(
      new UpstreamHttpClient({ baseUrl: 'http://sentiment', timeoutMs: 1000, pool: asPool(pool) }),
    );
    const result = await client.predict('some text');
    expect(pool.callCount).toBe(1);
    expect(result.kind).toBe('unavailable');
  });

  it('a plain 500 (inference_failed) IS retried once — exactly two upstream calls', async () => {
    const body = JSON.stringify({ error: { code: 'inference_failed', message: 'Model inference failed.' } });
    const pool = new FakePool([
      { type: 'response', status: 500, text: body },
      { type: 'response', status: 500, text: body },
    ]);
    const client = new SentimentClient(
      new UpstreamHttpClient({ baseUrl: 'http://sentiment', timeoutMs: 1000, pool: asPool(pool) }),
    );
    await client.predict('some text');
    expect(pool.callCount).toBe(2);
  });

  it('a 4xx (missing_text) is never retried — exactly one call', async () => {
    const body = JSON.stringify({ error: { code: 'missing_text', message: 'No text was provided in the request.' } });
    const pool = new FakePool([{ type: 'response', status: 400, text: body }]);
    const client = new SentimentClient(
      new UpstreamHttpClient({ baseUrl: 'http://sentiment', timeoutMs: 1000, pool: asPool(pool) }),
    );
    await client.predict('');
    expect(pool.callCount).toBe(1);
  });

  it('a single 503 trips the circuit breaker immediately', async () => {
    const body = JSON.stringify({ error: { code: 'model_load_failed', message: 'unavailable' } });
    const pool = new FakePool([{ type: 'response', status: 503, text: body }]);
    const http = new UpstreamHttpClient({ baseUrl: 'http://sentiment', timeoutMs: 1000, pool: asPool(pool) });
    const client = new SentimentClient(http);
    await client.predict('some text');
    expect(http.getBreaker().getState()).toBe('open');
    // A second call short-circuits: no further HTTP call is made.
    const second = await client.predict('some more text');
    expect(pool.callCount).toBe(1);
    expect(second.kind).toBe('unavailable');
    if (second.kind === 'unavailable') expect(second.reason).toBe('circuit_open');
  });
});
