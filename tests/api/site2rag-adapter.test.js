// site2rag adapter tests (TDD).
//
// The adapter parses crawler-produced markdown for bahai-library.com,
// oceanoflights.org, bahaiteachings.org. Tests cover the three observed
// frontmatter shapes:
//   1. HTML-derived (rich frontmatter, plain MD body)
//   2. PDF-derived  (pages, host_page_url; body has <span data-pdf-page>
//      markers per paragraph for deeplinking back to the source PDF)
//   3. oceanoflights-style (frontmatter `authors` array with structured
//      central-figure metadata)
//
// All tests are unit tests against in-memory fixtures — no disk, no DB.

import { describe, it, expect } from 'vitest';
import { parseDoc, detectSupersedee } from '../../api/services/site-adapters/site2rag.js';

// ---------------------------------------------------------------------------
// Fixtures (representative of real /tank/site2rag/websites_md/ output)
// ---------------------------------------------------------------------------

const HTML_DERIVED_BAHAI_LIBRARY = `---
source_url: https://bahai-library.com/1861
canonical_url: https://bahai-library.com/bradley-detally_three_bahai_voices
domain: bahai-library.com
title: Three Baha'i Voices
title_source: og
fetched_at: 2026-05-03T00:43:58.449Z
content_hash: sha256:ac2ea040b2eda43e420a780742b9c320a4e30a720434faf58982695230f171f8
mime_type: text/html
word_count: 4941
keywords: ["Bahá'í"]
---
First introductory paragraph about three voices.

Second paragraph with deeper analysis.

Third paragraph with citation [^1].

[^1]: First footnote definition that should be skipped.
[^2]: Second footnote definition that should also be skipped.
`;

const PDF_DERIVED_BAHAI_LIBRARY = `---
source_url: https://bahai-library.com/pdf/journal-de-constantinople/ocr-ed_pdfs/1849/journal_constantinople_1849-04-29_p3.pdf
domain: bahai-library.com
title: journal_constantinople_1849-04-29_p3
mime_type: application/pdf
pages: 2
host_page_url: https://bahai-library.com/pdf/journal-de-constantinople/ocr-ed_pdfs/1849/
backlink_format: both
backlink_granularity: paragraph
---
[↗ p.1](https://bahai-library.com/pdf/journal-de-constantinople/ocr-ed_pdfs/1849/journal_constantinople_1849-04-29_p3.pdf#page=1)
<span data-pdf-page="1" data-pdf-para="1" data-pdf-src="https://bahai-library.com/pdf/journal-de-constantinople/ocr-ed_pdfs/1849/journal_constantinople_1849-04-29_p3.pdf#page=1"></span>

First paragraph of page 1 — opening text from the OCR scan.

[↗ p.1](https://bahai-library.com/pdf/journal-de-constantinople/ocr-ed_pdfs/1849/journal_constantinople_1849-04-29_p3.pdf#page=1)
<span data-pdf-page="1" data-pdf-para="2" data-pdf-src="https://bahai-library.com/pdf/journal-de-constantinople/ocr-ed_pdfs/1849/journal_constantinople_1849-04-29_p3.pdf#page=1"></span>

Second paragraph of page 1 — continued narrative.

[↗ p.2](https://bahai-library.com/pdf/journal-de-constantinople/ocr-ed_pdfs/1849/journal_constantinople_1849-04-29_p3.pdf#page=2)
<span data-pdf-page="2" data-pdf-para="1" data-pdf-src="https://bahai-library.com/pdf/journal-de-constantinople/ocr-ed_pdfs/1849/journal_constantinople_1849-04-29_p3.pdf#page=2"></span>

First paragraph of page 2.
`;

const OCEANOFLIGHTS_INDEX = `---
source_url: https://oceanoflights.org/baha-u-llah-the-kitab-i-aqdas
title: The Kitáb-i-Aqdas — The Most Holy Book
authors:
  - name: Bahá'u'lláh
mime_type: text/html
domain: oceanoflights.org
---
The Kitáb-i-Aqdas is the central book of the Bahá'í Faith.

It establishes the laws and ordinances revealed by Bahá'u'lláh.
`;

const BAHAITEACHINGS_OPINION = `---
source_url: https://bahaiteachings.org/article-slug
title: Why I Believe in Unity
authors:
  - name: Some Author Name
mime_type: text/html
domain: bahaiteachings.org
---
The first paragraph of an opinion essay.

A second paragraph reflecting on personal experience.

The conclusion paragraph.
`;

