// The Library landing in the browser (the books are SSR HTML; no framework here). One setup for the page: sideways rows
// (arrows, mouse drag with momentum), "more" cards and collection chips that bring books out of the stacks
// (GET /api/library/shelves/items, drawn by renderBook), the wall of covers (continues past the covered books into every
// collection, chunk by chunk, fading in as it scrolls), cover art that fails falling back to its typographic cover, live
// tradition counts, and the motion gate (ambient motion starts after load).
import { renderBook, thousands, coveredBooks, wallSources, shuffle } from './library-stacks.js';
import { onLanding, getShelves } from './library-feed.js';

const API = import.meta.env.PUBLIC_API_URL || '';
const PAGE = 48;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initLibrary(root) {
  if (!root || root.dataset.ready) return;
  root.dataset.ready = '1';
  setTimeout(() => root.classList.add('lib-live'), 1200);

  // cover art that will not load: show the book's typographic cover instead (error does not bubble: capture it)
  // art fades in once loaded (load/error do not bubble: capture them)
  root.addEventListener('error', (e) => { if (e.target?.tagName === 'IMG') e.target.closest('.bk')?.classList.add('no-art'); }, true);
  root.addEventListener('load', (e) => { if (e.target?.tagName === 'IMG') e.target.closest('.bk')?.classList.add('ld'); }, true);
  root.querySelectorAll('.bk img').forEach((img) => {
    if (!img.complete) return;
    img.closest('.bk')?.classList.add(img.naturalWidth > 0 ? 'ld' : 'no-art');
  });
  root.classList.add('lib-js');

  root.querySelectorAll('.rowwrap').forEach(setupRow);
  root.addEventListener('click', onClick);
  onLanding((d) => {
    for (const t of d?.traditions || []) {
      root.querySelectorAll(`[data-trad-count="${CSS.escape(t.name)}"]`).forEach((el) => { el.textContent = thousands(t.documents); });
    }
  });
  const wall = root.querySelector('.wall');
  if (wall) initWall(wall);

  function setupRow(wrap) {
    const row = wrap.querySelector('.row');
    if (!row || row.dataset.ready) return;
    row.dataset.ready = '1';
    const l = wrap.querySelector('.arrow.l'), r = wrap.querySelector('.arrow.r');
    const sync = () => {
      const max = row.scrollWidth - row.clientWidth - 2;
      if (l) l.disabled = row.scrollLeft <= 2;
      if (r) r.disabled = row.scrollLeft >= max;
    };
    let raf = 0;
    row.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync(); }); }, { passive: true });
    l?.addEventListener('click', () => row.scrollBy({ left: -row.clientWidth * 0.85, behavior: reduced() ? 'auto' : 'smooth' }));
    r?.addEventListener('click', () => row.scrollBy({ left: row.clientWidth * 0.85, behavior: reduced() ? 'auto' : 'smooth' }));
    new ResizeObserver(sync).observe(row);
    sync();
    drag(row);
  }

  // mouse drag with momentum (touch scrolls natively); a drag never counts as a click on the book under it
  function drag(el) {
    let down = false, moved = false, x0 = 0, s0 = 0, lastX = 0, lastT = 0, v = 0, glide = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      cancelAnimationFrame(glide);
      down = true; moved = false; x0 = lastX = e.clientX; s0 = el.scrollLeft; lastT = performance.now(); v = 0;
    });
    el.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - x0;
      if (!moved && Math.abs(dx) > 6) { moved = true; el.classList.add('dragging'); el.setPointerCapture(e.pointerId); }
      if (!moved) return;
      const t = performance.now();
      v = (e.clientX - lastX) / Math.max(1, t - lastT); lastX = e.clientX; lastT = t;
      el.scrollLeft = s0 - dx;
    });
    const up = () => {
      if (!down) return;
      down = false;
      if (!moved) return;
      el.classList.remove('dragging');
      el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); }, { capture: true, once: true });
      if (reduced()) return;
      let vel = -v * 16;
      const step = () => { if (Math.abs(vel) < 0.4) return; el.scrollLeft += vel; vel *= 0.94; glide = requestAnimationFrame(step); };
      glide = requestAnimationFrame(step);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  async function bringOut(card) {
    if (card.getAttribute('aria-busy') === 'true') return;
    const p = JSON.parse(card.dataset.more);
    card.setAttribute('aria-busy', 'true');
    try {
      const j = await items(p, p.offset || 0);
      const have = new Set([...card.parentElement.querySelectorAll('.bk')].map((a) => a.dataset.id));
      const html = (j.items || []).filter((b) => !have.has(String(b.id))).map((b) => renderBook(b, p.religion, { cls: 'arrive lift' })).join('');
      card.insertAdjacentHTML('beforebegin', html);
      p.offset = (p.offset || 0) + (j.items || []).length;
      const left = Math.max(0, (Number(j.total ?? p.total) || 0) - p.offset);
      if (!j.items?.length || left <= 0) { card.remove(); return; }
      card.dataset.more = JSON.stringify(p);
      card.querySelector('b').textContent = `+${thousands(left)}`;
      card.querySelector('span').textContent = 'more. Keep scrolling and they keep coming';
      if (!card.dataset.auto) {   // after the first pull, the row keeps unrolling as you scroll along it
        card.dataset.auto = '1';
        new IntersectionObserver(([e]) => { if (e.isIntersecting && card.isConnected) bringOut(card); }, { root: card.closest('.row'), rootMargin: '0px 800px 0px 0px' }).observe(card);
      }
    } catch {
      card.querySelector('span').textContent = 'The stacks did not answer. Try again';
    } finally { card.setAttribute('aria-busy', 'false'); }
  }

  function openCollection(chip) {
    const sec = chip.closest('.trad');
    const slot = sec?.querySelector('.opened');
    if (!slot) return;
    const p = JSON.parse(chip.dataset.coll);
    const id = `coll-${p.key}`;
    const was = slot.querySelector(`#${CSS.escape(id)}`);
    if (was) { was.remove(); chip.setAttribute('aria-expanded', 'false'); return; }
    chip.setAttribute('aria-expanded', 'true');
    const box = document.createElement('div');
    box.id = id;
    box.innerHTML = `<div class="row-head"><h3></h3><span class="n"></span></div><div class="rowwrap"><button class="arrow l" type="button">←</button><button class="arrow r" type="button">→</button>`
      + `<div class="row" role="group"><button class="more-card" type="button"><b></b><span>Bringing them out of the stacks…</span></button></div></div>`;
    box.querySelector('h3').textContent = p.name;
    box.querySelector('.n').textContent = `${thousands(p.count)} books`;
    box.querySelector('.arrow.l').setAttribute('aria-label', `Scroll ${p.name} back`);
    box.querySelector('.arrow.r').setAttribute('aria-label', `Scroll ${p.name} on`);
    box.querySelector('.row').setAttribute('aria-label', p.name);
    const card = box.querySelector('.more-card');
    card.dataset.more = JSON.stringify({ religion: p.religion, total: p.count, ...p.params });
    card.querySelector('b').textContent = `+${thousands(p.count)}`;
    slot.prepend(box);
    setupRow(box.querySelector('.rowwrap'));
    bringOut(card);
  }

  function onClick(e) {
    const more = e.target.closest('.more-card');
    if (more) { e.preventDefault(); bringOut(more); return; }
    const chip = e.target.closest('button.coll[data-coll]');
    if (chip) { e.preventDefault(); openCollection(chip); }
  }
}

