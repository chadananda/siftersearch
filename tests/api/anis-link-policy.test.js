// Anís link policy (Chad 11-14): collaborator sites first (config/link-sites.json), then anis.oceanlibrary.com, never siftersearch.com
// in Anís output. Unit tests for the order, the home `prefer`, the Anís fallback and config-only sites; a ratchet on Anís output paths.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import CFG from '../../config/link-sites.json' with { type: 'json' };
import { anisUrl, anisText, anisDeep, ANIS_ORIGIN, LINK_SITES } from '../../api/lib/anis-links.js';
import { linkFor, anisLinkFor, tierOf, PUBLISHER_TIER, SIFTER_TIER } from '../../api/lib/source-links.js';
import { publicUrl } from '../../api/lib/assistant/prompt.js';
import { finishLinks } from '../../worker/anis/links.js';

const OWN = /siftersearch\.com/i;
const doc = { id: 8632, religion: "Baha'i", collection: 'Bahai Books', slug: 'nader-saiedi_gate-of-the-heart', title: 'Gate of the Heart', author: 'Nader Saiedi' };

describe('collaborator order (config)', () => {
  it('ranks the configured sites in order, then another publisher, then our own pages', () => {
    expect(LINK_SITES.map((s) => s.id)).toEqual(CFG.sites.map((s) => s.id));
    CFG.sites.forEach((s, i) => expect(tierOf(`https://${s.hosts[0]}/x`).tier).toBe(i + 1));
    expect(tierOf('https://adibmasumian.com/x').tier).toBe(PUBLISHER_TIER);
    expect(tierOf('https://siftersearch.com/library/x').tier).toBe(SIFTER_TIER);
    expect(tierOf(`${ANIS_ORIGIN}/doc/x-1`).tier).toBe(SIFTER_TIER);   // a subdomain of oceanlibrary.com, but ours: never ranked as Ocean Library
  });
  it('a collaborator copy beats a lower one', () => {
    const l = linkFor({ ...doc, source_url: 'https://bahai-library.com/x', metadata: { bookid: 'BAB_1' } }, 3);
    expect(l.site).toBe('oceanoflights.org');
  });
  it('home `prefer` puts the deployment’s site first when it holds the text, then the order', () => {
    const d = { ...doc, source_url: 'https://oceanlibrary.com/gate?paraId=para_3', metadata: { sourceUrl: 'https://bahai-library.com/gate' } };
    expect(linkFor(d, 3).site).toBe('oceanlibrary.com');
    expect(linkFor(d, 3, { prefer: ['bahai-library.com'] }).site).toBe('bahai-library.com');
    expect(linkFor(d, 3, { prefer: ['phelps.example'] }).site).toBe('oceanlibrary.com');   // home site without the text: the order
  });
  it('Íqán asked on oceanoflights.org → Ocean of Lights first; on anis.oceanlibrary.com → Ocean Library first (Chad 11-14)', () => {
    const iqan = { id: 1, religion: "Baha'i", collection: 'Core Tablets', title: 'Kitáb-i-Íqán', author: "Bahá'u'lláh",
      source_url: 'https://oceanlibrary.com/kitab-i-iqan?paraId=para_5', metadata: { bookid: 'BH00064' } };
    expect(linkFor(iqan, 5, { prefer: ['oceanoflights.org'] }).site).toBe('oceanoflights.org');
    expect(linkFor(iqan, 5, { prefer: ['anis.oceanlibrary.com'] }).site).toBe('oceanlibrary.com');
  });
});

describe('Anís fallback', () => {
  it('a text no collaborator holds links its Anís /doc page, paragraph kept', () => {
    const l = anisLinkFor({ ...doc, source_url: null, metadata: '{}' }, 12);
    expect(l.url).toBe(`${ANIS_ORIGIN}/doc/gate-of-the-heart-nader-saiedi-8632#p12`);
    expect(JSON.stringify(l)).not.toMatch(OWN);
  });
  it('a collaborator copy is still preferred', () => {
    expect(anisLinkFor({ ...doc, source_url: 'https://bahai-library.com/gate' }, 1).url).toBe('https://bahai-library.com/gate');
  });
  it('maps every siftersearch content page to its Anís page', () => {
    expect(anisUrl('https://siftersearch.com/dialogue/on-justice')).toBe(`${ANIS_ORIGIN}/discuss/on-justice`);
    expect(anisUrl('https://siftersearch.com/biography/quddus')).toBe(`${ANIS_ORIGIN}/bio/quddus`);
    expect(anisUrl('https://siftersearch.com/media/dunbar-consciousness')).toBe(`${ANIS_ORIGIN}/media/dunbar-consciousness`);
    expect(anisUrl('https://siftersearch.com/img/covers/8632')).toBe(`${ANIS_ORIGIN}/img/covers/8632`);
    expect(anisUrl('https://siftersearch.com/document/8632')).toBe(`${ANIS_ORIGIN}/doc/8632`);
    expect(anisUrl('https://siftersearch.com/library/bahai/bahai-books/x#p4', { doc })).toBe(`${ANIS_ORIGIN}/doc/gate-of-the-heart-nader-saiedi-8632#p4`);
    expect(anisUrl('https://siftersearch.com/library/bahai/bahai-books/x')).toBeNull();   // no id known: unlinked, never a guess
    expect(anisUrl('https://siftersearch.com/admin/anis')).toBeNull();
    expect(anisUrl('https://oceanlibrary.com/x?paraId=para_1')).toBe('https://oceanlibrary.com/x?paraId=para_1');
  });
});

