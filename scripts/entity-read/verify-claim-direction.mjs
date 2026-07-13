// Audit + repair extracted claims for semantic-role DIRECTION and narrator-assertion — the class of error where
// the extractor reads passive voice as active ("X was attacked by Y" → "X attacked Y") or ingests an adversary's
// accusation as fact. SELECTION is deterministic (a retrieval-backstop): active-adversarial relations + reported-
// speech proof cues. JUDGMENT is AI (per project rule — judgment tasks tune prompts / use AI, not regex): an
// auditor reads each claim against its SOURCE paragraph and returns ok | passive | drop | relabel. Repairs are
// minimal + reversible: "passive" relabels the relation to its "-by" converse (entity binding + proof unchanged,
// so the victim stays the subject and the direction reads correctly); "drop" rejects a mere accusation.
//   DRY:   node scripts/entity-read/verify-claim-direction.mjs --docs=21310,21308,426,427,429,430,431 [--limit=N]
//   WRITE: SIFTER_WRITER_URL=http://127.0.0.1:7849 WRITE=1 node scripts/entity-read/verify-claim-direction.mjs --docs=...
// Reverse: restore the small-entity-tables backup taken before the run.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, query } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');

const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.split('=')[1] : d; };
const WRITE = process.env.WRITE === '1';
const DOCS = arg('docs', '21310,21308,426,427,429,430,431').split(',').map((s) => s.trim()).filter(Boolean);
const LIMIT = Number(arg('limit', '0')) || null;
const MODEL = arg('model', 'deepseek-v4-flash');
const CONC = Number(arg('concurrency', '4'));

// Active-adversarial relations: with a protagonist as subject these are the ones the extractor most often inverts.
// (Passive forms like "condemned-by"/"martyred"/"exiled"/"imprisoned" correctly take the victim as subject — the
//  auditor confirms those as "ok", so including them is harmless but we skip to save calls.)
const ADVERSARIAL = ['persecuted', 'attacked', 'opposed', 'betrayed', 'slandered', 'harmed', 'tortured', 'defeated', 'expelled', 'denounced', 'condemned', 'humiliated', 'plotted-against', 'assailed', 'wronged', 'accused'];
const REPORTED = ['%claimed%', '%alleged%', '%accused%', '%pretended%', '%boasted%', '%asserted that%', '%professed%'];

const SYSTEM = `You audit ONE extracted claim for DIRECTION and FACTUALITY, using ONLY the source paragraph. You are told SUBJECT, RELATION, OBJECT explicitly. The claim asserts the SUBJECT is the DOER and the OBJECT is the one it is done to.
First determine, from the paragraph, WHO is the doer (agent) and WHO is the target (patient) of this relation. Then:
• "ok" — the paragraph says the SUBJECT is the DOER acting upon the OBJECT (correct as-is), even for harsh acts. If the SUBJECT is genuinely the aggressor, it is "ok".
• "passive" — the roles are REVERSED: the paragraph says the SUBJECT is the one it happens TO (the victim/patient), done by the OBJECT or by others ("was ...ed by", "at the hands of", "arose against him", "suffered"). Choose this only when the SUBJECT is clearly the target, NOT the doer.
• "relabel" — direction fine but the relation WORD is wrong; give "better_relation".
• "drop" — the statement is not a narrated fact about the SUBJECT: an accusation/boast ATTRIBUTED to an adversary, OR the SUBJECT is the wrong person, OR it is negated/hypothetical, OR the paragraph is nonsensical for this pair.
Be careful: do NOT flip a claim whose SUBJECT is truly the aggressor. When genuinely uncertain, choose "ok". Return ONLY JSON: {"verdict":"ok|passive|relabel|drop","better_relation":"","why":"<=12 words"}`;

