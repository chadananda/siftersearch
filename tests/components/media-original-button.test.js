// The talk page's "Original" A/B button (Chad 10-23): the API's audio block (remastered + original URLs, per-paragraph s0),
// the time mapping between the copies, and the SSR markup (slot always reserved; button only on a remastered talk).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { render } from 'svelte/server';
import { talkAudio, isRemastered, originalStarts, originalField } from '../../api/lib/media/talk-audio.js';
import { flattenOriginalStarts, mapTime, flattenWords } from '../../src/lib/media.js';
import MediaPlayer from '../../src/components/media/MediaPlayer.svelte';

const base = JSON.parse(readFileSync(new URL('../fixtures/media-item.json', import.meta.url), 'utf8'));
const remasteredMeta = { version: 3, trim: { start_s: 1.5, end_s: 90 }, aligned_to: 'unipase', web_original: { ogg: 'web/talk.original.ogg', m4a: 'web/talk.original.m4a' } };

describe('talkAudio (GET /api/media/:slug audio block)', () => {
  it('a remastered talk carries original_url (m4a) + original_ogg with the same ?v=, and remastered: true', () => {
    const a = talkAudio({ slug: 'talk', level: 'full', meta: remasteredMeta });
    expect(a).toMatchObject({ remastered: true, offset_s: 1.5, end_s: 90, m4a: '/api/media/talk/file/web/talk.m4a?v=3',
      original_url: '/api/media/talk/file/web/talk.original.m4a?v=3', original_ogg: '/api/media/talk/file/web/talk.original.ogg?v=3' });
  });
  it('still on the transparent copy (aligned_to safe, or no web_original) → remastered: false, no original URLs', () => {
    for (const meta of [{ ...remasteredMeta, aligned_to: 'safe' }, { version: 2 }, { aligned_to: 'unipase' }]) {
      const a = talkAudio({ slug: 'talk', level: 'full', meta });
      expect(a.remastered).toBe(false);
      expect(a.original_url).toBeUndefined();
      expect(isRemastered(meta)).toBe(false);
    }
  });
  it('no full playback → no audio block', () => expect(talkAudio({ slug: 'talk', level: 'clips', meta: remasteredMeta })).toBeNull());
  it('s0 per paragraph only when remastered and the words carry it (a missing s0 falls back to s)', () => {
    const words = [{ w: 'a', s: 1, e: 2, s0: 1.04 }, { w: 'b', s: 2, e: 3 }];
    expect(originalStarts(words, true)).toEqual([1.04, 2]);
    expect(originalStarts(words, false)).toBeNull();
    expect(originalField([{ w: 'a', s: 1, e: 2 }], true)).toEqual({});
    expect(originalField(words, true)).toEqual({ s0: [1.04, 2] });
  });
});

describe('copy time mapping', () => {
  const paragraphs = [{ words: [['one', 1, 1.5], ['two', 2, 2.5]], s0: [1.05, 2.04] }, { words: [['three', 3, 3.5]] }];
  const flat = flattenWords(paragraphs);
  const s0 = flattenOriginalStarts(paragraphs);
  it('flattens s0 in word order; a paragraph without s0 keeps the main starts', () => expect(Array.from(s0)).toEqual([1.05, 2.04, 3]));
  it('no paragraph with s0 → null (highlight pauses while Original plays)', () => expect(flattenOriginalStarts([{ words: [['x', 0, 1]] }])).toBeNull());
  it('main → original → main lands on the same moment of the same word', () => {
    const t = 2.3, o = mapTime(t, flat.starts, s0);
    expect(o).toBeCloseTo(2.34, 6);
    expect(mapTime(o, s0, flat.starts)).toBeCloseTo(t, 6);
  });
  it('before the first word the gap is kept; never negative', () => {
    expect(mapTime(0.5, flat.starts, s0)).toBeCloseTo(0.55, 6);
    expect(mapTime(0, s0, flat.starts)).toBe(0);
  });
});

describe('MediaPlayer SSR', () => {
  const full = (audio) => ({ ...base, rights: { ...base.rights, playback: 'full' }, audio });
  const plain = { ogg: '/a.ogg', m4a: '/a.m4a', offset_s: 0, remastered: false };
  it('a remastered talk renders the small Original button in the reserved slot', () => {
    const { body } = render(MediaPlayer, { props: { item: full({ ...plain, remastered: true, original_url: '/o.m4a', original_ogg: '/o.ogg' }) } });
    expect(body).toMatch(/data-original-slot/);
    expect(body).toMatch(/<button[^>]*class="orig[^"]*"[^>]*>[\s\S]*?Original\s*<\/button>/);
    expect(body).toMatch(/aria-label="Play the original recording"/);
  });
  it('a talk still on the transparent copy reserves the slot but shows no button', () => {
    const { body } = render(MediaPlayer, { props: { item: full(plain) } });
    expect(body).toMatch(/data-original-slot/);
    expect(body).not.toMatch(/the original recording/);
  });
  it('a clips-level talk has neither', () => {
    const { body } = render(MediaPlayer, { props: { item: { ...base, clip_url: '/clip' } } });
    expect(body).not.toMatch(/data-original-slot/);
  });
});
