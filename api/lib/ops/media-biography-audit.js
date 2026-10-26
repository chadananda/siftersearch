import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function mediaBiographyAudit({ terms = [], ids = [] } = {}, deps = {}) {
 const store=deps.store||await import('../repos/media-biography-repo.js');
 const repo=deps.repo||await import('../repos/media-repo.js');
 const people=await store.biographyNameAudit(terms), recordings=[];
 for(const id of ids.slice(0,10)){
  const row=await repo.getMediaItem(Number(id));if(!row?.dir)continue;
  const links=JSON.parse(await readFile(join(row.dir,'links.json'),'utf8').catch(()=>'{}'));
  recordings.push({id:row.id,slug:row.slug,links:(links.links||[]).filter(x=>x.kind==='person'),unresolved:(links.unresolved||[]).filter(x=>x.kind==='person')});
 }
 return {people,recordings};
}
