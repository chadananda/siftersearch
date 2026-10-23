// The talk page's portrait ROTATION (Chad 10-23: rotate a speaker's photos; a gentle crossfade where one slot is shown).
// TalkHero renders today's photo and stacks the rest as .rot layers carrying data-src; this loads the next only when its
// turn comes, fades it in over the current one, and rewrites the credit line. No motion for prefers-reduced-motion; paused
// while the tab is hidden. Browser only.
export function rotatePortraits(root = document, { every = 9000 } = {}) {
  const ring = root.querySelector('[data-rotate]');
  if (!ring || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};
  const layers = [...ring.querySelectorAll('img.rot')];
  const cap = root.querySelector('[data-rot-caption]');
  const first = cap?.querySelector('a');
  const base = { credit: first?.textContent || '', href: first?.getAttribute('href') || '', lic: first?.getAttribute('title') || '', tail: cap?.querySelector('span')?.textContent || '', title: ring.title };
  const attr = (el, k, v) => (v ? el.setAttribute(k, v) : el.removeAttribute(k));
  const who = cap?.dataset.who || 'the speaker';
  let i = 0;
  const show = async (n) => {
    const img = n ? layers[n - 1] : null;
    if (img && !img.src) { img.srcset = img.dataset.srcset || ''; img.src = img.dataset.src; try { await img.decode(); } catch { return; } }
    layers.forEach((l, k) => l.classList.toggle('on', k === n - 1));
    const a = cap?.querySelector('a'), span = cap?.querySelector('span');
    if (!img) { if (a) { a.textContent = base.credit; attr(a, 'href', base.href); attr(a, 'title', base.lic); } if (span) span.textContent = base.tail; ring.title = base.title; return; }
    const d = img.dataset;
    if (a) { a.textContent = `Photo of ${who}${d.credit ? `: ${d.credit}` : ''}`; attr(a, 'href', d.href); attr(a, 'title', d.licence); }
    if (span) span.textContent = d.year ? ` · ${d.year}` : '';
    ring.title = `${who}${d.credit ? ` — photo: ${d.credit}${d.year ? ` · ${d.year}` : ''}` : ''}`;
  };
  const t = setInterval(() => { if (!document.hidden) { i = (i + 1) % (layers.length + 1); show(i); } }, every);
  return () => clearInterval(t);
}
