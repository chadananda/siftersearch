#!/usr/bin/env node
// Generate watercolor "Q" and "A" decorative letterforms — paired markers
// for user-question and Jafar-answer bubbles in /dialogue articles. Style
// matches the existing Jafar avatar work: hand-drawn watercolor, indigo +
// gold palette. Single Latin letter centered on transparent / dark background.
//
// Output: public/images/qa-markers/q-watercolor.png + a-watercolor.png

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });

const OpenAI = (await import('openai')).default;
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OUT = join(PROJECT_ROOT, 'public/images/qa-markers');
mkdirSync(OUT, { recursive: true });

const STYLE = ' Square 1:1 composition, the single letter centered and dominating the frame, occupying ~75% of the image area. Blue-shaded hand-drawn watercolor — indigo and cobalt washes with warm gold accents, loose brushwork, paper texture visible, soft bleeding edges. The letter is elegant classical serif (Caslon / Garamond style), italic, with subtle swash flourishes. Background is a deep indigo wash that fades toward the edges. No additional text, no decorative borders, no other symbols — just the single letter as the subject.';

const LETTERS = [
  {
    slug: 'q-watercolor',
    prompt: 'A single elegant italic capital letter "Q" rendered in BRIGHT warm gold watercolor — burnished gold, ochre, and amber washes, glowing — with subtle deep-blue shadow on the left edge. The letter\'s tail (the descender) is a confident curving flourish. Bright and luminous, classical Roman proportions with refined serifs. Centered on a darker indigo wash background. Should pair visually with a matching gold "A" letterform of the same style.'
  },
  {
    slug: 'a-watercolor',
    prompt: 'A single elegant italic capital letter "A" rendered in warm gold watercolor — burnished gold, ochre, and amber washes — with subtle deep-blue shadow on the left edge. The letter has classical Roman proportions with refined serifs. Centered on a darker indigo wash background.'
  }
];

const args = process.argv.slice(2);
const force = args.includes('--force');

for (const c of LETTERS) {
  const outPath = join(OUT, `${c.slug}.png`);
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

console.log('\nDone. Markers at public/images/qa-markers/');
console.log('Resize via sips, upload to R2 cdn-assets/siftersearch.com/qa-markers/, then swap the CSS ::before content for background-image.');
