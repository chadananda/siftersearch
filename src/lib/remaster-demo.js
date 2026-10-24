// /media/remaster before/after demo: the clip list + audio URLs + the unlisted-page rule (sitemap filter, robots).
// Audio lives in R2 (MEDIA_BUCKET, key "demo-remaster/<id>-<side>.m4a@1"), served by worker/media.js like any talk file.

export const REMASTER_PATH = '/media/remaster';
export const AUDIO_VERSION = 1;

/** [id, title, year/source, defect] — order is the page order. */
export const CLIPS = [
  ['ioas', 'Ioas — “Our Responsibilities”', 'Archival recording', 'Muffled, tape hiss'],
  ['panahi', 'Aziz Panahi — pilgrimage recollections', '1952', 'Heavy tape hiss'],
  ['muhajir', 'Rahmatu’lláh Muhájir — “Spiritual Conquest of the Planet”', '1963', 'Echoing lecture hall'],
  ['sears', '“Eleven Days in the Steps of the Master”', '1987 cassette', 'Very quiet speech'],
  ['banani', 'Músá Banání', 'Archival tape', 'Mains hum, worn tape'],
  ['sears-convention', 'William Sears — address to a national convention', 'Archival', 'Severely muffled'],
  ['faizi-iqan', 'Abu’l-Qásim Faizí — on the Kitáb-i-Íqán', 'Archival', 'Muffled'],
  ['gibson-1980', 'Amoz Gibson', '1980', 'Muffled'],
  ['cardell-1988', 'Cardell — experiences with the Guardian', '1988', 'Muffled'],
  ['taherzadeh-14', 'Adib Taherzadeh — The Covenant of Bahá’u’lláh, part 14', '1993', 'Muffled'],
  ['featherstone-lotus', 'Collis Featherstone — “Echoes from the Lotus”', 'Archival', 'Muffled'],
  ['furutan-ussr', '‘Alí-Akbar Furútan — first national convention in the USSR', '1991', 'Muffled'],
  ['khadem-1985', 'Khádem — “Peace and the New World Order”', '1985', 'Muffled'],
].map(([id, title, year, defect]) => ({ id, title, year, defect }));

/** Same-origin URL of one side ('before' | 'after') of a clip. */
export const audioUrl = (id, side) => `/api/media/demo-remaster/file/${id}-${side}.m4a?v=${AUDIO_VERSION}`;

/** Pages reachable by link but kept out of the sitemap and search engines. */
export const UNLISTED = [REMASTER_PATH];
export const isUnlisted = (page) => {
  const p = new URL(page, 'https://siftersearch.com').pathname.replace(/\/$/, '');
  return UNLISTED.includes(p);
};
