// Worker mail: SNS signature verification (throwaway fixture cert), SES event → rows, threading, From encoding.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { createSign } from 'crypto';
import { canonicalString, verifySns, isAmazonUrl } from '../../worker/mail/sns.js';
import { eventRows, threadKey, mimeName, inboundStatus, ownText, ignoredBy } from '../../worker/mail/index.js';

const CERT = readFileSync(new URL('../fixtures/sns/test-cert.pem', import.meta.url), 'utf8');
const KEY = readFileSync(new URL('../fixtures/sns/test-key.pem', import.meta.url), 'utf8');
const TOPIC = 'arn:aws:sns:us-west-2:409305238362:ses-anis-events';

function signed(over = {}, version = '2') {
  const m = { Type: 'Notification', MessageId: 'm-1', TopicArn: TOPIC, Message: '{"eventType":"Delivery"}', Timestamp: '2026-10-07T00:00:00Z',
    SignatureVersion: version, SigningCertURL: 'https://sns.us-west-2.amazonaws.com/SimpleNotificationService-test.pem', ...over };
  const s = createSign(version === '2' ? 'RSA-SHA256' : 'RSA-SHA1'); s.update(canonicalString(m));
  return { ...m, Signature: s.sign(KEY, 'base64') };
}

describe('SNS verification', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stubCert = () => vi.stubGlobal('fetch', vi.fn(async () => new Response(CERT)));

  it('accepts a correctly signed message on our topic (v1 and v2)', async () => {
    stubCert();
    expect(await verifySns(signed(), new Set([TOPIC]))).toBe(true);
    expect(await verifySns(signed({ MessageId: 'm-2' }, '1'), new Set([TOPIC]))).toBe(true);
  });
  it('rejects a tampered message', async () => {
    stubCert();
    const m = signed(); m.Message = '{"eventType":"Bounce"}';
    expect(await verifySns(m, new Set([TOPIC]))).toBe(false);
  });
  it('rejects a foreign topic or a non-Amazon cert host', async () => {
    stubCert();
    expect(await verifySns(signed(), new Set(['arn:aws:sns:us-west-2:1:other']))).toBe(false);
    expect(await verifySns(signed({ SigningCertURL: 'https://evil.example.com/sns.pem' }), new Set([TOPIC]))).toBe(false);
    expect(isAmazonUrl('http://sns.us-west-2.amazonaws.com/x')).toBe(false);
    expect(isAmazonUrl('https://sns.us-west-2.amazonaws.com.evil.com/x')).toBe(false);
  });
  it('signs subscription confirmations over their own fields', () => {
    const s = canonicalString({ Type: 'SubscriptionConfirmation', Message: 'm', MessageId: 'i', SubscribeURL: 'u', Timestamp: 't', Token: 'k', TopicArn: 'a' });
    expect(s).toBe('Message\nm\nMessageId\ni\nSubscribeURL\nu\nTimestamp\nt\nToken\nk\nTopicArn\na\nType\nSubscriptionConfirmation\n');
  });
});

describe('SES events', () => {
  it('a permanent bounce records each recipient and suppresses it', () => {
    const r = eventRows({ eventType: 'Bounce', mail: { messageId: 's1', destination: ['A@x.org'] },
      bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'A@x.org' }] } });
    expect(r).toMatchObject({ type: 'Bounce', sesId: 's1', recipients: ['A@x.org'], suppress: [{ email: 'a@x.org', reason: 'bounce' }] });
  });
  it('a transient bounce does not suppress; a complaint does', () => {
    expect(eventRows({ eventType: 'Bounce', mail: {}, bounce: { bounceType: 'Transient', bouncedRecipients: [{ emailAddress: 'b@x.org' }] } }).suppress).toEqual([]);
    expect(eventRows({ eventType: 'Complaint', mail: {}, complaint: { complainedRecipients: [{ emailAddress: 'c@x.org' }] } }).suppress)
      .toEqual([{ email: 'c@x.org', reason: 'complaint' }]);
  });
  it('opens and clicks keep their detail', () => {
    expect(eventRows({ eventType: 'Click', mail: { messageId: 's2', destination: ['d@x.org'] }, click: { link: 'https://l' } }))
      .toMatchObject({ type: 'Click', recipients: ['d@x.org'], detail: { link: 'https://l' }, suppress: [] });
    expect(eventRows({ eventType: 'Rendering Failure', mail: {} }).type).toBe('RenderingFailure');
  });
});

