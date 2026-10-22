// The MOMENT QUOTE CARD (og:image / twitter:image for /media/<slug>/m/<key>): 1200×630 JPEG in the Listening Room style —
// walnut cabinet, the quote in Gloock, speaker + talk in brass/cream, the speaker's portrait on a record, a tuning dial
// with the needle at the year, the call sign. Text is set by Pango (sharp text input) with the bundled OFL fonts so it
// renders the same on any server; shapes are SVG (no text). Deps: sharp (transitive via astro). Pure given its inputs.
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const FONTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'fonts');
const GLOOCK = join(FONTS, 'Gloock-Regular.ttf');
const SHOULDERS = join(FONTS, 'BigShouldersDisplay.ttf');
const W = 1200, H = 630;
const C = { walnut: '#3b2414', deep: '#1f130a', brass: '#e3bd6e', cream: '#f8ecd4', amber: '#ffb347', needle: '#ff5a3c', dial: '#f3dfa8', ink: '#3b2414' };

export const escapeMarkup = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Quote size by length: short lines large, long passages smaller (and cut at a word with an ellipsis past max). */
export function quoteFit(text, max = 260) {
  let t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length > max) t = `${t.slice(0, t.lastIndexOf(' ', max))}…`;
  const n = t.length;
  const size = n <= 70 ? 62 : n <= 120 ? 52 : n <= 180 ? 44 : 38;
  return { text: t, size };
}

function background(year) {
  const x0 = 70, x1 = 1130, y = 560;
  const pos = (yr) => x0 + ((Math.min(2030, Math.max(1930, yr)) - 1930) / 100) * (x1 - x0);
  const ticks = [];
  for (let yr = 1930; yr <= 2030; yr += 2) ticks.push(`<rect x="${pos(yr) - (yr % 10 ? 0.5 : 1)}" y="${y + (yr % 10 ? 22 : 12)}" width="${yr % 10 ? 1 : 2}" height="${yr % 10 ? 14 : 24}" fill="${C.ink}" opacity="${yr % 10 ? 0.45 : 0.85}"/>`);
  const grain = Array.from({ length: 70 }, (_, i) => `<rect x="${i * 18 + (i % 3) * 3}" y="0" width="1" height="${H}" fill="${C.deep}" opacity="0.18" transform="rotate(4 ${i * 18} ${H / 2})"/>`).join('');
  const grooves = Array.from({ length: 22 }, (_, i) => `<circle cx="960" cy="250" r="${88 + i * 4.2}" fill="none" stroke="#3a2e26" stroke-width="1.4"/>`).join('');
  const needle = year ? `<rect x="${pos(year) - 2}" y="${y + 4}" width="4" height="52" rx="2" fill="${C.needle}"/>` : '';
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <radialGradient id="g" cx="20%" cy="0%" r="90%"><stop offset="0" stop-color="#7a5230"/><stop offset="1" stop-color="${C.walnut}"/></radialGradient>
      <radialGradient id="d" cx="50%" cy="100%" r="80%"><stop offset="0" stop-color="#ffcf73"/><stop offset="1" stop-color="${C.dial}"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="${C.deep}"/>
    <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="26" fill="url(#g)"/>
    ${grain}
    <rect x="14.5" y="14.5" width="${W - 29}" height="${H - 29}" rx="26" fill="none" stroke="${C.brass}" stroke-opacity="0.5"/>
    <circle cx="70" cy="62" r="8" fill="${C.needle}"/>
    <circle cx="960" cy="250" r="185" fill="#120d09"/>${grooves}
    <circle cx="960" cy="250" r="94" fill="none" stroke="${C.brass}" stroke-width="4"/>
    <rect x="${x0 - 14}" y="${y}" width="${x1 - x0 + 28}" height="60" rx="12" fill="url(#d)" stroke="${C.brass}" stroke-width="2"/>
    ${ticks.join('')}${needle}
  </svg>`);
}

const text = async (sharp, markup, { font, fontfile, width, dpi = 72, align = 'left' }) =>
  sharp({ text: { text: markup, font, fontfile, width, rgba: true, align, dpi, wrap: 'word' } }).png().toBuffer({ resolveWithObject: true });

/** → JPEG Buffer. m: { text, speaker, title, year }; photo: Buffer of a face-centred square portrait (or null). */
export async function renderMomentCard(m, photo = null, { sharp = null } = {}) {
  sharp ??= (await import('sharp')).default;
  const q = quoteFit(m.text);
  const layers = [];
  const quote = await text(sharp, `<span foreground="${C.cream}">“${escapeMarkup(q.text)}”</span>`, { font: `Gloock ${q.size}`, fontfile: GLOOCK, width: 700 });
  const qTop = Math.max(110, Math.round(300 - quote.info.height / 2));
  layers.push({ input: quote.data, left: 70, top: Math.min(qTop, 470 - quote.info.height) });
  const call = await text(sharp, `<span foreground="${C.cream}" letter_spacing="4000" font_weight="bold">THE LISTENING ROOM · SIFTERSEARCH</span>`, { font: 'Big Shoulders Display 22', fontfile: SHOULDERS, width: 700 });
  layers.push({ input: call.data, left: 90, top: 50 });
  const who = [m.speaker, m.year].filter(Boolean).join(' · ');
  if (who) {
    const sp = await text(sharp, `<span foreground="${C.amber}" font_weight="bold" letter_spacing="1500">${escapeMarkup(who.toUpperCase())}</span>`, { font: 'Big Shoulders Display 30', fontfile: SHOULDERS, width: 700 });
    layers.push({ input: sp.data, left: 70, top: 478 });
  }
  if (m.title) {
    const tt = await text(sharp, `<span foreground="${C.brass}">${escapeMarkup(m.title.length > 60 ? `${m.title.slice(0, 58)}…` : m.title)}</span>`, { font: 'Gloock 24', fontfile: GLOOCK, width: 520, align: 'centre' });
    layers.push({ input: tt.data, left: Math.round(960 - tt.info.width / 2), top: 452 });
  }
  if (photo) {
    const mask = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><circle cx="90" cy="90" r="90"/></svg>');
    const disc = await sharp(photo).resize(180, 180, { fit: 'cover' }).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    layers.push({ input: disc, left: 870, top: 160 });
  } else if (m.speaker) {
    const ini = m.speaker.split(/\s+/).filter((w) => /^[A-Z‘’ʻ]/.test(w)).map((w) => w.replace(/^[‘’ʻ]/, '')[0]).slice(0, 2).join('') || m.speaker[0];
    const lab = await text(sharp, `<span foreground="${C.amber}">${escapeMarkup(ini)}</span>`, { font: 'Gloock 72', fontfile: GLOOCK, width: 180, align: 'centre' });
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><circle cx="90" cy="90" r="90" fill="${C.walnut}"/><circle cx="90" cy="90" r="60" fill="none" stroke="${C.brass}" stroke-opacity="0.5"/></svg>`), left: 870, top: 160 });
    layers.push({ input: lab.data, left: Math.round(960 - lab.info.width / 2), top: Math.round(250 - lab.info.height / 2) });
  }
  return sharp(background(m.year)).composite(layers).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}
