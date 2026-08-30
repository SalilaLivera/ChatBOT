/**
 * Restricted-Markdown enforcement. SERVER-SIDE AND AUTHORITATIVE.
 *
 * D-3 (owner, 2026-08-30). LLM output is UNTRUSTED CONTENT and is treated
 * exactly like user input.
 *
 * ⛔ THIS RUNS BEFORE THE RESPONSE LEAVES THE BACKEND. The frontend also uses
 * an allowlist renderer, but it must NEVER be the only defence — a second
 * client (web, a test harness, a future integration) would inherit none of it.
 *
 * ALLOWED (plan §5.1)
 *   **bold**  ·  *italic*
 *   bullet lists (- or *), ONE level of nesting
 *   numbered lists (1.)
 *   ### and #### headings — SECTION CONTENT ONLY, never in `message`
 *   paragraphs and line breaks
 *
 * ⛔ REMOVED (plan §5.2)
 *   raw HTML of any kind
 *   LINKS and BARE URLs        ← a hallucinated medical URL in a pregnancy app
 *                                is a real harm, and links are a phishing vector
 *   images · tables · code blocks and inline code · blockquotes
 *   # and ## headings (reserved for the app's own typography)
 *   footnotes · HTML entities · autolinks
 *
 * DESIGN NOTE — why removal keeps the surrounding text.
 * Forbidden CONSTRUCTS are removed while their readable TEXT is kept wherever
 * dropping it would mangle a sentence. Deleting the words around a stripped URL
 * produces broken, confusing copy in a distress context, which is its own harm.
 * The rule is: the dangerous part goes, the sentence survives.
 *
 * ⚠️ ONE INTERPRETATION NEEDING CONFIRMATION — see `stripLinks`.
 *
 * Plan: docs/plan/backend/LLM_INTEGRATION_PLAN.md §5.
 */

/** What was removed. Metrics and tests only — never user-facing. */
export interface SanitiseReport {
  readonly html: number;
  readonly links: number;
  readonly bareUrls: number;
  readonly images: number;
  readonly codeBlocks: number;
  readonly inlineCode: number;
  readonly blockquotes: number;
  readonly tables: number;
  readonly headings: number;
}

export interface SanitiseResult {
  readonly text: string;
  readonly removed: SanitiseReport;
  /** True if anything at all was stripped. */
  readonly modified: boolean;
}

function emptyReport(): { -readonly [K in keyof SanitiseReport]: number } {
  return {
    html: 0,
    links: 0,
    bareUrls: 0,
    images: 0,
    codeBlocks: 0,
    inlineCode: 0,
    blockquotes: 0,
    tables: 0,
    headings: 0,
  };
}

type Counters = ReturnType<typeof emptyReport>;

// ---------------------------------------------------------------------------
// Inline strippers
// ---------------------------------------------------------------------------

/** `<b>x</b>`, `<script>…`, `<br/>` — tags go, inner text stays. */
function stripHtml(text: string, c: Counters): string {
  return text.replace(/<[^>\n]{0,200}>/g, () => {
    c.html += 1;
    return '';
  });
}

/**
 * `![alt](url)` — images removed ENTIRELY, alt text included.
 * Must run BEFORE stripLinks, since an image is a link with a leading `!`.
 */
function stripImages(text: string, c: Counters): string {
  return text.replace(/!\[[^\]\n]{0,200}\]\([^)\n]{0,500}\)/g, () => {
    c.images += 1;
    return '';
  });
}

/**
 * `[text](url)` → `text`. The URL is destroyed; the words survive.
 *
 * ⚠️ INTERPRETATION REQUIRING CONFIRMATION.
 * D-3 says links are "stripped entirely". That is unambiguous about the URL and
 * ambiguous about the link TEXT. This implementation KEEPS THE TEXT, because
 * removing it too turns "see [the NHS guidance](url) for more" into "see for
 * more" — broken copy in a distress context.
 *
 * The residual risk is a model naming a source without a URL. That is a much
 * smaller harm than a clickable hallucinated medical link, and it is visible to
 * a reader in a way a wrong URL is not.
 *
 * If the owner intends link text to be removed as well, this is a one-line
 * change and the tests name the case.
 */
function stripLinks(text: string, c: Counters): string {
  return text.replace(/\[([^\]\n]{0,200})\]\([^)\n]{0,500}\)/g, (_m, label: string) => {
    c.links += 1;
    return label;
  });
}

/**
 * Bare and auto-linked URLs — removed entirely, including the scheme and any
 * `<...>` wrapper. Also catches schemeless `www.` hosts, which renderers and
 * users treat as links regardless.
 */
function stripBareUrls(text: string, c: Counters): string {
  const pattern = /<?\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>)\]]{1,500}>?/gi;
  return text.replace(pattern, () => {
    c.bareUrls += 1;
    return '';
  });
}

