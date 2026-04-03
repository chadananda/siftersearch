<script>
  /**
   * ReligionIcon Component
   * SVG icons for each religion tradition. Sources:
   *   MDI (Apache 2.0): Buddhist, Hindu, Islam, Judaism, Sikh, Tao
   *   Custom: Baha'i, Christian, Confucian, Jain, Zoroastrian
   */
  let { religion = '', size = 'md', class: cls = '' } = $props();

  const sizeMap = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-9 h-9', xl: 'w-16 h-16' };
  const sizeClass = $derived(cls ? '' : (sizeMap[size] ?? sizeMap.md));

  const key = $derived(
    (religion || '').toLowerCase()
      .replace(/[''`']/g, '')
      .replace(/\s+/g, '')
  );

  const isBahai      = $derived(key.includes('baha'));
  const isBuddhist   = $derived(key === 'buddhist' || key === 'buddhism');
  const isChristian  = $derived(key === 'christian' || key === 'christianity');
  const isConfucian  = $derived(key === 'confucian' || key === 'confucianism');
  const isHindu      = $derived(key === 'hindu' || key === 'hinduism');
  const isIslam      = $derived(key === 'islam' || key === 'islamic' || key === 'muslim');
  const isJain       = $derived(key === 'jain' || key === 'jainism');
  const isJudaism    = $derived(key === 'judaism' || key === 'jewish');
  const isTao        = $derived(key === 'tao' || key === 'taoism' || key === 'taoist');
  const isSikh       = $derived(key === 'sikh' || key === 'sikhism');
  const isZoroastrian = $derived(key === 'zoroastrian' || key === 'zoroastrianism');
</script>

<!-- Baha'i: nine-pointed star (custom) -->
{#if isBahai}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="1.699 1.631 19.772 19.847" class="{sizeClass} {cls}" aria-label="Baha'i" role="img">
    <path d="M11.5,3.48029005 L9.86707145,6.23402656 C9.74619801,6.437865 9.49883302,6.52885196 9.27468556,6.45192074 L6.25338496,5.414959 L6.76953271,8.59284101 C6.80718408,8.8246576 6.67842221,9.05143482 6.4600597,9.13788926 L3.4533676,10.3283036 L5.8859769,12.4198707 C6.06475776,12.5735871 6.11185819,12.8313093 5.99900337,13.0383241 L4.42725354,15.9214579 L7.62386698,15.9270008 C7.86471473,15.9274184 8.07103871,16.0994803 8.1147113,16.3363358 L8.70947825,19.5620159 L11.1773193,17.4770613 C11.3636425,17.3196462 11.6363575,17.3196462 11.8226807,17.4770613 L14.2905217,19.5620159 L14.8852887,16.3363358 C14.9289613,16.0994803 15.1352853,15.9274184 15.376133,15.9270008 L18.5727465,15.9214579 L17.0009966,13.0383241 C16.8881418,12.8313093 16.9352422,12.5735871 17.1140231,12.4198707 L19.5466324,10.3283036 L16.5399403,9.13788926 C16.3215778,9.05143482 16.1928159,8.8246576 16.2304673,8.59284101 L16.746615,5.414959 L13.7253144,6.45192074 C13.501167,6.52885196 13.253802,6.437865 13.1329285,6.23402656 L11.5,3.48029005 Z M9.21446299,5.3739917 L11.0699285,2.24497344 C11.2636165,1.91834219 11.7363835,1.91834219 11.9300715,2.24497344 L13.785537,5.3739917 L17.2116856,4.19807926 C17.5690519,4.07542508 17.9281055,4.37821709 17.8675327,4.75115899 L17.2820118,8.35616644 L20.6840597,9.70311074 C21.0337251,9.84155081 21.1111381,10.3019466 20.8259769,10.5471293 L18.0724866,12.9145911 L19.8530034,16.1806759 C20.0344569,16.5135245 19.7939622,16.9193419 19.414867,16.9199992 L15.7933689,16.9262788 L15.1177113,20.5906642 C15.0480968,20.9682142 14.5965827,21.1297021 14.3033193,20.8819387 L11.5,18.5135554 L8.69668074,20.8819387 C8.40341733,21.1297021 7.95190324,20.9682142 7.8822887,20.5906642 L7.20663109,16.9262788 L3.58513302,16.9199992 C3.2060378,16.9193419 2.96554309,16.5135245 3.14699663,16.1806759 L4.92751342,12.9145911 L2.1740231,10.5471293 C1.88886186,10.3019466 1.96627494,9.84155081 2.3159403,9.70311074 L5.71798824,8.35616644 L5.13246729,4.75115899 C5.07189452,4.37821709 5.43094815,4.07542508 5.78831444,4.19807926 L9.21446299,5.3739917 Z" fill="currentColor"/>
  </svg>

<!-- Buddhist: dharma wheel (MDI) -->
{:else if isBuddhist}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Buddhist" role="img" fill="currentColor">
    <path d="M11,2V3C9.27,3.2 7.69,3.9 6.4,4.94L5.64,4.18L4.22,5.6L5,6.35C3.9,7.68 3.21,9.3 3,11H2V13H3C3.21,14.68 3.9,16.26 5,17.56L4.22,18.32L5.64,19.74L6.39,19C7.71,20.07 9.3,20.77 11,21V22H13V21C14.69,20.77 16.29,20.07 17.6,19L18.36,19.74L19.78,18.32L19,17.57C20.1,16.27 20.79,14.68 21,13H22V11H21C20.79,9.3 20.1,7.69 19,6.36L19.78,5.6L18.36,4.18L17.61,4.94C16.29,3.87 14.69,3.2 13,3V2H11M11,5V8L10,8.5L7.81,6.35C8.72,5.67 9.81,5.17 11,5M13,5C14.16,5.18 15.26,5.64 16.2,6.35L14,8.5L13,8V5M6.4,7.76L8.5,10L8,11H5C5.16,9.84 5.7,8.7 6.39,7.75L6.4,7.76M17.6,7.76C18.33,8.71 18.81,9.82 19,11H16L15.5,10L17.61,7.76H17.6M12,10C13.12,10 14,10.88 14,12C14,13.12 13.12,14 12,14C10.88,14 10,13.12 10,12C10,10.88 10.88,10 12,10M5,13H8L8.57,14L6.39,16.15C5.67,15.24 5.19,14.16 5,13V13M16,13H19C18.81,14.15 18.33,15.24 17.61,16.16L15.5,14L16,13M10,15.5L11,16V19C9.83,18.8 8.73,18.31 7.8,17.57L10,15.5M14,15.5L16.19,17.57C15.28,18.25 14.19,18.83 13,19V16L14,15.5Z"/>
  </svg>

<!-- Christian: latin cross (custom) -->
{:else if isChristian}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Christian" role="img" fill="currentColor">
    <path d="M11 2h2v7h7v2h-7v11h-2V11H4V9h7V2z"/>
  </svg>

<!-- Confucian: scholar with cap (custom) -->
{:else if isConfucian}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Confucian" role="img" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <circle cx="12" cy="6" r="2.5"/>
    <path d="M6.5 5.5h11M12 3v2.5"/>
    <line x1="17" y1="5.5" x2="17" y2="8"/>
    <path d="M8 10.5c0 0 1-1.5 4-1.5s4 1.5 4 1.5V21H8V10.5z"/>
    <path d="M12 9v4"/>
  </svg>

<!-- Hindu: Om (MDI) -->
{:else if isHindu}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Hindu" role="img" fill="currentColor">
    <path d="M15,2L13.5,3.5L15,5L16.5,3.5L15,2M11,3C10,9 17,10 20,6L18,4.5C17,6 13,8 11,3M9,7C7,7 4.5,8.5 4.5,8.5L6,11C7,10 9,9.5 10,10C12,11 9,13 7,12V15.5C10,14 12,16 11,17.5C8,22 3,16 3,13C1,19 6,22 9,22C12,22 14,20 12.5,15H14C12.5,19.5 18,24 21,18C22,16 22,9.5 17,9.5C13,9.5 14,15 10.5,13.5C14,10 12,7 9,7M19,12C22,15 15,21 15,15C15,13 17,10.5 19,12Z"/>
  </svg>

<!-- Islam: crescent and star (MDI) -->
{:else if isIslam}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Islam" role="img" fill="currentColor">
    <path d="M12.3,2C12.2,2 12.1,2 12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22C15,22 16.7,21 18.5,19.5C13,21 8,17 8,12C8,7 13,3 18.5,4.5C16.86,2.86 14.62,1.96 12.3,2M16.8,6.2L15.3,9.7L11.6,10L14.5,12.5L13.6,16L16.8,14L20,16L19,12.5L22,10L18.3,9.7L16.8,6.2Z"/>
  </svg>

<!-- Jain: open hand with ahimsa wheel (custom) -->
{:else if isJain}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Jain" role="img" fill="currentColor">
    <path d="M8 11V5a1.5 1.5 0 0 1 3 0v5h0V4a1.5 1.5 0 0 1 3 0v6h0V5a1.5 1.5 0 0 1 3 0v6c0 4-2.5 7-6.5 7S4 15 4 11V7.5a1.5 1.5 0 0 1 3 0V11h1z"/>
    <circle cx="11.5" cy="15" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="11.5" cy="15" r="0.8"/>
  </svg>

<!-- Judaism: Star of David (MDI) -->
{:else if isJudaism}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Judaism" role="img" fill="currentColor">
    <path d="M12,2L9.1,7H3.3L6.3,12L3.3,17H9.1L12,22L14.9,17H20.7L17.7,12L20.7,7H14.9L12,2M12,5L13.2,7H10.8L12,5M8.2,8.5L7.1,10.5L5.9,8.5H8.2M10,8.5H14L16,12L14,15.5H10L8,12L10,8.5M18,8.5L16.8,10.5L15.7,8.5H18M7.1,13.5L8.2,15.5H6L7.1,13.5M16.9,13.5L18.1,15.5H15.8L16.9,13.5M13.3,17L12,19L10.8,17H13.3Z"/>
  </svg>

<!-- Tao: yin-yang (FA) -->
{:else if isTao}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" class="{sizeClass} {cls}" aria-label="Tao" role="img" fill="currentColor">
    <path d="M256 64c53 0 96 43 96 96s-43 96-96 96s-96 43-96 96s43 96 96 96C150 448 64 362 64 256S150 64 256 64zm0 448A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm32-352a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/>
  </svg>

<!-- Sikh: Khanda (MDI) -->
{:else if isSikh}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Sikh" role="img" fill="currentColor">
    <path d="M16 20C19.72 18 22 15.27 22 12C22 9.34 20.46 6.9 17.89 5H17.82C19 6.35 19.68 8.09 19.68 10C19.68 13 18 15 15.5 16.83C15.5 16.84 14.38 17.54 13 18.41V17.33L15 16C15 16 14.8 15.4 14.58 14.46C16.6 13.58 18 11.69 18 9.5C18 7.34 16.64 5.47 14.65 4.57C14.84 3.63 15 3 15 3L12 1L9 3C9 3 9.16 3.63 9.35 4.57C7.37 5.47 6 7.34 6 9.5C6 11.69 7.4 13.58 9.42 14.46C9.2 15.4 9 16 9 16L11 17.33V18.41C9.62 17.54 8.5 16.84 8.5 16.83C6 15 4.32 13 4.32 10C4.32 8.09 5 6.35 6.18 5H6.12C3.54 6.9 2 9.34 2 12C2 15.27 4.29 18 8 20L9 18.5L10.92 19.73L7.34 22L8 23L11 21.07V23H13V21.07L16 23L16.66 22L13.08 19.73L15 18.5L16 20M16.75 9.5C16.75 11.09 15.76 12.46 14.31 13.19C14.14 12.23 14 11.12 14 10C14 8.67 14.2 7.15 14.42 5.86C15.81 6.6 16.75 7.95 16.75 9.5M7.25 9.5C7.25 7.95 8.19 6.6 9.59 5.86C9.8 7.15 10 8.67 10 10C10 11.12 9.86 12.23 9.69 13.19C8.24 12.46 7.25 11.09 7.25 9.5Z"/>
  </svg>

<!-- Zoroastrian: sacred fire on altar (custom) -->
{:else if isZoroastrian}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Zoroastrian" role="img" fill="currentColor">
    <path d="M12 2c0 0-5 4-5 9a5 5 0 0 0 10 0c0-2.5-1.5-4.5-2.5-5.5 0 2-1 3-2.5 4 1-3-2-5.5 0-7.5z"/>
    <rect x="7" y="19" width="10" height="1.5" rx="0.5"/>
    <rect x="9" y="17" width="6" height="2" rx="0.5"/>
    <rect x="10" y="15.5" width="4" height="1.5" rx="0.5"/>
  </svg>

{/if}
