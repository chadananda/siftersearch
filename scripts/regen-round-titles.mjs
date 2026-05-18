#!/usr/bin/env node
// Regenerate round_titles_json for published dialogs using the improved
// generateRoundSummaries prompt (with 1000-char content slices instead of 600).
// Patches via PUT /admin/dialogs/:slug.
//
// Usage:
//   node scripts/regen-round-titles.mjs                  # all dialogs
//   node scripts/regen-round-titles.mjs --slug my-slug   # specific slug

import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const API_BASE = 'https://api.siftersearch.com';
const ADMIN_KEY = process.env.INTERNAL_API_KEY;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const args = process.argv.slice(2);
const slugFilter = args.find(a => a.startsWith('--slug='))?.split('=')[1]
  || (args.indexOf('--slug') >= 0 ? args[args.indexOf('--slug') + 1] : null);

function pairRounds(body_md) {
  const userRegex = /<div class="user-turn"[^>]*>([\s\S]*?)<\/div>/g;
  const jafarRegex = /<div class="jafar-turn">([\s\S]*?)<\/div>/g;
  const users = [], jafars = [];
  let m;
  while ((m = userRegex.exec(body_md)) !== null) users.push(m[1].trim());
  while ((m = jafarRegex.exec(body_md)) !== null) jafars.push(m[1].trim());
  return users.map((u, i) => ({ user: u, jafar: jafars[i] || '' }));
}

async function generateRoundSummaries(rounds) {
  const sys = `For each round of a conversation, write TWO short titles in STRICT formats:

1. "question": A real QUESTION the user is asking (4-8 words, MUST end with "?"). Capture the specific substance, not just the topic.
   GOOD: "Does Anatta Refute Personal Identity?" / "Is Consultation a Spiritual Act?"
   BAD: "Distinction in Bahá'í consultation practice" (topic label — NOT a question, missing "?")

2. "answer": A declarative summary of Jafar's response (4-8 words, no "?"). Name the key claim or finding — what a reader should remember.
   GOOD: "Anatta Addresses Ego, Not the Soul." / "Consultation Transforms Disagreement Into Service."
   BAD: "Bahá'í vision emphasizes global unity." (too vague — what specifically about unity?)

Sentence case. Concrete and specific. BOTH fields required for every round.

Output ONLY JSON: {"rounds":[{"question":"...","answer":"..."},...]} with EXACTLY ${rounds.length} entries.`;

  const user = rounds.map((r, i) =>
    `Round ${i + 1}:\nUSER: ${(r.user || '').slice(0, 800)}\nJAFAR: ${(r.jafar || '').replace(/<[^>]+>/g, '').slice(0, 1000)}`
  ).join('\n\n');

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    temperature: 0.3,
    max_tokens: 900,
    response_format: { type: 'json_object' }
  });
  const parsed = JSON.parse(resp.choices[0].message.content);
  return Array.isArray(parsed.rounds) ? parsed.rounds : [];
}

// Fetch all dialogs
const res = await fetch(`${API_BASE}/api/v1/dialogs`);
const { dialogs } = await res.json();
const targets = slugFilter ? dialogs.filter(d => d.slug === slugFilter) : dialogs;

console.log(`Regenerating round titles for ${targets.length} dialog(s)\n`);

for (const dl of targets) {
  console.log(`[${dl.slug}]`);
  try {
    // Fetch full dialog with body_md
    const r = await fetch(`${API_BASE}/api/v1/dialogs/${dl.slug}`);
    const { dialog } = await r.json();
    if (!dialog?.body_md) { console.log('  ✗ no body_md'); continue; }

    const rounds = pairRounds(dialog.body_md);
    if (!rounds.length) { console.log('  ✗ no rounds parsed'); continue; }

    console.log(`  generating titles for ${rounds.length} rounds...`);
    const summaries = await generateRoundSummaries(rounds);

    const roundTitlesJson = JSON.stringify(
      summaries.map(rs => ({ user: rs.question || '', jafar: rs.answer || '' }))
    );

    // Rebuild body_md with new h3/h4 headings
    const bodyParts = [];
    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i];
      const rs = summaries[i] || {};
      const n = i + 1;
      bodyParts.push(`### ${rs.question || `Round ${n}`}`, '');
      bodyParts.push(`<div class="user-turn" id="round-${n}">`, '', r.user, '', '</div>', '');
      bodyParts.push(`#### ${rs.answer || `Response ${n}`}`, '');
      bodyParts.push(`<div class="jafar-turn">`, '', r.jafar, '', '</div>', '');
    }
    const body_md = bodyParts.join('\n');

    // Update via PUT — requires title + body_md, pass all existing fields through
    const patchRes = await fetch(`${API_BASE}/api/v1/admin/dialogs/${dl.slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_KEY },
      body: JSON.stringify({
        title: dialog.title,
        description: dialog.description,
        question: dialog.question,
        topic: dialog.topic,
        tags_json: dialog.tags_json,
        keywords_json: dialog.keywords_json,
        excerpt: dialog.excerpt,
        hero_image: dialog.hero_image,
        hero_prompt: dialog.hero_prompt,
        score: dialog.score || 0,
        featured: dialog.featured ? 1 : 0,
        rounds_count: rounds.length,
        round_titles_json: roundTitlesJson,
        assessment_json: dialog.assessment_json,
        rounds_json: '[]',
        body_md,
        status: dialog.status || 'published',
      })
    });
    if (!patchRes.ok) {
      const err = await patchRes.text().catch(() => '');
      console.log(`  ✗ patch failed ${patchRes.status}: ${err.slice(0, 100)}`);
      continue;
    }

    console.log('  ✓ updated round titles:');
    summaries.forEach((s, i) => console.log(`    R${i+1}: ${s.question} / ${s.answer}`));
  } catch (err) {
    console.error(`  ✗ error: ${err.message}`);
  }
  console.log();
}

console.log('Done.');
