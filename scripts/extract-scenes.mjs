// Extract SCENES (people physically together) per paragraph with DeepSeek, verify each proof verbatim, and bind
// participants to entities: first among the people named or mentioned in THIS paragraph, then among those the same
// BOOK mentions — exactly one match binds, otherwise the name is kept unbound (never guessed).
// Paragraphs considered: prose with ≥2 known people named or mentioned. Options: --doc=ID[,ID…] (default: pilot
// books), --write (else dry: report only), --limit=N paragraphs, --concurrency=N. Output logs/extract-scenes-<ts>.json.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
const { queryAll, transaction } = await import('../api/lib/db.js');
const { chatCompletion } = await import('../api/lib/ai.js');
const { getEncounterIndex, namedBy, fold } = await import('../api/lib/encounters.js');
const { SYSTEM, buildUser, parseScenes, proofInParagraph, bindParticipant, SCENE_VERSION } = await import('../api/lib/scenes.js');

const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : undefined; };
const WRITE = process.argv.includes('--write');
const DOCS = (arg('doc') || '3887').split(',').map(Number).filter(Boolean);
const LIMIT = Number(arg('limit')) || 1e9;
const CC = Number(arg('concurrency')) || 8;
const MODEL = 'deepseek-v4-flash';
const idx = await getEncounterIndex();

const nameKey = (s) => fold(s).trim().replace(/^(the|a) /, '');
// Does a participant name (as the paragraph writes it) belong to this candidate? Same name, bare name, or the
// written name is the leading part of one of theirs ("Mullá Sadiq" ↔ "Mullá Ṣádiq-i-Khurásání") or vice versa.
const matches = (name, cand) => {
  const n = nameKey(name);
  return !!n && cand.forms.some((f) => f.phrase === n || f.bare === n || f.phrase.startsWith(`${n} `) || n.startsWith(`${f.phrase} `));
};
const report = { mode: WRITE ? 'write' : 'dry', docs: DOCS, paragraphs: 0, considered: 0, scenes: 0, proofRejected: 0, participants: 0,
  boundPara: 0, boundBook: 0, unbound: 0, parseFail: 0, errors: 0, tokens: { prompt: 0, completion: 0 }, samples: [] };

