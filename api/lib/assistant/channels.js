// Anis channel registry — each channel is DATA both Jev and code consult: its description (for format choice), the
// formatter's frame (length/tone), capabilities (which formats code may offer), link/news caps and renderer. Adding a
// channel = an entry + an adapter. Unknown → the most conservative entry. Privileged frames (the long email letter) are
// granted only by our own adapters — never by a caller who claims them. Pure. Deps: none.
export const CHANNELS = {
  'widget-chat': {
    description: 'a small chat window embedded on a website; brief answers',
    frame: 'Reply in under about 80 words: two to four sentences and at most one short quotation, unless the person asked for more. Quote briefly.'
      + ' Give the shortest reply that fully answers what was asked: no preamble, no restating the question, no commentary, summaries or offers the reader did not ask for — they can always ask for more. A passage, table or document they asked for is given whole.',
    capabilities: ['links', 'lists', 'quotes'], linkCap: 1, newsCap: 1, renderer: 'markdown-lite', privileged: false,
    live: true, progress: true,   // progress: narrate.js says what is happening while a longer stage runs (a future voice channel sets it too)
    // a reader watches the screen: first text within seconds (respond.js liveResearch, the thinking-off writer)
  },
  'site-chat': {
    description: 'the chat on siftersearch.com; brief-to-moderate answers',
    frame: 'Reply in under about 80 words: two to four sentences and at most one short quotation, unless the person asked for more.'
      + ' Give the shortest reply that fully answers what was asked: no preamble, no restating the question, no commentary, summaries or offers the reader did not ask for — they can always ask for more. A passage, table or document they asked for is given whole.',
    capabilities: ['links', 'lists', 'quotes', 'tables', 'headings'], linkCap: 2, newsCap: 1, renderer: 'markdown', privileged: false,
    live: true, progress: true,
  },
  email: {
    description: 'a considered letter by email',
    frame: 'Write a letter of up to about 600 words; quote passages fully; greet and close as a friend would.'
      // Chad 10-23: a "line by line" written as `- هو الله: *He is God.*` bullets arrived scrambled; the renderer
      // (api/lib/mail-render.js) draws this block as a two-column table, original right, English left
      + ' To set an Arabic/Persian original beside its English line by line, write a fenced block: a line "```bilingual", then for each line the original on one line and its English on the next, a blank line between pairs, then "```" — never put the two scripts in one line or bullet. ONE PAIR PER LINE OF THE ORIGINAL — a line is a clause or verse of the text, not a printed line (rejoin words a page or scan broke across lines first) — every line its own pair, never two merged: where an existing translation renders several lines in one sentence, split its words at the matching clauses so each original line gets the part that translates it, verbatim. End each English line with a source marker, <sup>1</sup>, <sup>2</sup>…, numbered in order of first use, and after the block one short line naming each: e.g. "<sup>1</sup> Authorized translation by Shoghi Effendi, *Work* · <sup>2</sup> Provisional translation by Stephen Phelps (public domain) · <sup>3</sup> Provisional translation by Anís".',
    capabilities: ['links', 'lists', 'quotes', 'tables', 'headings', 'charts', 'rtl'], linkCap: 3, newsCap: 1, renderer: 'email-html', privileged: true,
  },
};
export const CONSERVATIVE = 'widget-chat';

/** Resolve a channel. A privileged channel is honoured only when our own adapter says so (trusted=true). */
export function channelFor(name, { trusted = false } = {}) {
  const c = CHANNELS[name];
  if (!c || (c.privileged && !trusted)) return { id: CONSERVATIVE, ...CHANNELS[CONSERVATIVE] };
  return { id: name, ...c };
}

/** The reply-length frame from Jev's DEPTH for this turn (triage `depth`), never from the wording: depth = research on a chat
 *  channel replaces the brief chat frame (11-03: stories stopped at 2.4-3.6k characters under "about 150-250 words", before
 *  the climax, while the baseline told them in ~7.5k). Any other depth keeps the channel's own frame. Pure. */
export const DEPTH_FRAME = 'The person asked for a full answer: give what they asked for fully — a story told in order through to its end (its climax and outcome), every side they asked about covered — and no longer than that needs. No padding, no preamble; each paragraph carries passages or specifics.';
export function frameFor(channel = {}, depth = null) {
  if (depth === 'research' && channel?.live) return DEPTH_FRAME;
  return channel?.frame ?? null;
}

/** A letter greets its reader by the name their mail client sends (11-11: replies opened "Hello!" — the From name never
 *  reached the writer). Display names are reader-controlled: one line, ≤60 chars, no quotes. Pure. */
export function greetByName(frame, channel = {}, name = null) {
  const n = String(name || '').replace(/[\u0000-\u001f"<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!frame || channel?.renderer !== 'email-html' || !n || n.includes('@')) return frame;
  return `${frame} The reader's mail client gives their name as "${n}": greet them by it (the given name, when it reads as a person's name).`;
}

/** Formats a channel can display: drop any whose needs the channel lacks. */
export const supports = (channel, needs = []) => needs.every((n) => channel.capabilities.includes(n));