const NO_FRONTMATTER = `Just some markdown
without frontmatter.

Should error or skip gracefully.
`;

// ---------------------------------------------------------------------------
// HTML-derived (bahai-library.com)
// ---------------------------------------------------------------------------

describe('site2rag adapter — HTML-derived', () => {
  it('parses frontmatter into docFields', async () => {
    const result = await parseDoc(
      'esslemont_bahaullah_new_era.md',
      HTML_DERIVED_BAHAI_LIBRARY,
      { siteConfig: { id: 'bahai-library.com' } }
    );
    expect(result.docFields.title).toBe("Three Baha'i Voices");
    expect(result.docFields.source_url).toBe('https://bahai-library.com/1861');
    expect(result.docFields.source_site).toBe('bahai-library.com');
    expect(result.docFields.file_path).toBe('esslemont_bahaullah_new_era.md');
  });

  it('extracts author from filename when frontmatter has no authors field', async () => {
    const result = await parseDoc(
      'esslemont_bahaullah_new_era.md',
      HTML_DERIVED_BAHAI_LIBRARY,
      { siteConfig: { id: 'bahai-library.com' } }
    );
    expect(result.docFields.author).toBe('esslemont');
  });

  it('produces paragraphs with sequential indices and external_para_id', async () => {
    const result = await parseDoc(
      'doc.md',
      HTML_DERIVED_BAHAI_LIBRARY,
      { siteConfig: { id: 'bahai-library.com' } }
    );
    expect(result.paragraphs.length).toBeGreaterThanOrEqual(3);
    expect(result.paragraphs[0].paragraph_index).toBe(0);
    expect(result.paragraphs[1].paragraph_index).toBe(1);
    // Synthetic external_para_id since HTML doesn't have data-pdf-para
    expect(result.paragraphs[0].external_para_id).toBeTruthy();
  });

  it('does NOT set pdf_page for HTML-derived paragraphs', async () => {
    const result = await parseDoc(
      'doc.md',
      HTML_DERIVED_BAHAI_LIBRARY,
      { siteConfig: { id: 'bahai-library.com' } }
    );
    for (const p of result.paragraphs) {
      expect(p.pdf_page).toBeNull();
    }
  });

  it('skips footnote definitions ([^N]: ...)', async () => {
    const result = await parseDoc(
      'doc.md',
      HTML_DERIVED_BAHAI_LIBRARY,
      { siteConfig: { id: 'bahai-library.com' } }
    );
    for (const p of result.paragraphs) {
      expect(p.text).not.toMatch(/^\[\^\d+\]:/);
    }
  });

  it('preserves inline footnote markers in body text (different from definitions)', async () => {
    const result = await parseDoc(
      'doc.md',
      HTML_DERIVED_BAHAI_LIBRARY,
      { siteConfig: { id: 'bahai-library.com' } }
    );
    // Third paragraph has inline `[^1]` reference — that should remain in text.
    const withCitation = result.paragraphs.find(p => p.text.includes('citation'));
    expect(withCitation).toBeDefined();
    expect(withCitation.text).toContain('[^1]');
  });
});

// ---------------------------------------------------------------------------
// PDF-derived (bahai-library.com PDFs)
// ---------------------------------------------------------------------------

describe('site2rag adapter — PDF-derived', () => {
  it('extracts pdf_page from <span data-pdf-page> markers', async () => {
    const result = await parseDoc(
      'journal.md',
      PDF_DERIVED_BAHAI_LIBRARY,
      { siteConfig: { id: 'bahai-library.com' } }
    );
    expect(result.paragraphs.length).toBe(3);
    expect(result.paragraphs[0].pdf_page).toBe(1);
    expect(result.paragraphs[1].pdf_page).toBe(1);
    expect(result.paragraphs[2].pdf_page).toBe(2);
  });

  it('extracts external_para_id from data-pdf-para attribute', async () => {
    const result = await parseDoc(
      'journal.md',
      PDF_DERIVED_BAHAI_LIBRARY,
      { siteConfig: { id: 'bahai-library.com' } }
    );
    // Composite ID so the same para number on different pages stays unique
    expect(result.paragraphs[0].external_para_id).toBe('p1.1');
    expect(result.paragraphs[1].external_para_id).toBe('p1.2');
    expect(result.paragraphs[2].external_para_id).toBe('p2.1');
  });

  it('strips the visible "[↗ p.N](url#page=N)" link from paragraph text', async () => {
    const result = await parseDoc(
      'journal.md',
      PDF_DERIVED_BAHAI_LIBRARY,
      { siteConfig: { id: 'bahai-library.com' } }
    );
    for (const p of result.paragraphs) {
      expect(p.text).not.toMatch(/\[↗ p\.\d+\]/);
    }
  });

  it('strips the <span> markers themselves from paragraph text', async () => {
    const result = await parseDoc(
      'journal.md',
      PDF_DERIVED_BAHAI_LIBRARY,
      { siteConfig: { id: 'bahai-library.com' } }
    );
    for (const p of result.paragraphs) {
      expect(p.text).not.toMatch(/<span data-pdf-/);
    }
  });

  it('preserves the actual paragraph prose', async () => {
    const result = await parseDoc(
      'journal.md',
      PDF_DERIVED_BAHAI_LIBRARY,
      { siteConfig: { id: 'bahai-library.com' } }
    );
    expect(result.paragraphs[0].text).toContain('opening text');
    expect(result.paragraphs[2].text).toContain('First paragraph of page 2');
  });
});

