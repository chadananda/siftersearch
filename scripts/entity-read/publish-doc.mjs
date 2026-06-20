// Publish a repo docs/*.md file into the doc_pages CMS via the admin API (so it appears on the docs site
// + in the side menu). Title is taken from the first H1; description from the first prose line.
// Usage: node publish-doc.mjs <file.md> <slug> <section> <nav_label> [sort_order] [status]
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync } from 'fs';
const [file, slug, section, navLabel, sortOrder, status] = process.argv.slice(2);
const md = readFileSync(file, 'utf8');
const title = (md.match(/^#\s+(.+)$/m) || [])[1]?.trim() || slug;
const description = (md.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('>')) || '').replace(/[*_`[\]]/g, '').slice(0, 200).trim();
const KEY = process.env.INTERNAL_API_KEY;
const res = await fetch(`http://127.0.0.1:7839/api/v1/admin/pages/${slug}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'X-Admin-Key': KEY },
  body: JSON.stringify({ title, body_md: md, section, nav_label: navLabel, sort_order: sortOrder ? Number(sortOrder) : 100, description, status: status || 'published' }),
});
console.log('HTTP', res.status, (await res.text()).slice(0, 300));
process.exit(0);
