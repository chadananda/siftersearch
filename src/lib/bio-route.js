// /biography/<key> routing + JSON-LD, pure. Resolver answer ({kind,id,slug} | null) → page action; slug URL is canonical.
export const bioUrl = (slug, site = '') => `${site}/biography/${slug}`;

/** → { action: 'notfound' } | { action: 'redirect', status: 301, location } | { action: 'render', id, slug, canonical } */
export function bioRoute(resolved, site = 'https://siftersearch.com') {
  if (!resolved?.slug) return { action: 'notfound' };
  if (resolved.kind !== 'current') return { action: 'redirect', status: 301, location: bioUrl(resolved.slug) };
  return { action: 'render', id: resolved.id, slug: resolved.slug, canonical: bioUrl(resolved.slug, site) };
}

/** schema.org Person for the page (name, description, alias names, canonical url). */
export function bioJsonLd(p, canonical) {
  return { '@context': 'https://schema.org', '@type': 'Person', name: p.name, url: canonical, mainEntityOfPage: canonical,
    ...(p.summary ? { description: String(p.summary).slice(0, 300) } : {}),
    ...((p.aliases || []).filter((a) => typeof a === 'string' && a !== p.name).length ? { alternateName: p.aliases.filter((a) => typeof a === 'string' && a !== p.name).slice(0, 6) } : {}) };
}

export const REL_LABEL = { family: 'Family', teacher: 'Teachers', student: 'Students', companion: 'Companions', guardian: 'Guardians',
  protector: 'Protectors', patron: 'Patrons', captor: 'Captors', adversary: 'Adversaries', persecutor: 'Persecutors',
  correspondent: 'Correspondents', successor: 'Successors', other: 'Others' };
const DIED = /\b(death|died|dies|martyr|killed|executed|passing|passed)/i;

/**
 * The page's timeline view: events, relationship groups and journeys with footnote numbers (one running number per
 * source, in order of first use), the footnotes, and the life span. With `linkable` (the Anís host: cited claims only,
 * Chad 11-14) a source counts only when linkable(url) is truthy, a claim with no such source is dropped, and the death
 * year shows only beside a cited death event. Stored data is never edited.
 */
export function bioView(p, { linkable = null } = {}) {
  const t = p?.timeline || {}, src = t.sources || {}, order = [];
  const num = (k) => { if (!order.includes(k)) order.push(k); return order.indexOf(k) + 1; };
  const ok = (k) => src[k] && (!linkable || (src[k].url && linkable(src[k].url)));
  const withNotes = (x) => ({ ...x, notes: [...new Set(x.cites || [])].filter(ok).map((k) => ({ n: num(k), k, ...src[k] })) });
  const cited = (x) => !linkable || x.notes.length > 0;
  const events = (t.events || []).map(withNotes).filter(cited);
  const relGroups = Object.entries((t.relationships || []).map(withNotes).filter(cited).reduce((g, r) => ((g[r.type] ||= []).push(r), g), {}))
    .sort(([a], [b]) => Object.keys(REL_LABEL).indexOf(a) - Object.keys(REL_LABEL).indexOf(b));
  const journeys = (t.journeys || []).map(withNotes).filter(cited);
  const footnotes = order.map((k, i) => ({ n: i + 1, ...src[k] }));
  const years = events.map((e) => e.year).filter(Boolean);
  const deathYear = !linkable || events.some((e) => DIED.test(e.title || '')) ? p?.death?.year : null;
  const life = years.length ? `${Math.min(...years)}–${deathYear || Math.max(...years)}` : (deathYear ? `d. ${deathYear}` : '');
  return { events, relGroups, journeys, footnotes, life };
}
