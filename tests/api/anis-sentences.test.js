// One sentence segmenter for every reply transform (Chad 11-14 "A.H."): byte-exact pieces, no ends at abbreviations / initials / numbers,
// the streaming gate waits for the next word, and every sentence-removing transform keeps the words it does not declare removed.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { segment, sentencesOf, keepsWords, wordSafe, cutsAt } from '../../api/lib/assistant/sentences.js';
import { createSentenceGate } from '../../api/lib/assistant/quotes.js';
import { dropCutOff, dropNarration, dropUncheckedDisclaimer, dropRebuildPreamble, dropSearchOffer, dropSourceSpeculation, dropDanglingLeadIn } from '../../api/lib/assistant/lint.js';
import { dropOffers, deHead } from '../../api/lib/assistant/reply-form.js';

const AH = 'Date and recipient. Revealed in 1281 A.H. (1865) for Aḥmad, a native of Yazd.';

describe('the "A.H." loss (tz4, edge 1e544da3) — its cause, proved', () => {
  it('was the old per-piece cut-off drop over a naive split, not the gate and not deHead', () => {
    // lint.js dropCutOff before 03dc9f52d: /[^.!?]+…/ pieces, a piece ending on an article ("…1281 A.") read as cut off
    const CUT_OFF = /\b(?:in|of|from|by|with|at|into|the|an?|and)\s*[.!?]["”’)*_]*\s*$/i;
    const pieces = AH.match(/[^.!?]+(?:[.!?…]+["”’)*_]*|$)\s*/g);
    expect(pieces).toContain('Revealed in 1281 A.');
    const old = pieces.filter((x) => !(/[.!?]["”’)*_]*\s*$/.test(x) && CUT_OFF.test(x))).join('').trimEnd();
    expect(old).toBe('Date and recipient. H. (1865) for Aḥmad, a native of Yazd.');   // exactly what the reader saw
    expect(deHead(`\n${AH}`).text ?? deHead(`\n${AH}`)).toContain('1281 A.H. (1865)');
  });
  it('the gate, fed a character at a time, releases "…1281 A.H. (1865)…" intact', () => {
    const got = [], gate = createSentenceGate([], (s) => got.push(s));
    for (const ch of `${AH} He wrote it.`) gate.push(ch);
    gate.flush();
    expect(got.join('')).toBe(`${AH} He wrote it.`);
    expect(got.some((s) => /A\.$|A\.\s$/.test(s))).toBe(false);
  });
  it('today\'s code keeps the line', () => {
    expect(sentencesOf(AH)).toEqual(['Date and recipient. ', 'Revealed in 1281 A.H. (1865) for Aḥmad, a native of Yazd.']);
    expect(dropCutOff(AH).text).toBe(AH);
  });
});

const NO_CUT = [
  'Revealed in 1281 A.H. (1865) and in 22 B.E. as well.',
  'See J. E. Esslemont and H. M. Balyuzi on this.',
  'Compare Gen. 1.2 and Gleanings 205.15 here.',
  'He met Dr. Grossmann and Mr. Remey in St. Louis.',
  'In vol. 2, ch. 3, p. 45 the text reads so.',
  'Words such as e.g. this and i.e. that stay.',
  'Read [Some Answered Questions. Ch. 5](https://oceanlibrary.com/x.y. Z) for this.',
  'The marker {{quote:P7. Then more}} stays whole.',
  'He said “No. Never. Not once.” to them.',
  'Code like `a. B` stays put.',
];
describe('segment()', () => {
  it.each(NO_CUT)('no end inside: %s', (line) => {
    expect(segment(line).map((s) => s.text).join('')).toBe(line);
    expect(segment(line)).toHaveLength(1);
  });
  it('ends real sentences and joins back byte for byte, offsets included', () => {
    const t = 'One. Two! Three? “Four.” Five…  Six.\n1. A list item. Its tail.\n> A quote. Two.\n| a. | b. |\n\nسلام. Done.';
    const s = segment(t);
    expect(s.map((x) => x.text).join('')).toBe(t);
    for (const x of s) expect(t.slice(x.start, x.end)).toBe(x.text);
    expect(sentencesOf('One. Two! Three?')).toEqual(['One. ', 'Two! ', 'Three?']);
    expect(s.find((x) => x.text.startsWith('> A quote'))?.text).toBe('> A quote. Two.\n');   // quoted lines are whole
  });
  it('a lowercase next word never starts a sentence', () => {
    expect(sentencesOf('approx. ten pages and so on. Then.')).toEqual(['approx. ten pages and so on. ', 'Then.']);
  });
});

describe('keepsWords()', () => {
  const t = 'He wrote the Íqán in 1862. I could not check every source. It answers the uncle of the Báb.';
  it('allows whole sentences out', () => expect(keepsWords(t, 'He wrote the Íqán in 1862. It answers the uncle of the Báb.')).toEqual({ ok: true, removed: ['I could not check every source'] }));
  it('refuses a cut inside a sentence', () => expect(keepsWords(AH, 'Date and recipient. H. (1865) for Aḥmad, a native of Yazd.').ok).toBe(false));
  it('allows a clause at its own mark', () => expect(keepsWords('Sadly, he left the city.', 'He left the city.').ok).toBe(true));
  it('allows markup changes', () => expect(keepsWords('## Title\n**Bold** words.', 'Title\nBold words.').ok).toBe(true));
  it('allows declared pieces', () => expect(keepsWords('Read it here, and I can find more if you wish.', 'Read it here.', ['and I can find more if you wish']).ok).toBe(true));
});

describe('wordSafe()', () => {
  it('a transform that breaks words is undone and named; a clean one records what it took', () => {
    const form = {};
    const T = wordSafe(form, { chop: (x) => ({ text: x.replace('1281 A.', ''), dropped: 1 }), drop: (x) => ({ text: x.replace('Date and recipient. ', ''), dropped: 1 }) });
    expect(T.chop(AH)).toEqual({ text: AH, dropped: 0 });
    expect(form.unsafe).toEqual(['chop']);
    expect(T.drop(AH).text).toBe(AH.slice(20));
    expect(form.drops).toEqual([{ rule: 'drop', removed: 'Date and recipient' }]);
  });
  it('string transforms come back as strings', () => {
    const form = {}, T = wordSafe(form, { bad: (x) => x.slice(3) });
    expect(T.bad('Hello there.')).toBe('Hello there.');
  });
});

describe('cutsAt() — the gate waits for the word after', () => {
  it('A.H. followed by "(" is no end; a capital after a full word is', () => {
    expect(cutsAt('Revealed in 1281 A.H. (', 22)).toBe(false);
    expect(cutsAt('He wrote it. T', 13)).toBe(true);
    expect(cutsAt('Read [Ch. 5. T', 13)).toBe(false);   // a link title still open
  });
});

// ── The corpus: every committed saved reply ───────────────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '../..');
const replies = (() => {
  const out = new Set();
  const add = (t) => { if (typeof t === 'string' && t.length > 80 && /[.!?]\s/.test(t)) out.add(t); };
  const walk = (o) => { if (Array.isArray(o)) return o.forEach(walk); if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) { if (k === 'reply' || k === 'answer' || (k === 'content' && o.role === 'assistant')) add(v); else walk(v); } };
  const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
  const dir = (d) => { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name);
    if (f.isDirectory()) dir(p); else if (p.endsWith('.json')) walk(read(p)); else if (p.endsWith('.md') && d.includes('fixtures')) add(fs.readFileSync(p, 'utf8')); } };
  dir(path.join(ROOT, 'tests/quality/reports'));
  dir(path.join(ROOT, 'tests/fixtures/anis'));
  return [...out];
})();
const DROPS = { dropCutOff, dropNarration, dropOffers, dropUncheckedDisclaimer, dropRebuildPreamble, dropSearchOffer, dropSourceSpeculation, deHead,
  dropDanglingLeadIn: (t) => dropDanglingLeadIn(t, { final: true }) };

describe('corpus of saved replies (no live calls)', { timeout: 60000 }, () => {
  it('has replies to test', () => expect(replies.length).toBeGreaterThan(100));
  it('segment-then-join gives every reply back byte for byte', () => {
    for (const r of replies) expect(segment(r).map((s) => s.text).join('')).toBe(r);
  });
  it('no piece ends at an abbreviation or an initial inside a line', () => {
    const bad = [];
    for (const r of replies) for (const s of sentencesOf(r)) if (!s.endsWith('\n') && /(?:^|[\s(])(?:\p{Lu}|[A-Z]\.[A-Z]|Mr|Mrs|Dr|St|vol|ch|pp?|no|cf|e\.g|i\.e)\.\s*$/u.test(s)) bad.push(JSON.stringify(s.slice(-60)) + ' → ' + JSON.stringify(r.slice(r.indexOf(s) + s.length, r.indexOf(s) + s.length + 30)));
    expect(bad).toEqual([]);
  });
  it('every sentence-removing transform keeps the words it does not declare', () => {
    const bad = [];
    for (const r of replies) for (const [rule, fn] of Object.entries(DROPS)) {
      const o = fn(r), out = typeof o === 'string' ? o : o?.text;
      if (typeof out === 'string' && out !== r && !keepsWords(r, out, o?.offers || []).ok) bad.push(`${rule}: ${r.slice(0, 60)}`);
    }
    expect(bad).toEqual([]);
  });
});
