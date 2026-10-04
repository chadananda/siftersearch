// Scraped-site junk filter: markup-only lines and recurring page chrome are skipped; prose (any script) is kept.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { isMarkupOnly, boilerplateTexts, keepSiteParagraph } from '../../api/lib/site-boilerplate.js';

describe('isMarkupOnly', () => {
  it('flags images, layout tables, separators, lone links and menus (seen in bahai-library.com / bahaiteachings.org)', () => {
    expect(isMarkupOnly('![](../_assets/a7/a7ae.svg+xml)<!-- src: data:image/svg+xml,%3Csvg -->')).toBe(true);
    expect(isMarkupOnly('<table width="400" align="center" style="margin-top:1em">')).toBe(true);
    expect(isMarkupOnly('* * *')).toBe(true);
    expect(isMarkupOnly('[Spirituality](https://bahaiteachings.org/spirituality/)')).toBe(true);
    expect(isMarkupOnly('[![Bahai Library Online](../../images/logo.png)](https://bahai-library.com)')).toBe(true);
    expect(isMarkupOnly('[')).toBe(true);
  });
  it('keeps prose, including short Arabic/Persian invocations and prose that contains a link', () => {
    expect(isMarkupOnly('هو الله')).toBe(false);
    expect(isMarkupOnly('O Son of Being! Thy heart is My home; sanctify it for My descent.')).toBe(false);
    expect(isMarkupOnly('See the [Kitáb-i-Íqán](https://x/iqan) on this point, where He explains the station.')).toBe(false);
  });
});

describe('boilerplateTexts / keepSiteParagraph', () => {
  it('drops text recurring in ≥10 scraped docs, never library text, and keeps the rest', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, scope TEXT, deleted_at TEXT);
             CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, text TEXT, deleted_at TEXT);`);
    for (let d = 1; d <= 12; d++) {
      db.prepare('INSERT INTO docs VALUES (?, ?, NULL)').run(d, d <= 11 ? 'supplemental' : 'primary');
      db.prepare('INSERT INTO content (doc_id, text) VALUES (?, ?)').run(d, 'Log in now to comment!');
      db.prepare('INSERT INTO content (doc_id, text) VALUES (?, ?)').run(d, `Article ${d} has its own sentence about the Covenant.`);
    }
    const bp = boilerplateTexts(db);
    expect(bp.has('Log in now to comment!')).toBe(true);
    expect(keepSiteParagraph('Log in now to comment!', bp)).toBe(false);
    expect(keepSiteParagraph('Article 3 has its own sentence about the Covenant.', bp)).toBe(true);
    expect(boilerplateTexts(db, 12).size).toBe(0);   // only 11 scraped docs carry it; the library doc does not count
  });
});
