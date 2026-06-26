import { readFileSync } from 'node:fs';
const eps = JSON.parse(readFileSync('/home/chad/sifter/episodes-db.json', 'utf8'));
console.log(`${eps.length} episodes; ${eps.reduce((s, e) => s + e.participants.length, 0)} participant-roles`);
const N = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const baha = eps.filter((e) => e.participants.some((p) => /baha.?u.?ll/i.test(N(p.name))));
console.log(`\n${baha.length} episodes with Bahá'u'lláh as a participant:`);
for (const e of baha) console.log(`  ■ ${e.name}${e.place ? ' @ ' + e.place : ''} — roster: ${e.participants.map((p) => p.name).join(', ')}`);
console.log('\nSample of 6 other episodes:');
for (const e of eps.filter((e) => !baha.includes(e)).slice(0, 6)) console.log(`  ■ ${e.name} (${e.participants.length}p): ${e.participants.slice(0, 6).map((p) => p.name).join(', ')}`);
