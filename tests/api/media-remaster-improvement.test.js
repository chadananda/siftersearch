import { expect, it } from 'vitest';
import { remasterImprovement } from '../../api/lib/media/talk-audio.js';
import { qualityOf } from '../../api/lib/media/remaster-quality.js';
const meta = () => ({ web_original: { ogg: 'original.ogg' }, remaster_tier: 'heavy', remaster: { status: 'done' }, qa: { remaster: { output_assessment: { passed: true, reference: { nisqa: [1.49] }, restored: { nisqa: [3.13] }, samples: [{},{},{}] } } } });
it('shows paired model-score improvement and retains its measurement through QA refresh', () => {
  const m = meta(); expect(remasterImprovement(m)).toMatchObject({ percent: 110, before: 1.49, after: 3.13, estimated: true });
  m.qa.remaster = qualityOf(m); expect(remasterImprovement(m).percent).toBe(110);
});
it('does not invent gains for unassessed, held, light-only or worse results', () => {
  expect(remasterImprovement({})).toBeNull();
  for (const change of [m => m.remaster.status='review', m => m.remaster_tier='light', m => m.qa.remaster.output_assessment.passed=false, m => m.qa.remaster.output_assessment.restored.nisqa=[1.2]]) {
    const m=meta(); change(m); expect(remasterImprovement(m)).toBeNull();
  }
});
