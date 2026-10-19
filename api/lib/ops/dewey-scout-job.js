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

export async function deweyScoutJob({ list = 'bahai-library', collections = ['Pilgrims'], religion = null, limit = 20 } = {}, deps = {}) {
  return withAIContext({ caller: 'dewey-scout' }, async () => {
    const works = list === 'bahai-library' ? await bahaiLibraryList(collections) : await (deps.cachedList || cachedList)(list, religion, () => researchedList(list, { religion }));
    // most important first; bahai-library keeps its own order
    if (list !== 'bahai-library') works.sort((a, b) => (b.importance ?? 3) - (a.importance ?? 3));
    const r = await scoutList(works, { limit, deps: { check: checkHoldings, checkFile: identifyAndCheck, appraise: appraiseDocument, archive: archiveFile, ...deps } });
    await logActivity('job', `dewey scout (${list}${religion ? ` · ${religion}` : ''}): ${Object.entries(r.counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'nothing new'}; ${r.remaining} left on the list`).catch(() => {});
    return { list, religion, listed: works.length, ...r };
  });
}
