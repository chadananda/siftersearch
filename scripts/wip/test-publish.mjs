// Local test of publish-pipeline.js — reads a history JSON, generates SEO
// metadata + round summaries via gpt-4o, writes the dialog markdown.
// This is the integration test for Task #9 (save-conversation pipeline).

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });

const TOPICS = ['theology','ethics','social-order','politics','history','comparative-religion','mysticism','practice','modern-challenges','word-meaning','metaphysics','philosophy'];

const args = process.argv.slice(2);
const historyPath = args[0];
const outDir = args[1] || join(ROOT, 'src/content/dialogs');
const idx = parseInt(args[2] || '999');
const score = args[3] ? parseInt(args[3]) : null;
const scoresJson = args[4] ? JSON.parse(args[4]) : null;
const narrative = args[5] || '';
const flags = args[6] ? args[6].split(',') : [];
const improvementPlan = args[7] || '';

const messages = JSON.parse(readFileSync(historyPath, 'utf-8'));
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function slugify(s) {
  const diacritics = { 'á':'a','à':'a','ä':'a','â':'a','ā':'a','é':'e','è':'e','ë':'e','ê':'e','ē':'e','í':'i','ì':'i','ï':'i','î':'i','ī':'i','ó':'o','ò':'o','ö':'o','ô':'o','ō':'o','ú':'u','ù':'u','ü':'u','û':'u','ū':'u','ñ':'n','ç':'c','ḥ':'h','ṣ':'s','ṭ':'t','ḍ':'d' };
  return s.toLowerCase().split('').map(c => diacritics[c] || c).join('').replace(/[''`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-').substring(0, 70);
}

function pairRounds(messages) {
  const rounds = [];
  for (let i = 0; i < messages.length; i += 2) {
    const u = messages[i], a = messages[i + 1];
    if (!u || u.role !== 'user') break;
    rounds.push({ user: u.content, jafar: a && a.role === 'assistant' ? a.content : '' });
  }
  return rounds;
}

async function generatePublishMetadata(messages, topic_hint) {
  const transcript = messages.map((m, i) => {
    const role = m.role === 'user' ? 'USER' : 'JAFAR';
    return `${role} [round ${Math.floor(i/2)+1}]: ${m.content}`;
  }).join('\n\n');
  const sys = `You generate publish-ready SEO metadata for a long-form conversation between a user and an AI research assistant (Jafar). Output JSON ONLY.

CONVENTIONS:
- title: phrased as a QUESTION ending in "?". This is the biggest under-discussion question of the conversation — what a thoughtful reader would google. Title-case the substantive words. 60-90 chars.
- description: the OVERVIEW ANSWER, not a topic summary. Lead with the actual position or finding from the conversation. Concrete, primary-source-grounded. 220-320 chars.
- slug: lowercase ASCII, hyphen-separated, derived from title. Strip stopwords (the, a, of, and). 4-9 words. No question mark.
- topic: ONE value from this enum: ${TOPICS.join(', ')}. Pick the single best fit.
- tags: 5-8 lowercase hyphen-separated tags. Include relevant religion (e.g. "bahai"), key figures named in the conversation ("bahaullah", "abdul-baha", "shoghi-effendi"), the named work if any ("tablet-of-wisdom", "kitab-i-iqan"), and topical tags ("materialism", "calligraphy", "music").
- keywords: 5-7 short search phrases a user would type to find this conversation, in natural English (not hyphen form). Include at least one alternate phrasing of the title.
- excerpt: a 140-180 char single-sentence pull quote that names the central tension or claim — for listing cards.

OUTPUT: {"title":"...","description":"...","slug":"...","topic":"...","tags":[...],"keywords":[...],"excerpt":"..."}`;
  const user = `Generate metadata for this conversation.\n\n${topic_hint ? `Topic hint: ${topic_hint}\n\n` : ''}Transcript:\n\n${transcript.length > 18000 ? transcript.slice(0, 18000) + '\n[truncated]' : transcript}`;
  const r = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    temperature: 0.4,
    max_tokens: 700,
    response_format: { type: 'json_object' }
  });
  const p = JSON.parse(r.choices[0].message.content);
  return {
    title: String(p.title || '').trim(),
    description: String(p.description || '').trim(),
    slug: slugify(String(p.slug || p.title || '')),
    topic: TOPICS.includes(p.topic) ? p.topic : (topic_hint || 'theology'),
    tags: Array.isArray(p.tags) ? p.tags.map(t => String(t).toLowerCase()).slice(0, 8) : [],
    keywords: Array.isArray(p.keywords) ? p.keywords.map(k => String(k)).slice(0, 7) : [],
    excerpt: String(p.excerpt || '').trim()
  };
}

async function generateRoundSummaries(rounds) {
  const sys = `For each round of a conversation, write TWO tiny descriptive titles:
- A QUESTION-form title for the user's turn (4-8 words, ending in "?", capturing the substance — not just the topic)
- An ANSWER-form title for Jafar's reply (4-8 words, declarative, capturing the substance)
Sentence case. Concrete and specific.
Return JSON: {"rounds":[{"question":"...","answer":"..."},...]} with EXACTLY ${rounds.length} entries.`;
  const user = rounds.map((r, i) => `Round ${i+1}:\nUSER: ${(r.user||'').slice(0,600)}\nJAFAR: ${(r.jafar||'').slice(0,600)}`).join('\n\n');
  const r = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    temperature: 0.3,
    max_tokens: 800,
    response_format: { type: 'json_object' }
  });
  return JSON.parse(r.choices[0].message.content).rounds || [];
}

const meta = await generatePublishMetadata(messages, 'philosophy');
console.log('META:', JSON.stringify(meta, null, 2));

const rounds = pairRounds(messages);
const summaries = await generateRoundSummaries(rounds);
console.log('SUMMARIES:', summaries.length, 'rounds');

const slugN = String(idx).padStart(3, '0');
const slug = `${slugN}-${meta.slug}`;
const heroPath = `/images/dialog/${slug}-hero.jpg`;

const fm = ['---'];
const j = (k, v) => fm.push(`${k}: ${JSON.stringify(v)}`);
j('title', meta.title);
j('description', meta.description);
j('question', messages[0].content);
fm.push(`topic: ${meta.topic}`);
fm.push('tags:');
meta.tags.forEach(t => fm.push(`  - ${t}`));
fm.push(`rounds: ${rounds.length}`);
if (typeof score === 'number') fm.push(`qualityScore: ${score}`);
fm.push(`publishedAt: ${new Date().toISOString().slice(0, 10)}`);
fm.push(`heroImage: ${heroPath}`);
if (meta.excerpt) j('excerpt', meta.excerpt);
fm.push(`published: ${typeof score === 'number' && score >= 80 ? 'true' : 'false'}`);
fm.push(`featured: ${typeof score === 'number' && score >= 90 ? 'true' : 'false'}`);
fm.push('keywords:');
meta.keywords.forEach(k => fm.push(`  - ${JSON.stringify(k)}`));
if (scoresJson || narrative || flags.length || improvementPlan) {
  fm.push('assessment:');
  if (scoresJson) {
    fm.push('  scores:');
    Object.entries(scoresJson).forEach(([k, v]) => fm.push(`    ${k}: ${v}`));
  }
  if (narrative) fm.push(`  narrative: ${JSON.stringify(narrative)}`);
  fm.push('  flags:');
  flags.forEach(f => fm.push(`    - ${f}`));
  if (improvementPlan) fm.push(`  improvement_plan: ${JSON.stringify(improvementPlan)}`);
}
fm.push('---', '');

const body = [];
let n = 0;
for (let i = 0; i < messages.length; i += 2) {
  const u = messages[i], a = messages[i + 1];
  if (!u || !a) break;
  n++;
  const s = summaries[n - 1] || {};
  if (s.question) body.push(`### ${s.question}`, '');
  body.push(`<div class="user-turn" id="round-${n}">`, '', u.content, '', '</div>', '');
  if (s.answer) body.push(`#### ${s.answer}`, '');
  body.push(`<div class="jafar-turn">`, '', a.content, '', '</div>', '');
}

const out = fm.join('\n') + body.join('\n');
const outPath = join(outDir, `${slug}.md`);
writeFileSync(outPath, out);
console.log(`WROTE ${outPath}`);
console.log(`URL would be: /dialogue/${slug}/`);
