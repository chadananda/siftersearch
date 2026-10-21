// Citation plan: compilation quotes of the doctrinal writers → their source via SourceHunt (Chad 10-21).
import { describe, it, expect } from 'vitest';
import { sourceLinksBuildJob } from '../../api/lib/ops/source-links-build-job.js';

const cov = async () => [{ id: 7, writers: { "Bahá'u'lláh": { paras: 3, linked: 0 } } }, { id: 9, writers: { "Bahá'u'lláh": { paras: 1, linked: 1 } } }];
const paras = { 7: [{ id: 1, doc_id: 7, text: 'O Son of Being! Love Me, that I may love thee.' }, { id: 2, doc_id: 7, text: 'Another quote of four words or more' }, { id: 3, doc_id: 7, text: 'unknown words here and there' }] };
const work = async (doc, { afterId }) => (paras[doc] || []).filter((p) => p.id > afterId);
const hunt = async (text, { exclude }) => {
  expect(exclude.documentIds).toEqual([7]);   // a compilation is never its own source
  if (text.startsWith('O Son')) return { origin: { id: 100, documentId: 20809, title: 'The Hidden Words', overlap: 0.95 } };
  if (text.startsWith('Another')) return { origin: { id: 200, documentId: 20783, title: 'Gleanings', overlap: 0.3 } };
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
