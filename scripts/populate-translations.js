#!/usr/bin/env node

/**
 * Populate Translations
 *
 * Translates non-English documents to English and stores in content.translation
 * Uses two translation styles:
 *   - Scriptural: Neo-biblical style (Shoghi Effendi) for sacred texts
 *   - Non-scriptural: Modern readable style, with scriptural quotes preserved
 *
 * Usage:
 *   node scripts/populate-translations.js [options]
 *
 * Options:
 *   --dry-run       Show what would be translated without making changes
 *   --limit=N       Limit to N documents (default: all)
 *   --document=ID   Translate a specific document
 *   --force         Re-translate even if translation exists
 *   --style=TYPE    Force style: 'scriptural' or 'modern' (overrides auto-detect)
 *   --language=XX   Only translate documents in this language (ar, fa, etc.)
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

import { query, queryOne, queryAll } from '../api/lib/db.js';
import { getMeili, INDEXES } from '../api/lib/search.js';
import { aiService } from '../api/lib/ai-services.js';
import { logger } from '../api/lib/logger.js';

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const limitArg = args.find(a => a.startsWith('--limit='));
const docArg = args.find(a => a.startsWith('--document='));
const styleArg = args.find(a => a.startsWith('--style='));
const langArg = args.find(a => a.startsWith('--language='));

const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
const specificDocId = docArg ? docArg.split('=')[1] : null;
const forceStyle = styleArg ? styleArg.split('=')[1] : null;
const filterLanguage = langArg ? langArg.split('=')[1] : null;

// Supported source languages for translation
const SOURCE_LANGUAGES = {
  ar: 'Arabic',
  fa: 'Persian (Farsi)',
  he: 'Hebrew',
  ur: 'Urdu'
};

/**
 * Collections that should use scriptural (neo-biblical) translation style
 * Based on doctrinal authority - texts from Central Figures and core scriptures
 */
const SCRIPTURAL_COLLECTIONS = {
  // Bahá'í
  'Core Tablets': true,
  'Core Tablet Translations': true,
  'Core Talks': true,
  'Compilations': true,  // Often quotes from Central Figures
  'Core Publications': true,
  'Pilgrim Notes': true,  // Records of the Central Figures' words

  // Islam
  'Quran': true,
  'Hadith': true,

  // Christianity
  'Bible': true,
  'Gospels': true,
  'New Testament': true,
  'Old Testament': true,

  // Judaism
  'Torah': true,
  'Tanakh': true,
  'Talmud': true,

  // Buddhism
  'Sutras': true,
  'Pali Canon': true,

  // Hinduism
  'Vedas': true,
  'Upanishads': true,
  'Bhagavad Gita': true
};

/**
 * Authors whose works should always use scriptural style
 */
const SCRIPTURAL_AUTHORS = [
  'Bahá\'u\'lláh',
  'The Báb',
  '\'Abdu\'l-Bahá',
  'Shoghi Effendi',
  'The Universal House of Justice'
];

/**
 * Determine if a document should use scriptural translation style
 */
function isScriptural(document) {
  // Check collection
  if (SCRIPTURAL_COLLECTIONS[document.collection]) {
    return true;
  }

  // Check author
  if (document.author && SCRIPTURAL_AUTHORS.some(a =>
    document.author.includes(a) || a.includes(document.author)
  )) {
    return true;
  }

  // Check authority level (8+ is typically scriptural)
  if (document.authority >= 8) {
    return true;
  }

  return false;
}

/**
 * Build scriptural translation prompt (neo-biblical Shoghi Effendi style)
 */
function buildScripturalPrompt(sourceLang) {
  const sourceName = SOURCE_LANGUAGES[sourceLang] || sourceLang;

  return `You are an expert translator specializing in sacred religious texts. Translate the following ${sourceName} text to English using the neo-biblical style established by Shoghi Effendi in his translations of Bahá'í scripture.

## Translation Style: Neo-Biblical (Shoghi Effendi)

### Vocabulary
- Use archaic pronouns for the Divine and sacred contexts: Thou, Thee, Thine, Thy, ye
- Employ elevated verb forms: perceiveth, confesseth, hath, art, doth, sayeth, willeth
- Use formal religious vocabulary: sovereignty, dominion, majesty, sanctity, effulgence
- Prefer Latinate and formal English: "vouchsafe" not "grant", "beseech" not "ask"

### Syntax
- Use inverted word order for emphasis: "Great is the blessedness..."
- Craft flowing sentences with parallel clauses connected by "and" and "that"
- Maintain complex sentence structures that mirror the original's cadence
- Use subjunctive mood where appropriate: "that he may...", "would that..."

### Rhetorical Style
- Preserve parallelism: "The winds of tests... the tempests of trials..."
- Maintain metaphors exactly: "lamp of Thy love", "ocean of Thy nearness"
- Preserve repetition of divine attributes for emphasis
- Keep exclamatory phrases: "O Lord!", "O my God!"

### Punctuation
- Use semicolons and colons liberally for flowing prose
- Employ dashes for parenthetical additions
- Capitalize Divine pronouns and attributes: "His Holiness", "the Almighty"

### Example Translations (Arabic → English)
- "سُبْحانَكَ يا إِلهي" → "Glorified art Thou, O Lord my God!"
- "أَسْئَلُكَ" → "I beseech Thee" / "I entreat Thee"
- "بِاسْمِكَ" → "by Thy Name" / "in Thy Name"
- "يا مَنْ" → "O Thou Who..." / "O He Who..."

Translate faithfully, preserving the sacred tone. Provide only the translation, no explanations.`;
}

