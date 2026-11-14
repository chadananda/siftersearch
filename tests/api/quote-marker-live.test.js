// The wrapped quote marker never reaches a reader (live 11-14, edge a058f647: 8 of 21 replies showed `{{quote:\n\n> "…"\n> — [Title](url)\n\nP3}}`
// raw in their gated text events). Fixture = the real SSE text events. Covers mendTemplates (any attribution form), the streamed agentAnswer
// path (gated pieces mended), and the edge guard (unwrapMarkers in templateFilter + finishLinks).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { mendTemplates, unwrapMarkers } from '../../api/lib/assistant/widgets/templates.js';
import { templateFilter, finishLinks } from '../../worker/anis/links.js';
import { agentAnswer } from '../../api/lib/assistant/agent-core.js';

const { replies } = JSON.parse(fs.readFileSync(new URL('../fixtures/anis/quote-marker-live-20261114.json', import.meta.url), 'utf8'));
const live = replies.flatMap((r) => r.live_text_events.map((t) => ({ id: r.id, t })));
const BRACES = /\{\{|\}\}/;
const refsWith = (ids) => ({ found: new Map(ids.map((p) => [p, { text: 'The All-Knowing Physician hath His finger on the pulse of mankind.', source_url: `https://x/${p}`, title: 'Tabernacle of Unity', author: "Bahá'u'lláh" }])), works: new Map(), books: new Map(), carded: new Set() });

describe('real live markers (8 replies, 15 text events)', () => {
  it('the fixture is the live failure: every event carries a wrapped marker', () => {
    expect(replies).toHaveLength(8); expect(live).toHaveLength(15);
    for (const { t } of live) expect(t).toMatch(/\{\{quote:[\s\S]*\n\nP\d+\}\}/);
  });
  it('mendTemplates, passage not held → the blockquote as typed, attribution link kept, no braces, no "P3"', () => {
    for (const { t } of live) {
      const m = mendTemplates(t, refsWith([]));
      expect(m).not.toMatch(BRACES); expect(m).not.toMatch(/(^|\n)P\d+\s*$/);
      expect(m).toMatch(/^> "/m); expect(m).toMatch(/> — \[[^\]]+\]\(https:\/\/[^)]+\)/);
    }
  });
  it('mendTemplates, passage held → the card template on its own line (closing number wins over the attribution)', () => {
    for (const { t } of live) {
      const id = /\n\n(P\d+)\}\}/.exec(t)[1];
      const m = mendTemplates(t, refsWith([id]));
      expect(m).toMatch(new RegExp(`(^|\\n){{quote ${id}}}\\n*$`)); expect(m.match(/\{\{/g)).toHaveLength(1); expect(m).not.toContain('> "');
    }
  });
  it('unwrapMarkers (edge guard) on every live event → no braces, quote kept; idempotent', () => {
    for (const { t } of live) {
      const u = unwrapMarkers(t);
      expect(u).not.toMatch(BRACES); expect(u).toMatch(/^> "/m); expect(unwrapMarkers(u)).toBe(u);
    }
  });
  it('the streamed path: a reply carrying the live markers, streamed in 11-char pieces → no text event and no reply shows a brace', async () => {
    for (const r of replies) {
      const raw = `The question assumes something.\n\n${r.live_text_events.join('\n\nThat is the frame.\n\n')}\n\nSo the answer follows.`;
      const create = async (p) => p.stream
        ? (async function* () { for (let i = 0; i < raw.length; i += 11) yield { choices: [{ delta: { content: raw.slice(i, i + 11) } }] }; })()
        : { choices: [{ message: { content: raw } }] };
      const texts = [];
      const A = await agentAnswer({ messages: [{ role: 'user', content: 'q' }], create, tools: {}, onEvent: (e) => { if (e.type === 'text') texts.push(e.content); } });
      expect(texts.filter((x) => BRACES.test(x)), r.id).toEqual([]);
      expect(A.reply, r.id).not.toMatch(BRACES);
    }
  });
  it('the edge: templateFilter over the live events (whole and split) and finishLinks on the reply strip the marker', () => {
    for (const { t } of live) {
      const f = templateFilter();
      expect(f(t)).not.toMatch(BRACES);
      const g = templateFilter(), cut = t.indexOf('\n\n>');
      expect([t.slice(0, cut), t.slice(cut, -6), t.slice(-6)].map(g).join('')).not.toMatch(BRACES);
      expect(finishLinks(`Intro.\n\n${t}\n\nEnd.`, []).text).not.toMatch(BRACES);
    }
  });
});

describe('other attribution forms', () => {
  const q = '> "The remedy the world needeth."';
  it.each([
    ['inline [[P#]]', `{{quote:\n\n${q} — [[P7]]\n\nP7}}`, 'P7'],
    ['[[P#]] own line, no closing number', `{{quote:\n\n${q}\n[[P7]]}}`, 'P7'],
    ['italic title', `{{quote:\n\n${q}\n> *— Gleanings*\n\nP2}}`, 'P2'],
    ['parenthesised link', `{{quote:\n\n${q} ([Gleanings](https://x/g))\n\nP4}}`, 'P4'],
    ['several numbers', `{{quote:\n\n${q}\n\nP1, P4}}`, 'P1 P4'],
  ])('%s → card when held, blockquote when not', (name, t, ids) => {
    expect(mendTemplates(t, refsWith(ids.split(' '))).trim()).toBe(`{{quote ${ids}}}`);
    const m = mendTemplates(t, refsWith([]));
    expect(m).not.toMatch(BRACES); expect(m).toContain(q);
  });
  it('inline "— [[P7]]" attribution with no closing number stays in the body', () => {
    expect(mendTemplates(`{{quote:\n\n${q} — [[P7]]}}`, refsWith([]))).toContain(`${q} — [[P7]]`);
  });
  it('unwrapMarkers: split opener and split closing line each go; plain braces and template lines untouched', () => {
    expect(unwrapMarkers(`{{quote:\n\n${q}`)).toBe(`\n\n${q}`);
    expect(unwrapMarkers(`${q}\n\nP3}}\n\nNext.`)).toBe(`${q}\n\nNext.`);
    expect(unwrapMarkers('Set {x} and {{quote P1}}.')).toBe('Set {x} and {{quote P1}}.');
  });
});
