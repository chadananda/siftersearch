#!/usr/bin/env node
/**
 * Converts ocean-search-testing .md fixtures to SifterSearch JSON format.
 * Deduplicates queries that have both (15) and (500) variants (keeps (15)).
 * Outputs to tests/quality/ocean-fixtures.json.
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const SEARCH_DIR = join(PROJECT_ROOT, 'planning/ocean-search-testing/tests/searches');
const OUT_FILE = join(PROJECT_ROOT, 'tests/quality/ocean-fixtures.json');

// Map ocean-search-testing category names to our religion_filter values
const RELIGION_MAP = {
  'Bahai': "Baha'i",
  'Baha': "Baha'i",
  'Christianity': 'Christian',
  'Christian': 'Christian',
  'Islam': 'Islam',
  'Buddhist': 'Buddhist',
  'Buddhism': 'Buddhist',
  'Hindu': 'Hindu',
  'Hinduism': 'Hindu',
  'Jewish': 'Jewish',
  'Judaism': 'Jewish',
  'Zoroastrian': 'Zoroastrian',
};

// Assign category based on scenario text and query characteristics
function assignCategory(scenario, searchPhrase, hasReligionFilter) {
  const s = scenario.toLowerCase();
  const q = searchPhrase.toLowerCase();
  if (hasReligionFilter) return 'concept-match';
  if (s.includes('timing') || q.startsWith('"') || q.length < 6) return 'phrase-match';
  if (s.includes('ordering') || s.includes('search ordering')) return 'concept-match';
  // Named terms from specific traditions (entity names, concepts, terms)
  if (/^[A-Z][a-z]+$/.test(searchPhrase.trim()) && searchPhrase.length < 20) return 'concept-match';
  // Multi-word concepts that span traditions
  return 'cross-tradition';
}

// Parse a markdown result row: | 0 | ... | Title | First Hit Text | ... |
function parseResultRows(md) {
  const results = [];
  const lines = md.split('\n');
  let inTable = false;
  let headerPassed = false;
  for (const line of lines) {
    if (!line.startsWith('|')) { if (inTable) break; continue; }
    if (line.includes('Index') && line.includes('Title')) { inTable = true; continue; }
    if (inTable && line.match(/^\|[-:]+\|/)) { headerPassed = true; continue; }
    if (!headerPassed) continue;
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 6) continue;
    // Parse from right: last col = Queries, second-to-last = First Hit Text, third-to-last = Title
    const text = cols[cols.length - 2];
    const title = cols[cols.length - 3];
    if (!title || title === 'Title' || title === '---' || !text) continue;
    results.push({ title, text: text.replace(/^\.\.\./, '').replace(/\.\.\.$/, '').trim() });
  }
  return results;
}

// Convert a text snippet to expected_text_contains: pick 1-2 distinctive words
function extractTextCheck(text, query) {
  if (!text) return [];
  // Remove markdown/ellipsis artifacts
  const clean = text.replace(/\[.*?\]/g, '').replace(/\.\.\./g, '').trim();
  if (!clean) return [];
  // Return up to 2 words that aren't in the query (more distinctive)
  const queryWords = new Set(query.toLowerCase().split(/\s+/));
  const words = clean.match(/[A-Z][a-z]{3,}|[a-z]{5,}/g) || [];
  const distinctive = words.filter(w => !queryWords.has(w.toLowerCase())).slice(0, 1);
  // Fallback: just use first significant word from text
  if (distinctive.length === 0) {
    const first = clean.split(/\s+/).find(w => w.length > 3);
    return first ? [first.replace(/[^a-zA-ZÀ-ÿ'-]/g, '')] : [];
  }
  return distinctive;
}

// Slugify a query to a fixture ID
function toId(query, religion) {
  const base = query
    .toLowerCase()
    .replace(/['"()\[\]]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  return religion ? `${base}-${religion.toLowerCase().replace(/'/g, '').replace(/\s+/g, '-')}` : base;
}

// Parse frontmatter from markdown
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w+):\s*['"]?(.*?)['"]?\s*$/);
    if (m) fm[m[1]] = m[2];
  }
  return fm;
}

const files = readdirSync(SEARCH_DIR).filter(f => f.endsWith('.md'));

// Group by base query (strip k-value suffix) to deduplicate
const byQuery = new Map();
for (const file of files) {
  // Extract k-value and base name
  const kMatch = file.match(/\((\d+)\)\.md$/);
  const k = kMatch ? parseInt(kMatch[1]) : 999;
  const base = file.replace(/ \(\d+\)\.md$/, '');
  if (!byQuery.has(base) || k < byQuery.get(base).k) {
    byQuery.set(base, { file, k, base });
  }
}

console.log(`Unique queries after dedup: ${byQuery.size}`);

const fixtures = [];
const seen = new Set();

for (const { file } of byQuery.values()) {
  const content = readFileSync(join(SEARCH_DIR, file), 'utf8');
  const fm = parseFrontmatter(content);
  if (!fm.searchPhrase) continue;

  // Extract religion filter from filename or searchPhrase
  const catMatch = file.match(/category-([A-Za-z]+)/);
  let religion = null;
  let cleanQuery = fm.searchPhrase;

  if (catMatch) {
    religion = RELIGION_MAP[catMatch[1]] || null;
  }
  // Also handle (category:X) embedded in searchPhrase
  const embeddedCat = cleanQuery.match(/\(category:([A-Za-z]+)\)/);
  if (embeddedCat) {
    religion = religion || RELIGION_MAP[embeddedCat[1]] || null;
    cleanQuery = cleanQuery.replace(/\s*\(category:[^)]+\)/, '').trim();
  }
  // Strip surrounding quotes from exact phrase queries
  cleanQuery = cleanQuery.replace(/^"(.*)"$/, '$1');

  const id = toId(cleanQuery, religion);
  if (seen.has(id)) continue;
  seen.add(id);

  const results = parseResultRows(content);
  const firstResult = results[0];

  const scenario = fm.scenario || '';
  const category = assignCategory(scenario, cleanQuery, !!religion);

  const fixture = {
    id,
    category,
    query: cleanQuery,
    intent: scenario.replace(/^['"](.*)['"]\s*$/, '$1').slice(0, 120),
  };

  if (religion) fixture.religion_filter = religion;

  // Use first result's text snippet as a loose text check
  if (firstResult?.text) {
    const checks = extractTextCheck(firstResult.text, cleanQuery);
    if (checks.length > 0) fixture.expected_text_contains = checks;
  }

  fixtures.push(fixture);
}

// Sort by category then id
fixtures.sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));

writeFileSync(OUT_FILE, JSON.stringify(fixtures, null, 2));
console.log(`Written ${fixtures.length} fixtures to ${OUT_FILE}`);

// Summary by category
const cats = {};
for (const f of fixtures) cats[f.category] = (cats[f.category] || 0) + 1;
for (const [k, v] of Object.entries(cats)) console.log(`  ${k}: ${v}`);
