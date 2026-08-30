/**
 * ★ C3B — a minimal single-field multipart/form-data extractor for the frame
 * upload (C3B_PLAN.md Part D).
 *
 * The frame route reads the raw request body as a Buffer (`express.raw`) and
 * calls this to pull out the `image` part. We deliberately do NOT add a
 * multipart library dependency for one field.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ LOGGING RISK (C3B_PLAN.md §6.1, O-5). The body is image bytes. Nothing in
 * this file logs, echoes, or stringifies the buffer, and callers must not
 * either. Errors carry only a short reason string — never a slice of the body.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type MultipartExtractResult =
  | { ok: true; image: Buffer }
  | { ok: false; reason: 'no_boundary' | 'no_image_field' | 'malformed' };

const CRLF = Buffer.from('\r\n');

export function extractImageField(contentType: string | undefined, body: Buffer): MultipartExtractResult {
  if (!contentType) return { ok: false, reason: 'no_boundary' };
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundaryValue = match?.[1] ?? match?.[2];
  if (!boundaryValue) return { ok: false, reason: 'no_boundary' };

  const delimiter = Buffer.from(`--${boundaryValue.trim()}`);
  if (body.length === 0) return { ok: false, reason: 'malformed' };

  // Split into parts on the boundary delimiter.
  const parts: Buffer[] = [];
  let searchFrom = 0;
  let start = body.indexOf(delimiter, searchFrom);
  if (start === -1) return { ok: false, reason: 'malformed' };
  start += delimiter.length;
  for (;;) {
    // Each boundary is followed by CRLF (more parts) or "--" (final).
    if (body[start] === 0x2d && body[start + 1] === 0x2d) break; // closing "--"
    if (body.subarray(start, start + 2).equals(CRLF)) start += 2;
    const next = body.indexOf(delimiter, start);
    if (next === -1) return { ok: false, reason: 'malformed' };
    // The part content ends with a CRLF before the next delimiter.
    let end = next;
    if (body.subarray(end - 2, end).equals(CRLF)) end -= 2;
    parts.push(body.subarray(start, end));
    searchFrom = next + delimiter.length;
    start = searchFrom;
  }

  for (const part of parts) {
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) continue;
    const headers = part.subarray(0, headerEnd).toString('latin1');
    if (/content-disposition:[^\r\n]*\bname="?image"?/i.test(headers)) {
      return { ok: true, image: part.subarray(headerEnd + 4) };
    }
  }
  return { ok: false, reason: 'no_image_field' };
}
