// Cleanup adjudication: for each same-core cluster, give the engine each member's canonical name, DB-mention
// count, summary, and a few real mention snippets, and ask which members are the SAME person (merge) vs
// distinct namesakes — per the entity-research doctrine: a bare name MERGES into its fuller-named twin by
// default; a linking clause ("better known as", "surnamed", "called") = merge; SPLIT/keep-distinct only when
// mentions show different parentage/dates/fate. PROPOSES only (read-only) → cluster-merge-proposals.json.
// LIMIT env caps clusters processed (validation). MINDB skips singleton-mention-only noise if set.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, writeFileSync } from 'fs';
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const DOC = 21308, LIMIT = +(process.env.LIMIT || 0);
const { clusters } = JSON.parse(readFileSync('tmp/entity-research/seqread/cleanup-clusters.json', 'utf8'));
const work = LIMIT ? clusters.slice(0, LIMIT) : clusters;

// gather up to 3 DB mention snippets per member
const allIds = work.flatMap(c => c.members.map(m => m.id));
const cidText = new Map((await queryAll(`SELECT id, paragraph_index pi, substr(replace(text,char(10),' '),1,160) t FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL`)).map(r => [String(r.id), { pi: r.pi, t: r.t }]));
const ment = await graphQueryAll(`SELECT entity_id, content_id FROM entity_mentions WHERE entity_id IN (${allIds.join(',')})`);
const snips = new Map();
for (const m of ment) { const c = cidText.get(String(m.content_id)); if (!c) continue; if (!snips.has(m.entity_id)) snips.set(m.entity_id, []); const a = snips.get(m.entity_id); if (a.length < 3) a.push(c); }

const SYS = `You clean up a Bábí/Bahá'í history entity list. You are given several entities that share a core given name. Your DEFAULT is that they are DISTINCT people — propose a MERGE only on POSITIVE evidence of sameness. DOCTRINE (follow exactly):
- 19th-c. Persians had ~10 given names and NO surnames, so a shared given name is the NORMAL state and is NOT evidence of sameness.
- HARD DISTINCTNESS SIGNALS — if ANY apply, the two are DIFFERENT people; NEVER merge them:
  · ENUMERATION: both are separate entries in a martyr/roster list — markers like "(martyr of <place>)", "(second martyr of <place>)", an ordinal ("second", "third"), or a list number. A roster enumerates DISTINCT individuals; two same-name roster entries are TWO people.
  · different stated KINSHIP ("son of A" vs "son of B"; "brother of X" vs "brother of Y").
  · different nisba/place of origin, or different fate/place/period of death.
- MERGE only when one of these POSITIVE conditions holds:
  · a truly BARE name (just the given name, NO nisba/role/kin/enumeration marker) folds into exactly ONE fuller-named member whose context is compatible (salience/recency coreference); OR
  · an explicit LINKING CLAUSE in a snippet — "better known as", "surnamed", "called", "the same who", "later named", "whose real name was"; OR
  · IDENTICAL full attributes — same nisba AND role AND kin AND fate, with no enumeration marker separating them.
- If two members MIGHT be one but the evidence is incomplete (no linking clause, attributes only partly overlap), do NOT merge — put them in "flags" for human review instead.
Return ONLY JSON: {"merges":[{"keep":<id of the fuller-named/higher-mention>,"absorb":[<id>,...],"evidence":"which positive condition + quote the linking clause if any"}],"flags":[{"ids":[<id>,...],"why":"..."}],"distinct_note":"one line"}. Prefer flags over merges when unsure; empty arrays are fine.`;

const out = []; const CONC = 4;
for (let i = 0; i < work.length; i += CONC) {
  const batch = await Promise.all(work.slice(i, i + CONC).map(async c => {
    const body = c.members.map(m => `- id ${m.id} (${m.db} DB-mentions): "${m.cn}"\n    summary: ${(m.s || '(none)').slice(0, 130)}\n    mentions: ` + (snips.get(m.id) || []).map(s => `[¶${s.pi}] ${s.t}`).join(' // ')).join('\n');
    const prompt = `Core name "${c.core}" — ${c.members.length} entities:\n${body}`;
    try {
      const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: prompt }], { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 700, responseFormat: { type: 'json_object' } });
      const mm = (res.content || '').match(/\{[\s\S]*\}/); const j = mm ? JSON.parse(mm[0]) : {};
      return { core: c.core, n: c.members.length, merges: j.merges || [], flags: j.flags || [], note: j.distinct_note || '' };
    } catch (e) { return { core: c.core, error: String(e).slice(0, 80) }; }
  }));
  out.push(...batch); process.stderr.write(`  ${Math.min(i + CONC, work.length)}/${work.length}\n`);
}
writeFileSync('tmp/entity-research/seqread/cluster-merge-proposals.json', JSON.stringify(out, null, 1));
const withMerges = out.filter(o => o.merges && o.merges.length);
const totalAbsorb = withMerges.reduce((n, o) => n + o.merges.reduce((k, m) => k + (m.absorb || []).length, 0), 0);
const totalFlags = out.reduce((n, o) => n + (o.flags || []).length, 0);
console.log(`clusters adjudicated: ${out.length} | with proposed merges: ${withMerges.length} | entities to absorb: ${totalAbsorb} | flagged for review: ${totalFlags}\n`);
const nameById = new Map(work.flatMap(c => c.members).map(m => [m.id, m.cn]));
const nm = id => nameById.get(id) || '?';
console.log('=== MERGES (positive sameness evidence) ===');
for (const o of withMerges) for (const m of o.merges) console.log(`  [${o.core}] keep ${m.keep} "${nm(m.keep)}" <= ${(m.absorb || []).map(id => `${id} "${nm(id)}"`).join(', ')}\n     ${(m.evidence || '').slice(0, 170)}`);
console.log('\n=== FLAGS (review) ===');
for (const o of out) for (const f of (o.flags || [])) console.log(`  [${o.core}] ${(f.ids || []).map(id => `${id} "${nm(id)}"`).join(' ~ ')}\n     ${(f.why || '').slice(0, 150)}`);
process.exit(0);
