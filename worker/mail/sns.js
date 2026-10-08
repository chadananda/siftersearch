// SNS message verification for the Worker's mail endpoints (pure + WebCrypto; no deps). Every SNS POST is
// signature-checked against Amazon's signing cert (host pinned to sns.<region>.amazonaws.com) and its TopicArn
// must be one of ours — the endpoints are public URLs, so an unsigned or foreign message is dropped.
/* global atob */

const CERT_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;

/** The exact string SNS signs, per message type (AWS docs: "Verifying the signatures of Amazon SNS messages"). */
export function canonicalString(m) {
  const keys = m.Type === 'Notification'
    ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
    : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
  return keys.filter((k) => m[k] !== undefined && m[k] !== null).map((k) => `${k}\n${m[k]}\n`).join('');
}

export function isAmazonUrl(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && CERT_HOST.test(x.hostname); } catch { return false; }
}

// Minimal DER walk: an X.509 certificate → its SubjectPublicKeyInfo bytes (what WebCrypto imports as 'spki').
function readTlv(b, i) {
  const tag = b[i]; let len = b[i + 1]; let off = i + 2;
  if (len & 0x80) { const n = len & 0x7f; len = 0; for (let k = 0; k < n; k++) len = (len << 8) | b[off + k]; off += n; }
  return { tag, start: i, body: off, end: off + len };
}
export function spkiFromCertDer(der) {
  const cert = readTlv(der, 0);
  const tbs = readTlv(der, cert.body);
  let p = tbs.body;
  if (der[p] === 0xa0) p = readTlv(der, p).end;                // [0] version
  for (let k = 0; k < 5; k++) p = readTlv(der, p).end;          // serial, sigAlg, issuer, validity, subject
  const spki = readTlv(der, p);
  return der.slice(spki.start, spki.end);
}
export function pemToDer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const keyCache = new Map();
async function signingKey(certUrl, hash) {
  const id = `${certUrl}|${hash}`;
  if (!keyCache.has(id)) {
    const pem = await (await fetch(certUrl)).text();
    keyCache.set(id, await crypto.subtle.importKey('spki', spkiFromCertDer(pemToDer(pem)), { name: 'RSASSA-PKCS1-v1_5', hash }, false, ['verify']));
  }
  return keyCache.get(id);
}

/** true when the message is genuinely from SNS and on one of `topics`. */
export async function verifySns(m, topics) {
  if (!m || !topics.has(m.TopicArn) || !isAmazonUrl(m.SigningCertURL)) return false;
  const hash = m.SignatureVersion === '2' ? 'SHA-256' : 'SHA-1';
  try {
    const key = await signingKey(m.SigningCertURL, hash);
    const sig = Uint8Array.from(atob(m.Signature), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, new TextEncoder().encode(canonicalString(m)));
  } catch { return false; }
}
