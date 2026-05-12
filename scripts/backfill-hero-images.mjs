#!/usr/bin/env node
// One-off: generate + upload hero images for published dialogs missing them,
// then PATCH the DB record via the admin API.
//
// Usage: node scripts/backfill-hero-images.mjs

import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { generateAndUploadDialogImage } from './generate-dialog-images.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const API_BASE = process.env.API_BASE || 'https://api.siftersearch.com';
const ADMIN_KEY = process.env.INTERNAL_API_KEY;

const MISSING = [
  { slug: 'bahauallah-distinguish-science-materialism', title: 'How Does Bahá\'u\'lláh Distinguish Science from Materialism?' },
  { slug: '009-the-infallibility-of-the-uhj-what-kind', title: 'The Infallibility of the UHJ — What Kind?' },
  { slug: '010-why-a-thousand-years', title: 'Why a Thousand Years?' },
  { slug: '011-backbiting-vs-honest-criticism', title: 'Backbiting vs Honest Criticism' },
  { slug: '012-work-as-worship-including-exploitative-work', title: 'Work as Worship — Including Exploitative Work?' },
  { slug: '013-consultation-as-spiritual-practice', title: 'Consultation as Spiritual Practice' },
  { slug: '014-predestination-and-free-will', title: 'Predestination and Free Will' },
  { slug: '015-lesser-peace-most-great-peace-whats-the-distinction', title: 'Lesser Peace, Most Great Peace — What\'s the Distinction?' },
  { slug: '016-the-greatest-name-metaphysics-of-bah', title: 'The Greatest Name — Metaphysics of Bahá\'' },
  { slug: '017-suffering-instrumental-redemptive-or-meaningless', title: 'Suffering — Instrumental, Redemptive, or Meaningless?' },
  { slug: '018-historical-accuracy-of-religious-narratives', title: 'Historical Accuracy of Religious Narratives' },
  { slug: '019-how-the-bah-faith-reads-christian-symbols', title: 'How the Bahá\'í Faith Reads Christian Symbols' },
];

for (const { slug, title } of MISSING) {
  const heroPrompt = `A meditative scene evoking the theme: "${title}". Loose dreamlike imagery, no human faces, soft and contemplative.`;
  console.log(`GEN  ${slug}...`);
  try {
    const heroPath = await generateAndUploadDialogImage(slug, heroPrompt);
    if (!heroPath) { console.log(`  skipped (dry-run?)`); continue; }

    const res = await fetch(`${API_BASE}/api/v1/admin/dialogs/${slug}/hero`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_KEY },
      body: JSON.stringify({ hero_image: heroPath }),
    });
    if (res.ok) console.log(`  OK → ${heroPath}`);
    else console.error(`  DB PATCH failed: ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error(`  FAIL: ${err.message}`);
  }
}
console.log('\nDone.');
