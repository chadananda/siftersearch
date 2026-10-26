import {describe,it,expect} from 'vitest';
import {buildSeries,seriesLabel,seriesNavigation} from '../../src/lib/media-series.js';
import {planLayout} from '../../src/lib/media-listing.js';
const talk=(t,s,extra={})=>({t,s,k:'hooper-dunbar',sp:'Hooper Dunbar',col:'Archive',y:1989,d:1200,hl:[10,30],v:1,...extra});

describe('recording series box sets',()=>{
 it('unifies archive book aliases and recovers lost part numbers from original slugs',()=>{
  const rows=[talk('Íqán (part 10)','dunbar-iqan-part-10-1989'),talk('Kitáb-i-Íqán','dunbar-kitab-i-iqan-3-1989'),talk('Iqan, Part 2','dunbar-iqan-part-2-1989')];
  const [g]=buildSeries(rows);expect(g.name).toBe('Kitáb-i-Íqán');expect(g.items.map(i=>i.part)).toEqual([2,3,10]);
 });
 it('keeps different speakers and source collections separate',()=>{
  const rows=[talk('Study Part 1','a'),talk('Study Part 2','b'),talk('Study Part 3','c',{k:'another'}),talk('Study Part 4','d',{col:'Other course'})];
  const groups=buildSeries(rows);expect(groups).toHaveLength(1);expect(groups[0].items.map(i=>i.s)).toEqual(['a','b']);
 });
 it('does not group unrelated titles or repeated standalone recordings',()=>{
  expect(buildSeries([talk('The Covenant','a'),talk('The Covenant','b'),talk('Introduction Part 1','c'),talk('Different Subject Part 2','d')])).toEqual([]);
  expect(seriesLabel(talk('5 01','x'))).toBeNull();
  expect(seriesLabel(talk('A talk','a-talk-1993-6')).part).toBeNull();
 });
 it('sorts Roman numerals and x-of-y parts numerically',()=>{
  const groups=buildSeries([talk('Life of the Báb III','c'),talk('Life of the Báb I','a'),talk('Life of the Báb (2 of 3)','b')]);
  expect(groups[0].items.map(i=>i.part)).toEqual([1,2,3]);
 });
 it('unifies the spelling variants within the Haykal series',()=>{
  expect(buildSeries([talk("Súriy-i-Haykal (Súrih of the Temple) - Bahá'u'lláh - Part 2",'b'),talk("Súriy-i-Haykal (Surih of Temple) - Bahá'u'lláh - Part 1",'a')])[0].items.map(i=>i.part)).toEqual([1,2]);
 });
 it('retains every installment beyond the old twelve-spine cap and preserves playback',()=>{
  const rows=Array.from({length:24},(_,i)=>talk(`Reading the Writings of Shoghi Effendi - Part ${24-i}`,`reading-${24-i}`));
  const cards=planLayout(rows);expect(cards).toHaveLength(1);expect(cards[0].series.name).toBe('Reading the Writings of Shoghi Effendi');expect(cards[0].talks).toHaveLength(24);expect(cards[0].talks[0]).toMatchObject({s:'reading-1',part:1,hl:[10,30],v:1});
 });
 it('creates a box per series and leaves independent talks available',()=>{
  const rows=[talk('Gleanings Part 1','g1'),talk('Gleanings Part 2','g2'),talk('Seven Valleys Part 1','v1'),talk('Seven Valleys Part 2','v2'),talk('An independent talk','other')];
  const cards=planLayout(rows);expect(cards.filter(c=>c.series).map(c=>c.series.name)).toEqual(['Gleanings','The Seven Valleys']);expect(cards.some(c=>c.it?.s==='other')).toBe(true);
  expect(cards.flatMap(c=>c.talks||[]).map(t=>t.s)).toEqual(['g1','g2','v1','v2']);
 });
});

describe('talk-page series navigation',()=>{
 const rows=[talk('Gleanings Part 10','g10'),talk('Gleanings Part 2','g2'),talk('Gleanings Part 1','g1'),talk('Unrelated talk','other')];
 it('links to adjacent available installments and every recording in the same set',()=>{
  const nav=seriesNavigation(rows,'g2');expect(nav.previous.s).toBe('g1');expect(nav.next.s).toBe('g10');expect(nav.position).toBe(1);expect(nav.items.map(i=>i.s)).toEqual(['g1','g2','g10']);expect(nav.href).toContain('speaker=hooper-dunbar&series=');
 });
 it('does not wrap the course endpoints or invent sets for standalone talks',()=>{
  expect(seriesNavigation(rows,'g1').previous).toBeNull();expect(seriesNavigation(rows,'g10').next).toBeNull();expect(seriesNavigation(rows,'other')).toBeNull();
 });
});
