// PASS 3b — extract cited biographical CLAIMS from disambiguated paragraphs into entity_claims (improvable substrate).
// Reads each paragraph + its faithful disambiguation NOTE (content.context: resolves who-is-who + place/era pin/est),
// has the LLM list the claims each NAMED person makes, each gated by a VERBATIM proof-span present in the paragraph.
// Writes: reword-robust semantic_key, temporal when (time_value/precision/basis/anchor from the note), full
// provenance, best-effort subject/object entity binding. Gated by assertDisambiguated.
// Reversible: DELETE FROM entity_claims WHERE import_batch=? (e.g. db-v2).
//   DRY:   DOC=21308 BATCH=db-v2 LIMIT=8 node scripts/entity-read/extract-claims-v2.mjs
//   WRITE: SIFTER_WRITER_URL=http://127.0.0.1:7849 WRITE=1 CONC=5 DOC=21308 BATCH=db-v2 node scripts/entity-read/extract-claims-v2.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { createHash } from 'crypto';
const { queryAll, query } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const { assertDisambiguated } = await import('./_disambig-gate.mjs');
const DOC = Number(process.env.DOC || 21308);
const BATCH = process.env.BATCH || (DOC === 21310 ? 'gpb-v2' : 'db-v2');
const WRITE = process.env.WRITE === '1';
const CONC = +(process.env.CONC || 5);
const LIMIT = process.env.LIMIT ? +process.env.LIMIT : 0;
const MV = 'deepseek-disambig-v1';
const EV = 'extract-v2';
await assertDisambiguated(DOC);
// Multilingual model routing (flash En/Ar/He, haiku Farsi) + escalation ladder, same as disambig/hype.
const { detectProfile, providerOf } = await import('../../api/lib/pipeline/profile.js');
const _meta = (await queryAll(`SELECT id, title, author, religion, collection FROM docs WHERE id=?`, [DOC]))[0] || { id: DOC };
const _sample = (await queryAll(`SELECT text FROM content WHERE doc_id=? AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL AND length(text)>200 ORDER BY paragraph_index LIMIT 1`, [DOC]))[0]?.text || '';
const profile = detectProfile(_meta, _sample);
const MODEL = process.env.MODEL || profile.models.extract;
const PROVIDER = providerOf(MODEL);
const FALLBACK = process.env.FALLBACK || profile.fallback;
const FALLBACK_PROVIDER = providerOf(FALLBACK);
const isPro = (m) => /pro/.test(m);
const maxTokFor = (m) => +(process.env.MAXTOK || (isPro(m) ? 6000 : 3000)); // extraction output is large; continuation handles any overflow beyond this
console.error(`extract profile: lang=${profile.lang} genre=${profile.genre} · model=${MODEL} (${PROVIDER}) → fallback=${FALLBACK}`);

const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ".]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const proofNrm = (s) => String(s || '').replace(/\s+/g, ' ').toLowerCase().trim();
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);

// controlled relation vocabulary + name→entity index (subject/object binding)
const relations = await queryAll(`SELECT key, label FROM relations ORDER BY category, key`);
const relKeys = new Set(relations.map((r) => r.key));
const relList = relations.map((r) => `${r.key}`).join(', ') || 'born, died, martyred, converted-by, father-of, son-of, brother-of, wife-of, teacher-of, disciple-of, met, accompanied, participated-in, resided-in, appointed, wrote, titled, related-to';
// NO literal subject/object binding — entity_id/target_entity_id are a PROJECTION set by evidence-based reconcile.
// The claim records the disambiguation's RESOLVED names (in statement + semantic_key); reconcile links them by
// fuzzy candidate-gen (transliteration-invariant recall) + evidence, never by romanization string-match.
const eraOf = (ctx) => { const m = String(ctx).match(/@[^—]*—/); return m ? m[0].replace(/^@/, '').replace(/—$/, '').trim() : ''; };

