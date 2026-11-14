// Anís voice: pure helpers (no DOM) for the lazy voice bundle (voice.js) — a streaming sentence splitter that turns reply
// markdown into speakable sentences, a silence/VAD tracker for turn-taking and barge-in, mic level (RMS), recorder MIME choice.
import { speakable } from '../../api/lib/assistant/channels.js';

const ABBR = /(?:^|[\s(])(?:[A-Z]|Mr|Mrs|Ms|Dr|St|Mt|Jr|Sr|vs|cf|ca|vol|Vol|p|pp|ch|no|No|e\.g|i\.e|etc|ibid|Ibid|op|cit|viz|A\.D|B\.C|A\.H|B\.E)\.$/;

/** Text ready to say: widget markers, {{templates}}, link targets, emphasis, headings dropped; whitespace collapsed. */
export const sayable = (md) => speakable(String(md || '').replace(/\{\{[^}]*\}\}/g, '')).replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();

/** Every place the buffer's complete sentences end (index just past each boundary). A boundary is . ! ? … (plus closing
 *  quotes/brackets) followed by whitespace, or a blank line — never inside an open [link](…) or {{template}}, never after an
 *  abbreviation or an initial ("H. M. Balyuzi"). One pass. */
export function boundaries(buf) {
  let depth = 0;
  const cuts = [];
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c === '[' || c === '(' || c === '{') depth++;
    else if ((c === ']' || c === ')' || c === '}') && depth > 0) depth--;
    if (depth) continue;
    if (c === '\n' && buf[i + 1] === '\n') { cuts.push(i + 2); continue; }
    if (!/[.!?…]/.test(c)) continue;
    let j = i + 1;
    while (j < buf.length && /["'”’)\]*_]/.test(buf[j])) j++;
    if (j >= buf.length || !/\s/.test(buf[j])) continue;
    if (c === '.' && ABBR.test(buf.slice(Math.max(0, i - 12), i + 1))) continue;
    cuts.push(j);
  }
  return cuts;
}
/** The last boundary, or -1. */
export const lastBoundary = (buf) => boundaries(buf).at(-1) ?? -1;

/** The sentences of a finished chunk of text, raw. */
function split(text) {
  const out = [];
  let at = 0;
  for (const cut of boundaries(text)) { out.push(text.slice(at, cut)); at = cut; }
  if (text.slice(at).trim()) out.push(text.slice(at));
  return out;
}

/** Streaming splitter: push() reply text as it arrives → the sentences now complete (sayable, non-empty); flush() → the rest.
 *  Very short sentences ride with the next one so speech does not stutter (minChars). */
export function sentenceStream({ minChars = 24 } = {}) {
  let buf = '', carry = '';
  const emit = (text, final) => {
    const out = [];
    for (const part of split(text)) {
      const s = sayable(part);
      if (!s) continue;
      carry = carry ? `${carry} ${s}` : s;
      if (carry.length >= minChars) { out.push(carry); carry = ''; }
    }
    if (final && carry) { out.push(carry); carry = ''; }
    return out;
  };
  return {
    push(text) {
      buf += String(text || '');
      const cut = lastBoundary(buf);
      if (cut < 0) return [];
      const done = buf.slice(0, cut); buf = buf.slice(cut);
      return emit(done, false);
    },
    flush() { const rest = buf; buf = ''; return emit(rest, true); },
  };
}

/** All sentences of a finished reply (read aloud). */
export const sentences = (md, opts) => { const s = sentenceStream(opts); return [...s.push(md), ...s.flush()]; };

/** Silence / voice-activity tracker. feed(level 0..1, t ms) → 'start' when voice has lasted minSpeechMs, 'end' when it has
 *  been quiet hangMs after speech (or maxMs of speech passed), else null. The noise floor adapts while quiet, so a fan or a
 *  room hum does not count as speech: voice = level above max(threshold, floor × ratio). */
export function silenceTracker({ threshold = 0.02, ratio = 2.5, hangMs = 1000, minSpeechMs = 220, maxMs = 45000 } = {}) {
  let floor = threshold / 2, speaking = false, onset = null, last = 0, began = 0;
  const api = {
    get speaking() { return speaking; },
    get floor() { return floor; },
    loud: (level) => level > Math.max(threshold, floor * ratio),
    feed(level, t) {
      const loud = api.loud(level);
      if (!speaking) floor = floor * 0.97 + Math.min(level, threshold * 4) * 0.03;
      if (loud) {
        last = t;
        if (onset == null) onset = t;
        if (!speaking && t - onset >= minSpeechMs) { speaking = true; began = onset; return 'start'; }
      } else if (!speaking) onset = null;
      if (speaking && (t - last >= hangMs || t - began >= maxMs)) { speaking = false; onset = null; return 'end'; }
      return null;
    },
    reset() { speaking = false; onset = null; },
  };
  return api;
}

/** Barge-in while Anís speaks: louder and longer than a turn start, so its own voice through the speaker (echo-cancelled
 *  but not silent) does not interrupt it. */
export const bargeTracker = () => silenceTracker({ threshold: 0.06, ratio: 4, minSpeechMs: 350, hangMs: 600 });

/** RMS level 0..1 of an analyser frame: Float32 samples (-1..1) or Uint8 bytes (128 = silence). */
export function rms(frame) {
  if (!frame?.length) return 0;
  const bytes = frame instanceof Uint8Array;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) { const v = bytes ? (frame[i] - 128) / 128 : frame[i]; sum += v * v; }
  return Math.min(1, Math.sqrt(sum / frame.length));
}

/** Orb scale from a mic level: gentle, bounded (1 … 1.35), with a little lift for quiet speech. */
export const orbScale = (level) => 1 + Math.min(0.35, Math.sqrt(Math.max(0, level)) * 0.9);

/** The recorder format this browser supports (Chrome/Firefox webm+opus, Safari mp4/aac), '' = the browser's default. */
export function pickMime(isSupported) {
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) if (isSupported?.(m)) return m;
  return '';
}

/** What the voice view says in each state (minimal copy). */
export const STATE_TEXT = { idle: 'Tap to talk', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…', paused: 'Paused', denied: 'Microphone blocked' };

/** A spoken question worth sending: some words, not a lone filler or a Whisper hallucination on silence. */
export function worthSending(text) {
  const t = String(text || '').trim().replace(/^[\s.,!?…-]+|[\s.,!?…-]+$/g, '');
  if (t.length < 2) return false;
  return !/^(you|thank you|thanks for watching|um+|uh+|hmm+|okay|ok|bye)$/i.test(t);
}
