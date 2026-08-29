/**
 * Structured logging. Redaction is applied HERE, at the logger, never at call
 * sites (§9.5, §9.6) — a call site cannot forget to redact what it never had
 * the chance to log unredacted.
 *
 * Message text (chat / mood input) is never logged at any level. Upstream
 * `detail` fields are never forwarded to a client and are treated the same
 * way here. Container stdout is a log sink, so this applies there too.
 */
import pino from 'pino';
import { env } from '../config/env.js';

// Any field on a logged object matching one of these paths (pino-redact
// wildcard syntax) is replaced with '[REDACTED]' before serialization.
const REDACT_PATHS = [
  'message',
  'text',
  'body.message',
  'body.text',
  'req.body.message',
  'req.body.text',
  '*.message',
  '*.text',
  '*.detail',
  'detail',
  'err.detail',
  'password',
  'jwt',
  'token',
  'authorization',
  'req.headers.authorization',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export type Logger = typeof logger;
