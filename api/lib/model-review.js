// Monthly model re-assessment (Chad 10-11). Pure: roles × registry (× spend) → findings. Flags a role when its model is
// deprecated or unknown, its review is older than maxAgeDays, or the registry holds a NEWER non-deprecated model of the
// same type that is cheaper (blended price) — a candidate to MEASURE, never an automatic switch.
const blended = (p) => (p ? (p.input || 0) + 3 * (p.output || 0) : Infinity);   // ~1:3 in:out, typical of these calls

export function reviewRoles(roles, registry, { now = new Date(), maxAgeDays = 31, spend = [] } = {}) {
  const usd = new Map(spend.map((s) => [s.model, s]));
  return Object.entries(roles).map(([role, r]) => {
    const cur = registry[r.model];
    const flags = [];
    if (!cur && r.provider !== 'systemone') flags.push('model not in registry');
    if (cur?.deprecated) flags.push('model deprecated');
    const age = Math.floor((now - new Date(r.reviewed)) / 86_400_000);
    if (age > maxAgeDays) flags.push(`review ${age} days old`);
    const candidates = cur ? Object.entries(registry)
      .filter(([id, m]) => id !== r.model && !m.deprecated && m.type === cur.type && m.released && (!cur.released || m.released > cur.released)
        && blended(m.pricing) <= blended(cur.pricing))
      .map(([id, m]) => ({ id, price: m.pricing, released: m.released })) : [];
    if (candidates.length) flags.push(`newer & cheaper: ${candidates.map((c) => c.id).join(', ')}`);
    return { role, provider: r.provider, model: r.model, reviewed: r.reviewed, age_days: age, spend_30d: usd.get(r.model) || null, flags, candidates };
  });
}
