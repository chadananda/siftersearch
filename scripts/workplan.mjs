#!/usr/bin/env node
// Claude's side of the WorkPlan (/admin/workplan): add items, set status + a progress note, list. Talks to the edge store
// directly with the internal key (same as tower's relay). Usage:
//   node scripts/workplan.mjs list
//   node scripts/workplan.mjs add "Title" [--detail ..] [--area ..] [--status in_progress] [--note ..] [--by claude]
//   node scripts/workplan.mjs set <id> [--status done] [--note "built X"] [--blocked-on chad] [--title ..] [--detail ..]
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
const [cmd, ...rest] = process.argv.slice(2);
const flag = (k) => (rest.includes(`--${k}`) ? rest[rest.indexOf(`--${k}`) + 1] : undefined);
const EDGE = `${process.env.CLEF_URL || 'https://siftersearch.com'}/_work`;
const call = async (path, body) => {
  const r = await fetch(EDGE + path, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', 'X-Internal-Key': process.env.INTERNAL_API_KEY || '' } });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j;
};
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
if (cmd === 'list') {
  for (const i of (await call('/items')).items) console.log(`#${i.id}\t${i.status}\t${i.area || ''}\t${i.title}${i.note ? `  — ${i.note}` : ''}`);
} else if (cmd === 'add') {
  const { item } = await call('/items', clean({ title: rest[0], detail: flag('detail'), area: flag('area'), status: flag('status'), note: flag('note'), requested_by: flag('by') || 'chad' }));
  console.log(`#${item.id} ${item.status} ${item.title}`);
} else if (cmd === 'set') {
  const { item } = await call(`/items/${rest[0]}`, clean({ status: flag('status'), note: flag('note'), blocked_on: flag('blocked-on'), title: flag('title'), detail: flag('detail'), area: flag('area') }));
  console.log(`#${item.id} ${item.status} ${item.title}${item.note ? ` — ${item.note}` : ''}`);
} else { console.error('usage: list | add "title" [--…] | set <id> [--…]'); process.exit(2); }
