// Anís reading guide (Chad 10-12): "help me study X" → a page per email with notes; next / again / back / skip / questions.
import { describe, it, expect } from 'vitest';
import { readingIntent, bookFrom, startFrom } from '../../api/lib/anis/reading/intent.js';
import { parseOutline, pageFrom, startIndex, addressOf, romanToInt } from '../../api/lib/anis/reading/outline.js';
import { subjectFor, renderPage, readingTurn, ownWords, renumber, highlight, noteSpans, ownCitations } from '../../api/lib/anis/reading/guide.js';
import { sameName } from '../../api/lib/anis/reading/research.js';

const MD = `# The Book {.off id="para_1" type="title"}

## INTRODUCTION {.h2 id="para_15" type="header"}

The Bahá’í Movement[pg xxiii] is now well known. {id="para_16" ilm_id="37" type="par" language="en"}

Nabíl, himself a participant, took up his *lonely* pen.[^3] {id="para_17" type="par"}

# CHAPTER I {.h1 id="para_128" type="header"}

## THE MISSION OF SHAYKH AHMAD {.h2 id="para_129" type="header"}

### His visit to Najaf and Karbilá {.h3 id="para_131" type="header"}

At a time when the shining reality of the Faith. {id="para_132" type="par"}

1.  First and foremost among them stands Quddús.

{id="para_133" type="par"}
`;

describe('reading intent', () => {
  it('a start names the book and where to begin', () => {
    const t = "Help me study the Dawn-Breakers. Let's start from the introduction";
    expect(bookFrom(t)).toBe('Dawn-Breakers');
    expect(startFrom(t)).toBe('introduction');
    expect(readingIntent(t)).toMatchObject({ kind: 'start', book: 'Dawn-Breakers', from: 'introduction' });
    expect(readingIntent('Can you read God Passes By with me?')).toMatchObject({ kind: 'start', book: 'God Passes By' });
    expect(readingIntent('Help me study the Dawn-Breakers, start from the introduction')).toMatchObject({ kind: 'start', book: 'Dawn-Breakers', from: 'introduction' });
  });
  it('continue/next → next page; again → deeper; others → navigation or a question', () => {
    for (const t of ['continue', 'Next', 'next please', 'ok', '']) expect(readingIntent(t, { active: true }).kind).toBe('next');
    for (const t of ['again', 'Try again', 'try again please']) expect(readingIntent(t, { active: true }).kind).toBe('again');
    expect(readingIntent('back', { active: true }).kind).toBe('back');
    expect(readingIntent('skip to chapter 5', { active: true })).toMatchObject({ kind: 'jump', target: 'chapter 5' });
    expect(readingIntent('Where are we?', { active: true }).kind).toBe('where');
    expect(readingIntent('Why did the Shah fear him?', { active: true }).kind).toBe('question');
  });
  it('with no book open, "next" is not a reading turn', () => {
    expect(readingIntent('next').kind).toBe('none');
  });
  it('the reader’s own words: quoted history is cut', () => {
    expect(ownWords('next\n\nOn Mon, Anís wrote:\n> old page')).toBe('next');
  });
});

describe('reading outline', () => {
  const o = parseOutline(MD);
  it('sections: Intro, then chapters by number with their titles', () => {
    expect(o.sections.map((s) => s.key)).toEqual(['Intro', '1']);
    expect(o.sections[1].title).toBe('THE MISSION OF SHAYKH AHMAD');
  });
  it('paragraphs carry OceanLibrary ids, numbers within the section, the topic above them, clean text', () => {
    expect(o.paragraphs.map((p) => `${addressOf(p)} ${p.pid}`)).toEqual(['#Intro.1 para_16', '#Intro.2 para_17', '#1.1 para_132', '#1.2 para_133']);
    expect(o.paragraphs[0].text).toBe('The Bahá’í Movement is now well known.');
    expect(o.paragraphs[1].text).toBe('Nabíl, himself a participant, took up his lonely pen.');
    expect(o.paragraphs[2].topic).toBe('His visit to Najaf and Karbilá');
  });
  it('a paragraph whose attribute line follows it after a blank line keeps its text', () => {
    expect(o.paragraphs[3].text).toBe('1. First and foremost among them stands Quddús.');
  });
  it('a page never crosses into a new section', () => {
    expect(pageFrom(o.paragraphs, 0, { words: 1000 }).items.map((p) => p.pid)).toEqual(['para_16', 'para_17']);
  });
  it('starting points: introduction, chapter by number or roman', () => {
    expect(startIndex(o.paragraphs, 'the introduction')).toBe(0);
    expect(startIndex(o.paragraphs, 'chapter I')).toBe(2);
    expect(startIndex(o.paragraphs, 'chapter 1')).toBe(2);
    expect(romanToInt('XXVI')).toBe(26);
  });
});

