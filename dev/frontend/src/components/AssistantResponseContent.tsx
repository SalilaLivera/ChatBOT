import { Text, View, StyleSheet } from "react-native";
import { colors, fonts, spacing, type } from "../theme";

// ---------------------------------------------------------------------------
// Contract (frontend-local). The backend still returns `response: string`
// (see src/api/contracts.ts) — that rename is a separate backend task. This
// type describes the *approved* shape so this component is ready for it; at
// render time we accept either shape defensively (see toResponseContent).
// ---------------------------------------------------------------------------
export type ResponseSection = { title: string; content: string };
export type AssistantResponseLike = {
  message?: string;
  response?: string; // legacy/current backend field
  sections?: ResponseSection[] | null;
};

// All rendered text is treated as untrusted LLM output. This module renders
// ONLY: **bold**, *italic*, "-"/"*" bullet lists (one level of nesting),
// "1." numbered lists, ### / #### headings (section content only), and
// paragraphs/line breaks. Everything else — raw HTML, links, bare URLs,
// images, tables, code, blockquotes, #/## headings — is stripped before any
// parsing happens, and never reaches a dangerouslySetInnerHTML-style path
// (there is none here: every node below is a plain RN <Text>/<View>).

export function stripUnsupportedMarkup(md: string): string {
  let s = md ?? "";
  // fenced code blocks -> unwrap to plain text, drop the fence markers
  s = s.replace(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/g, (_m, inner) => inner);
  // inline code -> unwrap backticks, keep the text
  s = s.replace(/`([^`]+)`/g, "$1");
  // images ![alt](url) -> drop ENTIRELY, alt text included.
  // Must run BEFORE the link rule: an image is a link with a leading "!".
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  // markdown links [label](url) -> KEEP THE LABEL, DESTROY THE URL.
  //
  // Owner decision 2026-08-30. Semantics are IDENTICAL to the backend's
  // src/llm/sanitise.ts `stripLinks` — the two must not diverge.
  //
  // The label survives so sentences stay grammatical: dropping it turns
  // "see [the NHS guidance](url) for more" into "see for more", which is
  // broken copy in a distress/supportive context and a harm of its own.
  //
  // The URL is destroyed here, before any parsing. It is never rendered, never
  // linkified, and never reaches Linking, WebView, or an HTML surface — none of
  // which this file imports.
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // bare URLs -> drop entirely, never linkify
  s = s.replace(/\bhttps?:\/\/[^\s)]+/gi, "");
  s = s.replace(/\bwww\.[^\s)]+/gi, "");
  // any raw HTML tag -> strip the tag, keep any surrounding text
  s = s.replace(/<\/?[a-zA-Z!][^>]*>/g, "");
  // blockquote markers -> unwrap to plain paragraph text
  s = s.replace(/^[ \t]*>[ \t]?/gm, "");
  return s;
}

function stripToPlainText(raw: string): string {
  // For section titles: plain text, never markdown. Strip HTML/links/URLs
  // defensively but do not interpret ** / * / # as formatting.
  let s = stripUnsupportedMarkup(raw ?? "");
  return s.replace(/\s+/g, " ").trim();
}

type InlineSpan = { text: string; bold?: boolean; italic?: boolean };

function parseInline(raw: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (m.index > lastIndex) spans.push({ text: raw.slice(lastIndex, m.index) });
    if (m[1] !== undefined) spans.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) spans.push({ text: m[2], italic: true });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < raw.length) spans.push({ text: raw.slice(lastIndex) });
  return spans.filter(s => s.text.length > 0);
}

type ListItem = { text: string; ordered: boolean; nested: boolean };
type Block =
  | { type: "heading"; level: 3 | 4; text: string }
  | { type: "list"; items: ListItem[] }
  | { type: "paragraph"; text: string };

function parseBlocks(source: string, allowHeadings: boolean): Block[] {
  const cleaned = stripUnsupportedMarkup(source ?? "").replace(/\r\n/g, "\n");
  const rawBlocks = cleaned.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const blocks: Block[] = [];
  for (const block of rawBlocks) {
    const lines = block.split("\n").map(l => l.replace(/\s+$/, ""));
    // ### / #### heading, only when allowed (section content) and alone on its block
    if (allowHeadings && lines.length === 1) {
      const hm = lines[0].match(/^(#{3,4})\s+(.*)$/);
      if (hm) {
        blocks.push({ type: "heading", level: hm[1].length as 3 | 4, text: hm[2].trim() });
        continue;
      }
    }
    const nonEmpty = lines.filter(l => l.trim().length > 0);
    const isList = nonEmpty.length > 0 && nonEmpty.every(l => /^\s*([-*]|\d+[.)])\s+/.test(l));
    if (isList) {
      const items: ListItem[] = nonEmpty.map(l => {
        const nested = /^(\s{2,}|\t)/.test(l);
        const ordered = /^\s*\d+[.)]\s+/.test(l);
        const text = l.replace(/^\s*([-*]|\d+[.)])\s+/, "");
        return { text, ordered, nested };
      });
      blocks.push({ type: "list", items });
      continue;
    }
    // plain paragraph — strip any stray #/##/###/#### markers, never rendered as headings in `message`
    const paraLines = lines.map(l => l.replace(/^#{1,6}\s+/, ""));
    blocks.push({ type: "paragraph", text: paraLines.join("\n") });
  }
  return blocks;
}

function InlineText({ raw, style }: { raw: string; style: any }) {
  const spans = parseInline(raw);
  return <Text style={style}>{spans.map((s, i) => (
    <Text key={i} style={[s.bold && styles.bold, s.italic && styles.italic]}>{s.text}</Text>
  ))}</Text>;
}

function RestrictedMarkdownBlocks({ text, allowHeadings }: { text: string; allowHeadings: boolean }) {
  const blocks = parseBlocks(text, allowHeadings);
  return <View style={styles.blocks}>
    {blocks.map((block, i) => {
      if (block.type === "heading") {
        return <Text key={i} style={block.level === 3 ? styles.h3 : styles.h4}>{stripToPlainText(block.text)}</Text>;
      }
      if (block.type === "list") {
        return <View key={i} style={styles.list}>
          {block.items.map((item, j) => <View key={j} style={[styles.listRow, item.nested && styles.listRowNested]}>
            <Text style={styles.bullet}>{item.ordered ? `${j + 1}.` : "•"}</Text>
            <InlineText raw={item.text} style={styles.listText} />
          </View>)}
        </View>;
      }
      return <InlineText key={i} raw={block.text} style={styles.paragraph} />;
    })}
  </View>;
}

function toResponseContent(response: AssistantResponseLike): { message: string; sections: ResponseSection[] } {
  const message = (response.message ?? response.response ?? "").toString();
  const sections = Array.isArray(response.sections) ? response.sections.slice(0, 6) : [];
  return { message, sections };
}

export function AssistantResponseContent({ response }: { response: AssistantResponseLike }) {
  const { message, sections } = toResponseContent(response);
  return <View style={styles.response}>
    {message.length > 0 && <RestrictedMarkdownBlocks text={message} allowHeadings={false} />}
    {sections.map((section, i) => <View key={i} style={styles.section}>
      <Text style={styles.sectionTitle}>{stripToPlainText(section.title)}</Text>
      <RestrictedMarkdownBlocks text={section.content} allowHeadings={true} />
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  blocks: { gap: 8 },
  paragraph: { color: colors.ink, fontFamily: fonts.regular, fontSize: type.body, lineHeight: 25 },
  bold: { fontFamily: fonts.bold },
  italic: { fontFamily: fonts.regular, fontStyle: "italic" },
  list: { gap: 4 },
  listRow: { flexDirection: "row", gap: 8, paddingLeft: 2 },
  listRowNested: { paddingLeft: 20 },
  bullet: { color: colors.deepPink, fontFamily: fonts.bold, fontSize: type.body, lineHeight: 25 },
  listText: { flex: 1, color: colors.ink, fontFamily: fonts.regular, fontSize: type.body, lineHeight: 25 },
  h3: { color: colors.ink, fontFamily: fonts.extraBold, fontSize: type.heading, marginTop: 2 },
  h4: { color: colors.ink, fontFamily: fonts.bold, fontSize: type.body + 1, marginTop: 2 },
  response: { gap: 10 },
  section: { gap: 5, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sectionTitle: { color: colors.deepPink, fontFamily: fonts.extraBold, fontSize: type.small, textTransform: "uppercase", letterSpacing: 0.4 }
});
