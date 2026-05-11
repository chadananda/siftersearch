<script>
  import { onMount } from 'svelte';

  onMount(() => {
    const rounds = Array.from(document.querySelectorAll('.dialog-body .user-turn[id]'));
    if (!rounds.length) return;

    const tocLinks = new Map();
    for (const r of rounds) {
      const a = document.querySelector(`.toc-rail a[href="#${r.id}"]`);
      if (a) tocLinks.set(r.id, a);
    }

    let active = null;
    const setActive = (id) => {
      if (active === id) return;
      if (active) {
        const prev = tocLinks.get(active);
        prev?.classList.remove('toc-active');
        prev?.parentElement?.querySelector('.toc-a')?.classList.remove('toc-active');
      }
      active = id;
      const link = tocLinks.get(id);
      if (link) {
        link.classList.add('toc-active');
        link.parentElement?.querySelector('.toc-a')?.classList.add('toc-active');
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length) {
          visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    );

    rounds.forEach(r => io.observe(r));
    return () => io.disconnect();
  });
</script>
