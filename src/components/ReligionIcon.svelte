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
  const isBuddhist   = $derived(key === 'buddhist' || key === 'buddhism');
  const isChristian  = $derived(key === 'christian' || key === 'christianity');
  const isConfucian  = $derived(key === 'confucian' || key === 'confucianism');
  const isHindu      = $derived(key === 'hindu' || key === 'hinduism');
  const isIslam      = $derived(key === 'islam' || key === 'islamic' || key === 'muslim');
  const isJain       = $derived(key === 'jain' || key === 'jainism');
  const isJudaism    = $derived(key === 'judaism' || key === 'jewish');
  const isTao        = $derived(key === 'tao' || key === 'taoism' || key === 'taoist');
  const isZoroastrian = $derived(key === 'zoroastrian' || key === 'zoroastrianism');
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

<!-- Hindu: Om symbol (ॐ) -->
{:else if isHindu}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Hindu" role="img" fill="currentColor">
    <!-- Bold Om glyph that reads clearly at small sizes -->
    <path d="M8 10c0-2.2 1.8-4 4-4 1.5 0 2.8.8 3.4 2h-2.2c-.3-.3-.7-.5-1.2-.5-1.1 0-2 .9-2 2s.9 2 2 2c.8 0 1.4-.4 1.7-1H16c-.5 2-2.2 3.5-4.4 3.5C9.5 14 8 12.5 8 10z"/>
    <path d="M16 8.5c0 0 2.5.5 2.5 3.5s-2 4.5-4.5 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="15" cy="4.5" r="1.5"/>
    <path d="M6 16c2 1 5 1 8-.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
  </svg>

<!-- Islam: crescent and star -->
{:else if isIslam}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Islam" role="img" fill="currentColor">
    <!-- Wide crescent: large outer circle minus offset inner circle for thick crescent -->
    <path d="M10 2a10 10 0 1 0 0 20A8 8 0 0 1 10 2z"/>
    <!-- Five-pointed star centered in the crescent opening -->
    <polygon points="17,8 18,10.5 20.5,10.5 18.5,12.2 19.2,14.8 17,13 14.8,14.8 15.5,12.2 13.5,10.5 16,10.5"/>
  </svg>

<!-- Jain: open hand with ahimsa wheel -->
{:else if isJain}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="{sizeClass} {cls}" aria-label="Jain" role="img" fill="currentColor">
    <!-- Bold open palm silhouette with wheel -->
    <path d="M8 11V5a1.5 1.5 0 0 1 3 0v5h0V4a1.5 1.5 0 0 1 3 0v6h0V5a1.5 1.5 0 0 1 3 0v6c0 4-2.5 7-6.5 7S4 15 4 11V7.5a1.5 1.5 0 0 1 3 0V11h1z"/>
    <!-- Ahimsa wheel in palm center -->
    <circle cx="11.5" cy="15" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="11.5" cy="15" r="0.8"/>
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
