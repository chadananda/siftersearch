// entities/lookup — transliteration-invariant recall for any spelling (Sadeq→Ṣádiq, Ghoddus→Quddús). Returns
// candidate entities ONLY — a lookup handle for humans and AIs, never determinative of identity. Thin over the
// store's recall (which owns the translit keys + index).
export async function run(ctx, q, opts = {}) {
  return ctx.store.findCandidateEntities(q, { type: opts.type ?? null, limit: opts.limit ?? 10 });
}
