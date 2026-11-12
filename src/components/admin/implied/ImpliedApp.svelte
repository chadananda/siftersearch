<script>
  // Implication browser shell: tabs (Money / Explore / Graph / HyPE editor / Scored / Log), URL-state deep links, presentation mode, docked chat. Deps: ./api.js (fixture with ?fixture=1)
  import { onMount } from 'svelte';
  import { api, isFixture } from './api.js';
  import Hero from './Hero.svelte';
  import Explore from './Explore.svelte';
  import GraphView from './GraphView.svelte';
  import ParagraphEditor from './ParagraphEditor.svelte';
  import EditLog from './EditLog.svelte';
  import Scored from './Scored.svelte';
  import ChatDock from './ChatDock.svelte';
  const TABS = [['hero', 'Where the money goes'], ['explore', 'Explore'], ['graph', 'First principles'], ['para', 'HyPE editor'], ['scores', 'Scored'], ['log', 'Log']];
  let p = $state({}), ov = $state(null), loading = $state(true), error = $state(''), seed = $state(null), chatOpen = $state(false), ready = $state(false);
  const read = () => Object.fromEntries(new URLSearchParams(location.search));
  function setp(patch, push = false) {
    p = Object.fromEntries(Object.entries({ ...p, ...patch }).filter(([, v]) => v !== '' && v != null));
    const u = new URL(location.href); u.search = new URLSearchParams(p).toString(); history[push ? 'pushState' : 'replaceState'](null, '', u);
  }
  const tab = $derived(p.tab || 'hero'), present = $derived(p.present === '1');
  const go = (t, extra = {}) => setp({ tab: t === 'hero' ? '' : t, ...extra }, true);
  async function loadOv() { try { ov = await api.overview(); error = ''; } catch (e) { error = e.message; } loading = false; }
  let t; const bump = () => { clearTimeout(t); t = setTimeout(loadOv, 1500); };
  // items = premise cards to review; { question } = a plain question to put to Anís (Hero hits)
  const ask = (items, opts = {}) => { seed = { items: items || [], question: opts.question || null }; chatOpen = true; };
  onMount(() => { p = read(); ready = true; loadOv(); const pop = () => (p = read()); addEventListener('popstate', pop); const esc = (e) => e.key === 'Escape' && present && setp({ present: '' }); addEventListener('keydown', esc); return () => { removeEventListener('popstate', pop); removeEventListener('keydown', esc); }; });
  const concepts = $derived((ov?.byConcept || []).map((c) => c.concept)), religions = $derived((ov?.byReligion || []).map((r) => r.religion));
</script>

<div class={present ? 'stage present' : 'stage'}>
  {#if !present}
    <div class="head">
      <div><h1>Implication browser</h1><p>What the library implies without saying — explore, correct, and show where HyPE spend goes.{#if isFixture()} <b class="fx">FIXTURE DATA</b>{/if}</p></div>
      <button class="pres" onclick={() => setp({ present: '1', tab: '' })}>Present ▶</button>
    </div>
    <nav class="tabs" role="tablist">{#each TABS as [k, label] (k)}<button role="tab" aria-selected={tab === k} class:on={tab === k} onclick={() => go(k)}>{label}</button>{/each}
      <button class="chatbtn" onclick={() => (chatOpen = !chatOpen)}>{chatOpen ? 'Hide chat' : 'Chat'}</button></nav>
  {:else}
    <div class="pmenu"><button onclick={() => setp({ present: '', tab: 'explore' })}>Explore</button><button onclick={() => setp({ present: '', tab: 'graph' })}>First principles</button><button onclick={() => (chatOpen = !chatOpen)}>{chatOpen ? 'Hide chat' : 'Ask Anís'}</button></div>
    <button class="exit" onclick={() => setp({ present: '' })}>Exit ✕</button>{/if}
  {#if ready}
    {#if present || tab === 'hero'}<Hero {ov} {loading} {error} {present} onnav={(t, x) => go(t, x)} onchat={ask} />
    {:else if tab === 'explore'}<Explore {p} {setp} {concepts} {religions} bump={bump} onnav={(t, x) => go(t, x)} onchat={ask} />
    {:else if tab === 'graph'}<GraphView {p} {setp} {concepts} {religions} onnav={(t, x) => go(t, x)} onchat={ask} />
    {:else if tab === 'para'}<ParagraphEditor {p} {setp} bump={bump} onchat={ask} />
    {:else if tab === 'scores'}<Scored {p} {setp} />
    {:else if tab === 'log'}<EditLog />{/if}
  {/if}
  {#if chatOpen}<ChatDock {seed} onclose={() => (chatOpen = false)} />{:else if !present}<button class="fab" onclick={() => (chatOpen = true)}>Ask Anís</button>{/if}
</div>

<style>
  .stage { padding: 1.25rem 1.75rem 4rem; min-height: 100vh; }
  .stage.present { position: fixed; inset: 0; z-index: 1000; overflow: auto; background: radial-gradient(ellipse at 20% 0%, color-mix(in srgb, var(--accent) 18%, var(--surface-solid)), var(--surface-solid) 60%); padding: 2.5rem 4rem; }
  .head { display: flex; justify-content: space-between; align-items: end; gap: 1rem; margin-bottom: 1rem; } h1 { font-size: 1.6rem; font-weight: 600; color: var(--text-primary); } .head p { color: var(--text-muted); font-size: .9rem; }
  .fx { color: var(--warning); margin-left: .5rem; } .pres { background: linear-gradient(90deg, var(--accent), var(--accent-tertiary)); color: #fff; border-radius: .6rem; padding: .5rem 1.2rem; font-weight: 600; }
  .tabs { display: flex; gap: .25rem; border-bottom: 1px solid var(--border-default); margin-bottom: 1.25rem; flex-wrap: wrap; } .tabs button { padding: .6rem 1.1rem; color: var(--text-tertiary); border-bottom: 2px solid transparent; margin-bottom: -1px; } .tabs button:hover { color: var(--text-primary); } .tabs .on { color: var(--accent); border-color: var(--accent); }
  .tabs .chatbtn { margin-left: auto; color: var(--accent); }
  .pmenu { position: fixed; top: 1rem; left: 1.25rem; z-index: 1001; display: flex; gap: .9rem; opacity: .3; transition: opacity .2s; } .pmenu:hover { opacity: 1; } .pmenu button { color: var(--text-secondary); font-size: .85rem; }
  .fab { position: fixed; right: 1.25rem; bottom: 1.25rem; z-index: 40; background: linear-gradient(90deg, var(--accent), var(--accent-tertiary)); color: #fff; border-radius: 999px; padding: .55rem 1.2rem; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,.35); }
  .exit { position: fixed; top: 1rem; right: 1.25rem; z-index: 1001; opacity: .35; color: var(--text-secondary); font-size: .85rem; } .exit:hover { opacity: 1; }
</style>
