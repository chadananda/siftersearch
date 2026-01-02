/**
 * Dynamic Library Sitemap
 *
 * Generates a sitemap for all library documents with semantic URLs.
 * This runs at build time to create a static sitemap.
 *
 * Usage: Access via /sitemap-library.xml
 */

/* global Response */

const API_BASE = import.meta.env.PUBLIC_API_URL || 'https://api.siftersearch.com';
const SITE_URL = import.meta.env.SITE || 'https://siftersearch.com';

/**
 * Generate a URL-safe slug from a string
 */
function slugifyPath(str) {
  if (!str) return '';
  const diacritics = {
    'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'ā': 'a',
    'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e', 'ē': 'e',
    'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i', 'ī': 'i',
    'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o', 'ō': 'o',
    'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u', 'ū': 'u',
    'ñ': 'n', 'ç': 'c',
    'Á': 'a', 'À': 'a', 'Ä': 'a', 'Â': 'a', 'Ā': 'a',
    'É': 'e', 'È': 'e', 'Ë': 'e', 'Ê': 'e', 'Ē': 'e',
    'Í': 'i', 'Ì': 'i', 'Ï': 'i', 'Î': 'i', 'Ī': 'i',
    'Ó': 'o', 'Ò': 'o', 'Ö': 'o', 'Ô': 'o', 'Ō': 'o',
    'Ú': 'u', 'Ù': 'u', 'Ü': 'u', 'Û': 'u', 'Ū': 'u',
    'Ñ': 'n', 'Ç': 'c'
  };
  return str
    .toLowerCase()
    .split('').map(c => diacritics[c] || c).join('')
    .replace(/[''`']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

export async function GET() {
  try {
    // Fetch all documents with slugs from API
    const res = await fetch(`${API_BASE}/api/library/documents?limit=10000`);

    if (!res.ok) {
      console.error('Failed to fetch documents for sitemap:', res.status);
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`,
        { headers: { 'Content-Type': 'application/xml' } }
      );
    }

    const data = await res.json();
    const documents = data.documents || [];

    // Filter documents that have all required fields for semantic URLs
    const validDocs = documents.filter(doc =>
      doc.slug && doc.religion && doc.collection
    );

    // Generate URLs
    const urls = validDocs.map(doc => {
      const religionSlug = slugifyPath(doc.religion);
      const collectionSlug = slugifyPath(doc.collection);
      const url = `${SITE_URL}/library/${religionSlug}/${collectionSlug}/${doc.slug}`;

      // Determine priority based on document properties
      // Higher authority or more content = higher priority
      let priority = 0.6;
      if (doc.authority && doc.authority >= 8) priority = 0.8;
      else if (doc.paragraph_count && doc.paragraph_count > 100) priority = 0.7;

      // Use updated_at if available, otherwise current date
      const lastmod = doc.updated_at
        ? new Date(doc.updated_at).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      return `  <url>
    <loc>${url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
  </url>`;
    }).join('\n');

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    return new Response(sitemap, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
      }
    });
  } catch (err) {
    console.error('Error generating library sitemap:', err);

    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`,
      { headers: { 'Content-Type': 'application/xml' } }
    );
  }
}
