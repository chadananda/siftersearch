// Conservative series discovery from archive labels. Keep speakers and source
// collections separate; a shared topic alone never establishes a series.
import { fold } from '../../api/lib/media/listing-index.js';

const BOOKS = [
  [/^(?:kitab i )?iqan$/, 'Kitáb-i-Íqán'],
  [/^gleanings$/, 'Gleanings'],
  [/^suriy i haykal(?: surih of (?:the )?temple)?(?: bahaullah)?$/, 'Súriy-i-Haykal'],
  [/^epistle(?: to the son of the wolf)?$/, 'Epistle to the Son of the Wolf'],
  [/^(?:the )?seven valleys$/, 'The Seven Valleys'],
  [/^(?:the )?will and testament of abdul baha$/, 'The Will and Testament of ‘Abdu’l-Bahá'],
];
const roman = (s) => { let n=0, prev=0; for (const c of [...s.toUpperCase()].reverse()) { const v={I:1,V:5,X:10}[c]; n += v < prev ? -v : v; prev=v; } return n; };
const number = (s) => /^\d+$/.test(s) ? Number(s) : roman(s);
const hash = (s) => { let n=2166136261; for(const c of s) n=Math.imul(n^c.charCodeAt(0),16777619); return (n>>>0).toString(36); };

export function seriesLabel(item) {
  let title=String(item.t || '').trim(), part=null;
  // Explicit suffixes: Part 3, (2 of 6), Day 2, or a trailing Roman numeral.
  const match=title.match(/(?:\s*[-–—,:]?\s*\(?\b(?:part|session|lesson|day)\s+(\d{1,3}|[IVX]{1,6})(?:\s+of\s+\d+)?\)?|\s*[-–—,:]?\s*\(?(\d{1,3})\s+of\s+\d+\)?|\s+([IVX]{1,6}))\s*$/i);
  if(match){const value=match[1]||match[2]||match[3];if(!match[3]||/^[IVX]+$/.test(match[3])){part=number(value);title=title.slice(0,match.index).trim();}}
  if(part==null){const m=title.match(/\s*[-–—,:]?\s+(\d{1,3})\s*$/);if(m){part=Number(m[1]);title=title.slice(0,m.index).trim();}}
  title=title.replace(/[\s,;:–—-]+$/,'').trim();
  const f=fold(title), book=BOOKS.find(([pattern])=>pattern.test(f));
  if(book)title=book[1];
  // Some archive titles lost the part number, while their original slug kept it.
  // A numeric collision suffix AFTER the year is deliberately not a part number.
  if(part==null){const m=String(item.s||'').match(/-(?:part-)?(\d{1,3})-(?:19|20)\d{2}$/);if(m)part=Number(m[1]);}
  if(!title || /^\d+(?:\s+\d+)*$/.test(title))return null;
  return {name:title,key:fold(title).replace(/ /g,'-'),part,book:!!book};
}

export function buildSeries(items) {
  const buckets=new Map();
  for(const item of items){
    if(!item.k)continue;
    const label=seriesLabel(item);if(!label)continue;
    const id=`${item.k}:${label.key}:${hash(fold(item.col||''))}`;
    if(!buckets.has(id))buckets.set(id,{id,name:label.name,speakerKey:item.k,book:label.book,items:[]});
    buckets.get(id).items.push({...item,part:label.part});
  }
  return [...buckets.values()].filter(g=>g.items.length>=2 && (g.book || new Set(g.items.map(i=>i.part).filter(n=>n!=null)).size>=2)).map(g=>{
    g.items.sort((a,b)=>(a.part??Infinity)-(b.part??Infinity)||(a.y??Infinity)-(b.y??Infinity)||a.s.localeCompare(b.s));
    const years=g.items.map(i=>i.y).filter(Boolean);
    return {...g,y0:years.length?Math.min(...years):null,y1:years.length?Math.max(...years):null};
  });
}

export function seriesNavigation(items, slug) {
  const group=buildSeries(items).find(g=>g.items.some(i=>i.s===slug));
  if(!group)return null;
  const position=group.items.findIndex(i=>i.s===slug);
  return {...group,position,previous:group.items[position-1]||null,next:group.items[position+1]||null,
    href:`/media?speaker=${encodeURIComponent(group.speakerKey)}&series=${encodeURIComponent(group.id)}`};
}
