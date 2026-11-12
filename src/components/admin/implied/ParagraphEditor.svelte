<script>
  // HyPE editor for one paragraph: passage + context left; stated questions, thesis, implied items (CRUD, propose) right.
  import { untrack } from 'svelte';
  import { api } from './api.js';
  import ItemCard from './ItemCard.svelte';
  import ScoreBar from './ScoreBar.svelte';
  import { keyScore } from './util.js';
  let { p, setp, onchat = () => {}, bump = () => {} } = $props();
  let d = $state(null), stated = $state([]), thesis = $state(''), error = $state(''), msg = $state(''), proposals = $state([]), usdSpent = $state(null), busy = $state(''), adding = $state(false), nu = $state({ question: '', premise: '', implies: '', proof: '', concept: '' }), force = $state(false), pid = $state(p.para || '');
  async function load() {
    if (!p.para) { d = null; return; }
    error = '';
    try { d = await api.para(p.para); stated = d.stated.map((s) => ({ ...s })); thesis = d.thesis || ''; proposals = []; } catch (e) { error = e.message; }
  }
  $effect(() => { p.para; untrack(load); });
  const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= stated.length) return; [stated[i], stated[j]] = [stated[j], stated[i]]; };
  async function save() { busy = 'save'; try { const r = await api.savePara(p.para, { stated, thesis }); msg = `Saved · re-indexing ${r.reindex || 'queued'}`; bump(); } catch (e) { error = e.message; } busy = ''; }
  async function propose() { busy = 'propose'; error = ''; try { const r = await api.propose(p.para); proposals = r.items; usdSpent = r.usd; } catch (e) { error = e.message; } busy = ''; }
  async function decide(it, status) {
    try { const r = await api.patch(it.id, { status }); proposals = proposals.filter((x) => x.id !== it.id); msg = `${status} · re-indexing ${r.reindex || 'queued'}`; await load(); bump(); } catch (e) { error = e.message; }
  }
  async function add() { try { await api.create({ paraId: +p.para, ...nu, force }); adding = false; nu = { question: '', premise: '', implies: '', proof: '', concept: '' }; msg = 'Added · re-indexing queued'; await load(); bump(); } catch (e) { error = e.message + (e.status === 422 ? ' — tick “force” to save anyway' : ''); } }
  async function act(k, it) { if (k === 'approve' || k === 'reject') { await api.patch(it.id, { status: k === 'approve' ? 'approved' : 'rejected' }); await load(); bump(); } else if (k === 'chat') onchat([it]); }
  async function save1(it, dr) { await api.patch(it.id, { ...dr, status: 'edited' }); await load(); bump(); }
</script>

