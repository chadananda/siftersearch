#!/usr/bin/env node
// Backfill / regenerate hero images for all completed deep research records.
// Usage: node gen-heroes-v2.mjs [--regen] [--limit N] [--id ID]
//   --regen    clear existing hero_image before regenerating
//   --limit N  cap at N records (default: all)
//   --id ID    regenerate a single record by ID

import { createHash } from 'crypto';
import Database from 'better-sqlite3';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/sifter.db');
const db = new Database(DB_PATH);

const args = process.argv.slice(2);
const REGEN = args.includes('--regen');
const LIMIT_IDX = args.indexOf('--limit');
const LIMIT = LIMIT_IDX >= 0 ? Number(args[LIMIT_IDX + 1]) : Infinity;
const ID_IDX = args.indexOf('--id');
const SINGLE_ID = ID_IDX >= 0 ? Number(args[ID_IDX + 1]) : null;
const IDS_IDX = args.indexOf('--ids');
const IDS = IDS_IDX >= 0 ? args[IDS_IDX + 1].split(',').map(Number) : null;

// ── Cloudflare R2 upload via REST API ────────────────────────────────────────
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_BUCKET = process.env.R2_BUCKET_NAME || 'siftersearch';
const CF_PUBLIC = process.env.R2_PUBLIC_URL || 'https://pub-e57ab96621a24ba18bcce728b4c51de2.r2.dev';

if (!CF_TOKEN || !CF_ACCOUNT) {
  console.error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID required');
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY required');
  process.exit(1);
}