/**
 * Build modern translation prompt (readable but with contextual scripture detection)
 *
 * This prompt instructs the AI to:
 * 1. Use modern English for general prose
 * 2. DETECT and identify scriptural quotations within the text
 * 3. Translate those quotations in neo-biblical/Shoghi Effendi style
 * 4. Seamlessly blend both styles in the output
 */
function buildModernPrompt(sourceLang) {
  const sourceName = SOURCE_LANGUAGES[sourceLang] || sourceLang;

  return `You are an expert translator specializing in religious and scholarly texts. Translate the following ${sourceName} text to English using a HYBRID approach that detects and respects scriptural content.

## CRITICAL: Contextual Scripture Detection

Your PRIMARY task is to identify scriptural content within the text and translate it appropriately:

### What Counts as Scripture (translate in neo-biblical style):
- Direct quotations from sacred texts (Qur'an, Bible, Torah, Bhagavad Gita, Bahá'í Writings, Hadith, etc.)
- Prayers, invocations, and devotional passages
- Text attributed to divine figures, prophets, or manifestations
- Phrases introduced by: "He hath revealed...", "It is written...", "The Blessed Beauty saith...", "God saith...", etc.
- Arabic/Persian terms like: قال الله (God said), قال رسول الله (The Messenger said), نزل في الكتاب (revealed in the Book)

### Non-Scripture (translate in modern style):
- Commentary, analysis, or explanation
- Historical narrative
- Author's own thoughts and opinions
- Biographical information
- General prose

## Translation Styles

### For Scriptural Content - Neo-Biblical Style:
- Archaic pronouns for the Divine: Thou, Thee, Thine, Thy, ye
- Elevated verbs: perceiveth, confesseth, hath, art, doth, sayeth
- Formal vocabulary: "vouchsafe" not "grant", "beseech" not "ask"
- Inverted word order for emphasis: "Great is the blessedness..."
- Preserve exclamations: "O Lord!", "O my God!"
- Capitalize Divine references: "His Holiness", "the Almighty"

### For Non-Scriptural Content - Modern Academic Style:
- Clear, accessible contemporary English
- Natural sentence structures
- Scholarly but readable tone
- No archaic language

## Examples of Hybrid Translation:

**Arabic source discussing a Hadith:**
"يقول المؤرخون إن النبي قال: 'من عرف نفسه فقد عرف ربه'"

**Correct translation:**
"Historians relate that the Prophet said: 'He who knoweth himself hath known his Lord.'"
(Note: "Historians relate" is modern; the quotation uses neo-biblical style)

**Persian source with Bahá'í scripture:**
"بهاءالله در کتاب اقدس فرموده: 'قد كتب عليكم الصلوة والصوم' و این حکم برای همه واجب است."

**Correct translation:**
"Bahá'u'lláh hath revealed in the Kitáb-i-Aqdas: 'Fasting and obligatory prayer are binding upon you.' This ordinance is obligatory for all."
(Note: The quotation uses scriptural style; the explanatory sentence uses modern style)

## Important Guidelines:
- Seamlessly blend both styles in your translation
- The transition should feel natural to the reader
- When in doubt about whether content is scriptural, err on the side of reverence
- Preserve the original's paragraph structure
- Use quotation marks consistently for cited material

Provide only the translation, no explanations or meta-commentary.`;
}

/**
 * Translate a single paragraph
 */
async function translateParagraph(text, sourceLang, style) {
  const systemPrompt = style === 'scriptural'
    ? buildScripturalPrompt(sourceLang)
    : buildModernPrompt(sourceLang);

  try {
    const response = await aiService('quality').chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ], {
      temperature: 0.3,
      maxTokens: Math.max(1000, text.length * 4) // Allow for expansion
    });

    return response.content.trim();
  } catch (err) {
    logger.error({ err: err.message, textLength: text.length }, 'Translation failed');
    throw err;
  }
}

/**
 * Get documents needing translation
 */
