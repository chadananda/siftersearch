// Drive a REAL Anis conversation through /api/chat/stream (as the widget does) and time what the seeker sees.
// Run: node scripts/wip/anis-live-convo.mjs ["q1" "q2" ...]
const API = 'https://api.siftersearch.com';
const turns = process.argv.slice(2).length ? process.argv.slice(2)
  : ['Who was Mullá Ḥusayn?', 'Where was he killed?', 'What did Bahá’u’lláh say about the earth being one country?'];
const messages = [];
for (const q of turns) {
  messages.push({ role: 'user', content: q });
  const t0 = Date.now(); const seen = {}; let text = ''; let meta = null; let status = [];
  const res = await fetch(`${API}/api/chat/stream`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages }) });
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const line = buf.slice(0, i).split('\n').find((l) => l.startsWith('data: ')); buf = buf.slice(i + 2);
      if (!line) continue; let ev; try { ev = JSON.parse(line.slice(6)); } catch { continue; }
      seen[ev.type] ??= Date.now() - t0;
      if (ev.type === 'status') status.push(ev.text);
      if (ev.type === 'text') text += ev.content;
      if (ev.type === 'complete') meta = ev.meta;
      if (ev.type === 'error') text += `[ERROR ${ev.message}]`;
    }
  }
  messages.push({ role: 'assistant', content: text });
  console.log(`\n=== ${q}\n  events(ms): ${JSON.stringify(seen)}\n  status: ${status.join(' | ')}\n  engine: ${meta?.engine} intent: ${meta?.user_intent} timings: ${JSON.stringify(meta?.timings)}\n---\n${text}\n`);
}