describe('subject and page', () => {
  it('subject line: [Reading] <Book> #<section>.<¶> - <topic>', () => {
    expect(subjectFor('The Dawn-Breakers', { section: '5', n: 7 }, "Bab's pilgrimage to Mecca")).toBe("[Reading] Dawn-Breakers #5.7 - Bab's pilgrimage to Mecca");
  });
  it('each paragraph is followed by its notes; only cited sources are listed', () => {
    const md = renderPage({ book: 'The Dawn-Breakers', sectionLabel: 'Introduction', author: 'by George Townshend',
      items: [{ pid: 'para_16', section: 'Intro', n: 1, text: 'Para one.' }],
      notes: { paragraphs: [{ pid: 'para_16', notes: [{ name: 'Nabíl', note: 'Born 1831 [S2].' }] }], look_closer: '', next: 'Next, Persia.' },
      sources: [{ title: 'Unused', url: 'u1' }, { title: 'God Passes By', url: 'https://oceanlibrary.com/x' }], pageNo: 1 });
    expect(md).toContain('(by George Townshend)');
    expect(md.indexOf('**#Intro.1** Para one.')).toBeLessThan(md.indexOf('- **Nabíl** — Born 1831 [S2].'));   // not in the text: no number
    expect(md).toContain('[S2] [God Passes By](https://oceanlibrary.com/x)');
    expect(md).not.toContain('Unused');
  });
  it('cited sources are renumbered in order of first citation; uncited ones dropped', () => {
    const r = renumber({ paragraphs: [{ pid: 'p', notes: [{ name: 'a', note: 'x [S7] y [S2] [S7]' }] }], look_closer: 'z [S2]' },
      [{ title: 's1' }, { title: 's2' }, { title: 's3' }, { title: 's4' }, { title: 's5' }, { title: 's6' }, { title: 's7' }]);
    expect(r.notes.paragraphs[0].notes[0].note).toBe('x [S1] y [S2] [S1]');
    expect(r.notes.look_closer).toBe('z [S2]');
    expect(r.sources.map((x) => x.title)).toEqual(['s7', 's2']);
  });
  it('noted names are found at their first occurrence, longer names first, never inside another', () => {
    expect(noteSpans('Mullá Ḥusayn met Ḥusayn’s friend in Shíráz.', ['Ḥusayn', 'Mullá Ḥusayn', 'Shíráz', 'absent']).map((x) => x.name))
      .toEqual(['Mullá Ḥusayn', 'Ḥusayn', 'Shíráz']);
  });
  it('highlights carry the note’s number', () => {
    const spans = noteSpans('Nabíl went to Shíráz.', ['Shíráz', 'Nabíl']).map((x, i) => ({ ...x, n: i + 1 }));
    expect(highlight('Nabíl went to Shíráz.', spans)).toBe('<mark>Nabíl</mark>¹ went to <mark>Shíráz</mark>².');
  });
  it('a note keeps only citations from its own target’s evidence', () => {
    const out = ownCitations({ paragraphs: [{ pid: 'p', notes: [{ name: 'Nabíl’s unique narrative', note: 'Pilgrimage [S1] and pen name [S3].' }] }], look_closer: 'x [S2]' },
      [{ name: 'Nabíl’s unique narrative', labels: new Set(['S3']) }, { name: 'Revelation', labels: new Set(['S1']) }]);
    expect(out.paragraphs[0].notes[0].note).toBe('Pilgrimage and pen name [S3].');
    expect(out.look_closer).toBe('x');
  });
  it('names match across honorifics and spelling marks', () => {
    expect(sameName('Mullá Ḥusayn', 'Ḥusayn')).toBe(true);
    expect(sameName('Shíráz', 'Tabríz')).toBe(false);
  });
});

