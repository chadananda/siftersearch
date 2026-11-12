<script>
  // Docked Anís chat (existing /api/v1/chat via chat.stream). First message carries the selected premise(s) + passage as context.
  import { chat } from '../../../lib/api.js';
  let { seed = null, onclose = () => {} } = $props();
  let msgs = $state([]), input = $state(''), busy = $state(false), cid = null, error = $state(''), box = $state(null), lastSeed = null;
  const ctx = (items) => items.map((i) => `Question: ${i.question}\nPremise: ${i.premise}\nImplies: ${i.implies}\nPassage (${i.doc?.title}, ${i.doc?.author}): ${i.paragraph?.text ?? i.proof}`).join('\n\n');
  $effect(() => { if (seed && seed !== lastSeed) { lastSeed = seed; msgs = []; cid = null; send(`Here is an implied first principle I am reviewing:\n\n${ctx(seed.items)}\n\nIs this premise really implied by the passage? What does it challenge in modern thinking, and are there other passages that bear on it?`); } });
  async function send(text) {
    if (!text.trim() || busy) return; error = ''; busy = true; input = '';
    msgs = [...msgs, { role: 'user', content: text }, { role: 'assistant', content: '' }];
    try {
      for await (const e of chat.stream(msgs.slice(0, -1).map(({ role, content }) => ({ role, content })), null, cid)) {
        if (e.type === 'chunk') msgs[msgs.length - 1].content += e.text; else if (e.type === 'session' && e.conversation_id) cid = e.conversation_id; else if (e.type === 'complete' && e.conversation_id) cid = e.conversation_id; else if (e.type === 'error') error = e.message || 'Chat error';
        box?.scrollTo(0, box.scrollHeight);
      }
    } catch (e) { error = e.status ? `Chat failed (${e.status})` : e.message; }
    busy = false;
  }
</script>
<aside class="dock">
  <header><b>Ask Anís</b><button onclick={onclose} aria-label="Close chat">×</button></header>
  <div class="msgs" bind:this={box}>
    {#if !msgs.length}<p class="text-muted text-sm">Use “Ask in chat” on any card or node to seed a question about it, or type below.</p>{/if}
    {#each msgs as m, i (i)}<div class={`m ${m.role}`}>{m.role === 'user' && i === 0 && seed ? 'About the selected premise…' : m.content}{#if busy && i === msgs.length - 1 && !m.content}<span class="dots">…</span>{/if}</div>{/each}
    {#if error}<p class="text-error text-sm">{error}</p>{/if}
  </div>
  <form onsubmit={(e) => { e.preventDefault(); send(input); }}><input placeholder="Ask about this…" bind:value={input} disabled={busy} /><button disabled={busy}>Send</button></form>
</aside>
<style>
  .dock { position: fixed; right: 1rem; bottom: 1rem; width: min(420px, calc(100vw - 2rem)); height: min(560px, 70vh); z-index: 50; display: flex; flex-direction: column; background: var(--surface-solid); border: 1px solid var(--accent); border-radius: 1rem; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
  header { display: flex; justify-content: space-between; padding: .6rem 1rem; border-bottom: 1px solid var(--border-default); color: var(--text-primary); } header button { color: var(--text-muted); font-size: 1.3rem; }
  .msgs { flex: 1; overflow: auto; padding: .75rem; display: grid; gap: .5rem; align-content: start; } .m { white-space: pre-wrap; font-size: .88rem; line-height: 1.5; padding: .5rem .75rem; border-radius: .7rem; max-width: 92%; } .m.user { background: var(--accent-primary-alpha); justify-self: end; color: var(--text-primary); } .m.assistant { background: var(--surface-2); color: var(--text-secondary); }
  form { display: flex; gap: .4rem; padding: .6rem; border-top: 1px solid var(--border-default); } form input { flex: 1; background: var(--surface-1); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: .5rem; padding: .4rem .7rem; } form button { background: var(--accent); color: var(--accent-primary-text); border-radius: .5rem; padding: 0 .9rem; }
</style>
