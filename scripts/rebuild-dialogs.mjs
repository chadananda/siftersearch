#!/usr/bin/env node
// Rebuild published dialogs from saved history files.
// Applies FIXED anonymization (user turns only — preserves Jafar citation links),
// regenerates round summaries, rebuilds body_md with h3/h4 headings.
// Patches via PUT /admin/dialogs/:slug.
//
// Usage:
//   node scripts/rebuild-dialogs.mjs              # all seeds with done.json
//   node scripts/rebuild-dialogs.mjs --seed 22    # specific seed index

import dotenv from 'dotenv';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const API_BASE = 'https://api.siftersearch.com';
const ADMIN_KEY = process.env.INTERNAL_API_KEY;
const TMP_DIR = join(ROOT, 'tmp/dialogs');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const args = process.argv.slice(2);
const seedFilter = args.find(a => a.startsWith('--seed='))?.split('=')[1]
  || (args.indexOf('--seed') >= 0 ? args[args.indexOf('--seed') + 1] : null);

// ── Regex scrub (mirrors publish-pipeline.js) ──────────────────────────────
function regexScrub(text) {
  return text
    .replace(/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi, '[email]')
    .replace(/\b(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)(\d{3}[\s.-]?\d{4})\b/g, '[phone]')
    .replace(/\bmy name is\s+\w+/gi, 'I am a seeker')
    .replace(/\bcall me\s+\w+/gi, 'call me a seeker')
    .replace(/\bI(?:'m| am)\s+([A-Z][a-z]+)(?=\s+and\b|\s+from\b|,)/g, 'I am someone');
}

// ── Anonymize USER turns only — assistant turns pass through unchanged ──────
async function anonymizeUserTurns(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const preScrubbedMessages = messages.map(m => ({
    ...m,
    content: typeof m.content === 'string' ? regexScrub(m.content) : m.content
  }));

  const userMessages = preScrubbedMessages.filter(m => m.role === 'user');
  if (userMessages.length === 0) return preScrubbedMessages;

  const userTexts = userMessages.map(m => ({ role: m.role, text: m.content }));

  const sys = `Sanitize user messages for public publication. For EACH message:
- Remove or replace personal names (first or last) with neutral terms ("a seeker", "someone", "they")
- Remove specific locations (cities, neighborhoods, workplaces, schools) unless they are publicly known religious sites
- Remove identifying biographical details (specific age, profession + employer, family member names)
- Remove any remaining contact info ([email], [phone] markers are already stripped — catch anything the regex missed)
- Keep: the substance of the question, references to publicly-known figures (Bahá'u'lláh, the Buddha, etc.), book titles, doctrinal terms
- If a message has no PII, return it unchanged

Output JSON: {"messages":[{"role":"...","text":"..."},...]} with EXACTLY ${userTexts.length} entries in order.`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(userTexts) }],
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    });
    const parsed = JSON.parse(resp.choices[0].message.content);
    const sanitized = parsed.messages;

    if (Array.isArray(sanitized) && sanitized.length === userTexts.length) {
      let userIdx = 0;
      return preScrubbedMessages.map(m => {
        if (m.role === 'user') {
          return { ...m, content: sanitized[userIdx++]?.text ?? m.content };
        }
        return m; // assistant: regex-scrubbed only, citation links preserved
      });
    }
  } catch (err) {
    console.error(`  anonymize LLM failed: ${err.message}`);
  }

  return preScrubbedMessages;
}

// ── Pair messages into rounds ──────────────────────────────────────────────
function pairRounds(messages) {
  const rounds = [];
  for (let i = 0; i < messages.length; i += 2) {
    const u = messages[i];
    const a = messages[i + 1];
    if (!u || u.role !== 'user') break;
    rounds.push({ user: u.content, jafar: a && a.role === 'assistant' ? a.content : '' });
  }
  return rounds;
}

