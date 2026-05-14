// Enqueue new deep research questions via the admin API.
// Run locally — questions get queued and processed by siftersearch-deep-research worker.
// Usage: node scripts/wip/enqueue-research.mjs [--dry-run]
import { readFileSync } from 'fs';

const API_BASE = 'https://api.siftersearch.com/api/v1';
const KEY = readFileSync('/Users/chad/Dropbox/Public/JS/Projects/siftersearch.com/.env-secrets', 'utf8')
  .split('\n').find(l => l.startsWith('DEPLOY_SECRET='))?.split('=')[1]?.trim();

const DRY_RUN = process.argv.includes('--dry-run');

// Questions to enqueue — carefully chosen to cover major interfaith topics
// not yet addressed, with clear primary-source answers across traditions.
const NEW_QUESTIONS = [
  // Prayer / worship
  { q: 'What is the relationship between prayer and spiritual transformation?', tags: ['prayer', 'mysticism'] },
  { q: 'What is the purpose and nature of fasting across religious traditions?', tags: ['prayer', 'law-practice'] },
  { q: 'How do different religions understand worship and the act of praise?', tags: ['prayer', 'community'] },

  // Theodicy / suffering
  { q: 'How do religions explain the existence of evil and innocent suffering?', tags: ['theodicy', 'ethics'] },
  { q: 'What is the spiritual significance of trials and tests in the path to God?', tags: ['theodicy', 'soul-spirit'] },

  // Afterlife / eschatology
  { q: 'What is the nature of heaven and hell in the world\'s religions?', tags: ['afterlife', 'eschatology'] },
  { q: 'What happens to the soul in the intermediate state between death and judgment?', tags: ['afterlife', 'soul-spirit'] },
  { q: 'What are the signs of the end times and the coming of a new age?', tags: ['eschatology', 'progressive-revelation'] },

  // Ethics / justice
  { q: 'What is the nature and purpose of justice in religion and society?', tags: ['justice', 'ethics'] },
  { q: 'How should one treat enemies and those who have wronged you?', tags: ['ethics', 'mercy-compassion'] },
  { q: 'What is the relationship between wealth, poverty, and spiritual life?', tags: ['ethics', 'justice'] },
  { q: 'What is the spiritual foundation of honesty and truthfulness?', tags: ['ethics', 'scripture-study'] },

  // Soul & spirituality
  { q: 'What is the nature of spiritual growth and the stages of the spiritual path?', tags: ['soul-spirit', 'mysticism'] },
  { q: 'What is the relationship between the body and the soul?', tags: ['soul-spirit', 'science-reason'] },
  { q: 'What is the nature of free will and divine predestination?', tags: ['free-will', 'theodicy'] },

  // God & revelation
  { q: 'How do the world\'s religions understand the attributes and names of God?', tags: ['revelation', 'theology'] },
  { q: 'What is the nature of religious authority and who can interpret scripture?', tags: ['authority', 'scripture-study'] },
  { q: 'How do religions understand the concept of the Promised One or Messiah?', tags: ['progressive-revelation', 'eschatology'] },
  { q: 'What is the nature of religious law and its relationship to spiritual life?', tags: ['law-practice', 'ethics'] },

  // Community & social
  { q: 'What is the spiritual basis of service to humanity?', tags: ['community', 'ethics'] },
  { q: 'What do religions teach about the role of women in spiritual life?', tags: ['equality', 'community'] },
  { q: 'What is the relationship between religion and science?', tags: ['science-reason', 'revelation'] },
  { q: 'What is the spiritual meaning of sacrifice and self-denial?', tags: ['sin-redemption', 'prayer'] },

  // Nature / creation
  { q: 'What is the relationship between humanity and the natural world?', tags: ['creation', 'ethics'] },
  { q: 'What do religions teach about the creation of the universe?', tags: ['creation', 'science-reason'] },

  // Love / mercy
  { q: 'What is the nature of divine love and how should we love God?', tags: ['love', 'mysticism'] },
  { q: 'What is mercy and compassion in religious life?', tags: ['mercy-compassion', 'ethics'] },
  { q: 'How do religions understand the purpose of marriage and family life?', tags: ['community', 'law-practice'] },

  // Inner life
  { q: 'What is the relationship between detachment and spiritual progress?', tags: ['mysticism', 'soul-spirit'] },
  { q: 'What role does gratitude play in spiritual life?', tags: ['ethics', 'prayer'] },
  { q: 'How do religions understand spiritual tests and the dark night of the soul?', tags: ['mysticism', 'theodicy'] },
];

async function enqueue(question, tags) {
  const res = await fetch(`${API_BASE}/admin/deep-research`, {
    method: 'POST',
    headers: {
      'x-internal-key': KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question, topic_tags: tags }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

console.log(`Enqueuing ${NEW_QUESTIONS.length} new research questions${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

let queued = 0, skipped = 0, failed = 0;
for (const { q, tags } of NEW_QUESTIONS) {
  process.stdout.write(`  ${q.slice(0, 70)}... `);
  if (DRY_RUN) { console.log('(dry-run)'); continue; }
  const { status, data } = await enqueue(q, tags);
  if (status === 201 || status === 200) {
    console.log(`queued (id: ${data.id || '?'})`);
    queued++;
  } else if (status === 409 || (data.error && /exist|duplicate/i.test(data.error))) {
    console.log(`already exists`);
    skipped++;
  } else {
    console.log(`FAILED (${status}): ${JSON.stringify(data).slice(0, 80)}`);
    failed++;
  }
  // Brief pause between requests
  await new Promise(r => setTimeout(r, 300));
}

console.log(`\nDone: ${queued} queued, ${skipped} already exist, ${failed} failed`);
