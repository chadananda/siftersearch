// vocab-build ops job: the library's vocabulary for query spell-correction (search/spell.js) — every folded word seen at
// least `minFreq` times across all live paragraphs, with its frequency, most frequent first, written atomically to
// VOCAB_FILE (the API reloads it when it changes). One pass, paged by id; heavy lane. params { minFreq?, maxWords? }
import { mkdirSync, writeFileSync, renameSync } from 'fs';
import { dirname } from 'path';
import { textPage } from '../repos/vocab-repo.js';
import { wordsOf, VOCAB_FILE } from '../search/spell.js';

export async function vocabBuildJob({ minFreq = 3, maxWords = 3000000, file = VOCAB_FILE } = {}) {
  const counts = new Map();
  let after = 0, paragraphs = 0, tokens = 0;
  for (;;) {
    const page = await textPage(after, 5000);
    if (!page.length) break;
    for (const r of page) {
      for (const w of wordsOf(r.text)) { if (w.length >= 3 && w.length <= 30) { counts.set(w, (counts.get(w) || 0) + 1); tokens++; } }
      paragraphs++;
    }
    after = page[page.length - 1].id;
    // keep memory bounded on a long run: drop singletons once the table is very large
    if (counts.size > 12000000) for (const [w, n] of counts) if (n < 2) counts.delete(w);
  }
  const kept = [...counts].filter(([, n]) => n >= minFreq).sort((a, b) => b[1] - a[1]).slice(0, maxWords);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, kept.map(([w, n]) => `${w}\t${n}`).join('\n'));
  renameSync(`${file}.tmp`, file);
  return { paragraphs, tokens, distinct: counts.size, kept: kept.length, file, top: kept.slice(0, 10).map(([w]) => w) };
}
