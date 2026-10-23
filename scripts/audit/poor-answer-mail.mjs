// The [ACTION] "Anís answer needs a look" alert body, as Markdown (rendered by services/email.js → lib/mail-render.js).
// Pure; used by audit-exchanges.mjs. Chad 10-22: the alert showed the reply's raw Markdown inside a <pre>.

/** A long reply cut at a paragraph (never inside a link or a bold run, which left raw Markdown in the alert). Pure. */
export function cutAtParagraph(md, max = 6000) {
  const s = String(md || '');
  if (s.length <= max) return s;
  const at = s.lastIndexOf('\n\n', max);
  return `${s.slice(0, at > max / 2 ? at : max).trimEnd()}\n\n*… (cut; the whole reply is in the thread)*`;
}

/** The poor-answer alert as Markdown: the reader's question quoted, Anís's reply as the reader saw it, the audit as a list. Pure. */
export function poorAnswerMarkdown({ row, question, verdict: v }) {
  const quote = (s) => String(s || '').split('\n').map((l) => `> ${l}`).join('\n');
  const probs = (Array.isArray(v.problems) ? v.problems : []).slice(0, 8).map((p) => `- **${p.kind}**: ${p.detail}`).join('\n');
  const vs = v.vs_competitor?.verdict && v.vs_competitor.verdict !== 'no-comparison'
    ? `\n\n### vs Perplexity: ${v.vs_competitor.verdict.toUpperCase()}\n\n- **they gave**: ${v.vs_competitor.they_gave || '?'}\n- **we gave**: ${v.vs_competitor.we_gave || '?'}` : '';
  return `Anís's answer needs a look (${row.channel || 'chat'}, ${row.answered_at || ''} UTC)\n\n### Question\n\n${quote(String(question).slice(0, 1500))}\n\n`
    + `### Anís replied\n\n${cutAtParagraph(row.content)}\n\n---\n\n`
    + `### Audit\n\nanswered **${v.evidence?.answered || '?'}** · strategy ${v.strategy_used || '?'} → best ${v.best_strategy || '?'}${v.summary ? `\n\n${v.summary}` : ''}${probs ? `\n\n${probs}` : ''}${vs}`
    + `\n\n[Open the thread](https://siftersearch.com/admin/anis#threads/${row.session_id})`;
}
