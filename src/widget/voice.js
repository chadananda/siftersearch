// Anís voice runtime (lazy bundle api/static/widget/anis-voice.js, loaded on first voice use; sets window.__anisVoice).
// dictate: live browser recognition when present, else record → /api/chat/transcribe. readAloud / player: sentences →
// /api/chat/speak mp3 (R2-cached at the edge), speechSynthesis fallback. conversation: mic level → VAD turn end → transcribe →
// ask (mode 'audio') → speak the reply sentence by sentence as it streams → listen again; barge-in stops playback.
// Pure parts are voice-core.js (tested); this file is the DOM/media glue. Audio element + AudioContext come in unlocked
// (created inside the reader's tap in SifterChat) — iOS Safari plays nothing otherwise.
import { sentenceStream, sentences, silenceTracker, bargeTracker, rms, orbScale, pickMime, worthSending, STATE_TEXT } from './voice-core.js';

const Recognition = () => window.SpeechRecognition || window.webkitSpeechRecognition;
const BLOCKED = 'Microphone access is blocked. Allow it in your browser settings to speak.';
const micError = (e) => (e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? BLOCKED
  : e?.name === 'NotFoundError' ? 'No microphone was found.' : 'The microphone could not start.');
const openMic = () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
const release = (stream) => stream?.getTracks().forEach((t) => t.stop());

/** Mic level every 50 ms → onFrame(level, t). Returns the stop function. */
function meter(ctx, stream, onFrame) {
  ctx.resume?.().catch?.(() => {});
  const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
  an.fftSize = 1024; src.connect(an);
  const buf = new Float32Array(an.fftSize);
  const id = setInterval(() => { an.getFloatTimeDomainData(buf); onFrame(rms(buf), performance.now()); }, 50);
  return () => { clearInterval(id); try { src.disconnect(); } catch { /* gone */ } };
}

function recorder(stream) {
  const mime = pickMime((m) => window.MediaRecorder?.isTypeSupported?.(m));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [];
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  rec.start(250);
  const blob = () => new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
  return {
    stop: () => new Promise((res) => { if (rec.state === 'inactive') return res(blob()); rec.onstop = () => res(blob()); rec.stop(); }),
    cancel: () => { rec.onstop = null; try { if (rec.state !== 'inactive') rec.stop(); } catch { /* gone */ } },
  };
}

async function transcribe(api, blob) {
  if (!blob.size) return '';
  const r = await fetch(`${api}/api/chat/transcribe`, { method: 'POST', credentials: 'include', headers: { 'content-type': blob.type || 'application/octet-stream' }, body: blob });
  if (!r.ok) throw new Error(`transcribe ${r.status}`);
  return String((await r.json()).text || '').trim();
}

/** A speaking queue: say(sentence) … end(). Fetches at most two sentences ahead (a stopped reading costs nothing more).
 *  One failed fetch → speechSynthesis for the rest. stop() is silent (no onDone). */
export function player({ api, audio, voice, onCaption, onStart, onDone }) {
  const q = [];
  let ended = false, stopped = false, playing = false, finished = false, synth = !audio, cut = null;
  const fetchAudio = (text) => fetch(`${api}/api/chat/speak`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, ...(voice ? { voice } : {}) }) })
    .then((r) => (r.ok ? r.blob() : null)).catch(() => null);
  const ahead = () => { if (!synth) for (const it of q.slice(0, 2)) it.blob ||= fetchAudio(it.text); };
  const playBlob = (blob) => new Promise((res) => {
    const url = URL.createObjectURL(blob);
    const done = () => { audio.onended = audio.onerror = null; cut = null; URL.revokeObjectURL(url); res(); };
    audio.onended = done; audio.onerror = done; cut = done;
    audio.src = url;
    const p = audio.play(); onStart?.();
    p?.catch?.(done);
  });
  const speakSynth = (text) => new Promise((res) => {
    const S = window.speechSynthesis;
    if (!S) return res();
    const u = new SpeechSynthesisUtterance(text);
    const done = () => { cut = null; res(); };
    u.onend = done; u.onerror = done; cut = () => { S.cancel(); done(); };
    S.speak(u); onStart?.();
  });
  const finish = () => { if (!finished && !stopped) { finished = true; onDone?.(); } };
  async function pump() {
    if (playing || stopped) return;
    const it = q.shift();
    if (!it) { if (ended) finish(); return; }
    playing = true; ahead();
    onCaption?.(it.text);
    const blob = synth ? null : await (it.blob ||= fetchAudio(it.text));
    if (stopped) return;
    if (blob?.size) await playBlob(blob); else { synth = true; await speakSynth(it.text); }
    playing = false;
    pump();
  }
  return {
    say(text) { if (stopped || !text) return; q.push({ text }); ahead(); pump(); },
    end() { ended = true; pump(); },
    stop() { stopped = true; q.length = 0; try { audio?.pause(); } catch { /* none */ } cut?.(); try { window.speechSynthesis?.cancel(); } catch { /* none */ } },
  };
}

/** Read one finished reply aloud. → { stop }. */
export function readAloud({ api, audio, md, voice, onCaption, onEnd }) {
  const p = player({ api, audio, voice, onCaption, onDone: onEnd });
  for (const s of sentences(md)) p.say(s);
  p.end();
  return { stop: () => { p.stop(); onEnd?.(); } };
}

