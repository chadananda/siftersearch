// Anís's spoken progress lines (narrate.js): template rows 'narrate.<key>', one variant per line, warm first person, no machinery words.
// Seeded into the strategy catalog by strategy-seed.js (TEMPLATES) so the words are data like every writer instruction. Slots: {{book}}.
const t = (key, ...lines) => ({ id: `narrate.${key}`, version: 1, text: lines.join('\n') });
export const NARRATION_TEMPLATES = [
  t('unmatched.new', "That's a good question — I don't think I've had one quite like it before…", "Now that is an interesting question. I haven't met one quite like it…", "What a thoughtful question — I haven't been asked this exact thing before…"),
  t('unmatched.planning', "I'm working out how best to go about researching this…", "Let me think about the best way to research this for you…", "I'm thinking through a research plan for your question…"),
  t('unmatched.planned', "I have a plan now, and I'm working through it…", "I've put together a way to approach this, and I'm on it now…", "The research plan is ready — working through it now…"),
  t('unmatched.recheck_fit', "I know just the way to approach this — one moment…", "This is something I know how to do well — starting now…"),
  t('research.round', "Let me look a little further…", "Following a lead in the texts…", "Checking one more thing in the library…"),
  t('research.reading', "I'm reading more closely in {{book}}…", "Reading around the passages I found in {{book}}…", "Taking a closer look at {{book}}…"),
  t('research.reading_more', "I'm reading more closely around the passages I found…", "Taking a closer look at the books these come from…"),
  t('strategy.compilation.start', "I'm gathering the passages together for you…", "Collecting what the texts say, one source at a time…"),
  t('strategy.understanding.start', "I'm reading the passage closely to explain it…", "Let me read this carefully, and in its context…"),
  t('strategy.comparison.start', "I'm looking at each side in its own sources first…", "Reading what each tradition says in its own words…"),
  t('deep_report.queued', "This deserves a fuller study — I've started a deeper report while I answer…", "I've begun a longer piece of research on this, and I'll give you what I have now…"),
];
