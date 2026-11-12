<!-- Display widget side_by_side (original ↔ translation), site chat + embed. Data built by code (api/lib/assistant/widgets); cells verbatim, never links.
     Header = each side's kicker + work title; sources once, in the bottom row. An RTL original sits on the right. Stacks under 640px.
     Plain scoped CSS on currentColor / the host's --accent (themes in the site and the shadow-DOM embed); rules carry .sbs-wrap to beat chat-prose table borders. -->
<script>
  import { studyRows, heads } from '../../../api/lib/assistant/widgets/side-by-side.js';
  import { APPROX_NOTE } from '../../../api/lib/assistant/widgets/segments.js';
  let { widget, layout = widget?.layout ?? 'tight' } = $props();
  const study = $derived(layout === 'study');
  const rows = $derived(study ? studyRows(widget) : widget.rows);
  const o = $derived(widget.original);
  const rtl = $derived(o.dir === 'rtl');
  const hs = $derived(heads(widget));
  // column order: [original, ...translations], reversed for an RTL original so it reads on the right
  const order = (list) => (rtl ? [...list].reverse() : list);
  const cols = $derived(order(hs.map((h, i) => ({ ...h, i }))));
</script>
<figure class="sbs-wrap" class:rtl>
  <table class="sbs" class:study class:tight={!study}>
    <thead><tr>
      {#each cols as h}
        <th dir={h.dir} class:orig={h.i === 0} lang={h.i === 0 ? o.lang : undefined}>
          <span class="kicker">{h.kicker}</span>
          {#if h.title?.main}<span class="title">{h.title.main}</span>{/if}
          {#if h.title?.sub}<span class="sub">{h.title.sub}</span>{/if}
        </th>
      {/each}
    </tr></thead>
    <tbody>
      {#each rows as r}
        <tr>
          {#each order([{ c: r.original, i: 0 }, ...r.translations.map((c, k) => ({ c, i: k + 1 }))]) as x}
            {#if x.i === 0}<td class="orig" dir={o.dir} lang={o.lang}>{x.c?.text ?? ''}</td>
            {:else if x.c !== null}<td class="tr" rowspan={x.c?.span > 1 ? x.c.span : undefined}>{x.c?.text ?? ''}</td>{/if}
          {/each}
        </tr>
      {/each}
    </tbody>
    {#if hs.some((h) => h.source)}
      <tfoot><tr>
        {#each cols as h}<td dir={h.dir}>{#if h.source}<a href={h.source.url} target="_blank" rel="noopener">{h.source.name}<span aria-hidden="true"> ↗</span></a>{/if}</td>{/each}
      </tr></tfoot>
    {/if}
  </table>
  {#if widget.approximate}<figcaption class="note">{APPROX_NOTE.replace(/\*/g, '')}</figcaption>{/if}
</figure>
<style>
  .sbs-wrap { margin: 1em 0; padding: 0; border: 1px solid color-mix(in srgb, currentColor 14%, transparent); border-radius: 12px; overflow: hidden;
    background: color-mix(in srgb, currentColor 3%, transparent); }
  .sbs-wrap .sbs { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; font-size: 1em; }
  .sbs-wrap .sbs th, .sbs-wrap .sbs td { border: 0; background: none; }
  .sbs-wrap .sbs th { text-align: start; vertical-align: bottom; font-weight: 400; padding: 1em 1.2em .8em;
    border-bottom: 1px solid color-mix(in srgb, var(--accent, currentColor) 45%, transparent); }
  .sbs-wrap .sbs th[dir='rtl'] { text-align: right; }
  .kicker { display: block; font-size: .68em; letter-spacing: .12em; text-transform: uppercase; opacity: .6; margin-bottom: .3em; }
  .title { display: block; font-style: italic; font-weight: 600; font-size: 1.12em; line-height: 1.3; }
  .sub { display: block; font-size: .85em; opacity: .7; margin-top: .15em; }
  .sbs-wrap .sbs tbody td { vertical-align: top; padding: .9em 1.2em; line-height: 1.65; }
  .sbs-wrap .sbs th + th, .sbs-wrap .sbs td + td { border-inline-start: 1px solid color-mix(in srgb, currentColor 12%, transparent); }
  .sbs-wrap .sbs.tight tbody tr + tr td { border-top: 1px solid color-mix(in srgb, currentColor 8%, transparent); }
  .sbs-wrap .sbs td.orig[dir='rtl'] { font-family: 'Amiri', 'Noto Naskh Arabic', 'Scheherazade New', 'Traditional Arabic', 'Geeza Pro', serif;
    font-size: 1.32em; line-height: 2; text-align: justify; text-align-last: right; }
  .sbs-wrap .sbs tfoot td { padding: .55em 1.2em .7em; font-size: .78em; border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent); }
  .sbs-wrap .sbs tfoot td[dir='rtl'] { text-align: right; }
  .sbs-wrap tfoot a { color: inherit; opacity: .65; text-decoration: none; border-bottom: 1px dotted currentColor; }
  .sbs-wrap tfoot a:hover { opacity: 1; color: var(--accent, inherit); }
  .note { margin: 0; padding: .5em 1.2em .7em; font-size: .78em; font-style: italic; opacity: .6; }
  @media (max-width: 640px) {
    .sbs-wrap .sbs, .sbs-wrap tbody, .sbs-wrap tfoot, .sbs-wrap tr, .sbs-wrap td { display: block; width: auto; }
    .sbs-wrap thead { display: none; }
    .sbs-wrap .sbs td + td { border-inline-start: 0; }
    .sbs-wrap .sbs tbody tr { padding: .3em 0; }
    .sbs-wrap .sbs tbody td.tr { padding-top: 0; }
  }
</style>
