#!/usr/bin/env node
// DeepSeek trust calibration for entity extraction pipeline.
// --regenerate-fixture  Generate 100-item Q+A fixture from GPB paragraphs (one-time, ~$10-15).
// --run                 Score all 4 models against the fixture; write to model_calibration table.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { queryAll, query, queryOne } from '../api/lib/db.js';
import { chatCompletion } from '../api/lib/ai.js';
import { createEmbedding } from '../api/lib/ai.js';
import { logger } from '../api/lib/logger.js';
import { runMigrations } from '../api/lib/migrations/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, 'calibration/bahai-calibration-set.json');
const ROUTING_PATH = resolve(__dirname, '../config/model-routing.json');

const MODELS = [
  { id: 'deepseek-chat',           provider: 'deepseek' },
  { id: 'deepseek-reasoner',       provider: 'deepseek' },
  { id: 'claude-haiku-4-5-20251001', provider: 'anthropic' },
  { id: 'claude-sonnet-4-6',       provider: 'anthropic' },
];

// 5 categories for calibration
const CATEGORIES = ['person_identification', 'event_attribution', 'quotation_speaker', 'date_extraction', 'place_identification'];

async function generateFixture() {
  logger.info('Generating calibration fixture from GPB paragraphs...');
  mkdirSync(resolve(__dirname, 'calibration'), { recursive: true });

  const gpbId = await queryOne(`SELECT id FROM docs WHERE title = 'God Passes By' AND deleted_at IS NULL LIMIT 1`);
  if (!gpbId) throw new Error('God Passes By not found in docs table');

  // Sample 120 paragraphs with factual content (names, dates, places)
  const paragraphs = await queryAll(
    `SELECT id, text FROM content
     WHERE doc_id = ? AND deleted_at IS NULL AND length(text) > 100
       AND (text LIKE '%Bahá%' OR text LIKE '%Báb%' OR text LIKE '%ʿAbdu%' OR text LIKE '%Shoghi%')
     ORDER BY RANDOM() LIMIT 120`,
    [gpbId.id]
  );

  logger.info({ count: paragraphs.length }, 'Sampled paragraphs for calibration');

  const items = [];
  for (const para of paragraphs) {
    const category = CATEGORIES[items.length % CATEGORIES.length];
    try {
      const result = await chatCompletion([
        {
          role: 'system',
          content: `You are generating calibration questions for entity extraction testing. Given a paragraph from God Passes By by Shoghi Effendi, generate ONE factual question in the category "${category}" that can be answered definitively from the paragraph text. Return JSON only: {"question": "...", "answer_keywords": ["keyword1","keyword2"], "difficulty": "easy|medium|hard"}`
        },
        { role: 'user', content: para.text }
      ], {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        temperature: 0.3,
        maxTokens: 300,
      });

      let parsed;
      try { parsed = JSON.parse(result.content); } catch { continue; }
      if (!parsed.question || !parsed.answer_keywords?.length) continue;

      items.push({
        id: `gpb-${items.length + 1}`,
        category,
        question: parsed.question,
        expected_answer_keywords: parsed.answer_keywords,
        reference_paragraph_ids: [para.id],
        difficulty: parsed.difficulty ?? 'medium',
        reference_text: para.text,
      });

      if (items.length >= 100) break;
    } catch (err) {
      logger.warn({ err: err.message }, 'Skipping paragraph — generation failed');
    }
  }

  writeFileSync(FIXTURE_PATH, JSON.stringify(items, null, 2));
  logger.info({ count: items.length, path: FIXTURE_PATH }, 'Fixture written');
}

