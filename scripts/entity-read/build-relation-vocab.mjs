// STEP 3 — relation normalization. The GPB claims carry 847 ad-hoc relation strings (a mix of verb-phrases like
// "met-bahaullah"/"father-of" and section/event titles like "Banishment to 'Akká"). This maps each to a CONTROLLED
// vocabulary, extracts embedded target person / place, and flags event-titles (→ participated-in against an event).
// AI classification (one-time, cached). DRY by default: reports the mapping + distribution + events. Run ON tower-nas.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, readFileSync, existsSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const MAPFILE = 'tmp/siftersearch-relation-map.json';

const CONTROLLED = `identity: also-known-as, letter-of-the-living, has-title, has-station
kinship: father-of, mother-of, son-of, daughter-of, brother-of, sister-of, wife-of, husband-of, uncle-of, relative-of
connection: met, accompanied, companion-of, knew, hosted, visited, corresponded-with, addressed-by, taught-by, converted-by, disciple-of, secretary-of, associated-with, prophesied
event: participated-in
office: held-office, appointed-by, ruler-of, cleric
death: martyred, killed, executed, died, imprisoned, exiled
allegiance: believer, covenant-breaker, opponent, pioneer
characterization: characterized-as, testified-about, praised-by, condemned-by, significance`;

const SYS = `Map each RAW relation label from a Bábí/Bahá'í entity database to a CONTROLLED vocabulary key. Each label describes how a PERSON relates to something. Pick exactly one key, extract any embedded target person or place, and flag event/section titles.
CONTROLLED KEYS:
${CONTROLLED}
Rules (Rule — Example):
- A NARRATIVE EVENT or section title → is_event=true, key="participated-in", put the event's short name in "target". Example: "Banishment to 'Akká" → {key:"participated-in", is_event:true, target:"Banishment to 'Akká"}; "Arrival at Badasht" → participated-in / "Badasht".
- A label embedding a target person → set "target" to that person (bahaullah→Bahá'u'lláh, bab→the Báb, abdul-baha→‘Abdu'l-Bahá, mulla-husayn→Mullá Ḥusayn) and key to the bare relation. Example: "met-bahaullah" → {key:"met", target:"Bahá'u'lláh"}; "father-of" → {key:"father-of", target:null}; "addressed-by-bahaullah" → {key:"addressed-by", target:"Bahá'u'lláh"}.
- A label embedding a place → key + place. Example: "martyred-at-yazd" → {key:"martyred", place:"Yazd"}.
- Closest key; if none fits, "characterized-as".
Return ONLY JSON: {"map":[{"i":<index>,"key":"<controlled>","is_event":<true|false>,"target":"<name or null>","place":"<place or null>"}]}.`;

const rc = await queryAll(`SELECT relation, COUNT(*) n FROM entity_claims WHERE import_batch='gpb-v1' GROUP BY relation ORDER BY n DESC`);
console.log(`distinct raw relations: ${rc.length}  (over ${rc.reduce((s, r) => s + r.n, 0)} claims)`);

let map = {}; try { map = JSON.parse(readFileSync(MAPFILE, 'utf8')); } catch { /* fresh */ }
const todo = rc.filter((r) => !(r.relation in map));
console.log(`mapping ${todo.length} (of ${rc.length}; ${rc.length - todo.length} cached)…`);
for (let b = 0; b < todo.length; b += 40) {
  const batch = todo.slice(b, b + 40);
  const items = batch.map((r, i) => ({ i, label: r.relation, count: r.n }));
  try {
    const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: JSON.stringify(items) }],
      { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 3000, responseFormat: { type: 'json_object' } });
    const p = JSON.parse((res.content || '').match(/\{[\s\S]*\}/)[0]);
    for (const m of (p.map || [])) { const r = batch[m.i]; if (r) map[r.relation] = { key: m.key, is_event: !!m.is_event, target: m.target || null, place: m.place || null }; }
  } catch (e) { console.error(`  batch ${b} failed: ${String(e.message).slice(0, 60)}`); }
  writeFileSync(MAPFILE, JSON.stringify(map, null, 0));
  console.error(`  ${Math.min(b + 40, todo.length)}/${todo.length}`);
}

// distribution over CLAIMS
const keyCount = {}; let events = 0, withTarget = 0, withPlace = 0, unmapped = 0; const eventNames = {};
for (const r of rc) { const m = map[r.relation]; if (!m) { unmapped += r.n; continue; }
  keyCount[m.key] = (keyCount[m.key] || 0) + r.n;
  if (m.is_event) { events += r.n; eventNames[m.target || r.relation] = (eventNames[m.target || r.relation] || 0) + r.n; }
  if (m.target) withTarget += r.n; if (m.place) withPlace += r.n; }
console.log(`\n=== controlled-vocab distribution over 1250 claims ===`);
console.log(`controlled keys used: ${Object.keys(keyCount).length}`);
for (const [k, n] of Object.entries(keyCount).sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  ${k}`);
console.log(`\nclaims with extracted target person : ${withTarget}`);
console.log(`claims with extracted place         : ${withPlace}`);
console.log(`event-title claims → participated-in: ${events}  across ${Object.keys(eventNames).length} distinct events`);
console.log(`unmapped claims                     : ${unmapped}`);
console.log(`\ntop events (participant claim counts):`);
for (const [e, n] of Object.entries(eventNames).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`   ${String(n).padStart(3)}  ${e}`);
console.log(`\nsample raw → controlled:`);
for (const r of rc.slice(0, 20)) { const m = map[r.relation] || {}; console.log(`   ${r.relation}  →  ${m.key}${m.target ? ` [target:${m.target}]` : ''}${m.place ? ` [place:${m.place}]` : ''}${m.is_event ? ' [EVENT]' : ''}`); }
console.log(`\nDRY — wrote ${MAPFILE}. Next: apply (set relation=key, resolve target→id, create event entities + participated-in).`);
process.exit(0);
