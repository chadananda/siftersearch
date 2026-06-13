// Production extract-v2 runner, scoped to specific books (cost control).
// Per chunk: paragraphs in order with an APPEND-ONLY grounded context (DeepSeek
// prefix-cache); chunks run in parallel. Per paragraph: LLM extract (typed
// entities + hypothetical questions + terse grounded restatement), then store
// via the single-writer (port 7849, sifter.db):
//   - DELETE old entity_mentions for this paragraph (clears v1 garbage)
//   - resolve each entity (findEntity; create graph_entity on miss, cached),
//     INSERT entity_mentions (+ entity_aliases)
//   - UPDATE content SET text_grounded, hyp_questions, graph_enriched=1,
//     extractor_version='extract-v2', synced=0
// Fail-safe: a paragraph that errors/parses-bad is skipped (no write, no
// corruption). Never touches docs outside --docs.
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });
const { queryAll, queryOne } = await import('../api/lib/db.js');
const { findEntity, normalizeSurface } = await import('../api/lib/graph-db.js');
const { chatCompletion } = await import('../api/lib/ai.js');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DOCS = arg('docs', '21310').split(',').map(s => parseInt(s.trim(), 10));
const CHUNK = parseInt(arg('chunk', '40'), 10);
const CONC = parseInt(arg('conc', '8'), 10);
const MODEL = arg('model', 'deepseek-v4-flash');
const WRITER = process.env.SIFTER_WRITER_URL || 'http://localhost:7849/write';

const SYSTEM = `You process ONE paragraph of religious/historical text for a digital library. You are given PRIOR CONTEXT (terse resolved summaries of the immediately preceding paragraphs) and the CURRENT PARAGRAPH. Extract ONLY from the CURRENT PARAGRAPH; use PRIOR CONTEXT only to resolve who/what vague references point to. Return ONLY valid JSON.

Fields:
- "people","places","documents","events","concepts","authors": the named entities ACTUALLY in the current paragraph. Resolve epithets/pronouns to canonical names ONLY when certain. NEVER output bare pronouns. "concepts" = significant doctrinal/technical terms only (Covenant, Manifestation, Dispensation) — never generic phrases ("the Cause","the friends","the East").
- "questions": every distinct hypothetical question THIS paragraph directly answers, each natural and standalone (include the subject).
- "grounded": a terse RESTATEMENT of the paragraph's core point with every vague reference replaced by its named referent, e.g. PARAGRAPH "The party arrived at the West wall by morning." -> "Mullá Ḥusayn and his companions reached the West gate of Shíráz on the morning of 23 May 1844." Write the RESOLVED SENTENCE (one, two at most); convey what happens with names/places/dates filled in. NOT a glossary ("'the Faith' refers to..."); no detail beyond the paragraph.

Rules: preserve exact diacritics (á í ú ḥ ṭ ṣ ʻ ʼ …), never ASCII apostrophes. Deduplicate; empty = []. Quality over quantity; never pad.

Output exactly: {"people":[],"places":[],"documents":[],"events":[],"concepts":[],"authors":[],"questions":[],"grounded":""}`;

const TYPE_MAP = { people: 'person', places: 'place', documents: 'work', events: 'event', concepts: 'concept', authors: 'person' };
const nowIso = () => new Date().toISOString();

function writeBatch(statements, name) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ statements, name });
    const u = new URL(WRITER);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(d || '{}')) : reject(new Error(`writer ${res.statusCode}: ${d.slice(0,200)}`))); });
    req.on('error', reject); req.setTimeout(120000, () => req.destroy(new Error('writer timeout'))); req.write(body); req.end();
  });
}

const entCache = new Map();   // `${type}|${norm}` -> entity_id (resolve/create once, reuse)
async function resolveOrCreate(name, type, religion) {
  const norm = normalizeSurface(name);
  if (!norm) return null;
  const key = `${type}|${norm}`;
  if (entCache.has(key)) return entCache.get(key);
  let id = (await findEntity({ surface: name, type, religion }).catch(() => null))?.entity_id || null;
  if (!id) {
    await writeBatch([{ sql: `INSERT INTO graph_entities (canonical_name, entity_type, religion, created_at) VALUES (?,?,?,?) ON CONFLICT(canonical_name, entity_type, religion) DO NOTHING`, args: [name, type, religion || null, nowIso()] }], 'sx-ent-create').catch(() => {});
    id = (await queryOne(`SELECT id FROM graph_entities WHERE canonical_name=? AND entity_type=? AND (religion IS ? OR religion=?)`, [name, type, religion || null, religion || null]).catch(() => null))?.id || null;
  }
  entCache.set(key, id);
  return id;
}

