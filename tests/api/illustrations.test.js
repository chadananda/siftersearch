// Dawn-Breakers plates (Chad 11-14): the index, imagesFor's picks, a research set and person report carrying images, cards and letters rendering the thumbnail.
import { describe, it, expect } from 'vitest';
import { allImages, imageById, imagesFor, imagesForPassages, chapterOf, cardImage, imageHtml, imageMarkdown, toolImages, imagesNote, sizeImgs } from '../../api/lib/illustrations.js';
import { WIDGETS, renderWidget } from '../../api/lib/assistant/widgets/index.js';
import { toReport } from '../../api/lib/person-report.js';
import { markdownHtml } from '../../api/lib/mail-render.js';
import { quoteCards } from '../../api/lib/assistant/quote-cards.js';
import { lookup } from '../../worker/anis/research-store.js';

const DB = 21308, TAHIRIH = 1247554, MUHAMMAD_SHAH = 1247565;

describe('illustration index', () => {
  it('loads every plate with a caption, R2 key, size, chapter and paragraph', () => {
    const all = allImages();
    expect(all.length).toBeGreaterThanOrEqual(180);
    for (const x of all) {
      expect(x.caption).toBeTruthy();
      expect(x.r2).toMatch(/^illustrations\/dawn-breakers\/.+\.png$/);
      expect(x.w > 0 && x.h > 0).toBe(true);
      expect(x.doc).toBe(DB);
      expect(x.chapter).toBeGreaterThan(0);
    }
    expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
    const kalantar = imageById('db-623-house-of-kalantar');
    expect(kalantar.caption).toMatch(/Kalántar.*Ṭáhirih/);
    expect(kalantar.people.map((p) => p.id)).toContain(TAHIRIH);
    expect(kalantar.places).toContain('Ṭihrán');
  });
  it('a plate title carries over to its other views', () => {
    expect(imageById('db-52-masjid-i-vakil2').caption).toMatch(/^Views of the Masjid-i-Vakíl.*: Pulpit/);
  });
});

describe('imagesFor', () => {
  it('by person: their portrait first', () => {
    expect(imagesFor({ person: MUHAMMAD_SHAH })[0].id).toBe('db-229-muhammad-shah');
    expect(imagesFor({ person: TAHIRIH }).every((x) => x.people.some((p) => p.id === TAHIRIH))).toBe(true);
  });
  it('by place', () => {
    const z = imagesFor({ place: 'Zanján' });
    expect(z.length).toBeGreaterThan(0);
    expect(z.every((x) => x.places.includes('Zanján'))).toBe(true);
  });
  it('by passage: the plate facing the paragraph, then the person/place the words name, in the same chapter', () => {
    const at = imageById('db-511-barrack-square-tabriz');
    const picks = imagesFor({ doc: DB, para: at.para, text: 'The Báb was suspended in the barrack-square of Tabríz' });
    expect(picks[0].id).toBe(at.id);
    expect(picks.every((x) => x.chapter === at.chapter)).toBe(true);
    const tah = imagesFor({ doc: DB, para: imageById('db-623-house-of-kalantar').para + 20, text: 'Ṭáhirih was confined in the house of the Kalántar' });
    expect(tah[0].id).toBe('db-623-house-of-kalantar');
  });
  it('by chapter: a per-chapter edition doc maps to its chapter', () => {
    expect(chapterOf(33841, 1)).toBe(1);
    expect(imagesFor({ doc: 33841, para: 5, text: 'nothing named here' }).every((x) => x.chapter === 1)).toBe(true);
  });
  it('none when nothing fits: a book without plates, an unknown person, no chapter', () => {
    expect(imagesFor({ doc: 12345, para: 3, text: 'the Báb in Shíráz' })).toEqual([]);
    expect(imagesFor({ person: 999999999 })).toEqual([]);
    expect(imagesFor({ doc: DB, para: 999999, text: '' })).toEqual([]);
    expect(imagesFor({})).toEqual([]);
  });
});

