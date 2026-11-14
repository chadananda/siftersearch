// Stream auto-follow: stick to the bottom only while the reader is there; any upward scroll lets go at once (Chad 11-14).
export const nearBottom = (el, slack = 48) => !!el && el.scrollHeight - el.scrollTop - el.clientHeight <= slack;

// Returns { scroll(force), detach }. force = the reader's own act (send, open, switch thread) → follow again.
export function follower(el) {
  let follow = true, lastTop = el.scrollTop;
  const onScroll = () => { if (el.scrollTop < lastTop - 2) follow = false; else if (nearBottom(el)) follow = true; lastTop = el.scrollTop; };
  const letGo = (e) => { if (!e || e.deltaY === undefined || e.deltaY < 0) follow = false; };
  el.addEventListener('scroll', onScroll, { passive: true });
  el.addEventListener('wheel', letGo, { passive: true });
  el.addEventListener('touchmove', () => { if (!nearBottom(el)) follow = false; }, { passive: true });
  return {
    get following() { return follow; },
    scroll(force) { if (force) follow = true; if (!follow) return; el.scrollTop = el.scrollHeight; lastTop = el.scrollTop; },
    detach() { el.removeEventListener('scroll', onScroll); el.removeEventListener('wheel', letGo); },
  };
}
