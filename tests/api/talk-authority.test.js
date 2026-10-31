// Chad 10-31: "Anis results are being polluted by talks content … priority given to talks even over doctrinal core."
// Talks (media transcripts, collection Media) are the LOWEST authority tier, come after the doctrinal core and take at
// most 2 of a window — order, never a filter; a talk is never filed under a donor-drive folder as its "religion".
import { describe, it, expect } from 'vitest';
import { keyFactor, doctrinalFactor, isTalk, aboutTalks, talksAfterCore, TALK } from '../../api/lib/search/doctrinal-rank.js';
import { getAuthority, TALK_AUTHORITY } from '../../api/lib/authority.js';
import { asTradition, sourceFolder, traditionOf } from '../../api/lib/media/item.js';

describe('talk authority tier', () => {
  it('a talk is below published scholarship, whatever its speaker or title', () => {
    expect(TALK_AUTHORITY).toBeLessThan(3);
    // a talk titled "The Iqan" is not the Kitáb-i-Íqán; a talk by a Hand of the Cause is still a talk
    expect(getAuthority({ title: 'The Iqan', author: 'Hooper Dunbar', religion: "Baha'i", collection: 'Media', authority: null })).toBe(TALK_AUTHORITY);
    expect(getAuthority({ title: 'On the Fast', author: 'Hooper Dunbar', religion: 'collection-08', collection: 'Media', authority: null })).toBe(TALK_AUTHORITY);
  });
  it('fusion and re-rank put a talk under every doctrinal tier and under scholarship', () => {
    expect(keyFactor('bahaullah', null, 'Media')).toBe(TALK);
    expect(keyFactor(null, null, 'Media')).toBeLessThan(keyFactor('moojanmomen', null));
    expect(keyFactor(null, null, 'Media', 'administration')).toBe(TALK);
    expect(doctrinalFactor({ author: 'Hooper Dunbar', collection: 'Media' }, 6)).toBeLessThan(doctrinalFactor({ author: 'Moojan Momen' }, 3));
    expect(doctrinalFactor({ author: "Bahá’u’lláh", collection: 'Media' }, 10)).toBe(TALK);
    expect(isTalk('Media')).toBe(true);
    expect(isTalk('Talks')).toBe(false);
  });
  it('a question about talks weighs them neutrally', () => {
    expect(aboutTalks('What did Hooper Dunbar say in his talk on the Covenant?')).toBe(true);
    expect(aboutTalks('fireside recordings about the Fast')).toBe(true);
    expect(aboutTalks('What is the Covenant?')).toBe(false);
    expect(aboutTalks('What did Bahá’u’lláh reveal about prayer and fasting?')).toBe(false);
    expect(doctrinalFactor({ author: 'Hooper Dunbar', collection: 'Media' }, 6, 'talks')).toBe(1);
  });
});

describe('talks after the doctrinal core', () => {
  const e = (id, { talk = false, factor = 1, religion = "Baha'i" } = {}) => ({ id, _factor: factor, paragraph: { id, religion, collection: talk ? 'Media' : 'Other' } });
  it('a talk ahead of the last core passage moves to just after it', () => {
    const w = [e('t1', { talk: true, factor: TALK }), e('w1', { factor: 3 }), e('s1', { factor: 1 }), e('g1', { factor: 2.6 }), e('x', { factor: 1 })];
    expect(talksAfterCore(w, w).map((x) => x.id)).toEqual(['w1', 's1', 'g1', 't1', 'x']);
  });
  it('at most 2 talks; the rest give their slot to the next passage of the same tradition — talks are kept, not filtered', () => {
    const w = [e('w1', { factor: 3 }), e('t1', { talk: true }), e('t2', { talk: true }), e('t3', { talk: true }), e('i1', { religion: 'Islam' })];
    const pool = [...w, e('i2', { religion: 'Islam' }), e('b2', { factor: 1 })];
    const out = talksAfterCore(w, pool).map((x) => x.id);
    expect(out.filter((id) => id.startsWith('t'))).toEqual(['t1', 't2']);
    expect(out).toContain('b2');
    expect(out).not.toContain('i2');
    expect(out).toHaveLength(5);
  });
  it('no talks → the window is untouched', () => {
    const w = [e('a'), e('b', { factor: 3 })];
    expect(talksAfterCore(w, w)).toBe(w);
  });
});

describe('a talk is filed under a tradition, never a donor-drive folder', () => {
  const known = new Set(["Baha'i", 'Islam']);
  it('collection-08 is not a tradition', () => {
    expect(asTradition('collection-08', known)).toBe("Baha'i");
    expect(asTradition('Islam', known)).toBe('Islam');
    expect(asTradition(null, known)).toBe("Baha'i");
    const prev = process.env.MEDIA_SOURCE_ROOT;
    process.env.MEDIA_SOURCE_ROOT = '/m';
    try {
      expect(sourceFolder('/m/collection-08/Dunbar/fast.mp3')).toBe('collection-08');
      expect(traditionOf('/m/collection-08/Dunbar/fast.mp3', known)).toBe("Baha'i");
      expect(traditionOf('/m/Islam/x.mp3', known)).toBe('Islam');
    } finally { if (prev == null) delete process.env.MEDIA_SOURCE_ROOT; else process.env.MEDIA_SOURCE_ROOT = prev; }
  });
  it('a re-ingest moves the SAME document to the tradition shelf and removes the old file', async () => {
    const { mkdtempSync, writeFileSync, existsSync, mkdirSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const { ingestTranscript } = await import('../../api/lib/media/ingest.js');
    const dir = mkdtempSync(join(tmpdir(), 'mi-')), base = mkdtempSync(join(tmpdir(), 'lib-'));
    writeFileSync(join(dir, 'transcript.md'), '---\ntitle: "T"\n---\n\nhello\n');
    mkdirSync(join(base, 'collection-08', 'Media'), { recursive: true });
    writeFileSync(join(base, 'collection-08', 'Media', 's-1.md'), 'old');
    const calls = [];
    const meta = { slug: 's-1', tradition: 'collection-08', doc_id: 42 };
    await ingestTranscript({ dir, meta }, { base, asTradition: (t) => asTradition(t, known),
      ingest: async (md, rel, m) => { calls.push({ rel, m }); return { documentId: 42, status: 'metadata_updated' }; },
      repo: { docParagraphMap: async () => [] } });
    expect(calls[0]).toEqual({ rel: join("Baha'i", 'Media', 's-1.md'), m: { id: 42 } });
    expect(existsSync(join(base, 'collection-08', 'Media', 's-1.md'))).toBe(false);
    expect(meta.tradition).toBe("Baha'i");
  });
});