let paras = await queryAll(`SELECT id, external_para_id pid, text, context FROM content WHERE doc_id=? AND blocktype='paragraph' AND deleted_at IS NULL AND context IS NOT NULL AND context_model=? ORDER BY paragraph_index`, [DOC, MV]);
if (process.env.PIDMIN) { const lo = +process.env.PIDMIN, hi = +(process.env.PIDMAX || process.env.PIDMIN); paras = paras.filter((p) => { const n = +String(p.pid).replace(/\D/g, ''); return n >= lo && n <= hi; }); }
if (LIMIT) paras = paras.slice(0, LIMIT);
console.error(`extract-claims DOC=${DOC} BATCH=${BATCH} · ${paras.length} disambiguated paras · WRITE=${WRITE}`);

const LANG_NAME = { en: 'English', fa: 'Persian', ar: 'Arabic', he: 'Hebrew' };
const SYS = `Extract cited biographical CLAIMS from ONE paragraph of a historical narrative. You get the paragraph and a NOTE that resolves who-is-who and the place/era. For each NAMED PERSON, list the factual claims the paragraph ASSERTS about them.${profile.lang !== 'en' ? `\nThe paragraph is in ${LANG_NAME[profile.lang] || profile.lang}; the NOTE is English. Write subject / relation / object / statement in ENGLISH (canonical names from the NOTE) — but the "proof" span must be copied VERBATIM from the ${LANG_NAME[profile.lang] || profile.lang} paragraph (it stays in ${LANG_NAME[profile.lang] || profile.lang}).` : ''}
Rules:
• subject = the person's resolved canonical name FROM THE NOTE (never a bare pronoun).
• relation = the single best-fitting key from RELATIONS (below); if none fits well use "related-to".
• object = the other entity (a person/place/work name) or a short literal value.
• proof = a span copied VERBATIM and EXACTLY from the paragraph (<=200 chars) that supports the claim. If you cannot copy an exact supporting span, OMIT the claim.
• when = copy the note's era for this scene (keep its "[pin: …]" / "[est: …]" tag); use a more specific date only if the paragraph states one.
• ONLY what the paragraph states — NO outside knowledge.
• Capture LOAD-BEARING biographical facts (birth, death/martyrdom w/ place+cause, kinship, conversion, teacher/disciple, office/title, participation in an episode, authorship, meetings, journeys), NOT narrative color. The object must be a CONCRETE named entity (person/place/work) or a substantive value — SKIP vague or anaphoric objects ("that book", "his request", "the matter"). At most ONE characterized-as per person (their essential role), never one per descriptive phrase. Avoid the catch-all "related-to" unless nothing specific fits.
RELATIONS: ${relList}
Return ONLY JSON: {"claims":[{"subject":"..","relation":"..","object":"..","proof":"..","when":".."}]}`;

let done = 0, written = 0, dropped = 0, failed = 0, escalations = 0, continued = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retry = async (fn, n = 4) => { let e; for (let i = 0; i < n; i++) { try { return await fn(); } catch (x) { e = x; await sleep(600 * (i + 1)); } } throw e; };
process.on('unhandledRejection', (e) => console.error(`unhandledRejection: ${String(e?.message || e).slice(0, 80)}`));

async function callExtract(model, provider, user) {
  const opts = { provider, model, temperature: 0, maxTokens: maxTokFor(model) };
  if (provider === 'deepseek') { opts.responseFormat = { type: 'json_object' }; if (isPro(model)) opts.thinking = true; }
  return chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: user }], opts);
}
// Tolerant parse: pull COMPLETE flat claim objects even out of a JSON array truncated mid-stream (finish=length).
function parseClaims(raw) {
  const out = []; for (const o of (String(raw).match(/\{[^{}]*\}/g) || [])) { try { const j = JSON.parse(o); if (j && (j.subject || j.proof)) out.push(j); } catch { /* partial */ } }
  return out;
}
// Extract with CONTINUATION-ON-TRUNCATION (dense genealogies emit more claims than one call can hold → keep going
// until the model finishes cleanly) + escalation to the fallback model. Captures arbitrarily dense paragraphs.
async function extractAll(baseUser) {
  const ladder = MODEL === FALLBACK ? [[MODEL, PROVIDER]] : [[MODEL, PROVIDER], [FALLBACK, FALLBACK_PROVIDER]];
  for (const [m, prov] of ladder) {
    const claims = [], seen = new Set(); let user = baseUser, complete = false;
    for (let cont = 0; cont < 5; cont++) {
      let res; try { res = await retry(() => callExtract(m, prov, user)); } catch (e) { break; }
      let added = 0;
      for (const c of parseClaims(res.content || '')) { const k = `${c.subject}|${c.relation}|${c.object}`; if (!seen.has(k)) { seen.add(k); claims.push(c); added++; } }
      if (res.finishReason !== 'length') { complete = true; break; }   // model closed the JSON → done
      if (added === 0) break;                                          // truncated but no new claims → give up
      continued++;                                                     // truncated with progress → ask for the rest
      user = baseUser + `\n\nYou already listed these (do NOT repeat them): ${[...seen].slice(-50).join(' ; ')}\nContinue with the REMAINING claims ONLY, as JSON {"claims":[...]}.`;
    }
    if (complete || claims.length) return { claims, escalated: m !== MODEL };
  }
  return { claims: [], escalated: false };
}

