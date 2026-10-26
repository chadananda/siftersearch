<script>
  import { hash, portraitSquare, tallSrc } from '../../../lib/media-listing.js';
  let { series, speaker, width = 160 } = $props();
  const code = $derived(hash(series.id));
  const motif = $derived(code % 4);
  const palette = ['1940', '1960', '1980', '2000', '2020'];
  const tint = $derived(`var(--era-${palette[Math.floor(code / 4) % palette.length]})`);
  const portrait = $derived(portraitSquare(tallSrc(speaker), width));
  const uid = $derived(`cover-${code}`);
</script>

<!-- A new piece of cover artwork per series: cloth binding, an engraved portrait
     medallion and one of four illustrations. The speaker's verified likeness stays intact. -->
<svg viewBox="0 0 160 200" role="img" aria-label={`${series.name} — illustrated series cover with ${speaker.n}`} style={`--cover-tint:${tint}`}>
  <defs>
    <clipPath id={`${uid}-portrait`}><circle cx="86" cy="82" r="43" /></clipPath>
    <pattern id={`${uid}-cloth`} width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 0h5M0 0v5" class="cloth" fill="none" /></pattern>
  </defs>
  <rect x="1" y="1" width="158" height="198" rx="5" class="ground" />
  <rect x="1" y="1" width="158" height="198" rx="5" fill={`url(#${uid}-cloth)`} />
  <path d="M13 2v196M18 2v196" class="binding" fill="none" />
  <rect x="25" y="10" width="124" height="180" rx="2" class="frame" fill="none" />
  {#if motif === 0}
    <!-- An open book, with rays rising behind the portrait. -->
    {#each Array.from({length:13},(_,i)=>i) as i}<path d="M86 82V17" transform={`rotate(${i*27.7} 86 82)`} class="rays" />{/each}
    <path d="M39 148q22-12 47 0q24-12 47 0v25q-23-12-47 0q-25-12-47 0zM86 148v25" class="illustration" fill="none" />
  {:else if motif === 1}
    <!-- Interwoven paths, for a visibly different cover composition. -->
    {#each [0,1,2,3,4] as i}<path d={`M30 ${143+i*7}q28-30 56 0t56 0`} class="illustration" fill="none" />{/each}
    <path d="M37 31l10-10m78 0l10 10M37 121l10 10m78 0l10-10" class="illustration" fill="none" />
  {:else if motif === 2}
    <!-- A constellation and a compass rose. -->
    <path d="M86 133l7 17 21 6-21 6-7 17-7-17-21-6 21-6zM33 30l12 7 10-13m65 0l10 13 12-7" class="illustration" fill="none" />
    {#each [37,58,113,135] as x}<circle cx={x} cy={x%2 ? 139 : 177} r="1.5" class="star" />{/each}
  {:else}
    <!-- An arched doorway over a stepped, geometric garden. -->
    <path d="M35 121V74a51 51 0 0 1 102 0v47M41 141h90v36H41zM52 150h68v18H52zM63 159h46" class="illustration" fill="none" />
  {/if}
  <circle cx="86" cy="82" r="48" class="medallion" />
  {#if portrait}
    <image href={portrait.src} x="43" y="39" width="86" height="86" preserveAspectRatio="xMidYMid slice" clip-path={`url(#${uid}-portrait)`} class="likeness" />
  {:else}
    <text x="86" y="92" text-anchor="middle" class="initials">{speaker.n.split(/\s+/).map(n=>n[0]).slice(0,2).join('')}</text>
  {/if}
  <circle cx="86" cy="82" r="45" class="frame" fill="none" />
  <text x="86" y="186" text-anchor="middle" class="stamp">{series.name.split(/\s+/).filter(w=>w.length>2).map(w=>w[0]).slice(0,5).join(' · ')}</text>
</svg>

<style>
  svg { display: block; width: 100%; height: 100%; }
  .ground { fill: color-mix(in srgb, var(--cover-tint) 32%, var(--radio-walnut-deep)); }
  .cloth { stroke: var(--radio-on-dark); stroke-opacity: 0.09; stroke-width: 0.5; }
  .binding { stroke: var(--cover-tint); stroke-width: 2; }
  .frame { stroke: var(--radio-brass-bright); stroke-width: 0.7; }
  .illustration { stroke: var(--cover-tint); stroke-width: 1.7; }
  .rays { stroke: var(--cover-tint); stroke-width: 0.7; opacity: 0.55; }
  .star { fill: var(--radio-brass-bright); }
  .medallion { fill: var(--radio-paper); }
  .likeness { filter: grayscale(1) contrast(1.15); }
  .stamp { font-family: var(--font-dial); font-size: 7px; font-weight: 700; letter-spacing: 1px; fill: var(--radio-brass-bright); }
  .initials { font-family: var(--font-marquee); font-size: 26px; fill: var(--radio-ink); }
</style>