describe('readingTurn', () => {
  const fake = () => {
    const saved = [];
    let session = null;
    return {
      saved,
      deps: {
        latestSession: async () => session,
        sessionFor: async () => session,
        saveSession: async (s) => { if (!s.participantId) throw new Error('participantId required'); saved.push(s); session = { participant_id: s.participantId, doc_id: s.docId, title: s.title, cursor: s.cursor, pages: s.pages, explained: s.explained }; },
        listDocs: async () => ({ docs: [{ id: 21308, title: 'The Dawn-Breakers', author: 'Nabil Zarandi', file_path: 'x.md', source_site: 'oceanlibrary.com' }] }),
        getParagraphs: async () => [],
        libraryBase: '/nonexistent',
        readFile: async () => MD,
        researchPage: async ({ items }) => ({ targets: [
          { pid: items[0].pid, name: 'Bahá’í Movement', key: 'n:bahai movement', evidence: { claims: [] } },
          { pid: items[0].pid, name: 'Nabíl', key: 'n:nabil', evidence: { claims: [] } }], sources: [] }),
        llmJson: async ({ caller }) => (caller === 'reading-level' ? { json: { level: 'Knows the Báb and Bahá’u’lláh well.' } }
          : { json: { topic: 'The record and its writer', paragraphs: [{ pid: 'para_16', notes: [{ name: 'Bahá’í Movement', note: 'Townshend’s 1932 term.' }] }], next: 'Onward.' } }),
      },
    };
  };
  it('a start with a starting point sends the first page with its subject; next continues; questions fall through', async () => {
    const f = fake();
    {
      const msg = (t) => [{ role: 'user', content: t }];
      const r1 = await readingTurn({ messages: msg("Help me study the Dawn-Breakers. Let's start from the introduction"), participantId: 'email:x', deps: f.deps });
      expect(r1.subject).toBe('[Reading] Dawn-Breakers #Intro.1 - The record and its writer');
      expect(r1.page.paragraphs[0]).toMatchObject({ address: '#Intro.1', pid: 'para_16', text: 'The Bahá’í Movement is now well known.' });
      expect(r1.bookmark).toEqual({ docId: 21308, cursor: 2 });
      expect(f.saved.at(-1)).toMatchObject({ participantId: 'email:x', docId: 21308, cursor: 2 });
      expect(f.saved.at(-1).explained['n:bahai movement']).toMatchObject({ at: '#Intro.1' });
      expect(f.saved.at(-1).explained['n:nabil']).toBeUndefined();   // researched but not noted → still available later
      expect(f.saved.at(-1).explained.__level.text).toContain('Knows the Báb');
      expect(r1.reply).toContain('The <mark>Bahá’í Movement</mark>¹ is now well known.');
      expect(r1.reply).toContain('- ¹ **Bahá’í Movement** — Townshend’s 1932 term.');
      expect(r1.page.paragraphs[0].highlights).toEqual([{ name: 'Bahá’í Movement', start: 4, end: 19 }]);
      const r2 = await readingTurn({ messages: msg('next'), participantId: 'email:x', deps: f.deps });
      expect(r2.subject).toMatch(/^\[Reading\] Dawn-Breakers #1\.1 - /);
      expect(await readingTurn({ messages: msg('Who was Nabíl?'), participantId: 'email:x', deps: f.deps })).toBeNull();
    }
  });
});
