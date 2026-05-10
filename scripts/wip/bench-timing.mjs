// Real-time SSE timing — uses fetch streaming so we see when each event lands.
const KEY = 'a9b228276d355e3a053223bfd64cd5546792c65053905606fef5dfe68fab7a31';
const API = 'https://api.siftersearch.com/api/v1/chat';

const t0 = Date.now();
const ms = () => ((Date.now() - t0) / 1000).toFixed(2) + 's';

const res = await fetch(API, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': KEY,
    'X-Debug-Chat': '1',
    Accept: 'text/event-stream'
  },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'What does Bahá’u’lláh say in the Tablet of Wisdom about materialism?' }],
    tenant: 'siftersearch'
  })
});

console.log(`[${ms()}] HTTP ${res.status}`);
let firstChunk = null;
let lastChunk = null;
const decoder = new TextDecoder();
let buf = '';
for await (const chunk of res.body) {
  buf += decoder.decode(chunk, { stream: true });
  const lines = buf.split('\n');
  buf = lines.pop();
  for (const line of lines) {
    if (!line.startsWith('data:')) continue;
    try {
      const evt = JSON.parse(line.slice(5).trim());
      if (evt.type === 'stage') console.log(`[${ms()}] STAGE → ${evt.stage}`);
      else if (evt.type === 'debug_intent') console.log(`[${ms()}] INTENT ${evt.entities?.work_name ?? '-'} / [${evt.entities?.topics?.join(',') ?? ''}]`);
      else if (evt.type === 'debug_research_call') console.log(`[${ms()}] CALL ${evt.name} ${JSON.stringify(evt.args).slice(0, 120)}`);
      else if (evt.type === 'debug_research_result') console.log(`[${ms()}] RES  ${evt.name} ${JSON.stringify(evt.diag)}`);
      else if (evt.type === 'text') {
        if (!firstChunk) { firstChunk = Date.now(); console.log(`[${ms()}] *** FIRST TEXT CHUNK`); }
        lastChunk = Date.now();
      }
      else if (evt.type === 'done') console.log(`[${ms()}] DONE`);
    } catch { /* skip */ }
  }
}
console.log(`[${ms()}] stream closed`);
console.log(`TTFT: ${firstChunk ? ((firstChunk - t0) / 1000).toFixed(2) + 's' : 'never'}`);
console.log(`Total: ${lastChunk ? ((lastChunk - t0) / 1000).toFixed(2) + 's' : 'no chunks'}`);
