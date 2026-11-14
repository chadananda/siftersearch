// Where a library document lives publicly (Chad 11-14 link policy): the first collaborator site that holds it (config/link-sites.json
// order, via source-links linkFor), else its Anís /doc page. Pure; the siftersearch reader's 301, /document/:id and /doc share it.
import { linkFor, SIFTER_TIER } from '../source-links.js';
import { docPageUrl } from './doc-slug.js';

/** doc {id, title, author, source_url, metadata, collection} → the collaborator's page for the whole text, or null. */
export function collaboratorUrl(doc) {
  if (!doc) return null;
  const l = linkFor({ ...doc, text: null, external_para_id: null, ilm_id: null, block_attrs: null }, null);
  return l.tier < SIFTER_TIER ? l.url.replace(/#.*$/, '') : null;
}

/** The document's public home: a collaborator first, else anis.oceanlibrary.com/doc/<slug>. */
export const docHome = (doc) => collaboratorUrl(doc) ?? docPageUrl(doc);
