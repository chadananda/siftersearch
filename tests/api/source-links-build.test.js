// Citation plan: compilation quotes of the doctrinal writers → their source via SourceHunt (Chad 10-21).
import { describe, it, expect } from 'vitest';
import { sourceLinksBuildJob } from '../../api/lib/ops/source-links-build-job.js';

const cov = async () => [{ id: 7, writers: { "Bahá'u'lláh": { paras: 3, linked: 0 } } }, { id: 9, writers: { "Bahá'u'lláh": { paras: 1, linked: 1 } } }];
const BH = JSON.stringify([{ name: "Bahá'u'lláh", role: 'author', basis: 'book' }]);
const paras = { 7: [{ id: 1, doc_id: 7, authors: BH, text: 'O Son of Being! Love Me, that I may love thee. If thou lovest Me not, My love can in no wise reach thee.' },
  { id: 2, doc_id: 7, authors: BH, text: 'Another rendering of the same passage which shares enough of the words to count here' },
  { id: 3, doc_id: 7, authors: BH, text: 'unknown words here and there that no source in the library holds at all anywhere' }] };
const work = async (doc, { afterId }) => (paras[doc] || []).filter((p) => p.id > afterId);
const hunt = async (text, { exclude }) => {
  expect(exclude.documentIds).toEqual([7]);   // a compilation is never its own source
  if (text.startsWith('O Son')) return { origin: { id: 100, documentId: 20809, title: 'The Hidden Words', author: 'Bahá’u’lláh', bookAuthor: 'Bahá’u’lláh', overlap: 0.95 } };
  if (text.startsWith('Another')) return { origin: { id: 200, documentId: 20783, title: 'Gleanings', author: 'Bahá’u’lláh', bookAuthor: 'Bahá’u’lláh', overlap: 0.35 } };
  return { origin: null };
};

describe('source-links-build', () => {
  it('dry run: hunts only compilations with gaps, classifies verbatim vs another translation, writes nothing', async () => {
    const saved = [];
    const r = await sourceLinksBuildJob({}, { coverage: cov, work, hunt, save: async (x) => saved.push(...x), draining: () => false });
    expect(r).toMatchObject({ docs: 1, hunted: 3, linked: 2, verbatim: 1, translation: 1, not_found: 1 });
    expect(saved).toEqual([]);
  });
  it('write stores the links; a drain yields with the resume point', async () => {
    const saved = [];
    await sourceLinksBuildJob({ write: true }, { coverage: cov, work, hunt, save: async (x) => saved.push(...x), draining: () => false });
    expect(saved.map((x) => [x.quote_id, x.source_id, x.basis, x.method])).toEqual([[1, 100, 'verbatim', 'sourcehunt'], [2, 200, 'translation', 'sourcehunt']]);
    let n = 0;
    const y = await sourceLinksBuildJob({}, { coverage: cov, work, hunt, save: async () => {}, draining: () => ++n > 1 });
    expect(y).toMatchObject({ yielded: true, resume: { after: { doc: 7, id: 3 } } });
  });
});

import { quoteWriter, acceptSource } from '../../api/lib/ops/source-links-build-job.js';
describe('gates (the 10-21 sample)', () => {
  it('only real quotations are hunted', () => {
    expect(quoteWriter({ text: 'Publishing Trust, 1998), pages 4–5) [1]', authors: BH }).reason).toBe('short');
    expect(quoteWriter({ text: 'William Hoar, Anna Hoar (pilgrim notes)\ntranslator: Unknown\nyear: 1900 and more words to pass the length check here', authors: BH }).reason).toBe('not-a-quote');
    // a mis-tagged voice is still hunted — the source decides (Hidden Words quoted in a compilation tagged as its compiler)
    expect(quoteWriter({ text: 'Breathe not the sins of others so long as thou art thyself a sinner. Shouldst thou transgress this command', authors: JSON.stringify([{ name: 'Universal House of Justice', role: 'author' }]) }).hunt).toBe(true);
  });
  it('a source must be the writer’s own work with real shared wording', () => {
    const o = { id: 1, documentId: 2, author: 'Bahá’u’lláh', bookAuthor: 'Bahá’u’lláh', overlap: 0.9 };
    expect(acceptSource(o, "Bahá'u'lláh", 7).basis).toBe('verbatim');
    expect(acceptSource({ ...o, bookAuthor: 'Star of the West' }, "Bahá'u'lláh", 7).reason).toBe('not-own-work');
    expect(acceptSource({ ...o, site: 'bahai-library.com' }, "Bahá'u'lláh", 7).reason).toBe('mirror');
    expect(acceptSource({ ...o, overlap: 0.07 }, "Bahá'u'lláh", 7).reason).toBe('weak-wording');
    expect(acceptSource({ ...o, author: 'Universal House of Justice', bookAuthor: 'Universal House of Justice' }, null, 7).reason).toBe('other-writer');
    expect(acceptSource({ ...o, author: 'Shoghi Effendi', bookAuthor: 'Shoghi Effendi' }, "Bahá'u'lláh", 7).basis).toBe('verbatim');   // the source decides
    expect(acceptSource({ ...o, author: 'Shoghi Effendi', bookAuthor: 'Shoghi Effendi' }, null, 7, 'Research Department Compilations').reason).toBe('compilation');
  });
});
