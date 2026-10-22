// Svelte action: toggles .lr-paused on a node while it is off screen, so its CSS animations stop (GPU/CPU idle offscreen).
export function pauseOffscreen(node) {
  if (typeof IntersectionObserver === 'undefined') return {};
  const io = new IntersectionObserver(([e]) => node.classList.toggle('lr-paused', !e.isIntersecting), { rootMargin: '100px' });
  io.observe(node);
  return { destroy: () => io.disconnect() };
}
