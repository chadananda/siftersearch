// Ops reports — the named, server-side answers to "is the library healthy?". Each runs inside siftersearch-reports (never
// the API: they scan whole tables), one at a time, and returns plain JSON stored in ops_report_runs. Add a report here,
// not a script. Deps: integrity-repo, language-repo, phrase-store-repo, language-codes.
import { deletionsByDay, hollowDocs, liveParagraphsByScope } from '../repos/integrity-repo.js';
import { docLanguageCounts } from '../repos/language-repo.js';
import { coverageByScope, monthSpend } from '../repos/phrase-store-repo.js';
import { normLang } from '../language-codes.js';

export const REPORTS = {
  /** Live books with no text, or with empty rows — per source, with sample ids. */
  async hollow() {
    const rows = await hollowDocs();
    const by = {};
    for (const r of rows) {
      const s = (by[r.source] ||= { hollow_no_rows: 0, hollow_empty_rows: 0, docs_with_some_empty_rows: 0, empty_rows: 0, ids: [] });
      if (!r.rows) s.hollow_no_rows++; else if (!r.with_text) s.hollow_empty_rows++; else s.docs_with_some_empty_rows++;
      s.empty_rows += r.empty_rows || 0;
      if (s.ids.length < 50) s.ids.push(r.id);
    }
    return { affected_docs: rows.length, by_source: by };
  },
  /** Soft-deleted paragraphs per day × source — explains a content-drop alert. params: { days } */
  async deletions({ days = 14 } = {}) {
    const rows = await deletionsByDay(days);
    return { days, total: rows.reduce((n, r) => n + r.paragraphs, 0), rows };
  },
  /** Doc language labels, flagging any that are not normalised. */
  async languages() {
    const rows = await docLanguageCounts();
    return { labels: rows.sort((a, b) => b.docs - a.docs), not_normalised: rows.filter((r) => r.language && normLang(r.language) !== r.language) };
  },
  /** Phrase-index coverage vs live paragraphs, per scope × religion, and the $ to finish at the measured cost per paragraph. */
  async 'phrase-coverage'() {
    const months = monthSpend();
    const covered = coverageByScope();
    const live = await liveParagraphsByScope();
    const key = (r) => `${r.scope}|${r.religion}`;
    const cov = new Map(covered.map((r) => [key(r), r.paragraphs]));
    const spent = months.reduce((n, m) => n + (m.usd || 0), 0);
    const coveredTotal = covered.reduce((n, r) => n + r.paragraphs, 0);
    const perPara = coveredTotal ? spent / coveredTotal : 0;
    const rows = live.map((r) => { const c = cov.get(key(r)) || 0; return { scope: r.scope, religion: r.religion, live: r.paragraphs, covered: c, missing: Math.max(0, r.paragraphs - c) }; })
      .sort((a, b) => b.missing - a.missing);
    const missing = rows.reduce((n, r) => n + r.missing, 0);
    return { months, spent_usd: +spent.toFixed(2), covered_paragraphs: coveredTotal, usd_per_paragraph: +perPara.toFixed(6), missing_paragraphs: missing,
      est_usd_to_finish: +(missing * perPara).toFixed(0), note: 'upper bound: identical phrase text is embedded once', rows };
  },
};

export const reportNames = () => Object.keys(REPORTS);
