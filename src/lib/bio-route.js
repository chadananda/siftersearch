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
