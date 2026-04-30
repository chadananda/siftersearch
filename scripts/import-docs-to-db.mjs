#!/usr/bin/env node
// One-shot: migrate static .astro doc pages → DB via admin API.
// Targets only docs that:
//   - Have no dynamic data fetches in their frontmatter
//   - Use simple inline-HTML bodies
//   - Live directly under src/pages/docs/ (not /docs/agents which still
//     uses build-time content collections)
//
// Usage:
//   node scripts/import-docs-to-db.mjs              # dry-run
//   node scripts/import-docs-to-db.mjs --confirm    # actually PUT
//
// Requires:
//   INTERNAL_API_KEY in env (or passed via --key)
//   API base URL (defaults to https://api.siftersearch.com)

import { readFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const API_BASE = args.find(a => a.startsWith('--api='))?.split('=')[1] || process.env.PUBLIC_API_URL || 'https://api.siftersearch.com';
const API_KEY = args.find(a => a.startsWith('--key='))?.split('=')[1] || process.env.INTERNAL_API_KEY;

if (!API_KEY) {
  console.error('ERROR: INTERNAL_API_KEY not set in .env-secrets and no --key passed');
  process.exit(1);
}

// Eligibility: pure-static .astro docs that don't fetch external data.
// Whitelist explicitly to avoid breaking pages that depend on dynamic logic
// (research-strategy with stats fetch, library with collection lookup, etc.).
const TARGET_SLUGS = [
  'chatbot-personality',
  'api-billing',
  'indexing-layers'
];

const DOCS_DIR = join(ROOT, 'src', 'pages', 'docs');

// ─── Parse one .astro file → { slug, title, description, activeSection, body, sectionStyles }
function parseAstroDoc(slug) {
  const filePath = join(DOCS_DIR, `${slug}.astro`);
  const src = readFileSync(filePath, 'utf-8');

  // Locate the DocsLayout opening tag
  const layoutOpen = src.match(/<DocsLayout([\s\S]*?)>/);
  if (!layoutOpen) return null;

  const propsBlob = layoutOpen[1];
  const title = (propsBlob.match(/title=["']([^"']+)["']/) || [])[1] || '';
  const description = (propsBlob.match(/description=["']([^"']+)["']/) || [])[1] || '';
  const activeSection = (propsBlob.match(/activeSection=["']([^"']+)["']/) || [])[1] || slug;

  // Extract body — inner content of <DocsLayout>...</DocsLayout>
  const layoutClose = src.lastIndexOf('</DocsLayout>');
  const layoutOpenEnd = src.indexOf('>', src.indexOf('<DocsLayout')) + 1;
  if (layoutClose < 0 || layoutOpenEnd <= 0) return null;
  let body = src.slice(layoutOpenEnd, layoutClose).trim();

  // Strip Astro template-literal wrappers: `{`...`}` → ...
  body = body.replace(/\{`([\s\S]*?)`\}/g, (_match, inner) => inner);

  // Extract page-specific <style>...</style> block (after </DocsLayout>)
  const styleMatch = src.slice(layoutClose).match(/<style>([\s\S]*?)<\/style>/);
  const sectionStyles = styleMatch ? styleMatch[1].trim() : '';

  // If we have page styles, prepend them to the body (so they ship with the
  // DB-served HTML when the .astro file is no longer present).
  if (sectionStyles) {
    body = `<style>\n${sectionStyles}\n</style>\n\n${body}`;
  }

  return { slug, title, description, activeSection, body };
}

// ─── PUT to admin API
async function putDoc(parsed) {
  const url = `${API_BASE}/api/v1/admin/pages/${encodeURIComponent(parsed.slug)}`;
  // Body is HTML — we send it as body_md (marked passes through HTML).
  // Reads serve body_html (which equals body_md after marked's pass-through).
  const payload = {
    slug: parsed.slug,
    title: parsed.title,
    description: parsed.description,
    section: 'research',
    nav_label: parsed.title.length > 30 ? parsed.title.slice(0, 27) + '…' : parsed.title,
    sort_order: 100,
    body_md: parsed.body,
    layout: 'docs',
    active_section: parsed.activeSection,
    status: 'published'
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': API_KEY
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

// ─── Main
console.log(`API: ${API_BASE}`);
console.log(`Mode: ${CONFIRM ? 'CONFIRM (will PUT)' : 'dry-run'}`);
console.log(`Targets: ${TARGET_SLUGS.join(', ')}\n`);

let ok = 0, fail = 0;
for (const slug of TARGET_SLUGS) {
  const parsed = parseAstroDoc(slug);
  if (!parsed) {
    console.log(`✗ ${slug}: failed to parse`);
    fail++;
    continue;
  }
  const bodyChars = parsed.body.length;
  const stylesNote = parsed.body.startsWith('<style>') ? '+ inline style block' : '';
  console.log(`• ${slug}: "${parsed.title}" (${bodyChars} chars) ${stylesNote}`);

  if (!CONFIRM) continue;

  try {
    const result = await putDoc(parsed);
    if (result.status === 200) {
      console.log(`  ✓ PUT ${result.status}: ${result.body.slice(0, 80)}`);
      ok++;
    } else {
      console.log(`  ✗ PUT ${result.status}: ${result.body.slice(0, 200)}`);
      fail++;
    }
  } catch (err) {
    console.log(`  ✗ ERROR: ${err.message}`);
    fail++;
  }
}

console.log();
if (CONFIRM) {
  console.log(`Done. ok=${ok} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
} else {
  console.log('Pass --confirm to actually PUT to the API.');
}
