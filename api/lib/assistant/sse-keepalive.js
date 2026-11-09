// SSE comment heartbeat so the edge doesn't drop a stream while a turn plans silently. Returns stop(); also stops on close.
export const sseKeepalive = (raw, every = 15000) => {
  const t = setInterval(() => { if (raw.writableEnded || raw.destroyed) return stop(); try { raw.write(': keepalive\n\n'); } catch { stop(); } }, every);
  const stop = () => clearInterval(t);
  raw.once?.('close', stop);
  return stop;
};
