// Diagnostic: inspect the roster "genuinely-new" proposals (context window + same-core existing entities)
// before creating, to be sure they aren't duplicates the dedup missed. Read-only.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const HON = /^(the |that |mulla |mirza |siyyid |haji |aqa |shaykh |karbila'i |mawlana |mir |akhund )+/;
const core = s => { let n = norm(s).replace(/\s*\([^)]*\)\s*$/, '').replace(/,.*$/, ''); let p; do { p = n; n = n.replace(HON, ''); } while (n !== p); return n.replace(/-i-[a-z‘’'-]+$/, '').replace(/ of [a-z‘’'-]+$/, '').trim(); };
const list = await queryAll("SELECT paragraph_index pi, text FROM content WHERE doc_id=21308 AND heading='List of the martyrs' AND deleted_at IS NULL ORDER BY paragraph_index");
const t = new Map(list.map(r => [r.pi, r.text.replace(/\s+/g, ' ')]));
const persons = await queryAll("SELECT ge.id, er.canonical_name cn, er.summary FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.entity_type='person' AND ge.religion='' WHERE er.entity_type='person'");
const byCore = new Map(); for (const p of persons) { const c = core(p.cn); if (!byCore.has(c)) byCore.set(c, []); byCore.get(c).push(p); }
for (const [para, name] of [[799, 'Mullá Zaynu’l-‘Ábidín'], [811, 'Ḥájí Ḥasan'], [906, 'Mírzá Mihdí'], [956, 'Ḥájí Muḥammad-i-Karrádí']]) {
  const idx = list.findIndex(r => r.pi === para); const win = list.slice(Math.max(0, idx - 3), idx + 2);
  console.log(`\n===== p${para} ${name} (core=${core(name)}) =====`);
  for (const r of win) console.log(`  [${r.pi}]${r.pi === para ? ' <<<' : ''} ${t.get(r.pi).slice(0, 150)}`);
  const c = byCore.get(core(name)) || []; console.log(`  same-core existing (${c.length}): ` + c.map(x => `${x.id}:${x.cn}`).join(' | '));
}
process.exit(0);
