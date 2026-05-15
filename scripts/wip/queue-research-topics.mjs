// Queue deep research for high-priority topics that consistently lack cached coverage.
// Run on tower-nas: node scripts/wip/queue-research-topics.mjs [--dry-run]
//
// Source: derived from Jafar quality test failures + common question categories.
// These questions represent canonical patterns where pre-cached research would
// help Jafar produce citation-rich answers without falling back to general knowledge.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const isDryRun = process.argv.includes('--dry-run');

// Canonical questions that consistently fail or lack adequate deep research.
// Organized by topic cluster so related questions share research artifacts.
const PRIORITY_TOPICS = [
  // Islamic canonical topics
  { question: 'What are the Five Pillars of Islam?', priority: 10 },
  { question: 'What does the Quran say about mercy and compassion?', priority: 8 },
  { question: 'What does the Quran say about justice?', priority: 8 },
  { question: 'What do the Bahá\'í Faith and Islam say about fasting?', priority: 7 },

  // Jewish canonical topics
  { question: 'What does the Torah say about justice?', priority: 10 },
  { question: 'What does the Torah say about covenant?', priority: 9 },
  { question: 'What does the Torah say about mercy?', priority: 7 },

  // Hindu canonical topics
  { question: 'What is the Hindu concept of dharma?', priority: 10 },
  { question: 'What do the Upanishads say about the nature of the self?', priority: 8 },
  { question: 'What Hindu scriptures discuss liberation (moksha)?', priority: 7 },

  // Zoroastrian
  { question: 'What are the Zoroastrian teachings on good and evil?', priority: 9 },
  { question: 'What does the Avesta say about fire and purity?', priority: 7 },

  // Buddhist
  { question: 'What Buddhist texts discuss mindfulness?', priority: 9 },
  { question: 'What does the Dhammapada say about suffering?', priority: 8 },
  { question: 'What are the Four Noble Truths in Buddhist scripture?', priority: 9 },

  // Cross-tradition comparative
  { question: 'Search for passages about the covenant in both the Bahá\'í Faith and Judaism', priority: 9 },
  { question: 'What do different religions say about the return of a messiah or promised figure?', priority: 8 },
  { question: 'Find passages about environmental stewardship across religions', priority: 7 },
  { question: 'What do different religions say about fasting?', priority: 7 },
  { question: 'What do different traditions say about the purpose of suffering?', priority: 8 },

  // Philosophical / universal
  { question: 'Why does God allow suffering? What do the scriptures say?', priority: 8 },
  { question: 'What does scripture say about the nature of the soul?', priority: 7 },
  { question: 'What do religious texts say about prayer and meditation?', priority: 7 },
];

async function main() {
  // Connect to production DB
  let db;
  try {
    const { default: Database } = await import('better-sqlite3');
    const dbPath = process.env.DB_PATH || `${process.env.HOME}/sifter/siftersearch/data/sifter.db`;
    db = new Database(dbPath, { readonly: false });
    db.pragma('journal_mode = WAL');
  } catch (err) {
    console.error('Failed to connect to DB:', err.message);
    console.error('Run this on tower-nas with: node scripts/wip/queue-research-topics.mjs');
    process.exit(1);
  }

  const crypto = require('crypto');
  function questionHash(q) {
    return crypto.createHash('sha256').update(q.trim().toLowerCase()).digest('hex').slice(0, 32);
  }

  const now = new Date().toISOString();
  let queued = 0;
  let skipped = 0;
  let alreadyComplete = 0;

  for (const topic of PRIORITY_TOPICS) {
    const hash = questionHash(topic.question);
    const existing = db.prepare('SELECT id, status, ask_count FROM deep_research WHERE question_hash = ?').get(hash);

    if (existing) {
      if (existing.status === 'complete') {
        // Check quote count
        const quoteCount = db.prepare('SELECT COUNT(*) as n FROM deep_research_quotes WHERE research_id = ?').get(existing.id)?.n || 0;
        if (quoteCount >= 3) {
          console.log(`✓ COMPLETE (${quoteCount} quotes): ${topic.question}`);
          alreadyComplete++;
          continue;
        }
        console.log(`⚠ COMPLETE but sparse (${quoteCount} quotes) — re-queueing: ${topic.question}`);
        if (!isDryRun) {
          db.prepare('UPDATE deep_research SET status = ?, ask_count = ask_count + ? WHERE id = ?')
            .run('queued', topic.priority, existing.id);
          db.prepare('INSERT OR IGNORE INTO deep_research_queue (research_id, job_type, status, priority) VALUES (?, ?, ?, ?)')
            .run(existing.id, 'research', 'pending', topic.priority + existing.ask_count);
        }
        queued++;
        continue;
      }
      if (existing.status === 'queued' || existing.status === 'in_progress') {
        console.log(`→ ALREADY QUEUED: ${topic.question}`);
        skipped++;
        continue;
      }
      // pending or failed — queue it
      console.log(`+ QUEUEING (was ${existing.status}): ${topic.question}`);
      if (!isDryRun) {
        db.prepare('UPDATE deep_research SET status = ?, ask_count = ask_count + ? WHERE id = ?')
          .run('queued', topic.priority, existing.id);
        db.prepare('INSERT OR IGNORE INTO deep_research_queue (research_id, job_type, status, priority) VALUES (?, ?, ?, ?)')
          .run(existing.id, 'research', 'pending', topic.priority + existing.ask_count);
      }
      queued++;
    } else {
      console.log(`+ NEW: ${topic.question}`);
      if (!isDryRun) {
        const res = db.prepare(
          `INSERT INTO deep_research (canonical_question, question_hash, status, ask_count, priority, created_at, updated_at)
           VALUES (?, ?, 'queued', ?, ?, ?, ?)`
        ).run(topic.question, hash, topic.priority, topic.priority, now, now);
        db.prepare('INSERT INTO deep_research_queue (research_id, job_type, status, priority) VALUES (?, ?, ?, ?)')
          .run(res.lastInsertRowid, 'research', 'pending', topic.priority);
      }
      queued++;
    }
  }

  console.log(`\nSummary: ${queued} queued, ${skipped} already queued, ${alreadyComplete} complete with good quotes`);
  if (isDryRun) console.log('(dry run — no changes made)');
  db?.close();
}

main().catch(err => { console.error(err); process.exit(1); });
