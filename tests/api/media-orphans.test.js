// Done talks off air with stages missing (11-01: 2664/2665/2702): the feed pass sends llm-stage orphans back to 'transcribed',
// never a held/busy/feed-stage one; the adoption row write (whole-result adoptedState); the orphan counts (media-status mediaOrphans).
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { mediaLanesFeedPass } from '../../api/lib/ops/media-jobs.js';
import { adoptedState } from '../../api/lib/media/whole-result.js';
import { mediaOrphans } from '../../api/lib/media/media-status.js';

const base = () => ({ nextToProcess: async () => [], nextTranscribed: async () => [], updateMediaItem: vi.fn(), nextToDownload: async () => [], youtubeHeldSince: async () => ({ n: 0 }) });

describe('orphan sweep in the feed pass', () => {
  it('a done, off-air talk with an llm stage next goes back to transcribed; feed stages (quiet), gpu/cpu stages and busy talks are left', async () => {
    const repo = { ...base(), offAirIncomplete: vi.fn(async () => [
      { id: 2664, next_stage: 'correct' }, { id: 2702, next_stage: 'quiet' }, { id: 7, next_stage: 'transcribe' }, { id: 9, next_stage: 'catalog' }, { id: 11, next_stage: 'assess' }] ) };
    const ops = { pendingRuns: async (t) => (t === 'media-item' ? [{ params: { id: 9 } }] : []) };
    const out = await mediaLanesFeedPass({ repo, ops, queue: vi.fn(), computeDepth: 0, llmDepth: 8, feedStages: ['quiet'] });
    expect(out.orphans).toEqual([2664, 11]);
    expect(repo.updateMediaItem).toHaveBeenCalledWith(2664, expect.objectContaining({ state: 'transcribed', stage: null }));
    expect(repo.updateMediaItem.mock.calls.map((c) => c[0])).toEqual([2664, 11]);
  });
  it('paced by the llm depth', async () => {
    const repo = { ...base(), offAirIncomplete: vi.fn(async () => [1, 2, 3, 4].map((id) => ({ id, next_stage: 'correct' }))) };
    const out = await mediaLanesFeedPass({ repo, ops: { pendingRuns: async () => [] }, queue: vi.fn(), computeDepth: 0, llmDepth: 2 });
    expect(out.orphans).toEqual([1, 2]);
  });
});

describe('adoptedState: the row write after a worker result replaces meta.json', () => {
  const stages = { archive: { at: 1 }, quiet: { at: 1 } };
  it('a waiting row and a done (not held) row both go to transcribed', () => {
    for (const state of ['whole_queued', 'scheduled', 'queued', 'running', 'done'])
      expect(adoptedState({ state }, stages)).toEqual({ state: 'transcribed', stage: null, stages_done: ',archive,quiet,' });
  });
  it('a held verdict, a failed/duplicate row, or a done row whose step was already adopted is not touched', () => {
    for (const verdict of ['review', 'unrepairable', 'archived']) expect(adoptedState({ state: 'done', verdict }, stages)).toBeNull();
    expect(adoptedState({ state: 'duplicate' }, stages)).toBeNull();
    expect(adoptedState({ state: 'done' }, stages, { alreadyAdopted: true })).toBeNull();
    expect(adoptedState({ state: 'running' }, stages, { alreadyAdopted: true })).toMatchObject({ state: 'transcribed' });
  });
});

describe('mediaOrphans (GET /ops/media/orphans)', () => {
  it('totals by next stage, with the first rows', async () => {
    const repo = { offAirIncompleteCounts: async () => [{ next_stage: 'quiet', n: 400 }, { next_stage: 'correct', n: 3 }], offAirIncomplete: async () => [{ id: 2664, slug: 'x', next_stage: 'correct', verdict: null }] };
    expect(await mediaOrphans(repo)).toEqual({ total: 403, by_next_stage: { quiet: 400, correct: 3 }, first: [{ id: 2664, slug: 'x', next_stage: 'correct', verdict: null }] });
  });
});