async function items(p, offset) {
  const q = new URLSearchParams({ religion: p.religion, offset: String(offset), limit: String(PAGE) });
  for (const k of ['authors', 'collection', 'site']) if (p[k] != null) q.set(k, p[k]);
  const r = await fetch(`${API}/api/library/shelves/items?${q}`);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

// The wall: the SSR chunk is the first covered books in today's order; then the rest of the covered books, then every
// collection of every tradition (round-robin), 48 at a time, as the reader nears the end. Books fade in as they enter.
function initWall(wall) {
  wall.classList.add('js-wall');
  const fade = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); fade.unobserve(e.target); } }, { rootMargin: '0px 0px -5% 0px' });
  const watch = (scope) => scope.querySelectorAll('.bk:not(.in)').forEach((b) => fade.observe(b));
  watch(wall);
  const sentinel = wall.querySelector('.wall-end');
  const status = wall.querySelector('.wall-status');
  let queue = null, src = 0, busy = false, done = false;
  const shown = new Set([...wall.querySelectorAll('.bk')].map((b) => b.dataset.id));
  const append = (books) => {
    const fresh = books.filter((b) => b?.id != null && !shown.has(String(b.id)));
    if (!fresh.length) return 0;
    fresh.forEach((b) => shown.add(String(b.id)));
    const chunk = document.createElement('div');
    chunk.className = 'wall-chunk';
    chunk.innerHTML = fresh.map((b) => renderBook(b, b.religion, { caption: false, sizes: '120px', widths: [120, 240] })).join('');
    sentinel.before(chunk);
    watch(chunk);
    return fresh.length;
  };
  async function next() {
    if (busy || done) return;
    busy = true;
    try {
      if (!queue) {
        const sh = await getShelves();
        if (!sh) throw new Error('no shelves');
        const seed = Number(wall.dataset.seed) || 0;
        queue = { covered: shuffle(coveredBooks(sh), seed).slice(Number(wall.dataset.n) || 0), sources: wallSources(sh).map((s) => ({ ...s, offset: 0 })) };
      }
      if (queue.covered.length) { append(queue.covered.splice(0, PAGE)); return; }
      let added = 0, tries = 0;
      while (!added && tries < queue.sources.length) {
        const live = queue.sources.filter((s) => s.offset < s.count);
        if (!live.length) { done = true; break; }
        const s = live[src++ % live.length];
        const j = await items({ religion: s.religion, ...s.params }, s.offset);
        s.offset += Math.max(PAGE, (j.items || []).length);
        if (!(j.items || []).length) s.offset = s.count;
        added = append((j.items || []).map((b) => ({ ...b, religion: s.religion })));
        tries++;
      }
      if (done) { sentinel.remove(); if (status) status.textContent = 'You have reached the end of the wall.'; }
    } catch { if (status) status.textContent = 'The stacks are not answering just now. Scroll again in a moment.'; }
    finally { busy = false; }
  }
  new IntersectionObserver(([e]) => { if (e.isIntersecting) next(); }, { rootMargin: '1200px 0px' }).observe(sentinel);
}
