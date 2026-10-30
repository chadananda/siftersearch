<script>
  // Printable thank-you + receipt mailed back to a donor (/admin/imports/report?drive=<id> | ?donor=<id>; plan step 9).
  // Lists IMPORTED items by kind; before any import, the approved ones under "Selected for the library". Junk/copies only counted.
  // Deps: admin.getImportReport / getDonorImportReport. Print CSS below; AdminLayout hides its own chrome when printing.
  import { admin } from '../../lib/api.js';

  const KIND = { book: 'Books', scan: 'Scanned books and papers', talk: 'Recorded talks', video: 'Video recordings', 'photo-set': 'Photographs' };
  const ORDER = Object.keys(KIND);
  const SITE = 'https://siftersearch.com';

  const params = new URLSearchParams(globalThis.location?.search || '');
  const driveParam = params.get('drive'), donorParam = params.get('donor');
  let report = $state(null), error = $state(null);

  $effect(() => {
    const load = driveParam ? admin.getImportReport(driveParam).then((r) => ({ donor: r.donor, drives: [r], buckets: r.buckets, files: r.drive.files || 0 }))
      : donorParam ? admin.getDonorImportReport(donorParam) : Promise.reject(new Error('Add ?drive=<id> or ?donor=<id> to the address.'));
    load.then((r) => (report = r)).catch((e) => (error = e.message));
  });

  const n = (x) => (x ?? 0).toLocaleString('en-US');
  const plural = (x, one, many) => `${n(x)} ${x === 1 ? one : many}`;
  const date = (s) => { const d = s ? new Date(s) : null; return d && !isNaN(d) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null; };
  const today = date(new Date().toISOString());
  const firstName = (name) => { const w = String(name ?? '').trim().split(/\s+/); return w.length > 1 && !/\.$/.test(w[0]) ? w[0] : name; };
  const href = (link) => (link?.startsWith('/') ? SITE + link : link);
  const label = (d) => d.label || d.id;
  const kindTitle = (k) => KIND[k] ?? 'Other material';

  /** The items to list for one drive: imported ones; if none yet, the approved ones (a draft printed before import). */
  function listed(r) {
    const draft = !r.imported.length;
    const items = draft ? r.selected : r.imported;
    const by = {};
    for (const it of items) (by[it.kind] ??= []).push(it);
    const kinds = Object.keys(by).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
    return { draft, items, groups: kinds.map((k) => [k, by[k]]), withLink: items.some((x) => x.link) };
  }

  function custody(d) {
    return [['Received', d.received_at], ['Copied', d.copied_at], ['Returned', d.returned_at]].map(([k, v]) => [k, date(v)]).filter(([, v]) => v);
  }

  /** The counts as plain sentences; zero lines are left out. */
  function lines(b, files, drives = 1) {
    return [
      files ? `${plural(files, 'file', 'files')} on the ${drives > 1 ? 'drives' : 'drive'}, sorted into ${plural(b.reviewed, 'item', 'items')} (one item is a book, a talk or a set of photographs).`
        : `${plural(b.reviewed, 'item', 'items')} reviewed one by one.`,
      b.imported && `${plural(b.imported, 'item is', 'items are')} now in the library.`,
      b.selected && `${plural(b.selected, 'item is', 'items are')} selected for the library and being added.`,
      b.held && `${plural(b.held, 'item', 'items')} the library already had.`,
      b.declined && `${plural(b.declined, 'item', 'items')} we did not take.`,
      b.pending && `${plural(b.pending, 'item is', 'items are')} still being looked at.`,
      b.set_aside && `${plural(b.set_aside, 'further item was a duplicate, a very short clip or a system file', 'further items were duplicates, very short clips or system files')}, and set aside.`,
    ].filter(Boolean);
  }

  const multi = $derived((report?.drives?.length ?? 0) > 1);
  const anyImported = $derived(report?.drives?.some((r) => r.imported.length));
</script>

