// What happens to rows referencing a paragraph a re-ingest removes (api/lib/paragraph-dependents.js).
import { describe, it, expect } from 'vitest';
import { detachStatements, findSuccessor, reattachStatements } from '../../api/lib/paragraph-dependents.js';

describe('paragraph dependents', () => {
  it('nulls nullable links, deletes derived rows, and skips tables that do not exist', () => {
    const st = detachStatements([7, 8], new Set(['paragraph_extractions', 'set_members']));
    expect(st.map((s) => s.sql)).toEqual(['DELETE FROM paragraph_extractions WHERE content_id IN (?,?)', 'UPDATE set_members SET source_paragraph_id = NULL WHERE source_paragraph_id IN (?,?)']);
    expect(detachStatements([])).toEqual([]);
  });
  it('finds the merged paragraph that now holds a fragment\'s text', () => {
    const fresh = [{ id: 1, text: 'Intro.' }, { id: 2, text: 'with whom the Bahá’ís of the West or <pb/> Middle East have little in common culturally.' }];
    expect(findSuccessor('Middle East have little in common culturally.', fresh)).toBe(2);
    expect(findSuccessor('x', fresh)).toBeNull();
  });
  it('re-creates a saved research quote on its successor and reports the lost', () => {
    const stash = [{ table: 'deep_research_quotes', col: 'para_id', row: { id: 5, para_id: 9, quote: 'q', session_id: 3 }, oldText: 'Middle East have little in common culturally and socially.' },
      { table: 'deep_research_quotes', col: 'para_id', row: { id: 6, para_id: 10, quote: 'r', session_id: 3 }, oldText: 'text that vanished entirely from the new version of the file' }];
    const { statements, lost } = reattachStatements(stash, [{ id: 42, text: 'the West or Middle East have little in common culturally and socially.' }]);
    expect(statements).toEqual([{ sql: 'INSERT INTO deep_research_quotes (para_id, quote, session_id) VALUES (?, ?, ?)', args: [42, 'q', 3] }]);
    expect(lost).toEqual([{ table: 'deep_research_quotes', id: 6 }]);
  });
});
