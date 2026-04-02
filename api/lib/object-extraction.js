/**
 * Object Extraction — prompt builders and response parsers for entity extraction.
 *
 * Exports:
 *   buildObjectExtractionPrompt(paragraph, doc) → { systemPrompt, userPrompt }
 *   parseObjectResponse(response) → { people, places, documents, events, concepts, relations } | null
 *   renderObjectsForPrompt(objects) → string (deterministic, sorted keys)
 *   renderObjectsForMeili(objects) → string (flat, space-separated for search indexing)
 */

const ENTITY_KEYS = ['concepts', 'documents', 'events', 'people', 'places', 'relations'];

// ─── Prompt Builders ─────────────────────────────────────────────────────────

export function buildObjectExtractionPrompt(paragraph, doc) {
  const systemPrompt = `You are an entity extraction assistant specializing in religious and historical texts.

Document context:
- Title: ${doc.title || 'Unknown'}
- Author: ${doc.author || 'Unknown'}
- Religion/Tradition: ${doc.religion || 'Unknown'}
- Collection: ${doc.collection || 'Unknown'}
- Year: ${doc.year || 'Unknown'}
- Language: ${doc.language || 'en'}

Extract all named entities from the provided paragraph and return ONLY valid JSON with these 6 arrays:
{
  "people": [{ "name": "...", "description": "..." }],
  "places": [{ "name": "...", "description": "..." }],
  "documents": [{ "name": "...", "description": "..." }],
  "events": [{ "name": "...", "description": "..." }],
  "concepts": [{ "name": "...", "description": "..." }],
  "relations": [{ "from": "...", "to": "...", "description": "..." }]
}

Rules:
- Scope entities to the ${doc.religion || 'given'} tradition — use tradition-specific names
- Return empty arrays for categories with no entities, never omit any key
- relations must reference entity names from the other arrays
- No explanation outside the JSON`;

  const userPrompt = `Paragraph (index ${paragraph.paragraph_index ?? paragraph.id}):\n${paragraph.text}`;

  return { systemPrompt, userPrompt };
}

// ─── Response Parser ──────────────────────────────────────────────────────────

export function parseObjectResponse(response) {
  if (!response) return null;
  // Strip markdown code fences
  let text = String(response).trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (!text) return null;
  let parsed;
  try { parsed = JSON.parse(text); } catch { return null; }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return {
    people: Array.isArray(parsed.people) ? parsed.people : [],
    places: Array.isArray(parsed.places) ? parsed.places : [],
    documents: Array.isArray(parsed.documents) ? parsed.documents : [],
    events: Array.isArray(parsed.events) ? parsed.events : [],
    concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [],
    relations: Array.isArray(parsed.relations) ? parsed.relations : []
  };
}

// ─── Renderers ────────────────────────────────────────────────────────────────

export function renderObjectsForPrompt(objects) {
  // Deterministic output: sorted top-level keys, sorted item keys
  const lines = [];
  for (const key of ENTITY_KEYS) {
    const items = objects[key] ?? [];
    if (!items.length) continue;
    lines.push(`${key}:`);
    for (const item of items) {
      const sortedKeys = Object.keys(item).sort();
      const parts = sortedKeys.map(k => `${k}=${item[k]}`).join(', ');
      lines.push(`  - ${parts}`);
    }
  }
  return lines.join('\n');
}

export function renderObjectsForMeili(objects) {
  const parts = [];
  for (const key of ENTITY_KEYS) {
    const items = objects[key] ?? [];
    for (const item of items) {
      if (key === 'relations') {
        if (item.from) parts.push(item.from);
        if (item.to) parts.push(item.to);
        if (item.description) parts.push(item.description);
      } else {
        if (item.name) parts.push(item.name);
        if (item.description) parts.push(item.description);
      }
    }
  }
  return parts.join(' ');
}
