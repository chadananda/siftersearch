<script>
  // Collapsible "About this tablet": Phelps' Partial Inventory + oceanoflights metadata + linked notes for one document.
  // :deps: GET /api/documents/:id/about (api/routes/tablets.js) → merged record; renders nothing when a doc has none.
  // :rules: generated OOL titles are labelled; catalogue fields carry their source; links open the two catalogues.
  import { onMount } from 'svelte';
  let { documentId } = $props();
  const API_BASE = import.meta.env.PUBLIC_API_URL || '';
  let meta = $state(null);
  onMount(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/documents/${documentId}/about`);
      if (r.ok) meta = await r.json();
    } catch { /* no metadata: render nothing */ }
  });
  // Phelps' period codes: "G-'Akka2" → "'Akka (2)"; "Z-other/unknown …" → hidden
  const period = (p) => (!p || /^Z-/.test(p) ? null : p.replace(/^[A-Z]-/, '').replace(/(\D)(\d)$/, '$1 ($2)'));
  const dateText = (d) => {
    if (!d) return null;
    const g = d.gregorian || (d.from ? (d.to && d.to !== d.from ? `${d.from}–${d.to}` : `${d.from}`) : null);
    return [g, d.hijri ? `${d.hijri} AH` : null].filter(Boolean).join(' · ') + (d.approx ? ' (approx.)' : '') || d.text;
  };
  const cite = (c) => [c.citation || c.code, c.locator].filter(Boolean).join(', ');
  const hasAny = $derived(meta && (meta.recipient || meta.addressee?.length || meta.date || meta.place || meta.manuscripts?.length
    || meta.publications?.length || meta.translations?.length || meta.subjects?.length || meta.audio?.length || meta.notes?.length));
</script>

{#if hasAny}
  <details class="tablet-about mt-4 rounded-lg border border-border bg-surface-1">
    <summary class="cursor-pointer select-none px-4 py-2 text-sm font-medium text-secondary">About this tablet</summary>
    <div class="grid gap-3 px-4 pb-4 pt-1 text-sm text-primary">
      {#if meta.title || meta.title_generated}
        <p><span class="text-muted">Title:</span> {meta.title || meta.title_generated}
          {#if !meta.title}<span class="text-muted"> (descriptive, not an established name)</span>{/if}</p>
      {/if}
      {#if meta.title_native}<p dir="rtl" lang="ar" class="text-right">{meta.title_native}</p>{/if}
      <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        {#if meta.recipient}<dt class="text-muted">Recipient</dt><dd>{meta.recipient}</dd>
        {:else if meta.addressee?.length}<dt class="text-muted">Addressed to</dt><dd>{meta.addressee.join(', ')}</dd>{/if}
        {#if dateText(meta.date)}<dt class="text-muted">Date</dt><dd>{dateText(meta.date)}</dd>{/if}
        {#if meta.place}<dt class="text-muted">Place</dt><dd>{meta.place}</dd>{/if}
        {#if period(meta.period)}<dt class="text-muted">Period</dt><dd>{period(meta.period)}</dd>{/if}
        {#if meta.volume}<dt class="text-muted">Collection</dt><dd>{meta.volume}</dd>{/if}
        {#if meta.genre}<dt class="text-muted">Genre</dt><dd>{meta.genre}{meta.prayer_occasion && meta.prayer_occasion !== 'general' ? ` · ${meta.prayer_occasion}` : ''}</dd>{/if}
        {#if meta.word_count}<dt class="text-muted">Length</dt><dd>{meta.word_count.toLocaleString()} words</dd>{/if}
      </dl>
      {#if meta.first_line || meta.first_line_en}
        <div>
          <p class="text-muted">Opening words</p>
          {#if meta.first_line}<p dir="rtl" class="text-right">{meta.first_line}</p>{/if}
          {#if meta.first_line_en}<p class="italic">{meta.first_line_en}</p>{/if}
        </div>
      {/if}
      {#if meta.subjects?.length}<p><span class="text-muted">Subjects:</span> {meta.subjects.join(', ')}</p>{/if}
      {#if meta.manuscripts?.length}<p><span class="text-muted">Manuscripts:</span> {meta.manuscripts.join(', ')}</p>{/if}
      {#each [['Published in', meta.publications], ['Translated in', meta.translations]] as [label, refs]}
        {#if refs?.length}
          <div>
            <p class="text-muted">{label}</p>
            <ul class="ml-4 list-disc">
              {#each refs as c}<li>{#if c.url}<a class="text-accent hover:text-accent-hover" href={c.url} target="_blank" rel="noopener">{cite(c)}</a>{:else}{cite(c)}{/if}</li>{/each}
            </ul>
          </div>
        {/if}
      {/each}
      {#if meta.audio?.length}
        <div class="grid gap-2">
          <p class="text-muted">Recitation</p>
          {#each meta.audio as a}<audio controls preload="none" src={a.url} class="w-full"><track kind="captions" /></audio>{/each}
        </div>
      {/if}
      {#if meta.notes?.length || meta.notes_attachments?.length}
        <div>
          <p class="text-muted">Notes and sources</p>
          <ul class="ml-4 list-disc">
            {#each meta.notes || [] as n}<li><a class="text-accent hover:text-accent-hover" href={`/library/view?doc=${n.docId}`}>{n.title || 'Notes'}</a>{n.language ? ` (${n.language})` : ''}</li>{/each}
            {#each meta.notes_attachments || [] as n}<li><a class="text-accent hover:text-accent-hover" href={n.url} target="_blank" rel="noopener">{n.name}</a></li>{/each}
          </ul>
        </div>
      {/if}
      <p class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {#if meta.links?.oceanoflights}<a class="text-accent hover:text-accent-hover" href={meta.links.oceanoflights} target="_blank" rel="noopener">Ocean of Lights</a>{/if}
        {#if meta.links?.inventory}<a class="text-accent hover:text-accent-hover" href={meta.links.inventory} target="_blank" rel="noopener">Partial Inventory {meta.pin}</a>{/if}
        <span class="text-muted">Catalogue data: Stephen Phelps, <i>A Partial Inventory</i> (v6.01); oceanoflights.org</span>
      </p>
    </div>
  </details>
{/if}
