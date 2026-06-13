// Validation harness for the lean "extract-v2" entity+questions prompt.
// Runs the new prompt on a sample of dense paragraphs (default: God Passes By)
// and PRINTS the structured output for human review. Writes NOTHING to the DB.
//
// Cache strategy (DeepSeek V4 automatic prefix caching, api-docs.deepseek.com):
// the entire instruction+schema block is a STATIC system message — identical
// bytes on every call — so it is served from the disk prefix cache (~$0.0028/M
// vs $0.14/M miss on Flash). Only the paragraph varies, at the end. We report
// the measured cache hit/miss split so we can verify it's actually hitting.
//
//   node scripts/siftersearch-extract-v2-validate.mjs [--title "God Passes By"] [--limit 20] [--min-chars 300]
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const { queryAll } = await import('../api/lib/db.js');
const { chatCompletion } = await import('../api/lib/ai.js');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const TITLE = arg('title', 'God Passes By');
const LIMIT = parseInt(arg('limit', '20'), 10);
const MIN_CHARS = parseInt(arg('min-chars', '300'), 10);
const MODEL = arg('model', 'deepseek-v4-flash');

// ── STATIC system prompt = the cached prefix (identical every call) ──────────
const SYSTEM = `You extract structured information from ONE paragraph of religious or historical text for a multi-religion digital library. Return ONLY valid JSON — no prose, no markdown.

Extract ONLY what genuinely appears in the paragraph. Quality over quantity. Never pad.

Fields:
- "people": named individuals actually named or unambiguously referred to. Resolve an epithet/title to the person's canonical name only when certain (e.g. "the Blessed Beauty" -> "Bahá'u'lláh"). NEVER output bare pronouns (He, Him, His, they, us) as people.
- "places": named cities, regions, buildings, prisons, geographic locations.
- "documents": named tablets, books, scriptures, letters, or other works.
- "events": named historical events or episodes.
- "concepts": genuinely significant doctrinal or technical terms (e.g. Covenant, Manifestation, Dispensation, Day of Resurrection). EXCLUDE generic descriptive phrases ("the Cause", "the friends", "the East", "the Word", "this Revelation").
- "authors": authors or writers to whom text is attributed.
- "questions": every distinct hypothetical question a reader could ask that THIS paragraph directly answers. Each a natural, standalone question (include the subject — not "What did he do?").
- "summary": 2-4 sentence standalone summary; name the key figures explicitly.

Rules:
- Preserve exact canonical spelling and ALL diacritics: á é í ó ú ā ī ū ḥ ṭ ṣ ẓ ḍ and ʻayn (ʻ) / hamza (ʼ). Never substitute ASCII apostrophes.
- Deduplicate within each list. Empty list = [].
- A commentary's quoted source verses belong to the commentary — extract its entities, do not echo the source text.

Output exactly this JSON shape:
{"people":[],"places":[],"documents":[],"events":[],"concepts":[],"authors":[],"questions":[],"summary":""}`;

const rows = await queryAll(
  `SELECT c.id, c.text FROM content c JOIN docs d ON d.id=c.doc_id
   WHERE c.deleted_at IS NULL AND d.title = ? AND length(c.text) >= ?
   ORDER BY c.paragraph_index LIMIT ?`,
  [TITLE, MIN_CHARS, LIMIT]
);
console.log(`Validating extract-v2 on ${rows.length} paragraphs of "${TITLE}" (>=${MIN_CHARS} chars), model ${MODEL}\n`);

let hit = 0, miss = 0, out = 0, cost = 0, truncated = 0;
for (const r of rows) {
  let resp;
  try {
    resp = await chatCompletion(
      [{ role: 'system', content: SYSTEM }, { role: 'user', content: r.text }],
      { model: MODEL, provider: 'deepseek', temperature: 0, maxTokens: 16384, responseFormat: { type: 'json_object' } }
    );
  } catch (e) { console.log(`\n[${r.id}] API ERROR: ${e.message}`); continue; }
  const u = resp.usage || {};
  hit += u.cachedTokens || 0; miss += (u.promptTokens || 0) - (u.cachedTokens || 0); out += u.completionTokens || 0;
  if (resp.finishReason === 'length') truncated++;
  let p; try { p = JSON.parse(resp.content); } catch { console.log(`\n[${r.id}] UNPARSEABLE (finish=${resp.finishReason})`); continue; }
  console.log(`\n──[${r.id}] ${r.text.slice(0, 90).replace(/\n/g, ' ')}…`);
  for (const k of ['people', 'places', 'documents', 'events', 'concepts', 'authors']) {
    if (p[k]?.length) console.log(`  ${k}: ${p[k].join(' · ')}`);
  }
  if (p.questions?.length) { console.log(`  questions:`); p.questions.forEach(q => console.log(`    - ${q}`)); }
  if (p.summary) console.log(`  summary: ${p.summary}`);
}
// DeepSeek V4 Flash: cache-hit $0.0028/M in, miss $0.14/M in, out $0.28/M
cost = hit * 0.0028e-6 + miss * 0.14e-6 + out * 0.28e-6;
console.log(`\n════ cache hit ${hit} tok | miss ${miss} tok | output ${out} tok | hit-rate ${(100*hit/Math.max(hit+miss,1)).toFixed(0)}% | truncated ${truncated}/${rows.length} | est cost $${cost.toFixed(4)} (~$${(cost/Math.max(rows.length,1)).toFixed(5)}/para)`);
process.exit(0);
