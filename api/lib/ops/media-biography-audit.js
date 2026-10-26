import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function mediaBiographyAudit({ terms = [], ids = [], preview = false } = {}, deps = {}) {
 const store=deps.store||await import('../repos/media-biography-repo.js');
 const repo=deps.repo||await import('../repos/media-repo.js');
 const people=await store.biographyNameAudit(terms), recordings=[];
 for(const id of ids.slice(0,10)){
  const row=await repo.getMediaItem(Number(id));if(!row?.dir)continue;
  const links=JSON.parse(await readFile(join(row.dir,'links.json'),'utf8').catch(()=>'{}'));
  const recording={id:row.id,slug:row.slug,links:(links.links||[]).filter(x=>x.kind==='person'),unresolved:(links.unresolved||[]).filter(x=>x.kind==='person')};
  if(preview){
   const [{listBioPersons},{mediaBiographyCandidates},{linkMentions}]=await Promise.all([import('../bio.js'),import('../media/biography-candidates.js'),import('../media/links.js')]);
   const work=JSON.parse(await readFile(join(row.dir,'transcript.work.json'),'utf8'));
   const meta=JSON.parse(await readFile(join(row.dir,'meta.json'),'utf8'));
   recording.preview=await linkMentions((work.mentions||[]).filter(x=>x.kind==='person'),meta.headings||[],{bio:(await listBioPersons()).persons,additionalBio:await mediaBiographyCandidates()});
  }
  recordings.push(recording);
 }
 return {people,recordings};
}
