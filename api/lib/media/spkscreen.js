// Speaker-count PRESCREEN (10-23): a monologue skips full diarization. media_tool.py spkscreen embeds one 2 s window per
// 10 s of speech with the diarization's own WeSpeaker model and scores each against the talk's main voice; this module
// makes the call. Only 'single' skips — 'multi' and 'unsure' diarize as before. MEDIA_SPK_PRESCREEN=0 / =1.
// Validated on the diarized published talks: planning/media-speaker-prescreen.md.

/** Titles that promise more than one voice: never 'single' on the audio alone. */
export const MULTI_TITLE = /\b(q\s*&\s*a|q\s*and\s*a|questions?|answers?|panel|interview|conversation|dialogue|discussion|debate|forum|round\s*table|fireside|introduc\w*|tribute|memorial|ceremony|session|programme?|with)\b/i;

/** A transcript line that only happens with a second person in the room: a question taken ("Yes?", "Pardon?"), a
 *  question asked, a chair's introduction or thanks. The 2-s voice windows miss audience questions on the room microphone
 *  (10-23 validation: every acoustic-only false 'single' was a class with questions), so ONE such line → not single. */
export const CUE = /(^|\s)(yes\?|pardon\?)|\b(go ahead|any (?:other |more )?questions?|a question|my question|your question|the question was|i have a question|can i ask|may i ask|could you (?:repeat|explain|say)|i (?:just )?want(?:ed)? to (?:add|ask|say)|mr\.? (?:president|chairman)|madam chair|thank you (?:very much )?for|let'?s (?:thank|welcome)|please welcome|it is my (?:pleasure|privilege)|introduce)\b/i;
export const cueCount = (texts = []) => texts.filter((t) => CUE.test(String(t || '').trim())).length;

/** Thresholds chosen on the validation set (see the plan file): a window is FAR from the main voice below `tau`; a talk is
 *  single when at most `k` windows (and at most `frac` of them) are far. */
export const SCREEN = { tau: 0.75, k: 3, frac: 0.05, cues: 0, minWindows: 6 };

/** ON once validated (precision on 'single' ≥ 98 %); MEDIA_SPK_PRESCREEN=1|0 overrides either way. */
export const SCREEN_DEFAULT_ON = false;
export const screenEnabled = (env = process.env) => (env.MEDIA_SPK_PRESCREEN === '1' ? true : env.MEDIA_SPK_PRESCREEN === '0' ? false : SCREEN_DEFAULT_ON);

/**
 * The verdict for one talk.
 * @returns {{verdict:'single'|'multi'|'unsure', far:number, windows:number, reason:string}}
 */
export function classifyScreen({ sims = [], title = '', series = '', asrLang = '', texts = [] } = {}, p = SCREEN) {
  const n = sims.length, far = sims.filter((s) => s < p.tau).length, cues = cueCount(texts);
  const base = { far, windows: n, cues };
  if (asrLang === 'multi') return { ...base, verdict: 'multi', reason: 'interpreted talk' };
  if (MULTI_TITLE.test(`${title} ${series}`)) return { ...base, verdict: 'unsure', reason: 'title names more than one voice' };
  if (n < p.minWindows) return { ...base, verdict: 'unsure', reason: `only ${n} speech windows` };
  if (cues > p.cues) return { ...base, verdict: 'unsure', reason: `${cues} transcript line(s) with another person (a question, an introduction)` };
  if (far <= p.k && far <= p.frac * n) return { ...base, verdict: 'single', reason: `${far} of ${n} windows far from the main voice` };
  // a second voice that recurs (several far windows) is 'multi'; a few stray ones (noise, music, applause) 'unsure'
  return { ...base, verdict: far >= Math.max(3, 0.05 * n) ? 'multi' : 'unsure', reason: `${far} of ${n} windows far from the main voice` };
}

/** The single-speaker diarization: one turn over the whole recording. */
export const singleTurns = (duration) => [{ start: 0, end: Math.round((duration || 0) * 1000) / 1000, speaker: 'S1' }];
