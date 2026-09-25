// better-sqlite3 is synchronous: one slow read freezes the whole API (every search, /health). These two
// shapes were measured in slow_query_log freezing it: 47s (status embedding count) and 573×/day up to 4s
// (daily spend via date(timestamp), which cannot use idx_ai_usage_timestamp).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('API must not issue known event-loop-freezing queries', () => {
  it('server status does not COUNT `embedding IS NOT NULL` over content (reads a blob per row)', () => {
    expect(src('api/routes/admin.js')).not.toMatch(/COUNT\(\*\) as count FROM content WHERE embedding IS NOT NULL'/);
  });

  it('daily AI spend filters on the raw timestamp so the index is used', () => {
    expect(src('api/lib/ai-services.js')).not.toMatch(/date\(timestamp\)\s*=\s*date\('now'\)/);
  });
});
