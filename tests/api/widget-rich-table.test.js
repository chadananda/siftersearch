// Widget pipe tables (Chad 11-11: the side-by-side Arabic/English table showed as raw "|" lines in the widget).
import { describe, it, expect } from 'vitest';
import { tableAt } from '../../src/widget/rich-table.js';

const L = ['Here it is:', '', '| Arabic | English (*Pickthall*) |', '|---|:---:|', '| إِنَّاۤ أَعۡطَیۡنَـٰكَ ٱلۡكَوۡثَرَ | Lo! We have given thee Abundance; |', '| فَصَلِّ | So pray |', '', 'After.'];
const em = (s) => s.replace(/\*([^*]+)\*/g, '<em>$1</em>');

describe('widget tables', () => {
  it('a header + rule + rows → one <table>, cells formatted inline, right-to-left text left to the browser', () => {
    const t = tableAt(L, 2, em);
    expect(t.next).toBe(6);
    expect(t.html).toMatch(/^<div class="rt"><table class="rt-wide"><thead><tr><th dir="auto">Arabic<\/th><th dir="auto">English \(<em>Pickthall<\/em>\)<\/th><\/tr><\/thead><tbody>/);
    expect(t.html.match(/<tr>/g)).toHaveLength(3); expect(t.html.match(/<details>/g)).toHaveLength(2); expect(t.html).toContain('<td dir="auto">So pray</td>');
  });
  it('no rule row → not a table (a line that merely has pipes stays text)', () => {
    expect(tableAt(['| a | b |', '| c | d |'], 0)).toBeNull(); expect(tableAt(L, 0)).toBeNull();
  });
  it('narrow screens: each row folds — "#" numbers it, the linked cell names it, the rest opens', () => {
    const t = tableAt(['| # | Where | Prayer |', '|---|---|---|', '| 1 | Tablet to the Northern States | [O God, my God](https://x.org/a) |'], 0);
    expect(t.html).toContain('<details><summary dir="auto">1. [O God, my God](https://x.org/a)</summary><div dir="auto"><span class="rt-k">Where</span> Tablet to the Northern States</div></details>');
  });
  it('a short row keeps the column count', () => {
    expect(tableAt(['|a|b|', '|--|--|', '|x|'], 0).html).toContain('<td dir="auto">x</td><td dir="auto"></td>');
  });
});
