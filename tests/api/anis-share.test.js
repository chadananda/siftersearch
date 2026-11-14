// Shared Anís discussions (worker/anis/share.js + routes in worker/anis/index.js + forwards in worker/index.js): the deterministic
// scrub, the Haiku redactions, slugs, the draft → publish → read → unpublish routes (D1 = better-sqlite3 fake), the public page.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import worker, { shareRoute } from '../../worker/anis/index.js';
import { scrub, cleanUrl, normTurns, parseSanitize, applyRedactions, slugFor, titleFrom, sanitize, sanitizeMessages, discussionPage, discussionLd,
  notFoundPage, DISCUSSION_PATH, SLUG } from '../../worker/anis/share.js';
import { SHORT_PATH } from '../../worker/short-links.js';

const mkEnv = () => {
  const db = new Database(':memory:'); db.exec(readFileSync('worker/d1/anis/0018_anis_shared.sql', 'utf8'));
  const stmt = (sql, a = []) => ({ run: async () => db.prepare(sql).run(...a), first: async () => db.prepare(sql).get(...a) ?? null, all: async () => ({ results: db.prepare(sql).all(...a) }) });
  return { db, TOWER_URL: 'https://tower.test', TOWER_KEY: 'k', ANIS_DB: { prepare: (sql) => ({ ...stmt(sql), bind: (...a) => stmt(sql, a) }) } };
};
const TURNS = [
  { role: 'assistant', content: 'Hello — what would you like to look into?' },
  { role: 'user', content: 'My wife Sarah Jenkins and I live at 42 Maple Street. What does Bahá\'u\'lláh say about marriage? Email me at sj@example.com' },
  { role: 'assistant', content: '## Marriage\n\nBahá\'u\'lláh calls marriage "a fortress for well-being" — see [the Kitáb-i-Aqdas](https://oceanlibrary.com/aqdas?para=65).\n\n> Enter ye into wedlock\n\nSarah, I hope this helps.' },
];
const MODEL_JSON = JSON.stringify({ title: 'What Bahá\'u\'lláh says about marriage', summary: 'Passages on marriage as a fortress for well-being.',
  redactions: [{ turn: 1, find: 'Sarah Jenkins', replace: '[my spouse]' }, { turn: 2, find: 'Sarah', replace: '[a family member]' }, { turn: 1, find: 'x', replace: '[y]' }] });
