#!/usr/bin/env node
// Seed the DB with all dialog markdown files from src/content/dialogs/.
// Reads each .md, parses frontmatter + body, PUTs to admin API.
// Safe to re-run — each PUT is an upsert.
//
// Usage:
//   node scripts/import-dialogs-to-db.mjs [--slug=009-what-happens...]
//   API_BASE=http://localhost:7839 node scripts/import-dialogs-to-db.mjs

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const API_BASE = process.env.API_BASE || 'https://api.siftersearch.com';
const ADMIN_KEY = process.env.INTERNAL_API_KEY;
const DIALOG_DIR = join(ROOT, 'src/content/dialogs');
const slugFilter = process.argv.find(a => a.startsWith('--slug='))?.split('=')[1];

if (!ADMIN_KEY) { console.error('INTERNAL_API_KEY not set'); process.exit(1); }

// Parse YAML-ish frontmatter (simple key: value — no nested, no anchors)
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  const fmStr = m[1];
  const body = m[2];

  const fm = {};
  // Multi-line values: heroPrompt, narrative etc wrapped in quotes
  const lines = fmStr.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) { i++; continue; }
    const [, key, val] = kv;
    if (val.startsWith('"')) {
      // Quoted string — may span lines if not closed
      let s = val;
      while (!s.endsWith('"') && i + 1 < lines.length) {
        i++;
        s += '\n' + lines[i];
      }
      fm[key] = s.slice(1, -1).replace(/\\"/g, '"');
    } else if (val === '' || val === '|' || val === '>') {
      // Block scalar or array — collect indented lines
      const items = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) {
        i++;
        const item = lines[i].trim();
        if (item.startsWith('- ')) items.push(item.slice(2));
        else items.push(item);
      }
      fm[key] = items.length === 1 ? items[0] : items;
    } else {
      fm[key] = val.trim();
    }
    i++;
  }
  return { fm, body };
}

// Extract round titles from body markdown as [{user, jafar}] pairs
function extractRoundTitles(body) {
  const titles = [];
  const lines = body.split('\n');
  let pending = null;
  for (const line of lines) {
    const h3 = line.match(/^### (.+)$/);
    const h4 = line.match(/^#### (.+)$/);
    if (h3) {
      if (pending) titles.push(pending);
      pending = { user: h3[1].trim(), jafar: '' };
    } else if (h4 && pending) {
      pending.jafar = h4[1].trim();
      titles.push(pending);
      pending = null;
    }
  }
  if (pending) titles.push(pending);
  return titles;
}

// Parse the nested assessment block from frontmatter lines
function extractAssessment(fmStr) {
  const assessMatch = fmStr.match(/^assessment:\n([\s\S]*?)(?=^\w|$)/m);
  if (!assessMatch) return null;
  const block = assessMatch[1];

  const scores = {};
  const scoresMatch = block.match(/scores:\n([\s\S]*?)(?=\n\s*\w+:|$)/);
  if (scoresMatch) {
    for (const m of scoresMatch[1].matchAll(/^\s+(\w+):\s*(\d+)/gm)) {
      scores[m[1]] = parseInt(m[2]);
    }
  }
  const narrativeMatch = block.match(/narrative:\s*"([\s\S]*?)"\n/);
  const flagsMatch = block.match(/flags:\n([\s\S]*?)(?=\n\s*\w+:|$)/);
  const planMatch = block.match(/improvement_plan:\s*"([\s\S]*?)"\n/);

  const flags = [];
  if (flagsMatch) {
    for (const m of flagsMatch[1].matchAll(/^\s+-\s+(.+)/gm)) flags.push(m[1]);
  }

  return {
    scores,
    narrative: narrativeMatch?.[1]?.replace(/\\"/g, '"') || '',
    flags,
    improvement_plan: planMatch?.[1]?.replace(/\\"/g, '"') || '',
  };
}

const files = readdirSync(DIALOG_DIR).filter(f => f.endsWith('.md')).sort();
console.log(`Found ${files.length} dialog files.\n`);

let ok = 0, fail = 0, skip = 0;

for (const file of files) {
  const slug = file.replace(/\.md$/, '');
  if (slugFilter && slug !== slugFilter) continue;

  const text = readFileSync(join(DIALOG_DIR, file), 'utf-8');
  const parsed = parseFrontmatter(text);
  if (!parsed) { console.log(`SKIP ${file} (no frontmatter)`); skip++; continue; }

  const { fm, body } = parsed;

  // Respect the publish gate — don't import unpublished unless it already has a score
  const published = fm.published === 'true' || fm.published === true;
  const status = published ? 'published' : 'draft';

  const rawFm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] || '';
  const assessment = extractAssessment(rawFm);
  const roundTitles = extractRoundTitles(body);

  // Parse arrays from simple YAML list format
  const parseTags = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return val.split(',').map(t => t.trim()).filter(Boolean);
  };

  const tags = parseTags(fm.tags);
  const keywords = parseTags(fm.keywords);
  const score = parseInt(fm.qualityScore) || 0;

  const payload = {
    title: fm.title || slug,
    description: fm.description || '',
    question: fm.question || '',
    topic: fm.topic || null,
    tags_json: JSON.stringify(tags),
    keywords_json: JSON.stringify(keywords),
    excerpt: fm.excerpt || null,
    hero_image: fm.heroImage || null,
    hero_prompt: fm.heroPrompt || null,
    score,
    featured: fm.featured === 'true' || fm.featured === true ? 1 : 0,
    rounds_count: parseInt(fm.rounds) || roundTitles.length,
    round_titles_json: JSON.stringify(roundTitles),
    assessment_json: assessment ? JSON.stringify(assessment) : null,
    body_md: body.trim(),
    status,
  };

  try {
    const res = await fetch(`${API_BASE}/api/v1/admin/dialogs/${slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_KEY },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (res.ok) {
      console.log(`OK   ${slug} (${status}, score=${score})`);
      ok++;
    } else {
      console.error(`FAIL ${slug}: ${JSON.stringify(json)}`);
      fail++;
    }
  } catch (err) {
    console.error(`FAIL ${slug}: ${err.message}`);
    fail++;
  }
}

console.log(`\nDone: ${ok} imported, ${fail} failed, ${skip} skipped.`);
