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
    frame: 'Write a letter of up to about 600 words; quote passages fully; greet and close as a friend would.',
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