const stats = { paras: 0, ok: 0, skipped: 0, entities: 0, hit: 0, miss: 0, out: 0, truncated: 0, errors: 0 };

async function processParagraph(p, ctxLines) {
  const ctx = ctxLines.length ? ctxLines.map((g, i) => `${i + 1}. ${g}`).join('\n') : '(start of chapter — no prior context)';
  const user = `PRIOR CONTEXT (resolved summaries of preceding paragraphs):\n${ctx}\n\n=== CURRENT PARAGRAPH (extract from THIS only) ===\n${p.text}`;
  let resp;
  try {
    resp = await chatCompletion([{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
      { model: MODEL, provider: 'deepseek', temperature: 0, maxTokens: 16384, responseFormat: { type: 'json_object' } });
  } catch (e) { stats.errors++; return null; }
  const u = resp.usage || {}; stats.hit += u.cachedTokens || 0; stats.miss += (u.promptTokens || 0) - (u.cachedTokens || 0); stats.out += u.completionTokens || 0;
  if (resp.finishReason === 'length') { stats.truncated++; return null; }   // don't store truncated
  let j; try { j = JSON.parse(resp.content); } catch { stats.skipped++; return null; }

  // Resolve entities (cached). religion from the doc.
  const stmts = [{ sql: `DELETE FROM entity_mentions WHERE CAST(content_id AS INTEGER) = ?`, args: [p.id] }];
  let entCount = 0;
  for (const [field, type] of Object.entries(TYPE_MAP)) {
    for (const name of (j[field] || [])) {
      if (!name || typeof name !== 'string') continue;
      const eid = await resolveOrCreate(name, type, p.religion);
      if (!eid) continue;
      stmts.push({ sql: `INSERT OR IGNORE INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version, em_synced) VALUES (?,?,?,0.9,'resolved','extract-v2',0)`, args: [eid, String(p.id), field] });
      stmts.push({ sql: `INSERT OR IGNORE INTO entity_aliases (entity_id, surface, surface_norm, lang, source, confidence) VALUES (?,?,?,'en','extract-v2',0.8)`, args: [eid, name, normalizeSurface(name)] });
      entCount++;
    }
  }
  stmts.push({ sql: `UPDATE content SET text_grounded=?, hyp_questions=?, graph_enriched=1, graph_enriched_at=?, extractor_version='extract-v2', synced=0 WHERE id=?`,
    args: [j.grounded || null, JSON.stringify(j.questions || []), nowIso(), p.id] });
  try { await writeBatch(stmts, `sx-para-${p.id}`); } catch (e) { stats.errors++; return j.grounded || null; }
  stats.ok++; stats.entities += entCount;
  return j.grounded || null;
}

async function processChunk(paras) {
  const ctx = [];
  for (const p of paras) { stats.paras++; const g = await processParagraph(p, ctx); if (g) ctx.push(g); }
}

async function runDoc(docId) {
  const rel = (await queryOne(`SELECT religion FROM docs WHERE id=?`, [docId]))?.religion || null;
  const paras = (await queryAll(`SELECT id, text FROM content WHERE doc_id=? AND deleted_at IS NULL AND length(text)>50 ORDER BY paragraph_index`, [docId])).map(p => ({ ...p, religion: rel }));
  const chunks = []; for (let i = 0; i < paras.length; i += CHUNK) chunks.push(paras.slice(i, i + CHUNK));
  console.log(`[doc ${docId}] ${paras.length} paras → ${chunks.length} chunks, conc ${CONC}`);
  let ci = 0;
  await Promise.all(Array.from({ length: Math.min(CONC, chunks.length) }, async () => { while (ci < chunks.length) { const my = chunks[ci++]; await processChunk(my); } }));
}

for (const d of DOCS) await runDoc(d);
const cost = stats.hit * 0.0028e-6 + stats.miss * 0.14e-6 + stats.out * 0.28e-6;
console.log(`\nDONE docs ${DOCS.join(',')} | paras ${stats.paras} ok ${stats.ok} skipped ${stats.skipped} truncated ${stats.truncated} errors ${stats.errors} | entities ${stats.entities} | cache-hit ${(100*stats.hit/Math.max(stats.hit+stats.miss,1)).toFixed(0)}% | est $${cost.toFixed(3)}`);
process.exit(0);