describe('threading and headers', () => {
  it('thread key is the first reference, else in-reply-to, else own id', () => {
    expect(threadKey({ references: '<a@x> <b@x>', inReplyTo: '<b@x>', messageId: '<c@x>' })).toBe('<a@x>');
    expect(threadKey({ inReplyTo: '<b@x>', messageId: '<c@x>' })).toBe('<b@x>');
    expect(threadKey({ messageId: '<c@x>' })).toBe('<c@x>');
  });
  it('encodes a non-ASCII display name', () => {
    const v = mimeName('Anís', 'anis@oceanlibrary.com');
    expect(v).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <anis@oceanlibrary\.com>$/);
    expect(Buffer.from(v.split('?')[3], 'base64').toString()).toBe('Anís');
    expect(mimeName('Ocean', 'a@b.c')).toBe('"Ocean" <a@b.c>');
  });
});

describe('newsletter replies: sorting', () => {
  it('out-of-office and bounces are auto', () => {
    expect(inboundStatus({ headers: [{ key: 'Auto-Submitted', value: 'auto-replied' }], text: 'Thanks!' })).toBe('auto');
    expect(inboundStatus({ subject: 'Automatic reply: Ocean 2.0 news' })).toBe('auto');
    expect(inboundStatus({ subject: 'Out of Office' })).toBe('auto');
    expect(inboundStatus({ from: 'MAILER-DAEMON@x.org', subject: 'failure' })).toBe('auto');
    expect(inboundStatus({ headers: [{ key: 'Auto-Submitted', value: 'no' }], text: 'Lovely issue, thank you.' })).toBe('new');
  });
  it('a short removal request is unsubscribe; a real letter that quotes the footer is not', () => {
    expect(inboundStatus({ text: 'Please remove me from this list.' })).toBe('unsubscribe');
    expect(inboundStatus({ subject: 'Unsubscribe', text: '' })).toBe('unsubscribe');
    expect(inboundStatus({ text: 'Thank you for the article on the Kitáb-i-Íqán.\n\nOn Mon, Ocean 2.0 wrote:\n> To unsubscribe click here' })).toBe('new');
  });
  it('spam verdicts win', () => expect(inboundStatus({ spam: 'FAIL', text: 'hi' })).toBe('spam'));
  it('ownText drops quoted history', () => {
    expect(ownText('Great!\n> old line\nmore')).toBe('Great!\nmore');
    expect(ownText('Yes.\nOn Tue, 1 Oct 2026, Ocean wrote:\nquoted')).toBe('Yes.');
  });
});

describe('ignore rules', () => {
  const rules = ['bnc.org', 'usbnc.org'];
  it('matches the domain, its subdomains and "Name <addr>" headers', () => {
    expect(ignoredBy(['someone@bnc.org'], rules)).toBe('bnc.org');
    expect(ignoredBy(['x@mail.USBNC.org'], rules)).toBe('usbnc.org');
    expect(ignoredBy([null, 'Office <office@usbnc.org>'], rules)).toBe('usbnc.org');
  });
  it('does not match look-alike domains', () => {
    expect(ignoredBy(['a@notbnc.org', 'b@bnc.org.evil.com', 'c@bnc.com'], rules)).toBeNull();
  });
  it('a full-address rule matches only that address', () => {
    expect(ignoredBy(['news@x.org'], ['news@x.org'])).toBe('news@x.org');
    expect(ignoredBy(['other@x.org'], ['news@x.org'])).toBeNull();
  });
});
