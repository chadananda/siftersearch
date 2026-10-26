// Source-backed candidates from the entire biography substrate. The browser's
// book-scoped cast is intentionally narrower and must not gate transcript links.
import {listMediaBiographyPersons} from '../repos/media-biography-repo.js';
import {transcriptBiographyPeople} from './biography-identities.js';
let cached=null,at=0;
export function mediaBiographyCandidates(){
 if(cached&&Date.now()-at<300000)return cached;
 at=Date.now();cached=listMediaBiographyPersons().then(transcriptBiographyPeople).catch(e=>{cached=null;throw e;});
 return cached;
}