describe('packets carry images', () => {
  it('a research set of Dawn-Breakers passages: 0–2 images as {id, caption, url}', () => {
    const at = imageById('db-623-house-of-kalantar');
    const imgs = toolImages(imagesForPassages([{ document_id: 1, paragraph_index: 1, text: 'x' }, { document_id: DB, paragraph_index: at.para, text: 'Ṭáhirih' }]));
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs.length).toBeLessThanOrEqual(2);
    expect(Object.keys(imgs[0]).sort()).toEqual(['caption', 'id', 'url']);
    expect(imgs[0].url).toMatch(/\/img\/cdn\/siftersearch\.com\/illustrations\/dawn-breakers\//);
    expect(toolImages(imagesForPassages([{ document_id: 1, paragraph_index: 1, text: 'Ṭáhirih' }]))).toEqual([]);
  });
  it('a held set read from D1 carries its images', async () => {
    const at = imageById('db-511-barrack-square-tabriz');
    const row = { id: 7, question: 'how was the Báb martyred', status: 'curated', passages: JSON.stringify([{ id: 1, document_id: DB, paragraph_index: at.para, text: 'the barrack-square of Tabríz' }]) };
    const stmt = { bind: () => stmt, first: async () => row, run: async () => ({}) };
    const hit = await lookup({ ANIS_DB: { prepare: () => stmt } }, 'how was the Báb martyred');
    expect(hit.set.images[0]).toMatchObject({ id: at.id, caption: at.caption });
  });
  it('the model sees captions only, and only when there are pictures', () => {
    expect(imagesNote([imageById('db-229-muhammad-shah')])).toMatch(/Muḥammad/);
    expect(imagesNote([])).toBe('');
  });
  it('a person report (bio cache) carries the portrait', () => {
    const r = toReport({ id: MUHAMMAD_SHAH, name: 'Muḥammad Sháh' });
    expect(r.images[0].id).toBe('db-229-muhammad-shah');
    expect(toReport({ id: 1, name: 'Nobody' }).images).toEqual([]);
  });
});

describe('cards render one thumbnail', () => {
  const at = imageById('db-623-house-of-kalantar');
  const found = new Map([['P1', { document_id: DB, paragraph_index: at.para, text: 'Ṭáhirih was confined in the house of the Kalántar.', source_url: 'https://example.org/db#1', title: 'The Dawn-Breakers', author: 'Nabíl' }],
    ['P2', { document_id: 7, paragraph_index: 3, text: 'Unillustrated words.', source_url: 'https://example.org/x', title: 'Other', author: 'X' }]]);
  it('quote widget: srcset, sizes, width, height, lazy, caption and credit, linked to the large image', () => {
    const d = WIDGETS.quote.fromRefs(['P1'], { found });
    expect(d.image.id).toBe(at.id);
    const html = renderWidget(d, 'chat');
    const img = html.match(/<img [^>]*>/)[0];
    for (const a of ['srcset="', 'sizes="120px"', 'width="120"', 'height="', 'loading="lazy"']) expect(img).toContain(a);
    expect(html).toContain('Illustration from <em>The Dawn-Breakers</em>');
    expect(html).toMatch(/<a href="[^"]*tr=w-1600[^"]*"[^>]*><img/);
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html.endsWith('</figure></figure>')).toBe(true);   // inside the card
  });
  it('a passage of a book without plates: no image', () => {
    const d = WIDGETS.quote.fromRefs(['P2'], { found });
    expect(d.image).toBeUndefined();
    expect(renderWidget(d, 'chat')).not.toContain('<img');
  });
  it('scene widget carries one plate', () => {
    const d = WIDGETS.scene.fromRefs(['P2', 'P1'], { found }, ['Confinement', 'Ṭihrán, 1852']);
    expect(d.image.id).toBe(at.id);
    expect(renderWidget(d, 'chat').match(/<img /g)).toHaveLength(1);
  });
  it('quote cards (blockquote swap) carry the plate', async () => {
    const reply = '> Ṭáhirih was confined in the house of the Kalántar.\n> — [*The Dawn-Breakers*](https://example.org/db#1)';
    const { cards } = await quoteCards(reply, [{ ...found.get('P1') }], { docs: async () => [{ id: DB, title: 'The Dawn-Breakers' }] });
    expect(cards[0]?.image?.id).toBe(at.id);
  });
});

describe('letters: a fixed-size thumbnail URL', () => {
  const img = cardImage(imageById('db-229-muhammad-shah'));
  it('the email thumbnail is one fixed w×h image-worker URL', () => {
    expect(img.email.src).toMatch(/\/img\/cdn\/siftersearch\.com\/illustrations\/dawn-breakers\/229-muhammad-shah\.png\?tr=w-160,h-\d+,dpr-1/);
    expect(imageHtml(img, { mode: 'email' })).toContain(`src="${img.email.src}"`);
  });
  it('the reply markdown carries it and the letter renders it sized, linked, captioned', () => {
    const md = imageMarkdown(img);
    const html = markdownHtml(md);
    const tag = html.match(/<img [^>]*>/)[0];
    expect(tag).toContain(`src="${img.email.src}"`);
    expect(tag).toMatch(/width="160" height="\d+"/);
    expect(tag).toContain('srcset="');
    expect(html).toContain(img.large);
    expect(html).toContain('Illustration from The Dawn-Breakers');
  });
  it('any other remote image stays a link (no tracking pixels)', () => {
    expect(markdownHtml('![x](https://evil.example/p.png?tr=w-1,h-1,dpr-1)')).not.toContain('<img');
    expect(sizeImgs('<p>none</p>')).toBe('<p>none</p>');
  });
});
