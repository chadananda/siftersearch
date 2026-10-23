// The reader's first view is server-rendered (Chad 10-23 FOUC): the SSR HTML of DocumentPresentation, given the page's
// initialData, carries the document text and the reader's styled classes; no spinner, no client fetch needed to paint.
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import DocumentPresentation from '../../src/components/library/DocumentPresentation.svelte';

const initialData = {
  document: { id: 20810, title: 'The Kitáb-i-Íqán', author: 'Bahá’u’lláh', religion: "Baha'i", collection: 'Bahá’u’lláh', language: 'en',
    description: 'The primary doctrinal work.', cover_url: '/img/covers/20810?v=1', encumbered: false, slug: 'bahaullah_the-kitab-i-iqan' },
  paragraphs: [
    { id: 1, paragraph_index: 0, text: 'In the name of our Lord, the Exalted, the Most High.', blocktype: 'paragraph' },
    { id: 2, paragraph_index: 1, pn: '1', text: 'No man shall attain the shores of the ocean of true understanding except he be detached.', blocktype: 'paragraph' },
  ],
  total: 478, offset: 0, hasMore: true, requiresAuth: false, canEdit: false, previewLimit: null, about: null,
};
const props = { pathReligion: 'bahai', pathCollection: 'bahaullah', pathSlug: 'bahaullah_the-kitab-i-iqan', initialTitle: 'The Kitáb-i-Íqán', initialAuthor: 'Bahá’u’lláh' };

describe('DocumentPresentation SSR', () => {
  it('renders the document text and reader classes when the page passes initialData', () => {
    const { body } = render(DocumentPresentation, { props: { ...props, initialData } });
    expect(body).toContain('No man shall attain the shores of the ocean');
    for (const cls of ['presentation-container', 'document-content', 'doc-header', 'doc-title', 'paragraph', 'paragraph-text', 'para-anchor', 'doc-cover'])
      expect(body, cls).toMatch(new RegExp(`class="[^"]*\\b${cls}\\b`));
    expect(body).toContain('id="p1"');            // paragraph anchors exist in the first HTML
    expect(body).toContain('load-more-section');  // the rest loads progressively below
    expect(body).not.toContain('loading-state');
  });
  it('without initialData (origin unreachable at render) it keeps the titled loading shell', () => {
    const { body } = render(DocumentPresentation, { props });
    expect(body).toContain('loading-state');
    expect(body).toContain('The Kitáb-i-Íqán');
  });
});
