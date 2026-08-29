/**
 * Typed error base. Upstream `detail` fields (from FER / sentiment / fusion
 * error envelopes) are carried internally for logging but are never included
 * in `toEnvelope()` — they must never reach a client (§9.5, §9.6).
 */
export class AppError extends Error {
  readonly httpStatus: number;
  readonly code: string;
  /** Internal only — never serialized to a client response. */
  readonly detail: string | undefined;

  constructor(code: string, httpStatus: number, message: string, detail?: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.detail = detail;
  }

  toEnvelope(): { error: { code: string; message: string } } {
    return {
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}
