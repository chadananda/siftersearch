import fs from 'fs';
const base = process.env.B || 'https://api.siftersearch.com';
const DS = process.env.DEPLOY_SECRET;
const I = [
 ['book','Kitáb-i-Íqán','[ií]qan|certitude'],['book','The Hidden Words','hidden words'],['book','Some Answered Questions','answered questions'],['book','Paris Talks','paris talks'],
 ['book',"Gleanings from the Writings of Bahá'u'lláh",'gleanings'],['book','Dawn-Breakers','dawn'],['book','Epistle to the Son of the Wolf','son of the wolf'],['book','Tao Te Ching','tao|dao'],
 ['book','Dhammapada','dhammapada'],['book','Bhagavad Gita','gita'],['book','The Seven Valleys','seven valleys'],['book','Prayers and Meditations','prayers and meditations'],
 ['book','Promulgation of Universal Peace','promulgation'],['book','God Passes By','god passes by'],
 ['quote','"the earth is but one country and mankind its citizens"','gleanings|proclamation|one country'],['quote','"The best beloved of all things in My sight is Justice"','hidden words'],
 ['quote','"ye are the fruits of one tree and the leaves of one branch"','tablets|gleanings|hidden|fruits|promulgation|paris|selections|bahá'],['quote','"Be generous in prosperity, and thankful in adversity"','tablets|gleanings|hidden|bahá|words of paradise'],
 ['quote','"O Son of Spirit! My first counsel is this"','hidden words'],['quote','"Veiled in My immemorial being and in the ancient eternity of My essence"','hidden words'],
 ['quote','"Man is the supreme Talisman"','gleanings'],['quote','"Let not a man glory in that he loveth his country"','gleanings|tablets|bahá'],
 ['quote','"The Lord is my shepherd; I shall not want"','psalm|bible|testament|king james|scripture'],['quote','"Blessed are the poor in spirit"','matthew|bible|testament|gospel|king james'],
 ['quote','"Blessed is the spot, and the house, and the place, and the city"','prayers|tablets|bahá|selections|gleanings'],['quote','"Religion is the greatest of all means for the establishment of order in the world"','tablets|gleanings|bahá|selections'],
 ['quote','"Hatred never ceases by hatred"','dhammapada'],['quote','"The Tao that can be told is not the eternal Tao"','tao|dao'],
 ['ref','Gleanings 27','gleanings'],['ref','Gleanings 1','gleanings'],['ref','Gleanings section CXXVII','gleanings'],['ref','Dhammapada 183','dhammapada'],['ref','Tao Te Ching 1','tao|dao'],
 ['ref','Some Answered Questions 33','answered questions'],['ref','Seven Valleys 5','seven valleys'],['ref','Paris Talks 12','paris talks'],['ref','Epistle to the Son of the Wolf 20','son of the wolf'],
 ['ref','Gleanings 100','gleanings'],['ref','Tao Te Ching 8','tao|dao'],['ref','Dhammapada 1','dhammapada'],['ref','Hidden Words no. 12','hidden words'],['ref','Dawn-Breakers 3','dawn'],
];
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',').map(Number)) : null;
async function one([kind, q, exp], i) {
  const t0 = Date.now(); const o = { i, kind, q };
  try {
    const r = await fetch(base + '/api/chat/stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: q }] }), signal: AbortSignal.timeout(120000) });
    o.http = r.status; const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', txt = '';
    for (;;) { const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value); const ps = buf.split('\n\n'); buf = ps.pop();
      for (const p of ps) { const m = /^data: (.*)$/m.exec(p); if (!m) continue; let e; try { e = JSON.parse(m[1]); } catch { continue; }
        if (e.type === 'session') o.cid = e.conversation_id;
        if ((e.type === 'text' || e.type === 'chunk') && o.first == null) o.first = Date.now() - t0;
        if (e.type === 'chunk') txt += e.text; if (e.type === 'text' && !txt) o.t1 = e.content; if (e.type === 'error') o.err = e.message || e.error; } }
    o.total = Date.now() - t0; o.reply = txt || o.t1 || '';
    if (o.cid) { await new Promise((z) => setTimeout(z, 3000)); const t = await fetch(base + '/api/admin/anis/threads/' + o.cid, { headers: { 'X-Internal-Key': DS } }).then((x) => x.json()).catch(() => null);
      const rt = t?.rounds?.[0]?.reply?.route; o.prov = rt?.plan?.provenance; o.shape = rt?.plan?.shape; o.lookupMs = rt?.timeline?.find((x) => x.name === 'lookup')?.ms; o.llm = (rt?.llm || []).map((x) => x.caller).join(','); const rr=t?.rounds?.[0]?.reply; o.route=rr?.route; o.meta=rr?.meta; o.fmtBy=rt?.plan?.stages?.format?.by; o.lookupEnd=(()=>{const l=rt?.timeline?.find((x)=>x.name==='lookup'); return l? l.at+l.ms:null})(); o.lookupTl=rt?.timeline?.find((x)=>x.name==='lookup')||null; o.hasSearch=!!rt?.timeline?.some((x)=>x.name==='search'); o.retr=rt?.retrieved; o.srvEnd=rr?.meta?.latency_ms; }
    o.links = [...new Set([...o.reply.matchAll(/\[([^\]]+)\]\((?:https:\/\/siftersearch\.com\/library\/view\?doc=(\d+)|https:\/\/oceanlibrary\.com[^)]*)\)/g)].map((m) => m[1].replace(/\*/g, '') + (m[2] ? '#' + m[2] : '')))].slice(0, 4);
    o.right = new RegExp(exp, 'i').test(o.links.join(' ') + ' ' + o.reply.slice(0, 200));
  } catch (e) { o.err = String(e.message || e); }
  return o;
}
const out = []; const idx = I.map((_, i) => i).filter((i) => !only || only.has(i)); let k = 0;
await Promise.all([0, 1, 2].map(async () => { while (k < idx.length) { const i = idx[k++]; const o = await one(I[i], i); out.push(o); console.error(i, o.kind, o.q.slice(0, 40), o.prov, o.first, o.total, o.right, o.err || ''); } }));
fs.writeFileSync(process.env.OUT || '/private/tmp/claude-501/scr/out.json', JSON.stringify(out.sort((a, b) => a.i - b.i), null, 1));
