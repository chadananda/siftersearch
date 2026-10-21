// Chad 10-21: record corrections (author / translators) through docs-repo, dry run first.
import { describe, it, expect } from 'vitest';
import { docCorrectionsJob } from '../../api/lib/ops/doc-corrections-job.js';

const docs = { 22546: { id: 22546, title: 'Messages 1986-2001', author: '3819', source_site: 'bahai-library.com', file_path: 'x/3819.md' },
  11313: { id: 11313, title: 'A Prophet in Modern Times', author: 'Peter Terry', file_path: "Baha'i/Baha'i Books/A Prophet.md" } };
const deps = (log) => ({ get: async (id) => docs[id] || null, setAuthor: async (id, a) => log.push(['author', id, a]), setTranslators: async (id, t) => log.push(['tr', id, t]) });

describe('doc-corrections', () => {
  it('dry run changes nothing and flags library files', async () => {
    const log = [];
    const r = await docCorrectionsJob({ fixes: [{ id: 11313, author: 'A.L.M. Nicolas', translators: ['Peter Terry'] }, { id: 9 }] }, deps(log));
    expect(log).toEqual([]);
    expect(r.changes[0]).toMatchObject({ id: 11313, author: { was: 'Peter Terry', now: 'A.L.M. Nicolas' }, library_file: "Baha'i/Baha'i Books/A Prophet.md" });
    expect(r.missing).toEqual([9]);
  });
  it('write applies author and translators', async () => {
    const log = [];
    await docCorrectionsJob({ write: true, fixes: [{ id: 22546, author: 'Universal House of Justice' }, { id: 11313, author: 'A.L.M. Nicolas', translators: ['Peter Terry'] }] }, deps(log));
    expect(log).toEqual([['author', 22546, 'Universal House of Justice'], ['author', 11313, 'A.L.M. Nicolas'], ['tr', 11313, ['Peter Terry']]]);
  });
});
