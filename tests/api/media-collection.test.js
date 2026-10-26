import {describe,it,expect} from 'vitest';
import {resolveCollection,seriesPath,speakerPath} from '../../src/lib/media-collection.js';
import {seriesNavigation} from '../../src/lib/media-series.js';
const items=[{s:'part-2',t:'Study Part 2',k:'dunbar',sp:'Hooper Dunbar',col:'Archive',y:1990}, {s:'part-1',t:'Study Part 1',k:'dunbar',sp:'Hooper Dunbar',col:'Archive',y:1990}, {s:'solo',t:'Another talk',k:'dunbar',y:2000}, {s:'other',t:'Study Part 1',k:'other',col:'Archive'}];
const data={items,speakers:[{k:'dunbar',n:'Hooper Dunbar'},{k:'other',n:'Other speaker'}]};
describe('dedicated media collection pages',()=>{
 it('shows every recording and series belonging to an author, without other voices',()=>{
  const c=resolveCollection(data,'speaker','dunbar');expect(c.items.map(i=>i.s)).toEqual(['solo','part-1','part-2']);expect(c.groups).toHaveLength(1);expect(c.path).toBe('/media/speakers/dunbar');
 });
 it('resolves a box-set URL to all its installments in order',()=>{
  const author=resolveCollection(data,'speaker','dunbar'),g=author.groups[0],path=seriesPath(g);
  const c=resolveCollection(data,'series',{speaker:'dunbar',slug:decodeURIComponent(path.split('/').pop())});expect(c.items.map(i=>i.s)).toEqual(['part-1','part-2']);expect(c.speaker.n).toBe('Hooper Dunbar');expect(path).toBe('/media/sets/dunbar/study');expect(seriesNavigation(items,'part-2').href).toBe(path);
 });
 it('distinguishes separate courses with readable dates instead of opaque IDs',()=>{
  const more={...data,items:[...items,...items.slice(0,2).map(i=>({...i,s:i.s+'-new',col:'Later course',y:2020}))]};
  expect(resolveCollection(more,'speaker','dunbar').groups.map(seriesPath)).toEqual(['/media/sets/dunbar/study-1990','/media/sets/dunbar/study-2020']);
 });
 it('returns not-found for unknown authors and sets and safely encodes links',()=>{
  expect(resolveCollection(data,'speaker','missing')).toBeNull();expect(resolveCollection(data,'series','missing')).toBeNull();expect(speakerPath('a/b')).toBe('/media/speakers/a%2Fb');
 });
});
