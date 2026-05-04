// Sites.yaml schema tests.
//
// Verifies the example registry parses correctly and that withDefaults applies
// sensible fallbacks. The actual operational sites.yaml on tower-nas is loaded
// at runtime; tests here pin down the SHAPE so a malformed entry doesn't
// silently produce wrong scope/authority.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'yaml';
import { _normalizeSiteConfig as normalize } from '../../api/services/sites-ingester.js';

let example;

beforeAll(async () => {
  const raw = await readFile(path.resolve('config/sites.example.yaml'), 'utf-8');
  example = yaml.parse(raw).sites;
});

describe('sites.example.yaml — parsing + required fields', () => {
  it('parses without error', () => {
    expect(example).toBeDefined();
    expect(Object.keys(example).length).toBeGreaterThan(0);
  });

  it('every site declares an adapter', () => {
    for (const [id, cfg] of Object.entries(example)) {
      expect(cfg.adapter, `${id} missing adapter`).toBeTruthy();
    }
  });

  it('every site declares a scope from the allowed enum', () => {
    const allowed = new Set(['primary', 'supplemental', 'site-only']);
    for (const [id, cfg] of Object.entries(example)) {
      expect(allowed.has(cfg.scope), `${id} has invalid scope: ${cfg.scope}`).toBe(true);
    }
  });

  it('every site declares a meili_index_prefix', () => {
    for (const [id, cfg] of Object.entries(example)) {
      expect(cfg.meili_index_prefix, `${id} missing meili_index_prefix`).toBeTruthy();
      expect(cfg.meili_index_prefix).toMatch(/^[a-z][a-z0-9]*$/);
    }
  });

  it('every site declares a hype_policy from the allowed enum', () => {
    const allowed = new Set(['never', 'central-figures', 'auto']);
    for (const [id, cfg] of Object.entries(example)) {
      expect(allowed.has(cfg.hype_policy), `${id} has invalid hype_policy: ${cfg.hype_policy}`).toBe(true);
    }
  });

  it('all v1 target sites are present with the locked classifications', () => {
    expect(example['bahai-library.com']).toBeDefined();
    expect(example['bahai-library.com'].scope).toBe('supplemental');
    expect(example['bahai-library.com'].hype_policy).toBe('never');

    expect(example['oceanoflights.org']).toBeDefined();
    expect(example['oceanoflights.org'].scope).toBe('supplemental');
    expect(example['oceanoflights.org'].hype_policy).toBe('never');

    // Hard rule: bahaiteachings.org MUST be site-only.
    expect(example['bahaiteachings.org']).toBeDefined();
    expect(example['bahaiteachings.org'].scope).toBe('site-only');
  });
});

describe('sites-ingester withDefaults', () => {
  it('applies safe defaults to a sparse config', () => {
    const cfg = normalize('newsite.com', { adapter: 'site2rag' });
    expect(cfg.scope).toBe('supplemental');
    expect(cfg.authority_default).toBe(5);
    expect(cfg.hype_policy).toBe('never');
    expect(cfg.encumbered).toBe(false);
    expect(cfg.cadence_minutes).toBe(360);
    expect(cfg.meili_index_prefix).toBeTruthy();
  });

  it('preserves explicit fields without overriding', () => {
    const cfg = normalize('bahaiteachings.org', {
      adapter: 'site2rag',
      scope: 'site-only',
      authority_default: 0,
      meili_index_prefix: 'bt',
      hype_policy: 'never'
    });
    expect(cfg.scope).toBe('site-only');
    expect(cfg.authority_default).toBe(0);
    expect(cfg.meili_index_prefix).toBe('bt');
  });

  it('derives meili_index_prefix from siteId when absent', () => {
    const cfg = normalize('foo.org', { adapter: 'site2rag' });
    expect(cfg.meili_index_prefix).toBe('foo');
  });

  it('always sets id to the siteId argument', () => {
    const cfg = normalize('example.com', {});
    expect(cfg.id).toBe('example.com');
  });

  it('preserves site_root when set (for crawler trees outside the library)', () => {
    const cfg = normalize('bahai-library.com', {
      adapter: 'site2rag',
      site_root: '/tank/site2rag/websites_md/bahai-library.com',
    });
    expect(cfg.site_root).toBe('/tank/site2rag/websites_md/bahai-library.com');
  });

  it('site_root defaults to null when absent (uses <library>/-sites/<id> convention)', () => {
    const cfg = normalize('oceanlibrary.com', { adapter: 'oceanlibrary' });
    expect(cfg.site_root).toBeNull();
  });
});

describe('sites.example.yaml — site_root convention', () => {
  it('all crawler-derived sites set site_root to /tank/site2rag/websites_md/<id>', () => {
    expect(example['bahai-library.com'].site_root).toBe('/tank/site2rag/websites_md/bahai-library.com');
    expect(example['oceanoflights.org'].site_root).toBe('/tank/site2rag/websites_md/oceanoflights.org');
    expect(example['bahaiteachings.org'].site_root).toBe('/tank/site2rag/websites_md/bahaiteachings.org');
  });

  it('oceanlibrary.com (in-library convention) does NOT set site_root', () => {
    expect(example['oceanlibrary.com'].site_root).toBeUndefined();
  });
});
