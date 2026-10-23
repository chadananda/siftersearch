// The Fireside Room's ONE preview player: every "play excerpt" button on /media goes through here, so one sound plays at a
// time. A 'full' talk streams its web rendition from the highlight's start and stops after the window; a 'clips' talk asks
// for a signed clip. Media Session metadata (title, speaker, portrait) for the lock screen. Browser only; play on click only.
import { media } from './api.js';
import { portraitSquare } from './media-listing.js';
import { audioUrls } from '../../api/lib/media/listing-index.js';

export const preview = $state({ item: null, speaker: null, playing: false, loading: false, t: 0, start: 0, end: 0, error: null });

let audio = null, stopAt = Infinity;
const canOgg = () => typeof Audio !== 'undefined' && !!new Audio().canPlayType('audio/ogg; codecs="opus"');

function ensure() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'none';
  audio.addEventListener('timeupdate', () => {
    preview.t = audio.currentTime;
    if (audio.currentTime >= stopAt) { audio.pause(); preview.playing = false; preview.t = stopAt; }
  });
  const blip = () => audio.src.startsWith('blob:');   // the unlock blip, not the excerpt
  audio.addEventListener('playing', () => { if (blip()) return; preview.playing = true; preview.loading = false; });
  audio.addEventListener('pause', () => { preview.playing = false; });
  audio.addEventListener('ended', () => { preview.playing = false; });
  audio.addEventListener('error', () => { if (blip()) return; preview.loading = false; preview.playing = false; preview.error = 'This recording could not be played here.'; });
  return audio;
}

function session(it, speaker) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const art = speaker?.p ? [96, 256, 512].map((px) => ({ src: portraitSquare(speaker.p, px).src, sizes: `${px}x${px}`, type: 'image/webp' })) : [];
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: it.t, artist: it.sp || 'SifterSearch Media', album: it.y ? `Recorded ${it.y}` : 'The Fireside Room', artwork: art });
    navigator.mediaSession.setActionHandler('play', () => audio?.play());
    navigator.mediaSession.setActionHandler('pause', () => audio?.pause());
    navigator.mediaSession.setActionHandler('stop', stop);
  } catch { /* older browsers */ }
}

// Browsers allow play() only inside the click; the clip URL fetch and the metadata wait come after an await. Playing a
// tiny silent WAV synchronously in the click unlocks this element for the real source that follows (as on the talk page).
let unlocked = false;
function unlock(a) {
  if (unlocked) return;
  unlocked = true;
  const n = 400, b = new DataView(new ArrayBuffer(44 + n)), w = (o, str) => [...str].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); b.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, 8000, true); b.setUint32(28, 8000, true); b.setUint16(32, 1, true); b.setUint16(34, 8, true); w(36, 'data'); b.setUint32(40, n, true);
  for (let i = 0; i < n; i++) b.setUint8(44 + i, 128);
  a.src = URL.createObjectURL(new Blob([b.buffer], { type: 'audio/wav' }));
  a.play().catch(() => {});
}

/** Play (or toggle) the ~20 s highlight of a listing row. */
export async function playExcerpt(it, speaker = null) {
  const a = ensure();
  if (preview.item?.s === it.s && a.src) {
    if (preview.playing) { a.pause(); return; }
    if (a.currentTime < stopAt - 0.5) { a.play().catch(() => {}); return; }
  }
  a.pause();
  unlock(a);
  const [start, end] = it.hl || [0, 20];
  Object.assign(preview, { item: it, speaker, playing: false, loading: true, t: start, start, end, error: null });
  try {
    // a moment/clip page passes the item's own audio URLs as `audio` (index rows' `au` is the AUDIENCE level, not audio)
    const au = (it.audio?.ogg || it.audio?.m4a) ? it.audio : audioUrls(it);
    if (au) {
      a.src = media.href(canOgg() ? au.ogg : au.m4a);
      stopAt = end;
      a.currentTime = 0;
      await new Promise((res, rej) => { a.addEventListener('loadedmetadata', res, { once: true }); a.addEventListener('error', rej, { once: true }); a.load(); });
      a.currentTime = start;
    } else {
      const c = await media.clip(`/api/media/${encodeURIComponent(it.s)}/clip-url`, start, end, canOgg() ? null : 'm4a');
      a.src = media.href(c.url);
      stopAt = Infinity;
      preview.start = 0; preview.end = c.end - c.start; preview.t = 0;
    }
    session(it, speaker);
    await a.play();
  } catch (err) {
    console.warn('preview excerpt failed', err);
    preview.loading = false;
    preview.error = 'This excerpt is not available to play here.';
  }
}

export function stop() {
  audio?.pause();
  Object.assign(preview, { item: null, speaker: null, playing: false, loading: false, error: null });
}

export const isCurrent = (it) => preview.item?.s === it?.s;
