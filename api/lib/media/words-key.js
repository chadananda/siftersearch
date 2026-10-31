// wordsKey: what a worker result is valid for — the transcript's WORDS, not its file bytes (planning/stage-queue-20261031.md §5).
// sha256 of the JSON [[n, lang, [w…]] per paragraph]; timing re-stamps (s/e/s0/e0/t0/t1), speakers, sentences keep the key.
// Python twin: scripts/media/worker/words_key.py — both must match tests/fixtures/words-key.json.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const wordsCanon = (work) => JSON.stringify((work?.paragraphs || []).map((p) => [p.n ?? null, p.lang ?? null, (p.words || []).map((w) => w.w ?? null)]));
export const wordsKey = (work) => createHash('sha256').update(wordsCanon(work), 'utf8').digest('hex');
export const wordsKeyFile = async (f) => wordsKey(JSON.parse(await readFile(f, 'utf8')));
