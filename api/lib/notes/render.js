// Render kept notes in Chad's format. Storage holds MEANING; presentation happens here — which is what keeps
// the future OceanLibrary exporter a mapping rather than a rewrite (planning/dawn-breakers-notes-plan.md §7.1).
//
//   **¶ 37**
//   * **Name:** ...
//   * **Person:** ...
//   Only the headings with something to say.
// Deps: profiles supply the category → label map.

/** Group notes by paragraph, preserving reading order. */
const byParagraph = (notes) => {
  const m = new Map();
  for (const n of notes) {
    const k = n.paragraph_index ?? n.paragraphIndex;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(n);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
};

/**
 * Markdown for a chapter's notes. `categories` comes from the profile so a book with different categories
 * renders with its own labels and in its own declared order.
 */
export function renderChapter(notes, { categories = [], chapterTitle = null, includeSources = true } = {}) {
  const label = new Map(categories.map((c) => [c.key, c.label]));
  const order = new Map(categories.map((c, i) => [c.key, i]));
  const out = [];
  if (chapterTitle) out.push(`## ${chapterTitle}`, '');

  for (const [idx, group] of byParagraph(notes)) {
    out.push(`**¶ ${idx}**`, '');
    // Category order follows the profile's declaration, not the order the model happened to emit.
    const sorted = [...group].sort((a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99));
    for (const n of sorted) {
      const body = (n.edited_body || n.body || '').trim();
      if (!body) continue;
      // An interpretive link must never be presentable as doctrine — the label rides with the note.
      const kind = n.claim_kind || n.claimKind;
      const marker = kind === 'strong_parallel' ? ' _(parallel)_' : kind === 'interpretive' ? ' _(interpretive)_' : '';
      let line = `* **${label.get(n.category) || n.category}:**${marker} ${body}`;
      if (includeSources) {
        const src = typeof n.sources_json === 'string' ? safeParse(n.sources_json) : (n.sources || []);
        if (src?.length) line += `  ${src.map(citation).join(' ')}`;
      }
      out.push(line);
    }
    out.push('');
  }
  return out.join('\n').trim() + '\n';
}

const safeParse = (s) => { try { return JSON.parse(s); } catch { return []; } };

/** The app's working citation scheme: ${source_url}?paraId=para_NNNN. Reused, not reinvented. */
export function citation(s) {
  if (s?.url) return `([source](${s.url}))`;
  if (s?.paraId && s?.sourceUrl) return `([¶](${s.sourceUrl}?paraId=${s.paraId}))`;
  if (s?.paraId) return `(${s.paraId})`;
  return s?.docId ? `(doc ${s.docId})` : '';
}
