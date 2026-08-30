/**
 * Parse and validate the model's structured output.
 *
 * ⛔ THIS IS A TRUST BOUNDARY. Everything arriving here is untrusted content
 * derived from an LLM acting on a user's message. Nothing leaves this module
 * unvalidated, and nothing unparsed is ever handed to a caller (plan §9.3).
 *
 * ⛔ NO PAYLOAD IN ANY ERROR. `LlmMalformedOutputError` carries a SCHEMA
 * REASON only — never the offending text. The payload is model output derived
 * from the user's message, and putting it in an error puts it in a log
 * (plan §10, and the O-5 lesson generalised).
 *
 * Repair policy (plan §9.3): ONE structural repair attempt — extract the
 * outermost JSON object, since models routinely wrap JSON in prose or fences.
 * On a second failure, fail. There is NO retry of the provider: a model that
 * produced bad JSON will likely do it again, and retrying doubles latency and
 * cost while the user waits (plan §9.2).
 *
 * Plan: docs/plan/backend/LLM_INTEGRATION_PLAN.md §9.3.
 */

import {
  MAX_MESSAGE_CHARS,
  MAX_SECTIONS,
  MAX_SECTION_CONTENT_CHARS,
  MAX_SECTION_TITLE_CHARS,
  type GeneratedSection,
  type LlmGeneratedContent,
} from './contract.js';
import { LlmMalformedOutputError } from './errors.js';

/** What was done to make the output parse. Metrics only — never user-facing. */
export type RepairAction = 'none' | 'extracted_json_object';

export interface ParseResult {
  readonly content: LlmGeneratedContent;
  readonly repair: RepairAction;
  /** True if any cap in contract.ts truncated or dropped something. */
  readonly truncated: boolean;
}

/**
 * Extract the outermost {...} from text.
 *
 * Brace-counting rather than a regex, because a regex cannot match balanced
 * braces and would stop at the first `}` inside nested content. String-aware,
 * so a `}` inside a JSON string value does not end the object early.
 */
function extractOutermostJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]!;

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Validate the parsed object against the schema.
 *
 * Caps TRUNCATE rather than reject (contract.ts): a slightly over-long reply
 * still helps the user; a rejected one does not. Structural faults — a missing
 * or empty `message`, a non-array `sections` — DO reject, because there is
 * nothing coherent to render.
 */
function validate(parsed: unknown): { content: LlmGeneratedContent; truncated: boolean } {
  const root = asRecord(parsed);
  if (!root) throw new LlmMalformedOutputError('root is not a JSON object');

  const rawMessage = root['message'];
  if (typeof rawMessage !== 'string') {
    throw new LlmMalformedOutputError(`'message' is ${typeof rawMessage}, expected string`);
  }
  if (rawMessage.trim().length === 0) {
    throw new LlmMalformedOutputError("'message' is empty");
  }

  let truncated = false;
  let message = rawMessage;
  if (message.length > MAX_MESSAGE_CHARS) {
    message = message.slice(0, MAX_MESSAGE_CHARS);
    truncated = true;
  }

  // `sections` absent, null, or [] are ALL valid and all mean "no sections".
  // D-1: a short conversational reply is never forced into topics.
  const rawSections = root['sections'];
  if (rawSections === undefined || rawSections === null) {
    return { content: { message }, truncated };
  }
  if (!Array.isArray(rawSections)) {
    throw new LlmMalformedOutputError(`'sections' is ${typeof rawSections}, expected array`);
  }

  const sections: GeneratedSection[] = [];
  for (const entry of rawSections) {
    if (sections.length >= MAX_SECTIONS) {
      truncated = true;
      break;
    }
    const row = asRecord(entry);
    // A malformed section is DROPPED, not fatal — one bad section should not
    // discard an otherwise usable reply.
    if (!row) {
      truncated = true;
      continue;
    }
    const title = row['title'];
    const content = row['content'];
    if (typeof title !== 'string' || typeof content !== 'string') {
      truncated = true;
      continue;
    }
    if (title.trim().length === 0 || content.trim().length === 0) {
      truncated = true;
      continue;
    }

    let cappedTitle = title;
    if (cappedTitle.length > MAX_SECTION_TITLE_CHARS) {
      cappedTitle = cappedTitle.slice(0, MAX_SECTION_TITLE_CHARS);
      truncated = true;
    }
    let cappedContent = content;
    if (cappedContent.length > MAX_SECTION_CONTENT_CHARS) {
      cappedContent = cappedContent.slice(0, MAX_SECTION_CONTENT_CHARS);
      truncated = true;
    }

    sections.push({ title: cappedTitle, content: cappedContent });
  }

  // Every section dropped is equivalent to no sections — omit the key entirely
  // rather than emitting [], so the wire shape stays minimal.
  if (sections.length === 0) return { content: { message }, truncated };
  return { content: { message, sections }, truncated };
}

/**
 * Parse raw model output into validated content.
 *
 * @throws LlmMalformedOutputError - schema reason only, never the payload.
 */
export function parseGeneratedContent(rawText: string): ParseResult {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new LlmMalformedOutputError('model returned empty output');
  }

  // Attempt 1 — the whole thing is JSON.
  try {
    const { content, truncated } = validate(JSON.parse(rawText));
    return { content, repair: 'none', truncated };
  } catch (first) {
    // A schema failure is final. Only a JSON *syntax* failure is worth repairing
    // — re-extracting will yield the same object and the same schema error.
    if (first instanceof LlmMalformedOutputError) throw first;
  }

  // Attempt 2 — the single permitted repair.
  const extracted = extractOutermostJsonObject(rawText);
  if (extracted === null) {
    throw new LlmMalformedOutputError('output is not JSON and contains no JSON object');
  }

  try {
    const { content, truncated } = validate(JSON.parse(extracted));
    return { content, repair: 'extracted_json_object', truncated };
  } catch (second) {
    if (second instanceof LlmMalformedOutputError) throw second;
    throw new LlmMalformedOutputError('extracted object is not valid JSON');
  }
}
