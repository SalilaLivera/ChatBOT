/**
 * Shared transport for the FER and sentiment clients.
 *
 * - Timeouts come from config/env.ts. They are PROVISIONAL — FER end-to-end
 *   latency and all sentiment latency are UNKNOWN (handoff §7.1, §13); set
 *   for real in C8.3. Not measurements.
 * - Retry (§7.2): at most ONE, with jitter, only on connection failure,
 *   timeout, or 5xx EXCLUDING 503. Never on any 4xx.
 * - 503 is NEVER retried (§6.4) — both services return it on a SHA-256
 *   mismatch, a deployment fault, not a transient one. The circuit opens.
 * - A per-upstream circuit breaker opens on 503 or on sustained connection
 *   failure, and short-circuits further calls without hitting the network.
 * - `undici` with a keep-alive Pool per upstream — C8.4 drives up to 300 FER
 *   requests/minute/user (§3A.6); connection churn at that rate is a real
 *   cost, and retrofitting pooling after the load test would invalidate it.
 */
import { Pool } from 'undici';

export interface TransportResult {
  status: number;
  text: string;
}

export type TransportFailure =
  | { failure: 'timeout' }
  | { failure: 'connection_error'; message: string }
  // `status` is set only when the breaker's most recent trip was caused by an
  // observed 503 (C6 §3) — so a caller can keep treating "circuit open" as
  // "still 503" for as long as the breaker stays open, rather than silently
  // degrading once the very first 503 has already been reported.
  | { failure: 'circuit_open'; status?: number };

export type TransportOutcome = { ok: true; result: TransportResult } | ({ ok: false } & TransportFailure);

// ---------------------------------------------------------------------------
// Circuit breaker — per upstream instance.
// ---------------------------------------------------------------------------

type BreakerState = 'closed' | 'open' | 'half_open';

export class CircuitBreaker {
  private state: BreakerState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private lastTripStatus: number | undefined;

  constructor(
    private readonly failureThreshold = 3,
    private readonly resetTimeoutMs = 30_000,
  ) {}

  isOpen(): boolean {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt >= this.resetTimeoutMs) {
        this.state = 'half_open';
        return false;
      }
      return true;
    }
    return false;
  }

  /** Call after a successful response (any status the caller does not treat as a breaker trip). */
  recordSuccess(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.lastTripStatus = undefined;
  }

  /** Call on connection failure/timeout. Opens after `failureThreshold` consecutive failures. */
  recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.trip();
    }
  }

  /**
   * Open the circuit. `status`, when supplied, records the HTTP status that
   * caused this trip (C6 §3) — set only for an explicit 503 trip, so a
   * `circuit_open` short-circuit can still be told apart from a
   * connection-failure-threshold trip while the breaker stays open.
   */
  trip(status?: number): void {
    this.state = 'open';
    this.openedAt = Date.now();
    this.lastTripStatus = status;
  }

  getState(): BreakerState {
    return this.state;
  }

  getLastTripStatus(): number | undefined {
    return this.lastTripStatus;
  }
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export interface UpstreamHttpClientOptions {
  baseUrl: string;
  timeoutMs: number;
  breaker?: CircuitBreaker;
  /** Injected for testing; defaults to a real undici Pool. */
  pool?: Pool;
}

export interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  headers?: Record<string, string> | undefined;
  body?: string | Buffer | undefined;
  correlationId?: string | undefined;
}

const jitterMs = (): number => Math.floor(Math.random() * 100);

export class UpstreamHttpClient {
  private readonly pool: Pool;
  private readonly breaker: CircuitBreaker;
  private readonly timeoutMs: number;

  constructor(options: UpstreamHttpClientOptions) {
    this.timeoutMs = options.timeoutMs;
    this.breaker = options.breaker ?? new CircuitBreaker();
    this.pool =
      options.pool ??
      new Pool(options.baseUrl, {
        connections: 8,
        keepAliveTimeout: 30_000,
        keepAliveMaxTimeout: 60_000,
      });
  }

  getBreaker(): CircuitBreaker {
    return this.breaker;
  }

  async request(opts: RequestOptions): Promise<TransportOutcome> {
    if (this.breaker.isOpen()) {
      const status = this.breaker.getLastTripStatus();
      return status === undefined
        ? { ok: false, failure: 'circuit_open' }
        : { ok: false, failure: 'circuit_open', status };
    }

    const first = await this.attempt(opts);
    if (!this.shouldRetry(first)) {
      this.settle(first);
      return first;
    }

    // Retry policy (§7.2): at most ONE, with jitter, only on connection
    // failure, timeout, or 5xx EXCLUDING 503. Never on 4xx — shouldRetry()
    // returns false for those. 503 is handled the same way: never retried.
    await new Promise((resolve) => setTimeout(resolve, jitterMs()));
    const second = await this.attempt(opts);
    this.settle(second);
    return second;
  }

  private shouldRetry(outcome: TransportOutcome): boolean {
    if (!outcome.ok) {
      return outcome.failure === 'timeout' || outcome.failure === 'connection_error';
    }
    return outcome.result.status >= 500 && outcome.result.status !== 503;
  }

  private settle(outcome: TransportOutcome): void {
    if (!outcome.ok) {
      if (outcome.failure === 'timeout' || outcome.failure === 'connection_error') {
        this.breaker.recordFailure();
      }
      return;
    }
    const status = outcome.result.status;
    if (status === 503) {
      // Deployment fault, never a transient one — trip immediately, never retry.
      this.breaker.trip(503);
      return;
    }
    if (status >= 500) {
      this.breaker.recordFailure();
      return;
    }
    this.breaker.recordSuccess();
  }

  private async attempt(opts: RequestOptions): Promise<TransportOutcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const requestOptions: Parameters<Pool['request']>[0] = {
        method: opts.method,
        path: opts.path,
        headers: {
          ...opts.headers,
          ...(opts.correlationId ? { 'x-request-id': opts.correlationId } : {}),
        },
        signal: controller.signal,
      };
      if (opts.body !== undefined) {
        requestOptions.body = opts.body;
      }
      const res = await this.pool.request(requestOptions);
      const text = await res.body.text();
      return { ok: true, result: { status: res.statusCode, text } };
    } catch (err) {
      if (controller.signal.aborted) {
        return { ok: false, failure: 'timeout' };
      }
      const message = err instanceof Error ? err.message : 'unknown transport error';
      return { ok: false, failure: 'connection_error', message };
    } finally {
      clearTimeout(timer);
    }
  }

  async close(): Promise<void> {
    await this.pool.close();
  }
}
