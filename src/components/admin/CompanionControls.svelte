<script>
  // Seeker Companion admin controls: live dials (with WHY + provenance), a deterministic preview of the
  // resolved personality/decision for any message, outcome metrics, and the curriculum graph.
  // Deps: admin.getCompanionConfig/setCompanionDial/previewCompanion/getCompanionMetrics/getCompanionCourses.
  import { admin } from '../../lib/api.js';

  let config = $state(null);
  let metrics = $state(null);
  let courses = $state(null);
  let error = $state(null);
  let saving = $state('');
  let previewMsg = $state('What do Bahá’ís believe about the soul?');
  let preview = $state(null);
  let previewing = $state(false);

  $effect(() => {
    admin.getCompanionConfig().then((c) => (config = c)).catch((e) => (error = e.message));
    admin.getCompanionMetrics(30).then((m) => (metrics = m)).catch(() => {});
    admin.getCompanionCourses().then((c) => (courses = c.tracks)).catch(() => {});
  });

  async function saveDial(key, value) {
    saving = key;
    try {
      await admin.setCompanionDial(key, value);
      config = await admin.getCompanionConfig();
    } catch (e) { error = e.message; }
    finally { saving = ''; }
  }
  async function runPreview() {
    previewing = true; preview = null;
    try { preview = await admin.previewCompanion(previewMsg); }
    catch (e) { error = e.message; }
    finally { previewing = false; }
  }

  const dialEntries = $derived(config ? Object.entries(config.dials) : []);
</script>

<div class="p-6 max-w-5xl">
  <h1 class="text-2xl font-semibold text-primary mb-1">Seeker Companion</h1>
  <p class="text-muted mb-6">
    The relationship-centered chat personality (“The Candid Companion”). Dials tune tactics; the character
    and safety invariants are fixed. Policy <code>{config?.policy_version ?? '…'}</code>.
  </p>

  {#if error}<div class="text-error mb-4">{error}</div>{/if}
  {#if !config}<div class="text-muted">Loading…</div>{:else}

  <!-- Dials -->
  <section class="mb-8">
    <h2 class="text-lg font-medium text-primary mb-3">Dials</h2>
    <div class="grid gap-3">
      {#each dialEntries as [key, def] (key)}
        <div class="flex items-center gap-3 border-b border-border-subtle pb-2">
          <div class="w-56 shrink-0">
            <div class="text-primary text-sm font-medium">{key}</div>
            <div class="text-xs text-muted">{def.why}</div>
          </div>
          <div class="flex-1">
            {#if def.type === 'enum'}
              <select class="bg-surface-1 border border-border rounded px-2 py-1 text-sm text-primary"
                value={config.values[key]} onchange={(e) => saveDial(key, e.currentTarget.value)}>
                {#each def.values as v}<option value={v}>{v}</option>{/each}
              </select>
            {:else}
              <div class="flex items-center gap-2">
                <input type="range" min={def.min} max={def.max} step={def.max <= 1 ? 0.05 : 1}
                  value={config.values[key]} onchange={(e) => saveDial(key, Number(e.currentTarget.value))} class="w-64" />
                <span class="text-sm text-secondary w-14 text-right">{config.values[key]}</span>
              </div>
            {/if}
          </div>
          <div class="w-24 text-right text-xs {config.provenance[key] === 'global' ? 'text-accent' : 'text-muted'}">
            {config.provenance[key]}{saving === key ? ' …' : ''}
          </div>
        </div>
      {/each}
    </div>
    <p class="text-xs text-muted mt-2">Changes set the <strong>global</strong> layer. Safety/consent/preference layers still override per turn.</p>
  </section>

  <!-- Preview -->
  <section class="mb-8">
    <h2 class="text-lg font-medium text-primary mb-3">Preview (deterministic — no LLM call)</h2>
    <div class="flex gap-2 mb-3">
      <input class="flex-1 bg-surface-1 border border-border rounded px-3 py-2 text-sm text-primary"
        bind:value={previewMsg} placeholder="A visitor message…" />
      <button class="bg-accent text-white rounded px-4 py-2 text-sm font-medium hover:bg-accent-hover" onclick={runPreview} disabled={previewing}>
        {previewing ? 'Resolving…' : 'Resolve plan'}
      </button>
    </div>
    {#if preview}
      <div class="grid gap-2 text-sm">
        <div class="flex gap-4 flex-wrap">
          <span class="text-secondary">mode: <strong class="text-primary">{preview.plan.mode}</strong></span>
          <span class="text-secondary">intervention: <strong class="text-primary">{preview.plan.intervention}</strong></span>
          <span class="text-secondary">challenge: <strong class="text-primary">{preview.plan.challenge_level}</strong></span>
          <span class="text-secondary">authority-layer: <strong class="text-primary">{preview.plan.add_authority_layer ? 'yes' : 'no'}</strong></span>
          <span class="text-secondary">evidence-gap: <strong class="text-primary">{preview.plan.evidence_gap ? 'yes' : 'no'}</strong></span>
          {#if preview.plan.next_step}<span class="text-secondary">next: <strong class="text-primary">{preview.plan.next_step}</strong></span>{/if}
        </div>
        {#if preview.plan.reasons?.length}
          <div class="text-xs text-muted">decision: {preview.plan.reasons.join(' · ')}</div>
        {/if}
        <details class="mt-2">
          <summary class="text-accent cursor-pointer text-xs">system prompt the crafter receives</summary>
          <pre class="mt-2 p-3 bg-surface-1 rounded text-xs text-secondary whitespace-pre-wrap overflow-x-auto">{preview.system_preview}</pre>
        </details>
      </div>
    {/if}
  </section>

  <!-- Metrics -->
  {#if metrics}
    <section class="mb-8">
      <h2 class="text-lg font-medium text-primary mb-3">Outcomes — last {metrics.days} days <span class="text-muted font-normal">(diagnostics only, never conversion)</span></h2>
      <p class="text-sm text-secondary mb-2">{metrics.total} turns · {metrics.participants} participants</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div><div class="text-muted text-xs uppercase mb-1">By mode</div>{#each metrics.byMode as r}<div class="flex justify-between"><span>{r.mode || '—'}</span><span class="text-secondary">{r.n}</span></div>{/each}</div>
        <div><div class="text-muted text-xs uppercase mb-1">By intervention</div>{#each metrics.byIntervention as r}<div class="flex justify-between"><span>{r.intervention || '—'}</span><span class="text-secondary">{r.n}</span></div>{/each}</div>
        <div><div class="text-muted text-xs uppercase mb-1">By challenge level</div>{#each metrics.byChallenge as r}<div class="flex justify-between"><span>L{r.challenge_level ?? '—'}</span><span class="text-secondary">{r.n}</span></div>{/each}</div>
      </div>
    </section>
  {/if}

  <!-- Courses -->
  {#if courses}
    <section>
      <h2 class="text-lg font-medium text-primary mb-3">Curriculum graph</h2>
      <div class="grid gap-2 text-sm">
        {#each courses as t}
          <div class="border-b border-border-subtle pb-2">
            <div class="text-primary font-medium">{t.title}</div>
            <div class="text-xs text-muted">{t.capability}</div>
            <div class="text-xs text-secondary mt-1">{t.texts.join(' · ')}</div>
          </div>
        {/each}
      </div>
    </section>
  {/if}
  {/if}
</div>
