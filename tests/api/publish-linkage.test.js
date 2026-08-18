// The BOTH-WAYS link between a private thread and its public dialog.
//
// Both columns existed for months and NEITHER was ever written: published_conversations.conversation_id
// came in with migration 51 and stayed NULL, and nothing set chat_sessions.published_slug. A published
// conversation could not be traced back to the thread it came from, and a thread could not show it had
// been shared. It was fixed in routes/content.js — and then covered by no test at all, which is how it got
// into that state the first time.
//
// The write is deliberately BEST-EFFORT (a linkage failure must not fail a publish that already
// succeeded), so the failure mode is silence. These lock the shape of the pair and, crucially, that a
// failure is COUNTED rather than merely logged.
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { swallowedTotal, resetSwallowed, swallowedCounts } from '../../api/lib/swallow.js';
import { linkThreadToDialog as _link } from '../../api/lib/threads.js';
import { swallow } from '../../api/lib/swallow.js';
// Adapter: the production signature takes tenantId + swallow explicitly (no module-level globals).
const linkThreadToDialog = (query, { slug, conversationId }) =>
  _link(query, { slug, conversationId, tenantId: DIALOG_TENANT, swallow });

const DIALOG_TENANT = 'siftersearch';

// linkThreadToDialog is imported from PRODUCTION (api/lib/threads.js) — this file used to carry its own
// copy of the statement pair, which passes whatever production does and so could never catch drift.


describe('thread ↔ published dialog linkage', () => {
  let db, query;
  beforeEach(() => {
    resetSwallowed();
    db = new Database(':memory:');
    db.exec(`CREATE TABLE chat_sessions (id TEXT PRIMARY KEY, status TEXT, published_slug TEXT);
             CREATE TABLE published_conversations (slug TEXT, tenant_id TEXT, conversation_id TEXT);
             INSERT INTO chat_sessions (id, status) VALUES ('conv_1', 'active');
             INSERT INTO published_conversations (slug, tenant_id) VALUES ('a-shared-talk', 'siftersearch');`);
    query = async (sql, args = []) => db.prepare(sql).run(...args);
  });

  it('closes the link in BOTH directions', async () => {
    const r = await linkThreadToDialog(query, { slug: 'a-shared-talk', conversationId: 'conv_1' });
    expect(r.linked).toBe(true);
    // dialog → thread
    expect(db.prepare(`SELECT conversation_id FROM published_conversations WHERE slug='a-shared-talk'`).get().conversation_id).toBe('conv_1');
    // thread → dialog, and the thread now KNOWS it was shared
    const s = db.prepare(`SELECT published_slug, status FROM chat_sessions WHERE id='conv_1'`).get();
    expect(s.published_slug).toBe('a-shared-talk');
    expect(s.status).toBe('published');
  });

  it('a publish that did NOT come from a thread links nothing and is not an error', async () => {
    const r = await linkThreadToDialog(query, { slug: 'a-shared-talk', conversationId: null });
    expect(r.linked).toBe(false);
    expect(swallowedTotal()).toBe(0);            // not a failure — nothing to link
  });

  it('a linkage failure is COUNTED, not just logged — silence is how this broke before', async () => {
    const failing = async () => { throw new Error('no such table: published_conversations'); };
    const r = await linkThreadToDialog(failing, { slug: 'a-shared-talk', conversationId: 'conv_1' });
    expect(r.linked).toBe(false);                        // the publish itself still stands
    expect(swallowedTotal()).toBe(1);                    // …and the health check can see it
    expect(swallowedCounts()[0].context).toBe('dialog.link-thread-to-slug');
  });

  it('is idempotent — re-publishing the same thread does not corrupt the link', async () => {
    await linkThreadToDialog(query, { slug: 'a-shared-talk', conversationId: 'conv_1' });
    await linkThreadToDialog(query, { slug: 'a-shared-talk', conversationId: 'conv_1' });
    expect(db.prepare(`SELECT COUNT(*) n FROM published_conversations WHERE conversation_id='conv_1'`).get().n).toBe(1);
  });
});