const subjOf = (s) => String(s).split(' — ')[0].trim();
function buildUser(c, para) {
  const subj = subjOf(c.statement);
  const obj = c.statement.slice(`${subj} — ${c.relation}`.length).trim() || '(unspecified)';
  return `PARAGRAPH:\n${para}\n\nCLAIM under audit — SUBJECT="${subj}"  RELATION="${c.relation}"  OBJECT="${obj}".\nPROOF span: "${c.proof_verbatim}"\n\nDoes "${subj}" DO "${c.relation}" to "${obj}", or is "${subj}" the one it happens TO (reverse), or not a narrated fact?`;
}

function parseVerdict(raw) {
  const m = String(raw).match(/\{[\s\S]*\}/); if (!m) return null;
  try { const j = JSON.parse(m[0]); if (!['ok', 'passive', 'drop', 'relabel'].includes(j.verdict)) return null; return j; } catch { return null; }
}

async function retry(fn, n = 3) { let e; for (let i = 0; i < n; i++) { try { return await fn(); } catch (err) { e = err; await new Promise((r) => setTimeout(r, 400 * (i + 1))); } } throw e; }

// Pull the suspect set + its source paragraph text.
const rel = ADVERSARIAL.map((r) => `'${r}'`).join(',');
const repCond = REPORTED.map((p) => `c.proof_verbatim LIKE '${p}'`).join(' OR ');
// A claim's para_id is COALESCE(external_para_id, 'p'||id) from getParagraphs, so it can be EITHER form —
// match both, else wave-1 docs (which use the 'p'||id form) are silently dropped from the audit.
const rows = await queryAll(
  `SELECT c.id, c.doc_id, c.para_id, c.relation, c.statement, c.proof_verbatim, p.text AS para
     FROM entity_claims c JOIN content p ON p.doc_id=c.doc_id AND (p.external_para_id=c.para_id OR 'p'||p.id=c.para_id)
    WHERE c.doc_id IN (${DOCS.join(',')}) AND c.status='supported'
      AND ( c.relation IN (${rel}) OR ${repCond} )
    ${LIMIT ? `LIMIT ${LIMIT}` : ''}`);

console.error(`${WRITE ? 'WRITE' : 'DRY'} — auditing ${rows.length} suspect claims across docs ${DOCS.join(',')} (model ${MODEL})`);
const stats = { selected: rows.length, ok: 0, passive: 0, drop: 0, relabel: 0, failed: 0 };
const samples = [];

let idx = 0;
async function worker() {
  while (idx < rows.length) {
    const c = rows[idx++];
    let res; try { res = await retry(() => chatCompletion([{ role: 'system', content: SYSTEM }, { role: 'user', content: buildUser(c, String(c.para).slice(0, 1500)) }], { provider: 'deepseek', model: MODEL, temperature: 0, maxTokens: 200, responseFormat: { type: 'json_object' } })); }
    catch { stats.failed++; continue; }
    const v = parseVerdict(res.content || ''); if (!v) { stats.failed++; continue; }
    stats[v.verdict]++;
    if (v.verdict === 'ok') continue;
    if (samples.length < 14) samples.push(`[${c.relation}→${v.verdict}${v.better_relation ? ':' + v.better_relation : ''}] ${c.statement.slice(0, 52)} — ${v.why || ''}`);
    if (!WRITE) continue;
    if (v.verdict === 'passive') {
      const nr = c.relation.endsWith('-by') ? c.relation : `${c.relation}-by`;
      await query(`UPDATE entity_claims SET relation=?, statement=? WHERE id=?`, [nr, c.statement.replace(`— ${c.relation}`, `— ${nr}`), c.id]);
    } else if (v.verdict === 'drop') {
      await query(`UPDATE entity_claims SET status='rejected', proof_ok=0 WHERE id=?`, [c.id]);
    } else if (v.verdict === 'relabel' && v.better_relation) {
      await query(`UPDATE entity_claims SET relation=?, statement=? WHERE id=?`, [v.better_relation, c.statement.replace(`— ${c.relation}`, `— ${v.better_relation}`), c.id]);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

console.log(`${WRITE ? 'WROTE' : 'DRY'} — ${JSON.stringify(stats)}`);
console.log('samples:\n  ' + samples.join('\n  '));
process.exit(0);
