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
    let last = null, tail = '', logged = 0;
    const field = params.field || 'phrases';
    const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n ?? 0));
    const take = (buf) => {
      for (const line of String(buf).split('\n')) {
        if (!line.includes('"phase"')) continue;
        try { last = JSON.parse(line); } catch { continue; }
        // the Observatory's terminal: one progress line per ≥45 s (activity-repo; content-free)
        if (last.phase === 'chunk' && Date.now() - logged > 20000) {
          logged = Date.now();
          import('../repos/activity-repo.js').then(({ logActivity }) => logActivity('index', `${field} · ${fmt(last.paragraphs)} ¶ read · ${fmt(last.embedded)} embedded · ${fmt(last.upserted)} upserted${last.paras_per_hour ? ` · ${fmt(last.paras_per_hour)} ¶/h` : ''}${last.spent?.usd != null ? ` · $${last.spent.usd.toFixed(2)}` : ''}`)).catch(() => {});
        }
      }
      tail = (tail + buf).slice(-2000);
    };
    child.stdout.on('data', take); child.stderr.on('data', take);
    child.on('exit', (code) => (code === 0 ? resolve({ code, last }) : reject(new Error(`indexer exit ${code}: ${(tail.match(/^.*Error: .*$/m)?.[0] || '').slice(0, 400)} … ${tail.slice(-300)}`))));
  });
}
