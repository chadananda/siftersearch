// Windowed paragraph attribution helpers (api/lib/authorship/window.js).
import { describe, it, expect } from 'vitest';
import { canonical, initialRoster, windowState, windowQuestions, parseAnswers, needsEscalation, parseEscalation, OTHER } from '../../api/lib/authorship/window.js';

describe('authorship window', () => {
  it('folds LLM spellings onto the roster', () => {
    expect(canonical("Baha'u'llah")).toBe('Bahá’u’lláh');
    expect(canonical('the Guardian')).toBe('Shoghi Effendi');
    expect(canonical('Helen hornby', ['Helen Hornby'])).toBe('Helen Hornby');
    expect(canonical('Mírzá Abu’l-Faḍl')).toBe('Mírzá Abu’l-Faḍl');
  });
  it('starts the roster with the figures and the book author, never a compiler', () => {
    const r = initialRoster({ author: 'Research Department of the Universal House of Justice (compiler)', religion: "Bahá'í" });
    expect(r).toContain('Shoghi Effendi');
    expect(r.some((n) => /compiler/.test(n))).toBe(false);
  });
  it('shows decided paragraphs with labels, targets numbered, what follows unlabelled', () => {
    const s = windowState({ book: { title: 'B', author: 'X' }, roster: ['Shoghi Effendi'],
      anchors: [{ text: 'a', heading: 'H', label: { speaker: 'Shoghi Effendi' } }], targets: [{ text: 't1', heading: 'H' }], ahead: [{ text: 'Shoghi Effendi, ADJ, p. 30', heading: 'H' }] });
    expect(s).toMatch(/\[speaker: Shoghi Effendi; quotes: none\] a/);
    expect(s).toMatch(/T1: t1/);
    expect(s.match(/## H/g)).toHaveLength(1);
  });
  it('asks speaker and quotes per target and escalates the unsure and the unnamed', () => {
    const q = windowQuestions(['Shoghi Effendi'], 2, { author: 'X' });
    expect(Object.keys(q)).toEqual(['s1', 'q1', 's2', 'q2']);
    expect(q.s1.criteria[OTHER]).toBeTruthy();
    const l = parseAnswers({ s1: { choice: 'Shoghi Effendi', confidence: 0.95 }, q1: { choice: 'none', confidence: 0.9 }, s2: { choice: OTHER, confidence: 0.9 }, q2: { choice: 'none', confidence: 0.9 } }, 2);
    expect(l[0]).toMatchObject({ speaker: 'Shoghi Effendi', quotes: null });
    expect(needsEscalation(l[0], 0.7)).toBe(false);
    expect(needsEscalation(l[1], 0.7)).toBe(true);
  });
  it('reads the LLM JSON and canonicalises names', () => {
    expect(parseEscalation('ok {"T2": {"speaker": "the Guardian", "quotes": "Baha\'u\'llah"}}', [1], [])).toEqual({ 1: { speaker: 'Shoghi Effendi', quotes: 'Bahá’u’lláh' } });
  });
});

describe('condense', () => {
  it('keeps every quotation of a long paragraph with its lead-in', async () => {
    const { condense } = await import('../../api/lib/authorship/window.js');
    const t = 'x'.repeat(1200) + ' The Mu‘tamid could not help giving vent to his joy. “Hear me!” he exclaimed. ' + 'y'.repeat(300);
    const c = condense(t);
    expect(c.length).toBeLessThan(t.length);
    expect(c).toMatch(/giving vent to his joy\. “Hear me!”/);
    expect(condense('short')).toBe('short');
  });
});

describe('settle + editor label', () => {
  it('drops a quote of the speaker themself and maps generic narrators to one label', async () => {
    const { settle, canonical, EDITOR } = await import('../../api/lib/authorship/window.js');
    expect(settle({ speaker: 'Bahá’u’lláh', quotes: "Baha'u'llah" }).quotes).toBeNull();
    expect(settle({ speaker: 'John E. Esslemont', quotes: 'Bahá’u’lláh' }).quotes).toBe('Bahá’u’lláh');
    expect(canonical('narrator')).toBe(EDITOR);
    expect(canonical('The reporter')).toBe(EDITOR);
  });
});

describe('book brief (prompt tuner)', () => {
  it('reads speakers and rules, drops compilers, shows the rules in the window', async () => {
    const { parseBrief, windowState, windowQuestions } = await import('../../api/lib/authorship/window.js');
    const b = parseBrief('{"speakers":[{"name":"the Guardian","recognise":"letters signed Shoghi"},{"name":"Research Department","recognise":"x"}],"rules":["Letters follow a dateline."]}', []);
    expect(b.speakers.map((x) => x.name)).toEqual(['Shoghi Effendi']);
    expect(windowState({ book: { title: 'B', author: 'X' }, roster: ['Shoghi Effendi'], anchors: [], targets: [{ text: 't' }], ahead: [], brief: b })).toMatch(/HOW THIS BOOK WORKS: Letters follow a dateline\./);
    // v13: the description is stated once in the window, not in every question
    expect(windowState({ book: { title: 'B', author: 'X' }, roster: ['Shoghi Effendi'], anchors: [], targets: [{ text: 't' }], ahead: [], brief: b })).toMatch(/Shoghi Effendi \(letters signed Shoghi\)/);
    expect(windowQuestions(['Shoghi Effendi'], 1, { author: 'X' }).s1.instructions).toBe('Speaker of T1?');
  });
});

describe('editor label variants', () => {
  it('maps "narrator/editor" too', async () => {
    const { canonical, EDITOR } = await import('../../api/lib/authorship/window.js');
    expect(canonical('narrator/editor')).toBe(EDITOR);
    expect(canonical('the editor or reporter')).toBe(EDITOR);
  });
});

describe('relevantRoster', () => {
  it('keeps figures, the author, the brief and names in the text, and caps the rest', async () => {
    const { relevantRoster } = await import('../../api/lib/authorship/window.js');
    const roster = ['Bahá’u’lláh', 'The Báb', 'Nabil Zarandi', ...Array.from({ length: 40 }, (_, i) => `Person Number${i}`), 'Manúchihr Ḵhán'];
    const r = relevantRoster(roster, 'the Mu‘tamid, Manúchihr Ḵhán, said', { author: 'Nabil Zarandi' }, null, 10);
    expect(r).toContain('Bahá’u’lláh');
    expect(r).toContain('Nabil Zarandi');
    expect(r).toContain('Manúchihr Ḵhán');
    expect(r.length).toBeLessThanOrEqual(10);
  });
});

describe('narration guard (v14, from the change spot-check)', () => {
  it('keeps the narrator when the quote is introduced in the narration', async () => {
    const { guardNarration } = await import('../../api/lib/authorship/window.js');
    const g = (speaker, text) => guardNarration({ speaker, quotes: null }, text);
    expect(g('Bahá’u’lláh', '“We, verily,” wrote Bahá’u’lláh, surveying, in the evening of His life, “have …”')).toMatchObject({ speaker: null, quotes: 'Bahá’u’lláh', narrated: true });
    expect(g('‘Abdu’l-Bahá', '‘Abdu’l-Bahá, after enumerating in His “Some Answered Questions” the consequences, significantly affirms that “so…”').narrated).toBe(true);
    expect(g('the chief', 'The chief turned to one of his farráshes and said, “Take him to the money-changer’s and look into it.”').narrated).toBe(true);
  });
  it('leaves whole quotations and unmarked blocks with their own speaker', async () => {
    const { guardNarration } = await import('../../api/lib/authorship/window.js');
    expect(guardNarration({ speaker: 'Mullá ‘Abdu’l-Karím' }, '“I spent the entire winter in close companionship with him. During the whole of that period, I faithfully attended his classes.”').speaker).toBe('Mullá ‘Abdu’l-Karím');
    expect(guardNarration({ speaker: 'Shoghi Effendi' }, 'I have learned with profound regret of the lamentable occurrences in Palestine, and hasten to offer Your Excellency my sympathy.').speaker).toBe('Shoghi Effendi');
    expect(guardNarration({ speaker: 'Shoghi Effendi', fixed: true }, 'He said “x” and wrote it.').speaker).toBe('Shoghi Effendi');
  });
  it('never gives captions or one-line titles a speaker', async () => {
    const { guardNarration } = await import('../../api/lib/authorship/window.js');
    expect(guardNarration({ speaker: 'Queen Marie' }, '![FACSIMILES OF QUEEN MARIE’S HANDWRITING](x)').speaker).toBeNull();
    expect(guardNarration({ speaker: 'Mírzá Músá' }, 'Mírzá Músá.').speaker).toBeNull();
  });
});

describe('narration guard v15', () => {
  it('catches introductions without speech verbs, short "he said" tags and third-person narration', async () => {
    const { isNarrated } = await import('../../api/lib/authorship/window.js');
    expect(isNarrated('“From two ranks amongst men,” is His terse and prophetic utterance, “power hath been seized: kings and ecclesiastics.”', 'Bahá’u’lláh')).toBe(true);
    expect(isNarrated('“It would take too long,” he said. “And then ‘Abdu’r-Raḥím will never see ‘Akká.”', 'Nabíl-i-Akbar')).toBe(true);
    expect(isNarrated('Shoghi Effendi was the bearer of letters from this grandfather to some of His English friends, as is attested in a letter he wrote', 'Shoghi Effendi')).toBe(true);
    expect(isNarrated('The Báb refers to his son in his commentary. The following is the translation: “In truth, thy son Aḥmad…”', 'The Báb')).toBe(true);
  });
  it('still leaves whole quotations and letter bodies alone', async () => {
    const { isNarrated } = await import('../../api/lib/authorship/window.js');
    expect(isNarrated('“I continued my search until I reached them. Seized with a savage fury, I inflicted upon Mullá ‘Alí unspeakable injuries.”', 'Mullá ‘Alíy-i-Basṭámí')).toBe(false);
    expect(isNarrated('I have learned with profound regret of the lamentable occurrences in Palestine, and hasten to offer my sympathy.', 'Shoghi Effendi')).toBe(false);
  });
});

describe('structural lines v15', () => {
  it('keeps a letter\'s dateline and salutation with its writer', async () => {
    const { isStructuralLine } = await import('../../api/lib/authorship/window.js');
    expect(isStructuralLine('Bran August 27th 1926')).toBe(false);
    expect(isStructuralLine('Dear Sir,')).toBe(false);
    expect(isStructuralLine('Mírzá Músá.')).toBe(true);
  });
});

describe('block evidence (v16)', () => {
  it('needs something on the page to move an unmarked block off the book author', async () => {
    const { blockHasEvidence } = await import('../../api/lib/authorship/window.js');
    const prayer = 'He is God! Thou seest, O my Lord, the assemblage of Thy loved ones, gathered by the precincts of Thine all-sufficing Shrine';
    // a mention is not an introduction (Memorials ¶508→509: ‘Abdu’l-Bahá's prayer after "Bahá’u’lláh left the world")
    expect(blockHasEvidence('Bahá’u’lláh', { text: prayer, prevText: 'But then Bahá’u’lláh left the world, and this was the supreme affliction', prevSpeaker: '‘Abdu’l-Bahá' })).toBe(false);
    expect(blockHasEvidence('Bahá’u’lláh', { text: 'By the righteousness of God! We were in no wise connected…', prevText: 'Many others were seized, among them being Bahá’u’lláh. He afterwards wrote:—' })).toBe(true);
    expect(blockHasEvidence('Bahá’u’lláh', { text: 'And now, concerning the House of Justice which God hath ordained…', prevText: 'In His Will and Testament ‘Abdu’l-Bahá wrote:' })).toBe(false);
    expect(blockHasEvidence('Rúmí', { text: 'I am lost, O Love, possessed and dazed,', prevText: 'Bahá’u’lláh had written down an ode of Rúmí’s for him, and Ustád would sing these lines:' })).toBe(true);
    expect(blockHasEvidence('Rúmí', { text: 'Thou, both End and Origin,', prevSpeaker: 'Rúmí' })).toBe(true);
  });
});

describe('block evidence v16b', () => {
  it('reads the whole introducing paragraph, and only attributing headings', async () => {
    const { blockHasEvidence } = await import('../../api/lib/authorship/window.js');
    const intro = 'At one time, Bahá’u’lláh had written down an ode of Rúmí’s for him. ' + 'x '.repeat(300) + 'Ustád would sing these lines:';
    expect(blockHasEvidence('Rúmí', { text: 'I am lost, O Love,', prevText: intro })).toBe(true);
    expect(blockHasEvidence('Bahá’u’lláh', { text: 'The French Ambassador, He rebukes', heading: 'Bahá’u’lláh’s Proclamation to the Kings' })).toBe(false);
    expect(blockHasEvidence('‘Abdu’l-Bahá', { text: 'O noble friends!', heading: 'Address by ‘Abdu’l-Bahá at the City Temple' })).toBe(true);
  });
});

describe('names with brackets', () => {
  it('does not build a broken regex from a speaker like "Bahá’í (Writings)"', async () => {
    const { isNarrated, blockHasEvidence } = await import('../../api/lib/authorship/window.js');
    expect(() => isNarrated('He said “x”.', 'Compilation (Bahá’í Writings)')).not.toThrow();
    expect(() => blockHasEvidence('Compilation (Bahá’í Writings)', { text: 'x', prevText: 'y:' })).not.toThrow();
  });
});