async function scoreModel(model, items) {
  const scores = {};
  for (const cat of CATEGORIES) scores[cat] = { correct: 0, total: 0 };

  await Promise.all(items.map(async (item) => {
    try {
      const result = await chatCompletion([
        {
          role: 'system',
          content: 'You are answering factual questions about Bahá\'í history. Answer concisely in 1-2 sentences based solely on the provided text.'
        },
        {
          role: 'user',
          content: `Text: ${item.reference_text}\n\nQuestion: ${item.question}`
        }
      ], {
        provider: model.provider,
        model: model.id,
        temperature: 0,
        maxTokens: 200,
      });

      // Score: embed answer + expected keywords, check semantic similarity
      const answerEmb = await createEmbedding(result.content, { caller: 'calibration' });
      const keywordEmb = await createEmbedding(item.expected_answer_keywords.join(' '), { caller: 'calibration' });

      const dotProduct = answerEmb.embedding.reduce((sum, v, i) => sum + v * keywordEmb.embedding[i], 0);
      const correct = dotProduct >= 0.75;

      scores[item.category].total++;
      if (correct) scores[item.category].correct++;
    } catch (err) {
      logger.warn({ model: model.id, item: item.id, err: err.message }, 'Scoring failed');
      scores[item.category].total++;
    }
  }));

  return scores;
}

function computeRouting(calibrationResults) {
  const routing = {};
  for (const cat of CATEGORIES) {
    // Find deepseek-chat accuracy for this category
    const flashScores = calibrationResults['deepseek-chat']?.[cat];
    const flashAccuracy = flashScores ? flashScores.correct / flashScores.total : 0;

    if (flashAccuracy >= 0.85) {
      routing[cat] = { extractor: 'deepseek-chat', validate_fraction: 0.05, note: 'trusted' };
    } else if (flashAccuracy >= 0.70) {
      routing[cat] = { extractor: 'deepseek-chat', validate_fraction: 1.0, note: 'untrusted' };
    } else {
      routing[cat] = { extractor: 'claude-sonnet-4-6', validate_fraction: 0.1, note: 'below_threshold' };
    }
  }
  return routing;
}

async function runCalibration() {
  if (!existsSync(FIXTURE_PATH)) {
    throw new Error(`Fixture not found at ${FIXTURE_PATH}. Run with --regenerate-fixture first.`);
  }
  const items = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  logger.info({ count: items.length }, 'Loaded calibration fixture');

  const calibrationResults = {};

  for (const model of MODELS) {
    logger.info({ model: model.id }, 'Scoring model...');
    const scores = await scoreModel(model, items);
    calibrationResults[model.id] = scores;

    for (const cat of CATEGORIES) {
      const { correct, total } = scores[cat];
      const accuracy = total > 0 ? correct / total : 0;
      await query(
        `INSERT INTO model_calibration (model, category, accuracy, sample_size) VALUES (?,?,?,?)
         ON CONFLICT(model, category) DO UPDATE SET accuracy=excluded.accuracy, sample_size=excluded.sample_size, run_at=unixepoch()`,
        [model.id, cat, accuracy, total]
      );
      logger.info({ model: model.id, category: cat, accuracy: accuracy.toFixed(3), total }, 'Category scored');
    }
  }

  // Write routing config
  const routing = computeRouting(calibrationResults);
  mkdirSync(resolve(__dirname, '../config'), { recursive: true });
  writeFileSync(ROUTING_PATH, JSON.stringify({ routing, generated_at: new Date().toISOString() }, null, 2));
  logger.info({ path: ROUTING_PATH }, 'Model routing config written');

  // Print summary
  console.log('\n=== Calibration Summary ===');
  for (const [modelId, scores] of Object.entries(calibrationResults)) {
    console.log(`\n${modelId}:`);
    for (const cat of CATEGORIES) {
      const { correct, total } = scores[cat];
      console.log(`  ${cat}: ${(correct/total*100).toFixed(1)}% (${correct}/${total})`);
    }
  }
  console.log('\nRouting rules written to', ROUTING_PATH);
}

// Main
const args = process.argv.slice(2);
await runMigrations();

if (args.includes('--regenerate-fixture')) {
  await generateFixture();
} else if (args.includes('--run')) {
  await runCalibration();
} else {
  console.log('Usage:');
  console.log('  node scripts/calibrate-deepseek.js --regenerate-fixture  # one-time fixture generation');
  console.log('  node scripts/calibrate-deepseek.js --run                 # score all models');
  process.exit(1);
}
