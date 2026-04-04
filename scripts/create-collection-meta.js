#!/usr/bin/env node
/**
 * Create .collection-meta.yaml files for all collection folders
 *
 * Sets authority based on canonical hierarchy:
 *   10 = Scripture / foundational revelation
 *    9 = Authorized translations / core talks of central figures
 *    8 = Compilations from central figures / canonical collections
 *    7 = Pilgrim notes / first-hand accounts
 *    6 = Major classical commentary / church fathers / jurisprudence
 *    5 = General books / secondary texts
 *    4 = Administrative / talks by non-central figures
 *    3 = Essays / academic papers
 *    2 = News / press / reference
 *
 * Uses Haiku to generate 1-2 sentence descriptions.
 *
 * Usage:
 *   node scripts/create-collection-meta.js           # Dry run
 *   node scripts/create-collection-meta.js --execute  # Write files + update DB
 */

import '../api/lib/config.js';
import { query, queryAll, queryOne } from '../api/lib/db.js';
import Anthropic from '@anthropic-ai/sdk';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const EXECUTE = process.argv.includes('--execute');
const LIBRARY_BASE = join(process.env.HOME, 'Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library');

const anthropic = new Anthropic();

// ─── Authority assignments by religion and collection ─────────────────────────
// Doctrine/scripture at top, commentary middle, academic/news at bottom

const AUTHORITY_MAP = {
  "Baha'i": {
    "Core Tablets": 10,
    "Tablet Translations": 9,
    "Core Talks": 9,
    "Core Publications": 8,
    "Compilations": 8,
    "Pilgrim Notes": 7,
    "Baha'i Books": 5,
    "Shaykhi and Babi Studies": 5,
    "Study Guides": 5,
    "Baha'i Talks": 4,
    "Administrative": 4,
    "Reference": 4,
    "Papers": 3,
    "News": 2,
  },
  'Buddhist': {
    'Pali Canon': 10,
    'Mahayana Sutras': 10,
    'Zen and Chan': 8,
    'Practice and Meditation': 6,
    'History and Biography': 5,
    'Studies Papers': 3,
  },
  'Christian': {
    'Bible and Translations': 10,
    'Apocrypha and Early Texts': 8,
    'Church Fathers': 7,
    'Eastern Orthodox': 7,
    'Medieval Theology': 6,
    'Mysticism and Devotion': 6,
    'Reformation': 6,
    'Swedenborg and Visionary Theology': 5,
    'Sermons and Preaching': 5,
    'Modern Theology': 4,
  },
  'Confucian': {
    'Five Classics': 10,
    'Four Books': 10,
    'Classical Commentary': 8,
    'Han-Tang Confucianism': 6,
    'Neo-Confucianism': 6,
    'Ethics and Governance': 5,
  },
  'Hindu': {
    'Vedas and Upanishads': 10,
    'Epics': 9,
    'Puranas': 8,
    'Philosophy': 7,
    'Dharmashastra': 7,
    'Bhakti and Devotional': 6,
    'Sanskrit Drama and Poetry': 5,
    'Tagore': 5,
    'Indian Tales and Literature': 5,
    'Modern': 4,
  },
  'Islam': {
    'Foundational Texts': 10,
    'Traditions': 9,
    "Shi'ah Imams": 9,
    'Ali ibn Abi Talib': 9,
    'Doctrine and Theology': 7,
    'Jurisprudence': 7,
    'Mysticism': 6,
    'Philosophy': 6,
    'History and Biography': 5,
    'Miscellaneous': 3,
  },
  'Jain': {
    'Agamas': 10,
    'Philosophy': 7,
    'Ethics and Practice': 6,
    'Narrative and Biography': 5,
  },
  'Judaism': {
    'Torah and Tanakh': 10,
    'Talmud and Mishnah': 9,
    'Midrash': 8,
    'Halakhah and Legal Codes': 8,
    'Biblical Commentary': 7,
    'Kabbalah and Mysticism': 7,
    'Second Temple Literature': 7,
    'Hasidism and Musar': 6,
    'Jewish Philosophy and Theology': 6,
    'Liturgy and Poetry': 5,
  },
  'Sikh': {
    'Guru Granth Sahib': 10,
    'Sacred Poetry': 9,
    'Related Mystical Traditions': 6,
    'Sikh Philosophy': 6,
    'Sikh History': 5,
    'The Sikh Religion (Macauliffe)': 5,
    'Encyclopedic References': 3,
  },
  'Tao': {
    'Foundational Classics': 10,
    'Daozang Scriptures Shangqing and Lingbao': 8,
    'Classical Commentaries and Philosophy': 7,
    'Huang-Lao and Syncretic Texts': 7,
    'Internal Alchemy (Neidan)': 6,
    'Alchemy and Self-Cultivation': 6,
    'External Alchemy Medicine and Longevity': 5,
    'Quanzhen and Later Taoist Schools': 5,
    'Taoist Ethics and Morality': 5,
    'Hagiography History and Ethics': 5,
  },
  'Zoroastrian': {
    'Avesta - Yasna and Gathas': 10,
    'Avesta - Yashts': 9,
    'Avesta - Khordeh Avesta': 9,
    'Avesta - Visperad and Vendidad': 8,
    'Avesta - Visperad and Yashts': 8,
    'Avesta - Vendidad': 8,
    'Pahlavi Literature': 7,
    'History and Scholarship': 5,
  },
};

