// dewey-scout ops job — Dewey's scouts (planning/dewey-scouts-plan.md): a list of works (bahai-library collections, or a
// researched list: core-books for a tradition, bahai-publications, bahai-pilgrim-notes) → for each work not handled
// before: held? → every channel searched → offered (a copy found and checked) | lead | to-buy. `limit` works a run; the
// next run continues where this one stopped. params { list, collections?, religion?, limit? }.
import { scoutList } from '../dewey/scout/scout.js';
import { bahaiLibraryList, researchedList } from '../dewey/scout/lists.js';
import { checkHoldings, identifyAndCheck } from '../dewey/holdings.js';
import { appraiseDocument } from '../dewey/appraise.js';
import { archiveFile } from '../dewey/intake.js';
import { logActivity } from '../repos/activity-repo.js';
import { withAIContext } from '../ai-context.js';
import { deweyDir } from '../dewey/research.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// a researched list costs a research run: kept 30 days, then researched again (new scholarship, a better list)
async function cachedList(list, religion, make) {
  const f = join(deweyDir(), 'scout-lists', `${list}${religion ? `-${religion.replace(/[^\w]+/g, '_')}` : ''}.json`);
  const c = await readFile(f, 'utf8').then(JSON.parse).catch(() => null);
  if (c && Date.now() - c.at < 30 * 86400000) return c.works;
  const works = await make();
  if (works.length) { await mkdir(join(deweyDir(), 'scout-lists'), { recursive: true }); await writeFile(f, JSON.stringify({ at: Date.now(), works }, null, 1)); }
  return works;
}

/** May the pulse add this find itself? important, not held, in scope, recommended — and today's cap not reached. Pure. */
export function autoAddRule({ cap = 15, addedToday = 0 } = {}) {
  let n = addedToday;
  return (work, a, doc) => {
    const ok = n < cap && (work.importance ?? 0) >= 4 && doc?.result?.verdict === 'not-held' && a?.in_scope !== 'no' && a?.in_scope !== 'maybe'
      && ['add', 'add if cheap'].includes(String(a?.recommendation || '').toLowerCase());
    if (ok) n++;
    return ok;
  };
}

export async function deweyScoutJob({ list = 'bahai-library', collections = ['Pilgrims'], religion = null, limit = 20, autoAdd = false, cap = 15, addedToday = 0, retry = null } = {}, deps = {}) {
  // RE-SCOUT (10-19: broken channels sent The Rule of Saint Benedict to "buy" after "7 places searched"): works left as
  // to-buy / lead are searched again with today's channels; the old item is closed, a new outcome replaces it
  if (retry?.length) {
    const { listItems, updateItem } = await import('../repos/dewey-repo.js');
    const old = (await listItems({ limit: 5000 })).filter((i) => i.created_by === 'dewey-scout' && retry.includes(i.state));
    const works = [];
    for (const i of old.slice(0, limit)) {   // only those searched again this run are closed
      const sc = i.identified?.scout || {};
      works.push({ title: sc.sought || i.title, author: sc.author || i.author, kind: i.kind, why: sc.why, importance: sc.importance ?? 3, list: sc.list, page: sc.page || null });
      await updateItem(i.id, { state: 'declined' }, 'scouted again with the improved channels — see the newer item');
    }
    const r = await scoutList(works, { limit, deps: { check: checkHoldings, checkFile: identifyAndCheck, appraise: appraiseDocument, archive: archiveFile, items: async () => [], ...deps } });
    return { retry, listed: works.length, ...r };
  }
  if (autoAdd && !deps.items) {   // today's pulse additions so far (the cap is per day, across the day's runs)
    const { listItems } = await import('../repos/dewey-repo.js');
    const day = new Date().toISOString().slice(0, 10);
    addedToday = (await listItems({ limit: 5000 })).filter((i) => (i.log || []).some((l) => String(l.at || '').startsWith(day) && /added by the daily pulse/.test(l.why || ''))).length;
  }
  return withAIContext({ caller: 'dewey-scout' }, async () => {
    const works = list === 'bahai-library' ? await bahaiLibraryList(collections) : await (deps.cachedList || cachedList)(list, religion, () => researchedList(list, { religion }));
    // most important first; bahai-library keeps its own order
    if (list !== 'bahai-library') works.sort((a, b) => (b.importance ?? 3) - (a.importance ?? 3));
    const r = await scoutList(works, { limit, deps: { check: checkHoldings, checkFile: identifyAndCheck, appraise: appraiseDocument, archive: archiveFile, autoAdd: autoAdd ? autoAddRule({ cap, addedToday }) : null, ...deps } });
    await logActivity('job', `dewey scout (${list}${religion ? ` · ${religion}` : ''}): ${Object.entries(r.counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'nothing new'}; ${r.remaining} left on the list`).catch(() => {});
    return { list, religion, listed: works.length, ...r };
  });
}

// THE DAILY PULSE (Chad 10-18: "a daily pulse of research looking for the most important books we do not yet have in each
// tradition, finding their sources, prioritizing and then adding to the library, the most important first"): once a day,
// the next stretch of bahai-library (pilgrim notes first, collection by collection), the important Bahá'í publications, and
// the core works of the next tradition in rotation — the most important additions made automatically (≤ 15 a day).
export const BAHAI_LIBRARY_ORDER = ['Pilgrims', 'Books', 'Histories', 'Biographies', 'Theses', 'Talks', 'Letters', 'Articles'];
export const TRADITIONS = ['Christian', 'Islam', 'Judaism', 'Buddhist', 'Hindu', 'Sikh', 'Tao', 'Confucian', 'Zoroastrian', 'Jain'];

/** state { day, bahai: index, tradition: index, lastBahaiRun } + the previous bahai-library run's result → today's runs + new state. Pure. */
export function pulsePlan(state = {}, { today, lastBahaiResult = null } = {}) {
  if (state.day === today) return { runs: [], state };
  let bahai = state.bahai ?? 0;
  if (lastBahaiResult && lastBahaiResult.remaining === 0) bahai = Math.min(bahai + 1, BAHAI_LIBRARY_ORDER.length - 1);
  const tradition = state.day ? ((state.tradition ?? -1) + 1) % TRADITIONS.length : 0;
  const common = { autoAdd: true, cap: 15 };
  return {
    runs: [
      { list: 'bahai-library', collections: [BAHAI_LIBRARY_ORDER[bahai]], limit: 25, ...common },
      { list: 'bahai-publications', limit: 15, ...common },
      { list: 'core-books', religion: TRADITIONS[tradition], limit: 15, ...common },
    ],
    state: { day: today, bahai, tradition },
  };
}
