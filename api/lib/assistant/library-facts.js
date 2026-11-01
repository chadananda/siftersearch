// Questions about the library itself ("which religions are in the library?") answered from the catalogue's own counts
// (library-stats snapshot, no DB, no model) — never invented. Pure: religionsReply(stats) → reply text or null.
const NAMES = {
  "Baha'i": 'the Bahá’í Faith', Judaism: 'Judaism (Hebrew Bible / Torah)', Buddhist: 'Buddhism', Islam: 'Islam (the Qur’an and Muslim texts)',
  Christian: 'Christianity (the Bible and Christian texts)', Zoroastrian: 'Zoroastrianism', Hindu: 'Hinduism (the Vedas, the Gita and more)',
  Tao: 'Taoism', Confucian: 'Confucianism', Sikh: 'Sikhism', Jain: 'Jainism',
};
// a catalogue key that is a filing slug, not a tradition ("collection-08")
const JUNK = /^[a-z]+-\d+$/i;

/** → markdown reply listing each tradition with its document count, largest first; null when the snapshot has none. */
export function religionsReply(stats) {
  const rows = Object.entries(stats?.religionCounts || {}).filter(([k, n]) => k && !JUNK.test(k) && Number(n) > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!rows.length) return null;
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const lines = rows.map(([k, n]) => `- **${NAMES[k] || k}** — ${fmt(n)} document${n === 1 ? '' : 's'}`);
  return `The library holds texts from ${rows.length} religious traditions:\n\n${lines.join('\n')}\n\n`
    + 'You can search across all of them, or ask me to keep to one tradition.';
}
