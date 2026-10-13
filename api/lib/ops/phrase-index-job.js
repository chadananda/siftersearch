// Ops job: run the phrase indexer (scripts/phrase-index/indexer.mjs) as a child of the ops worker. The worker runs ONE job
// at a time, so two indexers can never share the vector store again (10-11: a second indexer + a coverage scan locked
// /tank/…/vectors.db and killed the first one mid-run). params: { docs?: ids[], scope?, maxUsd, budgetKey, field?, store?, collection? }
// — maxUsd required; field 'hype' | 'concepts' indexes those units into their own store + collection (see the indexer header).
import { spawn } from 'child_process';

const FIELD_TARGET = { hype: ['/tank/sifter/hype-vectors/vectors.db', 'hype'], concepts: ['/tank/sifter/concept-vectors/vectors.db', 'concepts'] };
export function indexerArgs({ docs = null, scope = null, maxUsd, budgetKey = 'ops-phrase-index', field = null } = {}) {
  if (!(maxUsd > 0)) throw new Error('phrase-index: maxUsd is required (spend cap)');
  if (field && !FIELD_TARGET[field]) throw new Error(`phrase-index: unknown field '${field}' (hype | concepts)`);
  const [store, collection] = FIELD_TARGET[field] || [];
  return ['scripts/phrase-index/indexer.mjs', ...(docs?.length ? ['--docs', docs.join(',')] : scope ? ['--scope', scope] : []),
    ...(field ? ['--field', field, '--store', store, '--collection', collection] : []),
    '--embed', '--qdrant', '--max-usd', String(maxUsd), '--budget-key', budgetKey];
}

export function phraseIndexJob(params = {}) {
  const args = indexerArgs(params);
  return new Promise((resolve, reject) => {
    const child = spawn('nice', ['-n', '10', process.execPath, ...args], { cwd: process.cwd(), env: process.env });
    let last = null, tail = '';
    const take = (buf) => {
      for (const line of String(buf).split('\n')) { if (line.includes('"phase"')) { try { last = JSON.parse(line); } catch { /* partial */ } } }
      tail = (tail + buf).slice(-2000);
    };
    child.stdout.on('data', take); child.stderr.on('data', take);
    child.on('exit', (code) => (code === 0 ? resolve({ code, last }) : reject(new Error(`indexer exit ${code}: ${tail.slice(-400)}`))));
  });
}
