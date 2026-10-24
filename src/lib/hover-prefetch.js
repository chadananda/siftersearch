// Hover/focus/touch on a link to a talk page: prefetch its HTML and warm its audio at the edge (POST /_media/warm), so the
// click lands on a warm page (Chad 10-24). ~65 ms dwell skips fly-bys; once per talk per session; at most 2 at a time;
// never on Save-Data or a 2g/3g connection. Browser only.
export const TALK_HREF = /^\/media\/([a-z0-9][a-z0-9-]{0,99})\/?$/;
const NOT_TALKS = new Set(['remaster']);
export const talkSlug = (href) => { const m = TALK_HREF.exec(String(href || '').split(/[?#]/)[0]); return m && !NOT_TALKS.has(m[1]) ? m[1] : null; };
export const slowLink = (c = globalThis.navigator?.connection) => !!(c && (c.saveData || /^(slow-2g|2g|3g)$/.test(c.effectiveType || '')));

export function startHoverPrefetch({ dwell = 65, max = 2 } = {}) {
  if (typeof document === 'undefined' || document.documentElement.dataset.hoverPrefetch) return () => {};
  document.documentElement.dataset.hoverPrefetch = '1';
  const done = new Set(); let active = 0, timer = 0;
  const run = async (slug) => {
    if (done.has(slug) || active >= max || slowLink()) return;
    done.add(slug); active++;
    try {
      const l = document.createElement('link'); l.rel = 'prefetch'; l.as = 'document'; l.href = `/media/${slug}`; document.head.appendChild(l);
      const r = await fetch(`/api/media/${slug}`);   // edge-cached; says which files exist and at which version
      if (!r.ok) return;
      const a = (await r.json()).audio;
      const v = /[?&]v=(\d+)/.exec(a?.m4a || '')?.[1];
      if (!v) return;
      const fmt = new Audio().canPlayType('audio/ogg; codecs="opus"') ? 'ogg' : 'm4a';
      await fetch(`/_media/warm?slug=${slug}&v=${v}&fmt=${fmt}&copy=${a.remastered ? 'both' : 'main'}`, { method: 'POST' });
    } catch { /* a prefetch never matters */ } finally { active--; }
  };
  const slugOf = (e) => talkSlug(e.target?.closest?.('a[href]')?.getAttribute('href'));
  const over = (e) => { const s = slugOf(e); if (s) { clearTimeout(timer); timer = setTimeout(() => run(s), dwell); } };
  const out = () => clearTimeout(timer);
  const now = (e) => { const s = slugOf(e); if (s) run(s); };
  document.addEventListener('pointerover', over, { passive: true });
  document.addEventListener('pointerout', out, { passive: true });
  document.addEventListener('focusin', now);
  document.addEventListener('touchstart', now, { passive: true });
  // talk cards scrolling into view (dwell ~700 ms, at most one at a time): the audio fill starts before anyone points at them
  let seen = 0; const dwellers = new Map();
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => es.forEach((e) => {
    const slug = talkSlug(e.target.getAttribute('href'));
    if (!slug) return;
    if (e.isIntersecting) dwellers.set(e.target, setTimeout(() => { if (active < 1) run(slug); }, 700)); else clearTimeout(dwellers.get(e.target));
  })) : null;
  const scan = () => { if (!io || slowLink()) return; document.querySelectorAll('a[href^="/media/"]').forEach((a) => { if (seen < 60 && !a.dataset.pf && talkSlug(a.getAttribute('href'))) { a.dataset.pf = '1'; seen++; io.observe(a); } }); };
  const idle = globalThis.requestIdleCallback || ((f) => setTimeout(f, 1500));
  idle(scan); const rescan = setInterval(scan, 5000);
  return () => { clearInterval(rescan); io?.disconnect(); document.removeEventListener('pointerover', over); document.removeEventListener('pointerout', out); document.removeEventListener('focusin', now); document.removeEventListener('touchstart', now); };
}
