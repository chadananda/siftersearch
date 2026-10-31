// Diarize + DeepFilterNet run on the GPU torch on every GPU host, never a CPU fallback (Chad 10-30). Source assertions: the worker
// image runs these files, so a regression here would silently put a GPU stage back on the CPU.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const tool = readFileSync('scripts/media/media_tool.py', 'utf8');
const rec = readFileSync('scripts/media/whole-worker/phases.mjs', 'utf8');

describe('GPU stages', () => {
  it('whole-recording jobs diarize with the torch port and run DFN in the GPU venv', () => {
    expect(rec).toMatch(/MEDIA_DIAR_PROVIDER[^\n]*'torch'/);
    expect(rec).toMatch(/MEDIA_DFN_PYTHON[^\n]*\/opt\/gate\/venv\/bin\/python/);
  });
  it('torch diarize uses torch_diar; ROCm without a port raises instead of falling back', () => {
    expect(tool).toMatch(/import torch_diar/);
    expect(tool).toMatch(/no CPU fallback/);
  });
  it('DFN checks its parameters landed on cuda', () => {
    expect(tool).toMatch(/DeepFilterNet did not land on the GPU/);
  });
});
