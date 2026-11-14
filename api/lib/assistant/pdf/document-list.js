// The documents Anís made, from tower's own copy (DOCS_LOCAL_DIR, documents.js keepLocal): every PDF with its title, size,
// date and short link — the admin's Documents tab. Newest first. Deps: node fs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { SHORT_BASE } from './documents.js';

async function walk(dir, out = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out); else out.push(p);
  }
  return out;
}

export async function listDocuments({ dir = process.env.DOCS_LOCAL_DIR || '/tank/documents', limit = 500, shortBase = SHORT_BASE } = {}) {
  const root = path.join(dir, 'anis');
  const short = new Map();   // stored key → { code, title }
  for (const f of await walk(path.join(root, 's'))) {
    const m = JSON.parse(await fs.readFile(f, 'utf8').catch(() => 'null'));
    const key = m?.url && /\/(anis\/pdf\/.+)$/.exec(m.url)?.[1];
    if (key) short.set(key, { code: path.basename(f, '.json'), title: m.title });
  }
  const docs = [];
  for (const f of (await walk(path.join(root, 'pdf'))).filter((x) => x.endsWith('.pdf'))) {
    const st = await fs.stat(f), key = path.relative(dir, f), s = short.get(key);
    docs.push({ key, title: s?.title || path.basename(f, '.pdf').replace(/^anis-/, '').replace(/-/g, ' '), bytes: st.size,
      at: st.mtime.toISOString(), cached: key.startsWith('anis/pdf/c/'), short: s && shortBase ? `${shortBase}/${s.code}` : null });
  }
  return docs.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
