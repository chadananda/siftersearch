// Queue agent thermal guard (gpu-pace thermalHold): no new claims at a part's ceiling; held until `cool` degrees under.
import { describe, it, expect } from 'vitest';
import { thermalHold } from '../../scripts/media/worker/gpu-pace.mjs';

describe('thermalHold', () => {
  const lim = { maxCpuC: 90, maxGpuC: 80 };
  it('no ceilings, no hold', () => expect(thermalHold({ cpuC: 99, gpuC: 99 })).toBeNull());
  it('holds at the GPU ceiling (11-03 aorus: 83 °C in thermal slowdown)', () => expect(thermalHold({ cpuC: 70, gpuC: 83 }, lim)).toMatch(/^gpu 83/));
  it('holds at the CPU ceiling', () => expect(thermalHold({ cpuC: 91.4, gpuC: 60 }, lim)).toMatch(/^cpu 91/));
  it('under both ceilings: claims', () => expect(thermalHold({ cpuC: 85, gpuC: 75 }, lim)).toBeNull());
  it('once held, stays held until 4 °C under', () => {
    expect(thermalHold({ cpuC: 70, gpuC: 78 }, { ...lim, held: true })).toMatch(/^gpu/);
    expect(thermalHold({ cpuC: 70, gpuC: 75 }, { ...lim, held: true })).toBeNull();
  });
  it('unreadable sensors never hold', () => expect(thermalHold({ cpuC: null, gpuC: null }, lim)).toBeNull());
});