for (const docId of DOCS) {
  const title = (await queryAll(`SELECT title FROM docs WHERE id = ?`, [docId]))[0]?.title || `doc ${docId}`;
  const paras = (await queryAll(`SELECT id, external_para_id, text, context FROM content WHERE doc_id = ? AND deleted_at IS NULL AND text IS NOT NULL ORDER BY paragraph_index`, [docId])).slice(0, LIMIT);
  const mentions = await queryAll(`SELECT para_id, entity_id FROM entity_mentions_v2 WHERE doc_id = ? AND entity_id IS NOT NULL`, [docId]);
  const byPara = new Map();
  for (const m of mentions) (byPara.get(m.para_id) || byPara.set(m.para_id, new Set()).get(m.para_id)).add(m.entity_id);
  const bookIds = new Set(mentions.map((m) => m.entity_id));
  // Text-named people (unique name forms) join the paragraph's candidates and the book's.
  const named = new Map();
  for (const p of paras) {
    const hay = fold(p.text); const ids = new Set();
    for (const w of new Set(hay.trim().split(' '))) for (const id of idx.byWord.get(w) || []) if (namedBy(hay, idx.people.get(id))) ids.add(id);
    named.set(p.id, ids); for (const id of ids) bookIds.add(id);
  }
  const bookCands = [...bookIds].map((id) => idx.people.get(id)).filter(Boolean);
  // Candidates shown to the model: the paragraph's people, the book's most-mentioned people, and the central figures.
  const bookCount = new Map();
  for (const m of mentions) bookCount.set(m.entity_id, (bookCount.get(m.entity_id) || 0) + 1);
  const topBook = [...bookCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([id]) => id);
  const CENTRAL = [1247551, 1247562, 1247563, 1247564, 1247552, 1247554, 1248214];
  const show = (ids) => [...new Set(ids)].map((id) => idx.people.get(id)).filter(Boolean)
    .map((p) => ({ id: p.id, name: p.name, aliases: p.forms.filter((f) => !f.canonical).map((f) => f.phrase).slice(0, 4) }));
  const work = paras.map((p) => ({ p, pid: p.external_para_id || `p${p.id}`, ids: new Set([...(byPara.get(p.external_para_id || `p${p.id}`) || []), ...named.get(p.id)]) }))
    .filter((w) => w.ids.size >= 2);
  report.paragraphs += paras.length; report.considered += work.length;
  let next = 0;
  await Promise.all(Array.from({ length: CC }, async () => {
    while (next < work.length) {
      const { p, pid, ids } = work[next++];
      try {
        const shown = show([...ids, ...topBook, ...CENTRAL]);
        const shownIds = new Set(shown.map((c) => c.id));
        const r = await chatCompletion([{ role: 'system', content: SYSTEM }, { role: 'user', content: buildUser({ ...p, title }, shown) }],
          { provider: 'deepseek', model: MODEL, temperature: 0, maxTokens: 1200, responseFormat: { type: 'json_object' }, caller: 'extract-scenes' });
        report.tokens.prompt += r.usage?.promptTokens || 0; report.tokens.completion += r.usage?.completionTokens || 0;
        const scenes = parseScenes(r.content);
        if (!scenes) { report.parseFail++; continue; }
        const paraCands = [...ids].map((id) => idx.people.get(id)).filter(Boolean);
        const stmts = [];
        for (const s of scenes) {
          if (!proofInParagraph(s.proof, p.text)) { report.proofRejected++; continue; }
          report.scenes++;
          const parts = s.participants.map((x) => {
            // The model's pick from the numbered list (in context) first; a number outside the list is refused.
            let id = x.id && shownIds.has(x.id) ? x.id : null, basis = id ? 'model' : null;
            if (!id) { id = bindParticipant(x.name, paraCands, matches); basis = id ? 'paragraph' : null; }
            if (!id) { id = bindParticipant(x.name, bookCands, matches); basis = id ? 'book' : null; }
            report.participants++; if (basis === 'model') report.boundModel = (report.boundModel || 0) + 1; else if (basis === 'paragraph') report.boundPara++; else if (basis === 'book') report.boundBook++; else report.unbound++;
            return { ...x, id, basis, bound: id ? idx.people.get(id)?.name : null };
          });
          if (report.samples.length < 40) report.samples.push({ book: title, pid, place: s.place, time: s.time, summary: s.summary, proof: s.proof, participants: parts.map((x) => `${x.name}${x.role ? ` (${x.role})` : ''} → ${x.bound || 'UNBOUND'}`) });
          const year = Number((String(s.time || '').match(/\b(1[6-9]\d\d)\b/) || [])[1]) || null;
          const hash = createHash('sha1').update(`${docId}|${pid}|${s.proof}`).digest('hex').slice(0, 16);
          stmts.push({ sql: `INSERT OR IGNORE INTO entity_scenes (scene_hash, doc_id, para_id, place, time_text, year, summary, proof, extractor_version) VALUES (?,?,?,?,?,?,?,?,?)`,
            args: [hash, docId, pid, s.place, s.time, year, s.summary, s.proof, SCENE_VERSION] });
          for (const x of parts) stmts.push({ sql: `INSERT OR IGNORE INTO scene_participants (scene_id, name, role, entity_id, bind_basis)
              SELECT id, ?, ?, ?, ? FROM entity_scenes WHERE scene_hash = ?`, args: [x.name, x.role, x.id, x.basis, hash] });
        }
        if (WRITE && stmts.length) await transaction(stmts, 'extract-scenes');
      } catch (err) { report.errors++; if (report.errors <= 5) console.error(`scene error ${pid}: ${err.message}`); }
    }
  }));
  console.log(`book ${docId} done · considered ${work.length} · scenes ${report.scenes}`);
}
mkdirSync('logs', { recursive: true });
const file = `logs/extract-scenes-${report.mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify(report, null, 1));
const { samples, ...summary } = report;
console.log(`REPORT ${file}`);
console.log(JSON.stringify(summary));
process.exit(0);
