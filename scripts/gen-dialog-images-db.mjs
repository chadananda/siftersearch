#!/usr/bin/env node
// Generate hero images for /dialogue/ pages backed by published_conversations DB.
// Fetches dialogs without hero_image, generates via gpt-image-1, uploads to
// cdn-assets R2 bucket, then patches the DB via PATCH /admin/dialogs/:slug/hero.
//
// Usage:
//   node scripts/gen-dialog-images-db.mjs                  # all without images
//   node scripts/gen-dialog-images-db.mjs --slug my-slug   # specific slug
//   node scripts/gen-dialog-images-db.mjs --dry-run        # preview only

import dotenv from 'dotenv';
import { writeFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { execFileSync, execSync } from 'child_process';
import { existsSync } from 'fs';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const API_BASE = 'https://api.siftersearch.com';
const ADMIN_KEY = process.env.INTERNAL_API_KEY;
const LOCAL_WRANGLER = join(ROOT, 'node_modules/.bin/wrangler');
// Fall back to npx wrangler when local binary isn't installed (e.g. tower-nas)
const WRANGLER = existsSync(LOCAL_WRANGLER) ? LOCAL_WRANGLER : null;
const R2_BUCKET = 'cdn-assets';
const R2_PREFIX = 'siftersearch.com/dialog';

// Objects/symbols used by tradition — steers the model toward things, not people.
// Never describe human figures or portraits; let the tradition's visual language do the work.
const TRADITION_SYMBOLS = {
  bahai:         'nine-pointed star, illuminated Persian calligraphy scroll, terraced garden with cypress trees, dawn light over the sea',
  islam:         'arabesque geometric tile pattern, mosque lamp, Arabic calligraphy arch, crescent moon over minaret silhouette',
  christianity:  'stone cathedral window with golden light, illuminated Gospel manuscript page, beeswax candles, carved stone cross',
  buddhism:      'serene Buddha statue in lotus position, incense smoke rising, lotus flowers on water, stone lantern in misty garden',
  judaism:       'ancient Torah scroll and silver pointer, seven-branched menorah, stone Western Wall, Star of David in stained glass',
  hinduism:      'oil-lamp flame (diya) reflected on water, stone mandala carving, lotus blossom, temple gopuram at dusk',
  zoroastrian:   'sacred eternal flame in marble fire temple, ancient Faravahar relief carving, Persian garden at night',
  sikhism:       'golden Harmandir Sahib reflected in the Amrit Sarovar pool, Khanda symbol, saffron Nishan Sahib flag',
  taoism:        'misty mountain gorge with pine trees, flowing river over smooth stones, yin-yang in ink wash',
  confucianism:  'ancient Chinese scroll with ink-brush calligraphy, plum blossoms, jade bi disc, scholar\'s garden pavilion',
  indigenous:    'night sky over open plains, sacred medicine-wheel stones, eagle feathers, glowing fire circle',
  sufism:        'whirling dervish cloak swirling into geometric pattern, oil lamp, calligraphy in arabesque border',
  kabbalah:      'Tree of Life diagram in golden ink, Hebrew letters, rays of light through ancient stone window',
  interfaith:    'many religious symbols arranged as a mandala — crescent, cross, Star of David, Dharma wheel, nine-pointed star — around a central flame',
};

// Pick a symbol set: check tags first, then topic, then fall back to interfaith
function detectTraditionSymbols(tags, topic) {
  const lower = [...tags, topic || ''].map(t => t.toLowerCase());
  const order = ['bahai', 'islam', 'christianity', 'judaism', 'buddhism', 'hinduism',
    'zoroastrian', 'sikhism', 'taoism', 'confucianism', 'indigenous', 'sufism', 'kabbalah'];
  for (const trad of order) {
    if (lower.some(t => t.includes(trad) || (trad === 'bahai' && t.includes('baha'))
      || (trad === 'islam' && (t.includes('quran') || t.includes('muslim') || t.includes('sufi')))
      || (trad === 'christianity' && (t.includes('christ') || t.includes('trinity') || t.includes('gospel')))
      || (trad === 'judaism' && (t.includes('jewish') || t.includes('torah') || t.includes('sinai') || t.includes('kabbal')))
      || (trad === 'buddhism' && (t.includes('buddh') || t.includes('dharma') || t.includes('anatta')))
      || (trad === 'hinduism' && (t.includes('hindu') || t.includes('vedanta') || t.includes('karma') || t.includes('gita')))
      || (trad === 'zoroastrian' && (t.includes('zoroas') || t.includes('avesta')))
      || (trad === 'sikhism' && (t.includes('sikh') || t.includes('granth')))
      || (trad === 'taoism' && (t.includes('tao') || t.includes('taoist')))
      || (trad === 'confucianism' && (t.includes('confuc') || t.includes('analects')))
      || (trad === 'sufism' && t.includes('sufi'))
      || (trad === 'kabbalah' && t.includes('kabbalist'))
    )) return TRADITION_SYMBOLS[trad];
  }
  return TRADITION_SYMBOLS.interfaith;
}

// Build a prompt focused on symbolic objects — no titles, no person names, no
// theological terms that imply human figures. Tradition symbols do the work.
function buildHeroPrompt(dialog) {
  const tags = JSON.parse(dialog.tags_json || '[]');
  const symbols = detectTraditionSymbols(tags, dialog.topic);
  return `Contemplative watercolor illustration featuring only: ${symbols}. No human figures, no faces, no people of any kind.`;
}

const STYLE_SUFFIX = ' Hand-painted watercolor, indigo and cobalt washes with warm gold accents, loose brushwork, paper texture, soft bleeding edges, wide cinematic 16:9. No text, no labels, no human figures, no faces, no portraits whatsoever.';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const forceAll = args.includes('--force');
const slugFilter = args.find(a => a.startsWith('--slug='))?.split('=')[1]
  || (args.indexOf('--slug') >= 0 ? args[args.indexOf('--slug') + 1] : null);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateImage(prompt, slug) {
  const fullPrompt = prompt + STYLE_SUFFIX;
  console.log(`  Generating image for ${slug}...`);
  if (dryRun) { console.log(`  [dry-run] prompt: ${fullPrompt.slice(0, 100)}...`); return null; }

  const resp = await openai.images.generate({
    model: 'gpt-image-1',
    prompt: fullPrompt,
    size: '1536x1024',
    quality: 'medium',
    n: 1
  });
  const b64 = resp.data[0]?.b64_json;
  if (!b64) throw new Error('gpt-image-1 returned no b64_json');
  return Buffer.from(b64, 'base64');
}

async function uploadToR2(slug, imageBuffer) {
  const tmpFile = join(tmpdir(), `dialog-hero-${slug}-${Date.now()}.jpg`);
  writeFileSync(tmpFile, imageBuffer);
  try {
    const wranglerArgs = [
      'r2', 'object', 'put',
      `${R2_BUCKET}/${R2_PREFIX}/${slug}-hero.jpg`,
      '--file', tmpFile,
      '--content-type', 'image/jpeg',
      '--remote'
    ];
    if (WRANGLER) {
      execFileSync(WRANGLER, wranglerArgs, { env: process.env, stdio: 'inherit' });
    } else {
      // npx path for environments where wrangler is not locally installed
      execSync(`npx wrangler ${wranglerArgs.map(a => JSON.stringify(a)).join(' ')}`, { env: process.env, stdio: 'inherit' });
    }
    console.log(`  Uploaded to R2: ${R2_PREFIX}/${slug}-hero.jpg`);
    return `/images/dialog/${slug}-hero.jpg`;
  } finally {
    try { unlinkSync(tmpFile); } catch (_) { /* ignore */ }
  }
}

async function patchHeroImage(slug, heroImage) {
  const res = await fetch(`${API_BASE}/api/v1/admin/dialogs/${slug}/hero`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_KEY },
    body: JSON.stringify({ hero_image: heroImage })
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Patch failed ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

// Fetch all published dialogs
const res = await fetch(`${API_BASE}/api/v1/dialogs`);
if (!res.ok) { console.error('Failed to fetch dialogs'); process.exit(1); }
const { dialogs } = await res.json();

// Filter to those needing images (--force regenerates all)
const targets = dialogs.filter(d => {
  if (slugFilter) return d.slug === slugFilter;
  if (forceAll) return true;
  return !d.hero_image;
});

console.log(`Found ${dialogs.length} total dialogs, ${targets.length} need images\n`);

for (const dialog of targets) {
  const slug = dialog.slug;
  console.log(`[${slug}] title: ${dialog.title}`);
  try {
    const prompt = dialog.hero_prompt || buildHeroPrompt(dialog);
    const imageBuffer = await generateImage(prompt, slug);
    if (!imageBuffer) continue; // dry-run

    const heroImagePath = await uploadToR2(slug, imageBuffer);
    await patchHeroImage(slug, heroImagePath);
    console.log(`  ✓ hero_image set: ${heroImagePath}\n`);
  } catch (err) {
    console.error(`  ✗ failed: ${err.message}\n`);
  }
}

console.log('Done.');
