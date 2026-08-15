// A CTE is a read. Getting this wrong cost more than a wrong label.
//
// The classifier matched only /^SELECT/, so every `WITH ... SELECT` was filed as a WRITE. That mislabelled
// the alert email ("worst 55.0s write" for a SELECT) and — the expensive part — suppressed EXPLAIN QUERY
// PLAN capture, which is gated on isSelect. The single query we most needed to understand was the one whose
// plan was never recorded, and two rounds of reasoning about it were both wrong.
import { describe, it, expect } from 'vitest';

const WITH_WRITE = /^\s*WITH\b[\s\S]*?\b(INSERT|UPDATE|DELETE)\b/i;
const IS_SELECT = /^\s*(SELECT|WITH)\b/i;
const kindOf = (sql) => (IS_SELECT.test(sql) && !WITH_WRITE.test(sql) ? 'read' : 'write');

describe('query kind classification', () => {
  it('a plain SELECT is a read', () => {
    expect(kindOf('SELECT 1')).toBe('read');
    expect(kindOf('  \n SELECT doc_id FROM content')).toBe('read');
  });

  it('a CTE ending in SELECT is a READ — the case that was wrong', () => {
    expect(kindOf(`WITH per_doc AS (SELECT doc_id, COUNT(*) FROM content GROUP BY doc_id)
                   SELECT language FROM docs JOIN per_doc ON 1=1`)).toBe('read');
  });

  it('genuine writes stay writes', () => {
    for (const sql of ['INSERT INTO content VALUES (1)', 'UPDATE docs SET language=?',
      'DELETE FROM content WHERE id=?', 'CREATE INDEX x ON content(doc_id)', 'DROP INDEX x']) {
      expect(kindOf(sql)).toBe('write');
    }
  });

  it('a DATA-MODIFYING CTE is still a write — SQLite allows WITH ... INSERT/UPDATE/DELETE', () => {
    expect(kindOf('WITH x AS (SELECT id FROM docs) INSERT INTO content SELECT * FROM x')).toBe('write');
    expect(kindOf('WITH x AS (SELECT id FROM docs) DELETE FROM content WHERE doc_id IN (SELECT id FROM x)')).toBe('write');
  });
});
