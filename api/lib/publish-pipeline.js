// Publish pipeline for saved conversations. Generates the full metadata
// envelope (question-form title, answer-summary description, tags, topic,
// per-round summaries, hero image prompt, slug) from a chat history.
//
// Used by POST /api/v1/chat/{conversation_id}/save in two modes:
//   - LOCAL: write to src/content/dialogs/{slug}.md (SifterSearch's own pool)
//   - REMOTE: persist in published_conversations table (tenant share URL)
//
// Convention (per user direction 2026-04-28):
//   title = the biggest under-discussion question, in question form
//   description = the overview answer summary, NOT topic phrasing
//   each round → {question, answer} for FAQPage JSON-LD on the rendered page

import OpenAI from 'openai';
import { config } from './config.js';

const openai = new OpenAI({ apiKey: config.ai.openai?.apiKey || process.env.OPENAI_API_KEY });

const TOPICS = [
  'theology', 'ethics', 'social-order', 'politics', 'history',
  'comparative-religion', 'mysticism', 'practice', 'modern-challenges',
  'word-meaning', 'metaphysics', 'philosophy'
];

// Generate publish-ready metadata for a saved conversation. Single gpt-4o
// call (JSON mode) so the title/description/topic/tags/keywords are
// generated together — keeps them coherent rather than risking drift across
// separate calls.
export async function generatePublishMetadata({ messages, topic_hint }) {
  const transcript = messages
    .map((m, i) => {
      const role = m.role === 'user' ? 'USER' : 'JAFAR';
      return `${role} [round ${Math.floor(i / 2) + 1}]: ${m.content}`;
    })
    .join('\n\n');

  const sys = `You generate publish-ready SEO metadata for a long-form conversation between a user and an AI research assistant (Jafar). Output JSON ONLY.

CONVENTIONS:
- title: phrased as a QUESTION ending in "?". This is the biggest under-discussion question of the conversation — what a thoughtful reader would google. Title-case the substantive words. 60-90 chars.
- description: the OVERVIEW ANSWER, not a topic summary. Lead with the actual position or finding from the conversation. Concrete, primary-source-grounded. 220-320 chars.
- slug: lowercase ASCII, hyphen-separated, derived from title. Strip stopwords (the, a, of, and). 4-9 words. No question mark.
- topic: ONE value from this enum: ${TOPICS.join(', ')}. Pick the single best fit.
- tags: 5-8 lowercase hyphen-separated tags. Include relevant religion (e.g. "bahai"), key figures named in the conversation ("bahaullah", "abdul-baha", "shoghi-effendi"), the named work if any ("tablet-of-wisdom", "kitab-i-iqan"), and topical tags ("materialism", "calligraphy", "music"). No hashtags.
- keywords: 5-7 short search phrases a user would type to find this conversation, in natural English (not hyphen form). Include at least one alternate phrasing of the title.
- excerpt: a 140-180 char single-sentence pull quote that names the central tension or claim — for listing cards.

OUTPUT JSON shape: {"title":"...","description":"...","slug":"...","topic":"...","tags":[...],"keywords":[...],"excerpt":"..."}`;

  const user = `Generate metadata for this conversation.

${topic_hint ? `Topic hint from caller: ${topic_hint}\n\n` : ''}Transcript:

${transcript.length > 18000 ? transcript.slice(0, 18000) + '\n\n[truncated]' : transcript}`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    temperature: 0.4,
    max_tokens: 700,
    response_format: { type: 'json_object' }
  });

  const parsed = JSON.parse(resp.choices[0].message.content);

  // Validate + normalize
  return {
    title: String(parsed.title || '').trim(),
    description: String(parsed.description || '').trim(),
    slug: slugify(String(parsed.slug || parsed.title || '')),
    topic: TOPICS.includes(parsed.topic) ? parsed.topic : (topic_hint || 'theology'),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(t => String(t).toLowerCase()).slice(0, 8) : [],
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(k => String(k)).slice(0, 7) : [],
    excerpt: String(parsed.excerpt || '').trim()
  };
}

