import { describe, expect, it } from 'vitest';
import { UpstreamHttpClient } from '../../../src/clients/httpClient.js';
import { FerClient } from '../../../src/clients/fer.client.js';
import { SentimentClient } from '../../../src/clients/sentiment.client.js';
import { FakePool, asPool } from './fakePool.js';

describe('§9.5/§9.6 — an upstream `detail` field is never forwarded to a client', () => {
  it('FER: an envelope with detail present does not leak it into the mapped rejection', async () => {
    const body = JSON.stringify({
      error: {
        code: 'invalid_image',
        message: 'The image could not be decoded. It may be corrupt or truncated.',
        detail: 'PIL.UnidentifiedImageError: cannot identify image file /tmp/scratch/upload-8f2.jpg',
      },
    });
    const pool = new FakePool([{ type: 'response', status: 400, text: body }]);
    const client = new FerClient(new UpstreamHttpClient({ baseUrl: 'http://fer', timeoutMs: 1000, pool: asPool(pool) }));
    const result = await client.predict(Buffer.from([0xff, 0xd8]));

    expect(result.kind).toBe('rejected');
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('detail');
    expect(serialised).not.toContain('/tmp/scratch');
  });

  it('sentiment: an envelope with detail present does not leak it into the mapped rejection', async () => {
    const body = JSON.stringify({
      error: {
        code: 'missing_text',
        message: 'No text was provided in the request.',
        detail: 'expected str, got NoneType',
      },
    });
    const pool = new FakePool([{ type: 'response', status: 400, text: body }]);
    const client = new SentimentClient(
      new UpstreamHttpClient({ baseUrl: 'http://sentiment', timeoutMs: 1000, pool: asPool(pool) }),
    );
    const result = await client.predict('irrelevant, upstream response is stubbed');

    expect(result.kind).toBe('rejected');
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('detail');
    expect(serialised).not.toContain('NoneType');
  });
});
