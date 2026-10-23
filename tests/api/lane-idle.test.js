// system-checks: prep paused by backpressure is not "compute idle" (10-23).
import { describe, it, expect } from 'vitest';
import { idleLanes } from '../../scripts/lib/lane-idle.mjs';

describe('idle lanes', () => {
  it('compute idle with 327 waiting but 12 prepped and ASR running → backpressure, no warning', () => {
    expect(idleLanes({ compute_backlog: 327, compute_running: 0, asr_backlog: 12, asr_running: 6 }).compute).toBe(false);
  });
  it('compute idle while the ASR buffer is low → warn', () => {
    expect(idleLanes({ compute_backlog: 327, compute_running: 0, asr_backlog: 2, asr_running: 6 }).compute).toBe(true);
  });
  it('compute idle while the ASR hosts are idle too → warn, whatever the buffer', () => {
    expect(idleLanes({ compute_backlog: 327, compute_running: 0, asr_backlog: 15, asr_running: 0 }).compute).toBe(true);
  });
  it('LLM idle with a backlog → warn', () => {
    expect(idleLanes({ llm_backlog: 3, llm_running: 0 }).llm).toBe(true);
    expect(idleLanes({ llm_backlog: 3, llm_running: 2 }).llm).toBe(false);
  });
});