/**
 * `` `code` `` → `code`. Backticks go, text stays.
 *
 * The lookarounds are load-bearing. Without them this rule matches the first
 * TWO backticks of a ``` fence, leaving a single stray backtick — and the
 * line-level fence rule then fails to recognise the block at all, so the fence
 * markers survive into the output. Requiring that neither delimiter sits inside
 * a run of backticks leaves fences untouched for `sanitiseLines` to handle.
 */
function stripInlineCode(text: string, c: Counters): string {
  return text.replace(/(?<!`)`([^`\n]{0,500})`(?!`)/g, (_m, inner: string) => {
    c.inlineCode += 1;
    return inner;
  });
}

// ---------------------------------------------------------------------------
// Line-level
// ---------------------------------------------------------------------------

const FENCE = /^\s{0,3}(?:```|~~~)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const BLOCKQUOTE = /^\s{0,3}>\s?/;
const TABLE_DIVIDER = /^\s{0,3}\|?[\s:|-]{3,}\|?\s*$/;
const TABLE_ROW = /^\s{0,3}\|.*\|\s*$/;
const FOOTNOTE_DEF = /^\s{0,3}\[\^[^\]]{1,50}\]:/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;

/**
 * @param allowHeadings `###`/`####` survive in SECTION CONTENT only.
 *                      In `message` all headings are demoted to plain text —
 *                      the app owns top-level typography.
 */
function sanitiseLines(input: string, allowHeadings: boolean, c: Counters): string {
  const out: string[] = [];
  let inFence = false;

  for (const rawLine of input.split(/\r?\n/)) {
    // Code fences: markers dropped, enclosed text kept as plain paragraphs so
    // prose a model wrongly fenced is not lost.
    if (FENCE.test(rawLine)) {
      if (!inFence) c.codeBlocks += 1;
      inFence = !inFence;
      continue;
    }

    let line = rawLine;

    if (FOOTNOTE_DEF.test(line)) continue;

    if (BLOCKQUOTE.test(line)) {
      c.blockquotes += 1;
      line = line.replace(BLOCKQUOTE, '');
    }

    // Tables: the divider row is meaningless without a renderer and is dropped;
    // content rows lose their pipes and become plain text.
    if (TABLE_DIVIDER.test(line) && line.includes('|')) {
      c.tables += 1;
      continue;
    }
    if (TABLE_ROW.test(line)) {
      c.tables += 1;
      line = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').join(' — ').trim();
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const body = heading[2]!;
      if (allowHeadings && (level === 3 || level === 4)) {
        line = `${'#'.repeat(level)} ${body}`;
      } else {
        // `#`/`##` anywhere, and any heading inside `message`, become plain text.
        c.headings += 1;
        line = body;
      }
    }

    // Lists: normalise the marker and clamp indentation to ONE nesting level,
    // so the frontend renderer never faces arbitrary depth.
    const bullet = BULLET.exec(line);
    if (bullet) {
      const depth = bullet[1]!.length >= 2 ? 1 : 0;
      line = `${'  '.repeat(depth)}- ${bullet[3]!}`;
    } else {
      const ordered = ORDERED.exec(line);
      if (ordered) {
        const depth = ordered[1]!.length >= 2 ? 1 : 0;
        line = `${'  '.repeat(depth)}${ordered[2]!}. ${ordered[3]!}`;
      }
    }

    out.push(line);
  }

  return out.join('\n');
}

/** Collapse runs of 3+ blank lines, and trim. */
function tidy(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function run(input: string, allowHeadings: boolean): SanitiseResult {
  const c = emptyReport();

  let text = stripHtml(input, c);
  text = stripImages(text, c); // before stripLinks — an image is a `!`-prefixed link
  text = stripLinks(text, c);
  text = stripBareUrls(text, c);
  text = stripInlineCode(text, c);
  text = sanitiseLines(text, allowHeadings, c);
  text = tidy(text);

  const modified = Object.values(c).some((n) => n > 0) || text !== input.trim();
  return { text, removed: c, modified };
}

/**
 * Sanitise the top-level `message`.
 * Headings are NOT permitted here — the app owns top-level typography.
 */
export function sanitiseMessage(input: string): SanitiseResult {
  return run(input, false);
}

/**
 * Sanitise a section's `content`. `###` and `####` survive.
 */
export function sanitiseSectionContent(input: string): SanitiseResult {
  return run(input, true);
}

/**
 * Sanitise a section TITLE.
 *
 * Titles are PLAIN TEXT (contract.ts) — the frontend styles them. All markdown
 * syntax is removed rather than preserved, so a title can never carry emphasis
 * or structure into a slot the app is meant to control.
 */
export function sanitiseSectionTitle(input: string): SanitiseResult {
  const c = emptyReport();
  let text = stripHtml(input, c);
  text = stripImages(text, c);
  text = stripLinks(text, c);
  text = stripBareUrls(text, c);
  text = stripInlineCode(text, c);
  text = text
    .replace(/^\s{0,3}#{1,6}\s+/, () => {
      c.headings += 1;
      return '';
    })
    .replace(/\*\*|__|\*|_|~~/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const modified = Object.values(c).some((n) => n > 0) || text !== input.trim();
  return { text, removed: c, modified };
}