// ─── Haiku for descriptions ────────────────────────────────────────────────

const DESC_SYSTEM = `You write short descriptions for collection categories in a religious text library. Output ONLY the description.

Rules:
- 1-2 sentences, max 180 characters
- Describe what kinds of texts are in this collection
- Mention the tradition/religion and the nature of the texts
- Be specific: "Pali Canon scriptures including suttas, vinaya, and abhidhamma" not "Buddhist texts"
- No filler words, no "This collection contains..."`;

async function generateDescription(religion, collection) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: [{ type: 'text', text: DESC_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Religion: ${religion}\nCollection: ${collection}\n\nDescription:` }]
    });
    return response.content[0]?.text?.trim().replace(/^["']|["']$/g, '') || null;
  } catch (err) {
    console.error(`  Failed to generate description: ${err.message}`);
    return null;
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(EXECUTE ? '*** EXECUTE MODE ***\n' : '*** DRY RUN ***\n');

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const [religion, collections] of Object.entries(AUTHORITY_MAP)) {
    console.log(`\n=== ${religion} ===`);

    for (const [collection, authority] of Object.entries(collections)) {
      const folderPath = join(LIBRARY_BASE, religion, collection);

      if (!existsSync(folderPath)) {
        console.log(`  SKIP (no folder): ${collection}`);
        skipped++;
        continue;
      }

      const metaDir = join(folderPath, '.collection');
      const metaPath = join(metaDir, 'meta.yaml');
      const exists = existsSync(metaPath);

      // Generate description
      const description = await generateDescription(religion, collection);

      const yaml = [
        `authority: ${authority}`,
        description ? `description: "${description.replace(/"/g, '\\"')}"` : null,
      ].filter(Boolean).join('\n') + '\n';

      console.log(`  [${authority}] ${collection}${exists ? ' (update)' : ' (new)'}`);
      if (description) console.log(`       ${description.slice(0, 80)}`);

      if (EXECUTE) {
        await mkdir(metaDir, { recursive: true });
        await writeFile(metaPath, yaml, 'utf-8');

        // Also update library_nodes in DB
        const religionNode = await queryOne(
          `SELECT id FROM library_nodes WHERE name = ? AND node_type = 'religion'`,
          [religion]
        );
        if (religionNode) {
          const existing = await queryOne(
            `SELECT id FROM library_nodes WHERE name = ? AND parent_id = ?`,
            [collection, religionNode.id]
          );
          if (existing) {
            await query(
              `UPDATE library_nodes SET authority_default = ?, description = ? WHERE id = ?`,
              [authority, description, existing.id]
            );
            updated++;
          }
        }

        created++;
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`${EXECUTE ? 'Created' : 'Would create'}: ${created} .collection-meta.yaml files`);
  console.log(`${EXECUTE ? 'Updated' : 'Would update'}: ${updated} library_nodes`);
  console.log(`Skipped (no folder): ${skipped}`);

  if (!EXECUTE) console.log('\nUse --execute to write files and update DB.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
