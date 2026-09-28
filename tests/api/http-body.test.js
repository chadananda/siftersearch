// A multi-byte letter split across two chunks must decode whole (the single writer used `body += chunk`).
import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { readUtf8Body } from '../../api/lib/http-body.js';

describe('readUtf8Body', () => {
  it('keeps an Arabic letter whole when a chunk boundary falls inside it', async () => {
    const bytes = Buffer.from('{"t":"عبارات متشعشعات"}', 'utf8');
    const cut = bytes.indexOf(Buffer.from('م', 'utf8')) + 1;          // between the two bytes of م
    const s = new PassThrough();
    const p = readUtf8Body(s);
    s.write(bytes.subarray(0, cut)); s.end(bytes.subarray(cut));
    expect(JSON.parse(await p).t).toBe('عبارات متشعشعات');
  });
  it('shows what per-chunk decoding did', () => {
    const bytes = Buffer.from('م', 'utf8');
    expect(`${bytes.subarray(0, 1)}${bytes.subarray(1)}`).toBe('��');
  });
});