{#snippet itemTable(groups, withLink)}
  {#each groups as [kind, items] (kind)}
    <section class="kind">
      <h3>{kindTitle(kind)} <span class="count">({n(items.length)})</span></h3>
      <table>
        <thead><tr><th class="t">Title</th><th class="y">Year</th><th class="c">By</th>{#if withLink}<th class="l">Where to find it</th>{/if}</tr></thead>
        <tbody>
          {#each items as it (it.id)}
            <tr>
              <td class="t">{it.title || 'Untitled'}</td>
              <td class="y">{it.year ?? ''}</td>
              <td class="c">{it.creator ?? ''}</td>
              {#if withLink}<td class="l">{#if it.link}<a href={href(it.link)}>{href(it.link).replace(/^https?:\/\//, '')}</a>{/if}</td>{/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/each}
{/snippet}

{#snippet driveSection(r)}
  {@const l = listed(r)}
  {@const c = custody(r.drive)}
  <section class="drive">
    {#if multi}<h2>{label(r.drive)}</h2>{/if}
    {#if r.drive.source || c.length}
      <p class="custody">
        {#if r.drive.source}{r.drive.source}{#if c.length} · {/if}{/if}
        {#each c as [k, v], i (k)}{k} {v}{#if i < c.length - 1} · {/if}{/each}
      </p>
    {/if}
    {#if multi}
      <ul class="summary">{#each lines(r.buckets, r.drive.files) as line (line)}<li>{line}</li>{/each}</ul>
    {/if}
    {#if l.items.length}
      <h2 class={multi ? 'sub' : ''}>{l.draft ? 'Selected for the library' : 'What we added to the library'}</h2>
      {#if l.draft}<p>These are the items chosen so far. They are being prepared and added now.</p>{/if}
      {@render itemTable(l.groups, l.withLink)}
    {:else}
      <p class="quiet">Nothing from this drive has been chosen for the library yet.</p>
    {/if}
  </section>
{/snippet}

<div class="screen-bar no-print">
  <a href="/admin/imports{driveParam ? `?drive=${encodeURIComponent(driveParam)}` : ''}" class="text-accent hover:text-accent-hover text-sm">← Donor imports</a>
  {#if report}<button class="px-3 py-1.5 rounded bg-accent text-white text-sm" onclick={() => window.print()}>Print</button>{/if}
</div>

{#if error}<p class="text-error p-6">{error}</p>
{:else if !report}<p class="text-muted p-6">Loading…</p>
{:else}
  {@const d = report.donor}
  {@const one = report.drives.length === 1 ? report.drives[0] : null}
  <article class="sheet">
    <header>
      <p class="from">Ocean Library · SifterSearch</p>
      <p class="date">{today}</p>
    </header>

    <h1>Thank you{d?.name ? `, ${firstName(d.name)}` : ''}</h1>
    {#if d?.name}<p class="to">{d.name}{#if d.mail_address}<br /><span class="addr">{d.mail_address}</span>{/if}</p>{/if}

    <p>
      Thank you for sending us {one ? `the drive “${label(one.drive)}”` : `${report.drives.length} drives`}.
      We copied every file, went through {one ? 'it' : 'them'} item by item, and {anyImported ? 'added' : 'are adding'} what the library did not already have.
      This letter is your receipt: it shows what came in and what we kept.
    </p>

    <ul class="summary">{#each lines(report.buckets, report.files, report.drives.length) as line (line)}<li>{line}</li>{/each}</ul>

    {#each report.drives as r (r.drive.id)}{@render driveSection(r)}{/each}

    <footer>
      <p>
        Each item we add is credited to you as its donor, so readers can see where it came from.
        {#if one}Your drive comes back to you with this letter, unchanged.{/if}
        If you have more material, such as recordings, papers or photographs, we would be glad to see it.
      </p>
      <p class="sign">With gratitude,<br />Chad<br /><span class="quiet">Ocean Library · siftersearch.com</span></p>
    </footer>
  </article>
{/if}

<style>
  .screen-bar { display: flex; justify-content: space-between; align-items: center; max-width: 52rem; margin: 0 auto 1rem; }
  .sheet { max-width: 52rem; margin: 0 auto 3rem; padding: 3rem 3.5rem; background: #fff; color: #111; font-family: var(--font-quote, Georgia, serif);
    font-size: 11.5pt; line-height: 1.55; border: 1px solid #ddd; }
  header { display: flex; justify-content: space-between; font-size: 9.5pt; letter-spacing: 0.04em; color: #444; margin-bottom: 2.5rem; }
  .from { text-transform: uppercase; }
  h1 { font-size: 22pt; font-weight: 600; margin: 0 0 0.4rem; }
  h2 { font-size: 14pt; font-weight: 600; margin: 2rem 0 0.5rem; break-after: avoid; }
  h2.sub { font-size: 12pt; margin-top: 1.2rem; }
  h3 { font-size: 11.5pt; font-weight: 600; margin: 1.4rem 0 0.3rem; break-after: avoid; }
  .count, .quiet, .addr { color: #555; font-weight: normal; }
  .to { margin: 0 0 1.5rem; }
  .addr { white-space: pre-line; }
  p { margin: 0 0 0.8rem; }
  .summary { margin: 0.6rem 0 1.2rem 1.2rem; padding: 0; list-style: disc; }
  .summary li { margin: 0.15rem 0; }
  .custody { font-size: 10pt; color: #444; }
  .drive + .drive { margin-top: 2rem; border-top: 1px solid #ccc; padding-top: 0.5rem; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th { text-align: left; font-weight: 600; border-bottom: 1px solid #333; padding: 0.2rem 0.4rem 0.2rem 0; }
  td { vertical-align: top; border-bottom: 1px solid #e3e3e3; padding: 0.25rem 0.4rem 0.25rem 0; overflow-wrap: anywhere; }
  tr { break-inside: avoid; }
  .y { width: 3.5rem; white-space: nowrap; }
  .c { width: 28%; }
  .l { width: 30%; }
  a { color: #111; }
  footer { margin-top: 2.5rem; }
  .sign { margin-top: 1.5rem; }

  @media (max-width: 640px) { .sheet { padding: 1.5rem 1rem; } .screen-bar { padding: 0 1rem; } }

  @page { size: auto; margin: 18mm 16mm; }
  @media print {
    .no-print { display: none !important; }
    .sheet { max-width: none; margin: 0; padding: 0; border: 0; font-size: 11pt; }
    a { text-decoration: none; }
  }
</style>
