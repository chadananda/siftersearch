<script>
  // One implied first-principle: QUESTION headline, premise ("answered by implication"), implies ("challenges"), passage with proof highlighted. Inline edit + action row.
  import { highlight, colorOf, statusTone, tradName, keyScore } from './util.js';
  import ScoreBar from './ScoreBar.svelte';
  let { item, score = null, big = false, readonly = false, focused = false, selected = false, onact = () => {}, onsave = async () => {}, showSnippet = true } = $props();
  let editing = $state(false), draft = $state({}), err = $state(''), saving = $state(false);
  export function edit() { startEdit(); }
  function startEdit() { draft = { question: item.question, premise: item.premise, implies: item.implies, proof: item.proof, concept: item.concept || '' }; err = ''; editing = true; }
  async function save() { saving = true; err = ''; try { await onsave(item, draft); editing = false; } catch (e) { err = e.message; } saving = false; }
  const acts = [['approve', 'Approve', 'a'], ['edit', 'Edit', 'e'], ['reject', 'Reject', 'r'], ['similar', 'Similar', 's'], ['graph', 'Graph', 'g'], ['para', 'HyPE editor', ''], ['chat', 'Ask in chat', '']];
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<article tabindex="0" onkeydown={keyScore} class="card" class:big class:focused class:selected style={`--tc:${colorOf(item.doc?.religion)}`} data-id={item.id}>
  <header class="top">
    {#if !readonly}<input type="checkbox" checked={selected} onchange={() => onact('select', item)} aria-label="Select" />{/if}
    {#if item.concept}<span class="chip">{item.concept}</span>{/if}
    <span class="chip trad">{tradName(item.doc?.religion)}</span>
    {#if !readonly}<span class={`status ${statusTone[item.status]}`}>{item.status}</span>{/if}
    {#if score != null}<span class="score">{score.toFixed(2)}</span>{/if}
  </header>
  {#if editing}
    <div class="edit">
      <label>Question<input bind:value={draft.question} /></label>
      <label>Premise (answered by implication)<textarea rows="2" bind:value={draft.premise}></textarea></label>
      <label>Challenges (implies)<textarea rows="2" bind:value={draft.implies}></textarea></label>
      <label>Proof (exact words from the passage)<input bind:value={draft.proof} /></label>
      <label>Concept<input bind:value={draft.concept} /></label>
      {#if err}<p class="text-error text-sm">{err}</p>{/if}
      <div class="row"><button class="btn primary" onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button><button class="btn" onclick={() => (editing = false)}>Cancel</button></div>
    </div>
  {:else}
    <h3 class="q">{item.question}</h3>
    {#if item.paraId}<div class="rate"><ScoreBar paraId={item.paraId} question={item.question} kind="implied" impliedId={item.id} score={item.myScore ?? null} /></div>{/if}
    {#if item.premise}<p class="line"><span class="k">answered by implication</span>{item.premise}</p>{/if}
    {#if item.implies}<p class="line"><span class="k">challenges</span>{item.implies}</p>{/if}
    {#if showSnippet && item.paragraph?.text}<blockquote class="quote">{@html highlight(item.paragraph.text, item.proof)}</blockquote>{/if}
    <footer class="src">
      <a href={item.link} target="_blank" rel="noopener"><b>{item.doc?.title}</b> · {item.doc?.author}</a>
      {#if item.doc?.collection}<span class="text-muted"> · {item.doc.collection}</span>{/if}
    </footer>
  {/if}
  {#if !readonly && !editing}
    <div class="acts">{#each acts as [k, label, key] (k)}<button class="btn sm" onclick={() => (k === 'edit' ? startEdit() : onact(k, item))} title={key ? `key: ${key}` : ''}>{label}</button>{/each}</div>
  {/if}
</article>

<style>
  .card { position: relative; background: var(--surface-1); border: 1px solid var(--border-default); border-left: 3px solid var(--tc); border-radius: 0.75rem; padding: 1rem 1.25rem; transition: transform .2s, box-shadow .2s, border-color .2s; }
  .card:hover { box-shadow: 0 8px 28px -12px var(--tc); }
  .card.focused { outline: 2px solid var(--accent); outline-offset: 2px; }
  .card.selected { background: var(--accent-primary-alpha); }
  .top { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; font-size: .7rem; text-transform: uppercase; letter-spacing: .06em; }
  .chip { padding: .1rem .5rem; border-radius: 999px; background: var(--surface-2); color: var(--text-secondary); }
  .chip.trad { color: var(--tc); }
  .score { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--text-muted); }
  .status { margin-left: auto; font-weight: 600; }
  .score + .status { margin-left: .5rem; }
  .q { font-size: 1.25rem; line-height: 1.3; font-weight: 600; color: var(--text-primary); margin: .5rem 0 .4rem; font-family: Georgia, 'Times New Roman', serif; }
  .big .q { font-size: clamp(1.8rem, 3.6vw, 3.2rem); line-height: 1.15; margin: 1rem 0; }
  .big .line, .big .quote { font-size: 1.15rem; }
  .rate { margin: -.15rem 0 .35rem; }
  .line { color: var(--text-secondary); font-size: .9rem; margin: .15rem 0; }
  .k { display: inline-block; margin-right: .5rem; font-size: .65rem; text-transform: uppercase; letter-spacing: .08em; color: var(--tc); }
  .quote { margin: .75rem 0 .5rem; padding-left: .9rem; border-left: 2px solid var(--border-strong); color: var(--text-tertiary); font-size: .9rem; font-style: italic; line-height: 1.55; }
  .quote :global(mark) { background: color-mix(in srgb, var(--tc) 30%, transparent); color: var(--text-primary); border-radius: .2rem; padding: 0 .15rem; font-style: normal; }
  .src { font-size: .8rem; color: var(--text-tertiary); }
  .src a { color: inherit; text-decoration: none; } .src a:hover { color: var(--accent); }
  .acts { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .75rem; opacity: .75; } .card:hover .acts, .focused .acts { opacity: 1; }
  .btn { border: 1px solid var(--border-default); background: var(--surface-2); color: var(--text-primary); border-radius: .5rem; padding: .35rem .8rem; cursor: pointer; font-size: .85rem; }
  .btn.sm { padding: .15rem .55rem; font-size: .75rem; } .btn:hover { border-color: var(--accent); } .btn.primary { background: var(--accent); color: var(--accent-primary-text); border-color: var(--accent); }
  .edit { display: grid; gap: .5rem; margin-top: .5rem; } .edit label { display: grid; gap: .15rem; font-size: .7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; }
  .edit input, .edit textarea { background: var(--surface-solid); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: .4rem; padding: .4rem .6rem; font-size: .9rem; text-transform: none; letter-spacing: 0; }
  .row { display: flex; gap: .5rem; }
</style>
