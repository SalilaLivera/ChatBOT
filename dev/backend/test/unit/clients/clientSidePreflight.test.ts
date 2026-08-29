import { describe, expect, it } from 'vitest';
import { UpstreamHttpClient } from '../../../src/clients/httpClient.js';
import { FerClient, FER_MAX_UPLOAD_BYTES } from '../../../src/clients/fer.client.js';
import { FakePool, asPool } from './fakePool.js';

function pngWithDimensions(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe('client-side 8 MB / 16 px enforcement makes NO HTTP call', () => {
  it('an oversized image is rejected before any HTTP call', async () => {
    const pool = new FakePool([{ type: 'response', status: 200, text: '{}' }]);
    const client = new FerClient(new UpstreamHttpClient({ baseUrl: 'http://fer', timeoutMs: 1000, pool: asPool(pool) }));
    const oversized = Buffer.alloc(FER_MAX_UPLOAD_BYTES + 1);
    const result = await client.predict(oversized);

    expect(pool.callCount).toBe(0);
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.httpStatus).toBe(413);
      expect(result.code).toBe('face_image_too_large');
    }
  });

  it('an under-16px image is rejected before any HTTP call', async () => {
    const pool = new FakePool([{ type: 'response', status: 200, text: '{}' }]);
    const client = new FerClient(new UpstreamHttpClient({ baseUrl: 'http://fer', timeoutMs: 1000, pool: asPool(pool) }));
    const tiny = pngWithDimensions(8, 8);
    const result = await client.predict(tiny);

    expect(pool.callCount).toBe(0);
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.httpStatus).toBe(400);
      expect(result.code).toBe('face_image_rejected');
    }
  });

  it('a valid-sized image DOES make an HTTP call', async () => {
    const okBody = JSON.stringify({
      model_version: 'fer-mobilenetv2-96-float32/1.0.0',
      model_sha256: 'x',
      class_order: ['angry', 'disgust', 'fear', 'happy', 'neutral', 'sad', 'surprise'],
      probabilities: {},
      predicted_class: 'neutral',
      confidence: 0.5,
      calibrated: true,
      label_space: 'fer7',
    });
    const pool = new FakePool([{ type: 'response', status: 200, text: okBody }]);
    const client = new FerClient(new UpstreamHttpClient({ baseUrl: 'http://fer', timeoutMs: 1000, pool: asPool(pool) }));
    const ok = pngWithDimensions(96, 96);
    const result = await client.predict(ok);

    expect(pool.callCount).toBe(1);
    expect(result.kind).toBe('success');
  });
});
