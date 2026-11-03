// Pair the runner's Perplexity answers with the chat-stream (strategy ON) Anís answers, for --rejudge.
import fs from 'fs';
const [bat, stream, out] = process.argv.slice(2);
const B = JSON.parse(fs.readFileSync(bat)).cases; const St = JSON.parse(fs.readFileSync(stream));
const cases = B.map((c) => { const s = St.find((x) => x.id === c.id); return { id: c.id, kind: c.kind, expect: c.expect, extra: c.extra, messages: c.messages,
  answers: { perplexity: c.answers.perplexity, current: { text: s?.reply || '(missing)', ms: s?.total } } }; });
fs.writeFileSync(out, JSON.stringify({ cases }, null, 1)); console.log(cases.length, cases.filter((c) => /error/.test(c.answers.perplexity?.text || '')).length, 'px errors');
