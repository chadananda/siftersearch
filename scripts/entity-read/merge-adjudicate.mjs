// Adjudicate the merge backlog from the resolution layer. For each candidate pair, an AI judges whether they are the
// SAME person (same role/era/fate; one's name a known form of the other) — confident-same → mergeEntities (reversible
// audit); uncertain → leave for review. This is the continuous dedup the master-data layer surfaces.
// Run ON tower-nas. Env: WRITE=1 (else dry)
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const ai = await import('../../api/lib/ai.js');
const { queryAll } = await import('../../api/lib/db.js');
const { buildIndex, mergeCandidates, nkey } = await import('../../api/lib/person-resolution.js');
const gdb = await import('../../api/lib/graph-db.js');
const WRITE = process.env.WRITE === '1';
const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();

const people = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.aliases, er.kinship, er.summary, er.research_notes FROM graph_entities ge
  JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person'`);
const byId = new Map(people.map((p) => [p.id, p]));
const pairs = mergeCandidates(buildIndex(people));
console.error(`${pairs.length} merge candidates to adjudicate${WRITE ? ' [WRITE]' : ' [dry]'}`);

const card = (p) => { let al = [], kin = []; try { al = JSON.parse(p.aliases || '[]'); } catch {} try { kin = JSON.parse(p.kinship || '[]'); } catch {}
  return `${p.cn} (imp ${p.imp || 0}); aliases: ${al.slice(0, 6).join(', ') || '—'}; kin: ${kin.slice(0, 4).map((k) => k.relation + ' ' + k.who).join('; ') || '—'}. ${clean(p.summary || '').slice(0, 200)}`; };
const SYS = `You decide whether TWO entity records describe the SAME historical person (a duplicate to merge) or DIFFERENT people who merely share a name/title. Same person ⇒ consistent role, era, place, fate, and kin; one record's name is a known title/variant of the other (e.g. "Muqaddas" = "Mullá Ṣádiq-i-Khurásání"). Different ⇒ different nisba/role/era, or a shared common given-name only. Be conservative: when unsure, say merge=false.
Return ONLY JSON: {"merge":true|false,"confidence":0-1,"keep":"A"|"B" (the more complete/canonical record to keep),"why":"<short>"}.`;

let mergeN = 0, keepN = 0;
for (const pr of pairs) {
  const A = byId.get(pr.a), B = byId.get(pr.b); if (!A || !B) continue;
  try {
    const res = await ai.chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: `A: ${card(A)}\n\nB: ${card(B)}\n\nShared alias: "${pr.shared}".` }],
      { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 250, responseFormat: { type: 'json_object' } });
    const m = (res.content || '').match(/\{[\s\S]*\}/); const v = m ? JSON.parse(m[0]) : {};
    if (v.merge && v.confidence >= 0.75) {
      const keeper = v.keep === 'B' ? B : A; const drop = v.keep === 'B' ? A : B;
      // keep the higher-importance record regardless if the AI's pick is much lower
      const k = (A.imp || 0) >= (B.imp || 0) ? A : B; const d = k === A ? B : A;
      mergeN++;
      console.log(`  MERGE → keep ${k.cn} (imp ${k.imp || 0}) ⨉ drop ${d.cn} [${v.confidence}] ${v.why}`);
      if (WRITE) { try { await gdb.mergeEntities(k.id, [d.id], { reason: `dedup: ${v.why}`.slice(0, 200), evidence: `shared alias "${pr.shared}"` }); } catch (e) { console.log(`    merge ERR ${String(e.message || e).slice(0, 80)}`); } }
    } else { keepN++; console.log(`  keep-separate: ${A.cn} vs ${B.cn} [${v.confidence || 0}] ${v.why || ''}`); }
  } catch (e) { keepN++; }
}
console.log(`\n${WRITE ? 'APPLIED' : 'DRY'} — ${mergeN} merged, ${keepN} kept separate (of ${pairs.length})`);
process.exit(0);
