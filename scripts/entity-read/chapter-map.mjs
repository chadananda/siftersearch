// GPB/DB fast-path ONLY (do NOT assume for other books): parse the source markdown's <h> TOC into a chapter+scene
// hierarchy and assign every DB paragraph its {chapterNum, chapterTitle, scene}. Chapters (h1/h2) become the
// growing-cache segment for disambiguation; scenes (h3/h4) become each paragraph's place/period anchor.
// Matching is by heading TEXT (content.heading holds the leaf h3/h4 label, in reading order) → robust to body drift.
//   node scripts/entity-read/chapter-map.mjs 21308        (prints chapters + verifies mapping around 520-545)
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
const { queryAll } = await import('../../api/lib/db.js');

const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/<br\s*\/?>/gi, ' ').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();

export async function buildSceneMap(doc) {
  const d = (await queryAll(`SELECT file_path FROM docs WHERE id=?`, [doc]))[0];
  if (!d?.file_path) throw new Error(`no file_path for doc ${doc}`);
  const base = d.file_path.split('/').pop();
  const found = execSync(`find "$HOME/Dropbox" /tank/dropbox -name ${JSON.stringify(base)} 2>/dev/null | head -1`, { encoding: 'utf8' }).trim();
  if (!found) throw new Error(`source markdown not found for ${base}`);
  const lines = readFileSync(found, 'utf8').split('\n');
  const scenes = []; let chapterNum = '', chapterTitle = '', period = '';
  // Chapter markers differ by book: DB uses `# CHAPTER I` (h1, section-header); GPB uses `### \- Chapter I -`
  // (h3) grouped under `## First Period …` headings. Detect a chapter by the heading TEXT, not its level/class.
  const chapRe = /^-?\s*chapter\s+[ivxlcdm\d]+\s*-?$/i;   // whole heading is just "Chapter N" (either book)
  const periodRe = /\bperiod\b.*\d{4}/i;                  // GPB grouping: "First Period - The Ministry… - 1844–1853"
  for (const ln of lines) {
    const m = ln.match(/^(#{1,4})\s+(.*?)\s*(\{[^}]*\})?\s*$/);
    if (!m) continue;
    const level = m[1].length; const text = m[2].replace(/<br\s*\/?>/gi, ' ').replace(/\\/g, '').replace(/\s+/g, ' ').trim(); const attrs = m[3] || '';
    if (!text) continue;
    if (chapRe.test(text) || (level === 1 && /toc1|section header/i.test(attrs))) { chapterNum = text.replace(/^-\s*/, '').replace(/\s*-$/, '').trim(); chapterTitle = period || ''; continue; }
    if (periodRe.test(text)) { period = text; chapterTitle = text; continue; }          // GPB period → chapter title context
    if (level === 2 && /chapter header/i.test(attrs)) { chapterTitle = text; continue; } // DB chapter title
    scenes.push({ chapterNum, chapterTitle, scene: text, level, key: nrm(text) });        // h3/h4 subheaders = scenes
  }
  return { file: found, scenes };
}

// Assign each content paragraph (in reading order) a chapter/scene by advancing a pointer through the scene list
// as content.heading changes (matched by normalized text).
export async function assignChapters(doc) {
  const { scenes } = await buildSceneMap(doc);
  const byKey = new Map(); scenes.forEach((s, i) => { if (!byKey.has(s.key)) byKey.set(s.key, i); });
  const paras = await queryAll(`SELECT external_para_id pid, paragraph_index pidx, heading FROM content WHERE doc_id=? AND deleted_at IS NULL AND blocktype='paragraph' ORDER BY paragraph_index`, [doc]);
  let ptr = -1; const out = [];
  let lastHeading = null;
  for (const p of paras) {
    if (p.heading !== lastHeading) { lastHeading = p.heading; const k = nrm(p.heading);
      // advance forward to the next scene matching this heading (bounded look-ahead), else keep pointer
      let hit = -1; for (let j = ptr + 1; j < Math.min(scenes.length, ptr + 60); j++) if (scenes[j].key === k) { hit = j; break; }
      if (hit < 0 && byKey.has(k)) hit = byKey.get(k); // fallback: first global match
      if (hit >= 0) ptr = hit;
    }
    const s = scenes[ptr] || {};
    out.push({ pid: p.pid, pidx: p.pidx, chapterNum: s.chapterNum || '', chapterTitle: s.chapterTitle || '', scene: s.scene || p.heading || '' });
  }
  return { scenes, paras: out };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const doc = +process.argv[2] || 21308;
  const { scenes } = await buildSceneMap(doc);
  const chapters = [...new Map(scenes.filter((s) => s.chapterNum).map((s) => [s.chapterNum, s.chapterTitle])).entries()];
  console.log(`doc ${doc}: ${scenes.length} scenes across ${chapters.length} chapters`);
  chapters.forEach(([n, t]) => console.log(`  ${n} — ${t}`));
  const { paras } = await assignChapters(doc);
  console.log(`\nmapping check (pid 520..545):`);
  for (const p of paras.filter((x) => { const n = +String(x.pid).replace(/\D/g, ''); return n >= 520 && n <= 545; }))
    console.log(`  ${p.pid}: [${p.chapterNum} / ${(p.chapterTitle || '').slice(0, 30)}] scene="${(p.scene || '').slice(0, 45)}"`);
  process.exit(0);
}
