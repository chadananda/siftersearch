#!/usr/bin/env node
// Generate hero images for /dialog/ pages using OpenAI's image API.
// Reads heroPrompt from each markdown frontmatter, generates a 1024×1024
// blue-shaded watercolor image, saves to public/images/dialog/{slug}-hero.jpg
// then re-enables `heroImage:` in the frontmatter (was commented out).

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

const OpenAI = (await import('openai')).default;
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DIALOG_DIR = join(PROJECT_ROOT, 'src/content/dialogs');
const IMAGE_DIR = join(PROJECT_ROOT, 'public/images/dialog');
mkdirSync(IMAGE_DIR, { recursive: true });

const STYLE_SUFFIX = ' Style: blue-shaded hand-drawn watercolor, indigo and cobalt washes with hints of warm gold, loose brushwork, paper texture visible, soft bleeding edges, contemplative classical illustration. Avoid photorealism. No text, no labels.';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const slugFilter = args.find(a => a.startsWith('--slug='))?.split('=')[1];

function parseFrontmatter(text, filename) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  const fm = m[1];
  const body = m[2];
  const heroPromptMatch = fm.match(/^heroPrompt:\s*"([^"]+)"$/m);
  const titleMatch = fm.match(/^title:\s*"([^"]+)"$/m);
  const questionMatch = fm.match(/^question:\s*"([^"]+)"$/m);
  // Slug derived from filename (drop .md). Falls back to heroImage line if it ever existed.
  const slug = filename.replace(/\.md$/, '');
  // Derive a watercolor prompt from the title if heroPrompt is missing
  let heroPrompt = heroPromptMatch?.[1];
  if (!heroPrompt && titleMatch?.[1]) {
    heroPrompt = `A meditative scene evoking the theme: "${titleMatch[1]}". Loose dreamlike imagery, no human faces, soft and contemplative.`;
  }
  return { fm, body, heroPrompt, slug };
}

const files = readdirSync(DIALOG_DIR).filter(f => f.endsWith('.md'));
console.log(`Found ${files.length} dialog files. Generating images...\n`);

for (const file of files) {
  const path = join(DIALOG_DIR, file);
  const text = readFileSync(path, 'utf-8');
  const parsed = parseFrontmatter(text, file);
  if (!parsed?.heroPrompt || !parsed.slug) {
    console.log(`SKIP ${file} (no heroPrompt or slug)`);
    continue;
  }
  if (slugFilter && parsed.slug !== slugFilter) continue;

  const outPath = join(IMAGE_DIR, `${parsed.slug}-hero.jpg`);
  if (existsSync(outPath)) {
    console.log(`SKIP ${parsed.slug} (already exists at ${outPath})`);
    continue;
  }

  const fullPrompt = parsed.heroPrompt + STYLE_SUFFIX;
  console.log(`GEN  ${parsed.slug} ...`);
  if (dryRun) { console.log('   (dry-run) prompt:', fullPrompt.slice(0, 200)); continue; }

  try {
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
    writeFileSync(outPath, buf);
    console.log(`OK   ${parsed.slug} → ${outPath} (${buf.length} bytes)`);

    // Add or re-enable heroImage in frontmatter
    let newText;
    if (text.includes(`# heroImage: /images/dialog/${parsed.slug}-hero.jpg`)) {
      // Re-enable existing commented-out reference
      newText = text.replace(
        `# heroImage: /images/dialog/${parsed.slug}-hero.jpg`,
        `heroImage: /images/dialog/${parsed.slug}-hero.jpg`
      );
    } else if (text.match(/^heroImage:/m)) {
      newText = text;  // already has heroImage line
    } else {
      // Insert heroImage line before the closing --- of frontmatter
      newText = text.replace(
        /^(---\n[\s\S]*?)(\n---\n)/,
        `$1\nheroImage: /images/dialog/${parsed.slug}-hero.jpg$2`
      );
    }
    if (newText !== text) {
      writeFileSync(path, newText);
      console.log(`     wrote heroImage line in ${file}`);
    }
  } catch (err) {
    console.error(`FAIL ${parsed.slug}: ${err.message}`);
  }
}

console.log('\nDone.');
