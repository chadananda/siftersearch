<script>
  // Media quality admin (Chad 10-22: grading in the pipeline, detailed and organised by solution): the graded recordings
  // with a grade filter and per-dimension grades, the REPAIR LIST grouped by recommended fix chain (a batch gets one
  // treatment), and one recording's full report. Deps: api.admin.getMediaRepairs / getMediaQuality / getMediaGraded.
  import { admin } from '../../lib/api.js';

  const DIMS = ['bandwidth', 'noise', 'reverb', 'clipping', 'dropouts', 'level', 'speed', 'intelligibility'];
  let tab = $state('repairs');
  let grade = $state('');
  let repairs = $state(null), list = $state(null), report = $state(null), error = $state(null), progress = $state(null);
  $effect(() => { admin.getMediaProgress().then((d) => (progress = d)).catch(() => {}); });
  const fmtMin = (s) => (s ? `${Math.round(s / 60)} min` : '');
  const tone = (g) => ({ A: 'text-success', B: 'text-success', C: 'text-warning', D: 'text-error', E: 'text-error' }[g] || 'text-muted');

  $effect(() => { admin.getMediaRepairs('C').then((d) => (repairs = d)).catch((e) => (error = e.message)); });
  $effect(() => { const q = grade ? `grade=${grade}` : ''; admin.getMediaGraded(q).then((d) => (list = d)).catch((e) => (error = e.message)); });
  async function open(slug) { report = null; try { report = await admin.getMediaQuality(slug); } catch (e) { report = { error: e.message }; } }
</script>

