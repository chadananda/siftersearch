// Storage holds MEANING; presentation happens at render time. That separation is what keeps the future
// OceanLibrary exporter a mapping rather than a rewrite — and it is why no site formatting is ever written
// into a note body.
import { describe, it, expect } from 'vitest';
import { renderChapter, citation } from '../../api/lib/notes/render.js';
import { CATEGORIES } from '../../api/lib/notes/profiles/dawn-breakers.js';

const opts = { categories: CATEGORIES };
const n = (over = {}) => ({ paragraph_index: 37, category: 'person', body: 'Mullá Ḥusayn, first to recognise the Báb.', ...over });

describe("Chad's format", () => {
  it('heads each paragraph with the ¶ number and lists only headings that have something to say', () => {
    const md = renderChapter([n()], opts);
    expect(md).toContain('**¶ 37**');
    expect(md).toContain('* **Person:** Mullá Ḥusayn');
    expect(md).not.toMatch(/\*\*Name:\*\*/);          // no empty headings
    expect(md).not.toMatch(/\*\*Islamic background:\*\*/);
  });

  it('orders categories as the PROFILE declares, not as the model emitted them', () => {
    const md = renderChapter([n({ category: 'detail', body: 'A memorable aside.' }), n({ category: 'name', body: 'Bábu\'l-Báb = Gate of the Gate.' })], opts);
    expect(md.indexOf('**Name:**')).toBeLessThan(md.indexOf('**Interesting note:**'));
  });

  it('groups by paragraph in reading order', () => {
    const md = renderChapter([n({ paragraph_index: 41 }), n({ paragraph_index: 37 })], opts);
    expect(md.indexOf('¶ 37')).toBeLessThan(md.indexOf('¶ 41'));
  });

  it('prefers a human edit over the original', () => {
    const md = renderChapter([n({ edited_body: 'The human version.' })], opts);
    expect(md).toContain('The human version.');
    expect(md).not.toContain('first to recognise');
  });
});

describe('epistemic labels survive into the rendered page', () => {
  it('marks a parallel and an interpretation, so neither can read as doctrine', () => {
    const md = renderChapter([
      n({ category: 'connection', claim_kind: 'strong_parallel', body: 'Compare the Íqán on recognition.' }),
      n({ paragraph_index: 38, category: 'connection', claim_kind: 'interpretive', body: 'One might read this as…' }),
    ], opts);
    expect(md).toContain('_(parallel)_');
    expect(md).toContain('_(interpretive)_');
  });

  it('adds no marker to an explicit teaching — it needs no hedge', () => {
    const md = renderChapter([n({ category: 'connection', claim_kind: 'explicit_teaching', body: 'The Íqán states this directly.' })], opts);
    expect(md).not.toMatch(/_\(/);
  });
});

describe('citations use the app scheme', () => {
  it('builds the working paragraph link', () => {
    expect(citation({ paraId: 'para_1130', sourceUrl: 'https://oceanlibrary.com/dawn-breakers_nabil' }))
      .toBe('([¶](https://oceanlibrary.com/dawn-breakers_nabil?paraId=para_1130))');
  });
  it('degrades sensibly when only a paragraph id is known', () => {
    expect(citation({ paraId: 'para_9' })).toBe('(para_9)');
  });
  it('renders sources stored as JSON text', () => {
    const md = renderChapter([n({ claim_kind: 'fact', sources_json: '[{"paraId":"para_9"}]' })], opts);
    expect(md).toContain('(para_9)');
  });
});