async function processPara(p) {
  const era = eraOf(p.context);
  const baseUser = `NOTE: ${p.context}\n\nPARAGRAPH [${p.pid}]:\n${p.text}`;
  const { claims, escalated } = await extractAll(baseUser);
  if (!claims.length) { failed++; return; }
  if (escalated) escalations++;
  const textN = proofNrm(p.text);
  for (const c of claims) {
    done++;
    if (!c.subject || !c.relation || !c.proof) { dropped++; continue; }
    const proofOk = proofNrm(c.proof).length > 8 && textN.includes(proofNrm(c.proof).slice(0, 120));
    if (!proofOk) { dropped++; continue; }                                   // verbatim-proof gate
    const rel = relKeys.has(c.relation) ? c.relation : 'related-to';
    const subjId = null, objId = null;   // entity binding DEFERRED to evidence-based reconcile (never literal)
    const when = c.when || era;
    const basis = /\[pin/i.test(when) ? 'pin' : /\[est/i.test(when) ? 'estimate' : (era ? (/\[pin/i.test(era) ? 'pin' : 'estimate') : null);
    const yr = (when.match(/\b(1[678]\d{2})\b/) || [])[1] || null;
    const semKey = `${nrm(c.subject)}|${rel}|${nrm(c.object)}|${p.pid}`;
    const statement = `${c.subject} — ${c.relation}${c.object ? ' ' + c.object : ''}`.slice(0, 300);
    const claimHash = sha(`${DOC}|${p.pid}|${semKey}`);
    if (WRITE) {
      try { await retry(() => query(`INSERT OR IGNORE INTO entity_claims
        (claim_hash, entity_id, relation, target_entity_id, statement, proof_verbatim, doc_id, para_id,
         time_value, time_precision, time_basis, time_anchor, semantic_key, method_version, extractor_version,
         confidence, status, proof_ok, import_batch)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [claimHash, subjId, rel, objId, statement, String(c.proof).slice(0, 240), DOC, p.pid,
         yr, yr ? 'year' : null, basis, String(when).slice(0, 160), semKey, MV, EV,
         0.7, 'supported', 1, BATCH])); written++; }
      catch (e) { console.error(`  [${p.pid}] WRITE FAIL ${String(e.message).slice(0, 40)}`); }
    } else if (LIMIT) console.log(`  ${p.pid} · ${c.subject} —[${rel}]→ ${c.object || ''}  {when:${basis || '?'} ${yr || ''}}  ⟨${String(c.proof).slice(0, 50)}…⟩`);
  }
}
let next = 0;
async function worker() { while (next < paras.length) { const i = next++; try { await processPara(paras[i]); } catch (e) { console.error(`para ${i} crash ${String(e.message).slice(0, 50)}`); } if (WRITE && written && written % 200 === 0) console.error(`  written ${written}`); } }
await Promise.all(Array.from({ length: Math.min(CONC, paras.length) }, worker));
console.error(`\nDONE — ${done} candidate claims · ${written} written · ${dropped} dropped (no/failed proof) · ${failed} para-fails · ${continued} continuation calls (dense paras) · ${escalations} escalated to ${FALLBACK}`);
process.exit(0);