/** Dictation into the composer. Live recognition (interim text) when the browser has it; otherwise record until a pause
 *  (or the reader taps again) and transcribe at the edge. → { stop }. */
export function dictate({ api, ctx, lang, onInterim, onFinal, onLevel, onState, onError, onEnd }) {
  let stopFn = () => {}, over = false;
  const end = () => { if (!over) { over = true; onEnd?.(); } };
  const viaRecorder = async () => {
    let stream;
    try { stream = await openMic(); } catch (e) { onError?.(micError(e)); return end(); }
    if (over) return release(stream);
    const rec = recorder(stream), tr = silenceTracker({ hangMs: 1600 });
    let heard = false, done = false;
    const stopMeter = ctx ? meter(ctx, stream, (l, t) => { onLevel?.(l); const ev = tr.feed(l, t); if (ev === 'start') heard = true; if (ev === 'end') finish(false); }) : () => {};
    const timer = setTimeout(() => finish(false), 60000);
    onState?.('listening');
    async function finish(manual) {
      if (done) return; done = true;
      clearTimeout(timer); stopMeter();
      const blob = await rec.stop(); release(stream);
      if (heard || manual || !ctx) {
        onState?.('thinking');
        try { const text = await transcribe(api, blob); if (worthSending(text)) onFinal?.(text); } catch { onError?.('That could not be heard just now. Please try again.'); }
      }
      end();
    }
    stopFn = () => finish(true);
  };
  const R = Recognition();
  if (!R) { viaRecorder(); return { stop: () => stopFn() }; }
  const rec = new R();
  rec.lang = lang || navigator.language || 'en-US';
  rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let finalText = '', fellBack = false;
  rec.onresult = (e) => {
    let interim = ''; finalText = '';
    for (const r of e.results) { if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript; }
    onInterim?.(`${finalText}${interim}`.trim());
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed') onError?.(BLOCKED);
    else if (e.error === 'service-not-allowed' || e.error === 'network' || e.error === 'language-not-supported') { fellBack = true; viaRecorder(); }
  };
  rec.onend = () => { if (fellBack) return; if (finalText.trim()) onFinal?.(finalText.trim()); end(); };
  stopFn = () => { try { rec.stop(); } catch { end(); } };
  try { rec.start(); onState?.('listening'); } catch { fellBack = true; viaRecorder(); }
  return { stop: () => stopFn() };
}

/** Hands-free conversation. ask(text, { onText(delta), onDone(err?) }) sends the question (mode 'audio') and streams the reply.
 *  → { pause() (toggles), close() }. States: listening, thinking, speaking, paused, denied. */
/** onLevel gets the orb scale (1 … 1.35), not the raw level. */
export function conversation({ api, audio, ctx, voice, ask, onState, onLevel, onHeard, onCaption }) {
  let stream = null, stopMeter = null, rec = null, pl = null, mode = 'idle', closed = false, tr = null, barge = null, since = 0;
  const set = (s, text) => { mode = s; onState?.(s, text ?? STATE_TEXT[s] ?? ''); };
  const listen = () => {
    if (closed) return;
    pl = null; tr = silenceTracker(); rec?.cancel(); rec = recorder(stream); since = performance.now();
    set('listening');
  };
  const frame = (level, t) => {
    if (mode === 'listening') {
      onLevel?.(orbScale(level));
      const ev = tr.feed(level, t);
      if (ev === 'end') turn();
      else if (!tr.speaking && t - since > 30000) listen();   // nothing said for a while: a fresh recording, not an ever-growing one
    } else if (mode === 'speaking') {
      onLevel?.(1);
      if (barge.feed(level, t) === 'start') { pl?.stop(); listen(); }   // the reader talks over Anís: stop and listen
    } else onLevel?.(1);
  };
  async function turn() {
    const r = rec; rec = null;
    set('thinking');
    let text = '';
    try { text = await transcribe(api, await r.stop()); } catch { text = ''; }
    if (closed || mode !== 'thinking') return;
    if (!worthSending(text)) return listen();
    onHeard?.(text);
    const ss = sentenceStream();
    const p = player({ api, audio, voice, onCaption,
      onStart: () => { if (pl === p && mode === 'thinking') { barge = bargeTracker(); set('speaking'); } },
      onDone: () => { if (pl === p && !closed && mode !== 'paused') listen(); } });
    pl = p;
    ask(text, {
      onText: (d) => { if (pl === p) for (const s of ss.push(d)) p.say(s); },
      onDone: () => { if (pl !== p) return; for (const s of ss.flush()) p.say(s); p.end(); },
    });
  }
  (async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !ctx) return set('denied', 'Voice conversation is not supported in this browser.');
    try { stream = await openMic(); } catch (e) { return set('denied', micError(e)); }
    if (closed) return release(stream);
    stopMeter = meter(ctx, stream, frame);
    listen();
  })();
  return {
    pause() {
      if (closed || mode === 'denied' || !stream) return;
      if (mode === 'paused') return listen();
      pl?.stop(); pl = null; rec?.cancel(); rec = null;
      set('paused');
    },
    close() { closed = true; pl?.stop(); rec?.cancel(); stopMeter?.(); release(stream); },
  };
}

window.__anisVoice = { dictate, readAloud, conversation, player };
