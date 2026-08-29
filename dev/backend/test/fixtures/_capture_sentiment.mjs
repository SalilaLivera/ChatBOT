// One-off capture script — NOT part of the application. Run manually against
// the live C1 sentiment container to populate the C2 fixture corpus (C0.7,
// completed late per C2_PLAN.md D-4). Captures the wire contract only —
// shape, keys, codes, statuses. Values are NOT numerically verified (C8.1 has
// not run) and must never be asserted on in a test.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.SENTIMENT_URL ?? 'http://localhost:8001';
const OUT_DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const sinhalaWord = 'සතුටුයි';
const sinhalaShort = 'මට අද හොඳටම දැනෙනවා.';
const sinhalaMedium =
  'අද මට ටිකක් කනස්සල්ලක් දැනුනා, ඒත් දැන් හොඳටම සනීපෙන් ඉන්නවා. ළමයා හොඳින් සෙල්ලම් කරනවා.';
const sinhalaLong = Array(40)
  .fill(
    'මට සමහර වෙලාවට ගැබ්බර කාලය ගැන කනස්සල්ලක් දැනෙනවා, ඒත් පවුලේ අය සහයෝගය දෙන නිසා ටිකක් සැහැල්ලුවෙන් ඉන්නවා. ',
  )
  .join('');
// Near the 512-token truncation boundary — repeated short clauses.
const sinhalaNearBoundary = Array(120).fill('මට අද සතුටුයි. ').join('');

const cases = [
  { name: 'sentiment_valid_single_word', body: { text: sinhalaWord } },
  { name: 'sentiment_valid_short', body: { text: sinhalaShort } },
  { name: 'sentiment_valid_short_b', body: { text: 'මට බයයි, කනස්සල්ලෙන් ඉන්නවා.' } },
  { name: 'sentiment_valid_short_c', body: { text: 'සියල්ල සාමාන්‍යයි, විශේෂ දෙයක් නෑ.' } },
  { name: 'sentiment_valid_medium', body: { text: sinhalaMedium } },
  { name: 'sentiment_valid_medium_b', body: { text: sinhalaMedium.repeat(2) } },
  { name: 'sentiment_valid_long', body: { text: sinhalaLong } },
  { name: 'sentiment_valid_near_512_boundary', body: { text: sinhalaNearBoundary } },
  { name: 'sentiment_valid_question', body: { text: 'මට කුමක් කරන්න ද කියලා දන්නේ නෑ, උදව් කරන්න පුළුවන් ද?' } },
  { name: 'sentiment_valid_mixed_punctuation', body: { text: 'හොඳයි! නමුත්... ටිකක් බයයි, සත්‍යවශයෙන්ම.' } },
  { name: 'sentiment_valid_repeated_calm', body: { text: 'සන්සුන්ව ඉන්නවා. '.repeat(10) } },
  { name: 'sentiment_valid_repeated_distress', body: { text: 'මට හරිම බයයි. '.repeat(10) } },
  { name: 'sentiment_valid_numbers_mixed', body: { text: 'අද දින 3 ක් වුනා, මට හොඳින් දැනෙනවා.' } },
  { name: 'sentiment_valid_single_char', body: { text: 'ම' } },
  { name: 'sentiment_valid_emoji_mixed', body: { text: 'මට සතුටුයි 🙂 අද දවස හොඳයි' } },
  { name: 'sentiment_english_out_of_scope', body: { text: 'I feel very anxious and overwhelmed today.' } },
  { name: 'sentiment_edge_missing_text_key', body: {} },
  { name: 'sentiment_edge_text_null', body: { text: null } },
  { name: 'sentiment_edge_text_not_string_number', body: { text: 12345 } },
  { name: 'sentiment_edge_text_not_string_array', body: { text: ['a', 'b'] } },
  { name: 'sentiment_edge_text_empty_string', body: { text: '' } },
  { name: 'sentiment_edge_text_whitespace_only', body: { text: '   \t\n  ' } },
  { name: 'sentiment_edge_body_not_object_string', raw: '"just a string"' },
  { name: 'sentiment_edge_body_not_object_array', raw: '[1,2,3]' },
];

const manifest = [];

for (const c of cases) {
  const payload = c.raw ?? JSON.stringify(c.body);
  const res = await fetch(`${BASE}/predict`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
  });
  const text = await res.text();
  const fixturePath = join(OUT_DIR, `${c.name}.json`);
  writeFileSync(fixturePath, text);
  manifest.push({
    fixture: `${c.name}.json`,
    http_status: res.status,
    bytes: Buffer.byteLength(text, 'utf8'),
    request_body_raw: c.raw ?? JSON.stringify(c.body),
  });
  console.log(c.name, res.status);
}

writeFileSync(
  join(OUT_DIR, '_MANIFEST_sentiment.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(`\nCaptured ${manifest.length} sentiment fixtures.`);
