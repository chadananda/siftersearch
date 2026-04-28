#!/usr/bin/env node
// Generate 4 candidate avatars for Jafar's personification.
// Saves to public/images/jafar-avatars/ for the user to pick from.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });

const OpenAI = (await import('openai')).default;
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OUT = join(PROJECT_ROOT, 'public/images/jafar-avatars');
mkdirSync(OUT, { recursive: true });

const STYLE = ' Square 1:1 composition, centered subject, simple. Blue-shaded hand-drawn watercolor — indigo and cobalt washes with warm gold accents, loose brushwork, paper texture visible, soft bleeding edges. Suitable as a small circular avatar (will be cropped circular). No text, no labels, no symbols other than what is explicitly described.';

const CANDIDATES = [
  {
    slug: 'a-calligraphic-jim',
    prompt: 'A stylized Arabic letter Jīm (ج) rendered as elegant calligraphy in burnished gold on a deep indigo background. The letter floats centered, with subtle watercolor washes radiating outward. Classical Persian manuscript aesthetic.'
  },
  {
    slug: 'b-wise-figure-profile',
    prompt: 'A contemplative figure in profile, robed and seated reading from an open book, viewed from a respectful distance. The figure has no clearly visible facial features (impressionistic only). Indigo robes, gold light from the book illuminating the page. Painterly, classical, dignified.'
  },
  {
    slug: 'c-illuminated-book',
    prompt: 'An open book at the center, its pages emanating warm golden light. The book rests on a dark indigo cloth. Soft watercolor halo of light around the book. Loose lines, paper texture. Quiet, devotional mood.'
  },
  {
    slug: 'd-classical-lamp',
    prompt: 'A simple oil lamp with a warm flame, classical Middle Eastern style, on a deep indigo background. The flame casts soft golden light. Watercolor strokes, no faces, no figures, just the lamp. Symbol of guidance.'
  },
];

const args = process.argv.slice(2);
const force = args.includes('--force');

for (const c of CANDIDATES) {
  const outPath = join(OUT, `${c.slug}.jpg`);
  if (existsSync(outPath) && !force) {
    console.log(`SKIP ${c.slug} (exists)`);
    continue;
  }
  console.log(`GEN  ${c.slug} ...`);
  try {
    const resp = await client.images.generate({
      model: 'gpt-image-1',
      prompt: c.prompt + STYLE,
      size: '1024x1024',
      quality: 'medium',
      n: 1
    });
    const b64 = resp.data[0].b64_json;
    if (!b64) throw new Error('no b64_json');
    writeFileSync(outPath, Buffer.from(b64, 'base64'));
    console.log(`OK   ${outPath}`);
  } catch (err) {
    console.error(`FAIL ${c.slug}: ${err.message}`);
  }
}

console.log('\nDone. Candidates at public/images/jafar-avatars/');
console.log('Pick one and the [slug].astro CSS can be updated to use it.');
