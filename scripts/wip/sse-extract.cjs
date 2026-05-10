// Parse a saved SSE response file (`data: {json}` per event) and concat the
// text events into one reply string. Writes the captured reply to stdout
// and the captured conversation_id to argv[2] if provided.
const fs = require('fs');
const path = process.argv[2];
const idOut = process.argv[3];

const lines = fs.readFileSync(path, 'utf-8').split('\n');
let reply = '';
let convId = null;
let meta = null;
let stages = [];
for (const line of lines) {
  if (!line.startsWith('data:')) continue;
  const payload = line.slice(5).trim();
  if (!payload) continue;
  try {
    const evt = JSON.parse(payload);
    if (evt.type === 'session') convId = evt.conversation_id;
    if (evt.type === 'text') reply += evt.content || '';
    if (evt.type === 'done') { meta = evt.meta; if (evt.conversation_id) convId = evt.conversation_id; }
    if (evt.type === 'stage') stages.push(evt.stage);
  } catch { /* skip malformed lines */ }
}
process.stdout.write(reply.trim());
if (idOut && convId) fs.writeFileSync(idOut, convId);
process.stderr.write('\n[meta] ' + JSON.stringify(meta) + '\n[stages] ' + stages.join(' ') + '\n');
