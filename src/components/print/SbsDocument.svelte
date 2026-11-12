<script>
  // Side-by-side printable document (CTAI-style). One grid row per sentence pair so sentences start on the same line.
  // Deps: lib/sbs.js, lib/qrcode.js, lib/imagekit.js (cover). SSR renders page 1; onMount loads the rest.
  import { onMount } from 'svelte';
  import { generateQRCodeUrl } from '../../lib/qrcode.js';
  import { imgSet } from '../../lib/imagekit.js';
  import { prepRow, loadAll, sectionStarts, cssString } from '../../lib/sbs.js';
  let { docId, initial = null, initialStatus = 200, pageUrl = '', apiBase = '' } = $props();
  let data = $state(initial ? { doc: initial.doc, sections: initial.sections || [], paragraphs: initial.paragraphs || [] } : null);
  let status = $state(initialStatus), loading = $state(!!initial?.next_offset || !initial), qr = $state(null);
  const doc = $derived(data?.doc), rtl = $derived(doc?.direction === 'rtl');
  const starts = $derived(sectionStarts(data?.sections));
  const cover = $derived(doc?.cover_url ? imgSet(doc.cover_url, [300, 600], { ratio: null }) : null);
  onMount(async () => {
    qr = await generateQRCodeUrl(pageUrl || location.href, { width: 220, darkColor: '#2C2520' });
    try { data = await loadAll(fetch, apiBase, docId, initial); status = 200; } catch (e) { if (!data) status = e.status || 0; }
    loading = false;
  });
</script>

