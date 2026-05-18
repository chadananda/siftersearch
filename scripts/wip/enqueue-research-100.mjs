// enqueue-research-100.mjs — Expand to 100 deep research questions.
// Covers the major burning spiritual questions not yet addressed in the existing 63.
// Usage: node scripts/wip/enqueue-research-100.mjs [--dry-run]
import { readFileSync } from 'fs';

const API_BASE = 'https://api.siftersearch.com/api/v1';
const KEY = readFileSync('/Users/chad/Dropbox/Public/JS/Projects/siftersearch.com/.env-secrets', 'utf8')
  .split('\n').find(l => l.startsWith('DEPLOY_SECRET='))?.split('=')[1]?.trim();

const DRY_RUN = process.argv.includes('--dry-run');

// 37 new questions to reach 100 total — organized by the concerns that bring
// people to religion at 2am, at deathbeds, and in the deepest crisis.
const NEW_QUESTIONS = [

  // Healing and the miraculous
  { q: 'Does God heal? What do the world\'s religions teach about miraculous healing and divine medicine?', tags: ['prayer', 'theodicy', 'faith'] },
  { q: 'What do religions teach about intercessory prayer — does praying for others actually help them?', tags: ['prayer', 'community'] },

  // Dreams, death, and the departed
  { q: 'What do the world\'s religions teach about dreams — can they be messages from God or the departed?', tags: ['afterlife', 'mysticism', 'soul-spirit'] },
  { q: 'What do near-death experiences reveal about what awaits us after death?', tags: ['afterlife', 'soul-spirit'] },
  { q: 'Can we communicate with those who have died? What do traditions teach about contact with the departed?', tags: ['afterlife', 'community'] },

  // Pluralism and conversion
  { q: 'Do all sincere spiritual paths lead to God? How do traditions understand religious pluralism?', tags: ['unity', 'progressive-revelation'] },
  { q: 'What does it mean spiritually to change one\'s religion — how do traditions understand conversion?', tags: ['authority', 'soul-spirit'] },

  // Sacred geography and devotional practice
  { q: 'Why do religious people go on pilgrimage, and what makes a place spiritually holy?', tags: ['law-practice', 'prayer', 'community'] },
  { q: 'What is the spiritual power of sacred music, chant, and sound in religious life?', tags: ['prayer', 'community', 'mysticism'] },
  { q: 'What is the spiritual significance of food — dietary laws, ritual meals, and the sacred table?', tags: ['law-practice', 'community', 'ethics'] },

  // Violence, evil, and scale
  { q: 'How can violence and atrocity be carried out in the name of religion — what goes wrong?', tags: ['ethics', 'theodicy', 'authority'] },
  { q: 'How do traditions respond to genocide, collective atrocity, and evil on a civilizational scale?', tags: ['theodicy', 'ethics', 'justice'] },

  // Spiritual gifts and unseen forces
  { q: 'What are spiritual gifts and charisms — healing, prophecy, and special graces from God?', tags: ['mysticism', 'prayer', 'revelation'] },
  { q: 'What is spiritual warfare — are there forces of darkness, and how do traditions teach us to resist them?', tags: ['theodicy', 'soul-spirit', 'prayer'] },
  { q: 'What is prophecy and how can we discern whether someone is a true prophet?', tags: ['revelation', 'authority', 'scripture-study'] },

  // Reincarnation and soul continuity
  { q: 'What do world religions teach about reincarnation and the return of the soul to earthly life?', tags: ['afterlife', 'soul-spirit'] },
  { q: 'What happens to children and infants who die — how do traditions address the death of the innocent?', tags: ['afterlife', 'theodicy'] },

  // Body, sexuality, and the sacred
  { q: 'What is the spiritual meaning of sexuality — how do traditions understand the sacred and the body?', tags: ['law-practice', 'soul-spirit', 'ethics'] },
  { q: 'What do traditions teach about aging and the spiritual gifts that come with growing old?', tags: ['soul-spirit', 'wisdom'] },
  { q: 'What is the spiritual significance of birth and bringing new life into the world?', tags: ['community', 'soul-spirit', 'creation'] },

  // The unreached and the lost
  { q: 'What is the fate of those who never had access to religious truth — are they saved or lost?', tags: ['afterlife', 'progressive-revelation', 'ethics'] },

  // Struggle and addiction
  { q: 'What is the spiritual dimension of addiction — and how do traditions understand recovery and healing?', tags: ['theodicy', 'soul-spirit', 'ethics'] },
  { q: 'What do traditions teach about mental suffering, depression, and the soul in prolonged darkness?', tags: ['theodicy', 'mysticism', 'soul-spirit'] },

  // Silence and conscience
  { q: 'Why does prayer sometimes go unanswered — what do traditions teach about God\'s silence?', tags: ['prayer', 'theodicy', 'faith'] },
  { q: 'How do we discern God\'s will for our lives — what is divine guidance and how do we recognize it?', tags: ['prayer', 'mysticism', 'soul-spirit'] },
  { q: 'What is conscience — where does our inner moral voice come from, and how do we hear it?', tags: ['ethics', 'soul-spirit', 'revelation'] },
  { q: 'What is the spiritual gift of solitude — what do traditions teach about the desert, wilderness, and aloneness?', tags: ['mysticism', 'prayer', 'soul-spirit'] },

  // Other beings
  { q: 'Do animals have souls? What is the spiritual status and worth of other living beings?', tags: ['creation', 'ethics', 'soul-spirit'] },

  // Spiritual maturity and development
  { q: 'What does spiritual maturity look like — how do traditions describe the fully ripened soul?', tags: ['soul-spirit', 'mysticism', 'ethics'] },

  // The divine feminine
  { q: 'What is the divine feminine — how do the world\'s traditions understand the feminine face of God?', tags: ['theology', 'equality', 'mysticism'] },

  // Institutions and power
  { q: 'What is the relationship between religion and political power — when must we obey God rather than the state?', tags: ['ethics', 'authority', 'justice'] },
  { q: 'What is religious trauma, and what do traditions offer those who have been harmed by religion?', tags: ['community', 'ethics', 'soul-spirit'] },
  { q: 'What is the relationship between personal faith and organized religion — do I need a community to find God?', tags: ['community', 'authority', 'soul-spirit'] },

  // Forgiveness and the unforgivable
  { q: 'What is radical forgiveness — can and should we forgive murder, betrayal, and the unforgivable?', tags: ['ethics', 'mercy-compassion', 'soul-spirit'] },

  // Cosmos and time
  { q: 'How do traditions understand the great cycles of cosmic time — ages, yugas, epochs, and spiritual seasons?', tags: ['eschatology', 'creation', 'progressive-revelation'] },

  // Vows and commitment
  { q: 'What do traditions teach about vows, oaths, and sacred commitments — the weight of a promise before God?', tags: ['law-practice', 'ethics', 'prayer'] },

  // The sacred ordinary
  { q: 'What is the sacred in the ordinary — how do traditions teach us to find God in daily life?', tags: ['mysticism', 'prayer', 'soul-spirit'] },
];

async function enqueue(question, tags) {
  const res = await fetch(`${API_BASE}/admin/deep-research`, {
    method: 'POST',
    headers: { 'x-internal-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, topic_tags: tags }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

console.log(`Enqueuing ${NEW_QUESTIONS.length} new research questions${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

let queued = 0, skipped = 0, failed = 0;
for (const { q, tags } of NEW_QUESTIONS) {
  process.stdout.write(`  ${q.slice(0, 72)}... `);
  if (DRY_RUN) { console.log('(dry-run)'); continue; }
  const { status, data } = await enqueue(q, tags);
  if (status === 201 || status === 200) {
    console.log(`queued (id: ${data.id || '?'})`);
    queued++;
  } else if (status === 409 || (data.error && /exist|duplicate/i.test(data.error))) {
    console.log(`already exists`);
    skipped++;
  } else {
    console.log(`FAILED (${status}): ${JSON.stringify(data).slice(0, 100)}`);
    failed++;
  }
  await new Promise(r => setTimeout(r, 300));
}

console.log(`\nDone: ${queued} queued, ${skipped} already exist, ${failed} failed`);
