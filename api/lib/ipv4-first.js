// Process-wide IPv4-first DNS (side-effect import, loaded by logger.js so every service gets it). 10-29: tower's IPv6 route is dead —
// Node fetch to rest.runpod.io, api.openai.com, api.anthropic.com, api.cloudflare.com hit UND_ERR_CONNECT_TIMEOUT (10.5 s) every time
// (AAAA first); with ipv4first: 0.3-2 s. Pods looked "lost"/"fetch failed" because the lane could not reach RunPod.
import dns from 'node:dns';
import net from 'node:net';
try { dns.setDefaultResultOrder('ipv4first'); net.setDefaultAutoSelectFamily?.(true); net.setDefaultAutoSelectFamilyAttemptTimeout?.(2000); } catch { /* old node */ }
