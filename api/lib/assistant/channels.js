// Anis channel registry — each channel is DATA both Jev and code consult: its description (for format choice), the
// formatter's frame (length/tone), capabilities (which formats code may offer), link/news caps and renderer. Adding a
// channel = an entry + an adapter. Unknown → the most conservative entry. Privileged frames (the long email letter) are
// granted only by our own adapters — never by a caller who claims them. Pure. Deps: none.
export const CHANNELS = {
  'widget-chat': {
    description: 'a small chat window embedded on a website; brief answers',
    frame: 'Reply in about 150 words unless the question truly needs more. Quote briefly.',
    capabilities: ['links', 'lists', 'quotes'], linkCap: 1, newsCap: 1, renderer: 'markdown-lite', privileged: false,
  },
  'site-chat': {
    description: 'the chat on siftersearch.com; brief-to-moderate answers',
    frame: 'Reply in about 150–250 words unless the question truly needs more.',
    capabilities: ['links', 'lists', 'quotes', 'tables', 'headings'], linkCap: 2, newsCap: 1, renderer: 'markdown', privileged: false,
  },
  email: {
    description: 'a considered letter by email',
    frame: 'Write a letter of up to about 600 words; quote passages fully; greet and close as a friend would.'
      // Chad 10-23: a "line by line" written as `- هو الله: *He is God.*` bullets arrived scrambled; the renderer
      // (api/lib/mail-render.js) draws this block as a two-column table, original right, English left
      + ' To set an Arabic/Persian original beside its English line by line, write a fenced block: a line "```bilingual", then for each line the original on one line and its English on the next, a blank line between pairs, then "```" — never put the two scripts in one line or bullet. ONE PAIR PER LINE OF THE ORIGINAL, every line its own pair, never two lines merged: where an existing translation renders several lines in one sentence, split its words at the matching clauses so each original line gets the part that translates it, verbatim. End each English line with a source marker, <sup>1</sup>, <sup>2</sup>…, numbered in order of first use, and after the block one short line naming each: e.g. "<sup>1</sup> Authorized translation by Shoghi Effendi, *Work* · <sup>2</sup> Provisional translation by Stephen Phelps (public domain) · <sup>3</sup> Provisional translation by Anís".',
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

/** Formats a channel can display: drop any whose needs the channel lacks. */
export const supports = (channel, needs = []) => needs.every((n) => channel.capabilities.includes(n));
