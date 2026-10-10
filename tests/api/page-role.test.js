import { describe, it, expect } from 'vitest';
import { pageRoleState, plainText, QUESTIONS, ROLES, parseRole, TASK } from '../../api/lib/library/page-role.js';

describe('page-role', () => {
  it('state: title, file, length and the beginning — frontmatter stripped; the end only for long pages', () => {
    const s = pageRoleState({ title: 'Tag: Albert Reimholtz', file: 'tags-albert_reimholtz.md', site: 'bahai-library.com', paragraphs: 3 },
      '---\ntitle: x\nsource_url: y\n---\nBrowse documents tagged "Albert Reimholtz": 1. ... 2. ...');
    expect(s).toMatch(/^SITE: bahai-library\.com\nTITLE: Tag: Albert Reimholtz\nFILE: tags-albert_reimholtz\.md\nLENGTH: \d+ characters of text, 3 stored paragraphs\nBEGINNING:\nBrowse documents/);
    expect(s).not.toMatch(/source_url/);
    expect(s).not.toMatch(/END:/);
    const long = pageRoleState({ title: 'A paper' }, 'x '.repeat(2000) + 'THE LAST WORDS');
    expect(long).toMatch(/END:\n.*THE LAST WORDS/);
  });
  it('plainText drops site chrome so the window shows the page, not the logo table', () => {
    const chrome = '[![Bahai Library Online](../_assets/x.png)<!-- src: logo -->](https://bahai-library.com) <table><tr><td>'
      + '<a href="https://bahai-library.com/tags">TAGS</a>&nbsp;</td></tr></table> **Abstract:** A study of [the Íqán](http://x/y).';
    expect(plainText(chrome)).toBe('TAGS Abstract: A study of the Íqán.');
  });
  it('one choice question over the three roles; parse keeps only known roles', () => {
    expect(TASK).toBe('page-role');
    expect(Object.keys(QUESTIONS.role.criteria)).toEqual(['document', 'metadata', 'navigation']);
    expect(Object.keys(ROLES)).toHaveLength(3);
    expect(parseRole({ role: { choice: 'metadata', confidence: 0.91 } })).toEqual({ role: 'metadata', confidence: 0.91 });
    expect(parseRole({ role: { choice: 'something else' } })).toBeNull();
    expect(parseRole(null)).toBeNull();
  });
});
