import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });

const API = process.argv.find(a => a.startsWith('--api='))?.split('=')[1] || 'http://tower-nas:7839';
const KEY = process.env.INTERNAL_API_KEY;
if (!KEY) { console.error('INTERNAL_API_KEY missing'); process.exit(1); }

const body_md = readFileSync(join(ROOT, 'scripts/wip/research-assistant-doc.md'), 'utf-8');

const payload = {
  title: 'Research Assistant',
  description: 'Jafar — the SifterSearch research assistant. Conversational, anchored in primary scripture, three-stage pipeline (research → craft → reflect), follows the Authority Hierarchy across traditions.',
  section: 'getting-started',
  nav_label: 'Research Assistant',
  sort_order: 30,
  body_md,
  layout: 'docs',
  active_section: 'research-assistant',
  status: 'published'
};

async function put(slug, data) {
  const res = await fetch(`${API}/api/v1/admin/pages/${slug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': KEY },
    body: JSON.stringify(data)
  });
  return { status: res.status, body: await res.text() };
}

async function del(slug) {
  const res = await fetch(`${API}/api/v1/admin/pages/${slug}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Key': KEY }
  });
  return { status: res.status, body: await res.text() };
}

console.log('PUT new doc at /research-assistant ...');
const r1 = await put('research-assistant', payload);
console.log(`  HTTP ${r1.status}: ${r1.body.slice(0, 100)}`);

console.log('Archive old doc at /chatbot-personality ...');
const r2 = await del('chatbot-personality');
console.log(`  HTTP ${r2.status}: ${r2.body.slice(0, 100)}`);

console.log('Verify public reads ...');
const v1 = await fetch(`${API}/api/v1/pages/research-assistant`).then(r => r.status);
const v2 = await fetch(`${API}/api/v1/pages/chatbot-personality`).then(r => r.status);
console.log(`  /research-assistant → ${v1} (expect 200)`);
console.log(`  /chatbot-personality → ${v2} (expect 404 since archived)`);
