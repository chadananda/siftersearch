#!/usr/bin/env node
// Generate hero images for /dialogue/ pages using OpenAI's image API.
// Uploads directly to Cloudflare R2 (cdn-assets bucket) via wrangler.
// Sets heroImage: /images/dialog/{slug}-hero.jpg in frontmatter on success.
//
// Usage:
//   node scripts/generate-dialog-images.js [--slug=012-why-...] [--dry-run]
//
// R2 key: siftersearch.com/dialog/{slug}-hero.jpg
// Public URL: https://pub-4445d977d3954d72bea3bad656a3fd43.r2.dev/siftersearch.com/dialog/{slug}-hero.jpg

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

const OpenAI = (await import('openai')).default;
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DIALOG_DIR = join(PROJECT_ROOT, 'src/content/dialogs');
const WRANGLER = join(PROJECT_ROOT, 'node_modules/.bin/wrangler');
const R2_BUCKET = 'cdn-assets';
const R2_KEY_PREFIX = 'siftersearch.com/dialog';

const STYLE_SUFFIX = ' Style: blue-shaded hand-drawn watercolor, indigo and cobalt washes with hints of warm gold, loose brushwork, paper texture visible, soft bleeding edges, contemplative classical illustration. Avoid photorealism. No text, no labels.';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const slugFilter = args.find(a => a.startsWith('--slug='))?.split('=')[1];

function parseFrontmatter(text, filename) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  const fm = m[1];
  const heroPromptMatch = fm.match(/^heroPrompt:\s*"([^"]+)"$/m);
  const titleMatch = fm.match(/^title:\s*"([^"]+)"$/m);
  const slug = filename.replace(/\.md$/, '');
  let heroPrompt = heroPromptMatch?.[1];
  if (!heroPrompt && titleMatch?.[1]) {
    heroPrompt = `A meditative scene evoking the theme: "${titleMatch[1]}". Loose dreamlike imagery, no human faces, soft and contemplative.`;
  }
  const alreadyHasHeroImage = fm.match(/^heroImage:/m);
  return { fm, heroPrompt, slug, alreadyHasHeroImage };
}

async function r2Exists(slug) {
  try {
    execFileSync(WRANGLER, ['r2', 'object', 'get', `${R2_BUCKET}/${R2_KEY_PREFIX}/${slug}-hero.jpg`, '--pipe', '--remote'], { stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch { return false; }
}

// Generate image for a single slug and upload to R2.
// Returns the heroImage path on success, null on failure.
export async function generateAndUploadDialogImage(slug, heroPrompt) {
  const fullPrompt = heroPrompt + STYLE_SUFFIX;
  if (dryRun) { console.log(`[dry-run] would generate: ${slug}`); return null; }

  const resp = await client.images.generate({
    model: 'gpt-image-1',
    prompt: fullPrompt,
    size: '1536x1024',
    quality: 'medium',
    n: 1
  });
  const b64 = resp.data[0].b64_json;
  if (!b64) throw new Error('no b64_json in response');
  const buf = Buffer.from(b64, 'base64');

  // Write to temp file, upload via wrangler, then delete
  const tmpFile = join(tmpdir(), `dialog-hero-${slug}-${Date.now()}.jpg`);
  writeFileSync(tmpFile, buf);
  try {
    execFileSync(WRANGLER, [
      'r2', 'object', 'put',
      `${R2_BUCKET}/${R2_KEY_PREFIX}/${slug}-hero.jpg`,
      '--file', tmpFile,
      '--content-type', 'image/jpeg',
      '--remote'
    ], { stdio: 'inherit' });
  } finally {
    unlinkSync(tmpFile);
  }
  return `/images/dialog/${slug}-hero.jpg`;
}

// Batch mode: process all dialog markdown files
const files = readdirSync(DIALOG_DIR).filter(f => f.endsWith('.md'));
console.log(`Found ${files.length} dialog files. Generating images...\n`);

for (const file of files) {
  const mdPath = join(DIALOG_DIR, file);
  const text = readFileSync(mdPath, 'utf-8');
  const parsed = parseFrontmatter(text, file);
  if (!parsed?.heroPrompt || !parsed.slug) {
    console.log(`SKIP ${file} (no heroPrompt or slug)`);
    continue;
  }
  if (slugFilter && parsed.slug !== slugFilter) continue;
  if (parsed.alreadyHasHeroImage) {
    console.log(`SKIP ${parsed.slug} (heroImage already set)`);
    continue;
  }

  const alreadyInR2 = await r2Exists(parsed.slug);
  if (alreadyInR2) {
    console.log(`SKIP ${parsed.slug} (already in R2, adding heroImage to frontmatter)`);
  } else {
    console.log(`GEN  ${parsed.slug} ...`);
    try {
      await generateAndUploadDialogImage(parsed.slug, parsed.heroPrompt);
      console.log(`OK   ${parsed.slug} → R2`);
    } catch (err) {
      console.error(`FAIL ${parsed.slug}: ${err.message}`);
      continue;
    }
  }

  // Add heroImage to frontmatter
  const newText = text.replace(
    /^(---\n[\s\S]*?)(\n---\n)/,
    `$1\nheroImage: /images/dialog/${parsed.slug}-hero.jpg$2`
  );
  if (newText !== text) {
    writeFileSync(mdPath, newText);
    console.log(`     wrote heroImage in ${file}`);
  }
}

console.log('\nDone.');
