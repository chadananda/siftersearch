<script>
  // Compact 1-5 question scorer (1 stupid … 5 excellent). Click sets, click the same again clears; optimistic, error reverts. 1-2 opens an optional reason row (tag chips + note).
  // Keys 1-5 work on any focused row that wraps it (see keyScore in util.js). Saves via api.setScore / clearScore.
  import { api } from './api.js';
  let { paraId, question, kind = 'stated', impliedId = null, score = null, fault = null, onchange = () => {} } = $props();
  const NAMES = ['', 'stupid', 'weak', 'ok', 'good', 'excellent'];
  const TAGS = ['self-reference', 'vague', 'not answered by passage', 'too long', 'trivial', 'wrong tradition/term', 'duplicate'];
  let val = $state(null), tags = $state([]), note = $state(''), open = $state(false), err = $state(''), saved = $state(false);
  $effect(() => { val = score ?? null; });
  const body = (extra = {}) => ({ paraId, question, kind, impliedId, score: val, tags, note, ...(fault ? { fault } : {}), ...extra });
  async function pick(n) {
    const prev = val; err = ''; saved = false;
    if (val === n) { val = null; open = false; try { await api.clearScore(paraId, question); onchange(null); } catch (e) { val = prev; err = e.message; } return; }
    val = n; open = n <= 2;
    try { await api.setScore(body({ score: n, tags: n <= 2 ? tags : [], note: n <= 2 ? note : '' })); onchange(n); } catch (e) { val = prev; open = false; err = e.message; }
  }
  async function saveReason() { err = ''; try { await api.setScore(body()); saved = true; open = false; } catch (e) { err = e.message; } }
  const toggle = (t) => (tags = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);
</script>

<span class="scorer" role="group" aria-label="Score this question">
  {#each [1, 2, 3, 4, 5] as n (n)}
    <button type="button" data-n={n} class:on={val != null && n <= val} class:bad={val != null && val <= 2 && n <= val} title={`${n} · ${NAMES[n]}${val === n ? ' (click to clear)' : ''}`} aria-label={`Score ${n}, ${NAMES[n]}`} aria-pressed={val === n} onclick={(e) => { e.stopPropagation(); pick(n); }}>{n}</button>
  {/each}
  {#if val != null}<small class:bad={val <= 2}>{NAMES[val]}{saved ? ' · saved' : ''}</small>{/if}
  {#if err}<small class="e">{err}</small>{/if}
</span>
{#if open}
  <div class="reason">
    <span class="chips">{#each TAGS as t (t)}<button type="button" class="chip" class:sel={tags.includes(t)} onclick={() => toggle(t)}>{t}</button>{/each}</span>
    <input placeholder="why? (optional)" bind:value={note} onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') saveReason(); }} />
    <button type="button" class="save" onclick={saveReason}>Save reason</button>
  </div>
{/if}

<style>
  .scorer { display: inline-flex; align-items: center; gap: 2px; vertical-align: middle; }
  .scorer button { width: 1.25rem; height: 1.25rem; font-size: .68rem; line-height: 1; border-radius: .3rem; border: 1px solid var(--border-default); background: var(--surface-2); color: var(--text-muted); cursor: pointer; padding: 0; }
  .scorer button:hover { border-color: var(--accent); color: var(--text-primary); }
  .scorer button.on { background: var(--accent-primary-alpha); color: var(--accent); border-color: var(--accent); }
  .scorer button.bad { background: color-mix(in srgb, var(--error) 18%, transparent); color: var(--error); border-color: var(--error); }
  small { margin-left: .35rem; font-size: .68rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; } small.bad { color: var(--error); } small.e { color: var(--error); text-transform: none; }
  .reason { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; margin-top: .4rem; padding: .4rem .5rem; border: 1px dashed var(--error); border-radius: .5rem; background: var(--surface-1); }
  .chips { display: flex; flex-wrap: wrap; gap: .25rem; }
  .chip { font-size: .68rem; padding: .1rem .5rem; border-radius: 999px; border: 1px solid var(--border-default); background: var(--surface-2); color: var(--text-secondary); cursor: pointer; }
  .chip.sel { background: var(--accent-primary-alpha); color: var(--accent); border-color: var(--accent); }
  .reason input { flex: 1; min-width: 10rem; font-size: .8rem; padding: .2rem .5rem; border-radius: .4rem; border: 1px solid var(--border-default); background: var(--surface-solid); color: var(--text-primary); }
  .save { font-size: .72rem; padding: .15rem .6rem; border-radius: .4rem; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-primary-text); cursor: pointer; }
</style>
