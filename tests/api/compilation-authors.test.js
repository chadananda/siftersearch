// A compilation is credited to its compiler, never its first contributor (Chad 10-19: Lights of Guidance "by Bahá'u'lláh").
import { describe, it, expect } from 'vitest';
import { compilationAuthor, contributors } from '../../api/lib/library/compilation-author.js';
import { compilationAuthorsJob } from '../../api/lib/ops/compilation-authors-job.js';

const LOG = { title: 'Lights of Guidance: A Bahá’í Reference File', author: 'Bahá’u’lláh', author_2: '‘Abdu’l-Bahá', author_3: 'Shoghi Effendi' };

describe('compilation author', () => {
  it('a named compiler by title (no slug in a library file); a Research Department folder; else a compilation', () => {
    expect(compilationAuthor(LOG, "Baha'i/Books/lights-of-guidance.md", "Baha'i")).toBe('Helen Hornby (compiler)');
    expect(compilationAuthor({ author: 'Bahá’u’lláh', author_2: 'The Báb', title: 'Prayer' }, "Baha'i/Research Department Compilations/prayer.md", "Baha'i")).toMatch(/Research Department/);
    expect(compilationAuthor({ author: 'Bahá’u’lláh', author_2: 'The Báb', title: 'Fire and Light' }, 'x.md', "Baha'i")).toBe("Compilation (Bahá'í Writings)");
    expect(compilationAuthor({ author: 'Bahá’u’lláh', title: 'Gleanings' }, 'x.md', "Baha'i")).toBeNull();
    expect(contributors(LOG)).toEqual(['Bahá’u’lláh', '‘Abdu’l-Bahá', 'Shoghi Effendi']);
  });
  it('the job finds the wrong library record and corrects it only when told to', async () => {
    const changed = [];
    const deps = { docs: async () => ({ docs: [{ id: 20804, title: 'Lights of Guidance', author: 'Bahá’u’lláh', religion: "Baha'i", file_path: "Baha'i/Books/lights-of-guidance.md" }] }),
      read: async () => 'x', parse: async () => LOG, base: '/lib', setAuthor: async (id, a) => changed.push([id, a]) };
    const dry = await compilationAuthorsJob({}, deps);
    expect(dry.wrong).toEqual([expect.objectContaining({ id: 20804, was: 'Bahá’u’lláh', now: 'Helen Hornby (compiler)' })]);
    expect(changed).toEqual([]);
    await compilationAuthorsJob({ write: true }, deps);
    expect(changed).toEqual([[20804, 'Helen Hornby (compiler)']]);
  });
});