async function getDocumentsToTranslate() {
  const meili = getMeili();

  // Build filter for non-English documents
  const languages = Object.keys(SOURCE_LANGUAGES);
  const langFilter = languages.map(l => `language = "${l}"`).join(' OR ');

  let filter = `(${langFilter})`;
  if (filterLanguage) {
    filter = `language = "${filterLanguage}"`;
  }
  if (specificDocId) {
    filter = `id = "${specificDocId}"`;
  }

  const result = await meili.index(INDEXES.DOCUMENTS).search('', {
    limit: limit || 10000,
    filter,
    attributesToRetrieve: ['id', 'title', 'author', 'religion', 'collection', 'language', 'authority', 'paragraph_count']
  });

  return result.hits;
}

/**
 * Get paragraphs needing translation for a document
 */
async function getParagraphsToTranslate(documentId) {
  const whereClause = force
    ? 'WHERE doc_id = ?'
    : 'WHERE doc_id = ? AND (translation IS NULL OR translation = \'\')';

  return queryAll(`
    SELECT id, paragraph_index, text, translation
    FROM content
    ${whereClause}
    ORDER BY paragraph_index
  `, [documentId]);
}

/**
 * Update paragraph with translation
 */
async function saveTranslation(paragraphId, translation) {
  if (dryRun) return;

  await query(
    'UPDATE content SET translation = ? WHERE id = ?',
    [translation, paragraphId]
  );
}

/**
 * Main translation process
 */
async function populateTranslations() {
  console.log('📚 Populating English Translations');
  console.log('===================================');

  if (dryRun) {
    console.log('🔍 DRY RUN - No changes will be made\n');
  }

  if (forceStyle) {
    console.log(`📝 Forced style: ${forceStyle}\n`);
  }

  // Check if content table exists
  try {
    await queryAll('SELECT 1 FROM content LIMIT 1');
  } catch (err) {
    if (err.message?.includes('no such table')) {
      console.log('⚠️  content table not found - run migrations first');
      console.log('   This script needs to run against a migrated database.');
      return;
    }
    throw err;
  }

  // Get documents to translate
  console.log('Finding documents to translate...');
  const documents = await getDocumentsToTranslate();

  if (documents.length === 0) {
    console.log('No documents found matching criteria.');
    return;
  }

  console.log(`Found ${documents.length} documents\n`);

  // Statistics
  let totalParagraphs = 0;
  let translatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const startTime = Date.now();

  // Process each document
  for (let docIndex = 0; docIndex < documents.length; docIndex++) {
    const doc = documents[docIndex];
    const style = forceStyle || (isScriptural(doc) ? 'scriptural' : 'modern');
    const styleBadge = style === 'scriptural' ? '📜' : '📖';

    console.log(`\n[${docIndex + 1}/${documents.length}] ${styleBadge} ${doc.title}`);
    console.log(`   Author: ${doc.author || 'Unknown'} | Collection: ${doc.collection} | Lang: ${doc.language}`);
    console.log(`   Style: ${style} | Authority: ${doc.authority || 'N/A'}`);

    // Get paragraphs for this document
    const paragraphs = await getParagraphsToTranslate(doc.id);

    if (paragraphs.length === 0) {
      console.log('   ⏭️  No paragraphs need translation');
      continue;
    }

    console.log(`   📝 ${paragraphs.length} paragraphs to translate`);
    totalParagraphs += paragraphs.length;

    // Translate each paragraph
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i];

      // Skip if already has translation and not forcing
      if (para.translation && !force) {
        skippedCount++;
        continue;
      }

      // Skip empty text
      if (!para.text || para.text.trim().length === 0) {
        skippedCount++;
        continue;
      }

      // Progress indicator
      if (i % 10 === 0 || i === paragraphs.length - 1) {
        process.stdout.write(`\r   Progress: ${i + 1}/${paragraphs.length} paragraphs`);
      }

      if (dryRun) {
        translatedCount++;
        continue;
      }

      try {
        const translation = await translateParagraph(para.text, doc.language, style);
        await saveTranslation(para.id, translation);
        translatedCount++;

        // Rate limiting - avoid hitting API limits
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (err) {
        errorCount++;
        console.log(`\n   ❌ Error on paragraph ${para.paragraph_index}: ${err.message}`);
      }
    }

    console.log(''); // New line after progress
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log('\n===================================');
  console.log('📊 Translation Summary');
  console.log('===================================');
  console.log(`Documents processed: ${documents.length}`);
  console.log(`Total paragraphs: ${totalParagraphs}`);
  console.log(`Translated: ${translatedCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Time: ${elapsed} minutes`);

  if (dryRun) {
    console.log('\n📝 This was a dry run. Run without --dry-run to apply changes.');
  }
}

// Run
populateTranslations().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