// ---------------------------------------------------------------------------
// oceanoflights — structured authors metadata
// ---------------------------------------------------------------------------

describe('site2rag adapter — oceanoflights authors array', () => {
  it("uses authors[0].name when frontmatter has structured authors", async () => {
    const result = await parseDoc(
      'aqdas-index.md',
      OCEANOFLIGHTS_INDEX,
      { siteConfig: { id: 'oceanoflights.org' } }
    );
    expect(result.docFields.author).toBe("Bahá'u'lláh");
  });

  it('still sets source_site from siteConfig.id', async () => {
    const result = await parseDoc(
      'aqdas-index.md',
      OCEANOFLIGHTS_INDEX,
      { siteConfig: { id: 'oceanoflights.org' } }
    );
    expect(result.docFields.source_site).toBe('oceanoflights.org');
  });
});

// ---------------------------------------------------------------------------
// bahaiteachings — opinion essay (site-only scope test)
// ---------------------------------------------------------------------------

describe('site2rag adapter — bahaiteachings opinion essay', () => {
  it('parses opinion essay normally regardless of scope', async () => {
    const result = await parseDoc(
      'unity-essay.md',
      BAHAITEACHINGS_OPINION,
      { siteConfig: { id: 'bahaiteachings.org' } }
    );
    expect(result.paragraphs.length).toBe(3);
    expect(result.docFields.title).toBe('Why I Believe in Unity');
    expect(result.docFields.source_site).toBe('bahaiteachings.org');
    // Author in frontmatter authors array
    expect(result.docFields.author).toBe('Some Author Name');
  });
});

// ---------------------------------------------------------------------------
// Edge cases + supersession contract
// ---------------------------------------------------------------------------

describe('site2rag adapter — edge cases', () => {
  it('throws on missing frontmatter', async () => {
    await expect(
      parseDoc('bad.md', NO_FRONTMATTER, { siteConfig: { id: 'bahai-library.com' } })
    ).rejects.toThrow(/frontmatter/i);
  });

  it('returns empty paragraphs when body is whitespace only', async () => {
    const onlyFrontmatter = `---
source_url: https://example.com/empty
title: Empty
mime_type: text/html
---
`;
    const result = await parseDoc(
      'empty.md',
      onlyFrontmatter,
      { siteConfig: { id: 'bahai-library.com' } }
    );
    expect(result.paragraphs).toEqual([]);
  });

  it('uses URL-decoded filename for author extraction', async () => {
    const result = await parseDoc(
      'file-Writing-Will-Testament-Reach%20Dept.md',
      HTML_DERIVED_BAHAI_LIBRARY,
      { siteConfig: { id: 'bahai-library.com' } }
    );
    // The filename-based author is best-effort; should not contain URL
    // encoding artifacts. For this filename pattern, the prefix is `file`.
    expect(result.docFields.author).not.toContain('%20');
  });
});

describe('site2rag adapter — detectSupersedee', () => {
  it('always returns supersedes:null in v1 (supplementals never replace primary)', () => {
    const result = detectSupersedee(
      { title: 'Some Doc', author: 'Some Author' },
      [],
      [],
      { threshold: 0.8 }
    );
    expect(result.supersedes).toBeNull();
  });

  it('does not crash with empty candidates', () => {
    const result = detectSupersedee({}, [], [], {});
    expect(result.supersedes).toBeNull();
  });
});
