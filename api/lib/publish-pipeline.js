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
import { execFile } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from './config.js';
import { logger } from './logger.js';
import { query as dbQuery } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(__dirname, '../../scripts');

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

  const sys = `For each round of a conversation, write TWO short titles in STRICT formats:

1. "question": A real QUESTION the user is asking (4-8 words, MUST end with "?"). Capture the specific substance, not just the topic.
   GOOD: "Does Anatta Refute Personal Identity?" / "Is Consultation a Spiritual Act?"
   BAD: "Distinction in Bahá'í consultation practice" (topic label — NOT a question, missing "?")

2. "answer": A declarative summary of Jafar's response (4-8 words, no "?"). Capture the answer's core claim.
   GOOD: "Anatta Addresses Ego, Not the Soul." / "Consultation Transforms Disagreement Into Service."
   BAD: "Consultation as spiritual practice" (too vague, not a complete claim)

Sentence case. Concrete and specific. BOTH fields required for every round.

Output ONLY JSON: {"rounds":[{"question":"...","answer":"..."},...]} with EXACTLY ${rounds.length} entries.`;

  const user = rounds.map((r, i) => `Round ${i + 1}:\nUSER: ${(r.user || '').slice(0, 800)}\nJAFAR: ${(r.jafar || '').slice(0, 1000)}`).join('\n\n');

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

// Regex pre-pass: strip mechanically-identifiable PII before the LLM sees it.
// Catches emails, phone numbers, and "my name is X" patterns reliably without
// needing a model call. LLM pass handles names woven into prose.
function regexScrub(text) {
  return text
    .replace(/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi, '[email]')
    .replace(/\b(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)(\d{3}[\s.-]?\d{4})\b/g, '[phone]')
    .replace(/\bmy name is\s+\w+/gi, 'I am a seeker')
    .replace(/\bcall me\s+\w+/gi, 'call me a seeker')
    .replace(/\bI(?:'m| am)\s+([A-Z][a-z]+)(?=\s+and\b|\s+from\b|,)/g, 'I am someone');
}

// Sanitize all messages for public publication. Runs a regex pre-pass for
// contact info, then an LLM pass (gpt-4o-mini) to neutralise names and
// identifying details woven into prose. Both user and assistant turns are
// scrubbed: users may name themselves, Jafar may echo the name back.
// Returns a new messages array; original is not mutated.
export async function anonymizeUserTurns(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  // Regex pre-pass on every turn
  const preScrubbedMessages = messages.map(m => ({
    ...m,
    content: typeof m.content === 'string' ? regexScrub(m.content) : m.content
  }));

  // LLM pass on USER turns only — assistant (Jafar) turns never contain PII,
  // and running them through the LLM destroys markdown citation links [text](url).
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
          const sanitizedText = sanitized[userIdx++]?.text ?? m.content;
          return { ...m, content: sanitizedText };
        }
        // Assistant turns: return regex-scrubbed only (no LLM pass — preserves citation links)
        return m;
      });
    }
  } catch (err) {
    // LLM pass failed — return regex-scrubbed version as fallback
    return preScrubbedMessages;
  }

  return preScrubbedMessages;
}

const TRADITION_SYMBOLS = {
  bahai:        'nine-pointed star, illuminated Persian calligraphy scroll, terraced garden with cypress trees, dawn light over the sea',
  islam:        'arabesque geometric tile pattern, mosque lamp, Arabic calligraphy arch, crescent moon over minaret silhouette',
  christianity: 'stone cathedral window with golden light, illuminated Gospel manuscript page, beeswax candles, carved stone cross',
  buddhism:     'serene Buddha statue in lotus position, incense smoke rising, lotus flowers on water, stone lantern in misty garden',
  judaism:      'ancient Torah scroll and silver pointer, seven-branched menorah, stone Western Wall, Star of David in stained glass',
  hinduism:     'oil-lamp flame (diya) reflected on water, stone mandala carving, lotus blossom, temple gopuram at dusk',
  zoroastrian:  'sacred eternal flame in marble fire temple, ancient Faravahar relief carving, Persian garden at night',
  sikhism:      'golden Harmandir Sahib reflected in the Amrit Sarovar pool, Khanda symbol, saffron Nishan Sahib flag',
  taoism:       'misty mountain gorge with pine trees, flowing river over smooth stones, yin-yang in ink wash',
  confucianism: "ancient Chinese scroll with ink-brush calligraphy, plum blossoms, jade bi disc, scholar's garden pavilion",
  interfaith:   'many religious symbols arranged as a mandala — crescent, cross, Star of David, Dharma wheel, nine-pointed star — around a central flame',
};

function pickTraditionSymbols(tags, topic) {
  const lower = [...(tags || []), topic || ''].map(t => t.toLowerCase());
  const checks = [
    ['bahai',        t => t.includes('baha')],
    ['islam',        t => t.includes('islam') || t.includes('quran') || t.includes('muslim')],
    ['christianity', t => t.includes('christ') || t.includes('trinity') || t.includes('gospel')],
    ['judaism',      t => t.includes('jewish') || t.includes('torah') || t.includes('sinai') || t.includes('kabbal')],
    ['buddhism',     t => t.includes('buddh') || t.includes('dharma') || t.includes('anatta')],
    ['hinduism',     t => t.includes('hindu') || t.includes('vedanta') || t.includes('karma') || t.includes('gita')],
    ['zoroastrian',  t => t.includes('zoroas') || t.includes('avesta')],
    ['sikhism',      t => t.includes('sikh') || t.includes('granth')],
    ['taoism',       t => t.includes('tao')],
    ['confucianism', t => t.includes('confuc') || t.includes('analects')],
  ];
  for (const [trad, test] of checks) {
    if (lower.some(test)) return TRADITION_SYMBOLS[trad];
  }
  return TRADITION_SYMBOLS.interfaith;
}

// Build a hero image prompt focused on symbolic objects only. No title, no person
// names, no theological terms — all of which lead image models to depict figures.
export function buildHeroImagePrompt({ topic, tags }) {
  const symbols = pickTraditionSymbols(tags, topic);
  const subject = `Contemplative watercolor illustration featuring only: ${symbols}. No human figures, no faces, no people of any kind.`;
  const STYLE = ' Hand-painted watercolor, indigo and cobalt washes with warm gold accents, loose brushwork, paper texture, soft bleeding edges, wide cinematic 16:9. No text, no labels, no human figures, no faces, no portraits whatsoever.';
  return subject + STYLE;
}

// Generate a hero image for a published conversation and save it to the DB.
// Fire-and-forget: call without await from the save endpoint. Uses the
// gen-dialog-images-db.mjs script so the upload path (wrangler → cdn-assets R2)
// stays consistent and doesn't need to be duplicated here.
export function triggerHeroImageGeneration(slug) {
  const script = join(SCRIPTS_DIR, 'gen-dialog-images-db.mjs');
  const env = { ...process.env };
  execFile(process.execPath, [script, '--slug', slug], { env, timeout: 120000 }, (err, stdout, stderr) => {
    if (err) {
      logger.warn({ slug, err: err.message, stderr: stderr?.slice(0, 200) }, 'Hero image generation failed');
    } else {
      logger.info({ slug }, 'Hero image generated and saved');
    }
  });
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