<div class="p-6 max-w-6xl">
  <h1 class="text-2xl font-semibold text-primary mb-1">Media quality</h1>
  <p class="text-muted mb-4">Each recording graded A–E per dimension on its original (before any processing). The repair list groups recordings by the fix chain they need, most urgent first (priority = (5 − grade) × speaker importance).</p>
  {#if error}<p class="text-error mb-4">{error}</p>{/if}
  {#if progress}
    <!-- the import (the same numbers as GET /api/media/progress, shown on /media): targets → downloaded → transcribed → published -->
    <div class="mb-4 space-y-1 text-sm text-secondary">
      <p><b class="text-primary">{progress.total_targets} talks being imported</b> · {progress.downloaded} downloaded · {progress.transcribed} transcribed ·
        {progress.published} published{progress.failed ? ` · ${progress.failed} failed` : ''} · {progress.items_per_hour}/h
        {#if progress.eta_iso} · done ≈ {new Date(progress.eta_iso).toLocaleDateString()}{/if}</p>
      {#each progress.by_source as p (p.source)}
        <p class="text-muted">{p.label}: {p.published}/{p.total} published · {p.transcribed} transcribed · {p.downloaded} downloaded{p.failed ? ` · ${p.failed} failed` : ''}</p>
      {/each}
    </div>
  {/if}
  {#if repairs?.counts}
    <p class="mb-4 text-sm text-secondary">
      {#each Object.entries(repairs.counts.reduce((a, r) => ({ ...a, [r.grade || '—']: (a[r.grade || '—'] || 0) + r.n }), {})) as [g, n] (g)}<span class="mr-3"><b class={tone(g)}>{g}</b> {n}</span>{/each}
    </p>
  {/if}
  <div class="mb-4 flex gap-2">
    <button class="rounded-lg border border-border px-3 py-1.5 {tab === 'repairs' ? 'bg-surface-2 text-primary' : 'text-secondary'}" onclick={() => (tab = 'repairs')}>Repair list</button>
    <button class="rounded-lg border border-border px-3 py-1.5 {tab === 'all' ? 'bg-surface-2 text-primary' : 'text-secondary'}" onclick={() => (tab = 'all')}>All recordings</button>
  </div>

  {#if tab === 'repairs'}
    {#if !repairs}<p class="text-muted">Loading…</p>
    {:else if !repairs.groups.length}<p class="text-muted">Nothing graded C or worse yet.</p>
    {:else}
      {#each repairs.groups as gr (gr.chain)}
        <section class="mb-6 rounded-xl border border-border-subtle bg-surface-1 p-4">
          <h2 class="font-medium text-primary">{gr.chain}</h2>
          <p class="mb-2 text-sm text-muted">{gr.items.length} recording{gr.items.length === 1 ? '' : 's'} · {gr.hours} h · priority {gr.priority}</p>
          <table class="w-full text-sm">
            <tbody>
              {#each gr.items as it (it.id)}
                <tr class="border-t border-border-subtle">
                  <td class="py-1 pr-2 font-mono {tone(it.grade)}">{it.grade}</td>
                  <td class="py-1 pr-2"><button class="text-left text-accent hover:text-accent-hover" onclick={() => open(it.slug)}>{it.title}</button></td>
                  <td class="py-1 pr-2 text-secondary">{it.speaker || ''}</td>
                  <td class="py-1 pr-2 text-muted">{it.primary_issue}</td>
                  <td class="py-1 pr-2 text-muted">{fmtMin(it.duration_s)}</td>
                  <td class="py-1 text-right font-mono text-muted">{it.priority}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      {/each}
    {/if}
  {:else}
    <label class="mb-3 block text-sm text-secondary">Grade
      <select bind:value={grade} class="ml-2 rounded border border-border bg-surface-1 px-2 py-1">
        <option value="">all</option>{#each ['A', 'B', 'C', 'D', 'E'] as g (g)}<option value={g}>{g}</option>{/each}
      </select>
    </label>
    {#if !list}<p class="text-muted">Loading…</p>{:else}
      <table class="w-full text-sm">
        <thead><tr class="text-left text-muted"><th>Grade</th><th>Recording</th><th>Speaker</th><th>Issue</th><th>Fix chain</th><th class="text-right">Priority</th></tr></thead>
        <tbody>
          {#each list.items as it (it.id)}
            <tr class="border-t border-border-subtle">
              <td class="py-1 pr-2 font-mono {tone(it.grade)}">{it.grade || '—'}</td>
              <td class="py-1 pr-2"><button class="text-left text-accent hover:text-accent-hover" onclick={() => open(it.slug)}>{it.title}</button></td>
              <td class="py-1 pr-2 text-secondary">{it.speaker || ''}</td>
              <td class="py-1 pr-2 text-muted">{it.primary_issue || ''}</td>
              <td class="py-1 pr-2 text-muted">{it.chain_key || ''}</td>
              <td class="py-1 text-right font-mono text-muted">{it.priority ?? ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}

  {#if report}
    <section class="mt-6 rounded-xl border border-border bg-surface-1 p-4">
      {#if report.error}<p class="text-error">{report.error}</p>{:else}
        <h2 class="font-medium text-primary"><a class="text-accent hover:underline" href={`/media/${report.slug}`}>{report.title}</a> <span class="text-muted">— {report.speaker || ''}</span></h2>
        <p class="mb-3 text-sm text-secondary">Overall <b class={tone(report.quality.overall)}>{report.quality.overall}</b> · primary issue {report.quality.primary_issue}{report.quality.secondary_issues?.length ? ` · also ${report.quality.secondary_issues.join(', ')}` : ''}</p>
        <table class="mb-3 w-full text-sm">
          <thead><tr class="text-left text-muted"><th>Dimension</th><th>Grade</th><th>Measured</th><th>Fix</th></tr></thead>
          <tbody>
            {#each DIMS as k (k)}
              {@const x = report.quality.dimensions?.[k] || {}}
              <tr class="border-t border-border-subtle">
                <td class="py-1 pr-2 text-primary">{k}</td>
                <td class="py-1 pr-2 font-mono {tone(x.grade)}">{x.grade || '—'}</td>
                <td class="py-1 pr-2 text-secondary">{Object.entries(x).filter(([kk, v]) => !['grade', 'fix', 'spans', 'note'].includes(kk) && v != null && typeof v !== 'object').map(([kk, v]) => `${kk} ${v}`).join(' · ')}{x.note ? ` (${x.note})` : ''}</td>
                <td class="py-1 text-muted">{x.fix || ''}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if report.quality.chain?.length}
          <p class="text-sm text-secondary">Fix chain: {report.quality.chain.map((c) => `${c.step} (${c.tool}; ~${c.cpu_min_per_hour} CPU min/h)`).join(' → ')} · est. {report.quality.cost?.cpu_minutes} CPU min</p>
        {/if}
        {#if report.quality.dimensions?.intelligibility?.spans?.length}
          <p class="mt-2 text-sm text-muted">Low-confidence spans: {report.quality.dimensions.intelligibility.spans.map((s) => `${Math.floor(s.t0 / 60)}:${String(s.t0 % 60).padStart(2, '0')} (${s.score})`).join(', ')}</p>
        {/if}
      {/if}
    </section>
  {/if}
</div>
