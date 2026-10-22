// FOLLOW MODE for the talk page (/media/<slug>): while audio plays the window scrolls line by line so the playing line
// keeps its screen position; a manual scroll pauses it until "Follow". Pure maths + the manual-scroll rule; the player
// (MediaPlayer.svelte) owns the DOM. Tested in tests/api/media-follow.test.js.

/** Below the fixed chrome (nav + the slim sticky player) — a line must never be followed underneath them. */
export const CHROME_PX = 128;

/** The screen height to hold the playing line at: where the clicked element is, when it is comfortably on screen;
 *  else 35 % of the viewport. Never under the fixed chrome. */
export function anchorFor(top, viewportH, chrome = CHROME_PX) {
  const fallback = Math.max(chrome + 24, Math.round(viewportH * 0.35));
  return top != null && top > chrome + 8 && top < viewportH * 0.75 ? Math.round(top) : fallback;
}

/** How far to scroll so a line at `rectTop` (viewport px) sits at `anchorY`; 0 when it is already there (±4 px) or
 *  when it is the same line as last time (pageTop within 4 px). → { delta, pageTop } */
export function followStep(rectTop, scrollY, anchorY, lastPageTop = null, force = false) {
  const pageTop = rectTop + scrollY;
  if (!force && lastPageTop != null && Math.abs(pageTop - lastPageTop) < 4) return { delta: 0, pageTop: lastPageTop };
  const delta = rectTop - anchorY;
  return { delta: Math.abs(delta) > 4 ? delta : 0, pageTop };
}

/** Does this input mean the reader scrolled by hand? Wheel/touch/scroll keys while playing — except during the grace
 *  period after playback starts (a trackpad's momentum keeps sending wheel events after the click that started it). */
export function isManualScroll({ type, key = null }, { playing, sinceStartMs }, graceMs = 900) {
  if (!playing || sinceStartMs < graceMs) return false;
  if (type === 'wheel' || type === 'touchmove') return true;
  if (type === 'keydown') return ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(key);
  return false;
}