describe('adding a site is config only', () => {
  it('tiers come from the config entries', () => {
    expect(PUBLISHER_TIER).toBe(CFG.sites.length + 1);
    const src = readFileSync('api/lib/source-links.js', 'utf8');
    for (const s of CFG.sites) for (const h of s.hosts) expect(src.includes(`'${h}', `)).toBe(false);   // no host table in code
  });
});

describe('ratchet: no siftersearch.com in Anís output', () => {
  const sample = {
    type: 'complete',
    reply: 'See [Gate of the Heart](https://siftersearch.com/library/bahai/bahai-books/nader-saiedi_gate-of-the-heart#p3) and https://siftersearch.com/dialogue/on-justice.',
    widgets: [{ kind: 'book', id: 8632, title: 'Gate of the Heart', author: 'Nader Saiedi', url: 'https://siftersearch.com/library/bahai/bahai-books/nader-saiedi_gate-of-the-heart', cover_url: 'https://siftersearch.com/img/covers/8632' }],
    citations: [{ document_id: 8632, source_title: 'Gate of the Heart', url: 'https://siftersearch.com/library/view?doc=8632#p3', reader_url: 'https://siftersearch.com/library/bahai/x#p3' }],
    talks: [{ url: 'https://siftersearch.com/media/t1', audio_url: 'https://siftersearch.com/api/media/t1/file/a.ogg' }],
    map: new Map([[1, 'https://siftersearch.com/document/1']]),
  };
  it('an emitted event (reply, cards, covers, citations, talks) carries none', () => {
    const out = anisDeep(sample);
    expect(JSON.stringify({ ...out, map: [...out.map] })).not.toMatch(OWN);
    expect(out.widgets[0].url).toBe(`${ANIS_ORIGIN}/doc/gate-of-the-heart-nader-saiedi-8632`);
  });
  it('the writer’s prompt never names it', () => {
    expect(publicUrl('https://siftersearch.com/library/bahai/x#p2', { doc_id: 8632, source_title: 'Gate of the Heart', source_author: 'Nader Saiedi' })).toBe(`${ANIS_ORIGIN}/doc/gate-of-the-heart-nader-saiedi-8632#p2`);
    expect(publicUrl('https://siftersearch.com/library/bahai/x')).toBeNull();
  });
  it('a finished edge reply and a stored discussion page are rewritten', () => {
    const ps = [{ document_id: 8632, title: 'Gate of the Heart', author: 'Nader Saiedi', reader_url: 'https://siftersearch.com/library/bahai/x#p3' }];
    const r = finishLinks('[Gate](https://siftersearch.com/library/bahai/x#p3) and [Admin](https://siftersearch.com/admin)', ps).text;
    expect(r).toBe(`[Gate](${ANIS_ORIGIN}/doc/gate-of-the-heart-nader-saiedi-8632#p3) and Admin`);
    expect(anisText('<a href="https://siftersearch.com/dialogue/x">x</a><a href="https://siftersearch.com/research/y">y</a>')).not.toMatch(OWN);
  });

  // source literals on Anís output paths: may only shrink (each legacy file is covered at the edge by anisDeep in worker/anis/index.js)
  const LEGACY = { 'api/lib/assistant/tools.js': 2, 'api/lib/assistant/agent-core.js': 2, 'api/lib/assistant/work-notes.json': 40,
    'api/lib/assistant/widgets/quote.js': 1, 'api/lib/assistant/widgets/scene.js': 1, 'src/widget/SifterChat.svelte': 2 };
  const INTERNAL = new Set(['api/lib/assistant/admin-threads.js']);   // admin links (allowed)
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  it('no new https://siftersearch.com literal in Anís output code', () => {
    const files = [...walk('api/lib/assistant'), ...walk('worker/anis'), ...walk('src/widget')].filter((f) => /\.(js|svelte|json)$/.test(f) && !INTERNAL.has(f) && !f.includes('.wrangler'));
    const over = files.map((f) => [f, (readFileSync(f, 'utf8').match(/https:\/\/(?:www\.)?siftersearch\.com/g) || []).length]).filter(([f, n]) => n > (LEGACY[f] || 0));
    expect(over).toEqual([]);
  });
});