async function uploadToR2(key, buffer, contentType = 'image/jpeg') {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/r2/buckets/${CF_BUCKET}/objects/${encodeURIComponent(key)}`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': contentType },
    body: buffer,
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`R2 upload failed: ${resp.status} ${txt.slice(0, 200)}`);
  }
  return `${CF_PUBLIC}/${key}`;
}

// ── Visual themes — subject + palette per topic cluster ──────────────────────
const HERO_MEDIUM = 'Richly detailed digital oil painting with dramatic atmospheric lighting, painterly impasto texture. Purely abstract — no human figures, no prophets, no religious icons, no faces, no symbols, no text, no calligraphy. Wide 16:9 cinematic composition. Museum quality fine art.';

const VISUAL_THEMES = [
  {
    keys: ['faith', 'doubt', 'trust', 'belief', 'certainty', 'uncertainty'],
    subject: 'Abstract path of luminous stepping-stones crossing a dark void, each stone glowing warmly, surrounded by darkness yet connected by a thread of light into the unknown distance',
    palette: 'warm amber stepping-stones, deep void black, faint connecting thread of gold, distant luminous horizon',
  },
  {
    keys: ['prayer', 'worship', 'devotion', 'dhikr', 'meditation'],
    subject: 'Abstract shafts of golden light streaming downward through deep indigo darkness, candlelight flames rising in curved paths, warm amber and cool violet light meeting at an unseen horizon',
    palette: 'deep midnight blue, amber gold, candlelight orange, rose violet, warm shadow brown',
  },
  {
    keys: ['afterlife', 'what happens after death', 'resurrection', 'rebirth'],
    subject: 'Abstract aurora borealis ribbons reflected in a perfectly still obsidian lake, flowing silver-green light dissolving into soft luminous mist at the edges',
    palette: 'deep indigo, aurora teal, silver-green, pearl white, soft violet',
  },
  {
    keys: ['death-grief', 'grief', 'mourning', 'significance of death', 'preparing for death'],
    subject: 'Abstract luminous threshold — a vertical band of warm golden-white light dividing two vast spaces of deep blue and deep violet, each beautiful, each infinite',
    palette: 'warm white-gold threshold, deep royal blue on one side, rich violet on the other, soft luminous edges',
  },
  {
    keys: ['theodicy', 'suffering', 'purpose of suffering'],
    subject: 'Stormy dark clouds breaking open with fierce shafts of golden sunlight, turbulent abstract forms of charcoal and iron giving way to blazing amber where light breaks through',
    palette: 'charcoal grey, stormy slate blue, iron black, blazing gold light, deep ember orange',
  },
  {
    keys: ['evil', 'darkness', 'nature of evil'],
    subject: 'Abstract vast dark space with a single unwavering point of warm light at center, concentric rings of darkness pressing inward, the small flame holding steady and immovable',
    palette: 'near-total black, deep umber, single warm amber light-point, faint golden corona, deep violet shadow',
  },
  {
    keys: ['tests', 'trials', 'tests-trials', 'hardship', 'adversity'],
    subject: 'Abstract mountainous forms emerging from swirling mist and fog, a single point of warm fire-light near the summit illuminating the surrounding darkness',
    palette: 'steel grey, mist white, charcoal, warm firelight gold, deep navy',
  },
  {
    keys: ['enlightenment', 'awakening', 'liberation', 'nirvana', 'moksha'],
    subject: 'Abstract vast darkness pierced by a single tremendous burst of radiant white-gold light expanding outward in all directions, darkness dissolving from center to edge',
    palette: 'pure radiant white at center, expanding gold, luminous amber, soft rose edges, dissolving darkness',
  },
  {
    keys: ['soul-spirit', 'human soul', 'nature of the soul', 'soul and body', 'what is the soul'],
    subject: 'Abstract luminous vapor gently rising and expanding through deep space, becoming more translucent and radiant as it ascends, cosmos reflected below in still dark water',
    palette: 'deep midnight blue, translucent silver-white vapor, soft gold luminescence, cosmic indigo, pearl mist',
  },
  {
    keys: ['soul', 'consciousness', 'self', 'inner life'],
    subject: 'Abstract luminous sphere at the center of vast dark space, radiating soft concentric rings of light outward, surrounded by deep cosmic void with distant nebula-like clouds of color',
    palette: 'luminous pearl white, soft rose, cosmic deep blue, nebula violet, warm gold core',
  },
  {
    keys: ['mysticism', 'nearness', 'unity of god', 'transcendence', 'mystical', 'contemplative'],
    subject: 'Abstract concentric geometric rings of light dissolving into radiant white at the center, deep blue-black at the edges, layers of translucent color creating infinite depth',
    palette: 'radiant white, cream gold, deep sky blue, midnight indigo, translucent violet layers',
  },
  {
    keys: ['ethics', 'conduct', 'virtue', 'morality', 'character', 'forgiveness', 'reconciliation'],
    subject: 'Abstract scales of light and shadow balanced over an implied horizon, two luminous masses of warm and cool color meeting in perfect equilibrium at the center',
    palette: 'warm gold, cool silver-blue, soft white, slate grey, gentle rose',
  },
  {
    keys: ['justice', 'fairness', 'equity', 'rights'],
    subject: 'Abstract columns of blazing white light rising from darkness, orderly and strong, each pillar casting pools of clarity against deep shadow',
    palette: 'pure white, iron grey, deep black, warm ivory, muted gold',
  },
  {
    keys: ['mercy', 'compassion', 'mercy-compassion', 'grace'],
    subject: 'Abstract warm rose and amber light pouring downward like liquid honey over dark forms below, softening edges and dissolving harshness into gentle warmth',
    palette: 'warm rose gold, soft amber, ivory white, gentle peach, tender lavender',
  },
  {
    keys: ['free will', 'predestination', 'free-will', 'choice', 'determinism'],
    subject: 'Abstract diverging paths of light in a vast dark space, two streams of luminous color branching apart from a single glowing origin point, each following its own arc',
    palette: 'blue-white origin, golden path, silver path, deep void black, soft twilight purple',
  },
  {
    keys: ['revelation', 'prophecy', 'scripture', 'divine word', 'scripture-study'],
    subject: 'Abstract blazing light descending vertically from above like a column of fire, striking an implied surface below and sending arcs of light outward in all directions',
    palette: 'blazing white-gold, deep navy sky, flame orange, radiant yellow, charcoal shadow',
  },
  {
    keys: ['progressive revelation', 'history', 'evolution', 'ages'],
    subject: 'Abstract series of luminous arcs rising in sequence across a dark panorama, each arc slightly brighter than the last, forming a flowing progression of light across time',
    palette: 'deep indigo, progression from violet to blue to gold, culminating in bright white arc',
  },
  {
    keys: ['science', 'reason', 'science-reason', 'truth'],
    subject: 'Abstract crystalline geometric forms floating in luminous blue-white space, precise and faceted, each face refracting light into clean rainbow spectra',
    palette: 'crystal clear white, refracted spectrum colors, deep azure, silver, clean sharp light',
  },
  {
    keys: ['unity', 'oneness', 'unity of humanity', 'brotherhood', 'peace'],
    subject: 'Abstract convergence of many flowing streams of different colors spiraling together toward a unified center of brilliant white light, each stream distinct but harmonizing',
    palette: 'rainbow of tradition colors converging to white center, deep blue-black void surrounds',
  },
  {
    keys: ['equality', 'inclusion', 'diversity'],
    subject: 'Abstract mosaic of differently colored light patches, each luminous and distinct, fitting together seamlessly like a celestial stained glass pattern without borders',
    palette: 'jewel tones — sapphire, emerald, ruby, amber, violet — each glowing from within, dark space between',
  },
  {
    keys: ['authority', 'leadership', 'institution', 'covenant'],
    subject: 'Abstract strong central pillar of cool white light rising from the center, surrounded by subsidiary columns of softer light in an implied circular arrangement',
    palette: 'central cool white, surrounding warm gold columns, deep charcoal ground, subtle bronze',
  },
  {
    keys: ['law', 'practice', 'law-practice', 'observance', 'fasting'],
    subject: 'Abstract ordered pattern of light and dark in rhythmic alternation, regular and purposeful, like light through a deep forest canopy at dawn',
    palette: 'deep forest green, gold dappled light, rich earth brown, cool shadow blue, warm amber',
  },
  {
    keys: ['eschatology', 'end times', 'judgment', 'apocalypse'],
    subject: 'Abstract massive luminous event on the horizon, vast dark storm in the upper frame split by a blazing rift of light, earth-tones in deep shadow below',
    palette: 'dramatic dark stormcloud, blazing rift of white-gold, deep shadow brown, red-orange horizon',
  },
  {
    keys: ['social order', 'world peace', 'civilization', 'community', 'society'],
    subject: 'Abstract city of light on an implied plain, geometric forms of warm light arranged in organic clusters, glowing against a vast starry deep blue sky',
    palette: 'warm amber city light, deep sapphire sky, silver starlight, gentle rose at horizon',
  },
  {
    keys: ['love', 'love of god', 'devotion', 'longing'],
    subject: 'Abstract flame of deep rose-red burning at the center of a dark composition, radiating warmth and golden light outward in soft concentric halos against violet darkness',
    palette: 'deep rose red, warm gold halo, rich violet darkness, soft rose-gold, ember orange',
  },
  {
    keys: ['creation', 'cosmos', 'genesis', 'universe', 'God', 'ultimate'],
    subject: 'Abstract cosmic genesis — swirling nebula of color emerging from a central burst of brilliant white light, clouds of deep space blue and violet tinged with gold and rose',
    palette: 'cosmic deep blue, nebula violet, rose cloud, brilliant white origin, warm gold edges',
  },
  {
    keys: ['sin', 'redemption', 'sin-redemption', 'error', 'failure'],
    subject: 'Abstract dark form below being lifted and transformed by a descending beam of warm light from above, darkness becoming translucent rose and gold at the edges',
    palette: 'deep shadow at base, warm rose light descending, translucent gold edges, soft white at peak',
  },
  {
    keys: ['service', 'community', 'humanitarian', 'charity', 'sacrifice', 'poor', 'marginalized'],
    subject: 'Abstract many small warm light sources arranged in an implied circle, each contributing its glow to a collective brightness at the center larger than any single flame',
    palette: 'individual warm amber points, collective warm white center, deep blue-grey between, gentle gold',
  },
  {
    keys: ['time', 'calendar', 'seasons', 'holy days', 'sacred time', 'ritual', 'ceremony', 'liturgy'],
    subject: 'Abstract cycle of light — a great arc of color moving from deep indigo through gold through rose and back, suggesting rotation and rhythmic return',
    palette: 'deep indigo night, dawn violet, morning gold, noon bright white, dusk rose, back to indigo',
  },
  {
    keys: ['transformation', 'inner transformation', 'social change', 'social transformation'],
    subject: 'Abstract two luminous realms — warm inner gold and cool outer silver — flowing through each other at a permeable radiant boundary, each realm transformed at the threshold where they meet',
    palette: 'warm inner gold, cool silver-blue outer, luminous white threshold, soft rose at the meeting point, deep indigo distance',
  },
  {
    keys: ['spiritual knowledge', 'spiritual-knowledge', 'discernment', 'wisdom', 'how do we know'],
    subject: 'Abstract infinite regress of luminous mirrors — each crystalline facet reflecting the next into vast indigo depth, a chain of clarity receding to a single bright point of pure knowing at the vanishing horizon',
    palette: 'crystal silver, luminous indigo, deep blue depth, bright knowing-point, soft gold reflection, endless recession',
  },
  {
    keys: ['angels', 'beings', 'spiritual beings', 'invisible'],
    subject: 'Abstract luminous forms descending through vast dark space like falling stars, elongated ribbons of light curving gracefully, each distinct yet harmonious',
    palette: 'pure silver-white, soft blue, warm gold, deep space black, translucent violet trails',
  },
  {
    keys: ['marriage', 'family', 'home', 'children'],
    subject: 'Abstract two distinct streams of warm light intertwining and becoming one, surrounded by smaller emanating points of light, all set against deep indigo',
    palette: 'warm gold, rose gold, soft amber, deep indigo, gentle cream',
  },
  {
    keys: ['beauty', 'art', 'creativity', 'aesthetic'],
    subject: 'Abstract explosion of color — bold sweeping arcs of multiple hues curving and intersecting in a dark space, like light painted across a cosmic canvas',
    palette: 'vivid cobalt, crimson, gold, emerald, violet, sweeping arcs on dark ground',
  },
  {
    keys: ['silence', 'stillness', 'contemplation', 'solitude'],
    subject: 'Abstract vast calm — a single horizontal band of soft luminous color across the center of deep darkness, barely perceptible gradients of grey and silver',
    palette: 'near-black, midnight navy, barely-there silver horizon, deep cool grey, faint luminous white',
  },
  {
    keys: ['pride', 'humility', 'ego', 'vanity'],
    subject: 'Abstract tall form of brilliant light gradually softening and spreading wide at its base into humble warmth, darkness receding as light expands outward',
    palette: 'brilliant white pinnacle, warm amber spreading base, deep shadow receding, soft gold glow',
  },
  {
    keys: ['work', 'vocation', 'labor', 'purpose'],
    subject: 'Abstract strong geometric forms of golden light arranged like pillars or beams in purposeful structure, each supporting the larger luminous whole',
    palette: 'burnished gold, deep warm shadow, amber light, strong ochre, pale cream highlight',
  },
];

const FALLBACK_THEME = {
  subject: 'Abstract landscape of light and darkness, a luminous horizon dividing deep space above from implied ground below, soft gradients of color flowing between realms',
  palette: 'deep cosmic blue, warm amber horizon, pearl silver, soft violet, gentle gold',
};

function pickTheme(tags, question, usedSubjects = new Set()) {
  const haystack = [...(tags || []), question.toLowerCase()].join(' ');
  const wordBound = k => new RegExp(`\\b${k.replace(/-/g, '[- ]')}\\b`).test(haystack);
  // First: matching theme that hasn't been used
  for (const theme of VISUAL_THEMES) {
    if (theme.keys.some(wordBound) && !usedSubjects.has(theme.subject)) return theme;
  }
  // Second: matching theme even if reused (better wrong theme than wrong topic)
  for (const theme of VISUAL_THEMES) {
    if (theme.keys.some(wordBound)) return theme;
  }
  // Third: any unused theme
  for (const theme of VISUAL_THEMES) {
    if (!usedSubjects.has(theme.subject)) return theme;
  }
  return FALLBACK_THEME;
}

function buildPrompt(record, usedSubjects = new Set()) {
  const tags = typeof record.topic_tags === 'string' ? JSON.parse(record.topic_tags || '[]') : (record.topic_tags || []);
  const traditions = (record.traditions_covered || '').split(',').filter(Boolean).slice(0, 3).join(', ') || 'world traditions';
  const theme = pickTheme(tags, record.canonical_question, usedSubjects);
  return `${theme.subject}. Spiritual atmosphere evoking the question: "${record.canonical_question}" across ${traditions}. Color palette: ${theme.palette}. ${HERO_MEDIUM}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let records;
if (IDS) {
  records = IDS.map(id => db.prepare('SELECT * FROM deep_research WHERE id = ?').get(id)).filter(Boolean);
} else if (SINGLE_ID) {
  const r = db.prepare('SELECT * FROM deep_research WHERE id = ?').get(SINGLE_ID);
  records = r ? [r] : [];
} else if (REGEN) {
  records = db.prepare("SELECT * FROM deep_research WHERE status = 'complete' ORDER BY ask_count DESC").all();
} else {
  records = db.prepare("SELECT * FROM deep_research WHERE status = 'complete' AND (hero_image IS NULL OR hero_image = '') ORDER BY ask_count DESC").all();
}

if (LIMIT < Infinity) records = records.slice(0, LIMIT);

if (REGEN && !SINGLE_ID) {
  console.log(`--regen: clearing hero_image for ${records.length} records`);
  db.prepare("UPDATE deep_research SET hero_image = NULL, hero_prompt = NULL WHERE status = 'complete'").run();
}

console.log(`Generating hero images for ${records.length} records...\n`);

// Track which subjects have been used across this run (+ already-stored prompts).
// Exclude the records being regenerated so they can pick new unique themes.
const regeneratingIds = new Set(records.map(r => r.id));
const usedSubjects = new Set();
{
  const existing = db.prepare("SELECT hero_prompt FROM deep_research WHERE hero_prompt IS NOT NULL").all();
  for (const row of existing) {
    // If this record is being regenerated, skip it — let it pick a fresh theme
    const id = db.prepare("SELECT id FROM deep_research WHERE hero_prompt = ?").get(row.hero_prompt)?.id;
    if (id && regeneratingIds.has(id)) continue;
    // Extract subject: everything before ". Spiritual atmosphere" or ". Evoking"
    const cut = Math.min(
      row.hero_prompt.indexOf('. Spiritual atmosphere') > 0 ? row.hero_prompt.indexOf('. Spiritual atmosphere') : 9999,
      row.hero_prompt.indexOf('. Evoking') > 0 ? row.hero_prompt.indexOf('. Evoking') : 9999,
    );
    if (cut < 9999) usedSubjects.add(row.hero_prompt.slice(0, cut));
  }
}

let ok = 0, fail = 0;

for (const record of records) {
  const prompt = buildPrompt(record, usedSubjects);
  // Track subject used so next record picks a different one
  const subjectEnd = prompt.indexOf('. Spiritual atmosphere evoking');
  if (subjectEnd > 0) usedSubjects.add(prompt.slice(0, subjectEnd));
  console.log(`[${record.id}] ${record.canonical_question.slice(0, 60)}...`);
  console.log(`  Theme: ${prompt.slice(0, 100)}...`);

  try {
    const resp = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1536x1024',
      quality: 'medium',
    });

    const b64 = resp.data[0]?.b64_json;
    if (!b64) throw new Error('No b64_json in response');

    const buffer = Buffer.from(b64, 'base64');
    const key = `assets/research/${record.id}.jpg`;
    const publicUrl = await uploadToR2(key, buffer, 'image/jpeg');

    db.prepare('UPDATE deep_research SET hero_image = ?, hero_prompt = ? WHERE id = ?').run(publicUrl, prompt, record.id);
    console.log(`  ✓ ${publicUrl}`);
    ok++;
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
    fail++;
  }

  // Brief pause to respect rate limits
  await new Promise(r => setTimeout(r, 2000));
}

console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
db.close();
