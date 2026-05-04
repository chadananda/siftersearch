// Search-scope registry tests (Phase E1).
//
// These pin the wall between primary RAG and site-only content:
//   - Default scope (no chatbot_location) excludes site-only entirely.
//   - A site-only chatbot location yields ONLY that site's Meili index
//     (no primary, no other supplementals).
//   - A supplemental chatbot location maps to the default scope (its
//     ranking boost is v2 polish, not exclusion).
//
// If any of these invariants change, the tests must be updated explicitly —
// silent regressions here would leak opinion content into Jafar.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getParagraphIndex,
  getScopeIndexes,
  getDefaultScope,
  getScopeForLocation,
  setSiteRegistry,
  INDEXES,
} from '../../api/lib/search/scope.js';

const SAMPLE_REGISTRY = {
  'oceanlibrary.com': { scope: 'supplemental', meili_index_prefix: 'ol' },
  'bahai-library.com': { scope: 'supplemental', meili_index_prefix: 'balib' },
  'oceanoflights.org': { scope: 'supplemental', meili_index_prefix: 'ool' },
  'bahaiteachings.org': { scope: 'site-only', meili_index_prefix: 'bt' },
};

describe('getParagraphIndex', () => {
  it('returns primary paragraphs when no prefix', () => {
    expect(getParagraphIndex()).toBe(INDEXES.PARAGRAPHS);
    expect(getParagraphIndex(null)).toBe(INDEXES.PARAGRAPHS);
  });

  it('returns siftersearch_<prefix>_paragraphs for a site prefix', () => {
    expect(getParagraphIndex('balib')).toBe('siftersearch_balib_paragraphs');
    expect(getParagraphIndex('bt')).toBe('siftersearch_bt_paragraphs');
  });
});

describe('getScopeIndexes', () => {
  it('returns just primary when scope = { primary: true, sites: [] }', () => {
    expect(getScopeIndexes({ primary: true, sites: [] })).toEqual([INDEXES.PARAGRAPHS]);
  });

  it('returns just sites when scope.primary is false', () => {
    expect(getScopeIndexes({ primary: false, sites: ['bt'] }))
      .toEqual(['siftersearch_bt_paragraphs']);
  });

  it('returns primary + sites in order when both', () => {
    expect(getScopeIndexes({ primary: true, sites: ['balib', 'ool'] })).toEqual([
      INDEXES.PARAGRAPHS,
      'siftersearch_balib_paragraphs',
      'siftersearch_ool_paragraphs',
    ]);
  });

  it('default arg = { primary: true, sites: [] }', () => {
    expect(getScopeIndexes()).toEqual([INDEXES.PARAGRAPHS]);
  });
});

describe('default + chatbot-location scopes', () => {
  beforeEach(() => {
    setSiteRegistry(SAMPLE_REGISTRY);
  });

  it('default scope = primary + ALL supplementals (excludes site-only)', () => {
    const scope = getDefaultScope();
    expect(scope.primary).toBe(true);
    expect(scope.sites.sort()).toEqual(['balib', 'ol', 'ool']);
    // bt (site-only) is NOT in the default scope.
    expect(scope.sites).not.toContain('bt');
  });

  it('scope for null/unknown location = default scope', () => {
    expect(getScopeForLocation(null)).toEqual(getDefaultScope());
    expect(getScopeForLocation('unknown.com')).toEqual(getDefaultScope());
  });

  it('scope for a site-only location = ONLY that site, no primary, no other supplementals', () => {
    const scope = getScopeForLocation('bahaiteachings.org');
    expect(scope).toEqual({ primary: false, sites: ['bt'] });
  });

  it('scope for a supplemental location = default scope (ranking boost is v2 polish)', () => {
    const scope = getScopeForLocation('bahai-library.com');
    expect(scope).toEqual(getDefaultScope());
  });

  it('CRITICAL: site-only sites NEVER appear in default scope, even after registry refresh', () => {
    // Adversarial — try to slip a site-only into default scope by reordering
    // or capitalizing. The scope must filter strictly on `scope === 'supplemental'`.
    setSiteRegistry({
      'evil.example': { scope: 'site-only', meili_index_prefix: 'evil' },
      'good.example': { scope: 'supplemental', meili_index_prefix: 'good' },
    });
    const scope = getDefaultScope();
    expect(scope.sites).toContain('good');
    expect(scope.sites).not.toContain('evil');
  });

  it('with empty registry, default scope is just primary', () => {
    setSiteRegistry({});
    expect(getDefaultScope()).toEqual({ primary: true, sites: [] });
  });
});

describe('getScopeIndexes integration with location resolution', () => {
  beforeEach(() => setSiteRegistry(SAMPLE_REGISTRY));

  it('end-to-end: default location → primary + 3 supplemental indexes', () => {
    const indexes = getScopeIndexes(getScopeForLocation(null));
    expect(indexes).toContain(INDEXES.PARAGRAPHS);
    expect(indexes).toContain('siftersearch_balib_paragraphs');
    expect(indexes).toContain('siftersearch_ool_paragraphs');
    expect(indexes).toContain('siftersearch_ol_paragraphs');
    expect(indexes).not.toContain('siftersearch_bt_paragraphs');
  });

  it('end-to-end: bahaiteachings.org chatbot → ONLY siftersearch_bt_paragraphs', () => {
    const indexes = getScopeIndexes(getScopeForLocation('bahaiteachings.org'));
    expect(indexes).toEqual(['siftersearch_bt_paragraphs']);
  });
});
