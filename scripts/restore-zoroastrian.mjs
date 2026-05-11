#!/usr/bin/env node
// Restore Zoroastrian library files by re-fetching source HTML from avesta.org
// and extracting only the main text column (strips interleaved footnotes).
//
// avesta.org uses a two-column TABLE layout:
//   left  TD            = main text (stanzas, prose)
//   right TD CLASS=NOTE = footnotes — discarded
//
// Usage:
//   node scripts/restore-zoroastrian.mjs --dry-run   # preview, no writes
//   node scripts/restore-zoroastrian.mjs              # write files

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');
const ONLY = process.argv.find(a => a.startsWith('--only='))?.split('=')[1];

const LIBRARY_ROOT = join(
  process.env.HOME,
  'Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library/Zoroastrian'
);

const DELAY_MS = 800; // polite delay between requests

// ── HTML → markdown conversion ────────────────────────────────────────────

function decodeEntities(s) {
  return s
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&acirc;/g, 'â').replace(/&ecirc;/g, 'ê').replace(/&icirc;/g, 'î')
    .replace(/&ocirc;/g, 'ô').replace(/&ucirc;/g, 'û').replace(/&acirc;/g, 'â')
    .replace(/&agrave;/g, 'à').replace(/&egrave;/g, 'è').replace(/&igrave;/g, 'ì')
    .replace(/&ograve;/g, 'ò').replace(/&ugrave;/g, 'ù')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&[a-z]+;/g, '');
}

function stripTags(html) {
  return html
    .replace(/<SUP[^>]*>\d+<\/SUP>/gi, '')   // footnote superscripts
    .replace(/<[^>]+>/g, ' ')                  // all other tags → space
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract text from a single left-column TD (main text, no notes)
function extractLeftColumn(tdHtml) {
  // Strip inline tags, decode entities
  const text = decodeEntities(stripTags(tdHtml)).trim();
  return text;
}

// Parse avesta.org HTML into an array of paragraph strings (main text only)
function parseAvestaHtml(html) {
  const paragraphs = [];

  // Extract the body after the nav menu
  const bodyStart = html.indexOf('</div>');
  let body = bodyStart > -1 ? html.slice(bodyStart) : html;

  // Skip synopsis/intro: start from <HR> or <H3> (whichever comes first)
  // This avoids picking up geographic reference tables in the intro section
  const hrPos = body.search(/<HR/i);
  const h3Pos = body.search(/<H3/i);
  const contentStart = [hrPos, h3Pos].filter(p => p > -1).reduce((a, b) => Math.min(a, b), Infinity);
  if (contentStart < Infinity) body = body.slice(contentStart);

  // Check if this page uses the two-column TABLE layout (most SBE pages do)
  const hasTable = /<TABLE/i.test(body);

  if (hasTable) {
    // Split by TR rows, take the first TD of each row (skip CLASS=NOTE TD)
    const rows = body.split(/<TR[^>]*>/i).slice(1);
    for (const row of rows) {
      // Find first TD (before any CLASS=NOTE td)
      const noteStart = row.search(/<TD[^>]*CLASS\s*=\s*["']?NOTE/i);
      const firstTd = noteStart > -1 ? row.slice(0, noteStart) : row;
      // Strip TD tags
      const tdContent = firstTd.replace(/<\/?TD[^>]*>/gi, '');
      const text = extractLeftColumn(tdContent);
      if (text && text.length > 20) paragraphs.push(text);
    }
  } else {
    // Simpler pages: extract P tags directly
    const pMatches = [...body.matchAll(/<P[^>]*>([\s\S]*?)(?=<P[^>]*>|<H[2-6]|<HR|<\/BODY)/gi)];
    for (const m of pMatches) {
      const text = extractLeftColumn(m[1]);
      if (text && text.length > 30) paragraphs.push(text);
    }
  }

  // Filter: remove boilerplate lines
  const boilerplate = [
    /^this digital edition/i,
    /^translated by james darmesteter/i,
    /^from sacred books of the east/i,
    /^compare this chapter/i,
    /^for an analysis see/i,
    /^avesta:?\s*(vendidad|yasna|visperad|khorda)/i,
    /^avestan name\./i,
    /^copyright/i,
    /^sacred texts/i,
  ];

  return paragraphs
    .filter(p => !boilerplate.some(r => r.test(p.trim())))
    .filter(p => p.trim().length > 15);
}

// ── Frontmatter helpers ───────────────────────────────────────────────────

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { fm: '', body: content };
  return { fm: m[1], body: m[2] };
}

function buildMarkdown(fm, paragraphs) {
  const body = paragraphs.join('\n\n');
  return `---\n${fm}\n---\n\n${body}\n`;
}

// ── File discovery ────────────────────────────────────────────────────────

function findMdFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findMdFiles(full));
    } else if (entry.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

// ── Fetch ─────────────────────────────────────────────────────────────────

async function fetchUrl(url) {
  const { default: https } = await import('https');
  const { default: http } = await import('http');
  const client = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; library-bot/1.0)' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('latin1')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const files = findMdFiles(LIBRARY_ROOT);
  console.log(`Found ${files.length} .md files in Zoroastrian library`);

  let processed = 0, skipped = 0, errors = 0;

  for (const filePath of files) {
    const rel = filePath.replace(LIBRARY_ROOT + '/', '');
    if (ONLY && !rel.includes(ONLY)) continue;

    const content = readFileSync(filePath, 'utf-8');
    const { fm, body } = parseFrontmatter(content);

    // Extract sourceUrl
    const urlMatch = fm.match(/sourceUrl:\s*["']?(https?:\/\/[^\s"']+)["']?/);
    if (!urlMatch) {
      console.log(`  SKIP (no sourceUrl): ${rel}`);
      skipped++;
      continue;
    }
    const sourceUrl = urlMatch[1];

    // Skip index pages — no content to extract
    if (sourceUrl.includes('index.html') || sourceUrl.includes('index.htm')) {
      console.log(`  SKIP (index page): ${rel}`);
      skipped++;
      continue;
    }

    console.log(`\nProcessing: ${rel}`);
    console.log(`  URL: ${sourceUrl}`);

    try {
      const html = await fetchUrl(sourceUrl);
      const paragraphs = parseAvestaHtml(html);

      if (paragraphs.length < 2) {
        console.log(`  WARN: only ${paragraphs.length} paragraphs extracted — skipping`);
        skipped++;
        continue;
      }

      console.log(`  Extracted ${paragraphs.length} paragraphs`);
      if (DRY_RUN) {
        console.log(`  [dry-run] First para: ${paragraphs[0].slice(0, 100)}`);
        console.log(`  [dry-run] Last para:  ${paragraphs[paragraphs.length - 1].slice(0, 100)}`);
      } else {
        const newContent = buildMarkdown(fm, paragraphs);
        writeFileSync(filePath, newContent, 'utf-8');
        console.log(`  Written: ${paragraphs.length} paras → ${filePath.split('/').pop()}`);
      }

      processed++;
      await sleep(DELAY_MS);

    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n─────────────────────────────`);
  console.log(`Processed: ${processed}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Errors:    ${errors}`);
  if (DRY_RUN) console.log(`\n[DRY RUN] No files were written.`);
}

main().catch(console.error);
