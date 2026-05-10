// Re-run a chat call and report inter-event wall-clock so we can see where
// the seconds are being spent.
const { spawnSync } = require('child_process');

const API = 'https://api.siftersearch.com/api/v1/chat';
const KEY = 'a9b228276d355e3a053223bfd64cd5546792c65053905606fef5dfe68fab7a31';
const body = JSON.stringify({
  messages: [{ role: 'user', content: 'What does Bahá’u’lláh say in the Tablet of Wisdom about materialism?' }],
  tenant: 'siftersearch'
});

const t0 = Date.now();
const result = spawnSync('curl', [
  '-s', '-m', '30', '-N',
  '-H', 'Content-Type: application/json',
  '-H', `X-API-Key: ${KEY}`,
  '-H', 'X-Debug-Chat: 1',
  '-H', 'Accept: text/event-stream',
  '-X', 'POST',
  '-d', body,
  '--no-buffer',
  API,
  '-w', 'TIME_TOTAL=%{time_total}\\n'
], { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 });

console.log('curl exit:', result.status, 'wall:', ((Date.now() - t0) / 1000).toFixed(2) + 's');
const lines = (result.stdout || '').split('\n');
let firstChunk = null;
let lastChunk = null;
let stage = null;
const events = [];
let elapsed = 0;
for (const line of lines) {
  if (line.startsWith('TIME_TOTAL=')) {
    console.log(line);
    continue;
  }
  if (!line.startsWith('data:')) continue;
  try {
    const evt = JSON.parse(line.slice(5).trim());
    if (evt.type === 'stage') events.push(`STAGE→${evt.stage}`);
    else if (evt.type === 'debug_intent') events.push(`INTENT (${evt.entities?.work_name || '-'} / ${evt.entities?.topics?.join(',') || '-'})`);
    else if (evt.type === 'debug_research_call') events.push(`CALL ${evt.name}`);
    else if (evt.type === 'debug_research_result') events.push(`RES ${evt.name} ${JSON.stringify(evt.diag)}`);
    else if (evt.type === 'text') {
      if (!firstChunk) firstChunk = Date.now();
      lastChunk = Date.now();
    } else if (evt.type === 'done') events.push(`DONE`);
  } catch { /* skip */ }
}
console.log('events seen:');
for (const e of events) console.log('  -', e);
console.log('TTFT (first text chunk):', firstChunk ? ((firstChunk - t0) / 1000).toFixed(2) + 's' : 'never');
console.log('Stream end:', lastChunk ? ((lastChunk - t0) / 1000).toFixed(2) + 's' : 'never');
