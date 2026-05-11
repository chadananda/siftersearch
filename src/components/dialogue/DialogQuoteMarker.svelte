<script>
  import { onMount } from 'svelte';

  onMount(() => {
    const QUOTE_OPEN = /^[\u201C\u201D"]/;
    for (const p of document.querySelectorAll('.jafar-turn > p, .user-turn > p')) {
      const t = (p.textContent || '').trim();
      if (t.length < 80 || !QUOTE_OPEN.test(t)) continue;
      if (/[\u201C\u201D"][^"\u201C\u201D]*$/.test(t) || p.querySelector('a[href*="siftersearch.com"]')) {
        p.setAttribute('data-quote-paragraph', 'true');
      }
    }
  });
</script>
