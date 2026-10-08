#!/usr/bin/env node
// Ocean support mail answered by Anís (runs ON tower; Chad hands over the email, approves the answer in chat).
//   node scripts/mail/support.mjs draft <case.json>   → Anís's answer to case.question (an ordinary email-channel turn)
//   node scripts/mail/support.mjs send  <case.json>   → the approved letter via the Worker (/_mail/support): question
//                                                       recorded, person invited, "Chad asked me to answer your letter"
// case.json: { to, name?, subject, question, about?, answer? }  — `send` requires the approved `answer`.
import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(ROOT, f), quiet: true });
const [cmd, file] = process.argv.slice(2);
if (!['draft', 'send'].includes(cmd) || !file) { console.error('usage: support.mjs draft|send <case.json>'); process.exit(2); }
const c = JSON.parse(readFileSync(file, 'utf8'));
const KEY = process.env.INTERNAL_API_KEY;
const post = async (url, body) => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-key': KEY }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok && !out.status) throw new Error(`${url} ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
};

/** A deploy restarts the API (updater); wait for GET /health before calling it, up to 3 minutes. */
async function apiReady(base) {
  for (let i = 0; i < 36; i++) {
    try { if ((await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) })).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`${base}/health not ready after 3 minutes`);
}

if (cmd === 'draft') {
  await apiReady(`http://localhost:${process.env.API_PORT || 7839}`);
  const r = await post(`http://localhost:${process.env.API_PORT || 7839}/api/v1/anis/draft`,
    { messages: [{ role: 'user', content: c.question }], email: c.to });
  c.answer = r.reply;
  writeFileSync(file, JSON.stringify(c, null, 2));                // the draft lands in the case file for Chad's edits
  console.log(JSON.stringify({ status: r.status, triage: r.triage, retrieved: r.retrieved }));
  console.log(r.reply);
} else {
  if (!c.answer) { console.error('no approved answer in the case file'); process.exit(2); }
  console.log(JSON.stringify(await post('https://siftersearch.com/_mail/support', c)));
}
