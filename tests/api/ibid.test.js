// Ibid. → the reference it stands for (Chad 10-21: "replace IBID wherever you find it with the reference. Ibid does not work
// for RAG") — a retrieved paragraph must carry its own source.
import { describe, it, expect } from 'vitest';
import { expandIbid } from '../../api/lib/refs/ibid.js';

describe('expandIbid — compilation trailers', () => {
  it('a bare (Ibid.) repeats the trailer before it; attribute and page tails are kept', () => {
    const out = expandIbid([
      '“A Board Member should not resign …”',
      '(From a letter written on behalf of the Guardian to an individual believer, March 26, 1950)<br>{id="para_4624"}',
      '“Another passage from the same letter.”',
      '(Ibid.) [pg 140] {id="para_334" ilm_id="bl4s2"}',
    ]);
    expect(out[3]).toBe('(From a letter written on behalf of the Guardian to an individual believer, March 26, 1950) [pg 140] {id="para_334" ilm_id="bl4s2"}');
    expect(out[0]).toBe('“A Board Member should not resign …”');
  });
  it('Ibid with a page replaces the page', () => {
    const out = expandIbid(['(Bahá’u’lláh: The Kitáb-i-Aqdas, p. 58)', 'text', '(Ibid., p. 89)']);
    expect(out[2]).toBe('(Bahá’u’lláh: The Kitáb-i-Aqdas, p. 89)');
  });
  it('a chain of Ibids each takes the expanded one before it', () => {
    const out = expandIbid(['(Gleanings, p. 10)', '(Ibid., p. 12)', '(Ibid.)']);
    expect(out.slice(1)).toEqual(['(Gleanings, p. 12)', '(Gleanings, p. 12)']);
  });
  it('": Ibid." after a letter names the previous trailer\'s publication', () => {
    const out = expandIbid([
      '(From a letter of the Universal House of Justice to the National Spiritual Assembly of Guatemala, October 27, 1965: Messages from the Universal House of Justice 1968–1973, p. 20)',
      '(From a letter of the Universal House of Justice to an individual believer, April 18, 1971: Ibid., p. 66)',
    ]);
    expect(out[1]).toBe('(From a letter of the Universal House of Justice to an individual believer, April 18, 1971: Messages from the Universal House of Justice 1968–1973, p. 66)');
  });
  it('an Ibid with nothing before it is left as written', () => {
    expect(expandIbid(['(Ibid.)'])).toEqual(['(Ibid.)']);
  });
});

describe('expandIbid — footnotes', () => {
  it('a footnote "Ibid., p. 45" repeats the previous footnote with the new page', () => {
    const out = expandIbid(['[^1]: Shoghi Effendi, God Passes By, p. 23.', 'body text', '[^2]: Ibid., p. 45.', '3. Ibid.'], ['footnote', 'paragraph', 'footnote', 'footnote']);
    expect(out[2]).toBe('[^2]: Shoghi Effendi, God Passes By, p. 45.');
    expect(out[3]).toBe('3. Shoghi Effendi, God Passes By, p. 45.');
  });
});

describe('ingest expands Ibid', () => {
  it('parseDocumentWithBlocks stores the full reference, not "(Ibid.)"', async () => {
    const { parseDocumentWithBlocks } = await import('../../api/services/ingester.js');
    const md = '“The first passage of guidance, long enough to stand as its own paragraph in the compilation.”\n\n(From a letter written on behalf of Shoghi Effendi to an individual believer, July 10, 1939)\n\n“The second passage of guidance, also long enough to stand on its own as a paragraph here.”\n\n(Ibid.)\n';
    const { chunks } = await parseDocumentWithBlocks(md, { keepParagraphs: true, skipAISegmentation: true });
    expect(chunks.map((c) => c.text).join('\n')).not.toMatch(/Ibid/);
    expect(chunks.filter((c) => /July 10, 1939/.test(c.text))).toHaveLength(2);
  });
});
