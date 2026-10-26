import {it,expect} from 'vitest';
import {mediaPersonReviewJob} from '../../api/lib/ops/media-person-review.js';
it('includes unpublished ambiguous labels, recording evidence and separate person profiles without writing',async()=>{
 const rows=[{id:1,speaker:'Dunbar',title:'A talk',state:'done',source_kind:'file',source_ref:'/tank/media/collection-08/a.mp3'},
 {id:2,speaker:'Khadem',title:'Untitled',state:'queued',source_kind:'file'}];
 const data={people:[{key:'hooper-dunbar',name:'Hooper Dunbar',confirmed:['Dunbar']},{key:'riaz-khadem',name:'Riaz Khadem'},{key:'zikrullah-khadem',name:'Zikrullah Khadem'}]};
 const r=await mediaPersonReviewJob({}, {data,repo:{rankRows:async()=>rows,listSpeakers:async()=>[{key:'dunbar',name:'Dunbar'}],mediaIndexRows:async()=>[{id:1,slug:'a-talk'}]}});
 expect(r.items_scanned).toBe(2);expect(r.forms.find(f=>f.label==='Dunbar').resolutions['hooper-dunbar'].count).toBe(1);
 const unresolved=r.forms.find(f=>f.label==='Khadem');expect(unresolved.unresolved[0]).toMatchObject({id:2,state:'queued',candidates:['riaz-khadem','zikrullah-khadem']});
 expect(r.forms.find(f=>f.label==='Dunbar').examples[0]).toMatchObject({slug:'a-talk',source:'collection-08/a.mp3'});
});
