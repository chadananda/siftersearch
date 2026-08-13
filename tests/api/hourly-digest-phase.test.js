// The hourly email must report whichever job the box is actually doing — ingestion during peak (grounding
// paused for off-peak pricing), entity/grounding progress off-peak. These lock the phase split and the
// "stay quiet when nothing happened" rule, so an hourly digest never becomes noise the reader ignores.
import { describe, it, expect, vi } from 'vitest';
import { nowInPeak, peakEndsAt, DEFAULT_PEAK_WINDOWS } from '../../api/lib/pipeline/peak.js';

vi.mock('../../api/lib/db.js', () => ({ queryAll: async () => [], queryOne: async () => ({ n: 0 }) }));
vi.mock('../../api/lib/logger.js', () => ({ logger: { info() {}, warn() {} } }));
vi.mock('../../api/services/email.js', () => ({ sendEmail: async () => ({ ok: true }) }));

const { buildIngestDigest, renderIngestDigestText, renderIngestDigestHtml, sendIngestDigest } =
  await import('../../api/lib/pipeline/ingest-digest.js');

// DeepSeek's discount window is 16:30–00:30 UTC, so PEAK (full price, grounding paused) is 00:30–16:30.
const at = (h, m = 0) => new Date(Date.UTC(2026, 7, 13, h, m));

describe('peak window — which job owns the hour', () => {
  it('treats DeepSeek full-price hours as peak, when ingestion should run', () => {
    expect(nowInPeak(DEFAULT_PEAK_WINDOWS, at(9, 0))).toBe(true);    // 09:00 UTC = full price
    expect(nowInPeak(DEFAULT_PEAK_WINDOWS, at(1, 0))).toBe(true);
  });
  it('treats the discount window as off-peak, when grounding runs instead', () => {
    expect(nowInPeak(DEFAULT_PEAK_WINDOWS, at(17, 0))).toBe(false);  // 16:30–00:30 UTC discount
    expect(nowInPeak(DEFAULT_PEAK_WINDOWS, at(23, 30))).toBe(false);
  });
  it('reports when the current peak ends, so a paused pipeline never reads as stuck', () => {
    const ends = peakEndsAt(DEFAULT_PEAK_WINDOWS, at(9, 0));
    expect(ends.getUTCHours()).toBe(16);
    expect(ends.getUTCMinutes()).toBe(30);
    expect(peakEndsAt(DEFAULT_PEAK_WINDOWS, at(17, 0))).toBeNull();  // not peak → nothing to wait for
  });
});

describe('ingest digest', () => {
  const digest = (over = {}) => ({
    books: [{ id: 1, title: 'A Persian Reformer', author: 'Thompson', paras: 39 }],
    paras: 39, retired: 1, queue: { haveSource: 6522, noSource: 23018 }, ...over,
  });

  it('leads with what landed and what is left to drain', () => {
    const t = renderIngestDigestText(digest());
    expect(t).toContain('1 document');
    expect(t).toContain('A Persian Reformer');
    expect(t).toContain('6,522');           // the queue that shrinks as we import
    expect(t).toMatch(/stub.*retired/i);
  });

  it('says plainly why grounding is idle, so a quiet pipeline is not mistaken for a stall', () => {
    expect(renderIngestDigestText(digest())).toMatch(/off-peak pricing/i);
    expect(renderIngestDigestHtml(digest())).toMatch(/off-peak pricing/i);
  });

  it('handles an empty hour without pretending it had content', () => {
    const t = renderIngestDigestText(digest({ books: [], paras: 0, retired: 0 }));
    expect(t).toContain('nothing new landed');
  });

  it('stays SILENT when nothing was ingested and nothing retired', async () => {
    const r = await sendIngestDigest(0, { queryAll: async () => [], queryOne: async () => ({ n: 0 }) });
    expect(r.sentTo).toBeNull();
    expect(r.count).toBe(0);
  });

  it('sends when a book landed, with the remaining count in the subject', async () => {
    let sent = null;
    await sendIngestDigest(0, {
      to: 'chad@example.com',
      queryAll: async () => [{ id: 7, title: 'The Light in the Lantern', author: 'x', paras: 68 }],
      queryOne: async () => ({ n: 0 }),
      sendEmail: async (m) => { sent = m; },
    });
    expect(sent.subject).toMatch(/1 document/);
    expect(sent.html).toContain('The Light in the Lantern');
  });

  it('survives a missing snapshot — it still reports what landed', async () => {
    const d = await buildIngestDigest(0, {
      queryAll: async () => [{ id: 1, title: 'T', author: 'A', paras: 5 }],
      queryOne: async () => ({ n: 0 }),
    });
    expect(d.books).toHaveLength(1);
    expect(d.queue).toHaveProperty('haveSource');
  });
});