{#if data && doc}
  {@html `<style>@page{size:A4 portrait;margin:20mm 16mm 20mm 16mm;@top-center{content:"${cssString(doc.title)}";font:italic 8.5pt 'Source Serif 4',serif;color:#968E86}@bottom-center{content:counter(page);font:9pt 'EB Garamond',serif;color:#968E86}}@page :first{@top-center{content:none}@bottom-center{content:none}}</style>`}
  <div class="sbs">
    <!-- cover -->
    <section class="cover">
      <div class="cover-main">
        <div class="badge">Side by Side Study Format</div>
        {#if cover}<img class="cover-img" src={cover.src} srcset={cover.srcset} sizes="280px" alt="" />{/if}
        <h1>{doc.title}</h1>
        {#if doc.original_title}<div class="orig" dir={rtl ? 'rtl' : 'ltr'}>{doc.original_title}</div>{/if}
        <div class="rule"></div>
        <dl class="meta">
          {#if doc.author}<div><dt>Author</dt><dd>{doc.author}</dd></div>{/if}
          {#if doc.translator}<div><dt>Translator</dt><dd>{doc.translator}</dd></div>{/if}
          <div><dt>Paragraphs</dt><dd>{doc.paragraphs ?? data.paragraphs.length}</dd></div>
        </dl>
      </div>
      <div class="cover-foot">{#if qr}<img class="qr" src={qr} alt="QR code to this page" />{/if}<div class="dom">siftersearch.com</div></div>
    </section>
    <!-- contents -->
    {#if data.sections.length}
      <section class="toc"><h2>Contents</h2>
        <ol>{#each data.sections as s, i}<li><a href={`#sbs-s${i}`}>{s.title}</a></li>{/each}</ol>
      </section>
    {/if}
    <!-- body -->
    <main class="body">
      {#each data.paragraphs as p (p.n)}
        {#if starts.has(p.n)}<div class="section-title" id={`sbs-s${starts.get(p.n).i}`}><span>{starts.get(p.n).title}</span></div>{/if}
        {#if p.kind === 'heading'}
          <h3 class="heading" dir={rtl ? 'rtl' : 'ltr'}>{p.rows[0]?.o || p.rows[0]?.t}{#if p.rows[0]?.o && p.rows[0]?.t}<small>{p.rows[0].t}</small>{/if}</h3>
        {:else}
          <div class="para">
            {#each p.rows as r, i}
              {@const row = prepRow(r)}
              {#if row.orn}
                <div class="orn">۝</div>
              {:else}
                <div class="row" class:rtl>
                  <div class="cell o" dir={rtl ? 'rtl' : 'ltr'}>{row.o}</div>
                  <div class="gut">{#if i === 0}<span class="pn">{p.n}</span>{/if}</div>
                  <div class="cell t" dir="ltr">{row.t}</div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      {/each}
      {#if loading}<p class="note no-print">Loading the rest of the document…</p>{/if}
    </main>
  </div>
  <button class="sbs-btn no-print" onclick={() => window.print()}>Print / Save as PDF</button>
{:else}
  <p class="msg">{status === 403 ? 'This document is under copyright and is not available as a side-by-side print.' : status === 404 ? 'Document not found.' : loading ? 'Loading…' : 'The document could not be loaded.'}</p>
{/if}

<style>
  .sbs { --ink:#2C2520; --ink6:#5C554D; --ink5:#968E86; --ink3:#D4CEC8; --gold:#E2AD44; --gold6:#C07523; --gold1:#FBF3E0; --arabic:#36302A;
    max-width: 210mm; margin: 0 auto; padding: 0 16mm; background: #fff; color: var(--ink); font-family: 'Source Serif 4', Georgia, serif; font-size: 11pt; line-height: 1.7; }
  .cover { min-height: 250mm; display: flex; flex-direction: column; justify-content: space-between; text-align: center; padding: 28mm 0 10mm; break-after: page; border-bottom: 3px solid var(--gold); }
  .badge { font: 500 8pt 'EB Garamond', serif; letter-spacing: .25em; text-transform: uppercase; color: var(--gold6); margin-bottom: 14mm; }
  .cover-img { width: 70mm; height: auto; border-radius: 8px; margin: 0 auto 10mm; display: block; }
  h1 { font: 600 28pt/1.2 'Source Serif 4', serif; margin: 0; }
  .orig { font: 400 22pt/1.8 'Scheherazade New', serif; color: var(--arabic); margin-top: 4mm; }
  .rule { width: 40mm; height: 2px; background: var(--gold); margin: 8mm auto; }
  .meta { display: flex; justify-content: center; gap: 12mm; margin: 0; }
  .meta dt { font: 500 7.5pt 'EB Garamond', serif; letter-spacing: .2em; text-transform: uppercase; color: var(--ink5); }
  .meta dd { margin: 0; font-size: 12pt; }
  .cover-foot { display: flex; flex-direction: column; align-items: center; gap: 2mm; }
  .qr { width: 28mm; height: 28mm; }
  .dom { font: 500 9pt 'EB Garamond', serif; letter-spacing: .15em; color: var(--gold6); }
  .toc { break-after: page; padding-top: 20mm; }
  .toc h2 { font: 500 16pt 'EB Garamond', serif; letter-spacing: .15em; text-transform: uppercase; color: var(--gold6); border-bottom: 1px solid var(--gold); padding-bottom: 2mm; }
  .toc ol { list-style: none; margin: 6mm 0; padding: 0; font-size: 12pt; line-height: 2.2; counter-reset: s; }
  .toc li { counter-increment: s; border-bottom: 1px dotted var(--ink3); }
  .toc li::before { content: counter(s) '.'; font-family: 'EB Garamond', serif; font-variant-numeric: oldstyle-nums; color: var(--gold6); margin-right: 3mm; }
  .toc a { color: inherit; text-decoration: none; }
  .section-title { break-before: page; break-after: avoid; text-align: center; padding: 30mm 0 12mm; }
  .section-title span { font: 500 20pt 'EB Garamond', serif; letter-spacing: .12em; text-transform: uppercase; color: var(--ink); border-top: 1px solid var(--gold); border-bottom: 1px solid var(--gold); padding: 3mm 8mm; }
  .heading { text-align: center; font: 700 15pt/1.8 'Scheherazade New', serif; margin: 8mm 0 3mm; break-after: avoid; }
  .heading small { display: block; font: 600 10pt 'Source Serif 4', serif; letter-spacing: .1em; color: var(--ink6); }
  .para { padding: 3mm 0; border-top: 0.5pt solid var(--ink3); }
  .para:first-child, .section-title + .para { border-top: 0; }
  /* one grid row per sentence pair; rows never split across pages, but a paragraph may */
  .row { display: grid; grid-template-columns: 1fr 15px 1fr; position: relative; break-inside: avoid; padding: 1.2mm 0; }
  .row.rtl .t { order: 1; } .row.rtl .gut { order: 2; } .row.rtl .o { order: 3; }
  .row:not(.rtl) .o { order: 1; } .row:not(.rtl) .gut { order: 2; } .row:not(.rtl) .t { order: 3; }
  .cell.o { font: 400 15pt/1.9 'Scheherazade New', serif; color: var(--arabic); text-align: start; padding: 0 3mm; }
  .row.rtl .o { text-align: right; }
  .cell.t { font: 400 11pt/1.7 'Source Serif 4', serif; padding: 0 3mm; hyphens: auto; }
  .gut { position: relative; background: linear-gradient(var(--gold), var(--gold)) center / 1px 100% no-repeat; }
  .pn { position: absolute; top: 1mm; left: 50%; transform: translateX(-50%); background: #fff; border: 0.5pt solid var(--gold); border-radius: 8px; padding: 0 1.6mm; font: 500 7.5pt/1.4 'EB Garamond', serif; font-variant-numeric: oldstyle-nums; color: var(--gold6); z-index: 1; white-space: nowrap; }
  .orn { text-align: center; font: 400 16pt 'Scheherazade New', serif; color: var(--gold6); padding: 2mm 0; break-inside: avoid; }
  .note, .msg { text-align: center; color: var(--ink5); padding: 2rem; font-family: 'Source Serif 4', serif; }
  .sbs-btn { position: fixed; bottom: 1rem; right: 1rem; padding: .7rem 1.4rem; background: #C07523; color: #fff; border: 0; border-radius: 8px; font: 500 1rem 'Source Serif 4', serif; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.2); z-index: 1000; }
  .sbs-btn:hover { background: #a3631d; }
  /* screen only: ultra-faint dotted guide between sentence rows */
  @media screen { .row + .row { border-top: 1px dotted rgba(212,206,200,.35); } .sbs { margin: 1rem auto; box-shadow: 0 2px 12px rgba(0,0,0,.12); } }
  @media print { .sbs { max-width: none; padding: 0; margin: 0; box-shadow: none; } .no-print, .sbs-btn { display: none !important; } .cover { min-height: 255mm; } }
</style>
