import { buildSeries, seriesHref } from './media-series.js';
export const speakerPath = key => `/media/speakers/${encodeURIComponent(key)}`;
export const seriesPath = seriesHref;
export function resolveCollection(data, kind, key) {
  const groups=buildSeries(data.items||[]);
  const group=kind==='series'?groups.find(g=>typeof key==='object'?g.speakerKey===key.speaker && g.slug===key.slug:g.id.replaceAll(':','--')===key || g.id===key):null;
  const speakerKey=group?.speakerKey||(kind==='speaker'?key:null);
  const speaker=(data.speakers||[]).find(s=>s.k===speakerKey);
  if(!speaker || (kind==='series'&&!group))return null;
  const items=group?.items || (data.items||[]).filter(i=>i.k===speakerKey).sort((a,b)=>(b.y||0)-(a.y||0)||a.t.localeCompare(b.t,undefined,{numeric:true}));
  return {speaker,group,items,groups:groups.filter(g=>g.speakerKey===speakerKey),name:group?.name||speaker.n,
    path:group?seriesPath(group):speakerPath(speakerKey)};
}
