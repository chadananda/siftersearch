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

const STYLE_SUFFIX = ' Style: blue-shaded hand-drawn watercolor, indigo and cobalt washes with hints of warm gold, loose brushwork, paper texture visible, soft bleeding edges, contemplative classical illustration. Avoid photorealism. No text, no labels. Strictly no human figures, no faces, no portraits. Do NOT depict any prophet, messenger, saint, or named religious or historical person — this includes Muhammad, Jesus, Moses, Bahá\'u\'lláh, the Báb, Táhirih, \'Abdu\'l-Bahá, or any other central religious figure. Buddha statues or classical Buddha imagery are acceptable and encouraged for Buddhist topics. Use only abstract, symbolic, or landscape imagery.';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const slugFilter = args.find(a => a.startsWith('--slug='))?.split('=')[1]
  || (args.indexOf('--slug') >= 0 ? args[args.indexOf('--slug') + 1] : null);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildHeroPrompt(dialog) {
  const tags = JSON.parse(dialog.tags_json || '[]').slice(0, 4).join(', ');
  return `An evocative scene representing the central question: "${dialog.title}". Topic: ${dialog.topic}. Themes: ${tags}.`;
}

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

// Filter to those needing images
const targets = dialogs.filter(d => {
  if (slugFilter) return d.slug === slugFilter;
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
