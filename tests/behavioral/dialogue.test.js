/**
 * Behavioral tests for the dialogue archive.
 *
 * STRICTNESS POLICY:
 *   - Drafts (published: false / no published field) get LIGHT validation:
 *     frontmatter parses, no nested-blockquote markup. Drafts are
 *     intentionally incomplete; failing on missing summaries/images would
 *     just be noise.
 *   - Published dialogs (published: true) get FULL structural enforcement:
 *     Q/A summary headers, hero either valid or absent, well-formed
 *     assessment block, citation link syntax, qualityScore at threshold.
 *
 * The test suite stays green on legacy archive content while catching
 * real regressions in the publish pipeline (which the user has had to
 * point out manually: images broken, summaries missing, nested quotes).
 *
 * Run with:  npx vitest run tests/behavioral/dialogue.test.js
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DIALOGS_DIR = join(ROOT, 'src/content/dialogs');
const PUBLIC_DIR = join(ROOT, 'public');

const dialogFiles = readdirSync(DIALOGS_DIR).filter(f => f.endsWith('.md'));

function loadDialog(file) {
  const path = join(DIALOGS_DIR, file);
  const raw = readFileSync(path, 'utf-8');
  return { path, raw, ...matter(raw) };
}

function countMatches(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

for (const file of dialogFiles) {
  describe(`dialog: ${file}`, () => {
    let dialog;
    try {
      dialog = loadDialog(file);
    } catch (err) {
      it('frontmatter parses', () => {
        throw new Error(`Failed to parse: ${err.message}`);
      });
      return;
    }

    const { data, content } = dialog;
    const isPublished = data.published === true;

    // ── Universal checks (drafts included) ────────────────────────────

    it('frontmatter has minimum required fields', () => {
      expect(data.title, 'title missing').toBeTruthy();
      expect(data.question, 'question missing').toBeTruthy();
      expect(data.topic, 'topic missing').toBeTruthy();
    });

    it('has no nested-blockquote markup (no `>>+`)', () => {
      const nested = content.match(/^>>+\s/gm);
      expect(nested, `${nested?.length} lines start with >>+ — renders as nested borders`)
        .toBeNull();
    });

    it('has user-turn and jafar-turn divs', () => {
      const userTurns = countMatches(content, /<div class="user-turn"[^>]*>/g);
      const jafarTurns = countMatches(content, /<div class="jafar-turn"[^>]*>/g);
      expect(userTurns, 'no user-turn divs').toBeGreaterThan(0);
      expect(jafarTurns, 'user-turn count must equal jafar-turn count').toBe(userTurns);
    });

    // ── Published-only strict checks ──────────────────────────────────

    it.skipIf(!isPublished)('published: full frontmatter schema', () => {
      expect(typeof data.qualityScore, 'qualityScore must be a number').toBe('number');
      expect(data.publishedAt, 'publishedAt missing').toBeDefined();
      const d = new Date(data.publishedAt);
      expect(d.toString(), `publishedAt unparseable: ${data.publishedAt}`).not.toBe('Invalid Date');
    });

    it.skipIf(!isPublished)('published: score is at or near threshold', () => {
      // A published dialog should score ≥78 (allowing 2pt grace at the
      // boundary). Below that it shouldn't be marked published.
      expect(data.qualityScore, `published with score ${data.qualityScore} (<78)`)
        .toBeGreaterThanOrEqual(78);
    });

    it.skipIf(!isPublished)('published: featured flag is set', () => {
      expect(data.featured, 'published dialog must have featured: true').toBe(true);
    });

    it.skipIf(!isPublished)('published: assessment block well-formed', () => {
      expect(data.assessment, 'assessment block missing').toBeDefined();
      expect(typeof data.assessment.scores, 'scores must be an object').toBe('object');
      expect(data.assessment.narrative, 'narrative missing').toBeTruthy();
      expect(Array.isArray(data.assessment.flags),
        'flags must be array (use `flags: []` if empty)').toBe(true);
      expect(data.assessment.improvement_plan, 'improvement_plan missing').toBeTruthy();
    });

    it.skipIf(!isPublished)('published: Q/A summary headers above each round', () => {
      const userTurns = countMatches(content, /<div class="user-turn"[^>]*>/g);
      const h3 = countMatches(content, /^###\s+.+\?$/gm);
      const h4 = countMatches(content, /^####\s+.+/gm);
      expect(h3, `expected ${userTurns} ### question headers, found ${h3}`).toBe(userTurns);
      expect(h4, `expected ${userTurns} #### answer headers, found ${h4}`).toBe(userTurns);
    });

    it.skipIf(!isPublished)('published: round count matches body', () => {
      const userTurns = countMatches(content, /<div class="user-turn"[^>]*>/g);
      if (data.rounds) {
        expect(userTurns, `rounds: ${data.rounds} but found ${userTurns} user-turns`)
          .toBe(data.rounds);
      }
    });

    it.skipIf(!isPublished)('published: body contains at least one citation link', () => {
      // Citations may be block-quote style (> "..." (link)) OR embedded
      // fragments inline ("..." (link)). Either is acceptable. We just
      // need SOME evidence-grounding visible to the reader.
      // Match the canonical citation pattern: [*Work*](url) — works for
      // both block-quote-style (> "..." (citation)) and embedded-fragment
      // style ("..." (citation)). The outer paren format varies (with or
      // without trailing — Author), so just match the markdown link itself.
      const citations = countMatches(content, /\[\*[^*\]]+\*\]\(https?:\/\/[^)]+\)/g);
      expect(citations, 'no citation links in published dialog body').toBeGreaterThan(0);
    });

    it.skipIf(!isPublished)('published: no doubled first-character glitch in replies', () => {
      // Stream-concat bug: occasionally the first character of a reply
      // gets duplicated (e.g. "YesYes,", "BahBah'u'lláh"). Detect by looking
      // for capitalized two-letter prefix repeats at the start of any
      // jafar-turn. False positives possible (e.g. "PaPa" if a quote starts
      // with that), so only flag on common openers.
      const replies = [...content.matchAll(/<div class="jafar-turn"[^>]*>\s*([\s\S]*?)<\/div>/g)]
        .map(m => m[1].trim());
      const issues = [];
      for (const r of replies) {
        // Match patterns: "YesYes", "BahBah", "ActuallyActually", "RightRight"
        // Trigger: word at start that looks like a duplicate-prefix
        const m = r.match(/^(Yes|No|Actually|Right|Yeah|Worth|Bah|For|This|The|Here)\1/);
        if (m) issues.push(m[0]);
      }
      expect(issues, `doubled-prefix glitch detected: ${issues.join(', ')}`).toEqual([]);
    });

    it.skipIf(!isPublished)('published: citation links well-formed', () => {
      // No unclosed [*Work*]( links
      const malformed = content.match(/\[\*[^*]*\*\]\([^)]*$/m);
      expect(malformed, `unclosed citation: ${malformed?.[0]?.slice(0, 100)}`).toBeNull();
    });

    it.skipIf(!isPublished)('published: heroImage is set OR omitted (not broken)', () => {
      const hero = data.heroImage;
      if (!hero) return; // absence is acceptable
      if (hero.startsWith('http')) {
        expect(hero.match(/^https?:\/\//), `malformed heroImage URL: ${hero}`).toBeTruthy();
        return;
      }
      const fsPath = join(PUBLIC_DIR, hero.replace(/^\//, ''));
      expect(existsSync(fsPath),
        `heroImage references ${hero} but file missing at ${fsPath}`).toBe(true);
    });

    it.skipIf(!isPublished)('published: tags is non-empty array', () => {
      expect(Array.isArray(data.tags), 'tags must be an array').toBe(true);
      expect(data.tags.length, 'tags array empty').toBeGreaterThan(0);
    });
  });
}

// ── Cross-dialog invariants ────────────────────────────────────────────

describe('dialogue archive — global invariants', () => {
  it('no duplicate slugs', () => {
    const slugs = dialogFiles.map(f => f.replace(/\.md$/, ''));
    expect(new Set(slugs).size, 'duplicate slug detected').toBe(slugs.length);
  });

  it('all citation links use the canonical document URL pattern', () => {
    const issues = [];
    for (const file of dialogFiles) {
      const { content } = loadDialog(file);
      const urls = [...content.matchAll(/\(https?:\/\/[^)]+\)/g)].map(m => m[0]);
      for (const u of urls) {
        if (u.includes('siftersearch.com/document') && !u.match(/document\/\d+/)) {
          issues.push(`${file}: ${u}`);
        }
      }
    }
    expect(issues.length, `malformed document URLs:\n${issues.join('\n')}`).toBe(0);
  });
});