// ── Generate round summaries ───────────────────────────────────────────────
async function generateRoundSummaries(rounds) {
  const sys = `For each round of a conversation, write TWO short titles in STRICT formats:

1. "question": A real QUESTION the user is asking (4-8 words, MUST end with "?"). Capture the specific substance, not just the topic.
   GOOD: "Does Anatta Refute Personal Identity?" / "Is Consultation a Spiritual Act?"
   BAD: "Distinction in Bahá'í consultation practice" (topic label — NOT a question, missing "?")

2. "answer": A declarative summary of Jafar's response (4-8 words, no "?"). Name the key claim or finding.
   GOOD: "Anatta Addresses Ego, Not the Soul." / "Consultation Transforms Disagreement Into Service."
   BAD: "Bahá'í vision emphasizes global unity." (too vague)

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

// ── Build body_md from anonymized messages + summaries ─────────────────────
function buildBodyMd(rounds, summaries) {
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
  return bodyParts.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────
const files = readdirSync(TMP_DIR).filter(f => f.endsWith('-done.json'));
const seeds = files.map(f => {
  const done = JSON.parse(readFileSync(join(TMP_DIR, f), 'utf-8'));
  const seedIdx = done.seedIdx;
  const histPath = join(TMP_DIR, `seed-${String(seedIdx).padStart(3, '0')}-history.json`);
  if (!existsSync(histPath)) return null;
  return { seedIdx, slug: done.slug, histPath };
}).filter(Boolean);

const targets = seedFilter
  ? seeds.filter(s => String(s.seedIdx) === String(seedFilter))
  : seeds;

console.log(`Rebuilding ${targets.length} dialog(s) from history files\n`);

for (const { seedIdx, slug, histPath } of targets) {
  console.log(`[${slug}] (seed ${seedIdx})`);
  try {
    const history = JSON.parse(readFileSync(histPath, 'utf-8'));
    console.log(`  ${history.length} messages in history`);

    // Fetch existing dialog metadata
    const metaRes = await fetch(`${API_BASE}/api/v1/dialogs/${slug}`);
    if (!metaRes.ok) { console.log(`  ✗ could not fetch dialog ${metaRes.status}`); continue; }
    const { dialog } = await metaRes.json();
    if (!dialog) { console.log(`  ✗ dialog not found`); continue; }

    // Anonymize user turns only (preserves Jafar citation links)
    console.log(`  anonymizing user turns...`);
    const cleanMessages = await anonymizeUserTurns(history);

    // Count citations in Jafar turns before/after
    const originalCitations = history.filter(m => m.role === 'assistant')
      .reduce((n, m) => n + (m.content.match(/\[.*?\]\(https?:\/\//g) || []).length, 0);
    const cleanCitations = cleanMessages.filter(m => m.role === 'assistant')
      .reduce((n, m) => n + (m.content.match(/\[.*?\]\(https?:\/\//g) || []).length, 0);
    console.log(`  citations: ${originalCitations} original → ${cleanCitations} after anonymize`);

    const rounds = pairRounds(cleanMessages);
    console.log(`  generating round summaries for ${rounds.length} rounds...`);
    const summaries = await generateRoundSummaries(rounds);

    const roundTitlesJson = JSON.stringify(
      summaries.map(rs => ({ user: rs.question || '', jafar: rs.answer || '' }))
    );
    const body_md = buildBodyMd(rounds, summaries);

    // Verify citations in final body_md
    const finalCitations = (body_md.match(/\[.*?\]\(https?:\/\//g) || []).length;
    console.log(`  citations in final body_md: ${finalCitations}`);

    const patchRes = await fetch(`${API_BASE}/api/v1/admin/dialogs/${slug}`, {
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
      console.log(`  ✗ PUT failed ${patchRes.status}: ${err.slice(0, 100)}`);
      continue;
    }

    console.log(`  ✓ rebuilt — ${finalCitations} citations, ${summaries.length} round titles`);
    summaries.forEach((s, i) => console.log(`    R${i+1}: ${s.question} / ${s.answer}`));
  } catch (err) {
    console.error(`  ✗ error: ${err.message}`);
  }
  console.log();
}

console.log('Done.');
