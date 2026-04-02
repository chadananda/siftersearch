<script>
  /**
   * ReligionIcon Component
   * Renders a recognizable SVG icon for each of the 10 religion traditions.
   * Props:
   *   religion - string name (case-insensitive match)
   *   size     - 'sm' (16px) | 'md' (20px) | 'lg' (36px) | 'xl' (64px)
   *   class    - additional CSS classes
   */
  let { religion = '', size = 'md', class: cls = '' } = $props();

  const sizeMap = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-9 h-9', xl: 'w-16 h-16' };
  // If cls already provides sizing, skip the default size class
  const sizeClass = $derived(cls ? '' : (sizeMap[size] ?? sizeMap.md));

  // Normalize religion name for matching
  const key = $derived(
    (religion || '').toLowerCase()
      .replace(/[''`']/g, '')
      .replace(/\s+/g, '')
  );

  const isBahai      = $derived(key.includes('baha'));
  const isBuddhist   = $derived(key === 'buddhist');
  const isChristian  = $derived(key === 'christian');
  const isConfucian  = $derived(key === 'confucian');
  const isHindu      = $derived(key === 'hindu');
  const isIslam      = $derived(key === 'islam');
  const isJain       = $derived(key === 'jain');
  const isJudaism    = $derived(key === 'judaism');
  const isTao        = $derived(key === 'tao');
  const isZoroastrian = $derived(key === 'zoroastrian');
</script>

<!-- Baha'i: nine-pointed star -->
{#if isBahai}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="1.699 1.631 19.772 19.847" class="{sizeClass} {cls}" aria-label="Baha'i" role="img">
    <path d="M11.5,3.48029005 L9.86707145,6.23402656 C9.74619801,6.437865 9.49883302,6.52885196 9.27468556,6.45192074 L6.25338496,5.414959 L6.76953271,8.59284101 C6.80718408,8.8246576 6.67842221,9.05143482 6.4600597,9.13788926 L3.4533676,10.3283036 L5.8859769,12.4198707 C6.06475776,12.5735871 6.11185819,12.8313093 5.99900337,13.0383241 L4.42725354,15.9214579 L7.62386698,15.9270008 C7.86471473,15.9274184 8.07103871,16.0994803 8.1147113,16.3363358 L8.70947825,19.5620159 L11.1773193,17.4770613 C11.3636425,17.3196462 11.6363575,17.3196462 11.8226807,17.4770613 L14.2905217,19.5620159 L14.8852887,16.3363358 C14.9289613,16.0994803 15.1352853,15.9274184 15.376133,15.9270008 L18.5727465,15.9214579 L17.0009966,13.0383241 C16.8881418,12.8313093 16.9352422,12.5735871 17.1140231,12.4198707 L19.5466324,10.3283036 L16.5399403,9.13788926 C16.3215778,9.05143482 16.1928159,8.8246576 16.2304673,8.59284101 L16.746615,5.414959 L13.7253144,6.45192074 C13.501167,6.52885196 13.253802,6.437865 13.1329285,6.23402656 L11.5,3.48029005 Z M9.21446299,5.3739917 L11.0699285,2.24497344 C11.2636165,1.91834219 11.7363835,1.91834219 11.9300715,2.24497344 L13.785537,5.3739917 L17.2116856,4.19807926 C17.5690519,4.07542508 17.9281055,4.37821709 17.8675327,4.75115899 L17.2820118,8.35616644 L20.6840597,9.70311074 C21.0337251,9.84155081 21.1111381,10.3019466 20.8259769,10.5471293 L18.0724866,12.9145911 L19.8530034,16.1806759 C20.0344569,16.5135245 19.7939622,16.9193419 19.414867,16.9199992 L15.7933689,16.9262788 L15.1177113,20.5906642 C15.0480968,20.9682142 14.5965827,21.1297021 14.3033193,20.8819387 L11.5,18.5135554 L8.69668074,20.8819387 C8.40341733,21.1297021 7.95190324,20.9682142 7.8822887,20.5906642 L7.20663109,16.9262788 L3.58513302,16.9199992 C3.2060378,16.9193419 2.96554309,16.5135245 3.14699663,16.1806759 L4.92751342,12.9145911 L2.1740231,10.5471293 C1.88886186,10.3019466 1.96627494,9.84155081 2.3159403,9.70311074 L5.71798824,8.35616644 L5.13246729,4.75115899 C5.07189452,4.37821709 5.43094815,4.07542508 5.78831444,4.19807926 L9.21446299,5.3739917 Z" fill="currentColor"/>
  </svg>

<!-- Buddhist: dharma wheel -->
{:else if isBuddhist}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Buddhist" role="img" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>
    <!-- 8 spokes -->
    <line x1="12" y1="9.5" x2="12" y2="2"/>
    <line x1="12" y1="14.5" x2="12" y2="22"/>
    <line x1="9.5" y1="12" x2="2" y2="12"/>
    <line x1="14.5" y1="12" x2="22" y2="12"/>
    <line x1="10.23" y1="10.23" x2="4.93" y2="4.93"/>
    <line x1="13.77" y1="13.77" x2="19.07" y2="19.07"/>
    <line x1="13.77" y1="10.23" x2="19.07" y2="4.93"/>
    <line x1="10.23" y1="13.77" x2="4.93" y2="19.07"/>
  </svg>

<!-- Christian: latin cross -->
{:else if isChristian}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Christian" role="img" fill="currentColor">
    <path d="M11 2h2v7h7v2h-7v11h-2V11H4V9h7V2z"/>
  </svg>

<!-- Confucian: stylized 儒 character -->
{:else if isConfucian}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Confucian" role="img" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <!-- Person silhouette with scholar's cap — represents Ru/Confucian scholarship -->
    <circle cx="12" cy="6" r="2.5"/>
    <!-- Mortarboard cap -->
    <path d="M6.5 5.5h11M12 3v2.5"/>
    <line x1="17" y1="5.5" x2="17" y2="8"/>
    <!-- Body / robes -->
    <path d="M8 10.5c0 0 1-1.5 4-1.5s4 1.5 4 1.5V21H8V10.5z"/>
    <!-- Collar detail -->
    <path d="M12 9v4"/>
  </svg>

<!-- Hindu: Om symbol -->
{:else if isHindu}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Hindu" role="img" fill="currentColor">
    <!-- Om (ॐ) stylised as SVG paths -->
    <path d="M7.5 8.5c0-1.1.9-2 2-2s2 .9 2 2c0 .8-.5 1.5-1.2 1.8.7.2 1.7.8 1.7 2.2 0 1.7-1.3 2.5-2.5 2.5s-2-.8-2-2h1.2c0 .5.4.9.8.9.6 0 1.3-.4 1.3-1.4 0-.9-.7-1.3-1.5-1.3H8.6V10h.7c.7 0 1.2-.5 1.2-1s-.4-.8-.8-.8c-.5 0-.8.3-.8.8H7.5z"/>
    <path d="M12.5 7h1.3l1.7 5.5L17.2 7h1.3l-2.3 7h-1.4z"/>
    <!-- Curved tail and dot of Om -->
    <path d="M7 15.5c0 0 2 .5 4 0" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <circle cx="12" cy="4.5" r="0.8"/>
  </svg>

<!-- Islam: crescent and star -->
{:else if isIslam}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Islam" role="img" fill="currentColor">
    <!-- Crescent: full circle minus offset circle = crescent -->
    <path d="M12 3a9 9 0 1 0 0 18A7 7 0 1 1 12 3z"/>
    <!-- Five-pointed star -->
    <polygon points="17.5,7 18.2,9.2 20.5,9.2 18.7,10.6 19.4,12.8 17.5,11.4 15.6,12.8 16.3,10.6 14.5,9.2 16.8,9.2"/>
  </svg>

<!-- Jain: hand with wheel (ahimsa) -->
{:else if isJain}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Jain" role="img" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
    <!-- Open palm (stop gesture = ahimsa/non-violence) -->
    <path d="M9 6V3.5a1 1 0 0 1 2 0V9M11 4.5V3a1 1 0 0 1 2 0v6M13 4.5V3.5a1 1 0 0 1 2 0V9M15 5.5V5a1 1 0 0 1 2 0v4c0 3.5-2 6.5-6 6.5S7 12.5 7 9V6.5a1 1 0 0 1 2 0V9"/>
    <!-- Small dharma wheel in palm -->
    <circle cx="12" cy="13" r="2" stroke-width="1"/>
    <line x1="12" y1="11" x2="12" y2="15"/>
    <line x1="10" y1="13" x2="14" y2="13"/>
  </svg>

<!-- Judaism: Star of David -->
{:else if isJudaism}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Judaism" role="img" fill="none" stroke="currentColor" stroke-width="1.5">
    <!-- Two overlapping equilateral triangles -->
    <polygon points="12,3 21.8,19.5 2.2,19.5"/>
    <polygon points="12,21 2.2,4.5 21.8,4.5"/>
  </svg>

<!-- Tao: yin-yang -->
{:else if isTao}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Tao" role="img">
    <!-- Outer circle -->
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <!-- Left half dark, right half light -->
    <path d="M12 2 A10 10 0 0 0 12 22 A5 5 0 0 0 12 12 A5 5 0 0 1 12 2Z" fill="currentColor"/>
    <!-- Small circle top (light) -->
    <circle cx="12" cy="7" r="1.8" fill="none" stroke="currentColor" stroke-width="1"/>
    <!-- Small circle bottom (dark) -->
    <circle cx="12" cy="17" r="1.8" fill="currentColor"/>
  </svg>

<!-- Zoroastrian: faravahar / fire altar -->
{:else if isZoroastrian}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Zoroastrian" role="img" fill="currentColor">
    <!-- Fire / flame shape (sacred fire = core Zoroastrian symbol) -->
    <path d="M12 2c0 0-5 4-5 9a5 5 0 0 0 10 0c0-2.5-1.5-4.5-2.5-5.5 0 2-1 3-2.5 4 1-3-2-5.5 0-7.5z"/>
    <!-- Altar base -->
    <rect x="7" y="19" width="10" height="1.5" rx="0.5"/>
    <rect x="9" y="17" width="6" height="2" rx="0.5"/>
    <rect x="10" y="15.5" width="4" height="1.5" rx="0.5"/>
  </svg>

{/if}
