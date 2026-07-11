// kernel/profile — resolve a document's profile through injected ports. PURE: no database, no schema, no
// model ids. It asks the `store` for the document's metadata + a representative text sample, then delegates
// to the host-supplied `profiler` (the routing policy — which corpus, which models, live in the app). The
// returned Profile (see ports.js) is what every stage keys off.

export async function profileFor(ctx, docId) {
  const meta = await ctx.store.getDocMeta(docId);
  const sample = await ctx.store.getSampleText(docId);
  return ctx.profiler(meta, sample);
}
