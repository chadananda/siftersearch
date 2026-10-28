// Dewey notices: a stopped job says why, items are named, identical reasons group, the greeting uses the person's name.
import { describe, it, expect } from 'vitest';
import { emailFor, chatText, groupByWhy, nameOf } from '../../api/lib/dewey/jobs/notify.js';

const kid = (i, state, result = null, error = null) => ({ id: i, state, params: { title: `Talk ${i}`, speaker: 'Dr. Jane Faily', year: '1985' }, result, error });
const job = (state, result = null) => ({ id: 1, kind: 'batch', state, params: { name: 'Images International talks' }, result, created_by: 'chadananda@gmail.com (email)', counts: {} });

describe('stopped jobs', () => {
  const kids = Array.from({ length: 12 }, (_, i) => kid(i + 2, 'cancelled', { reason: 'cancelled', why: 'the audio server is not answering' }));
  it('states the cause, what was done and what happens next; never a list of identical lines', () => {
    const e = emailFor(job('cancelled', { reason: 'the audio host refuses connections', by: 'Claude', did: 'nothing was changed', next: 'Dewey retries every hour' }), kids, 'final', { name: 'Admin', to: 'chadananda@gmail.com' });
    expect(e.subject).toMatch(/^Dewey: stopped/);
    expect(e.subject).not.toMatch(/0 of/);
    expect(e.md).toMatch(/^Dear Chad,/);
    expect(e.md).toMatch(/Why: the audio host refuses connections \(Claude\)/);
    expect(e.md).toMatch(/What I did: nothing was changed/);
    expect(e.md).toMatch(/What happens next: Dewey retries every hour/);
    expect(e.md).not.toMatch(/the file from/);
  });
  it('is honest when no reason was recorded', () => {
    const e = emailFor(job('cancelled', { reason: 'cancelled' }), kids, 'final');
    expect(e.md).toMatch(/no reason was recorded/);
    expect(chatText(job('cancelled', { reason: 'cancelled' }), kids, 'final')).toMatch(/was stopped before it finished/);
  });
});

describe('finished jobs', () => {
  it('names items by title and speaker, groups identical reasons with a count and examples', () => {
    const kids = [kid(2, 'published', { title: 'Talk 2', url: 'https://siftersearch.com/media/x' }), ...[3, 4, 5, 6].map((i) => kid(i, 'failed', null, 'the site answered 404')), kid(7, 'skipped', { reason: 'duplicate', why: 'already in the library' })];
    const e = emailFor(job('published'), kids, 'final', { name: 'Chad', to: 'chadananda@gmail.com' });
    expect(e.md).toMatch(/4 items — the site answered 404 \(for example “Talk 3” — Jane Faily \(1985\); /);
    expect(e.md.match(/the site answered 404/g).length).toBe(1);
    expect(nameOf(kids[0])).toBe('“Talk 2” — Jane Faily (1985)');
  });
  it('groupByWhy keeps single items readable and orders by size', () => {
    expect(groupByWhy([{ name: 'a', why: 'x' }, { name: 'b', why: 'y' }, { name: 'c', why: 'y' }]).map((g) => [g.why, g.n])).toEqual([['y', 2], ['x', 1]]);
  });
});
