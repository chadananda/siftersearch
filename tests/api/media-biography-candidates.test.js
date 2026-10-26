import {it,expect} from 'vitest';
import {linkMentions} from '../../api/lib/media/links.js';
import {transcriptBiographyPeople} from '../../api/lib/media/biography-identities.js';
const mention=(text,confidence=.9)=>({text,canonical:text,kind:'person',confidence,para:1,i0:0,i1:2});
it('links source-backed later figures absent from the book-scoped biography browser',async()=>{
 const additionalBio=transcriptBiographyPeople([
  {id:1263765,name:'David Hofman'},{id:1303022,name:'David Hofman'},{id:1306157,name:'David Hofman'},
  {id:1261686,name:'Marion Hofman'},{id:1287389,name:'Leroy Ioas'}, {id:1309690,name:'Leroy Ioas'}, {id:1309740,name:'Leroy Ioas'}, {id:1305710,name:'Leroy Ioas'},
  {id:1251371,name:'Mrs. Amelia Collins'},{id:1300673,name:'Amelia Collins, Hand of the Cause'},{id:1311507,name:'Amelia Collins'},
  {id:1309849,name:'Amelia Bowman'},{id:1306943,name:'Charlotte Linfoot'},
 ]);
 const cases=[['David Hoffman',.7,1263765],['David Hofman',.9,1263765],['Marian Holley',.8,1261686],['Leroy Ioas',.9,1287389],['Amelia Collins',.9,1251371],['Amelia Bowman',.4,1309849],['Charlotte Linfoot',.9,1306943]];
 for(const [name,confidence,id] of cases){
  const r=await linkMentions([mention(name,confidence)],[],{bio:[],additionalBio,personUrl:async n=>'/biography/person-'+n});
  expect(r.links,name).toMatchObject([{entity_id:id,url:'/biography/person-'+id}]);expect(r.unresolved).toEqual([]);
 }
});
it('keeps unknown and ambiguous names unresolved and preserves established core links',async()=>{
 const bio=[{id:1,name:'Shoghi Effendi',aliases:['the Guardian']}];
 const additionalBio=[{id:2,name:'Shoghi Effendi'},{id:3,name:'John Smith'},{id:4,name:'John Smith'},{id:5,name:'Laura Barney'}];
 for(const text of ['John Smith','Leroy Ioas'])expect((await linkMentions([mention(text)],[],{bio,additionalBio})).links).toEqual([]);
 expect((await linkMentions([mention('the Guardian')],[],{bio,additionalBio})).links[0].entity_id).toBe(1);
 expect((await linkMentions([mention('Smith',.4)],[],{bio,additionalBio})).links).toEqual([]);
});
it('does not apply a curated identity when its expected canonical record is absent or changed',()=>{
 expect(transcriptBiographyPeople([{id:1263765,name:'A different David'},{id:1303022,name:'David Hofman'}])).toHaveLength(2);
});
