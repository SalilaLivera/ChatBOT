import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UpstreamHttpClient } from '../../../src/clients/httpClient.js';
import { FerClient } from '../../../src/clients/fer.client.js';
import { FakePool, asPool } from './fakePool.js';

const FIXTURES_DIR = join(__dirname, '..', '..', 'fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8');
}

/**
 * Plan §6.1.1, NOT handoff §11: empty bytes -> missing_image (400);
 * unidentifiable bytes -> unsupported_format (415); identifiable-but-corrupt
 * -> invalid_image (400). Asserted against the real C0 edge fixtures plus
 * the C2-captured invalid_image case (the 8 C0 fixtures didn't include one).
 */
describe('FER decode error codes follow plan §6.1.1 (verified against real C0/C2 fixtures)', () => {
  it('empty image bytes -> missing_image, mapped to face_image_rejected 400', async () => {
    const text = loadFixture('fer_edge_empty_image_bytes.json');
    const pool = new FakePool([{ type: 'response', status: 400, text }]);
    const client = new FerClient(new UpstreamHttpClient({ baseUrl: 'http://fer', timeoutMs: 1000, pool: asPool(pool) }));
    const result = await client.predict(Buffer.from('probe-bytes'));
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.httpStatus).toBe(400);
      expect(result.code).toBe('face_image_rejected');
    }
  });

  it('unidentifiable bytes (text file) -> unsupported_format, mapped to face_image_rejected 415', async () => {
    const text = loadFixture('fer_edge_non_image_textfile.json');
    const pool = new FakePool([{ type: 'response', status: 415, text }]);
    const client = new FerClient(new UpstreamHttpClient({ baseUrl: 'http://fer', timeoutMs: 1000, pool: asPool(pool) }));
    const result = await client.predict(Buffer.from('this is not an image, it is plain text'));
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.httpStatus).toBe(415);
      expect(result.code).toBe('face_image_rejected');
    }
  });

  it('unidentifiable bytes (unsupported GIF) -> unsupported_format 415', async () => {
    const text = loadFixture('fer_edge_unsupported_gif.json');
    const pool = new FakePool([{ type: 'response', status: 415, text }]);
    const client = new FerClient(new UpstreamHttpClient({ baseUrl: 'http://fer', timeoutMs: 1000, pool: asPool(pool) }));
    const result = await client.predict(Buffer.from('GIF89a-fake-bytes-not-a-real-gif'));
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') expect(result.httpStatus).toBe(415);
  });

  it('identifiable but corrupt/truncated bytes -> invalid_image, mapped to face_image_rejected 400', async () => {
    const text = loadFixture('fer_edge_truncated_identifiable_jpeg.json');
    const pool = new FakePool([{ type: 'response', status: 400, text }]);
    const client = new FerClient(new UpstreamHttpClient({ baseUrl: 'http://fer', timeoutMs: 1000, pool: asPool(pool) }));
    const result = await client.predict(Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00]));
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.httpStatus).toBe(400);
      expect(result.code).toBe('face_image_rejected');
    }
  });
});
