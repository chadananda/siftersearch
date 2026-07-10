// Per-document profile for the unified enrichment pipeline (docs/architecture/unified-enrichment-pipeline.md).
// A profile selects segmentation + prompt variant + model + language so the pipeline is robust to
// document variety (TOC-structured vs headingless, narrative vs doctrinal vs scripture, en vs fa/ar).
// Deps: docs row metadata. Resolution = explicit override for known books, else derive from metadata
// with safe defaults (bounded/narrative/flash/en) so ANY document enriches acceptably.

// Explicit overrides for the authority-seed + first history wave. priority: lower = earlier.
// The seed is built cumulatively in this order; later books resolve against the earlier entity seed.
export const PROFILE_OVERRIDES = {
  21310: { priority: 0,  profile: 'toc-narrative-pro',     lang: 'en' }, // God Passes By (seed of authority)
  21308: { priority: 10, profile: 'toc-narrative-pro',     lang: 'en' }, // The Dawn-Breakers
  8632:  { priority: 15, profile: 'doctrinal-pro',         lang: 'en' }, // Gate of the Heart (Saiedi, doctrinal)
  429:   { priority: 20, profile: 'bounded-narrative-flash', lang: 'en' }, // Revelation of Bahá'u'lláh v1
  430:   { priority: 21, profile: 'bounded-narrative-flash', lang: 'en' }, // ROB v2
  431:   { priority: 22, profile: 'bounded-narrative-flash', lang: 'en' }, // ROB v3
  432:   { priority: 23, profile: 'bounded-narrative-flash', lang: 'en' }, // ROB v4
  426:   { priority: 24, profile: 'bounded-narrative-flash', lang: 'en' }, // Child of the Covenant
  427:   { priority: 25, profile: 'bounded-narrative-flash', lang: 'en' }, // The Covenant
};

// A profile name expands to concrete stage parameters.
const PROFILE_DEFS = {
  'toc-narrative-pro':      { segmentation: 'toc',     promptVariant: 'narrative', model: 'pro'   },
  'bounded-narrative-flash':{ segmentation: 'bounded', promptVariant: 'narrative', model: 'flash' },
  'doctrinal-pro':          { segmentation: 'bounded', promptVariant: 'doctrinal', model: 'pro'   },
  'doctrinal-flash':        { segmentation: 'bounded', promptVariant: 'doctrinal', model: 'flash' },
  'bounded-persian-flash':  { segmentation: 'bounded', promptVariant: 'persian',   model: 'flash' },
  'scripture-flash':        { segmentation: 'bounded', promptVariant: 'scripture', model: 'flash' },
};

const MODEL_ID = { pro: 'deepseek-v4-pro', flash: 'deepseek-v4-flash' };
const RTL_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿]/; // Arabic/Persian block

/**
 * Resolve a document's profile → { name, segmentation, promptVariant, model, modelId, lang, priority }.
 * @param {object} doc  a docs row (id, lang, religion, collection, title, description, doc_priority)
 * @param {string} [sampleText]  a paragraph sample to detect script when lang is unset/wrong
 */
export function detectProfile(doc, sampleText = '') {
  const ov = PROFILE_OVERRIDES[doc.id];
  let name = ov?.profile;
  let lang = ov?.lang || doc.lang || 'en';
  // Script detection overrides a mistagged lang (memory: Mázindarání is Persian tagged lang=en).
  if (!ov && sampleText && RTL_SCRIPT.test(sampleText)) lang = 'fa';

  if (!name) {
    // Derive from metadata with safe defaults.
    const persian = lang === 'fa' || lang === 'ar';
    if (persian) name = 'bounded-persian-flash';
    else name = 'bounded-narrative-flash';
  }
  const def = PROFILE_DEFS[name] || PROFILE_DEFS['bounded-narrative-flash'];
  const priority = ov?.priority ?? (Number.isFinite(doc.doc_priority) ? 1000 - doc.doc_priority : 1000);
  return { name, ...def, modelId: MODEL_ID[def.model], lang, priority };
}
