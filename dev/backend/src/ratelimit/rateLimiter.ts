/**
 * ★ C7 Part C — per-user and per-IP rate limiting. Fixed window, in-memory
 * (no durability requirement — a limiter resetting on restart is harmless;
 * unlike the session accumulator, there is no privacy property riding on
 * this state surviving or not surviving).
 *
 * Provisional engineering limits, owner-decided (C7_DECISIONS_AND_GAPS.md
 * §5.1) — NOT ML measurements, NOT calibrated values, NOT a production-
 * capacity claim. Configuration-driven via env.RATE_LIMIT_*.
 */
import type { NextFunction, Request, Response } from 'express';

interface Window {
  count: number;
  resetAt: number;
}

export class FixedWindowLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly windowMs: number) {}

  /** Returns true if the request is allowed (and increments the counter). */
  tryAcquire(key: string, max: number, now: number = Date.now()): boolean {
    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (existing.count >= max) return false;
    existing.count += 1;
    return true;
  }

  /** Test / diagnostics only. */
  reset(): void {
    this.windows.clear();
  }
}

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function userKeyOf(req: Request): string | undefined {
  return req.userId;
}

/**
 * Builds a rate-limit middleware bound to one path's per-user quota, plus
 * the shared per-IP aggregate quota (§9.4 — the face path is limited more
 * tightly than the text path; both share the same IP aggregate).
 */
export function rateLimitMiddleware(
  perUserLimiter: FixedWindowLimiter,
  perUserMax: number,
  ipLimiter: FixedWindowLimiter,
  ipMax: number,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = clientIp(req);
    if (!ipLimiter.tryAcquire(`ip:${ip}`, ipMax)) {
      res.status(429).json({ error: { code: 'rate_limited', message: 'Too many requests from this IP address.' } });
      return;
    }
    const userKey = userKeyOf(req);
    if (userKey && !perUserLimiter.tryAcquire(`user:${userKey}`, perUserMax)) {
      res.status(429).json({ error: { code: 'rate_limited', message: 'Too many requests for this user.' } });
      return;
    }
    next();
  };
}
