// Exit lint: one passage quoted twice in a reply keeps only the copy linked to its place (11-11 suffering reply).
import { describe, it, expect } from 'vitest';
import { dropRepeatedQuote, formPass } from '../../api/lib/assistant/lint.js';

const BLOCK = '> It is strange how much suffering man has to put up with while on this earth. Our consolation should be however that it is part of a divine plan whose worth we cannot yet fathom…. ([Unfolding Destiny, Excerpts from Letters to Individuals, #8.35](https://oceanlibrary.com/unfolding-destiny_shoghi-effendi))';
const LINKED = '[*"It is strange how much suffering man has to put up with while on this earth. Our consolation should be however that it is part of a divine plan whose worth we cannot yet fathom…."*](https://oceanlibrary.com/unfolding-destiny_shoghi-effendi/?paraId=para_3732) — *Unfolding Destiny*, letters to individuals';

describe('dropRepeatedQuote', () => {
  it('keeps the place-linked copy when the whole-book block quote comes first', () => {
    const r = dropRepeatedQuote(['Shoghi Effendi says so:', BLOCK, LINKED, 'He begins by admitting it.'].join('\n\n'));
    expect(r.fixed).toBe(1);
    expect(r.text).not.toContain('#8.35');
    expect(r.text).toContain('paraId=para_3732');
    expect(r.text).toContain('He begins by admitting it.');
  });
  it('keeps the first when neither is better placed', () => {
    const r = dropRepeatedQuote([LINKED, LINKED.replace('para_3732', 'para_9')].join('\n\n'));
    expect(r.fixed).toBe(1);
    expect(r.text).toContain('para_3732');
    expect(r.text).not.toContain('para_9');
  });
  it('leaves distinct quotes and short echoes alone', () => {
    const t = [BLOCK, '[*"Perhaps that which hath befallen thee will cause the hidden bounties of God to be made manifest."*](https://x.org/a)', '> *"So pray."*', '> *"So pray."*'].join('\n\n');
    expect(dropRepeatedQuote(t)).toEqual({ text: t, fixed: 0 });
  });
  it('runs at the exit (formPass) and reports the repair', () => {
    const r = formPass([BLOCK, LINKED].join('\n\n'));
    expect(r.repairs.repeated_quote).toBe(1);
    expect(r.text).not.toContain('#8.35');
  });
});