const fakeCreate = (text = MODEL_JSON, seen = []) => async (p) => { seen.push(p); return { choices: [{ message: { content: text } }], usage: { prompt_tokens: 900, completion_tokens: 120 } }; };
const req = (path, method = 'GET', body) => new Request(`https://anis.test${path}`, { method, headers: { origin: 'https://anis.oceanlibrary.com', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const ctx = () => { const p = []; return { p, waitUntil: (x) => p.push(x) }; };

describe('scrub (deterministic)', () => {
  it('masks emails, phone numbers and street addresses', () => {
    expect(scrub('write to jo.smith+x@mail.co.uk today')).toBe('write to [email] today');
    expect(scrub('call (555) 123-4567 or +44 20 7946 0958 or 555.123.4567')).toBe('call [phone] or [phone] or [phone]');
    expect(scrub('we live at 42 Maple Street, Apt 3B now')).toBe('we live at [address] now');
    expect(scrub('1600 Pennsylvania Ave.')).toBe('[address]');
  });
  it('leaves dates, years, page and paragraph references, verse numbers alone', () => {
    for (const s of ['He lived 1817–1892.', 'Written in 1863-1868', 'See page 123, para 45.', 'Qur\'án 2:256', 'p. 112-113', 'the 19 Day Feast', 'Gleanings CXXXII, 2 pages']) expect(scrub(s)).toBe(s);
  });
  it('keeps URLs (never read as phones) but drops secret query parameters', () => {
    expect(scrub('see https://oceanlibrary.com/doc/12345-678-9012?para=3')).toBe('see https://oceanlibrary.com/doc/12345-678-9012?para=3');
    expect(cleanUrl('https://x.test/a?token=abc&para=2&sig=zz')).toBe('https://x.test/a?para=2');
    expect(cleanUrl('https://x.test/a?access_token=abc')).toBe('https://x.test/a');
    expect(scrub('link https://s3.test/f?X-Amz-Signature=q&X-Amz-Credential=c ok')).toBe('link https://s3.test/f ok');
    expect(cleanUrl('not a url')).toBe('not a url');
  });
});

describe('normTurns', () => {
  it('drops the greeting before the first question and empty turns; needs an answer', () => {
    expect(normTurns(TURNS).turns.map((t) => t.role)).toEqual(['user', 'assistant']);
    expect(normTurns([{ role: 'user', content: 'q' }]).error).toMatch(/nothing/);
    expect(normTurns('x').error).toBeTruthy();
  });
  it('limits turns and length', () => {
    expect(normTurns(Array.from({ length: 42 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x' }))).error).toMatch(/at most/);
    expect(normTurns([{ role: 'user', content: 'q' }, { role: 'assistant', content: 'x'.repeat(30001) }]).error).toMatch(/too long/);
  });
});

describe('the Haiku pass', () => {
  it('numbers every turn in full for the model', () => {
    const m = sanitizeMessages([{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }]);
    expect(m[0].role).toBe('system');
    expect(m[1].content).toBe('[0] Reader:\nq\n\n[1] Anís:\na');
  });
  it('parseSanitize: JSON (fenced or not) → title, summary, redactions; junk → null; odd replacements neutralised', () => {
    const p = parseSanitize('```json\n' + JSON.stringify({ title: ' T ', summary: 'S', redactions: [{ find: 'Bob', replace: 'Robert' }, { find: 'a' }, { find: 'Ann', replace: '[a friend]' }] }) + '\n```');
    expect(p).toEqual({ title: 'T', summary: 'S', redactions: [{ find: 'Bob', replace: '[removed]' }, { find: 'Ann', replace: '[a friend]' }] });
    expect(parseSanitize('no json')).toBeNull();
    expect(parseSanitize('{bad')).toBeNull();
  });
  it('applyRedactions: every turn, every occurrence, longest first', () => {
    const out = applyRedactions([{ role: 'user', content: 'Sarah Jenkins and Sarah' }, { role: 'assistant', content: 'Dear Sarah' }],
      [{ find: 'Sarah', replace: '[a]' }, { find: 'Sarah Jenkins', replace: '[b]' }]);
    expect(out.map((t) => t.content)).toEqual(['[b] and [a]', 'Dear [a]']);
  });
  it('sanitize = scrub, then redactions, title and summary; a model failure throws', async () => {
    const s = await sanitize(normTurns(TURNS).turns, async () => MODEL_JSON);
    const all = s.turns.map((t) => t.content).join('\n');
    expect(all).not.toMatch(/Sarah|Jenkins|Maple|sj@example/);
    expect(all).toContain('[my spouse]'); expect(all).toContain('[address]'); expect(all).toContain('[email]');
    expect(all).toContain('https://oceanlibrary.com/aqdas?para=65');
    expect(s.title).toBe('What Bahá\'u\'lláh says about marriage');
    await expect(sanitize(normTurns(TURNS).turns, async () => 'sorry')).rejects.toThrow();
  });
});

describe('slugs', () => {
  it('slugFor: readable, accent-folded, ≤ 48 + code, always hyphenated (never a short-link code)', () => {
    expect(slugFor('What Bahá\'u\'lláh says about marriage', 'abcd1234')).toBe('what-bahaullah-says-about-marriage-abcd1234');
    expect(slugFor('', 'abcd1234')).toBe('discussion-abcd1234');
    const long = slugFor('a very long title that goes on and on and on about the covenant forever', 'zzzzzzzz');
    expect(long.length).toBeLessThanOrEqual(57);
    for (const s of [long, slugFor('x', 'abcdefgh'), slugFor('Ἀγάπη', '12345678')]) {
      expect(SLUG.test(s)).toBe(true);
      expect(SHORT_PATH.test(`/d/${s}`)).toBe(false);
      expect(DISCUSSION_PATH.exec(`/d/${s}`)[1]).toBe(s);
    }
    expect(DISCUSSION_PATH.test('/d/AbC123xy')).toBe(false);   // a PDF short link stays a short link
  });
  it('titleFrom cuts at a word boundary', () => {
    expect(titleFrom('short question?')).toBe('short question?');
    const t = titleFrom('word '.repeat(40));
    expect(t.length).toBeLessThanOrEqual(70); expect(t.endsWith('…')).toBe(true);
  });
});

describe('share routes', () => {
  it('preview → draft (not public) → publish → GET JSON + page → unpublish (owner key only)', async () => {
    const env = mkEnv(), seen = [], fetched = [], c = ctx();
    const fetch = async (u, o) => { fetched.push([u, JSON.parse(o.body)]); return new Response('{"out":true}'); };
    let res = await shareRoute(req('/api/chat/share', 'POST', { turns: TURNS, scope: 'conversation', conversation_id: 't-1' }), env, c, { create: fakeCreate(MODEL_JSON, seen), fetch });
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.slug).toMatch(/^what-bahaullah-says-about-marriage-[a-z0-9]{8}$/);
    expect(d.url).toBe(`https://anis.oceanlibrary.com/d/${d.slug}`);
    expect(d.owner_key).toMatch(/^[a-z0-9]{32}$/);
    expect(JSON.stringify(d.turns)).not.toMatch(/Sarah|Maple|sj@/);
    expect(seen[0].thinking).toBe(false);
    expect(seen[0].messages[1].content).not.toContain('sj@example.com');   // the model sees the scrubbed text
    await Promise.all(c.p);
    expect(fetched[0][0]).toBe('https://tower.test/api/v1/anis/tool/logUsage');   // the paid call reaches the ledger
    expect(fetched[0][1].args[0][0]).toMatchObject({ caller: 'anis-share-edge', prompt_tokens: 900, completion_tokens: 120 });
    const row = env.db.prepare('SELECT * FROM anis_shared').get();
    expect(row).toMatchObject({ status: 'draft', scope: 'conversation', source_conversation: 't-1', site: 'anis.oceanlibrary.com' });
    expect(row.owner_hash).not.toBe(d.owner_key);
    expect(row.turns).not.toMatch(/Sarah|Maple|sj@/);

    // a draft is never served
    expect((await worker.fetch(req(`/d/${d.slug}`), env, ctx())).status).toBe(404);
    expect((await worker.fetch(req(`/api/chat/share/${d.slug}`), env, ctx())).status).toBe(404);

    // publish: wrong key refused; the reader's title is scrubbed
    expect((await worker.fetch(req('/api/chat/share/publish', 'POST', { slug: d.slug, owner_key: 'nope', title: 'x' }), env, ctx())).status).toBe(404);
    res = await worker.fetch(req('/api/chat/share/publish', 'POST', { slug: d.slug, owner_key: d.owner_key, title: 'Marriage — ask me at me@x.org' }), env, ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, url: d.url, title: 'Marriage — ask me at [email]' });

    res = await worker.fetch(req(`/api/chat/share/${d.slug}`), env, ctx());
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j).toMatchObject({ slug: d.slug, title: 'Marriage — ask me at [email]', scope: 'conversation' });
    expect(j.turns).toHaveLength(2);
    expect(j.owner_hash).toBeUndefined();

    res = await worker.fetch(req(`/d/${d.slug}`), env, ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(res.headers.get('cache-control')).toMatch(/max-age=300/);
    expect(await res.text()).toContain('<h1>Marriage — ask me at [email]</h1>');

    // unpublish: wrong key refused, the owner's key deletes the row
    expect((await worker.fetch(req(`/api/chat/share/${d.slug}`, 'DELETE', { owner_key: 'nope' }), env, ctx())).status).toBe(404);
    expect((await worker.fetch(req(`/api/chat/share/${d.slug}`, 'DELETE', { owner_key: d.owner_key }), env, ctx())).status).toBe(200);
    expect(env.db.prepare('SELECT count(*) n FROM anis_shared').get().n).toBe(0);
    expect((await worker.fetch(req(`/d/${d.slug}`), env, ctx())).status).toBe(404);
  });
  it('a model failure → 503 and nothing stored; a bad body → 400; old drafts are pruned', async () => {
    const env = mkEnv(), fetch = async () => new Response('{}');
    let res = await shareRoute(req('/api/chat/share', 'POST', { turns: TURNS }), env, ctx(), { create: fakeCreate('I cannot'), fetch });
    expect(res.status).toBe(503);
    expect(env.db.prepare('SELECT count(*) n FROM anis_shared').get().n).toBe(0);
    res = await shareRoute(req('/api/chat/share', 'POST', { turns: [] }), env, ctx(), { create: fakeCreate(), fetch });
    expect(res.status).toBe(400);
    env.db.prepare(`INSERT INTO anis_shared (slug, title, turns, status, owner_hash, created_at) VALUES ('old-aaaaaaaa', 't', '[]', 'draft', 'h', 1)`).run();
    env.db.prepare(`INSERT INTO anis_shared (slug, title, turns, status, owner_hash, created_at) VALUES ('kept-aaaaaaaa', 't', '[]', 'published', 'h', 1)`).run();
    await shareRoute(req('/api/chat/share', 'POST', { turns: TURNS }), env, ctx(), { create: fakeCreate(), fetch });
    expect(env.db.prepare('SELECT slug FROM anis_shared ORDER BY slug').all().map((r) => r.slug).filter((s) => !s.startsWith('what'))).toEqual(['kept-aaaaaaaa']);
  });
  it('rate-limited like a chat turn; CORS allows GET, POST, DELETE', async () => {
    const env = { ...mkEnv(), CHAT_LIMIT: { limit: async () => ({ success: false }) } };
    const res = await shareRoute(req('/api/chat/share', 'POST', { turns: TURNS }), env, ctx(), { create: fakeCreate() });
    expect(res.status).toBe(429);
    const pre = await worker.fetch(req('/api/chat/share', 'OPTIONS'), env, ctx());
    expect(pre.headers.get('access-control-allow-methods')).toBe('GET, POST, DELETE, OPTIONS');
  });
});

describe('the public page', () => {
  const d = { slug: 'marriage-abcd1234', title: 'On <marriage> & "unity"', summary: 'Passages on marriage.', scope: 'conversation', published_at: Date.UTC(2026, 10, 13), created_at: 0,
    turns: [{ role: 'user', content: 'What is marriage? <script>alert(1)</script>' },
      { role: 'assistant', content: '# Big\n\n## Fortress\n\nA **fortress** [Aqdas](https://oceanlibrary.com/x) [bad](javascript:alert(1))\n\n> Enter ye into wedlock\n\n<!-- widget:passage {"id":1} -->' },
      { role: 'user', content: 'And unity?' }, { role: 'assistant', content: 'Unity is the goal.' }] };
  const html = discussionPage(d);
  it('escapes everything and allows only https links', () => {
    expect(html).not.toContain('<script>alert');
    expect(html).not.toMatch(/href="(?!https:\/\/|\/)/);
    expect(html).toContain('<h1>On &lt;marriage&gt; &amp; &quot;unity&quot;</h1>');
    expect(html).not.toContain('widget:passage');
  });
  it('has the SEO head: lang, title, description, canonical, OG + twitter, theme colours', () => {
    expect(html).toMatch(/^<!doctype html>\n<html lang="en">/);
    expect(html).toContain('<link rel="canonical" href="https://anis.oceanlibrary.com/d/marriage-abcd1234">');
    expect(html).toContain('<meta name="description" content="Passages on marriage.">');
    expect(html).toContain('<meta property="og:image" content="https://anis.oceanlibrary.com/anis-app/og-1200x630.png">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).not.toMatch(/siftersearch/i);
    expect(html).not.toContain('noindex');
  });
  it('a sequential outline: one h1, questions h2, answer headings h3', () => {
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html.match(/<h2>/g)).toHaveLength(2);
    expect(html).toContain('<h3>Big</h3>'); expect(html).toContain('<h3>Fortress</h3>');
    expect(html).not.toMatch(/<h[456]/);
  });
  it('the continue button opens the app with the discussion', () => {
    expect(html).toContain('<a class="btn" href="/?from=marriage-abcd1234">Continue this conversation in Anís</a>');
  });
  it('JSON-LD DiscussionForumPosting with comments; no script but JSON-LD', () => {
    const ld = discussionLd(d);
    expect(ld).toMatchObject({ '@type': 'DiscussionForumPosting', headline: d.title, url: 'https://anis.oceanlibrary.com/d/marriage-abcd1234', commentCount: 3, datePublished: '2026-11-13T00:00:00.000Z' });
    expect(ld.comment[0].author.name).toMatch(/Anís/);
    expect(ld.comment[1].author['@type']).toBe('Person');
    const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(blocks).toHaveLength(1);
    expect(blocks[0][1]).toBe(' type="application/ld+json"');
    expect(JSON.parse(blocks[0][2])['@type']).toBe('DiscussionForumPosting');
  });
  it('not found: noindex', () => {
    expect(notFoundPage()).toContain('<meta name="robots" content="noindex">');
  });
});

describe('site worker forwards (anis.oceanlibrary.com)', () => {
  const w = readFileSync('worker/index.js', 'utf8');
  it('/d/<slug> goes to the Anís Worker before the short-host redirect', () => {
    const at = w.indexOf('DISCUSSION_PATH.test(url.pathname)) return env.ANIS.fetch(request)');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(w.indexOf('shortHost(request'));
  });
  it('/api/chat/share* (any method) goes to the Anís Worker before the tower proxy', () => {
    const at = w.indexOf("url.pathname.startsWith('/api/chat/share/'))) return env.ANIS.fetch(request)");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(w.indexOf('policyFor(url, request.method'));
  });
});
