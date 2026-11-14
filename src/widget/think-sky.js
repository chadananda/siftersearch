// Svelte action: the thinking sky on one <canvas>. ~30 fps, DPR ≤ 1.5, stops when the page is hidden or the sky has faded out;
// never runs under prefers-reduced-motion (CSS shows a still glow instead). Params: { on, depth }. Deps: think.js
import { skyNodes, linkAlpha } from './think.js';

export function sky(canvas, params) {
  let p = params || {}, raf = 0, last = 0, fade = 0, w = 0, h = 0, nodes = [];
  const ctx = canvas.getContext?.('2d');
  const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q) : { matches: false });
  const still = () => mq('(prefers-reduced-motion: reduce)').matches;
  const ink = () => (canvas.closest?.('.root')?.classList.contains('dark') ? '231,213,164' : '176,138,52');   // the widget's theme (prefs.js), not the OS
  const size = () => {
    const dpr = Math.min(1.5, globalThis.devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const seed = () => {
    const want = skyNodes(p.depth || 0, (w * h) / (900 * 700));
    while (nodes.length < want) nodes.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18, r: 0.7 + Math.random() * 1.3, a: 0 });
    if (nodes.length > want) nodes.length = want;
  };
  const draw = (t) => {
    raf = 0;
    if (!ctx || document.hidden) return;
    if (t - last < 33) { raf = requestAnimationFrame(draw); return; }
    const dt = Math.min(3, (t - last) / 33 || 1); last = t;
    fade = p.on ? Math.min(1, fade + 0.03 * dt) : fade - 0.05 * dt;
    if (fade <= 0) { fade = 0; ctx.clearRect(0, 0, w, h); return; }   // faded out: stop until the next question
    seed();
    const c = ink(), depth = p.depth || 0, reach = Math.min(170, Math.max(90, Math.min(w, h) * 0.22));
    ctx.clearRect(0, 0, w, h);
    for (const n of nodes) {
      n.x += n.vx * dt; n.y += n.vy * dt;
      if (n.x < -20) n.x = w + 20; else if (n.x > w + 20) n.x = -20;
      if (n.y < -20) n.y = h + 20; else if (n.y > h + 20) n.y = -20;
      n.a = Math.min(1, n.a + 0.02 * dt);
    }
    ctx.lineWidth = 0.7;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j], al = linkAlpha(Math.hypot(a.x - b.x, a.y - b.y), reach, depth) * Math.min(a.a, b.a) * fade;
      if (al < 0.01) continue;
      ctx.strokeStyle = `rgba(${c},${al.toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const n of nodes) {
      ctx.fillStyle = `rgba(${c},${(0.55 * n.a * fade).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 6.2832); ctx.fill();
    }
    raf = requestAnimationFrame(draw);
  };
  const kick = () => { if (!raf && !still() && !document.hidden && (p.on || fade > 0)) { if (!w) size(); last = 0; raf = requestAnimationFrame(draw); } };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { size(); if (!raf && fade > 0) kick(); }) : null;
  ro?.observe(canvas);
  const vis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else kick(); };
  document.addEventListener('visibilitychange', vis);
  kick();
  return {
    update(np) { p = np || {}; kick(); },
    destroy() { cancelAnimationFrame(raf); ro?.disconnect(); document.removeEventListener('visibilitychange', vis); },
  };
}
