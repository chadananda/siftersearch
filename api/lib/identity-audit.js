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
// `names` = how the texts actually name them, titles and original script included ("باب الباب", "the first to believe"):
// without them Jev read a title as a different person — two-thirds of its first flags were such references.
export const profileOf = ({ name, summary, aliases = [], names = [] }) => {
  const all = [...new Set([...aliases, ...names].map(String).filter((n) => n && n !== name))].slice(0, 16);
  return `PROFILE — ${name}\n${all.length ? `The texts also call this person: ${all.join(' · ')}. A passage using one of these titles or names for them IS about them unless it clearly concerns someone else.\n` : ''}${String(summary || '(no summary)').slice(0, 700)}`;
};

/** One Jev request for a batch of clusters. Pure. */
export function buildRequest(profile, clusters, { stage = 1 } = {}) {
  const state = [profile, ...clusters.map((c, i) =>
    `[C${i + 1}] "${c.title}"${c.year ? ` (${c.year})` : ''} — the book calls the person "${c.handle}"; the mention reads "${c.surface}":\n${c.window}`)].join('\n\n');
  const questions = Object.fromEntries(clusters.map((_, i) => [`c${i + 1}`, stage === 2 ? {
    // STAGE 2 — only stage-1 flags, with far more text. Stage 1's false flags were titles, epithets and retrospective
    // references to the profile person; so the question is whether the passage is CLEARLY someone else.
    type: 'choice',
    instructions: `[C${i + 1}]: is this passage CLEARLY about a DIFFERENT person than the PROFILE? A title, an epithet, a later or figurative reference to the profile person, a relative described BY their relation to him or her, or an index line naming them are all the profile person — not different. Answer "different" only when the passage itself shows another person: another place or era, a distinguishing name part, another family.`,
    criteria: {
      different: 'the passage itself shows a different person',
      profile: 'the profile person — by name, title, epithet or reference',
      unclear: 'the passage does not say enough to tell',
    },
  } : {
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
export function readAnswer(a, { stage = 1 } = {}) {
  const verdict = a?.choice ?? a?.value ?? 'unclear';
  const confidence = a?.confidence ?? a?.distribution?.[verdict] ?? 0;
  // Stage 2 → a reader: "different" at ≥0.4, or a weak "profile" (<0.6). Measured 2026-09-28 (Ṭáhirih, Quddús): at
  // ≥0.75 alone it was precise but DROPPED 7 of 9 real errors (0.40–0.73), and every low-confidence "profile" read was
  // an error too; confidence also drifts between runs (one cluster 0.81 → 0.66), so a hard high cut is fragile.
  if (stage === 2) return { verdict, confidence, flagged: (verdict === 'different' && confidence >= 0.4) || (verdict !== 'different' && confidence < 0.6) };
  return { verdict, confidence, flagged: !(verdict === 'same' && confidence >= SURE) };
}

export async function auditClusters(profile, clusters, { apiKey = process.env.TYPESAFE_API_KEY, fetchImpl = fetch, timeoutMs = 20000, stage = 1 } = {}) {   // 8s timed out 30 of 341 once the profile carried names
  if (!apiKey) throw new Error('no TYPESAFE_API_KEY');
  const out = [];
  const size = stage === 2 ? 3 : BATCH;   // stage-2 windows are ~4× longer
  for (let i = 0; i < clusters.length; i += size) {
    const batch = clusters.slice(i, i + size);
    let answers = {};
    // One retry: 12 of 341 clusters came back as transport errors on 2026-09-28 (flagged, never passed — but lost).
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetchImpl(JEV_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(buildRequest(profile, batch, { stage })), signal: AbortSignal.timeout(timeoutMs) });
        answers = res.ok ? (await res.json()).answers || {} : { _error: `jev HTTP ${res.status}` };
      } catch (e) { answers = { _error: e.message }; }
      if (!answers._error) break;
    }
    // A failed call flags its clusters (never silently passes them): an audit that errors must not read as clean.
    batch.forEach((c, j) => out.push({ ...c, ...(answers._error ? { verdict: 'error', confidence: 0, flagged: true, error: answers._error } : readAnswer(answers[`c${j + 1}`], { stage })) }));
  }
  return out;
}
