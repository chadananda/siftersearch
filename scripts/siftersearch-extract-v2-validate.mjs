// Validation harness for extract-v2: lean typed entities + hypothetical
// questions + a terse GROUNDED (reference-resolved) restatement, with a
// per-chapter ACCUMULATING grounded-context prefix that maximizes DeepSeek's
// automatic prefix cache. Processes paragraphs strictly in order; each
// paragraph's grounded line is appended to a running context block that sits
// in front of the next paragraph, so consecutive calls share a growing cached
// prefix and only the newest grounded line + the raw paragraph are cache-miss.
// Writes NOTHING to the DB — prints output + measured cache split for review.
//
//   node scripts/siftersearch-extract-v2-validate.mjs [--doc 21310] [--limit 30]
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });
const { queryAll } = await import('../api/lib/db.js');
const { chatCompletion } = await import('../api/lib/ai.js');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DOC = parseInt(arg('doc', '21310'), 10);   // OceanLibrary "God Passes By" canonical
const LIMIT = parseInt(arg('limit', '30'), 10);
const MODEL = arg('model', 'deepseek-v4-flash');

// ── STATIC system prompt = global cached prefix (identical for every call) ───
const SYSTEM = `You process ONE paragraph of religious/historical text for a digital library. You are given PRIOR CONTEXT (terse resolved summaries of the immediately preceding paragraphs, in order) and the CURRENT PARAGRAPH. Extract ONLY from the CURRENT PARAGRAPH; use PRIOR CONTEXT solely to resolve who/what vague references point to. Return ONLY valid JSON.

Fields:
- "people","places","documents","events","concepts","authors": the named entities ACTUALLY in the current paragraph. Resolve epithets/pronouns to canonical names ONLY when certain from context. NEVER output bare pronouns. "concepts" = significant doctrinal/technical terms only (Covenant, Manifestation, Dispensation) — never generic phrases ("the Cause","the friends","the East").
- "questions": every distinct hypothetical question THIS paragraph directly answers, each natural and standalone (include the subject).
- "grounded": the current paragraph restated as tersely as possible with all vague references (pronouns, "the party", "the West wall") resolved to named people/places/dates using PRIOR CONTEXT — a single self-contained statement usable out of book context.

Rules: preserve exact diacritics (á í ú ḥ ṭ ṣ ʻ ʼ …), never ASCII apostrophes. Deduplicate each list; empty = []. Quality over quantity; never pad.

Output exactly: {"people":[],"places":[],"documents":[],"events":[],"concepts":[],"authors":[],"questions":[],"grounded":""}`;

const rows = await queryAll(
  `SELECT c.id, c.text FROM content c
   WHERE c.doc_id = ? AND c.deleted_at IS NULL AND length(c.text) > 50
   ORDER BY c.paragraph_index LIMIT ?`, [DOC, LIMIT]);
console.log(`extract-v2 sequential run: doc ${DOC}, ${rows.length} paragraphs in order, model ${MODEL}\n`);

let hit = 0, miss = 0, out = 0, truncated = 0;
const grounded = [];          // APPEND-ONLY accumulating grounded context. Never slice/slide:
                              // appending keeps the prior numbered block byte-identical, so the
                              // whole context is a growing cached prefix. In prod this resets at
                              // each chapter boundary to bound size.
for (const r of rows) {
  const ctx = grounded.length ? grounded.map((g, i) => `${i + 1}. ${g}`).join('\n') : '(start of chapter — no prior context)';
  const user = `PRIOR CONTEXT (resolved summaries of preceding paragraphs):\n${ctx}\n\n=== CURRENT PARAGRAPH (extract from THIS only) ===\n${r.text}`;
  let resp;
  try {
    resp = await chatCompletion(
      [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
      { model: MODEL, provider: 'deepseek', temperature: 0, maxTokens: 16384, responseFormat: { type: 'json_object' } }
    );
  } catch (e) { console.log(`\n[${r.id}] API ERROR: ${e.message}`); continue; }
  const u = resp.usage || {};
  hit += u.cachedTokens || 0; miss += (u.promptTokens || 0) - (u.cachedTokens || 0); out += u.completionTokens || 0;
  if (resp.finishReason === 'length') truncated++;
  let p; try { p = JSON.parse(resp.content); } catch { console.log(`\n[${r.id}] UNPARSEABLE (finish=${resp.finishReason})`); continue; }
  if (p.grounded) grounded.push(p.grounded);
  console.log(`\n──[${r.id}] raw: ${r.text.slice(0, 80).replace(/\s+/g, ' ')}…`);
  console.log(`  GROUNDED: ${p.grounded || '(none)'}`);
  for (const k of ['people', 'places', 'documents', 'events', 'concepts', 'authors']) if (p[k]?.length) console.log(`  ${k}: ${p[k].join(' · ')}`);
  if (p.questions?.length) console.log(`  questions: ${p.questions.map(q => '\n     - ' + q).join('')}`);
}
const cost = hit * 0.0028e-6 + miss * 0.14e-6 + out * 0.28e-6;
console.log(`\n════ cache hit ${hit} | miss ${miss} | output ${out} | hit-rate ${(100*hit/Math.max(hit+miss,1)).toFixed(0)}% | truncated ${truncated}/${rows.length} | est $${cost.toFixed(4)} (~$${(cost/Math.max(rows.length,1)).toFixed(5)}/para)`);
process.exit(0);
