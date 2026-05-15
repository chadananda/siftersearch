#!/usr/bin/env node
// Generate assessment_json for published dialogs that have none.
// Uses gpt-4o to score citation quality, depth, interfaith scope, educational value.
// Patches via PUT /admin/dialogs/:slug.
//
// Usage:
//   node scripts/assess-dialogs.mjs              # all without assessment
//   node scripts/assess-dialogs.mjs --slug my-slug  # specific slug

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
const forceAll = args.includes('--all');

async function assessConversation(body_md) {
  // Extract turn content from body_md for assessment
  const userMatches = [...body_md.matchAll(/<div class="user-turn"[^>]*>([\s\S]*?)<\/div>/g)];
  const jafarMatches = [...body_md.matchAll(/<div class="jafar-turn">([\s\S]*?)<\/div>/g)];

  const transcript = userMatches.map((m, i) => {
    const user = m[1].trim().slice(0, 400);
    const jafar = (jafarMatches[i]?.[1] || '').trim().slice(0, 600);
    return `USER: ${user}\n\nJAFAR: ${jafar}`;
  }).join('\n\n---\n\n');

  const sys = `You are an expert judge evaluating the educational quality of a theological research conversation.

Score each dimension 1-5:

1. citation_quality: Does Jafar cite primary sources directly with markdown links [text](url)? 5=abundant direct quotes with links, 1=pure paraphrase/general claims with no citations
2. intellectual_depth: Does the conversation probe beneath the surface? 5=reaches genuine doctrinal complexity, 1=introductory level
3. interfaith_scope: Does Jafar draw meaningful comparisons across traditions? 5=substantive cross-tradition analysis, 1=single-tradition only
4. educational_value: Would a thoughtful reader learn something specific? 5=highly informative with specific insight, 1=generic or obvious
5. conversation_authenticity: Does the user ask follow-ups that probe Jafar's actual answers? 5=tight reactive questioning, 1=unrelated follow-ups

Output ONLY JSON:
{"citation_quality":N,"intellectual_depth":N,"interfaith_scope":N,"educational_value":N,"conversation_authenticity":N,"overall":N,"summary":"one sentence verdict","strengths":"two specific strengths","weaknesses":"one specific weakness"}

"overall" is holistic (not average). Be strict — 4+ means genuinely excellent.`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: sys }, { role: 'user', content: transcript }],
    temperature: 0.2,
    max_tokens: 400,
    response_format: { type: 'json_object' }
  });
  return JSON.parse(resp.choices[0].message.content);
}

// Fetch all dialogs
const res = await fetch(`${API_BASE}/api/v1/dialogs`);
const { dialogs } = await res.json();

const targets = dialogs.filter(d => {
  if (slugFilter) return d.slug === slugFilter;
  return forceAll || !d.assessment_json;
});

console.log(`Assessing ${targets.length} dialog(s)\n`);

for (const dl of targets) {
  console.log(`[${dl.slug}]`);
  try {
    const r = await fetch(`${API_BASE}/api/v1/dialogs/${dl.slug}`);
    const { dialog } = await r.json();
    if (!dialog?.body_md) { console.log('  ✗ no body_md'); continue; }

    const assessment = await assessConversation(dialog.body_md);
    console.log(`  overall=${assessment.overall} citations=${assessment.citation_quality} depth=${assessment.intellectual_depth} interfaith=${assessment.interfaith_scope}`);
    console.log(`  "${assessment.summary}"`);

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
        rounds_count: dialog.rounds_count,
        round_titles_json: dialog.round_titles_json,
        assessment_json: JSON.stringify(assessment),
        rounds_json: '[]',
        body_md: dialog.body_md,
        status: dialog.status || 'published',
      })
    });

    if (!patchRes.ok) {
      const err = await patchRes.text().catch(() => '');
      console.log(`  ✗ PUT failed ${patchRes.status}: ${err.slice(0, 100)}`);
    } else {
      console.log(`  ✓ assessment saved`);
    }
  } catch (err) {
    console.error(`  ✗ error: ${err.message}`);
  }
  console.log();
}

console.log('Done.');
