#!/usr/bin/env node
// Diagnostic (on tower): how often the secondary written-source rule rejects a model's Bahá’u’lláh / Báb / Shoghi Effendi /
// House of Justice label right after an introduction line — i.e. an intro that names the source in a way the rule misses
// ("In one of His Tablets He writes:", "the Pen of the Most High hath affirmed:"). Prints counts + random examples.
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadRows } from './window-core.mjs';
import { secondaryGuard } from '../../api/lib/authorship/window.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true });
const dir = process.argv[2] || '/tank/sifter/authorship/wrun-sec';
const W = ['Bahá’u’lláh', 'The Báb', 'Shoghi Effendi', 'Universal House of Justice'];
let n = 0, rej = 0, rejIntro = 0;
const ex = [], by = {};
for (const f of readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
  const s = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const rel = db.prepare('SELECT religion FROM docs WHERE id = ?').get(s.id)?.religion || '';
  if (!/bah/i.test(rel)) continue;
  const rows = loadRows(db, s.id), raw = new Map(s.labels.map((l) => [l.id, l]));
  rows.forEach((r, i) => {
    const l = raw.get(r.id);
    if (!W.includes(l?.speaker)) return;
    n++;
    const pl = raw.get(rows[i - 1]?.id);
    const g = secondaryGuard({ ...l }, { text: r.text, prevText: rows[i - 1]?.text, prevSpeaker: pl?.speaker, prevRawSpeaker: pl?.speaker, heading: r.heading, bookAuthor: s.author || '' });
    if (!g.unproven) return;
    rej++;
    const p = String(rows[i - 1]?.text || '').trim();
    if (/[:—–]\s*[”"]?\s*$/.test(p)) {
      rejIntro++; by[l.speaker] = (by[l.speaker] || 0) + 1;
      if (ex.length < 30 && Math.random() < 0.04) ex.push(`${l.speaker} | …${p.replace(/\s+/g, ' ').slice(-120)}`);
    }
  });
}
console.log(JSON.stringify({ written_labels: n, rejected: rej, rejected_after_intro: rejIntro, by_speaker: by }));
console.log(ex.join('\n'));
