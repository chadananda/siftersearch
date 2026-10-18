// dewey-research ops job: research a wanted work (dewey/research.js) and download its cover; the item becomes
// 'researched' (or stays 'wanted' with candidates when nothing matched its title). params { id }.
import { getItem, updateItem } from '../repos/dewey-repo.js';
import { researchWork, fetchCover } from '../dewey/research.js';

export async function deweyResearchJob({ id } = {}, { research = researchWork, cover = fetchCover } = {}) {
  const item = await getItem(id);
  if (!item) throw new Error(`dewey item ${id} not found`);
  const r = await research({ title: item.title, author: item.author });
  const coverPath = r.matched ? await cover(item.id, r.cover).catch(() => null) : null;
  const done = r.matched ? 'researched' : item.state;
  await updateItem(item.id, { research: r, ...(coverPath ? { cover_path: coverPath } : {}), ...(item.state === 'wanted' ? { state: done } : {}) },
    r.matched ? `research: ${[r.isbn13 && `ISBN ${r.isbn13}`, r.publisher, r.year, coverPath && 'cover'].filter(Boolean).join(', ') || 'record found'}` : `research: no record matched the title (${r.candidates.length} near misses)`);
  return { id: item.id, matched: r.matched, isbn: r.isbn13 || r.isbn10, cover: !!coverPath, sources: r.sources.length };
}
