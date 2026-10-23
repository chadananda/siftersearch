#!/usr/bin/env node
// Author-photo PUBLISH: the audited photos (tmp/author-photos/audit.json + a reviewed verdicts file) → every photo we keep
// that is not already ours is stored ONCE in the cdn-assets R2 bucket (book-authors/<slug>/<sha16>.<ext>, served by the
// image worker) with its credit + licence; photos that failed are removed. Writes through the `book-author-photo-set` ops
// job (never the DB). No hotlinks (Chad 10-23). R2 + the internal API only.
//   node scripts/books/author_photo_publish.mjs <verdicts.json> [--write]
//   verdicts.json: { "<photo url>": "keep" | "remove", … } (urls from audit.json; anything absent = audit verdict pass→keep, fail→remove)
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { putCdnPortrait } from '../../api/lib/media/speakers.js';
import { photoUrl } from '../../api/lib/media/gallery.js';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
const UA = 'SifterSearch library (https://siftersearch.com; chadananda@gmail.com)';
const API = process.env.SIFTER_API || 'https://api.siftersearch.com';
const write = process.argv.includes('--write');
const audit = JSON.parse(readFileSync(join(process.cwd(), 'tmp', 'author-photos', 'audit.json'), 'utf8'));
const verdicts = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’]/g, '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ours = (u) => u.startsWith('https://siftersearch.com/img/cdn/siftersearch.com/');

/** Commons file page → { credit, licence } (extmetadata, markup stripped). */
async function commonsCredit(page) {
  const title = decodeURIComponent(String(page || '').split('/wiki/')[1] || '');
  if (!title) return {};
  const q = new URLSearchParams({ action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'extmetadata', titles: title });
  const j = await (await fetch(`https://commons.wikimedia.org/w/api.php?${q}`, { headers: { 'User-Agent': UA } })).json();
  const md = Object.values(j?.query?.pages || {})[0]?.imageinfo?.[0]?.extmetadata || {};
  const v = (k) => String(md[k]?.value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return { credit: (v('Artist') || v('Credit')).slice(0, 200) || null, licence: v('LicenseShortName') || v('UsageTerms') || null };
}

const fixes = [];
for (const a of audit) {
  const keep = (verdicts[a.url] || (a.verdict === 'pass' ? 'keep' : a.verdict === 'fail' ? 'remove' : null));
  if (!keep) { console.log('UNDECIDED', a.author, a.url); continue; }
  const check = `${a.why}${verdicts[a.url] ? ` · reviewed by eye 10-23: ${verdicts[a.url]}` : ''}`;
  if (keep === 'remove') { for (const id of a.doc_ids) fixes.push({ id, url: null, evidence: { source: a.source, url: a.url, check } }); continue; }
  if (ours(a.url)) { for (const id of a.doc_ids) fixes.push({ id, url: a.url, evidence: { source: a.source, evidence: a.evidence, check } }); continue; }
  // a hotlinked portrait → our CDN, with its credit and licence
  const r = await fetch(a.url, { headers: { 'User-Agent': UA } });
  if (!r.ok) { console.log('DOWNLOAD FAILED', a.url, r.status); continue; }
  const bytes = Buffer.from(await r.arrayBuffer());
  const ext = bytes[0] === 0x89 ? 'png' : bytes.slice(8, 12).toString() === 'WEBP' ? 'webp' : 'jpg';
  const sha = createHash('sha256').update(bytes).digest('hex');
  const file = `book-authors/${slug(a.author)}/${sha.slice(0, 16)}.${ext}`;
  const page = (String(a.evidence || '').match(/https:\/\/commons\.wikimedia\.org\/wiki\/\S+/) || [])[0] || null;
  const { credit, licence } = page ? await commonsCredit(page) : {};
  if (write) await putCdnPortrait(file, bytes, { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext]);
  const url = photoUrl(file, sha);
  console.log('STORED', a.author, '→', url, '|', licence, '|', credit);
  for (const id of a.doc_ids) fixes.push({ id, url, evidence: { source: a.source, original: a.url, page, credit, licence, sha, check } });
}
const res = await fetch(`${API}/api/admin/ops/reports/book-author-photo-set`, { method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Internal-Key': process.env.DEPLOY_SECRET || '' }, body: JSON.stringify({ params: { fixes, write } }) });
console.log(fixes.length, 'fixes →', res.status, (await res.text()).slice(0, 200));
