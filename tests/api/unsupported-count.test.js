// An aside stating a count no passage holds is dropped (11-11 Quddús letter: "the Báb's nineteen chosen disciples").
import { describe, it, expect } from 'vitest';
import { dropUnsupportedCount, formPass } from '../../api/lib/assistant/lint.js';

const nabil = [{ title: 'The Dawn-Breakers', text: 'Quddús was the last of the Letters of the Living to attain His presence; eighteen in number, they were the first to believe.' }];
const reply = "He was only twenty-two years old, yet he became the last of the Letters of the Living—the Báb's nineteen chosen disciples—to complete that designated number.";

describe('dropUnsupportedCount', () => {
  it('drops a dashed aside whose count no passage holds', () => {
    const r = dropUnsupportedCount(reply, [...nabil, { text: 'he was twenty-two years old' }]);
    expect(r.fixed).toBe(1);
    expect(r.text).toBe('He was only twenty-two years old, yet he became the last of the Letters of the Living to complete that designated number.');
  });
  it('keeps an aside whose count a passage holds, as a word or a figure', () => {
    const ok = "the Letters of the Living—the Báb's eighteen first disciples—and";
    expect(dropUnsupportedCount(ok, nabil).fixed).toBe(0);
    expect(dropUnsupportedCount('the Letters (18 disciples) came', nabil).fixed).toBe(0);
  });
  it('never touches citations, quotations, links, block quotes, or a turn with no passage text', () => {
    for (const t of ['as Nabíl records (Chapter 25) it', 'the letter (p. 52) says', 'he wrote (#947) that', 'he said—"seven valleys"—then',
      'see ([*Gate*](https://x.org/a) 3 places) here', '> the Báb’s nineteen chosen disciples—and more—here']) expect(dropUnsupportedCount(t, nabil).fixed).toBe(0);
    expect(dropUnsupportedCount(reply, [{ title: 'x' }]).fixed).toBe(0);
  });
  it('runs in the exit form pass and is counted', () => {
    const r = formPass(reply, { sources: nabil });
    expect(r.repairs.unsupported_count).toBe(1);
    expect(r.text).not.toMatch(/nineteen/);
  });
});
