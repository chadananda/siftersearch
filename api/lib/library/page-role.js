// PAGE ROLE — is a library page the WORK itself, or only information ABOUT a work (catalogue / inventory / abstract /
// download page), or site navigation? Chad 10-09: "Use clef to classify pages that are only metadata and not the actual
// document in question." One System-1 question per page (task 'page-role', Clef primary, Jev shadow logged for agreement).
// Pure: the state, the question, the parse. The runner is scripts/library/classify-page-role.mjs.

export const TASK = 'page-role';
export const VERSION = 'page-role-v3';   // v2: markup stripped (pages open with ~1.5k chars of chrome); v3: abstract-only pages named
export const ROLES = Object.freeze({
  document: 'the WORK ITSELF, whole or in part, with its running text — an article, paper, chapter, letter, memorandum, talk, '
    + 'review, obituary, encyclopedia entry, study guide or Tablet, even when short or when it opens with an abstract, byline or contents',
  metadata: 'only information ABOUT one work whose text is elsewhere — a page whose whole text is an "Abstract:" or "About:" '
    + 'summary (however well written) plus notes or links, a bibliographic record, a catalogue or inventory entry (codes, an '
    + 'opening line or two), or a page that only links to a PDF / offsite copy',
  navigation: 'not about one work — a list of many works (tag, category, bibliography, chronology, author or search listing), '
    + 'site chrome only, or an empty or unreadable page',
});

/** Page text without markup: html tags/comments, images, link targets (link text kept), table and emphasis punctuation. */
export function plainText(md) {
  return String(md || '')
    .replace(/^---\n[\s\S]*?\n---\n/, '')                  // frontmatter describes the FILE, not the page
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')                     // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')                    // links → their text
    .replace(/&nbsp;|&gt;|&lt;|&amp;/g, ' ').replace(/[|*_#>]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

/** The state System-1 reads: what the page claims to be, and how it begins and ends. */
export function pageRoleState({ title, file, site, paragraphs }, text) {
  const body = plainText(text);
  const head = clip(body, 1500), tail = body.length > 2200 ? clip(body.slice(-300), 300) : '';
  return [
    `SITE: ${site || 'library'}`, `TITLE: ${clip(title, 200)}`, `FILE: ${clip(file, 160)}`,
    `LENGTH: ${body.length} characters of text${paragraphs != null ? `, ${paragraphs} stored paragraphs` : ''}`,
    `BEGINNING:\n${head || '(empty)'}`, ...(tail ? [`END:\n${tail}`] : []),
  ].join('\n');
}

export const QUESTIONS = Object.freeze({
  role: { type: 'choice', criteria: ROLES, instructions: 'What is this page: the work itself, information about a work, or site navigation? A short page that is only an abstract or summary of a paper is metadata, not the paper.' },
});

/** → { role, confidence } or null. */
export function parseRole(answers) {
  const a = answers?.role;
  const role = a?.choice ?? a?.value ?? null;
  return role && ROLES[role] ? { role, confidence: Number(a?.confidence ?? 0) } : null;
}
