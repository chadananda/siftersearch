// Generates questions/topic-terms.json: per family, the word stems a relevant passage would contain. run.mjs uses them so a
// question with no expected doc/text passes only when a top hit is on topic (not on "any result"). Hand edits survive: a
// family already in the file is kept unless --force. Haiku 4.5, ~$0.25 for 125 families. Env: ANTHROPIC_API_KEY.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFamilies, loadQuestions } from './registry.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'topic-terms.json');
const MODEL = 'claude-haiku-4-5-20251001';
const force = process.argv.includes('--force');
// stems that match nearly every passage in a religious library, whatever the model says
const GENERIC = new Set(['god', 'lord', 'relig', 'religion', 'faith', 'belief', 'believ', 'divine', 'divin', 'holy', 'spirit', 'people',
  'life', 'world', 'truth', 'teach', 'law', 'practice', 'pract', 'church', 'community', 'commun', 'comm', 'part', 'pers', 'person', 'human', 'love']);

const PROMPT = (f, samples) => `A library of religious scripture and commentary (all world religions) is searched with questions of this family:
intent: ${f.intent}
sample wordings:
${samples.map((s) => `- ${s}`).join('\n')}

List 8-20 lowercase word STEMS (prefixes, no spaces, 4+ letters, specific to THIS topic) such that a passage that genuinely answers questions of this
family would almost certainly contain at least one of them. Include synonyms and scriptural vocabulary (e.g. for death:
"death", "dying", "die", "soul", "afterlife", "hereafter", "resurrect", "heaven", "paradise", "immortal").
Never include tradition names, prophet names, or words common to any religious text (god, lord, religion, faith, belief,
divine, holy, spirit, people, life, world, truth, teach, law, practice, church, community). A stem must not be the start
of unrelated common words ("comm", "part", "pers" are useless).
Return ONLY JSON: {"terms":["…"]}`;

async function ask(f, samples) {
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: 'user', content: PROMPT(f, samples) }] }) });
  const j = await r.json(), t = j.content?.[0]?.text || '';
  const m = t.match(/\{[^{}]*"terms"\s*:\s*\[[^\]]*\][^{}]*\}/);
  let terms = [];
  try { terms = JSON.parse(m?.[0] || '{}').terms || []; } catch { /* unparseable reply: family left out, rerun fills it */ }
  return { terms: [...new Set(terms.map((x) => String(x).toLowerCase().trim()).filter((x) => /^[a-z'-]{4,}$/.test(x) && !GENERIC.has(x)))], usage: j.usage };
}

const prior = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const qs = loadQuestions();
let tin = 0, tout = 0;
for (const f of loadFamilies()) {
  if (prior[f.id] && !force) continue;
  const samples = qs.filter((q) => q.family === f.id).slice(0, 12).map((q) => q.text);
  const { terms, usage } = await ask(f, samples);
  tin += usage?.input_tokens || 0; tout += usage?.output_tokens || 0;
  if (terms.length >= 5) prior[f.id] = terms;
  fs.writeFileSync(OUT, JSON.stringify(prior, null, 1) + '\n');
  console.log(`${f.id}: ${terms.join(' ')}`);
}
fs.writeFileSync(OUT, JSON.stringify(prior, null, 1) + '\n');
console.log(`tokens in ${tin} out ${tout} ≈ $${((tin * 1 + tout * 5) / 1e6).toFixed(3)}`);
