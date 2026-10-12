// translator-repo — who translated what (migrations 131/141): coverage of content.translator (this text's own translator,
// partial index), content.translation_by (who made the English beside an original) and docs.translators. Deps: db.js.
import { queryAll, queryOne } from '../db.js';

/** Coverage of the translator columns: paragraphs per translator × basis, plus book-level and side-by-side counts. */
export async function translatorCoverage() {
  const [byTranslator, translationBy, books] = await Promise.all([
    queryAll(`SELECT translator, translator_basis AS basis, COUNT(*) AS paragraphs, COUNT(DISTINCT doc_id) AS docs
                FROM content WHERE translator IS NOT NULL AND deleted_at IS NULL GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 200`, [], 'translator:coverage'),
    queryAll(`SELECT translation_by AS translator, COUNT(*) AS paragraphs FROM content
               WHERE translation_by IS NOT NULL AND deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 50`, [], 'translator:translation-by'),
    queryOne(`SELECT SUM(translators IS NOT NULL AND translators NOT IN ('', '[]')) AS with_translators, COUNT(*) AS docs
                FROM docs WHERE deleted_at IS NULL`, [], 'translator:books'),
  ]);
  return { byTranslator, translationBy, books };
}
