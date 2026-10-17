// episodes-repo — doc_episodes (migration 157): the episodes of a predigested history (api/lib/episodes.js), written by
// the episode-extract ops job, read by the episodes route and the event index. Deps: db.js.
import { queryAll, transaction } from '../db.js';

/** A document's live paragraphs inside the given inclusive paragraph_index spans, in order. */
export async function paragraphsInSpans(docId, spans = []) {
  const out = [];
  for (const [from, to] of spans) {
    out.push(...await queryAll(`SELECT id, paragraph_index, text FROM content WHERE doc_id = ? AND paragraph_index BETWEEN ? AND ?
      AND deleted_at IS NULL AND COALESCE(is_duplicate, 0) = 0 AND LENGTH(text) > 0 ORDER BY paragraph_index`, [Number(docId), from, to], 'episodes:paragraphs'));
  }
  return out;
}

const J = (v) => (v == null ? null : JSON.stringify(v));

/** Insert or replace one episode (keyed by document + section order). */
export const saveEpisode = (e) => transaction([{ sql: `INSERT INTO doc_episodes (doc_id, section_id, ord, title, chapter, path, spans, para_ids,
    place, when_text, year_start, year_end, summary, participants, dropped, events, questions, issues, model, version, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(doc_id, ord) DO UPDATE SET section_id = excluded.section_id, title = excluded.title, chapter = excluded.chapter, path = excluded.path,
    spans = excluded.spans, para_ids = excluded.para_ids, place = excluded.place, when_text = excluded.when_text, year_start = excluded.year_start,
    year_end = excluded.year_end, summary = excluded.summary, participants = excluded.participants, dropped = excluded.dropped, events = excluded.events,
    questions = excluded.questions, issues = excluded.issues, model = excluded.model, version = excluded.version, updated_at = excluded.updated_at`,
args: [e.doc_id, e.section_id, e.ord, e.title, e.chapter, e.path, J(e.spans), J(e.para_ids), e.place ?? null, e.when_text ?? null, e.year_start ?? null,
  e.year_end ?? null, e.summary ?? null, J(e.participants), J(e.dropped), J(e.events), J(e.questions), J(e.issues), e.model ?? null, e.version ?? null,
  Math.floor(Date.now() / 1000)] }], 'episodes:save');

const parse = (r) => r && Object.fromEntries(Object.entries(r).map(([k, v]) => [k, ['spans', 'para_ids', 'participants', 'dropped', 'events', 'questions', 'issues'].includes(k) && v ? JSON.parse(v) : v]));

/** A document's episodes in order (optionally only one version's). */
export const episodesOfDoc = async (docId) =>
  (await queryAll('SELECT * FROM doc_episodes WHERE doc_id = ? ORDER BY ord', [Number(docId)], 'episodes:of-doc')).map(parse);
