// Dewey's add_media tool: a URL or a server path under the media folders queues a media-scan; anything else is refused.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
const enqueue = vi.fn(async () => ({ id: 42 }));
vi.mock('../../api/lib/repos/ops-report-repo.js', () => ({ enqueue }));
const { makeTools, TOOLS } = await import('../../api/lib/dewey/agent.js');

describe('dewey add_media', () => {
  const tools = makeTools({ by: 'chad', emit: () => {}, attachSource: vi.fn(), accept: vi.fn() });
  it('is offered to the model', () => expect(TOOLS.map((t) => t.function.name)).toContain('add_media'));
  it('queues a media-scan for a YouTube URL', async () => {
    const r = JSON.parse(await tools.add_media({ url: 'https://www.youtube.com/watch?v=x7y0Eagxq8U' }));
    expect(r).toMatchObject({ queued: true, run: 42 });
    expect(enqueue).toHaveBeenCalledWith('media-scan', { urls: ['https://www.youtube.com/watch?v=x7y0Eagxq8U'], paths: [], roots: [], batch: 1 }, 'chad');
  });
  it('refuses paths outside the media folders', async () => {
    expect(JSON.parse(await tools.add_media({ path: '/etc/passwd' })).error).toMatch(/must be under/);
    expect(JSON.parse(await tools.add_media({ path: '/tank/media/../etc/x' })).error).toMatch(/must be under/);
    expect(JSON.parse(await tools.add_media({})).error).toMatch(/needed/);
  });
});
