// Cluster audit — a cheap FLAGGER for wrong bindings. For one person, every cluster (one book's label for them) is put
// to Jev with a window of text around the mention and the person's profile: does the passage's person fit? Anything
// not a confident "same" is flagged for a careful reader (Chad, 2026-09-28: "leverage Jev to flag records and then you
// manually check them"). It decides nothing and writes nothing. Deps: fetch (Jev), injected so the logic is testable.
export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const BATCH = 6;             // clusters per Jev call
export const SURE = 0.75;           // a "same" below this is flagged too

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ʼʻ'‘’`´]/g, '').toLowerCase();

/** Text around the mention (the whole paragraph when short): a name past a fixed cut-off was invisible to readers. */
export function windowAround(text, surface, radius = 350) {
  const t = String(text || '');
  if (t.length <= radius * 2) return t;
  const i = fold(t).indexOf(fold(surface));
  if (i < 0) return t.slice(0, radius * 2);
  const a = Math.max(0, i - radius), b = Math.min(t.length, i + String(surface).length + radius);
  return `${a > 0 ? '…' : ''}${t.slice(a, b)}${b < t.length ? '…' : ''}`;
}

/** The person as a reader would check them: name, the curated summary (dates, places, role, family). */
export const profileOf = ({ name, summary, aliases = [] }) =>
  `PROFILE — ${name}${aliases.length ? ` (also: ${aliases.slice(0, 6).join(', ')})` : ''}\n${String(summary || '(no summary)').slice(0, 700)}`;

/** One Jev request for a batch of clusters. Pure. */
export function buildRequest(profile, clusters) {
  const state = [profile, ...clusters.map((c, i) =>
    `[C${i + 1}] "${c.title}"${c.year ? ` (${c.year})` : ''} — the book calls the person "${c.handle}"; the mention reads "${c.surface}":\n${c.window}`)].join('\n\n');
  const questions = Object.fromEntries(clusters.map((_, i) => [`c${i + 1}`, {
    type: 'choice',
    instructions: `[C${i + 1}]: is the person this passage names the SAME person as the PROFILE? Judge only from what the passage says — place, date, role, family, companions. Many people share a name; a matching name is not evidence.`,
    criteria: {
      same: 'the passage fits the profile person and nothing in it contradicts the profile',
      different: 'the passage shows a different person — another era, place, role, family, or a namesake',
      unclear: 'the passage does not say enough to tell',
    },
  }]));
  return { model: 'jev-latest', state, questions };
}

/** Answer → { verdict, confidence, flagged }. A confident "same" passes; everything else goes to a reader. */
export function readAnswer(a) {
  const verdict = a?.choice ?? a?.value ?? 'unclear';
  const confidence = a?.confidence ?? a?.distribution?.[verdict] ?? 0;
  return { verdict, confidence, flagged: !(verdict === 'same' && confidence >= SURE) };
}

export async function auditClusters(profile, clusters, { apiKey = process.env.TYPESAFE_API_KEY, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  if (!apiKey) throw new Error('no TYPESAFE_API_KEY');
  const out = [];
  for (let i = 0; i < clusters.length; i += BATCH) {
    const batch = clusters.slice(i, i + BATCH);
    let answers = {};
    try {
      const res = await fetchImpl(JEV_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequest(profile, batch)), signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) answers = (await res.json()).answers || {};
      else answers = { _error: `jev HTTP ${res.status}` };
    } catch (e) { answers = { _error: e.message }; }
    // A failed call flags its clusters (never silently passes them): an audit that errors must not read as clean.
    batch.forEach((c, j) => out.push({ ...c, ...(answers._error ? { verdict: 'error', confidence: 0, flagged: true, error: answers._error } : readAnswer(answers[`c${j + 1}`])) }));
  }
  return out;
}
