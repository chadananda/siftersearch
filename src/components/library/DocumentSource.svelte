<script>
  // The document's ORIGINAL SOURCE (Chad 10-18: "a link to the manuscript … checking the handwritten or poorly-scanned source
  // if a question arises later"): the archived scan or file it was read from. Shown only when one exists and this reader may
  // open it — unpublished material for everyone, a published book's scan for admins (doc-source.js).
  import { documents } from '../../lib/api.js';
  let { documentId } = $props();
  let src = $state(null);
  $effect(() => {
    src = null;
    documents.sourceInfo(documentId).then((r) => { src = r?.available && r.allowed ? r : null; }).catch(() => { src = null; });
  });
  const label = (s) => (s.type === 'pdf' ? `Original scan (PDF${s.pages ? `, ${s.pages} pages` : ''}${s.mb ? `, ${s.mb} MB` : ''})` : `Original file (${String(s.type).toUpperCase()}${s.mb ? `, ${s.mb} MB` : ''})`);
</script>

{#if src}
  <p class="doc-source">
    <a href={src.url} target="_blank" rel="noopener" class="text-accent hover:text-accent-hover">📄 {label(src)}</a>
    {#if !src.public}<span class="text-muted"> · visible to admins only</span>{/if}
  </p>
{/if}

<style>
  .doc-source { margin-top: 0.5rem; font-size: 0.85rem; }
</style>