// Generate per-round h3 (question form) + h4 (answer summary) headers.
// These populate the body markdown ABOVE each turn and feed FAQPage JSON-LD.
export async function generateRoundSummaries(rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) return [];

  const sys = `For each round of a conversation, write TWO tiny descriptive titles:
- A QUESTION-form title for the user's turn (4-8 words, ending in "?", capturing the substance of the asking — not just the topic). Example: "Does Anatta Refute Personal Identity?"
- An ANSWER-form title for Jafar's reply (4-8 words, declarative, capturing the substance of his response). Example: "Anatta Addresses Ego, Not the Soul."

Avoid generic phrasings. Sentence case. Concrete and specific.

Output JSON: {"rounds":[{"question":"...","answer":"..."},...]} with EXACTLY ${rounds.length} entries in order.`;

  const user = rounds.map((r, i) => `Round ${i + 1}:\nUSER: ${(r.user || '').slice(0, 600)}\nJAFAR: ${(r.jafar || '').slice(0, 600)}`).join('\n\n');

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    temperature: 0.3,
    max_tokens: 800,
    response_format: { type: 'json_object' }
  });
  const parsed = JSON.parse(resp.choices[0].message.content);
  return Array.isArray(parsed.rounds) ? parsed.rounds : [];
}

// Anonymize user turns: scrub personal names, identifying details, location
// markers from user-side messages only. Jafar turns are left untouched.
// Returns a new messages array; original is not mutated.
export async function anonymizeUserTurns(messages) {
  const userIndices = [];
  messages.forEach((m, i) => { if (m.role === 'user') userIndices.push(i); });
  if (userIndices.length === 0) return messages.slice();

  const userTexts = userIndices.map(i => messages[i].content);

  const sys = `Anonymize each user message for public publication. Remove or replace:
- Personal names (first or last)
- Specific locations (cities, neighborhoods, workplaces, schools)
- Identifying biographical details (age, profession titles, family relationships when specific)
- Email addresses, phone numbers, social handles

Preserve the substance of the question and any relevant references to publicly-known figures, books, or ideas. Replace identifying details with neutral phrasing rather than removing entire sentences. If a message is already generic, return it unchanged.

Output JSON: {"texts":["...","...",...]} with EXACTLY ${userTexts.length} entries in order.`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(userTexts) }],
    temperature: 0.2,
    max_tokens: 2500,
    response_format: { type: 'json_object' }
  });
  const parsed = JSON.parse(resp.choices[0].message.content);
  const cleaned = Array.isArray(parsed.texts) && parsed.texts.length === userTexts.length ? parsed.texts : userTexts;

  const out = messages.slice();
  userIndices.forEach((idx, i) => { out[idx] = { ...out[idx], content: cleaned[i] }; });
  return out;
}

// Build a hero image prompt tailored to the conversation. Returns the prompt
// string only; caller invokes DALL-E and uploads to R2 separately so this
// stays testable without side-effects.
export function buildHeroImagePrompt({ title, topic, tags }) {
  const STYLE = ' Watercolor — indigo and cobalt washes with warm gold accents, loose brushwork, paper texture visible, soft bleeding edges. Wide cinematic 16:9 composition, atmospheric and contemplative. No text, no labels, no symbols other than what is described.';
  const subject = `An evocative scene representing the central question: "${title}". Topic: ${topic}. Themes: ${(tags || []).slice(0, 4).join(', ')}.`;
  return subject + STYLE;
}

// Slugify helper — same approach SifterSearch uses elsewhere.
export function slugify(s) {
  if (!s) return '';
  const diacritics = {
    'á':'a','à':'a','ä':'a','â':'a','ā':'a',
    'é':'e','è':'e','ë':'e','ê':'e','ē':'e',
    'í':'i','ì':'i','ï':'i','î':'i','ī':'i',
    'ó':'o','ò':'o','ö':'o','ô':'o','ō':'o',
    'ú':'u','ù':'u','ü':'u','û':'u','ū':'u',
    'ñ':'n','ç':'c','ḥ':'h','ṣ':'s','ṭ':'t','ḍ':'d'
  };
  return s.toLowerCase()
    .split('').map(c => diacritics[c] || c).join('')
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .substring(0, 70);
}

// Pair messages into rounds: [{user, jafar}, ...]
export function pairRounds(messages) {
  const rounds = [];
  for (let i = 0; i < messages.length; i += 2) {
    const u = messages[i];
    const a = messages[i + 1];
    if (!u || u.role !== 'user') break;
    rounds.push({ user: u.content, jafar: a && a.role === 'assistant' ? a.content : '' });
  }
  return rounds;
}
