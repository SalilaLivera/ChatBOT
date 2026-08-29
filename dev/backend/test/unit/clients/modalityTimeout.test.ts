import { describe, expect, it } from 'vitest';
import { UpstreamHttpClient } from '../../../src/clients/httpClient.js';
import { FerClient } from '../../../src/clients/fer.client.js';
import { FakePool, asPool } from './fakePool.js';

describe('§6.5 — a modality timeout surfaces as "unavailable", never a thrown request failure', () => {
  it('a hung upstream (never responds) resolves to a typed unavailable result, not a rejection', async () => {
    const pool = new FakePool([{ type: 'abort' }]);
    const client = new FerClient(
      new UpstreamHttpClient({ baseUrl: 'http://fer', timeoutMs: 30, pool: asPool(pool) }),
    );
    // A 32x32 solid PNG-ish buffer big enough not to trip client-side checks;
    // content does not matter because the fake pool never inspects it.
    const image = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(1000, 1)]);

    let thrown: unknown = null;
    let result;
    try {
      result = await client.predict(image);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeNull();
    expect(result?.kind).toBe('unavailable');
    if (result?.kind === 'unavailable') {
      expect(result.reason).toBe('timeout');
      expect(result.code).toBe('face_unavailable');
    }
  });

  it('a connection error also degrades to unavailable, not a throw', async () => {
    const pool = new FakePool([
      { type: 'connection_error', message: 'ECONNREFUSED' },
      { type: 'connection_error', message: 'ECONNREFUSED' },
    ]);
    const client = new FerClient(
      new UpstreamHttpClient({ baseUrl: 'http://fer', timeoutMs: 1000, pool: asPool(pool) }),
    );
    const image = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(1000, 1)]);

    let thrown: unknown = null;
    let result;
    try {
      result = await client.predict(image);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeNull();
    expect(result?.kind).toBe('unavailable');
    if (result?.kind === 'unavailable') expect(result.reason).toBe('connection_error');
  });
});
