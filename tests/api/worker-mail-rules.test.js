// Engagement rules for Anís's mail: reply vs outreach, kill switch, consent, stop, allowlist, cadence, caps; pause token.
import { describe, it, expect } from 'vitest';
import { sendDecision, settingsFrom, DEFAULTS, pauseToken, verifyPauseToken } from '../../worker/mail/rules.js';

const base = { kind: 'reply', suppressed: false, ignored: null, stopped: false, allowlisted: true, inboundCount: 1,
  daysSinceLastInbound: 0, outreachSinceLastInbound: 0, sentToPersonToday: 0, sentToday: 0 };
const on = settingsFrom([{ key: 'outreach_enabled', value: 'on' }]);

describe('replies', () => {
  it('answering someone who wrote is allowed, even after they paused outreach', () => {
    expect(sendDecision(base).ok).toBe(true);
    expect(sendDecision({ ...base, stopped: true }).ok).toBe(true);
  });
  it('never to a bounced/complained or ignored address, nor to someone who never wrote', () => {
    expect(sendDecision({ ...base, suppressed: true }).reason).toMatch(/suppressed/);
    expect(sendDecision({ ...base, ignored: 'bnc.org' }).reason).toMatch(/ignored/);
    expect(sendDecision({ ...base, inboundCount: 0 }).reason).toMatch(/needs a message/);
  });
  it('daily caps apply to replies too', () => {
    expect(sendDecision({ ...base, sentToPersonToday: 3 }).reason).toMatch(/this person/);
    expect(sendDecision({ ...base, sentToday: 200 }).reason).toMatch(/global/);
  });
});

describe('outreach (Anís writes first)', () => {
  const o = { ...base, kind: 'outreach', daysSinceLastInbound: 4 };
  it('is off by default (kill switch)', () => expect(sendDecision(o, DEFAULTS).reason).toMatch(/switched off/));
  it('when on: allowed on schedule to an allowlisted person who wrote', () => expect(sendDecision(o, on).ok).toBe(true));
  it('never after a pause or "stop"', () => expect(sendDecision({ ...o, stopped: true }, on).reason).toMatch(/paused/));
  it('only to people who have written', () => expect(sendDecision({ ...o, inboundCount: 0 }, on).reason).toMatch(/written/));
  it('alpha allowlist', () => {
    expect(sendDecision({ ...o, allowlisted: false }, on).reason).toMatch(/allowlist/);
    expect(sendDecision({ ...o, allowlisted: false }, { ...on, outreach_allowlist_only: 'off' }).ok).toBe(true);
  });
  it('cadence 3·5·12·25·44 days after their last message, then quiet', () => {
    expect(sendDecision({ ...o, daysSinceLastInbound: 2 }, on).reason).toMatch(/day 3/);
    expect(sendDecision({ ...o, outreachSinceLastInbound: 1, daysSinceLastInbound: 4 }, on).reason).toMatch(/day 5/);
    expect(sendDecision({ ...o, outreachSinceLastInbound: 4, daysSinceLastInbound: 44 }, on).ok).toBe(true);
    expect(sendDecision({ ...o, outreachSinceLastInbound: 5, daysSinceLastInbound: 400 }, on).reason).toMatch(/quiet/);
  });
  it('an unknown kind is refused', () => expect(sendDecision({ ...base, kind: 'blast' }, on).ok).toBe(false));
});

describe('pause token', () => {
  it('round-trips, is case-insensitive on the address, and cannot be forged', async () => {
    const t = await pauseToken('Reader@Example.org', 's3cret');
    expect(await verifyPauseToken(t, 's3cret')).toBe(t.split('.')[0]);
    expect(await pauseToken('reader@example.org', 's3cret')).toBe(t);
    expect(await verifyPauseToken(t, 'other')).toBeNull();
    expect(await verifyPauseToken(`${t.split('.')[0]}.${'0'.repeat(32)}`, 's3cret')).toBeNull();
    expect(await verifyPauseToken('junk', 's3cret')).toBeNull();
  });
});

describe('welcome letter', () => {
  const w = { ...base, kind: 'welcome', inboundCount: 0, allowlisted: true, welcomed: false };
  it('once, to someone on the list, while outreach is on', () => {
    expect(sendDecision(w, on).ok).toBe(true);
    expect(sendDecision(w, DEFAULTS).reason).toMatch(/switched off/);
    expect(sendDecision({ ...w, welcomed: true }, on).reason).toMatch(/already/);
    expect(sendDecision({ ...w, allowlisted: false }, on).reason).toMatch(/list/);
    expect(sendDecision({ ...w, stopped: true }, on).reason).toMatch(/paused/);
  });
});
