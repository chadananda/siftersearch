// Show the held-ambiguous references (engine pinned NO candidate) with their passage + candidates, so we can
// judge whether they're genuinely low-information (bare roster names) or wrongly held. Read-only.
import { readFileSync } from 'fs';
const dir = 'tmp/entity-research/seqread';
const work = JSON.parse(readFileSync(`${dir}/broad-worklist.json`, 'utf8'));
const dec = JSON.parse(readFileSync(`${dir}/broad-decisions.json`, 'utf8'));
const held = [];
for (let i = 0; i < work.length; i++) {
  const d = dec[i]; if (!d || d.error || !d.decisions) continue;
  if (d.decisions.some(x => x.refers === true)) continue;       // pinned someone -> not held
  held.push({ para: work[i].para, surface: work[i].surface, len: work[i].text.length, text: work[i].text, cands: work[i].candidates.map(c => c.canon) });
}
held.sort((a, b) => a.len - b.len);
const lowInfo = held.filter(h => h.len < 140).length;
console.log(`held-ambiguous: ${held.length} | low-information (<140 chars, i.e. bare list/roster): ${lowInfo} (${Math.round(100 * lowInfo / held.length)}%)\n`);
console.log('=== shortest 22 (the low-information ones) ===');
for (const h of held.slice(0, 22)) console.log(`  p${h.para} "${h.surface}" [${h.cands.join(' / ')}]  ::  ${h.text.slice(0, 90)}`);
console.log('\n=== longest 12 (substantial passages held — these are the ones to scrutinize) ===');
for (const h of held.slice(-12)) console.log(`\n  p${h.para} "${h.surface}" [${h.cands.join(' / ')}]\n    ${h.text.slice(0, 240)}`);
process.exit(0);
