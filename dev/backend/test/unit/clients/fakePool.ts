/**
 * A minimal stand-in for the subset of undici's `Pool` that
 * `UpstreamHttpClient` actually calls (`.request({...}) -> {statusCode, body:{text()}}`).
 * Lets tests script a sequence of responses/failures without a real socket.
 */
import type { Pool } from 'undici';

export type ScriptedResponse =
  | { type: 'response'; status: number; text: string }
  | { type: 'abort' } // simulates a timeout: request() rejects with an AbortError-shaped error
  | { type: 'connection_error'; message?: string };

export class FakePool {
  public callCount = 0;
  public calls: Array<{ method: string; path: string; body?: unknown; headers?: Record<string, string> }> = [];

  constructor(private readonly script: ScriptedResponse[]) {}

  async request(opts: { method: string; path: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal }) {
    this.callCount += 1;
    this.calls.push({ method: opts.method, path: opts.path, body: opts.body, headers: opts.headers });
    const next = this.script[this.callCount - 1] ?? this.script[this.script.length - 1];
    if (!next) {
      throw new Error('FakePool: no scripted response');
    }
    if (next.type === 'abort') {
      return new Promise((_resolve, reject) => {
        opts.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
        // If the caller's real timeout is very long the abort event above
        // will still fire because httpClient.ts calls controller.abort()
        // itself on its own timer — this promise simply never resolves
        // otherwise, which is exactly what a genuinely hung request does.
      });
    }
    if (next.type === 'connection_error') {
      throw new Error(next.message ?? 'ECONNREFUSED');
    }
    return {
      statusCode: next.status,
      body: { text: async () => next.text },
    };
  }

  async close(): Promise<void> {
    // no-op
  }
}

export function asPool(fake: FakePool): Pool {
  return fake as unknown as Pool;
}
