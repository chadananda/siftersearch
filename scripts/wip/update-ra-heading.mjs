import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });

const API = process.env.API || 'http://tower-nas:7839';
const KEY = process.env.INTERNAL_API_KEY;
if (!KEY) { console.error('INTERNAL_API_KEY missing'); process.exit(1); }

// Pull current
const r1 = await fetch(`${API}/api/v1/admin/pages/research-assistant`, {
  headers: { 'X-Admin-Key': KEY }
});
const data = await r1.json();
const doc = data.doc;

// Update heading
const oldH = '<h2>Who Jafar is</h2>';
const newH = '<h2>Meet Jafar, the world\u2019s most powerful interfaith research assistant</h2>';
if (!doc.body_md.includes(oldH)) {
  console.error('Heading not found in current body. First 300 chars:');
  console.error(doc.body_md.slice(0, 300));
  process.exit(1);
}
const updated = doc.body_md.replace(oldH, newH);

// PUT back (preserve everything else)
const r2 = await fetch(`${API}/api/v1/admin/pages/research-assistant`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'X-Admin-Key': KEY },
  body: JSON.stringify({
    title: doc.title,
    description: doc.description,
    section: doc.section,
    nav_label: doc.nav_label,
    sort_order: doc.sort_order,
    layout: doc.layout || 'docs',
    active_section: doc.active_section,
    status: doc.status,
    body_md: updated
  })
});
const result = await r2.json();
console.log(`PUT status ${r2.status}:`, result);
