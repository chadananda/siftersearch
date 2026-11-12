<!-- Display widget side_by_side (original ↔ translation), site chat + embed. Data built by code (api/lib/assistant/widgets); cells are verbatim, original in its own script, rtl. Stacks under 640px.
     Plain scoped CSS on currentColor / the host's --accent so the same component themes in the site and the shadow-DOM embed. -->
<script>
  import { studyRows } from '../../../api/lib/assistant/widgets/side-by-side.js';
  import { APPROX_NOTE } from '../../../api/lib/assistant/widgets/segments.js';
  let { widget, layout = widget?.layout ?? 'tight' } = $props();
  const study = $derived(layout === 'study');
  const rows = $derived(study ? studyRows(widget) : widget.rows);
  const o = $derived(widget.original);
</script>
{#snippet cell(c)}{#if c?.text}{#if c.url}<a href={c.url} target="_blank" rel="noopener">{c.text}</a>{:else}{c.text}{/if}{/if}{/snippet}
<div class="sbs-wrap">
  <table class="sbs" class:study class:tight={!study}>
    <thead><tr><th class:rtl={o.dir === 'rtl'}>{o.label} (original)</th>{#each widget.translations as t}<th>{t.label}</th>{/each}</tr></thead>
    <tbody>
      {#each rows as r}
        <tr>
          <td class="orig" dir={o.dir} lang={o.lang}>{@render cell(r.original)}</td>
          {#each r.translations as c}{#if c !== null}<td rowspan={c.span > 1 ? c.span : undefined}>{@render cell(c)}</td>{/if}{/each}
        </tr>
      {/each}
    </tbody>
  </table>
  {#if widget.approximate}<p class="note">{APPROX_NOTE.replace(/\*/g, '')}</p>{/if}
</div>
<style>
  .sbs-wrap { margin: .7em 0; overflow-x: auto; }
  .sbs { width: 100%; border-collapse: collapse; font-size: .95em; }
  th { text-align: start; font-weight: 600; padding: .4em .6em; border-bottom: 2px solid var(--accent, currentColor); }
  th.rtl { text-align: end; }
  td { vertical-align: top; padding: .5em .6em; line-height: 1.5; }
  .tight td { border-bottom: 1px solid color-mix(in srgb, currentColor 22%, transparent); }
  .orig[dir='rtl'] { font-family: 'Amiri', 'Noto Naskh Arabic', 'Scheherazade New', 'Traditional Arabic', 'Geeza Pro', serif; font-size: 1.3em; line-height: 1.9; text-align: right; }
  a { color: inherit; text-decoration: underline dotted; text-underline-offset: 3px; }
  a:hover { color: var(--accent, inherit); }
  .note { margin: .4em 0 0; font-size: .85em; font-style: italic; opacity: .7; }
  @media (max-width: 640px) {
    .sbs, tbody, tr, td { display: block; width: auto; }
    thead { display: none; }
    tr { padding: .4em 0; border-bottom: 1px solid color-mix(in srgb, currentColor 22%, transparent); }
    .tight td { border-bottom: 0; }
  }
</style>