{#if !p.para}
  <form class="pick" onsubmit={(e) => { e.preventDefault(); setp({ para: pid }); }}><input placeholder="Paragraph id…" bind:value={pid} /><button>Open</button><span class="text-muted text-sm">or use “HyPE editor” on any card.</span></form>
{:else if error && !d}<p class="text-error">{error}</p>
{:else if !d}<div class="skel"></div>
{:else}
  {#if error}<p class="text-error mb-2">{error}</p>{/if}
  <div class="cols">
    <section class="pass">
      <p class="meta">{d.doc?.title} · {d.doc?.author} · ¶{d.paragraph.index} <span class="text-muted">· HyPE v{d.hypeVersion}</span></p>
      {#if d.paragraph.prev}<p class="ctx">{d.paragraph.prev}</p>{/if}
      <p class="main">{d.paragraph.text}</p>
      {#if d.paragraph.next}<p class="ctx">{d.paragraph.next}</p>{/if}
    </section>
    <section class="ed">
      <h2>Stated questions</h2>
      {#each stated as s, i (i)}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
        <div class="st" tabindex="0" onkeydown={keyScore}>
          <input placeholder="question" bind:value={s.q} />{#if s.q.trim()}<div><ScoreBar paraId={+p.para} question={s.q} kind="stated" score={s.myScore ?? null} /></div>{/if}<textarea rows="2" placeholder="answer" bind:value={s.a}></textarea>
          <div class="row"><label><input type="checkbox" bind:checked={s.deep} /> deep</label><label><input type="checkbox" bind:checked={s.seeker} /> seeker</label>
            <button onclick={() => move(i, -1)} aria-label="Move up">↑</button><button onclick={() => move(i, 1)} aria-label="Move down">↓</button><button class="del" onclick={() => (stated = stated.filter((_, j) => j !== i))}>delete</button></div>
        </div>
      {/each}
      <button class="lk" onclick={() => (stated = [...stated, { q: '', a: '', deep: false, seeker: false }])}>+ add question</button>
      <h2>Thesis</h2><textarea rows="2" bind:value={thesis}></textarea>
      <div class="row"><button class="primary" onclick={save} disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save HyPE'}</button>{#if msg}<span class="text-success text-sm">{msg}</span>{/if}</div>
      <h2>Implied first principles</h2>
      <div class="imp">{#each d.implied as it (it.id)}<ItemCard item={it} showSnippet={false} onact={act} onsave={save1} />{:else}<p class="text-muted text-sm">None yet.</p>{/each}</div>
      <div class="row"><button class="primary" onclick={propose} disabled={busy === 'propose'}>{busy === 'propose' ? 'Thinking…' : 'Propose implied (≈$0.005)'}</button><button class="lk" onclick={() => (adding = !adding)}>+ add by hand</button></div>
      {#if usdSpent != null}<p class="text-sm text-muted">Spent ${usdSpent.toFixed(4)} on this proposal.</p>{/if}
      {#each proposals as it (it.id)}<div class="prop"><ItemCard item={it} showSnippet={false} readonly /><div class="row"><button class="primary" onclick={() => decide(it, 'approved')}>Accept</button><button onclick={() => decide(it, 'rejected')}>Reject</button></div></div>{/each}
      {#if adding}
        <div class="st">
          <input placeholder="Question" bind:value={nu.question} /><textarea rows="2" placeholder="Premise" bind:value={nu.premise}></textarea><textarea rows="2" placeholder="Challenges (implies)" bind:value={nu.implies}></textarea><input placeholder="Proof — exact words from the passage" bind:value={nu.proof} /><input placeholder="Concept" bind:value={nu.concept} />
          <div class="row"><label><input type="checkbox" bind:checked={force} /> force (skip proof check)</label><button class="primary" onclick={add}>Add</button></div>
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; } @media (max-width: 1100px) { .cols { grid-template-columns: 1fr; } }
  .pass { position: sticky; top: 1rem; align-self: start; background: var(--surface-1); border: 1px solid var(--border-default); border-radius: 1rem; padding: 1.5rem; max-height: calc(100vh - 8rem); overflow: auto; }
  .meta { font-size: .8rem; color: var(--text-tertiary); margin-bottom: 1rem; } .main { font-size: 1.15rem; line-height: 1.7; color: var(--text-primary); font-family: Georgia, serif; margin: 1rem 0; padding: .75rem 1rem; border-left: 3px solid var(--accent); } .ctx { color: var(--text-muted); font-size: .9rem; line-height: 1.6; }
  .ed { display: grid; gap: .6rem; align-content: start; } h2 { font-size: .7rem; text-transform: uppercase; letter-spacing: .15em; color: var(--text-muted); margin-top: .75rem; }
  input:not([type=checkbox]), textarea { width: 100%; background: var(--surface-solid); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: .4rem; padding: .4rem .6rem; font-size: .9rem; }
  .st { display: grid; gap: .35rem; padding: .6rem; border: 1px solid var(--border-subtle); border-radius: .6rem; background: var(--surface-1); } .row { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; font-size: .8rem; color: var(--text-secondary); }
  button { border: 1px solid var(--border-default); background: var(--surface-2); color: var(--text-primary); border-radius: .5rem; padding: .3rem .8rem; font-size: .85rem; cursor: pointer; } button.primary { background: var(--accent); color: var(--accent-primary-text); border-color: var(--accent); } button.del { color: var(--error); } button.lk { background: none; border: 0; color: var(--accent); justify-self: start; }
  .imp, .prop { display: grid; gap: .6rem; } .prop { padding: .5rem; border: 1px dashed var(--warning); border-radius: .75rem; }
  .pick { display: flex; gap: .5rem; align-items: center; } .pick input { max-width: 16rem; } .skel { height: 14rem; border-radius: 1rem; background: var(--surface-1); }
</style>
