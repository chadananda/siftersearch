#!/usr/bin/env node
// HyPE batch CLI (runs on tower: submit/collect are light; the work happens at the provider). State: data/run/hype-batch/state.json.
//   node scripts/pipeline/hype-batch.mjs submit --core [--limit 500] [--no-disambig]   core roster, anchor order
//   node scripts/pipeline/hype-batch.mjs submit --docs 20809,20810 [--limit N] [--upgrade]
//   node scripts/pipeline/hype-batch.mjs collect | status | run (submit+wait+collect)
// Rest of the library: pass --file ids.json (doc ids in the priority order you want). Env: HYPE_MODE=sync is the live path (not this tool).
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
process.env.SIFTER_WRITER_URL ||= 'http://127.0.0.1:7849';
import fs from 'node:fs';
const [cmd = 'status', ...rest] = process.argv.slice(2);
const flag = (k) => rest.includes(`--${k}`), val = (k) => (flag(k) ? rest[rest.indexOf(`--${k}`) + 1] : undefined);
const { makeHypeBatch } = await import('../../api/lib/pipeline/hype-batch-app.js');
const hb = makeHypeBatch();
const opts = { limit: val('limit') ? Number(val('limit')) : Infinity, noDisambig: flag('no-disambig'), upgrade: flag('upgrade') };
let docs = [];
if (flag('core')) { const { anchorOrder } = await import('../../api/lib/rag/concepts/core-roster.js'); docs = anchorOrder().map((r) => r.docId); }
else if (val('docs')) docs = val('docs').split(',').map(Number).filter(Boolean);
else if (val('file')) docs = JSON.parse(fs.readFileSync(val('file'), 'utf8')).map(Number).filter(Boolean);
const show = (o) => console.log(JSON.stringify(o, null, 1));
if (cmd === 'submit') show(await hb.submit(docs, opts));
else if (cmd === 'collect') show(await hb.collect());
else if (cmd === 'run') show(await hb.run(docs, opts));
else show(hb.status());
process.exit(0);
