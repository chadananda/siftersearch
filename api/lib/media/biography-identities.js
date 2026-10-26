// Transcript link destinations, not graph merges. Only individually verified
// identities belong here; an equal name alone never makes two records equivalent.
// Audit: media-biography-audit #30897, 2026-10-26.
export const BIOGRAPHY_IDENTITIES = [
 {id:1287389,name:'Leroy Ioas',aliases:[],evidence:'Hand of the Cause, docs 426/513; source-backed preferred biography for the full name, not a merger of namesake records.'},
 {id:1302398,name:'Agnes Alexander',aliases:[],evidence:'Source-backed primary biography, media-biography-audit #30939.'},
 {id:1263765,name:'David Hofman',aliases:['David Hoffman'],equivalent:[1303022,1306157],
  evidence:'1263765 and 1303022 name the author of A Commentary on the Will and Testament (docs 527/3789); 1306157 names his A Life of George Townshend (doc 432).'},
 {id:1261686,name:'Marion Hofman',aliases:['Marian Hofman','Marion Hoffman','Marian Hoffman','Marion Holley','Marian Holley','Marion Holley Hoffman'],
  evidence:'Chad explicitly identified Holley/Hoffman as the same woman; canonical record has source evidence in docs 465/513.'},
 {id:1251371,name:'Mrs. Amelia Collins',aliases:['Amelia Collins'],equivalent:[1300673],
  evidence:'Both records identify Amelia Collins as a Hand of the Cause in docs 426/513.'},
];
const aliasesOf=p=>{try{const a=typeof p.aliases==='string'?JSON.parse(p.aliases):p.aliases;return Array.isArray(a)?a:[];}catch{return [];}};
export function transcriptBiographyPeople(rows,identities=BIOGRAPHY_IDENTITIES){
 const people=new Map(rows.map(p=>[p.id,{...p,aliases:aliasesOf(p)}]));
 for(const d of identities){
  const p=people.get(d.id);if(!p||p.name!==d.name)continue;
  p.aliases=[...new Set([...p.aliases,...d.aliases])];
  p.preferred_names=[d.name,...d.aliases];
  for(const id of d.equivalent||[])people.delete(id);
 }
 // A collective artifact classified as person is not an individual's biography.
 return [...people.values()].filter(p=>! /\b(?:and|family|committee|assembly|members|people)\b/i.test(p.name));
}
