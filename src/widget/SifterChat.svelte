<svelte:options customElement={{ shadow: 'open' }} />

<script>
  // SifterChat — Ocean's flagship embeddable companion ("The Illuminated Ocean").
  // Props from the loader: token (profile), api (origin). Config fetched per token; chat rides the
  // Anís SSE endpoint. LIVE streaming: the server emits `text` events during craft and REPLAYS the
  // canonical reply as `chunk` events at the end — we pace the live stream word-by-word (ink onto the
  // page) and swap in the canonical text at settle (it may differ: ungrounded links get stripped).
  // Transcript persists in localStorage per token. Soft WebAudio feedback (synthesized, muteable).
  // token/api from the loader; accent/name/mission are optional per-page overrides (data-* attrs)
  // that tune the widget without touching the DB profile. ONE public domain; the edge worker proxies /api.
  import { untrack } from 'svelte';
  import { ANIS_SAMPLES, ANIS_WELCOME, pickStarters } from '../lib/anis-samples.js';
  import { headingOf, olItem } from './rich-line.js';
  import { follower } from './follow.js';
  import { thinkDepth } from './think.js';
  import { sky } from './think-sky.js';
  import { richLinks } from './rich-link.js';
  import { tableAt } from './rich-table.js';
  import { settled } from './stream-tail.js';
  import { styleQuotes } from '../../api/lib/quote-style.js';
  import { quoteSegments, coverAt } from '../../api/lib/quote-blocks.js';
  import SideBySide from '../components/widgets/SideBySide.svelte';
  import { widgetSegments } from '../../api/lib/assistant/widgets/segments.js';
  import { BUILD, tagFor } from './version.js';
  import { loadTheme, saveTheme, nextTheme, isDark, bioRows } from './prefs.js';
  import { loadConfig, saveConfig, bootConfig } from './boot.js';
  import { pageContext, askLabel, askQuestion, fullModeHref, expandMode, urlThreadAction, threadParam, askParam, loadOpen, saveOpen, startOpen, loadMax, saveMax } from './page-context.js';
  import { plainReply, replyHtml, replySources, referenceList, questionIndex, roundOf, answerTurns, rewind, shareTurns, fromShared } from './reply-actions.js';
  import { openStore, loadMessages, saveMessages, saveIndex, upsertThread, removeThread, pruneThreads, dropThreadData, groupThreads,
    filterThreads, messagesText, threadTitle, firstQuestion, newThreadId, activeKey, addShare, dropShares, isFirstVisit, markSeen } from './threads.js';
  let { token = '', api = 'https://siftersearch.com', accent = '', name = '', mission = '', opened = '', samples = '', fullscreen = '', version = '' } = $props();   // version: shown beside the title (the Anís app passes its build, Chad 11-13); never part of the name the model uses
  // sample-questions menu (header icon; one showcase question per strategy): on by default (Chad 11-10); a host turns it off with
  // samples="off"/"false", a reader with ?anis-samples=0 (remembered on this browser; ?anis-samples brings it back)
  let showSamples = $state(true);
  let sampleOpen = $state(false);
  try {
    const q = new URLSearchParams(location.search).get('anis-samples');
    if (q !== null) localStorage.setItem('sifter-chat-samples', q === '0' ? '0' : '1');
    showSamples = !/^(off|false|0)$/.test(samples) && localStorage.getItem('sifter-chat-samples') !== '0';
  } catch { showSamples = !/^(off|false|0)$/.test(samples); }
  async function runSample(smp) {
    sampleOpen = false;
    for (const q of [...(smp.before || []), smp.q]) {
      while (busy) await new Promise((r) => setTimeout(r, 300));
      input = q;
      await send();
    }
  }

  // Ocean mark (public/ocean-noback.svg) — one path constant, used for header roundel,
  // launch bubble, header roundel and the watermark. Keeps the widget self-contained.
  const OCEAN_D = "M229.617 107.844h63.729c32.707 19.893 70.235 49.342 68.85 92.254 2.409 20.614-.603 40.628-7.23 59.5 14.578-3.727 28.01-6.01 39.997-6.01a43.446 43.446 0 0 1 24.756 6.13 27.385 27.385 0 0 1 11.445 23.018v2.405c-.663 14.965-10.361 28.188-23.914 40.629-10.12 9.315-19.095 15.625-28.01 21.695 1.928-.06 4.338-.36 6.145-.36a81.006 81.006 0 0 1 26.383 3.305 26.573 26.573 0 0 1 10.54 6.49 19.81 19.81 0 0 1 5.422 13.704 38.165 38.165 0 0 1-6.505 20.255 43.166 43.166 0 0 1-6.024 7.692 16.882 16.882 0 0 1-11.926 5.41 13.864 13.864 0 0 1-10.963-5.41c-2.71-3.546-3.072-7.332-3.072-9.436v-.54c0-2.044 1.204-3.788 2.108-5.59-1.205-.12-1.023-.3-2.83-.3-10.843 0-27.71 1.503-50.418 4.688-22.95 3.185-37.887 6.07-44.211 8.174l-.725.18a15.393 15.393 0 0 1-7.95 0c-3.252-.902-6.024-2.944-7.831-5.409-3.313-4.447-3.494-9.195-3.494-11.9a20.51 20.51 0 0 1 1.566-7.814 19.11 19.11 0 0 1 5.543-8.233 36.208 36.208 0 0 1 7.287-4.809c5-2.584 11.506-5.047 19.336-7.511a243.488 243.488 0 0 0 56.621-32.455c15.54-11.84 20.481-20.795 21.686-27.106-.904-.18-1.687-.662-6.807-.662-5.542 0-15.119 1.683-28.31 5.77-7.108 2.283-12.71 4.268-17.047 5.95a256.849 256.849 0 0 1-37.346 43.874c-21.504 23.92-47.586 43.272-76.68 57.035h-72.523c-20.54-13.943-41.14-29.569-52.465-52.527-4.88-9.015-9.639-18.031-14.156-27.227V260.38a199.873 199.873 0 0 1 25.119 36.963c8.794-51.146 36.323-95.322 61.32-139.436-37.044 25.062-54.092 66.654-74.572 104.758-5.903-24.04 9.938-46.038 22.588-64.91 32.045-37.022 66.38-75.666 114.568-89.91zm63.127 12.861v.06c-37.587 2.164-78.006 11.84-104.932 40.268-47.131 54.177-67.366 126.62-55.115 197.31 23.673 16.95 51.02 38.766 81.68 26.024 37.105-14.364 66.862-42.611 87.342-76.869a14.013 14.013 0 0 1-2.951-3.365c-1.928-3.186-2.652-6.972-2.05-10.578a22.862 22.862 0 0 1 3.495-11.3 22.695 22.695 0 0 1 9.879-8.413l.601-.24h.061l1.023-.602a114.014 114.014 0 0 0 4.096-2.523l.121-.122.24-.119 4.338-2.765a225.208 225.208 0 0 0 10.541-41.59c3.795-37.383 4.82-90.992-38.369-105.176zm-46.984 72.48h.06c23.065-.835 45.091 9.593 59.03 27.948-4.518 35.58-18.371 68.515-31.924 101.33-13.433.721-26.986 1.323-40.479 2.164a3207.925 3207.925 0 0 1 26.926-36.902c-13.432-4.448-26.805-8.835-40.178-13.643 7.048-12.32 14.457-24.581 21.926-36.842l-4.879-16.648c-15.42 2.704-30.9 4.99-46.38 7.574 12.107 25.483 25.057 50.723 33.189 77.95-10.481 0-20.902 0-31.323.12a94.64 94.64 0 0 0 52.225 43.274c-47.405 3.966-77.342-39.307-84.148-82.219l18.431-.121c-5.722-13.222-14.094-29.989-.3-41.649 16.974-19.906 41.637-31.664 67.824-32.335zm149.261 72.663a146.69 146.69 0 0 0-21.082 1.923 223.95 223.95 0 0 0-24.394 5.83h-.182a6.15 6.15 0 0 1-6.806-2.644 1.443 1.443 0 0 0-.18-.24c-.482-.541-.904-.541-1.506-.541-.207.033-.41.094-.601.18a65.533 65.533 0 0 0-4.82 2.404c-3.013 1.743-7.23 4.326-12.53 7.812-2.169 1.383-4.336 2.705-6.625 3.967l-.963.482v-.12l-.182.18a11.57 11.57 0 0 0-2.289 1.382l.06-.12-.24.241a9.27 9.27 0 0 0-.904.781l-.12.18a9.725 9.725 0 0 0-2.712 6.912l-.119.72a3.419 3.419 0 0 0 .3 2.405c.663 1.022 1.265.9 1.808.9a20.018 20.018 0 0 0 8.673-4.086 145.181 145.181 0 0 1 24.094-9.375l3.434-1.082c3.493-1.081 6.746-2.044 9.758-2.765a141.65 141.65 0 0 1 15.902-3.186c3.894-.509 7.83-.61 11.746-.3 1.412.06 2.82.201 4.217.421a15.08 15.08 0 0 1 6.324 2.405h.121a11.792 11.792 0 0 1 3.193 3.244l.059.06c.262.538.465 1.102.604 1.684.201.664.322 1.35.36 2.043a27.082 27.082 0 0 1-.421 4.627 35.647 35.647 0 0 1-3.312 9.496 64.663 64.663 0 0 1-6.807 9.918 108.934 108.934 0 0 1-17.108 15.746c-18.25 14.003-38.25 25.482-59.453 34.076-3.674 1.142-7.227 2.405-10.841 3.787-2.53.902-5.06 2.103-7.53 3.305a32.053 32.053 0 0 0-4.818 3.127c-.466.397-.89.84-1.266 1.322-.368.47-.654.998-.844 1.563a5.99 5.99 0 0 1-.24.6c-.421 1.021-.601 2.164-.601 3.245-.013.888.068 1.774.24 2.645.145.71.432 1.385.844 1.982.293.462.742.804 1.265.963a3.02 3.02 0 0 0 1.506-.06h.059c2.048-.661 4.519-1.322 7.47-2.043a277.898 277.898 0 0 1 10.059-2.104 882.727 882.727 0 0 1 44.936-6.611c8.673-1.082 17.347-1.803 26.021-2.404 3.614-.24 6.928-.301 9.94-.301a48.48 48.48 0 0 1 7.83.48c1.955.25 3.851.84 5.601 1.744.82.428 1.57.975 2.229 1.623a6.064 6.064 0 0 1 1.867 4.026v.422a9.539 9.539 0 0 1-.963 4.326 25.058 25.058 0 0 1-3.313 4.928c-.06.12-.242.3-.242.601v.602c.023.346.084.689.182 1.021.053.342.176.669.361.961.482.601.844.602 1.205.602.904 0 2.229-.782 3.313-1.864a32.522 32.522 0 0 0 4.217-5.529 34.165 34.165 0 0 0 3.433-7.031 23.033 23.033 0 0 0 1.203-6.611v-.121a9.458 9.458 0 0 0-.119-1.622v-.06c-.18-.721-.422-1.503-.844-2.104l-.24-.3-.06-.121c-.181-.361-.482-.66-.783-.961l-.362-.301a18.5 18.5 0 0 0-4.517-2.705l-.844-.42-1.205-.301a71.342 71.342 0 0 0-10.12-1.803l-.843-.119h-.602c-1.867-.18-3.854-.24-5.902-.3l-3.615-.061-2.711.06c-7.121.19-14.233.631-21.322 1.323l-3.916.359a6.024 6.024 0 0 1-6.446-4.207 5.508 5.508 0 0 1-.361-1.982c.008-.613.109-1.221.3-1.803l.061-.121.06-.24c.197-.495.46-.96.784-1.383l.361-.48c.362-.369.766-.691 1.205-.962l.301-.181 11.145-6.49a215.357 215.357 0 0 0 42.404-34.98 68.227 68.227 0 0 0 6.205-8.234 41.24 41.24 0 0 0 5-11.718v-.06c.254-1.188.415-2.394.48-3.606v-2.045a21.228 21.228 0 0 0-.421-3.965 12.678 12.678 0 0 0-5.3-8.416l-.482-.42-.603-.3c-.756-.451-1.54-.853-2.348-1.202l-.904-.361a24.918 24.918 0 0 0-3.674-1.141 58.193 58.193 0 0 0-10.24-.963z";

  // thin-line icons (Lucide-like, 1.75 stroke, currentColor): name → path data
  const ICON = {
    pen: ['M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6', 'M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z'],
    rail: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M9 3v18'],
    menu: ['M4 7h16', 'M4 12h16', 'M4 17h10'],
    search: ['M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z', 'm20 20-3.6-3.6'],
    history: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5', 'M12 7.5V12l3 2'],
    more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
    rename: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'],
    pin: ['M12 17v5', 'M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z'],
    share: ['M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7', 'm16 6-4-4-4 4', 'M12 2v13'],
    trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
    x: ['M6 6l12 12', 'M18 6 6 18'],
    link: ['M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7', 'M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'],
    expand: ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'],
    collapse: ['M4 14h6v6', 'M20 10h-6V4', 'M14 10l7-7', 'M3 21l7-7'],
    open: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
    unshare: ['M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7', 'M12 15V9', 'm3 3 18 18'],
    user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8z'],
    // theme icons, keyed by prefs.js THEMES
    light: ['M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z', 'M12 2v2', 'M12 20v2', 'm4.9 4.9 1.4 1.4', 'm17.7 17.7 1.4 1.4', 'M2 12h2', 'M20 12h2', 'm6.3 17.7-1.4 1.4', 'm19.1 4.9-1.4 1.4'],
    dark: ['M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.6 6.6 0 0 0 10.7 10.7z'],
    system: ['M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M8 20h8', 'M12 16v4'],
    copy: ['M10 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z', 'M5 16H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
    check: ['M20 6 9 17l-5-5'],
    cite: ['M4 6h11', 'M4 12h16', 'M4 18h9', 'M19 4v4', 'M17 6h4'],
    up: ['M7 10v11', 'M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 7A2 2 0 0 1 17.5 21H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9z'],
    down: ['M17 14V3', 'M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.6l2.3-7A2 2 0 0 1 6.5 3H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-2.8a2 2 0 0 0-1.8 1.1L12 22a3.1 3.1 0 0 1-3-3.9z'],
    retry: ['M3 12a9 9 0 1 0 9-9 9.8 9.8 0 0 0-6.7 2.7L3 8', 'M3 3v5h5'],
    quote: ['M4 11h5v6H4z', 'M4 11c0-3 1.5-5 4-6', 'M14 11h5v6h-5z', 'M14 11c0-3 1.5-5 4-6'],
    book: ['M4 19.5V5a2 2 0 0 1 2-2h14v15H6.5a2.5 2.5 0 0 0 0 5H20', 'M8 7h8'],
    talk: ['M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z', 'M19 11a7 7 0 0 1-14 0', 'M12 18v3'],
    speaker: ['M11 5 6 9H2v6h4l5 4V5z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14'],
    stop: ['M7 7h10v10H7z'],
    wave: ['M3 10v4', 'M7.5 6v12', 'M12 3v18', 'M16.5 7v10', 'M21 10v4'],
    compare: ['M4 4h7v16H4z', 'M13 4h7v16h-7z', 'M6.5 8h2', 'M15.5 8h2', 'M6.5 12h2', 'M15.5 12h2'],
  };
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const reveal = (node) => { queueMicrotask(() => node.scrollIntoView?.({ block: 'nearest' })); };
  const focusSel = (node) => { node.focus(); node.select(); };
  const focusIn = (node) => { queueMicrotask(() => node.querySelector('button.go, input, button')?.focus?.()); };
  const LS = () => { try { return localStorage; } catch { return { getItem: () => null, setItem() {}, removeItem() {} }; } };
  let cfg = $state(null);
  // on an Anís content page (window.anisPage, worker/anis/content-widget.js): the page it sits on; the widget opens on load only
  // when the reader left it open there, on a wide screen (page-context.js) — never on a first visit
  const pageCtx = typeof window !== 'undefined' ? pageContext(window.anisPage) : null;
  const wideNow = () => { try { return matchMedia('(min-width: 641px)').matches; } catch { return false; } };
  let open = $state(!!opened || (!!pageCtx && !fullscreen && startOpen({ remembered: loadOpen(LS(), token), wide: wideNow() })));   // `opened` = handed over open by the previous build's self-update
  let denied = $state(false);
  let messages = $state([]);        // {role, content, citations?, pending?, done?, lit?}
  let input = $state('');
  let busy = $state(false);
  let errorMsg = $state('');
  let bodyEl = $state(null);
  let inputEl = $state(null);
  let phase = $state('idle');       // idle | research | craft | streaming
  // Perception line (Claude-Code-style): the server's specific status ("Reading Gleanings…") replaces the stage
  // text; if the first words are slow, it rotates gently. The first token of the answer replaces all of it.
  let statusText = $state('');
  let serverStatus = false;   // a status line from the server (Anís narrates longer stages) is never overwritten by the generic WAITING lines
  const WAITING = ['Gathering the passages…', 'Weighing what the texts say…', 'Putting it into words…'];
  let statusTimer = null;
  function stopStatus() { if (statusTimer) { clearInterval(statusTimer); statusTimer = null; } }
  // the thinking sky: on from send to the first words, and again while a later research round runs (a status after text)
  let thinkSteps = $state(0), rethink = $state(false);
  const thinking = $derived(busy && (phase !== 'streaming' || rethink));
  const depth = $derived(thinkDepth(thinkSteps));
  const statusLine = $derived(statusText ? statusText
    : phase === 'craft' ? 'Composing…'
    : phase === 'deepening' ? 'Looking deeper into the library…'
    : phase === 'deepening-more' ? 'Still searching — combing the historical records…'
    : 'Searching the ocean of texts…');
  let muted = $state(false);
  try { muted = localStorage.getItem('sifter-chat-mute') === '1'; } catch { /* private mode */ }

  // ── Threads (Chad 11-13): many conversations, each its own transcript and its own conversationId at the edge
  // (threads.js). The fullscreen app shows them in a left rail (a drawer on a phone); the floating widget in an overlay.
  let threads = $state([]);            // [{id, title, updated, pinned?}] newest first
  let activeId = $state('');
  let railOpen = $state(true);         // fullscreen, wide: the rail shown (remembered)
  let drawerOpen = $state(false);      // fullscreen, narrow: the rail as a drawer
  let histOpen = $state(false);        // floating widget: the list as an overlay
  let tq = $state('');                 // search box
  let menuFor = $state('');            // thread whose ⋯ menu is open
  let renaming = $state(''), renameText = $state('');
  let confirmDel = $state('');
  try { railOpen = localStorage.getItem('anis-rail') !== '0'; } catch { /* private mode */ }
  // introduce once (Chad 11-14): a returning reader sees a quiet empty state and Anís never re-introduces itself (threads.js)
  let firstVisit = $state(isFirstVisit(LS(), token));
  const isFull = $derived(!!fullscreen && fullscreen !== '0');
  const shownThreads = $derived(groupThreads(filterThreads(threads, tq, (id) => (id === activeId ? messagesText(messages) : messagesText(loadMessages(LS(), token, id))))));
  function setActive(id) { activeId = id; try { localStorage.setItem(activeKey(token), id); } catch { /* ok */ } }
  // record the active thread in the index (it joins the list with its first question)
  function touchThread() {
    const q = firstQuestion(messages);
    if (!q || !activeId) return;
    const prev = threads.find((t) => t.id === activeId);
    const { index, dropped } = pruneThreads(upsertThread(threads, { id: activeId, title: prev?.title || threadTitle(q), updated: Date.now() }));
    dropped.forEach((id) => dropThreadData(LS(), token, id));
    threads = index;
    saveIndex(LS(), token, threads);
  }
  function closeLists() { drawerOpen = false; histOpen = false; menuFor = ''; renaming = ''; confirmDel = ''; }
  function selectThread(id) {
    if (busy) return;
    closeLists();
    if (id === activeId) return;
    setActive(id);
    messages = loadMessages(LS(), token, id);
    if (!messages.some((m) => m.role === 'user')) messages = greet();
    errorMsg = ''; onetap = onetap === 'offer' ? 'hidden' : onetap;
    scroll(true);
  }
  function railToggle() { railOpen = !railOpen; try { localStorage.setItem('anis-rail', railOpen ? '1' : '0'); } catch { /* ok */ } }
  function renameStart(t) { menuFor = ''; renaming = t.id; renameText = t.title; }
  function renameSave() {
    const title = renameText.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (renaming && title) { threads = threads.map((t) => (t.id === renaming ? { ...t, title } : t)); saveIndex(LS(), token, threads); }
    renaming = '';
  }
  function togglePin(t) { menuFor = ''; threads = threads.map((x) => (x.id === t.id ? { ...x, pinned: !x.pinned } : x)); saveIndex(LS(), token, threads); }
  function deleteThread(id) {
    confirmDel = ''; menuFor = '';
    threads = removeThread(threads, id); saveIndex(LS(), token, threads); dropThreadData(LS(), token, id);
    if (id === activeId) newConversation();
  }
  // a click anywhere outside the open ⋯ menu closes it (composedPath: the widget lives in a shadow root)
  $effect(() => {
    if (!menuFor) return;
    const away = (e) => { if (!e.composedPath().some((n) => n.classList?.contains('tr-menu') || n.classList?.contains('tr-more'))) menuFor = ''; };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  });
  // the drawer: focus moves in, Tab stays in, Esc / a swipe to the left closes it
  let drawerEl = $state(null);
  $effect(() => { if (drawerOpen && drawerEl) queueMicrotask(() => drawerEl.querySelector('.tl-new')?.focus()); });
  function trapTab(e) {
    if (e.key !== 'Tab' || !drawerOpen || !drawerEl) return;
    const f = [...drawerEl.querySelectorAll('button:not([disabled]), input, [tabindex="0"]')].filter((n) => n.offsetParent !== null);
    if (!f.length) return;
    const root = drawerEl.getRootNode(), at = root.activeElement;
    if (e.shiftKey && at === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && at === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
  let swipeX = null;
  const swipeStart = (e) => { swipeX = e.touches[0].clientX; };
  const swipeEnd = (e) => { if (swipeX != null && e.changedTouches[0].clientX - swipeX < -60) drawerOpen = false; swipeX = null; };
  // shortcuts inside the panel: ⌘/Ctrl+Shift+O → a new conversation; Esc closes the innermost layer first
  function shortcut(e) {
    if (e.key === 'Escape' && voiceOpen) { closeVoice(); return true; }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); if (!busy) newConversation(); return true; }
    if (e.key === 'Escape' && shareSheet) { shareSheet = null; return true; }
    if (e.key === 'Escape' && (menuFor || renaming || confirmDel)) { menuFor = ''; renaming = ''; confirmDel = ''; return true; }
    if (e.key === 'Escape' && (drawerOpen || histOpen)) { drawerOpen = false; histOpen = false; return true; }
    return false;
  }

  // Per-visitor session id (client-generated, persisted) — groups events into "conversations" for analytics.
  const sid = (() => {
    try {
      const k = `sifter-chat-sid:${token}`;
      let v = localStorage.getItem(k);
      if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).slice(0, 40); localStorage.setItem(k, v); }
      return v;
    } catch { return String(Date.now()); }
  })();
  // Fire-and-forget analytics beacon (never blocks or errors the UI).
  function track(type, meta) {
    try {
      const body = JSON.stringify({ token, sessionId: sid, events: [{ type, ts: Date.now(), ...(meta ? { meta } : {}) }] });
      const url = `${api}/api/v1/widget/events`;
      if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      else fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } catch { /* analytics must never break chat */ }
  }

  // P6: render at once from the cached config (or, full screen, defaults) — no network wait before the first paint; the live
  // config then refreshes cfg + the cache. A refused token (401/403/404) still closes the widget; a network failure after boot does not.
  $effect(() => {
    if (!token) return;
    const over = (c) => ({ ...c, ...(accent ? { accent } : {}), ...(name ? { name } : {}) });   // per-page overrides win (display + steering only)
    const mkGreet = (c) => () => { const hello = c.greetings?.length ? c.greetings[Math.floor(Math.random() * c.greetings.length)] : c.greeting;
      if (!firstVisit) return [{ role: 'assistant', content: '', done: true, quiet: true, followups: pickStarters() }];   // returning: the starters only
      return hello ? [{ role: 'assistant', content: hello, done: true, followups: pickStarters() }] : []; };
    let started = false;
    const start = (c) => {
      started = true; cfg = c; greet = mkGreet(c);
      { const st = openStore(LS(), token); threads = st.index; setActive(st.active); messages = loadMessages(LS(), token, st.active); }
      if (!messages.some((m) => m.role === 'user')) messages = greet();   // only a greeting kept → a fresh one (live facts, new starter pills)
      continueShared(); openFromUrl(); takeAsk();
      track('widget_load');
      maybeOfferOnetap();   // a restored transcript may already qualify — don't wait for the next answer
    };
    untrack(() => { const boot = bootConfig({ cached: loadConfig(LS(), token), name, accent, fullscreen: isFull }); if (boot) start(boot); });   // reads state: must not subscribe this effect
    fetch(`${api}/api/v1/widget/config/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(Object.assign(new Error(`config ${r.status}`), { refused: r.status >= 400 && r.status < 500 }))))
      .then((c) => {
        saveConfig(LS(), token, c);
        if (!started) return start(over(c));
        cfg = over(c); greet = mkGreet(c);
        if (!busy && !messages.some((m) => m.role === 'user')) messages = greet();
      })
      .catch((e) => { if (!started || e?.refused) denied = true; });
  });

  // P6 hand-off from the page's static shell ([data-anis-shell], a snapshot of this first view painted from the HTML): mount
  // calm (no entry animations — the view is already on screen), take a question tapped or text typed in the shell, then drop it.
  let calm = $state(typeof document !== 'undefined' && !!document.querySelector('[data-anis-shell]'));
  $effect(() => {
    if (!cfg || !calm) return;
    untrack(() => {
      const sh = document.querySelector('[data-anis-shell]');
      const typed = sh?.shadowRoot?.querySelector('textarea')?.value?.trim();
      const q = window.__anisPending; window.__anisPending = null;
      if (q && !busy) { input = q; send(); } else if (typed && !input) input = typed;
      requestAnimationFrame(() => requestAnimationFrame(() => { sh?.remove(); setTimeout(() => (calm = false), 800); }));
    });
  });

  const persist = () => { if (activeId) saveMessages(LS(), token, activeId, messages); touchThread(); };
  // streaming follows the bottom only while the reader is there; scrolling up lets go at once (follow.js). force = the reader's own act.
  let fol = null;
  const followBody = (node) => { fol = follower(node); queueMicrotask(() => fol?.scroll(true)); return { destroy() { fol?.detach(); fol = null; } }; };
  const scroll = (force) => queueMicrotask(() => fol?.scroll(force));

  // ── Sound: two synthesized notes, nothing else. Quiet, warm, muteable. No audio files. ──────────
  let actx = null;
  function tone(freq, dur, { gain = 0.04, at = 0, glide } = {}) {
    try {
      actx ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine';
      const t = actx.currentTime + at;
      o.frequency.setValueAtTime(freq, t);
      if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur * 0.8);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + dur + 0.05);
    } catch { /* audio is garnish, never an error */ }
  }
  const sndSend = () => { if (!muted) tone(720, 0.18, { glide: 380, gain: 0.05 }); };            // droplet
  const sndDone = () => { if (!muted) { tone(523.25, 0.4, { gain: 0.032 }); tone(784, 0.55, { at: 0.09, gain: 0.024 }); } }; // soft fifth
  // Reset controls. "New conversation" clears the visible thread. "Start over" also asks the server to forget
  // this visitor's companion relationship (memory, premises, exposures) — the seeker's right to begin again, and
  // how a tester resets Anis. The server deletes only the CALLER's own participant (same resolver as chat).
  let resetOpen = $state(false);
  // Book card (inline: this is a compiled custom element, no child components). Cover through the image worker, sized by srcset.
  function coverSrc(u, w) {
    const abs = /^https?:/.test(u) ? u : `${api.replace(/\/$/, '')}${u.startsWith('/') ? '' : '/'}${u}`;
    return coverAt(abs, w);   // the image service's own size parameter (a Star of the West scan on bahai-education.org/ix takes w=, not tr=)
  }
  // a speaker portrait cropped square on the face (the image service's fo-face), for the talk card
  function faceSrc(u, w) {
    const abs = /^https?:/.test(u) ? u : `${api.replace(/\/$/, '')}${u.startsWith('/') ? '' : '/'}${u}`;
    return `${abs}${abs.includes('?') ? '&' : '?'}tr=w-${w},h-${w},fo-face,q-80,e-sharpen`;
  }
  const noCover = (e) => e.currentTarget.closest('a')?.classList.add('nocover');   // a 404 cover → the drawn one
  const initial = (t) => (String(t || '').replace(/^(?:the|a|an)\s+/i, '').match(/[\p{Lu}\p{Ll}\p{Lt}\p{Lo}]/u)?.[0] || '·').toUpperCase();
  const mins = (s) => (s ? `${Math.max(1, Math.round(s / 60))} min` : null);
  const clock = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  // the talk card's own small player: one talk plays at a time; the track seeks; the time counts down
  function tpToggle(e) {
    const a = e.currentTarget.closest('.tp').querySelector('audio');
    if (!a.paused) return a.pause();
    e.currentTarget.getRootNode().querySelectorAll('.tp audio').forEach((x) => x !== a && x.pause());
    a.play();
  }
  const tpSync = (e) => e.currentTarget.closest('.tp').classList.toggle('on', !e.currentTarget.paused);
  function tpTick(e) {
    const a = e.currentTarget, w = a.closest('.tp'), d = a.duration || 0;
    w.style.setProperty('--p', d ? a.currentTime / d : 0);
    if (d) w.querySelector('.tp-time').textContent = clock(d - a.currentTime);
  }
  function tpSeek(e) {
    const w = e.currentTarget.closest('.tp'), a = w.querySelector('audio'), r = e.currentTarget.getBoundingClientRect();
    const go = () => { a.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * a.duration; };
    if (a.duration) go(); else { a.addEventListener('loadedmetadata', go, { once: true }); a.play(); }
  }
  // a passage card shows the quote: its quoted blocks leave the text
  const withoutQuote = (text) => String(text || '').replace(/^(?:>.*(?:\n|$))+/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  // The card shows the description; drop it from the reply text when the reply opens with it.
  function withoutBookLead(text, book) {
    const d = (book?.description || '').trim();
    if (!d || !text) return text;
    const t = text.trimStart();
    return t.startsWith(d) ? t.slice(d.length).trimStart() : text;
  }
  let greet = () => [];
  // a new thread: a fresh id (the edge keeps it apart), the greeting; it joins the list with its first question
  function newConversation() {
    if (busy) return;
    setActive(newThreadId()); messages = greet(); errorMsg = ''; resetOpen = false; closeLists(); tq = '';
    if (onetap === 'offer') onetap = 'hidden';
    setTimeout(() => inputEl?.focus(), 50);
  }
  async function startOver() {
    try { await fetch(`${api}/api/v1/companion`, { method: 'DELETE', credentials: 'include' }); } catch { /* local reset still happens */ }
    try { await fetch(`${api}/api/chat/bio?reader=${encodeURIComponent(sid)}`, { method: 'DELETE' }); } catch { /* the bio stays keyed to a retired id */ }
    try { localStorage.removeItem(`sifter-chat-sid:${token}`); } catch { /* private mode */ }
    newConversation();
  }
  // ── Reply actions (copy / share / cite / thumbs / retry; a question's copy / edit) — helpers in reply-actions.js ──
  let toastText = $state(''), toastTimer = null, copiedAt = $state(-1), editAt = $state(-1), editText = $state('');
  function toast(t) { toastText = t; clearTimeout(toastTimer); toastTimer = setTimeout(() => (toastText = ''), 1800); }
  async function clip(text, html) {
    try {
      if (html && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
        return true;
      }
    } catch { /* plain text below */ }
    try { await navigator.clipboard.writeText(text); return true; } catch { /* older browsers below */ }
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch { return false; }
  }
  async function copyMsg(mi) {
    const m = messages[mi];
    const ok = m.role === 'user' ? await clip(m.content) : await clip(plainReply(m.content), replyHtml(m.content));
    if (!ok) { toast('Could not copy'); return; }
    copiedAt = mi; setTimeout(() => { if (copiedAt === mi) copiedAt = -1; }, 1600); toast('Copied');
  }
  async function citeMsg(mi) {
    const list = referenceList(replySources(messages[mi]));
    toast(!list ? 'No sources linked' : (await clip(list)) ? 'Sources copied' : 'Could not copy');
  }
  // ── Share (P3): the server sanitizes a draft → the reader previews it (title editable) → Publish makes it public at
  // anis.oceanlibrary.com/d/<slug>. Nothing is public before the click; the owner key kept on the thread unpublishes it.
  let shareSheet = $state(null);   // { phase: prep | ready | publishing | done | error, scope, threadId, round?, slug?, title?, summary?, turns?, owner_key?, url?, error? }
  async function shareOpen(turns, scope, threadId, round = null) {
    if (!turns?.length) { toast('Nothing to share yet'); return; }
    menuFor = ''; histOpen = false;
    const sheet = { phase: 'prep', scope, threadId, round };
    shareSheet = sheet;
    try {
      const r = await fetch(`${api}/api/chat/share`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope, turns, conversation_id: threadId, ...(round ? { round } : {}) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.slug) throw new Error(j.error || 'Could not prepare this for sharing. Please try again.');
      if (shareSheet?.threadId === threadId && shareSheet.phase === 'prep') shareSheet = { ...sheet, ...j, phase: 'ready' };
    } catch (err) { if (shareSheet?.phase === 'prep') shareSheet = { ...sheet, phase: 'error', error: err.message }; }
  }
  const shareMsg = (mi) => shareOpen(answerTurns(messages, mi), 'answer', activeId, roundOf(messages, mi));
  const shareThread = (t) => shareOpen(shareTurns(t.id === activeId ? messages : loadMessages(LS(), token, t.id)), 'conversation', t.id);
  async function sharePublish() {
    const d = shareSheet;
    if (!d || d.phase !== 'ready') return;
    shareSheet = { ...d, phase: 'publishing', error: '' };
    try {
      const r = await fetch(`${api}/api/chat/share/publish`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: d.slug, owner_key: d.owner_key, title: d.title }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url) throw new Error(j.error);
      threads = addShare(threads, d.threadId, { slug: d.slug, url: j.url, key: d.owner_key, at: Date.now() }); saveIndex(LS(), token, threads);
      shareSheet = { ...d, phase: 'done', url: j.url, title: j.title };
      if (navigator.share && matchMedia('(hover: none)').matches) navigator.share({ title: j.title, url: j.url }).catch(() => {});
    } catch { shareSheet = { ...d, phase: 'ready', error: 'Could not publish. Please try again.' }; }
  }
  async function copyShareLink() { toast((await clip(shareSheet?.url || '')) ? 'Link copied' : 'Could not copy'); }
  async function unpublish(t) {
    menuFor = '';
    const results = await Promise.all((t.shares || []).map((x) => fetch(`${api}/api/chat/share/${encodeURIComponent(x.slug)}`, { method: 'DELETE',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner_key: x.key }) }).then((r) => r.ok || r.status === 404).catch(() => false)));
    if (results.every(Boolean)) { threads = dropShares(threads, t.id); saveIndex(LS(), token, threads); toast('Unpublished'); }
    else toast('Could not unpublish. Please try again.');
  }
  // the app opened from a shared discussion (/?from=<slug>, the /d/ page's "Continue" button) or a published one
  // (/?discuss=<slug>, worker/anis/discuss.js): a new thread that holds it
  async function continueShared() {
    if (!isFull || typeof location === 'undefined') return;
    const q = new URLSearchParams(location.search), kind = q.has('discuss') ? 'discuss' : 'from', slug = q.get(kind);
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(slug)) return;
    try { const u = new URL(location.href); u.searchParams.delete(kind); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch { /* ok */ }
    try {
      const r = await fetch(`${api}/api/chat/${kind === 'discuss' ? 'discuss' : 'share'}/${slug}`);
      const d = r.ok ? await r.json() : null, ms = fromShared(d);
      if (!ms.length) throw new Error('empty');
      setActive(newThreadId()); messages = ms; errorMsg = '';
      saveMessages(LS(), token, activeId, messages);
      threads = upsertThread(threads, { id: activeId, title: threadTitle(d.title || firstQuestion(ms)), updated: Date.now() }); saveIndex(LS(), token, threads);
      scroll(true); setTimeout(() => inputEl?.focus(), 50);
    } catch { toast('That discussion is no longer available'); }
  }
  // the app opened from the widget's "Open full Anís" (/?t=<thread>) or a content page's "Ask Anís about …" link in a new tab (/?ask=)
  function openFromUrl() {
    if (!isFull || typeof location === 'undefined') return;
    const t = threadParam(location.search), q = askParam(location.search);
    if (!t && !q) return;
    try { const u = new URL(location.href); u.searchParams.delete('t'); u.searchParams.delete('ask'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch { /* ok */ }
    const act = urlThreadAction(t, threads.some((x) => x.id === t) || loadMessages(LS(), token, t).length > 0);
    if (act === 'open') {
      setActive(t); messages = loadMessages(LS(), token, t);
      if (!messages.some((m) => m.role === 'user')) messages = greet();
      scroll(true);
    } else if (act === 'new') { newConversation(); if (!q) toast('That conversation isn’t on this device'); }   // never the previous thread passed off as the asked-for one
    if (q) askHere(q);
  }
  // "Ask about this …" / a page's "Ask Anís about …": in place; a thread already under way keeps its subject, so a new one starts
  function askHere(q) {
    if (!q || busy) return;
    if (!open) togglePanel();
    if (messages.some((m) => m.role === 'user')) newConversation();
    input = q; send();
  }
  // a click on a page's "Ask Anís about …" before the widget was ready (content-widget.js keeps it in window.__anisAsk)
  function takeAsk() {
    const q = typeof window !== 'undefined' && typeof window.__anisAsk === 'string' ? window.__anisAsk.trim().slice(0, 500) : '';
    if (!q) return;
    window.__anisAsk = '';
    askHere(q);
  }
  const fullHref = $derived(typeof location !== 'undefined' ? fullModeHref(location.host, activeId) : '/');
  // off the Anís host the expand control maximizes in place (same panel, same conversation, no navigation), remembered per
  // reader; Esc or the same button restores the floating panel; the host page doesn't scroll behind it (page-context.js)
  const expandHow = typeof location !== 'undefined' ? expandMode(location.host) : 'link';
  let maxed = $state(!fullscreen && expandHow === 'maximize' && loadMax(LS(), token));
  const isMax = $derived(open && maxed && !isFull);
  function toggleMax() { maxed = !maxed; saveMax(LS(), token, maxed); scroll(); }
  $effect(() => {
    if (!isMax) return;
    const de = document.documentElement, prev = de.style.overflow;
    de.style.overflow = 'hidden';
    return () => { de.style.overflow = prev; };
  });
  function voteMsg(mi, v) {
    const m = messages[mi], vote = m.vote === v ? 0 : v, qi = questionIndex(messages, mi);
    m.vote = vote; messages = [...messages]; persist();
    if (vote) toast('Thank you');
    fetch(`${api}/api/chat/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ conversation_id: activeId, round: roundOf(messages, mi), vote: vote === 1 ? 'up' : vote === -1 ? 'down' : 'none', question: qi >= 0 ? messages[qi].content : '' }) }).catch(() => {});
    track('answer_vote', { vote });
  }
  // retry a reply / send an edited question: the thread is cut back to that question and it is asked again
  function reask(mi, text) {
    if (busy) return;
    const r = rewind(messages, mi, text);
    if (!r) return;
    editAt = -1; messages = r.keep; input = r.ask; send();
  }
  function editStart(mi) { if (busy) return; editAt = mi; editText = messages[mi].content; }
  function editKey(e, mi) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); reask(mi, editText); }
    else if (e.key === 'Escape') { e.stopPropagation(); editAt = -1; }
  }
  const growEdit = (node) => { const fit = () => { node.style.height = 'auto'; node.style.height = `${node.scrollHeight}px`; }; fit(); node.focus(); node.addEventListener('input', fit); };

  function toggleMute() { muted = !muted; try { localStorage.setItem('sifter-chat-mute', muted ? '1' : '0'); } catch { /* ok */ } }

  // ── Paced streaming: words flow onto the page evenly, catching up if the buffer grows. ─────────
  let pendBuf = '', replay = '', gotLive = false, streamDone = false, pendCites = null, ticker = null, t0 = 0;
  function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }
  function step() {
    const last = messages[messages.length - 1];
    if (!last || !last.pending) { stopTicker(); return; }
    if (!pendBuf) { if (streamDone) finalize(); return; }
    let take = pendBuf.length > 900 ? 4 : pendBuf.length > 320 ? 2 : 1;   // adaptive: never trail far behind
    while (take-- > 0 && pendBuf) {
      const m = pendBuf.match(/^\s*\S+/);
      if (!m) { last.content += pendBuf; pendBuf = ''; break; }
      last.content += m[0];
      pendBuf = pendBuf.slice(m[0].length);
    }
    if (phase !== 'streaming') phase = 'streaming';
    messages = [...messages];
    scroll();
  }
  function finalize() {
    stopTicker();
    const last = messages[messages.length - 1];
    if (!last || !last.pending) return;
    if (pendBuf) { last.content += pendBuf; pendBuf = ''; }
    // The end-of-stream replay is the canonical reply (ungrounded links stripped server-side).
    if (gotLive && replay.trim()) last.content = replay;
    delete last.pending;
    last.done = true;
    if (!last.content) last.content = 'Sorry — I could not find an answer just now. Please try rephrasing.';
    // Illuminated drop cap only for settled, substantial prose that opens with a letter.
    if (last.content.length > 240 && /^[A-Za-zÀ-ɏ“"']/.test(last.content)) last.lit = true;
    if (pendCites) last.citations = pendCites;
    messages = [...messages];
    busy = false;
    phase = 'idle';
    persist();
    checkVersion();
    sndDone();
    track('answer_served', { latencyMs: Date.now() - t0, chars: last.content.length });
    maybeOfferOnetap();
    scroll();
  }

  // opts (voice, P5): { text, mode: 'audio', onSpeak(delta), onDone(err?) } — the spoken question, the reply's text as it streams
  // (to be spoken), the end of the stream. The written reply still lands in the thread as for any question.
  async function send(opts = {}) {
    if (opts instanceof Event) opts = {};
    const text = String(opts.text ?? input).trim();
    if (!text || busy) return false;
    if (opts.text == null) input = '';
    errorMsg = '';
    pendBuf = ''; replay = ''; gotLive = false; streamDone = false; pendCites = null;
    statusText = ''; serverStatus = false; stopStatus(); thinkSteps = 0; rethink = false;
    { let i = 0; statusTimer = setInterval(() => { if (!serverStatus && Date.now() - t0 > 3500) statusText = WAITING[i++ % WAITING.length]; }, 2200); }
    const first = firstVisit && !messages.some((m) => m.role === 'user');   // the one turn Anís may introduce itself on
    if (firstVisit) { firstVisit = false; markSeen(LS(), token); }
    messages = [...messages, { role: 'user', content: text }, { role: 'assistant', content: '', citations: [], pending: true }];
    persist();   // the question is kept (and the thread listed) even if the answer never comes
    busy = true;
    phase = 'research';
    sndSend();
    track('message_sent', { q: text.slice(0, 400) });
    t0 = Date.now();
    scroll(true);
    stopTicker();
    ticker = setInterval(step, 34);
    const history = messages.slice(0, -1).filter((m) => !m.pending && !m.quiet).map((m) => ({ role: m.role, content: m.content })).slice(-12);
    try {
      const res = await fetch(`${api}/api/chat/stream`, {
        method: 'POST',
        credentials: 'include',   // the anonymous session cookie IS the visitor's companion identity
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history, widget_token: token, conversationId: activeId, reader_id: sid,   // the device id: one indications bio per reader (worker/anis/bio.js)
          ...(name ? { name } : {}), ...(mission ? { mission } : {}),
          ...(cfg?.chatbotLocation ? { chatbot_location: cfg.chatbotLocation } : {}), ...(opts.mode ? { mode: opts.mode } : {}), ...(first ? { first_visit: true } : {}) }),
      });
      if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let ev; try { ev = JSON.parse(line.slice(6)); } catch { continue; }
          if (ev.type === 'stage' && ev.stage) { thinkSteps++; if (phase !== 'streaming') phase = ev.stage; else rethink = true; }
          else if (ev.type === 'status' && typeof ev.text === 'string') { statusText = ev.text; serverStatus = true; thinkSteps++; if (phase === 'streaming') rethink = true; }
          else if (ev.type === 'text' && typeof ev.content === 'string') { gotLive = true; rethink = false; stopStatus(); pendBuf += ev.content; opts.onSpeak?.(ev.content); }
          else if (ev.type === 'chunk' && typeof ev.text === 'string') { rethink = false; stopStatus(); if (gotLive) replay += ev.text; else { pendBuf += ev.text; opts.onSpeak?.(ev.text); } }
          else if (ev.type === 'book' && ev.book?.title) { const last = messages[messages.length - 1]; if (last?.role === 'assistant') { last.book = ev.book; messages = [...messages]; } }
          // the reply's quoted blockquotes → passage cards; the book(s) the answer is about (both drawn once the reply is complete)
          // one found passage (in_work / find_passage, code-built reply) → its card: cover (a Star of the West issue's own scan), the
          // passage, the citation (11-12: the widget dropped this event, so the right SoW answer showed no issue thumbnail)
          else if (ev.type === 'passage' && ev.passage?.excerpt) { const last = messages[messages.length - 1]; if (last?.role === 'assistant') { last.passages = [...(last.passages || []), ev.passage]; messages = [...messages]; } }
          else if (ev.type === 'quote_cards' && Array.isArray(ev.cards)) { const last = messages[messages.length - 1]; if (last?.role === 'assistant') { last.quoteCards = ev.cards; messages = [...messages]; } }
          else if (ev.type === 'widget' && ev.widget?.id) { const last = messages[messages.length - 1]; if (last?.role === 'assistant') { last.widgets = [...(last.widgets || []), ev.widget]; messages = [...messages]; } }
          // follow-up questions as pills under the last reply (Chad 11-12); a tap sends it
          else if (ev.type === 'followups' && Array.isArray(ev.items)) { const last = messages[messages.length - 1]; if (last?.role === 'assistant') { last.followups = ev.items; messages = [...messages]; } }
          // a talk found in the media library (talk_search): its card with a player
          else if (ev.type === 'talks' && Array.isArray(ev.talks)) { const last = messages[messages.length - 1]; if (last?.role === 'assistant') { last.talks = ev.talks; messages = [...messages]; } }
          else if (ev.type === 'books' && Array.isArray(ev.books)) { const last = messages[messages.length - 1]; if (last?.role === 'assistant') { last.books = ev.books; messages = [...messages]; } }
          else if (ev.type === 'citations' && Array.isArray(ev.citations)) { pendCites = ev.citations; }
          else if (ev.type === 'complete') { if (Array.isArray(ev.citations) && ev.citations.length) pendCites = ev.citations; streamDone = true; }
          else if (ev.type === 'error') { throw new Error(ev.message || 'assistant error'); }
        }
      }
      streamDone = true;   // ticker drains the buffer, then finalizes
      opts.onDone?.();
    } catch (e) {
      opts.onDone?.(e);
      stopTicker(); stopStatus();
      messages = messages.slice(0, -1);
      messages = [...messages];
      errorMsg = 'The library could not be reached just now.';
      busy = false;
      phase = 'idle';
      scroll();
    }
    return true;
  }

  // a source's own online page (Ocean of Lights, OceanLibrary …) first; our reader only when it has none (Chad 11-12); a source the reply already links is not repeated
  const linkBase = (u) => String(u || '').split('#')[0].split('?')[0].replace(/\/$/, '');
  function citationHref(c, content = '') {
    const own = /^https?:\/\//.test(c?.url || '') ? c.url : null;
    const u = own || (c?.document_id ? `https://siftersearch.com/document/${c.document_id}` : null);
    return u && !String(content).includes(linkBase(u)) ? u : null;
  }
  // Minimal, safe rich text: escape ALL html, then rebuild [text](https://…) links,
  // **bold**, *italics*, "> " blockquotes, "- " bullets and pipe tables (the crafter formats for
  // comprehension — blockquoted passages, bulleted lists, bolded key facts).
  function renderRich(t) {
    const esc = String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = (s) => richLinks(s)
      .replace(/\*\*([^*\n]{1,200})\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]{1,600})\*/g, '<em>$1</em>');   // 600: a ~30-word quotation fits (quotes.js LONG_QUOTE_WORDS)
    const lines = esc.split('\n');
    const out = [];
    let quoteRun = [];
    const flushQuote = () => {
      if (quoteRun.length) { out.push('<blockquote>' + quoteRun.join('<br>') + '</blockquote>'); quoteRun = []; }
    };
    let listRun = [];
    const flushList = () => { if (listRun.length) { out.push('<span class="ul">' + listRun.join('') + '</span>'); listRun = []; } };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i], table = tableAt(lines, i, inline);
      if (table) { flushQuote(); out.push(table.html); i = table.next - 1; continue; }
      const bq = line.match(/^\s*&gt;\s?(.*)$/);
      if (bq) { flushList(); quoteRun.push(inline(bq[1])); continue; }
      if (quoteRun.length) {   // the quote's "— Title, place" line joins the quote's last line, no gap (Chad 11-12)
        let j = i; while (j < lines.length && !lines[j].trim()) j++;
        if (/^\s*[—–]\s/.test(lines[j] || '')) { quoteRun[quoteRun.length - 1] += ' <span class="qref">' + inline(lines[j].trim()) + '</span>'; i = j; continue; }
      }
      flushQuote();
      const li = line.match(/^\s*[-•*]\s+(.*)$/), ol = !li && olItem(line);
      if (li) { listRun.push('<span class="li"><span class="b" aria-hidden="true">•</span>' + inline(li[1]) + '</span>'); continue; }
      if (ol) { listRun.push('<span class="li ol"><span class="b">' + ol.n + '.</span>' + inline(ol.text) + '</span>'); continue; }
      if (listRun.length && !line.trim()) continue;   // a blank line between items (a "loose" list) is no gap (Chad 11-13)
      flushList();
      const h = headingOf(line);   // "## Title" or a bold line alone is a heading: space above, tight to its text (Chad 11-03)
      out.push(h != null ? '<span class="h">' + inline(h) + '</span>' : inline(line));
    }
    flushQuote(); flushList();
    // never waste space (Chad 11-12): one blank line at most, none around a quote or a table (they carry their own margin)
    const html = out.join('\n').replace(/\n{2,}/g, '<span class="pg"></span>').replace(/\n+(<blockquote|<div class="rt"|<span class="ul"|<span class="h"|<span class="pg")/g, '$1').replace(/(<\/blockquote>|<\/div><\/div>|<span class="ul">.*?<\/span><\/span>|<span class="h">.*?<\/span>|<span class="pg"><\/span>)\n+/g, '$1').replace(/<span class="pg"><\/span>(?=<blockquote|<div class="rt"|<span class="ul"|<span class="h")|(<\/blockquote>|<\/div><\/div>|<\/span><\/span>|<span class="h">.*?<\/span>)<span class="pg"><\/span>/g, '$1').trim();
    return styleQuotes(html);   // quoted words styled apart from Anís's own (Chad 11-04)
  }
  // Query-prep (perceived speed): while the user types their FIRST question, debounce
  // partials to /api/chat/prep — a settled pause starts the answer pipeline server-side,
  // so it's often ready (or warming) by the time they press Enter. Fire-and-forget;
  // partials are never logged server-side.
  let prepTimer = null;
  function schedulePrep() {
    if (messages.some((m) => m.role === 'user')) return;   // opening question only
    clearTimeout(prepTimer);
    prepTimer = setTimeout(() => {
      const text = input.trim();
      if (text.split(/\s+/).length < 3) return;
      fetch(`${api}/api/chat/prep`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ partial: text, sessionId: sid, widget_token: token }),
        keepalive: true,
      }).catch(() => {});
    }, 300);
  }
  // ── One Tap connect ("establish a relationship"): after the 3rd exchange, offer email research
  // summaries via Google. The Google flow lives in an intermediate iframe on the API origin, so host
  // sites never register anything. Snoozed 14 days on "Not now"; remembered once connected. ─────────
  let onetap = $state('hidden');   // hidden | offer | iframe | done
  let connectedEmail = $state('');
  let connectedPic = $state('');
  let profileOpen = $state(false);
  try {
    connectedEmail = localStorage.getItem(`sifter-onetap:${token}`) || '';
    connectedPic = localStorage.getItem(`sifter-onetap-pic:${token}`) || '';
  } catch { /* private mode */ }
  const snoozeKey = () => `sifter-onetap-snooze:${token}`;
  function maybeOfferOnetap() {
    if (connectedEmail || onetap !== 'hidden') return;
    if (messages.filter((m) => m.role === 'user').length < 3) return;
    try { if (Number(localStorage.getItem(snoozeKey()) || 0) > Date.now() - 14 * 864e5) return; } catch { /* ok */ }
    onetap = 'offer';
    track('onetap_shown');
    scroll();
  }
  function onetapConnect() { onetap = 'iframe'; scroll(); }
  function onetapSnooze() {
    onetap = 'hidden';
    try { localStorage.setItem(snoozeKey(), String(Date.now())); } catch { /* ok */ }
    track('onetap_snoozed');
  }
  // Sign in: the One Tap offer, any time (no waiting for the 3rd-exchange invite); connected, it toggles the user menu.
  function profileClick() {
    if (connectedEmail) { profileOpen = !profileOpen; return; }
    profileOpen = false;
    onetap = onetap === 'hidden' || onetap === 'done' ? 'offer' : onetap;
    scroll();
  }
  function disconnectOnetap() {
    connectedEmail = ''; connectedPic = ''; profileOpen = false; onetap = 'hidden';
    try { localStorage.removeItem(`sifter-onetap:${token}`); localStorage.removeItem(`sifter-onetap-pic:${token}`); } catch { /* ok */ }
  }
  // ── The user menu (Chad 11-14): who you are, appearance, what Anís has noted about you. Full screen it opens from the rail's
  // foot (a popover; a bottom sheet on narrow screens, where the drawer closes first); the floating widget, from its header.
  let menuFrom = $state('rail');
  let bio = $state(null), bioErr = $state(false);   // bio: null = not loaded, [] = nothing noted (prefs.js bioRows)
  const bioUrl = () => `${api}/api/chat/bio?reader=${encodeURIComponent(sid)}`;
  async function loadBio() {
    bioErr = false;
    try { const r = await fetch(bioUrl()); if (!r.ok) throw new Error(String(r.status)); bio = bioRows(await r.json()); }
    catch { bio = null; bioErr = true; }
  }
  async function forgetBio() {
    try { const r = await fetch(bioUrl(), { method: 'DELETE' }); if (!r.ok) throw new Error(String(r.status)); bio = []; toast('Forgotten'); }
    catch { toast('Could not forget just now'); }
  }
  function userMenu(from) {
    menuFrom = from; profileOpen = !profileOpen; drawerOpen = false;
    if (profileOpen) loadBio();
  }
  function signIn() { profileOpen = false; profileClick(); }
  // theme: system (the OS decides) until the reader picks; the app shell applies the stored choice before first paint
  let theme = $state(loadTheme(LS()));
  const darkMq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  let sysDark = $state(!!darkMq?.matches);
  const dark = $derived(isDark(theme, sysDark));
  function setTheme(t) { theme = t; saveTheme(LS(), t); }
  $effect(() => {
    if (!darkMq?.addEventListener) return;
    const on = (e) => (sysDark = e.matches);
    darkMq.addEventListener('change', on);
    return () => darkMq.removeEventListener('change', on);
  });
  $effect(() => {   // full screen the widget is the page: the page behind it (overscroll, browser bar) follows the theme
    if (!isFull) return;
    const bg = dark ? '#0a162a' : '#f7f3ec', d = document.documentElement;
    d.style.colorScheme = dark ? 'dark' : 'light'; d.style.background = document.body.style.background = bg;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  });
  $effect(() => {
    const onMsg = (e) => {
      if (e.origin !== api || e.data?.type !== 'sifter-onetap') return;
      if (e.data.ok && e.data.email) {
        connectedEmail = e.data.email;
        connectedPic = e.data.picture || '';
        try {
          localStorage.setItem(`sifter-onetap:${token}`, connectedEmail);
          if (connectedPic) localStorage.setItem(`sifter-onetap-pic:${token}`, connectedPic);
        } catch { /* ok */ }
        onetap = 'done';
        track('onetap_connected');
        setTimeout(() => { onetap = 'hidden'; }, 6000);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  });

  // ── Voice (P5): dictation, read aloud, conversation. The runtime is a separate bundle (anis-voice.js) fetched on first use
  // (or on hover/focus of a voice button), so pages that never speak never load it. The audio element and AudioContext are
  // created inside the tap that asks for sound: iOS Safari plays nothing that was not unlocked by a gesture.
  const VOICE_V = typeof __VOICE_V__ !== 'undefined' ? __VOICE_V__ : '';
  const canMic = typeof navigator !== 'undefined' && !!(navigator.mediaDevices?.getUserMedia || (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)));
  const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  let voiceLoad = null, au = null;
  function loadVoice() {
    if (window.__anisVoice) return Promise.resolve(window.__anisVoice);
    return (voiceLoad ||= new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = `${api}/widget/anis-voice.js${VOICE_V ? `?v=${VOICE_V}` : ''}`; el.async = true;
      el.onload = () => (window.__anisVoice ? res(window.__anisVoice) : rej(new Error('voice')));
      el.onerror = () => { voiceLoad = null; rej(new Error('voice')); };
      document.head.appendChild(el);
    }));
  }
  const warmVoice = () => { loadVoice().catch(() => {}); };
  function unlockAudio() {
    if (!au) {
      const audio = new Audio(); audio.setAttribute('playsinline', ''); audio.preload = 'auto';
      let ctx = null; try { const C = window.AudioContext || window.webkitAudioContext; ctx = C ? new C() : null; } catch { ctx = null; }
      au = { audio, ctx, primed: false };
    }
    if (!au.primed) {
      au.primed = true;
      try { au.audio.src = SILENT; au.audio.play()?.catch(() => {}); } catch { /* no audio */ }
      try { if (window.speechSynthesis) window.speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch { /* no synthesis */ }
    }
    au.ctx?.resume?.()?.catch?.(() => {});
    return au;
  }
  let voiceErr = $state('');
  // dictation → the composer (the reader reviews and sends)
  let dictation = $state(null);
  async function dictate() {
    if (dictation) { dictation.stop(); return; }
    voiceErr = '';
    const a = unlockAudio(), base = input.trim();
    const join = (t) => (base ? `${base} ${t}` : t);
    let V;
    try { V = window.__anisVoice || await loadVoice(); } catch { voiceErr = 'Voice is unavailable just now.'; return; }
    dictation = V.dictate({ api, ctx: a.ctx,
      onInterim: (t) => { input = join(t); },
      onFinal: (t) => { input = join(t); },
      onError: (m) => { voiceErr = m; },
      onEnd: () => { dictation = null; inputEl?.focus(); } });
  }
  // read one reply aloud (the speaker in its action bar); a second tap stops
  let reading = $state(null);
  async function readMsg(mi) {
    const was = reading?.mi;
    reading?.h.stop(); reading = null;
    if (was === mi) return;
    const a = unlockAudio();
    let V;
    try { V = window.__anisVoice || await loadVoice(); } catch { voiceErr = 'Voice is unavailable just now.'; return; }
    const r = { mi, h: null };
    reading = r;
    r.h = V.readAloud({ api, audio: a.audio, md: plainReply(messages[mi]?.content || ''), onEnd: () => { if (reading === r) reading = null; } });
  }
  // hands-free conversation: a full-panel voice view
  let voiceOpen = $state(false), vState = $state('idle'), vText = $state(''), vLevel = $state(1), vHeard = $state(''), vSaid = $state('');
  let convo = null, orbEl = $state(null);
  const whenIdle = () => new Promise((res) => { const t = setInterval(() => { if (!busy) { clearInterval(t); res(); } }, 150); });
  async function openVoice() {
    reading?.h.stop(); reading = null; dictation?.stop();
    const a = unlockAudio();
    voiceOpen = true; vState = 'idle'; vText = ''; vHeard = ''; vSaid = ''; vLevel = 1;
    queueMicrotask(() => orbEl?.focus());
    let V;
    try { V = window.__anisVoice || await loadVoice(); } catch { vState = 'denied'; vText = 'Voice is unavailable just now.'; return; }
    if (!voiceOpen) return;
    convo = V.conversation({ api, audio: a.audio, ctx: a.ctx,
      onState: (st, t) => { vState = st; vText = t; if (st === 'listening') vSaid = ''; },
      onLevel: (l) => { vLevel = l; },
      onHeard: (t) => { vHeard = t; vSaid = ''; },
      onCaption: (t) => { vSaid = t; },
      ask: async (text, h) => {
        if (busy) await whenIdle();
        if (!voiceOpen) return;
        const sent = await send({ text, mode: 'audio', onSpeak: h.onText, onDone: h.onDone });
        if (sent === false) h.onDone();
      } });
  }
  function closeVoice() { convo?.close(); convo = null; voiceOpen = false; vLevel = 1; }
  $effect(() => { if (!open && voiceOpen) closeVoice(); });
  $effect(() => () => { convo?.close(); reading?.h.stop(); dictation?.stop(); });

  function onKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }
  // The panel is its own world: keys and wheel/touch never reach the host page (whose shortcuts, e.g. Space = play/pause,
  // can't see inside the shadow root and would act on keys typed here). Escape closes the panel here, since it no longer bubbles.
  function isolateKey(e) {
    if (shortcut(e)) { e.stopPropagation(); return; }
    if (e.key === 'Escape') { if (sampleOpen) sampleOpen = false; else if (isMax) toggleMax(); else if (!isFull) open = false; }
    trapTab(e);
    e.stopPropagation();
  }
  const isolate = (e) => e.stopPropagation();
  function contain(node) {   // Svelte attaches wheel/touchmove passively; preventDefault needs a non-passive listener
    node.addEventListener('wheel', containWheel, { passive: false });
    node.addEventListener('touchmove', isolate, { passive: true });
    return { destroy() { node.removeEventListener('wheel', containWheel); node.removeEventListener('touchmove', isolate); } };
  }
  function containWheel(e) {   // a wheel over the header/composer (nothing to scroll there) must not scroll the page behind
    e.stopPropagation();
    if (!e.composedPath().some((n) => n.classList?.contains('body'))) e.preventDefault();
  }
  // Self-update: an open tab can outlive a deploy. On open and after each answer the widget asks which build is current
  // (/widget/version, a few bytes); a different one is loaded beside it and swapped in once idle with nothing typed.
  // The transcript lives in localStorage, so the new build shows the same conversation; the panel stays as it was.
  let checkedAt = 0;
  async function checkVersion() {
    if (!BUILD || Date.now() - checkedAt < 60_000) return;
    checkedAt = Date.now();
    try {
      const v = (await (await fetch(`${api}/widget/version`, { cache: 'no-store' })).json())?.v;
      if (v && v !== BUILD) upgradeTo(v);
    } catch { /* offline: keep running this build */ }
  }
  function upgradeTo(v) {
    const host = $host();
    const swap = () => {
      if (busy || input.trim() || !host.isConnected) return setTimeout(swap, 5000);
      const el = document.createElement(tagFor(v));
      for (const a of host.attributes) if (a.name !== 'opened') el.setAttribute(a.name, a.value);
      if (open) el.setAttribute('opened', '1');
      host.replaceWith(el);
    };
    if (customElements.get(tagFor(v))) return swap();
    const s = document.createElement('script');
    s.src = `${api}/widget/sifter-chat.js?v=${v}`;
    s.async = true;
    s.onload = swap;
    document.head.appendChild(s);
  }
  $effect(() => {
    const vis = () => { if (document.visibilityState === 'visible') checkVersion(); };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  });

  let openedOnce = !!opened;
  function togglePanel() {
    open = !open;
    if (open) {
      checkVersion();
      scroll(true);
      setTimeout(() => inputEl?.focus(), 400);
      if (!openedOnce) { openedOnce = true; track('open'); }
    }
    if (pageCtx && !isFull) saveOpen(LS(), token, open);   // remembered per reader, content pages only
  }
  // Host pages can open Anis from their own UI (the SifterSearch home page does): dispatch
  //   window.dispatchEvent(new CustomEvent('sifter-chat:open', { detail: { q: 'optional question' } }))
  $effect(() => {
    const onOpen = (e) => {
      const q = e?.detail?.q;
      if (e?.detail?.send && typeof q === 'string' && q.trim()) { if (cfg) { window.__anisAsk = ''; askHere(q.trim().slice(0, 500)); } return; }   // not booted yet: start() takes window.__anisAsk
      if (typeof q === 'string' && q.trim()) input = q.trim().slice(0, 500);
      if (!open) togglePanel();
    };
    window.addEventListener('sifter-chat:open', onOpen);
    return () => window.removeEventListener('sifter-chat:open', onOpen);
  });
  // the sample menu closes on a click anywhere outside it (composedPath: the widget lives in a shadow root)
  let sampleEl = $state(null), sampleBtn = $state(null);
  $effect(() => {
    if (!sampleOpen) return;
    const away = (e) => { const path = e.composedPath(); if (!path.includes(sampleEl) && !path.includes(sampleBtn)) sampleOpen = false; };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  });
  $effect(() => {
    const esc = (e) => { if (open && shortcut(e)) return; if (e.key !== 'Escape') return; if (sampleOpen) sampleOpen = false; else if (isMax) toggleMax(); else if (open && !isFull) open = false; };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  });
</script>

{#snippet ic(name, cls = '')}
  <svg class="ic {cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{#each ICON[name] as d}<path {d} />{/each}</svg>
{/snippet}
{#snippet threadList()}
  <label class="tl-search">
    {@render ic('search')}
    <input type="search" placeholder="Search conversations" bind:value={tq} aria-label="Search conversations" autocomplete="off" spellcheck="false" />
  </label>
  <nav class="tl" aria-label="Conversation history">
    {#each shownThreads as g (g.label)}
      <h3 class="tl-g">{g.label}</h3>
      <ul>
        {#each g.items as t (t.id)}
          <li class="tr" class:on={t.id === activeId} class:open={menuFor === t.id}>
            {#if renaming === t.id}
              <input class="tr-edit" bind:value={renameText} use:focusSel onblur={renameSave} aria-label="Conversation title" maxlength="120"
                onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); renameSave(); } else if (e.key === 'Escape') { e.stopPropagation(); renaming = ''; } }} />
            {:else if confirmDel === t.id}
              <div class="tr-confirm" role="group" aria-label="Delete this conversation?">
                <span>Delete?</span>
                <button type="button" class="tr-no" onclick={() => (confirmDel = '')}>Cancel</button>
                <button type="button" class="tr-yes" use:reveal onclick={() => deleteThread(t.id)}>Delete</button>
              </div>
            {:else}
              <button type="button" class="tr-main" aria-current={t.id === activeId ? 'page' : undefined} disabled={busy && t.id !== activeId} title={t.title} onclick={() => selectThread(t.id)}>
                {#if t.pinned}{@render ic('pin', 'tr-pin')}{/if}<span class="tr-t">{t.title}</span>
              </button>
              <button type="button" class="tr-more" aria-label="Options for “{t.title}”" aria-haspopup="menu" aria-expanded={menuFor === t.id} onclick={() => (menuFor = menuFor === t.id ? '' : t.id)}>{@render ic('more', 'dots')}</button>
              {#if menuFor === t.id}
                <div class="tr-menu" role="menu" use:reveal>
                  <button type="button" role="menuitem" onclick={() => renameStart(t)}>{@render ic('rename')}Rename</button>
                  <button type="button" role="menuitem" onclick={() => togglePin(t)}>{@render ic('pin')}{t.pinned ? 'Unpin' : 'Pin'}</button>
                  <button type="button" role="menuitem" onclick={() => shareThread(t)}>{@render ic('share')}Share</button>
                  {#if t.shares?.length}<button type="button" role="menuitem" onclick={() => unpublish(t)}>{@render ic('unshare')}Unpublish</button>{/if}
                  <hr />
                  <button type="button" role="menuitem" class="danger" onclick={() => { menuFor = ''; confirmDel = t.id; }}>{@render ic('trash')}Delete</button>
                </div>
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="tl-empty">{tq.trim() ? 'No conversation matches.' : 'Your conversations will gather here.'}</p>
    {/each}
  </nav>
{/snippet}
{#snippet qcard(card, body)}
  <figure class="qcard">
    {#if card.cover_url}
      <a class="qcard-cover" href={card.url} target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">
        <img src={coverSrc(card.cover_url, 96)} srcset={[48, 96, 144].map((w) => `${coverSrc(card.cover_url, w)} ${w}w`).join(', ')} sizes="44px" alt="" loading="lazy" decoding="async" onerror={noCover} />
      </a>
    {/if}
    <div class="qcard-body">
      <div class="qcard-text">{@html body}</div>
      <p class="qcard-cite">— <a href={card.url} target="_blank" rel="noopener">{#if card.author}{`${card.author}, `}{/if}<em>{card.title}</em>{#if card.place}, {card.place}{/if}</a></p>
      {#if card.image}{@render plate(card.image)}{/if}
    </div>
  </figure>
{/snippet}
<!-- a card's picture (Dawn-Breakers plate, chosen by code: illustrations.js): the thumbnail opens the larger image; box reserved -->
{#snippet plate(img)}
  <figure class="plate">
    <a href={img.large} target="_blank" rel="noopener"><img src={img.thumb.src} srcset={img.thumb.srcset} sizes={img.thumb.sizes} width={img.thumb.width} height={img.thumb.height} alt={img.caption} loading="lazy" decoding="async" /></a>
    <figcaption>{img.caption} · Illustration from <em>The Dawn-Breakers</em></figcaption>
  </figure>
{/snippet}
{#snippet sceneCard(s)}
  <section class="scene">
    <div class="scene-head">
      {#if s.cover_url}
        <a class="qcard-cover" href={s.passages[0].url} target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">
          <img src={coverSrc(s.cover_url, 96)} srcset={[48, 96, 144].map((w) => `${coverSrc(s.cover_url, w)} ${w}w`).join(', ')} sizes="44px" alt="" loading="lazy" decoding="async" onerror={noCover} />
        </a>
      {/if}
      <div><h4 class="scene-title">{s.title}</h4>{#if s.line}<p class="scene-line">{s.line}</p>{/if}</div>
    </div>
    {#each s.passages as p}
      <figure class="scene-pass">
        <div class="qcard-text">{@html renderRich(p.text)}</div>
        <p class="qcard-cite">— <a href={p.url} target="_blank" rel="noopener">{#if p.author}{`${p.author}, `}{/if}<em>{p.title}</em>{#if p.place}, {p.place}{/if}</a></p>
      </figure>
    {/each}
    {#if s.image}{@render plate(s.image)}{/if}
  </section>
{/snippet}
{#snippet talkCard(t)}
  <article class="talk">
    <a class="talk-photo" href={t.url} target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">
      {#if t.portrait_url || t.thumb_url}
        <img src={faceSrc(t.portrait_url || t.thumb_url, 128)} srcset={[64, 96, 128, 192].map((w) => `${faceSrc(t.portrait_url || t.thumb_url, w)} ${w}w`).join(', ')}
          sizes="60px" alt="" loading="lazy" decoding="async" />
      {:else}<span class="talk-photo-i">{initial(t.speaker)}</span>{/if}
    </a>
    <div class="talk-body">
      <div class="talk-kicker">{['Talk', t.year, mins(t.duration_s)].filter(Boolean).join(' · ')}</div>
      <a class="talk-title" href={t.url} target="_blank" rel="noopener">{t.title}</a>
      {#if t.speaker}<div class="talk-speaker">{t.speaker}</div>{/if}
    </div>
    <div class="tp">
      {#if t.audio_url}
        <button class="tp-btn" type="button" aria-label="Play or pause {t.title}" onclick={tpToggle}>
          <svg class="i-play" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8z" fill="currentColor"/></svg>
          <svg class="i-pause" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3h2.6v10H4.5zM8.9 3h2.6v10H8.9z" fill="currentColor"/></svg>
        </button>
        <div class="tp-track" role="presentation" onclick={tpSeek}><i></i></div>
        <span class="tp-time">{clock(t.duration_s)}</span>
        <audio preload="none" src={t.audio_url} ontimeupdate={tpTick} onplay={tpSync} onpause={tpSync} onended={tpSync}></audio>
      {/if}
      <a class="tp-open" href={t.url} target="_blank" rel="noopener" title="Opens in a new tab">Open talk<svg class="ext" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="sr">(opens in a new tab)</span></a>
    </div>
  </article>
{/snippet}
{#snippet bookCard(b)}
  <article class="book">
    <a class="book-cover" class:nocover={!b.cover_url} href={b.url} target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">
      {#if b.cover_url}<img src={coverSrc(b.cover_url, 160)} srcset={[80, 120, 160, 240].map((w) => `${coverSrc(b.cover_url, w)} ${w}w`).join(', ')}
        sizes="64px" alt="" loading="lazy" decoding="async" onerror={noCover} />{/if}
      <span class="book-blank"><span class="book-blank-i">{initial(b.title)}</span><span class="book-blank-t">{b.title}</span></span>
    </a>
    <div class="book-meta">
      <div class="book-kicker">{['Book', b.year].filter(Boolean).join(' · ')}</div>
      <a class="book-title" href={b.url} target="_blank" rel="noopener">{b.title}</a>
      {#if b.author}<div class="book-by">{b.author}</div>{/if}
      {#if b.description}<p class="book-desc">{b.description}</p>{/if}
      {#if b.url}<a class="book-read" href={b.url} target="_blank" rel="noopener" title="Opens in a new tab">Read the book<svg class="ext" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="sr">(opens in a new tab)</span></a>{/if}
    </div>
  </article>
{/snippet}

{#if cfg && !denied}
  <div class="root {cfg.position === 'bottom-left' ? 'left' : 'right'}" class:calm class:dark class:full={!!fullscreen && fullscreen !== '0'} class:max={isMax} style="--accent:{cfg.accent}">
    {#if open}
      <section class="panel" class:railed={isFull && railOpen} aria-label="{cfg.name} chat" onkeydown={isolateKey} onkeyup={isolate} onkeypress={isolate} use:contain>
        {#if isFull}
          <div class="scrim" class:on={drawerOpen} aria-hidden="true" onclick={() => (drawerOpen = false)}></div>
          <aside class="rail" class:drawer={drawerOpen} bind:this={drawerEl} aria-label="Conversations" ontouchstart={swipeStart} ontouchend={swipeEnd}>
            <div class="rail-top">
              <button type="button" class="tl-new" disabled={busy} onclick={newConversation} title="New conversation ({isMac ? '⇧⌘O' : 'Ctrl+Shift+O'})">
                {@render ic('pen')}<span>New conversation</span><kbd>{isMac ? '⇧⌘O' : '⌃⇧O'}</kbd>
              </button>
              <button type="button" class="ricon r-collapse" onclick={railToggle} aria-label="Hide conversations" title="Hide conversations">{@render ic('rail')}</button>
              <button type="button" class="ricon r-close" onclick={() => (drawerOpen = false)} aria-label="Close conversations">{@render ic('x')}</button>
            </div>
            {@render threadList()}
            <div class="rail-foot">
              <button type="button" class="who" class:quiet={!connectedEmail} onclick={() => userMenu('rail')} aria-haspopup="dialog" aria-expanded={profileOpen} title="You and your preferences">
                {#if connectedEmail && connectedPic}<img class="who-pic" src={connectedPic} alt="" referrerpolicy="no-referrer" width="28" height="28" />{:else if connectedEmail}<span class="who-pic">{initial(connectedEmail)}</span>{:else}<span class="who-pic">{@render ic('user')}</span>{/if}
                <span class="who-t">{connectedEmail || 'You'}</span>
              </button>
              <button type="button" class="ricon" aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} aria-pressed={muted} onclick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
                <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4z" />
                  {#if muted}<path d="M16.5 9.5 21 14M21 9.5 16.5 14"/>{:else}<path d="M16.5 9a4.2 4.2 0 0 1 0 6M18.8 6.8a7.5 7.5 0 0 1 0 10.4"/>{/if}
                </svg>
              </button>
            </div>
          </aside>
        {/if}
        <div class="main" role={isFull ? 'main' : undefined}>   <!-- full screen it is the page's main content (one landmark); embedded, never -->
        <header>
          {#if isFull}
            <button type="button" class="icon h-menu" aria-label="Conversations" aria-expanded={drawerOpen} onclick={() => (drawerOpen = true)}>{@render ic('menu')}</button>
            {#if !railOpen}<button type="button" class="icon h-rail" aria-label="Show conversations" title="Show conversations" onclick={railToggle}>{@render ic('rail')}</button>{/if}
          {/if}
          <a class="roundel" href="https://oceanlibrary.com" target="_blank" rel="noopener" title="Open Ocean 2.0" aria-label="Open Ocean 2.0 (oceanlibrary.com) in a new tab"><svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d={OCEAN_D}/></svg></a>
          <span class="titles">
            <span class="title">{cfg.name}{#if version}<span class="ver" title={BUILD ? `widget ${BUILD}` : null}>v{version}</span>{/if}</span>
            <span class="subtitle">Ocean companion</span>
          </span>
          <span class="hbtns">
            {#if !isFull}
              <button type="button" class="icon" aria-label="Conversations" aria-expanded={histOpen} title="Conversations" onclick={() => { histOpen = !histOpen; menuFor = ''; }}>{@render ic('history')}</button>
            {/if}
            {#if showSamples}
              <button bind:this={sampleBtn} class="icon" aria-label="Sample questions" aria-haspopup="menu" aria-expanded={sampleOpen} disabled={busy} onclick={() => (sampleOpen = !sampleOpen)} title="Sample questions">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/></svg>
              </button>
              {#if sampleOpen}
                <div bind:this={sampleEl} class="sample-list" role="menu" tabindex="-1" onkeydown={(e) => { if (e.key === 'Escape') sampleOpen = false; }}>
                  {#each ANIS_SAMPLES as smp (smp.strategy)}
                    <button type="button" role="menuitem" class="sample-item" onclick={() => runSample(smp)}>
                      <span class="sample-label">{smp.label}</span>
                      <span class="sample-q">{smp.before ? `${smp.before[0]} → ` : ''}{smp.q}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            {/if}
            <button type="button" class="icon theme" aria-label="Theme: {theme} (change to {nextTheme(theme)})" title="Theme: {theme}" onclick={() => setTheme(nextTheme(theme))}>{@render ic(theme)}</button>
            {#if !isFull}<!-- full screen: the user menu opens from the rail's foot (Chad 11-14) -->
            <button class="icon profile" aria-label="You and your preferences" aria-haspopup="dialog" aria-expanded={profileOpen} onclick={() => userMenu('head')} title={connectedEmail || 'You and your preferences'}>
              {#if connectedEmail && connectedPic}
                <img class="pavatar" src={connectedPic} alt="" referrerpolicy="no-referrer" />
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              {/if}
            </button>
            <button class="icon" aria-label="New conversation" aria-haspopup="menu" aria-expanded={resetOpen} onclick={() => (resetOpen = !resetOpen)} title="New conversation">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            {#if resetOpen}
              <div class="pmenu" role="menu">
                <button class="pdisc" role="menuitem" onclick={newConversation}>New conversation</button>
                <button class="pdisc" role="menuitem" onclick={startOver} title="Forget what this companion has learned about you, then start fresh">Start over (forget me)</button>
              </div>
            {/if}
            {/if}
            {#if !isFull && expandHow === 'link'}<!-- Anís host: back to full mode with this conversation open (Chad 11-14); a real link: a new tab works too -->
            <a class="icon expand" href={fullHref} title="Open full Anís" aria-label="Open full Anís">{@render ic('expand')}</a>
            {:else if !isFull}<!-- any other site: maximize in place; the threads live in this site's storage and can't follow a link (Chad 11-14) -->
            <button type="button" class="icon expand" onclick={toggleMax} aria-pressed={isMax} aria-label={isMax ? 'Restore chat size' : 'Maximize chat'} title={isMax ? 'Restore (Esc)' : 'Maximize'}>{@render ic(isMax ? 'collapse' : 'expand')}</button>
            {/if}
            {#if !isFull}<!-- full screen is the app itself: nothing to minimise to (Chad 11-14) -->
            <button class="icon close" aria-label="Close chat" onclick={togglePanel}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
            {/if}
          </span>
        </header>
        <div class="rule" aria-hidden="true"></div>
        <div class="bodywrap">
          <svg class="watermark" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d={OCEAN_D}/></svg>
          <!-- the thinking sky: a faint constellation behind the conversation while Anís researches (think-sky.js); a still glow under reduced motion -->
          <div class="sky-glow" class:on={thinking} style="--depth:{depth.toFixed(2)}" aria-hidden="true"></div>
          <canvas class="sky" class:on={thinking} use:sky={{ on: thinking, depth }} aria-hidden="true"></canvas>
          {#if histOpen && !isFull}
            <div class="hist" role="dialog" aria-label="Conversations">
              <div class="hist-top">
                <span class="hist-t">Conversations</span>
                <button type="button" class="hist-new" disabled={busy} onclick={newConversation}>{@render ic('pen')}New</button>
                <button type="button" class="ricon" aria-label="Close conversations" onclick={() => (histOpen = false)}>{@render ic('x')}</button>
              </div>
              {@render threadList()}
            </div>
          {/if}
          <div class="body" bind:this={bodyEl} use:followBody role="log" aria-live="polite">
            {#if isFull && !messages.some((m) => m.role === 'user')}
              <section class="welcome" aria-labelledby="wl-h">
                {#if firstVisit}<span class="wl-mark" aria-hidden="true"><svg viewBox="0 0 512 512"><path fill="currentColor" d={OCEAN_D}/></svg></span>{/if}
                <h2 class="wl-h" id="wl-h">What shall we look into?</h2>
                {#if firstVisit}<p class="wl-sub">Ask about scripture, history or a talk. {cfg.name} searches the library and answers with the passages themselves.</p>{/if}<!-- the introduction: first visit only (Chad 11-14) -->
                <div class="wl-grid">
                  {#each ANIS_WELCOME as c (c.kind)}
                    <button type="button" class="wl-card" disabled={busy} onclick={() => { input = c.q; send(); }}>
                      <span class="wl-k">{@render ic(c.icon)}{c.kind}</span>
                      <span class="wl-q">{c.q}</span>
                    </button>
                  {/each}
                </div>
              </section>
            {:else}
            {#each messages as m, mi}
              <div class="msg {m.role}" class:done={m.done}>
                <div class="bubblewrap">
                  {#if m.book}{@render bookCard(m.book)}{/if}
                  {#if m.book?.sufficient && m.book.follow_up && m.role === 'assistant' && m.done}
                    <div class="bubble follow">{m.book.follow_up}</div>
                  {/if}
                  {#if !(m.book?.sufficient && m.role === 'assistant') && !m.quiet}
                  <div class="bubble" class:lit={m.lit} class:waiting={m.pending && !m.content}>
                    {#if m.role === 'assistant'}
                      {#if m.pending && !m.content}
                        <span class="think" role="status"><span class="think-dot" aria-hidden="true"></span>{#key statusLine}<span class="stage">{statusLine}</span>{/key}</span>
                      {:else}
                        {#each m.passages || [] as pc}
                          <figure class="qcard">
                            {#if pc.cover_url}
                              <a class="qcard-cover" href={pc.url} target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">
                                <img src={coverSrc(pc.cover_url, 96)} srcset={[48, 96, 144].map((w) => `${coverSrc(pc.cover_url, w)} ${w}w`).join(', ')} sizes="44px" alt="" loading="lazy" decoding="async" onerror={noCover} />
                              </a>
                            {/if}
                            <div class="qcard-body">
                              <div class="qcard-text">{@html renderRich(`“${pc.excerpt}”`)}</div>
                              <p class="qcard-cite">— {#if pc.url}<a href={pc.url} target="_blank" rel="noopener">{#if pc.author}{`${pc.author}, `}{/if}<em>{pc.title}</em>{#if pc.place}, {pc.place}{/if}</a>{:else}{#if pc.author}{`${pc.author}, `}{/if}<em>{pc.title}</em>{#if pc.place}, {pc.place}{/if}{/if}</p>
                              {#if pc.image}{@render plate(pc.image)}{/if}
                            </div>
                          </figure>
                        {/each}<!-- display widgets (side_by_side, quote, book, scene — the writer's inline templates): the reply's marker + fallback swapped for the component -->{#if m.widgets?.length}{#each widgetSegments(m.pending ? settled(m.content) : m.content, m.widgets) as ws}{#if ws.kind === 'widget' && ws.widget.kind === 'side_by_side'}<SideBySide widget={ws.widget} />{:else if ws.kind === 'widget' && ws.widget.kind === 'quote'}{@render qcard(ws.widget, renderRich(ws.widget.text))}{:else if ws.kind === 'widget' && ws.widget.kind === 'book'}{@render bookCard(ws.widget)}{:else if ws.kind === 'widget' && ws.widget.kind === 'scene'}{@render sceneCard(ws.widget)}{:else if ws.md?.trim()}{@html renderRich(ws.md.trim())}{/if}{/each}
                        {:else if m.quoteCards?.length && !m.pending}
                          {#each quoteSegments(m.content, m.quoteCards) as seg}
                            {#if seg.kind === 'quote'}
                              {@render qcard(seg.card, renderRich(seg.body))}
                            {:else}{@html renderRich(seg.md)}{/if}
                          {/each}
                        {:else}
                        {@html renderRich((m.pending ? settled : (x) => x)(m.book ? withoutBookLead(m.content, m.book) : m.passages?.length && !m.pending ? withoutQuote(m.content) : m.content))}{#if m.pending}<span class="caret" aria-hidden="true"></span>{/if}
                        {/if}
                      {/if}
                    {:else if editAt === mi}<textarea class="edit" bind:value={editText} use:growEdit onkeydown={(e) => editKey(e, mi)} aria-label="Edit your question"></textarea><span class="edit-btns"><button type="button" class="eb" onclick={() => (editAt = -1)}>Cancel</button><button type="button" class="eb go" disabled={!editText.trim()} onclick={() => reask(mi, editText)}>Send</button></span>
                    {:else}{m.content}{/if}
                  </div>
                  {/if}
                  {#if m.pending && m.content && rethink}<span class="think again" role="status"><span class="think-dot" aria-hidden="true"></span>{#key statusLine}<span class="stage">{statusLine}</span>{/key}</span>{/if}
                  {#each m.talks || [] as t (t.slug)}{@render talkCard(t)}{/each}
                  {#each m.books || [] as b (b.id)}{@render bookCard(b)}{/each}
                  <!-- no source pills (Chad 11-12): the reply's citations are its links; the cards show the books -->
                  {#if m.role === 'user' && editAt !== mi}
                    <div class="acts qa">
                      <button type="button" class="act" aria-label="Copy question" title="Copy" onclick={() => copyMsg(mi)}>{@render ic(copiedAt === mi ? 'check' : 'copy')}</button>
                      <button type="button" class="act" aria-label="Edit question" title="Edit" disabled={busy} onclick={() => editStart(mi)}>{@render ic('rename')}</button>
                    </div>
                  {:else if m.role === 'assistant' && m.done && !m.pending && mi > 0 && questionIndex(messages, mi) >= 0}
                    <div class="acts" class:last={mi === messages.length - 1} role="toolbar" aria-label="Reply actions">
                      <button type="button" class="act" aria-label="Copy reply" title="Copy" onclick={() => copyMsg(mi)}>{@render ic(copiedAt === mi ? 'check' : 'copy')}</button>
                      <button type="button" class="act" aria-label="Share this answer" title="Share" onclick={() => shareMsg(mi)}>{@render ic('share')}</button>
                      <button type="button" class="act" aria-label="Copy sources" title="Copy sources" onclick={() => citeMsg(mi)}>{@render ic('cite')}</button>
                      <button type="button" class="act" class:on={reading?.mi === mi} aria-pressed={reading?.mi === mi} aria-label={reading?.mi === mi ? 'Stop reading' : 'Read aloud'} title={reading?.mi === mi ? 'Stop' : 'Read aloud'} onclick={() => readMsg(mi)} onpointerenter={warmVoice}>{@render ic(reading?.mi === mi ? 'stop' : 'speaker')}</button>
                      <span class="act-gap" aria-hidden="true"></span>
                      <button type="button" class="act" class:on={m.vote === 1} aria-label="Good answer" aria-pressed={m.vote === 1} title="Good answer" onclick={() => voteMsg(mi, 1)}>{@render ic('up')}</button>
                      <button type="button" class="act" class:on={m.vote === -1} aria-label="Poor answer" aria-pressed={m.vote === -1} title="Poor answer" onclick={() => voteMsg(mi, -1)}>{@render ic('down')}</button>
                      {#if mi === messages.length - 1}<button type="button" class="act" aria-label="Ask again" title="Ask again" disabled={busy} onclick={() => reask(mi)}>{@render ic('retry')}</button>{/if}
                    </div>
                  {/if}
                  {#if (m.followups?.length || pageCtx) && !m.pending && mi === messages.length - 1}
                    <div class="nextq">{#if pageCtx && !messages.some((x) => x.role === 'user')}<button type="button" class="page-ask" disabled={busy} onclick={() => askHere(askQuestion(pageCtx))}>{askLabel(pageCtx)}</button>{/if}{#each m.followups || [] as q}<button type="button" disabled={busy} onclick={() => { input = q; send(); }}>{q}</button>{/each}</div>
                  {/if}
                </div>
              </div>
            {/each}
            {/if}
            {#if errorMsg}<div class="error" role="alert"><span>{errorMsg}</span>{#if messages.at(-1)?.role === 'user'}<button type="button" class="err-retry" onclick={() => reask(messages.length - 1)}>{@render ic('retry')}Try again</button>{/if}</div>{/if}
            {#if onetap !== 'hidden'}
              <div class="onetap" role="region" aria-label="Email research summaries">
                {#if onetap === 'offer'}
                  <div class="obtns">
                    <p>Get a <strong>summary</strong> of your research by email</p>
                    <button class="oconnect" onclick={onetapConnect}>Connect with Google</button>
                    <button class="olater" onclick={onetapSnooze}>Not now</button>
                  </div>
                {:else if onetap === 'iframe'}
                  <iframe title="Connect with Google" class="oframe" allow="identity-credentials-get"
                    src="{api}/widget/onetap?key={encodeURIComponent(token)}&session={encodeURIComponent(sid)}"></iframe>
                  <button class="olater" onclick={onetapSnooze}>Cancel</button>
                {:else if onetap === 'done'}
                  <p class="odone">✓ Connected as <strong>{connectedEmail}</strong> — you'll receive research summaries.</p>
                {/if}
              </div>
            {/if}
          </div>
        </div>
        {#if toastText}<div class="toast" role="status">{@render ic('check')}{toastText}</div>{/if}
        {#if shareSheet}
          <div class="share-scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget && shareSheet?.phase !== 'publishing') shareSheet = null; }}>
            <div class="share" role="dialog" aria-modal="true" aria-labelledby="share-h" use:focusIn>
              <header class="share-top">
                <h2 id="share-h">{shareSheet.phase === 'done' ? 'Published' : shareSheet.scope === 'answer' ? 'Share this answer' : 'Share this conversation'}</h2>
                <button type="button" class="icon" aria-label="Close" onclick={() => (shareSheet = null)}>{@render ic('x')}</button>
              </header>
              {#if shareSheet.phase === 'prep'}
                <p class="share-note share-wait"><span class="share-spin" aria-hidden="true"></span>Removing personal details…</p>
              {:else if shareSheet.phase === 'error'}
                <p class="share-note" role="alert">{shareSheet.error}</p>
                <div class="share-btns"><button type="button" class="sb" onclick={() => (shareSheet = null)}>Close</button></div>
              {:else if shareSheet.phase === 'done'}
                <p class="share-note">Anyone with the link can read it. Unpublish any time from the conversation’s ⋯ menu.</p>
                <div class="share-link"><span>{shareSheet.url}</span></div>
                <div class="share-btns">
                  <a class="sb" href={shareSheet.url} target="_blank" rel="noopener">{@render ic('open')}Open</a>
                  <button type="button" class="sb go" onclick={copyShareLink}>{@render ic('link')}Copy link</button>
                </div>
              {:else}
                <label class="share-label" for="share-title">Title</label>
                <input id="share-title" class="share-title" bind:value={shareSheet.title} maxlength="120" disabled={shareSheet.phase === 'publishing'} />
                {#if shareSheet.summary}<p class="share-sum">{shareSheet.summary}</p>{/if}
                <p class="share-note">Personal details are replaced with [brackets]. Check the preview, then publish.</p>
                <div class="share-prev">
                  {#each shareSheet.turns as t}
                    {#if t.role === 'user'}<p class="sp-q">{t.content}</p>{:else}<div class="sp-a">{@html replyHtml(t.content)}</div>{/if}
                  {/each}
                </div>
                {#if shareSheet.error}<p class="share-note share-err" role="alert">{shareSheet.error}</p>{/if}
                <div class="share-btns">
                  <button type="button" class="sb" onclick={() => (shareSheet = null)}>Cancel</button>
                  <button type="button" class="sb go" disabled={shareSheet.phase === 'publishing' || !shareSheet.title?.trim()} onclick={sharePublish}>{shareSheet.phase === 'publishing' ? 'Publishing…' : 'Publish'}</button>
                </div>
              {/if}
            </div>
          </div>
        {/if}
        {#if voiceErr}<p class="verr" role="alert"><span>{voiceErr}</span><button type="button" aria-label="Dismiss" onclick={() => (voiceErr = '')}>{@render ic('x')}</button></p>{/if}
        <footer>
          <textarea
            rows="1"
            placeholder={cfg.placeholder}
            bind:value={input}
            bind:this={inputEl}
            onkeydown={onKey}
            oninput={schedulePrep}
            disabled={busy}
            aria-label="Your question"
          ></textarea>
          {#if canMic}
            <button type="button" class="mic" class:on={!!dictation} aria-pressed={!!dictation} aria-label={dictation ? 'Stop dictation' : 'Dictate'} title={dictation ? 'Stop' : 'Dictate'}
              disabled={busy && !dictation} onclick={dictate} onpointerenter={warmVoice} onfocus={warmVoice}>{@render ic(dictation ? 'stop' : 'talk')}</button>
          {/if}
          {#if canMic && !input.trim() && !dictation}
            <button type="button" class="send talk" onclick={openVoice} onpointerenter={warmVoice} onfocus={warmVoice} aria-label="Voice conversation" title="Voice conversation">{@render ic('wave')}</button>
          {:else}
          <button class="send" onclick={() => send()} disabled={busy || !input.trim()} aria-label="Send">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 11.2 20.2 3.4c.8-.4 1.6.5 1.2 1.3l-7.8 16.8c-.4.8-1.6.7-1.9-.2l-2-6.6a1 1 0 0 0-.7-.7l-6.6-2c-.9-.3-.9-1.5 0-1.9z" transform="rotate(3 12 12)"/></svg>
          </button>
          {/if}
        </footer>
        </div>
        {#if voiceOpen}
          <div class="voice" data-state={vState} role="dialog" aria-modal="true" aria-label="Voice conversation">
            <button type="button" class="v-close" aria-label="End voice conversation" title="Close" onclick={closeVoice}>{@render ic('x')}</button>
            <div class="v-stage">
              <button type="button" class="orb" bind:this={orbEl} style="--lvl:{vLevel}" aria-label={vState === 'paused' ? 'Resume' : 'Pause'}
                disabled={vState === 'denied' || vState === 'idle'} onclick={() => convo?.pause()}>
                <span class="orb-halo" aria-hidden="true"></span><span class="orb-core" aria-hidden="true"></span>
              </button>
              <p class="v-state" aria-live="polite">{vText}</p>
            </div>
            <div class="v-text">
              {#if vHeard}<p class="v-q">{vHeard}</p>{/if}
              {#if vSaid}<p class="v-a">{vSaid}</p>{/if}
            </div>
          </div>
        {/if}
        {#if profileOpen}
          <div class="um-scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) profileOpen = false; }}>
            <div class="um {menuFrom === 'head' ? 'from-head' : 'from-rail'}" role="dialog" aria-modal="true" aria-labelledby="um-h" tabindex="-1" use:focusIn
              onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); profileOpen = false; } }}>
              <h2 id="um-h" class="um-title">You</h2>
              <div class="um-who">
                {#if connectedEmail && connectedPic}<img class="who-pic" src={connectedPic} alt="" referrerpolicy="no-referrer" width="28" height="28" />{:else if connectedEmail}<span class="who-pic">{initial(connectedEmail)}</span>{:else}<span class="who-pic quiet">{@render ic('user')}</span>{/if}
                <span class="um-id">
                  <span class="um-name">{connectedEmail || 'Not signed in'}</span>
                  <span class="um-note">{connectedEmail ? 'Receiving research summaries by email' : 'Sign in to receive research summaries by email'}</span>
                </span>
                {#if connectedEmail}<button type="button" class="um-btn" onclick={disconnectOnetap}>Sign out</button>{:else}<button type="button" class="um-btn go" onclick={signIn}>Sign in</button>{/if}
              </div>
              <div class="um-sec">
                <h3 class="um-h" id="um-ap">Appearance</h3>
                <div class="um-seg" role="radiogroup" aria-labelledby="um-ap">
                  {#each ['system', 'light', 'dark'] as t (t)}
                    <button type="button" role="radio" aria-checked={theme === t} class:on={theme === t} onclick={() => setTheme(t)}>{@render ic(t)}{t[0].toUpperCase() + t.slice(1)}</button>
                  {/each}
                </div>
                <button type="button" class="um-row" role="switch" aria-checked={!muted} onclick={toggleMute}>Sounds<span class="um-sw" class:on={!muted} aria-hidden="true"></span></button>
              </div>
              <div class="um-sec">
                <h3 class="um-h">What {cfg.name} knows about me</h3>
                {#if bio === null}
                  <p class="um-note">{bioErr ? 'Could not load this just now.' : 'Loading…'}</p>
                {:else if !bio.length}
                  <p class="um-note">Nothing yet. When you mention your tradition, your interests or how deeply you read, {cfg.name} notes it here so answers fit you.</p>
                {:else}
                  <ul class="um-bio">
                    {#each bio as b, i (i)}<li><span class="um-k">{b.label}</span> {b.value}{#if b.evidence}<q>{b.evidence}</q>{/if}</li>{/each}
                  </ul>
                  <button type="button" class="um-btn danger" onclick={forgetBio}>Forget this</button>
                {/if}
              </div>
              <div class="um-sec um-foot">
                <button type="button" class="um-link" onclick={() => { profileOpen = false; startOver(); }} title="Forget what {cfg.name} has learned about you, then start fresh">Start over (forget me)</button>
              </div>
            </div>
          </div>
        {/if}
      </section>
    {:else}
      <button class="bubble-btn" aria-label="Open {cfg.name} chat" aria-expanded="false" onclick={togglePanel}>
        <svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d={OCEAN_D}/></svg>
      </button>
    {/if}
  </div>
{/if}

<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .root {
    position: fixed; bottom: 20px; z-index: 2147483000;
    display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
    --serif: 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif;
    --gold: #c8a24b;
    --gold-soft: #e7d5a4;
    --panel-bg: #f9f6f0;   /* solid panel colour: what a sticky strip sits on */
    --quote: #6b4a2b;   /* = global.css --quote / quote-style.js QUOTE_INK */
    --accent-deep: color-mix(in srgb, var(--accent) 72%, #14273a);
    --halo: color-mix(in srgb, var(--accent) 28%, transparent);
    /* the conversations rail / history overlay */
    --rail-bg: #f4f0e7; --rail-card: #fffdf8; --rail-ink: #2a2620; --rail-muted: #8b806c; --rail-line: #e5ddcb;
    --rail-hover: rgba(110, 84, 30, .065); --rail-hover2: rgba(110, 84, 30, .11); --gold-ink: #a8822c; --danger: #b03a2e;
    --menu-shadow: 0 14px 34px -10px rgba(40, 28, 8, .3), 0 2px 6px rgba(40, 28, 8, .08);
    /* voice (P5): the conversation view, the composer's mic */
    --voice-bg: radial-gradient(120% 90% at 50% 36%, #fffdf8, #f2ebdc 72%); --voice-ink: #2a2620;
    --mic-bg: #fffefb; --mic-line: #ddd5c2; --mic-ink: #6b6253;
  }
  .root.right { right: 20px; }
  .root.left { left: 20px; align-items: flex-start; }

  /* One Tap invite — a slim strip pinned to the bottom of the conversation, never a big card at the top (Chad 11-13) */
  .onetap {
    position: sticky; bottom: 0; margin-top: auto; z-index: 2;
    padding: 6px 10px; border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--gold) 35%, transparent);
    background: color-mix(in srgb, var(--gold) 8%, var(--panel-bg));
    animation: fadeup .45s ease both;
  }
  .onetap p { margin: 0; flex: 1; min-width: 0; font-family: var(--serif); font-size: 13px; line-height: 1.3; }
  .onetap .odone { margin: 0; color: var(--gold); }
  .obtns { display: flex; gap: 8px; align-items: center; }
  .oconnect {
    border: 0; border-radius: 999px; padding: 4px 11px; cursor: pointer; white-space: nowrap;
    background: var(--accent-deep); color: #fff; font-size: 12px; font-weight: 600;
  }
  .oconnect:hover { filter: brightness(1.12); }
  .olater { border: 0; background: none; color: inherit; opacity: .6; cursor: pointer; font-size: 12px; white-space: nowrap; padding: 0 2px; }
  .olater:hover { opacity: .9; }
  .oframe { width: 100%; height: 120px; border: 0; display: block; background: transparent; }
  @keyframes fadeup { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

  /* Header profile: avatar when connected, person icon otherwise; small popover for disconnect */
  .icon.profile { position: relative; overflow: hidden; }
  .pavatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }
  .pmenu {
    position: absolute; top: 52px; right: 46px; z-index: 5;
    background: var(--accent-deep); border: 1px solid color-mix(in srgb, var(--gold) 40%, transparent);
    border-radius: 10px; padding: 10px 14px; min-width: 200px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, .35);
    animation: fadeup .25s ease both;
  }
  .pdisc {
    border: 1px solid color-mix(in srgb, #fff 25%, transparent); background: none; color: #fff;
    border-radius: 999px; padding: 4px 12px; font-size: 12px; cursor: pointer; opacity: .85;
  }
  .pdisc:hover { opacity: 1; }

  /* ── Launch bubble: Ocean mark, gentle breathing. Hidden while the panel is open. ── */
  .bubble-btn {
    width: 58px; height: 58px; border-radius: 50%; border: none; cursor: pointer;
    background: linear-gradient(140deg, var(--accent), var(--accent-deep));
    color: #fff; padding: 13px;
    animation: floaty 5.5s ease-in-out infinite, arrive .3s cubic-bezier(.22,1,.36,1);
  }
  .bubble-btn svg { width: 100%; height: 100%; display: block; opacity: .95; }
  .bubble-btn:hover { animation-play-state: paused; filter: brightness(1.1); }
  @keyframes floaty {
    0%, 100% { transform: translateY(0) scale(1); box-shadow: 0 5px 18px var(--halo), 0 3px 9px rgba(0,0,0,.25); }
    50% { transform: translateY(-3px) scale(1.03); box-shadow: 0 13px 30px var(--halo), 0 5px 13px rgba(0,0,0,.28); }
  }

  /* ── Panel ── */
  .panel {
    position: relative;
    width: min(720px, calc(100vw - 40px)); height: min(760px, calc(100vh - 96px));
    background: linear-gradient(178deg, #fdfcf8, #f7f3ec);
    color: #24211c; border-radius: 16px; overflow: hidden;
    display: flex; flex-direction: row;
    overscroll-behavior: contain;
    box-shadow: 0 18px 60px rgba(15, 25, 40, .30), 0 4px 16px rgba(15, 25, 40, .18);
    animation: rise .42s cubic-bezier(.22,1,.36,1);
  }
  @keyframes rise { from { opacity: 0; transform: translateY(16px) scale(.975); } }
  @keyframes arrive { from { opacity: 0; transform: translateY(10px); } }

  header {
    display: flex; align-items: center; gap: 11px; padding: 13px 16px;
    background: linear-gradient(120deg, var(--accent-deep), var(--accent));
    color: #fff;
  }
  .roundel {
    color: inherit; text-decoration: none; display: block;
    width: 38px; height: 38px; flex-shrink: 0; border-radius: 50%;
    background: rgba(255,255,255,.16); padding: 7px;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.22);
  }
  .roundel svg { width: 100%; height: 100%; display: block; }
  .titles { display: flex; flex-direction: column; min-width: 0; flex: 1; line-height: 1.25; }
  .title { font-family: var(--serif); font-weight: 600; font-size: 17.5px; letter-spacing: .01em; }
  .ver { font-family: system-ui, sans-serif; font-weight: 400; font-size: 11px; letter-spacing: .02em; opacity: .6; margin-left: .45em; }
  .subtitle { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; opacity: .72; }
  .hbtns { display: flex; align-items: center; gap: 2px; }
  .icon {
    background: none; border: none; color: #fff; cursor: pointer; opacity: .85;
    width: 34px; height: 34px; padding: 7px; border-radius: 8px; transition: opacity .15s, background .15s;
  }
  .icon svg { width: 100%; height: 100%; display: block; }
  a.icon { display: inline-block; box-sizing: border-box; }
  .icon:hover { opacity: 1; background: rgba(255,255,255,.14); }

  /* Gilded rule — draws itself across on open. The illumination motif. */
  .rule {
    height: 2px; flex-shrink: 0;
    background: linear-gradient(90deg, transparent, var(--gold) 16%, var(--gold-soft) 50%, var(--gold) 84%, transparent);
    transform-origin: left; animation: drawrule .9s .12s cubic-bezier(.22,1,.36,1) both;
  }
  @keyframes drawrule { from { transform: scaleX(0); opacity: 0; } }

  .bodywrap { position: relative; flex: 1; min-height: 0; display: flex; }
  .watermark {
    position: absolute; right: -34px; bottom: -30px; width: 240px; height: 240px;
    color: #23324a; opacity: .05; pointer-events: none;
  }
  .body {
    position: relative; z-index: 1;
    flex: 1; overflow-y: auto; padding: 18px 18px 10px;
    overscroll-behavior: contain;   /* reaching the end of the conversation never scrolls the page behind */
    display: flex; flex-direction: column; gap: 14px;
    scrollbar-width: thin; scrollbar-color: rgba(120,110,90,.35) transparent;
  }
  .body::-webkit-scrollbar { width: 8px; }
  .body::-webkit-scrollbar-thumb { background: rgba(120,110,90,.3); border-radius: 4px; }

  .msg { display: flex; gap: 10px; animation: arrive .32s cubic-bezier(.22,1,.36,1); }
  .msg.user { justify-content: flex-end; }
  .bubblewrap { max-width: 84%; min-width: 0; }
  .msg.assistant .bubblewrap { flex: 1 1 auto; max-width: 100%; }   /* replies use the whole column; only the reader's own words sit narrower (Chad 11-14) */
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .bubble.follow { margin-top: 8px; }
  /* ── Cards (Chad 11-13): one rhythm for every widget — set in from the prose, clear air above and below, compact inside;
     each kind its own character: the book a volume on a desk, the talk a listening card, the quote the words themselves. ── */
  .book, .talk, .qcard, .scene, .bubble :global(.sbs-wrap) { white-space: normal; }   /* inside a pre-wrap bubble: template whitespace is never a blank line */
  .qcard-text { white-space: pre-wrap; }
  .book, .talk, .qcard, .scene { clear: both; box-sizing: border-box; margin: 16px 0 16px 14px; max-width: min(500px, calc(100% - 14px)); }
  .qcard { max-width: calc(100% - 14px); }   /* quotes: set in by the indent, sharing the prose's right margin — no wasted width (Chad 11-14) */
  .kicker { font: 600 10px/1.2 system-ui, -apple-system, 'Segoe UI', sans-serif; letter-spacing: .14em; text-transform: uppercase; }
  .ext { width: 12px; height: 12px; margin-left: 4px; vertical-align: -1.5px; transition: transform .2s; }
  a:hover > .ext { transform: translateX(2px); }
  /* book: paper, a cover lifted off the page, the title in the book face */
  .book { display: flex; gap: 14px; align-items: flex-start; padding: 12px 16px 12px 12px; color: #2a2620;
    background: linear-gradient(180deg, #fffdf8, #f9f3e4); border: 1px solid #ebe2cd; border-radius: 3px 10px 10px 3px;
    box-shadow: inset 3px 0 0 color-mix(in srgb, var(--gold) 80%, transparent), 0 10px 22px -16px rgba(60, 40, 10, .45); }
  .book-cover { flex: 0 0 auto; display: block; line-height: 0; text-decoration: none; }
  .book-cover img, .book-blank { width: 64px; border-radius: 2px 4px 4px 2px; transform: rotate(-2deg); transition: transform .3s cubic-bezier(.2, .8, .2, 1);
    box-shadow: -2px 0 0 rgba(0, 0, 0, .06), 0 7px 14px -6px rgba(40, 25, 5, .5); }
  .book-cover img { height: auto; }
  .book:hover .book-cover img, .book:hover .book-blank { transform: rotate(0) translateY(-2px); }
  /* no cover (none, or a 404): a drawn one — deep ink, a gold rule, the title's initial */
  .book-blank { display: none; aspect-ratio: 2 / 3; box-sizing: border-box; padding: 8px 6px; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
    background: linear-gradient(160deg, #23324a, #121b2a); color: #e8d9b5; line-height: 1.15; text-align: center; outline: 1px solid color-mix(in srgb, var(--gold) 60%, transparent); outline-offset: -4px; }
  .book-blank-i { font-family: var(--serif); font-size: 24px; color: var(--gold); }
  .book-blank-t { font-family: var(--serif); font-style: italic; font-size: 8.5px; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
  .book-cover.nocover img { display: none; }
  .book-cover.nocover .book-blank { display: flex; }
  .book-meta { min-width: 0; flex: 1 1 auto; }
  .book-kicker { font: 600 10px/1.2 system-ui, -apple-system, 'Segoe UI', sans-serif; letter-spacing: .14em; text-transform: uppercase; color: color-mix(in srgb, var(--gold) 65%, #5a4a2a); }
  .book .book-title { display: block; margin-top: 4px; font-family: var(--serif); font-size: 1.08em; font-weight: 600; line-height: 1.22; color: #22201b; text-decoration: none; text-wrap: balance; }
  .book .book-title:hover { color: var(--accent-deep); }
  .book-by { margin-top: 2px; font-size: .85em; color: #6b6253; }
  .book-desc { margin: 6px 0 0; font-size: .86em; line-height: 1.42; color: #3d372d; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .book .book-read { display: inline-block; margin-top: 8px; font-size: .8em; font-weight: 600; color: var(--accent); text-decoration: none;
    border-bottom: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); }
  .book .book-read:hover { color: var(--accent-deep); border-bottom-color: currentColor; }
  /* talk: a listening card — night ink with a faint sound ripple, the speaker's face in a gold ring, its own small player */
  .talk { position: relative; overflow: hidden; display: grid; grid-template-columns: auto 1fr; gap: 0 14px; align-items: center; max-width: min(460px, calc(100% - 14px));
    padding: 14px 16px 10px 14px; border-radius: 14px; color: #ece6d8;
    background: radial-gradient(130% 150% at 0% 0%, #2b3c58 0%, #18243a 50%, #0f1726 100%);
    box-shadow: inset 0 0 0 1px rgba(232, 217, 181, .09), 0 12px 26px -16px rgba(10, 20, 40, .7); }
  .talk::after { content: ''; position: absolute; right: -34px; top: -34px; width: 110px; height: 110px; border-radius: 50%; pointer-events: none;
    border: 1px solid rgba(232, 217, 181, .1); box-shadow: 0 0 0 16px rgba(232, 217, 181, .035), 0 0 0 32px rgba(232, 217, 181, .02); }
  .talk-photo { text-decoration: none; display: grid; place-items: center; width: 60px; height: 60px; border-radius: 50%; overflow: hidden; line-height: 0; background: #23324a;
    box-shadow: 0 0 0 2px #18243a, 0 0 0 3.5px var(--gold), 0 6px 16px -4px rgba(0, 0, 0, .55); }
  .talk-photo img { width: 100%; height: 100%; object-fit: cover; filter: sepia(.12) contrast(1.04); }
  .talk-photo-i { font-family: var(--serif); font-size: 26px; color: var(--gold); line-height: 1; }
  .talk-body { min-width: 0; position: relative; z-index: 1; }
  .talk-kicker { font: 600 10px/1.2 system-ui, -apple-system, 'Segoe UI', sans-serif; letter-spacing: .14em; text-transform: uppercase; color: color-mix(in srgb, var(--gold) 85%, #fff); }
  .talk-title { display: block; margin-top: 4px; font-family: var(--serif); font-size: 1.07em; font-weight: 600; line-height: 1.2; color: #fbf6ea; text-decoration: none; text-wrap: balance; }
  .talk-title:hover { color: #fff; text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--gold) 60%, transparent); text-underline-offset: 3px; }
  .talk-speaker { margin-top: 2px; font-size: .84em; color: #b9b09c; }
  .tp { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(232, 217, 181, .1); position: relative; z-index: 1; }
  .tp-btn { flex: none; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
    background: var(--gold); color: #14203a; box-shadow: 0 3px 10px -3px color-mix(in srgb, var(--gold) 70%, transparent); transition: transform .15s; }
  .tp-btn:hover { transform: scale(1.07); }
  .tp-btn:focus-visible { outline: 2px solid #fbf6ea; outline-offset: 2px; }
  .tp-btn svg { width: 14px; height: 14px; }
  .tp-btn .i-pause, .tp.on .tp-btn .i-play { display: none; }
  .tp.on .tp-btn .i-pause { display: block; }
  .tp-track { flex: 1 1 auto; position: relative; height: 3px; border-radius: 2px; background: rgba(232, 217, 181, .16); cursor: pointer; }
  .tp-track::before { content: ''; position: absolute; inset: -9px 0; }
  .tp-track i { position: absolute; inset: 0 auto 0 0; width: calc(var(--p, 0) * 100%); border-radius: 2px; background: var(--gold); }
  .tp-time { font: 500 11px/1 system-ui, -apple-system, sans-serif; font-variant-numeric: tabular-nums; color: #b9b09c; }
  .tp audio { display: none; }
  .tp-open { margin-left: auto; font-size: .78em; font-weight: 600; color: #e8d9b5; text-decoration: none; white-space: nowrap; }
  .tp-open:hover { color: #fff; }
  /* quote card: the words themselves — the book face, a gold rule, the book's small cover, the citation right beneath */
  .qcard { display: flex; gap: 12px; align-items: flex-start; padding: 9px 14px 9px 13px; border-left: 2px solid var(--gold); border-radius: 0 8px 8px 0;
    background: linear-gradient(90deg, color-mix(in srgb, var(--gold) 8%, transparent), color-mix(in srgb, var(--gold) 2%, transparent)); }
  .qcard-cover { flex: 0 0 auto; display: block; line-height: 0; margin-top: 2px; }
  .qcard-cover img { width: 34px; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 2px 3px 3px 2px; box-shadow: 0 4px 10px -4px rgba(40, 25, 5, .5); }
  .qcard-cover.nocover { display: none; }
  .qcard-body { min-width: 0; flex: 1 1 auto; }
  .qcard-text, .qcard-text :global(p) { font-family: var(--serif); color: var(--quote); line-height: 1.5; }
  .qcard-text :global(p), .qcard-text :global(blockquote) { margin: 0; padding: 0; border: 0; background: none; }
  .qcard-text :global(p + p) { margin-top: .45em; }
  .qcard-cite, .qcard .qcard-cite, .scene .qcard-cite { margin: 5px 0 0; font-size: .8em; color: #7a705f; }
  .bubble .qcard-cite a, .qcard-cite a { color: inherit; text-decoration: none; }
  .bubble .qcard-cite a:hover, .qcard-cite a:hover { color: var(--accent-deep); text-decoration: underline; }
  .qcard-cite em { font-family: var(--serif); color: #2a2620; }
  .plate { margin: 8px 0 0; }
  .plate a { display: inline-block; line-height: 0; }
  .plate img { width: 120px; height: auto; border-radius: 3px; box-shadow: 0 3px 8px -4px rgba(40, 25, 5, .45); }
  .plate figcaption { margin-top: 4px; font-size: .75em; line-height: 1.35; color: #7a705f; }
  .root.dark .plate figcaption { color: #a59d8c; }
  /* scene card: one moment of a story with the words that record it */
  .scene { padding: 12px 14px; border: 1px solid #ebe2cd; border-top: 2.5px solid var(--gold); border-radius: 4px 4px 10px 10px; background: #fffdf8; color: #2a2620;
    box-shadow: 0 10px 22px -16px rgba(60, 40, 10, .4); }
  .scene-head { display: flex; gap: 10px; align-items: center; padding-bottom: 8px; border-bottom: 1px solid color-mix(in srgb, var(--gold) 22%, transparent); }
  .scene-title { margin: 0; font-family: var(--serif); font-size: 1.08em; font-weight: 600; line-height: 1.25; text-wrap: balance; }
  .scene-line { margin: 3px 0 0; font: italic .84em/1.35 var(--serif); color: #6b6253; }
  .scene-pass { margin: 12px 0 0; padding-left: 11px; border-left: 2px solid var(--gold); }
  .scene-pass .qcard-text { line-height: 1.55; }
  .msg.user .bubblewrap { max-width: 78%; }

  .bubble {
    padding: 12px 16px; border-radius: 14px;
    white-space: pre-wrap; word-break: break-word;
  }
  .msg.assistant .bubble {
    font-family: var(--serif); font-size: 16.5px; line-height: 1.62; color: #2a2620;
    background: #fffdf8; border: 1px solid #e9e2d2; border-top-left-radius: 5px;
    box-shadow: 0 1px 3px rgba(90, 75, 45, .06);
  }
  .msg.user .bubble {
    font-size: 15.5px; line-height: 1.5; color: #fff;
    background: linear-gradient(135deg, var(--accent), var(--accent-deep));
    border-bottom-right-radius: 5px;
    box-shadow: 0 2px 8px var(--halo);
  }
  /* Illuminated drop cap on settled, substantial answers. */
  .bubble.lit::first-letter {
    font-size: 3.05em; float: left; line-height: .82;
    padding: .06em .09em 0 0; color: var(--accent-deep);
    font-family: var(--serif); font-weight: 600;
  }
  .bubble :global(a) { color: var(--accent); text-decoration-color: color-mix(in srgb, var(--gold) 60%, transparent); text-underline-offset: 2px; }
  .bubble :global(em) { color: color-mix(in srgb, currentColor 82%, var(--accent)); }
  .bubble :global(strong) { font-weight: 650; color: color-mix(in srgb, currentColor 88%, var(--accent-deep)); }
  /* a heading or a bold-only label belongs to the text below it: more space above than below (Chad 11-03) */
  .bubble :global(h1), .bubble :global(h2), .bubble :global(h3), .bubble :global(h4) { margin: 1.1em 0 .3em; font-size: 1.05em; font-weight: 650; line-height: 1.3; }
  .bubble :global(h1:first-child), .bubble :global(h2:first-child), .bubble :global(h3:first-child), .bubble :global(h4:first-child) { margin-top: 0; }
  .bubble :global(p:has(> strong:only-child)) { margin: 1em 0 .25em; }
  /* Blockquoted passages — the gilded rule motif marks the sacred text itself. */
  .bubble :global(blockquote) {
    margin: .9em 0 .9em 14px; padding: .4em .9em .4em .85em;
    border-left: 2.5px solid var(--gold);
    background: color-mix(in srgb, var(--gold) 5%, transparent);
    border-radius: 0 6px 6px 0; font-style: italic;
  }
  /* quoted words (quote-style.js): the quotation ink, italic inline, upright in a block and in RTL (Chad 11-04) */
  .bubble :global(em.quote) { color: var(--quote); font-style: italic; }
  .bubble :global(em.quote[dir="rtl"]) { font-style: normal; unicode-bidi: isolate; }
  .bubble :global(blockquote.quote) { color: var(--quote); font-style: normal; }
  .bubble :global(.quote a) { color: inherit; }
  .bubble :global(table) { border-collapse: collapse; margin: .7em 0; max-width: 100%; font-size: .9em; line-height: 1.4; display: block; overflow-x: auto; white-space: normal; }
  .bubble :global(th), .bubble :global(td) { border: 0; border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent); padding: .42em .9em .42em 0; vertical-align: top; text-align: start; }
  .bubble :global(th) { font: 600 .74em/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif; letter-spacing: .1em; text-transform: uppercase; color: var(--gold-ink);
    border-bottom: 1.5px solid color-mix(in srgb, var(--gold) 55%, transparent); padding-bottom: .5em; }
  .bubble :global(tr:last-child td) { border-bottom: 0; }
  /* tables: the full table when there is room; on a phone each row folds (rich-table.js) */
  .bubble :global(.rt-rows) { display: none; }
  .bubble :global(.rt-rows details), .bubble :global(.rt-one) { border-top: 1px solid color-mix(in srgb, currentColor 14%, transparent); padding: .35em 0; }
  .bubble :global(.rt-rows summary) { cursor: pointer; }
  .bubble :global(.rt-rows details > div) { padding: .2em 0 0 1.1em; font-size: .92em; }
  .bubble :global(.rt-k) { opacity: .65; font-size: .85em; }
  @media (max-width: 640px) {
    .bubble :global(.rt-wide) { display: none; }
    .bubble :global(.rt-rows) { display: block; white-space: normal; }
  }
  .bubble :global(.qref) { font-style: normal; font-size: .86em; opacity: .85;  }
  .bubble :global(.ul) { display: block; margin: .3em 0 .4em 1.1em; }   /* indent organizes, not blank lines (Chad 11-13) */
  .bubble :global(.pg) { display: block; height: .55em; }   /* a paragraph break: half a line, never a full blank one */
  .bubble :global(.h) { display: block; font-weight: 650; font-size: 1.06em; line-height: 1.3; letter-spacing: .005em; margin: 1.05em 0 .25em; color: color-mix(in srgb, currentColor 86%, var(--accent-deep)); text-wrap: balance; }
  .bubble :global(.h:first-child) { margin-top: 0; }
  .bubble :global(.li) { display: block; position: relative; padding-left: 1.15em; }
  .bubble :global(.li .b) { position: absolute; left: 0; color: var(--gold-ink); }
  .bubble :global(.li.ol) { padding-left: 1.6em; }
  .bubble :global(.li.ol .b) { width: 1.25em; text-align: right; font-variant-numeric: tabular-nums; font-size: .92em; }
  .bubble :global(.li + .li) { margin-top: .12em; }

  /* Streaming caret — a breathing quill of accent-to-gold light. */
  .caret {
    display: inline-block; width: 3px; height: 1.02em; margin-left: 2px; vertical-align: -0.14em;
    border-radius: 2px; background: linear-gradient(var(--accent), var(--gold));
    animation: breathe 1.05s ease-in-out infinite;
  }
  @keyframes breathe { 0%, 100% { opacity: .2; } 50% { opacity: 1; } }

  /* Honest progress, poetically: the research line — a gold pulse, the current step in italic serif, each new step fading in. */
  .msg.assistant .bubble.waiting { background: transparent; border-color: transparent; box-shadow: none; padding-left: 4px; }
  .think { display: inline-flex; align-items: center; gap: 10px; min-height: 1.6em; }
  .think.again { display: flex; margin: 8px 0 0 4px; }
  .think-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--gold);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--gold) 55%, transparent); animation: pulse 1.8s ease-out infinite; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--gold) 50%, transparent); } 70%, 100% { box-shadow: 0 0 0 9px transparent; } }
  .think .stage { animation: shimmer 1.7s linear infinite, stagein .5s ease both; }
  @keyframes stagein { from { opacity: 0; } }
  .stage {
    display: inline-block; font-family: var(--serif); font-style: italic; font-size: 15px;
    color: transparent;
    background: linear-gradient(90deg, #9a8f7a 0%, var(--accent) 45%, var(--gold) 55%, #9a8f7a 100%);
    background-size: 220% 100%; -webkit-background-clip: text; background-clip: text;
    animation: shimmer 1.7s linear infinite;
  }
  @keyframes shimmer { from { background-position: 170% 0; } to { background-position: -70% 0; } }

  .nextq { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
  .nextq button { font: inherit; font-size: 12.5px; line-height: 1.3; text-align: left; cursor: pointer; padding: 4px 11px; border-radius: 13px;
    color: var(--accent-deep); background: transparent; border: 1px solid color-mix(in srgb, var(--accent-deep) 35%, transparent); }
  .nextq .page-ask { font-weight: 600; border-color: color-mix(in srgb, var(--gold) 70%, transparent); }
  .nextq button:hover:not(:disabled) { background: color-mix(in srgb, var(--gold) 12%, transparent); }
  .nextq button:disabled { opacity: .5; cursor: default; }

  .error { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; margin-left: 36px; padding: 9px 12px 9px 14px; border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent); background: color-mix(in srgb, var(--danger) 6%, transparent);
    color: #8a2f25; font: 14px/1.4 var(--serif); }
  .error span { flex: 1 1 12em; }
  .err-retry { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px 0 10px; border-radius: 999px; cursor: pointer;
    border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent); background: none; color: inherit; font: 500 13px/1 system-ui, -apple-system, sans-serif; }
  .err-retry .ic { width: 14px; height: 14px; }
  .err-retry:hover { background: color-mix(in srgb, var(--danger) 10%, transparent); }

  /* ── The thinking sky: a faint gold constellation (one canvas, think-sky.js) and a slow glow behind the conversation while
     Anís researches; it deepens with each research step and fades as the answer arrives. Opacity/transform only. ── */
  .sky, .sky-glow { position: absolute; inset: 0; pointer-events: none; z-index: 0; opacity: 0; transition: opacity 1.2s ease; }
  .sky { width: 100%; height: 100%; display: block; }
  .sky.on { opacity: 1; }
  .sky-glow { inset: -20% -10%; background: radial-gradient(42% 36% at 40% 46%, color-mix(in srgb, var(--gold) 16%, transparent), transparent 70%);
    will-change: transform, opacity; }
  .sky-glow.on { opacity: calc(.45 + .55 * var(--depth, 0)); animation: drift 14s ease-in-out infinite alternate; }
  @keyframes drift { from { transform: translate3d(-6%, -3%, 0) scale(1); } to { transform: translate3d(8%, 5%, 0) scale(1.12); } }

  /* ── Welcome (fullscreen, before the first question): calm, typographic, four example questions by kind ── */
  .welcome { margin: auto; padding: 24px 4px 12px; text-align: center; animation: arrive .5s cubic-bezier(.22,1,.36,1) both; }
  .root.calm .panel, .root.calm .rule, .root.calm .welcome { animation: none; }   /* mounting over the static shell: already on screen */
  .wl-mark { display: block; width: 44px; height: 44px; margin: 0 auto 14px; color: var(--gold-ink); }
  .wl-mark svg { width: 100%; height: 100%; display: block; }
  .wl-h { margin: 0; font: 600 clamp(26px, 3.4vw, 34px)/1.15 var(--serif); letter-spacing: -.005em; color: #22201b; text-wrap: balance; }
  .wl-sub { margin: 10px auto 0; max-width: 34em; font: 16px/1.5 var(--serif); color: #5f5747; text-wrap: balance; }
  .wl-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 28px auto 0; max-width: 680px; text-align: left; }
  .wl-card { display: flex; flex-direction: column; gap: 7px; min-height: 92px; padding: 14px 16px 15px; border-radius: 12px; cursor: pointer;
    border: 1px solid #e7dfcd; background: #fffdf8; color: #2a2620; text-align: left; font: inherit;
    box-shadow: 0 1px 2px rgba(90, 75, 45, .05); transition: border-color .2s, box-shadow .2s, transform .2s; }
  .wl-card:hover:not(:disabled) { border-color: color-mix(in srgb, var(--gold) 60%, #e7dfcd); transform: translateY(-1px);
    box-shadow: inset 2.5px 0 0 var(--gold), 0 10px 22px -16px rgba(60, 40, 10, .5); }
  .wl-card:focus-visible { outline: 2px solid color-mix(in srgb, var(--gold) 80%, transparent); outline-offset: 2px; }
  .wl-card:disabled { opacity: .6; cursor: default; }
  .wl-k { display: inline-flex; align-items: center; gap: 7px; font: 600 10.5px/1.2 system-ui, -apple-system, 'Segoe UI', sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #8a6a22; }
  .wl-k .ic { width: 15px; height: 15px; }
  .wl-q { font: 16px/1.4 var(--serif); color: #2a2620; }
  @media (max-width: 560px) {
    .welcome { padding-top: 8px; }
    .wl-mark { width: 36px; height: 36px; margin-bottom: 10px; }
    .wl-sub { font-size: 15px; }
    .wl-grid { grid-template-columns: 1fr; gap: 8px; margin-top: 20px; }
    .wl-card { min-height: 0; padding: 11px 14px 12px; gap: 5px; }
    .wl-q { font-size: 15px; }
  }

  /* reply actions: quiet icons under a reply; shown on hover/focus, always on the last reply and on touch */
  .acts { display: flex; align-items: center; gap: 2px; margin: 4px 0 0 2px; opacity: 0; transition: opacity .18s; }
  .msg:hover .acts, .acts:focus-within, .acts.last { opacity: 1; }
  .acts.qa { justify-content: flex-end; margin: 4px 2px 0 0; }
  .act-gap { width: 6px; }
  .act { width: 30px; height: 30px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 8px; background: none; cursor: pointer;
    color: #9a8f7a; transition: background .15s, color .15s; }
  .act .ic { width: 16px; height: 16px; }
  .act:hover:not(:disabled) { color: #4a4234; background: var(--rail-hover); }
  .act:focus-visible { outline: 2px solid color-mix(in srgb, var(--gold) 70%, transparent); outline-offset: 1px; }
  .act.on { color: var(--gold-ink); }
  .act.on .ic { fill: color-mix(in srgb, var(--gold) 22%, transparent); }
  .act:disabled { opacity: .4; cursor: default; }
  @media (hover: none) { .acts { opacity: 1; } .act { width: 36px; height: 36px; } }
  .msg.user .bubblewrap:has(.edit) { flex: 1 1 auto; max-width: 92%; }
  .msg.user .bubble .edit { display: block; width: 100%; min-height: 44px; resize: none; padding: 0; border: 0; outline: 0; background: none; color: inherit; font: inherit; line-height: inherit; }
  .edit-btns { display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; white-space: normal; }
  .eb { font: 500 12.5px/1 system-ui, -apple-system, 'Segoe UI', sans-serif; padding: 7px 12px; border-radius: 999px; cursor: pointer;
    border: 1px solid rgba(255, 255, 255, .45); background: transparent; color: #fff; }
  .eb.go { background: #fff; color: var(--accent-deep); border-color: #fff; }
  .eb:disabled { opacity: .5; cursor: default; }
  .toast { position: absolute; left: 50%; bottom: 88px; z-index: 30; transform: translateX(-50%); display: flex; align-items: center; gap: 7px;
    padding: 8px 14px 8px 11px; border-radius: 999px; font: 500 13px/1 system-ui, -apple-system, 'Segoe UI', sans-serif; white-space: nowrap;
    background: #24211c; color: #f6f1e4; box-shadow: 0 10px 28px -8px rgba(20, 14, 4, .45); animation: toast-in .22s cubic-bezier(.22, 1, .36, 1); pointer-events: none; }
  .toast .ic { width: 15px; height: 15px; color: var(--gold); }
  @keyframes toast-in { from { opacity: 0; transform: translate(-50%, 6px); } }
  /* share sheet (P3): a centered card over the panel; a bottom sheet on phones */
  .share-scrim { position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; padding: 16px;
    background: rgba(20, 16, 10, .38); animation: toast-in .2s ease-out; }
  .share { width: min(560px, 100%); max-height: min(86%, 720px); display: flex; flex-direction: column; gap: 10px; padding: 16px 18px 18px; border-radius: 16px;
    background: var(--panel-bg, #f9f6f0); color: #24211c; box-shadow: 0 24px 60px -18px rgba(20, 14, 4, .5), 0 0 0 1px rgba(0, 0, 0, .06); }
  .share-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .share-top h2 { margin: 0; font: 600 18px/1.3 var(--serif); }
  .share-label { font: 600 11px/1 system-ui, -apple-system, 'Segoe UI', sans-serif; letter-spacing: .1em; text-transform: uppercase; color: #6b6253; }
  .share-title { width: 100%; padding: 9px 11px; border-radius: 9px; border: 1px solid #ddd3bf; background: #fff; color: inherit; font: 600 16px/1.35 var(--serif); }
  .share-title:focus { outline: 2px solid var(--gold); outline-offset: 1px; }
  .share-sum { margin: 0; font: 15px/1.45 var(--serif); color: #5f5747; }
  .share-note { margin: 0; font: 13px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #6b6253; }
  .share-err { color: var(--danger, #b4483a); }
  .share-wait { display: flex; align-items: center; gap: 10px; padding: 18px 0; font-size: 14px; }
  .share-spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--gold) 30%, transparent); border-top-color: var(--gold); animation: share-spin .8s linear infinite; }
  @keyframes share-spin { to { transform: rotate(360deg); } }
  .share-prev { flex: 1 1 auto; min-height: 80px; overflow-y: auto; padding: 4px 12px; border: 1px solid #e5ddcb; border-radius: 10px; background: #fffdf8;
    font: 15px/1.55 var(--serif); overflow-wrap: break-word; }
  .sp-q { margin: 12px 0 6px; font-weight: 600; }
  .sp-a { padding: 0 0 4px 12px; border-left: 2px solid var(--gold); }
  .sp-a :global(blockquote) { margin: .6em 0; padding-left: 12px; border-left: 2px solid var(--gold-soft); color: var(--quote); font-style: italic; }
  .sp-a :global(p) { margin: .5em 0; }
  .sp-a :global(a) { color: inherit; }
  .share-link { padding: 10px 12px; border-radius: 9px; border: 1px solid #e5ddcb; background: #fffdf8; font: 13px/1.4 ui-monospace, Menlo, monospace; overflow-wrap: anywhere; }
  .share-btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px; }
  .sb { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; padding: 0 16px; border-radius: 999px; border: 1px solid #d9cfba; background: transparent;
    color: inherit; font: 500 14px/1 system-ui, -apple-system, 'Segoe UI', sans-serif; cursor: pointer; text-decoration: none; }
  .sb .ic { width: 16px; height: 16px; }
  .sb.go { background: #14203a; border-color: #14203a; color: #f6efdc; }
  .sb:disabled { opacity: .5; cursor: default; }
  .sb:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
  @media (max-width: 520px) {
    .share-scrim { align-items: flex-end; padding: 0; }
    .share { width: 100%; max-height: 88%; border-radius: 16px 16px 0 0; padding-bottom: max(18px, env(safe-area-inset-bottom)); }
  }

  footer { display: flex; gap: 9px; padding: 12px 14px 8px; background: transparent; }
  .sample-list { position: absolute; top: 62px; left: 10px; right: 10px; z-index: 30; max-height: 55vh; overflow-y: auto; display: flex; flex-direction: column; background: #fff; color: #1e293b; border: 1px solid rgba(128,128,128,.35); border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.25); }
  .sample-item { display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 8px 12px; background: transparent; border: 0; border-bottom: 1px solid rgba(128,128,128,.15); color: inherit; cursor: pointer; }
  .sample-item:hover, .sample-item:focus-visible { background: rgba(128,128,128,.12); outline: none; }
  .sample-label { font-size: 13px; font-weight: 600; }
  .sample-q { font-size: 12px; opacity: .75; }
  textarea {
    flex: 1; resize: none; border: 1px solid #ddd5c2; border-radius: 12px;
    padding: 10px 14px; font-size: 16px; line-height: 1.4; outline: none;
    background: #fffefb; color: #24211c; transition: border-color .15s, box-shadow .15s;
  }
  textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--halo); }
  textarea::placeholder { color: #a89e8a; }
  .send {
    border: none; border-radius: 12px; width: 46px; flex-shrink: 0; cursor: pointer;
    background: linear-gradient(135deg, var(--accent), var(--accent-deep)); color: #fff; padding: 12px;
    transition: transform .12s, filter .15s, opacity .15s;
  }
  .send svg { width: 100%; height: 100%; display: block; }
  .send:hover:not(:disabled) { filter: brightness(1.12); }
  .send:active:not(:disabled) { transform: scale(.92); }
  .send:disabled { opacity: .38; cursor: default; }
  .send.talk { padding: 12px; display: grid; place-items: center; }
  .send.talk .ic { width: 22px; height: 22px; }

  /* ── Voice (P5): composer mic, inline voice message, the conversation view ── */
  .mic {
    border: 1px solid var(--mic-line); border-radius: 12px; width: 44px; height: 44px; align-self: center; flex-shrink: 0; cursor: pointer;
    background: var(--mic-bg); color: var(--mic-ink); display: grid; place-items: center; padding: 0;
    transition: color .15s, border-color .15s, transform .12s;
  }
  .mic .ic { width: 18px; height: 18px; }
  .mic:hover:not(:disabled) { color: var(--gold-ink); border-color: color-mix(in srgb, var(--gold) 55%, var(--mic-line)); }
  .mic:active:not(:disabled) { transform: scale(.94); }
  .mic:disabled { opacity: .4; cursor: default; }
  .mic.on { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, var(--mic-line)); animation: mic-pulse 1.5s ease-in-out infinite; }
  @keyframes mic-pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--danger) 30%, transparent); } 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--danger) 0%, transparent); } }
  .verr { display: flex; align-items: center; gap: 8px; margin: 0 14px -4px; padding: 6px 4px 0 10px; font-size: 12.5px; line-height: 1.35; color: var(--danger); }
  .verr span { flex: 1; }
  .verr button { border: 0; background: none; color: inherit; opacity: .7; cursor: pointer; padding: 4px; display: grid; place-items: center; }
  .verr .ic { width: 14px; height: 14px; }
  .voice {
    position: absolute; inset: 0; z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 34px; padding: 64px 20px 48px; background: var(--voice-bg); color: var(--voice-ink); animation: fadeup .3s ease both;
  }
  .v-close {
    position: absolute; top: max(12px, env(safe-area-inset-top, 0px)); right: 12px; width: 42px; height: 42px; border: 0; border-radius: 999px;
    background: transparent; color: inherit; opacity: .7; cursor: pointer; display: grid; place-items: center;
  }
  .v-close:hover, .v-close:focus-visible { opacity: 1; background: var(--rail-hover2); outline: none; }
  .v-close .ic { width: 18px; height: 18px; }
  .v-stage { display: flex; flex-direction: column; align-items: center; gap: 26px; }
  .orb { position: relative; width: 156px; height: 156px; border: 0; padding: 0; border-radius: 50%; background: none; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .orb:disabled { cursor: default; }
  .orb:focus-visible { outline: 2px solid var(--gold); outline-offset: 14px; }
  .orb-core, .orb-halo { position: absolute; inset: 0; border-radius: 50%; pointer-events: none; }
  .orb-core {
    background: radial-gradient(circle at 36% 30%, #fff7de 0%, var(--gold-soft) 20%, var(--gold) 58%, color-mix(in srgb, var(--gold) 55%, #5a3d20) 100%);
    box-shadow: 0 22px 60px -16px color-mix(in srgb, var(--gold) 70%, transparent), inset 0 -12px 30px rgba(90, 61, 32, .28);
    transform: scale(var(--lvl, 1)); transition: transform .12s ease-out, opacity .3s, filter .3s;
  }
  .orb-halo {
    background: radial-gradient(circle, color-mix(in srgb, var(--gold) 34%, transparent) 0%, transparent 68%);
    transform: scale(calc(var(--lvl, 1) * 1.5)); opacity: .85; transition: transform .2s ease-out;
  }
  .voice[data-state='thinking'] .orb-core { animation: orb-think 1.8s ease-in-out infinite; }
  .voice[data-state='speaking'] .orb-core { animation: orb-speak 1.2s ease-in-out infinite; }
  .voice[data-state='speaking'] .orb-halo { animation: orb-halo 2.4s ease-in-out infinite; }
  .voice[data-state='paused'] .orb-core, .voice[data-state='denied'] .orb-core, .voice[data-state='idle'] .orb-core { filter: saturate(.3); opacity: .6; }
  @keyframes orb-think { 0%, 100% { transform: scale(.93); } 50% { transform: scale(1.01); } }
  @keyframes orb-speak { 0%, 100% { transform: scale(1); } 30% { transform: scale(1.07); } 62% { transform: scale(.98); } }
  @keyframes orb-halo { 0%, 100% { transform: scale(1.4); opacity: .55; } 50% { transform: scale(1.65); opacity: .9; } }
  .v-state { margin: 0; min-height: 1.4em; font-family: var(--serif); font-size: 19px; letter-spacing: .01em; color: var(--rail-muted); text-align: center; }
  .v-text { width: min(560px, 100%); min-height: 7em; display: flex; flex-direction: column; gap: 12px; text-align: center; }
  .v-q { margin: 0; font-size: 14px; line-height: 1.4; color: var(--rail-muted); }
  .v-a { margin: 0; font-family: var(--serif); font-size: 21px; line-height: 1.45; animation: fadeup .35s ease both; }

  /* ── Threads: the rail (fullscreen), the drawer (fullscreen, narrow), the overlay (floating widget) ── */
  .main { position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .ic { width: 18px; height: 18px; display: block; flex: none; }
  .icon .ic { width: 100%; height: 100%; }
  .dots { stroke-width: 2.8; }
  .rail { display: none; }
  .root.full .rail { display: flex; flex-direction: column; flex: none; width: 272px; min-height: 0; background: var(--rail-bg); color: var(--rail-ink);
    border-right: 1px solid var(--rail-line); font-size: 13.5px; }
  .scrim { display: none; }
  .rail-top { display: flex; align-items: center; gap: 4px; min-height: 66px; padding: 13px 8px 10px 12px; }
  .tl-new { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; height: 38px; padding: 0 10px 0 12px; border-radius: 10px; cursor: pointer;
    border: 1px solid var(--rail-line); background: var(--rail-card); color: var(--rail-ink); font: 500 13.5px/1 system-ui, -apple-system, 'Segoe UI', sans-serif;
    box-shadow: 0 1px 2px rgba(60, 40, 10, .05); transition: border-color .15s, box-shadow .15s; }
  .tl-new .ic { color: var(--gold-ink); }
  .tl-new span { white-space: nowrap; }
  .tl-new kbd { margin-left: auto; font: 500 11px/1 system-ui, -apple-system, sans-serif; letter-spacing: .06em; color: var(--rail-muted); opacity: 0; transition: opacity .15s; }
  .tl-new:hover:not(:disabled) { border-color: color-mix(in srgb, var(--gold) 55%, var(--rail-line)); box-shadow: 0 2px 8px -2px rgba(60, 40, 10, .12); }
  .tl-new:hover kbd, .tl-new:focus-visible kbd { opacity: 1; }
  .tl-new:disabled, .hist-new:disabled { opacity: .55; cursor: default; }
  .ricon { flex: none; width: 34px; height: 34px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--rail-muted); cursor: pointer; transition: background .15s, color .15s; }
  .ricon:hover { background: var(--rail-hover); color: var(--rail-ink); }
  .r-close { display: none; }
  .tl-search { display: flex; align-items: center; gap: 8px; height: 34px; margin: 0 12px 4px; padding: 0 10px; border-radius: 9px; cursor: text;
    background: var(--rail-hover); color: var(--rail-muted); border: 1px solid transparent; transition: border-color .15s, background .15s; }
  .tl-search:focus-within { background: var(--rail-card); border-color: color-mix(in srgb, var(--accent) 40%, var(--rail-line)); }
  .tl-search .ic { width: 15px; height: 15px; }
  .tl-search input { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; outline: 0; background: none; color: var(--rail-ink);
    font: 13.5px/1 system-ui, -apple-system, 'Segoe UI', sans-serif; -webkit-appearance: none; appearance: none; }
  .tl-search input::placeholder { color: var(--rail-muted); }
  .tl-search input::-webkit-search-cancel-button { -webkit-appearance: none; }
  .tl { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 2px 8px 14px; scrollbar-width: thin; scrollbar-color: var(--rail-hover2) transparent; }
  .tl ul { list-style: none; margin: 0; padding: 0; }
  .tl-g { margin: 18px 10px 6px; font: 600 10.5px/1 system-ui, -apple-system, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: var(--rail-muted); }
  .tl-g:first-child { margin-top: 12px; }
  .tr { position: relative; display: flex; align-items: center; border-radius: 8px; transition: background .12s; }
  .tr + .tr { margin-top: 1px; }
  .tr:hover, .tr.open { background: var(--rail-hover); }
  .tr.on { background: var(--rail-card); box-shadow: inset 2px 0 0 var(--gold), 0 0 0 1px var(--rail-line), 0 1px 3px rgba(60, 40, 10, .06); }
  .tr-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 8px 2px 8px 11px; border: 0; border-radius: 8px; background: none; cursor: pointer;
    color: inherit; text-align: left; font: 400 13.5px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .tr-main:disabled { cursor: default; opacity: .6; }
  .tr.on .tr-main { font-weight: 560; }
  .tr-t { min-width: 0; overflow: hidden; white-space: nowrap; -webkit-mask-image: linear-gradient(90deg, #000 82%, transparent); mask-image: linear-gradient(90deg, #000 82%, transparent); }
  .tr-pin { width: 12px; height: 12px; color: var(--gold-ink); }
  .tr-more { flex: none; width: 28px; height: 28px; margin-right: 4px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 6px; background: none;
    color: var(--rail-muted); cursor: pointer; opacity: 0; transition: opacity .12s, background .12s; }
  .tr-more .ic { width: 16px; height: 16px; }
  .tr:hover .tr-more, .tr.on .tr-more, .tr.open .tr-more, .tr-more:focus-visible { opacity: 1; }
  .tr-more:hover, .tr.open .tr-more { background: var(--rail-hover2); color: var(--rail-ink); }
  @media (hover: none) { .tr-more { opacity: .8; } }
  .tr-menu { position: absolute; right: 4px; top: calc(100% + 4px); z-index: 10; min-width: 172px; padding: 5px; border-radius: 11px;
    background: var(--rail-card); border: 1px solid var(--rail-line); box-shadow: var(--menu-shadow); animation: fadeup .16s ease both; }
  .tr-menu button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 10px; border: 0; border-radius: 7px; background: none; cursor: pointer;
    color: var(--rail-ink); text-align: left; font: 13px/1.2 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .tr-menu .ic { width: 16px; height: 16px; color: var(--rail-muted); }
  .tr-menu button:hover:not(:disabled), .tr-menu button:focus-visible { background: var(--rail-hover); outline: none; }
  .tr-menu button:disabled { opacity: .42; cursor: default; }
  .tr-menu .danger, .tr-menu .danger .ic { color: var(--danger); }
  .tr-menu hr { margin: 4px 6px; border: 0; border-top: 1px solid var(--rail-line); }
  .tr-edit { flex: 1; min-width: 0; margin: 2px; padding: 6px 9px; border: 1px solid var(--accent); border-radius: 7px; outline: 0; background: var(--rail-card); color: var(--rail-ink);
    font: 13.5px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif; box-shadow: 0 0 0 3px var(--halo); }
  .tr-confirm { flex: 1; display: flex; align-items: center; gap: 4px; padding: 4px 4px 4px 11px; font: 13px/1.2 system-ui, -apple-system, sans-serif; }
  .tr-confirm span { flex: 1; color: var(--danger); font-weight: 560; }
  .tr-no, .tr-yes { border: 0; border-radius: 6px; padding: 6px 10px; cursor: pointer; font: 600 12px/1 system-ui, -apple-system, sans-serif; }
  .tr-no { background: none; color: var(--rail-muted); }
  .tr-no:hover { color: var(--rail-ink); background: var(--rail-hover); }
  .tr-yes { background: var(--danger); color: #fff; }
  .tr-yes:hover { filter: brightness(1.08); }
  .tl-empty { margin: 22px 14px; font-family: var(--serif); font-style: italic; font-size: 14.5px; line-height: 1.5; color: var(--rail-muted); }
  .rail-foot { position: relative; display: flex; align-items: center; gap: 4px; padding: 10px 8px 12px 10px; border-top: 1px solid var(--rail-line); }
  .who { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 5px 8px; border: 0; border-radius: 9px; background: none; cursor: pointer;
    color: var(--rail-ink); text-align: left; font: 13px/1.2 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .who:hover { background: var(--rail-hover); }
  .who-pic { flex: none; width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; object-fit: cover;
    background: linear-gradient(140deg, var(--accent), var(--accent-deep)); color: #fff; font: 600 12px/1 system-ui, sans-serif; }
  .who.quiet { color: var(--rail-muted); }
  .who.quiet:hover { color: var(--rail-ink); }
  .who.quiet .who-pic { background: none; color: inherit; box-shadow: inset 0 0 0 1px var(--rail-line); }
  .who.quiet .who-pic .ic { width: 15px; height: 15px; }
  .who-t { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  /* the user menu: a popover over the rail's foot (or under the floating header); a bottom sheet on narrow screens */
  .um-scrim { position: absolute; inset: 0; z-index: 30; }
  .um { position: absolute; z-index: 31; width: 300px; max-height: min(560px, calc(100% - 80px)); overflow-y: auto; padding: 14px 16px 10px;
    border-radius: 13px; background: var(--rail-card); color: var(--rail-ink); border: 1px solid var(--rail-line); box-shadow: var(--menu-shadow);
    font: 13px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; --um-muted: color-mix(in srgb, var(--rail-ink) 70%, var(--rail-card));
    animation: fadeup .16s ease both; }
  .um.from-rail { left: calc(10px + env(safe-area-inset-left, 0px)); bottom: calc(66px + env(safe-area-inset-bottom, 0px)); }
  .um.from-head { right: 12px; top: 58px; }
  .um-title { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); margin: 0; }
  .um-who { display: flex; align-items: center; gap: 10px; padding-bottom: 12px; }
  .who-pic.quiet { background: none; color: var(--um-muted); box-shadow: inset 0 0 0 1px var(--rail-line); }
  .who-pic.quiet .ic { width: 15px; height: 15px; }
  .um-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .um-name { font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .um-note { color: var(--um-muted); font-size: 12px; margin: 0; }
  .um-sec { border-top: 1px solid var(--rail-line); padding: 11px 0; }
  .um-h { margin: 0 0 8px; font: 600 11px/1.2 system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; color: var(--um-muted); }
  .um-btn { flex: none; border: 1px solid var(--rail-line); background: none; color: var(--rail-ink); border-radius: 999px; padding: 6px 13px;
    font: 12.5px/1 system-ui, sans-serif; cursor: pointer; }
  .um-btn:hover { background: var(--rail-hover); }
  .um-btn.go { background: var(--gold); border-color: var(--gold); color: #1a1712; }
  .um-btn.danger:hover { border-color: var(--danger); color: var(--danger); background: none; }
  .um-seg { display: flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--rail-hover); }
  .um-seg button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 4px; border: 0; border-radius: 8px;
    background: none; color: var(--um-muted); font: 12.5px/1 system-ui, sans-serif; cursor: pointer; }
  .um-seg button .ic { width: 15px; height: 15px; }
  .um-seg button.on { background: var(--rail-card); color: var(--rail-ink); box-shadow: 0 1px 3px rgba(0, 0, 0, .14), 0 0 0 1px var(--rail-line); }
  .um-row { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 10px; padding: 4px 0; border: 0; background: none;
    color: var(--rail-ink); font: inherit; cursor: pointer; }
  .um-sw { width: 30px; height: 18px; border-radius: 9px; background: var(--rail-line); position: relative; transition: background .15s; }
  .um-sw::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .15s;
    box-shadow: 0 1px 2px rgba(0, 0, 0, .25); }
  .um-sw.on { background: var(--gold); }
  .um-sw.on::after { transform: translateX(12px); }
  .um-bio { list-style: none; margin: 0 0 10px; padding: 0; display: grid; gap: 8px; }
  .um-k { font-weight: 600; }
  .um-bio q { display: block; margin-top: 2px; color: var(--um-muted); font-style: italic; font-size: 12px; }
  .um-foot { padding-bottom: 2px; }
  .um-link { border: 0; background: none; padding: 2px 0; color: var(--um-muted); font: 12.5px/1.3 system-ui, sans-serif; cursor: pointer; }
  .um-link:hover { color: var(--danger); }
  @media (max-width: 899px) {   /* the rail is a drawer here: the menu rises from the bottom instead */
    .root.full .um-scrim { position: fixed; background: rgba(0, 0, 0, .35); }
    .root.full .um.from-rail { position: fixed; left: 0; right: 0; bottom: 0; width: auto; max-height: 85dvh; border-radius: 16px 16px 0 0;
      border-width: 1px 0 0; padding: 16px 20px calc(14px + env(safe-area-inset-bottom, 0px)); animation: umsheet .24s cubic-bezier(.22, 1, .36, 1) both; }
  }
  @media (max-width: 640px) {
    .um-scrim { position: fixed; background: rgba(0, 0, 0, .35); }
    .um.from-rail, .um.from-head { position: fixed; left: 0; right: 0; top: auto; bottom: 0; width: auto; max-height: 85dvh; border-radius: 16px 16px 0 0;
      border-width: 1px 0 0; padding: 16px 20px calc(14px + env(safe-area-inset-bottom, 0px)); animation: umsheet .24s cubic-bezier(.22, 1, .36, 1) both; }
  }
  @keyframes umsheet { from { transform: translateY(100%); } }
  /* the floating widget: the same list as a sheet over the conversation */
  .hist { position: absolute; inset: 0; z-index: 20; display: flex; flex-direction: column; background: var(--rail-bg); color: var(--rail-ink);
    animation: histin .24s cubic-bezier(.22, 1, .36, 1) both; }
  @keyframes histin { from { opacity: 0; transform: translateY(-8px); } }
  .hist-top { display: flex; align-items: center; gap: 6px; padding: 14px 10px 10px 18px; }
  .hist-t { flex: 1; font-family: var(--serif); font-size: 18px; font-weight: 600; letter-spacing: .005em; }
  .hist-new { display: flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px 0 10px; border-radius: 8px; cursor: pointer;
    border: 1px solid var(--rail-line); background: var(--rail-card); color: var(--rail-ink); font: 500 13px/1 system-ui, -apple-system, sans-serif; }
  .hist-new .ic { width: 16px; height: 16px; color: var(--gold-ink); }
  .hist-new:hover:not(:disabled) { border-color: color-mix(in srgb, var(--gold) 55%, var(--rail-line)); }
  .hist .tl { padding: 2px 10px 16px; }
  .hist .tl-search { margin: 0 14px 4px; }
  @media (min-width: 900px) {
    .root.full .panel:not(.railed) .rail, .h-menu { display: none; }
    /* the reading column: centred, a comfortable measure, beside the rail */
    .root.full .body > *, .root.full footer { width: 100%; max-width: 960px; margin-inline: auto; }
  }
  @media (max-width: 899px) {
    .h-rail, .r-collapse { display: none; }
    .r-close { display: grid; }
    .root.full .rail { position: fixed; inset: 0 auto 0 0; z-index: 40; width: min(320px, 86vw);
      padding: env(safe-area-inset-top, 0) 0 env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0);
      transform: translateX(-102%); visibility: hidden; box-shadow: 0 0 0 1px var(--rail-line), 24px 0 60px -20px rgba(10, 16, 28, .45);
      transition: transform .3s cubic-bezier(.22, 1, .36, 1), visibility 0s linear .3s; }
    .root.full .rail.drawer { transform: none; visibility: visible; transition: transform .3s cubic-bezier(.22, 1, .36, 1); }
    .root.full .scrim { display: block; position: fixed; inset: 0; z-index: 39; background: rgba(12, 16, 24, .36); -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
      opacity: 0; pointer-events: none; transition: opacity .25s; }
    .root.full .scrim.on { opacity: 1; pointer-events: auto; }
    .h-menu { margin-left: -6px; }
  }
  /* a phone: the title keeps its room — no subtitle or version, a smaller mark, tighter icons (P3 open item) */
  @media (max-width: 420px) {
    .main > header { gap: 8px; padding: 10px 10px 10px 12px; }
    .roundel { width: 32px; height: 32px; padding: 6px; }
    .subtitle, .ver { display: none; }
    .title { font-size: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
    .hbtns { gap: 0; }
    .icon { width: 36px; height: 36px; padding: 8px; }
    .h-menu { margin-left: -4px; }
  }

  /* ── Dark: deep ink, warm text, lifted links, same gold. ── */
  /* applied as a class (.root.dark), not a media query: the reader may pick a theme (prefs.js), the shell applies it pre-paint */
  .root.dark .sample-list { background: #1e293b; color: #e2e8f0; }
  .root.dark { --quote: #dcc4a0; --panel-bg: #11151a;
    --rail-bg: #0c1014; --rail-card: #1a2029; --rail-ink: #e6e2d8; --rail-muted: #858d9b; --rail-line: #232a35;
    --rail-hover: rgba(255, 255, 255, .045); --rail-hover2: rgba(255, 255, 255, .085); --gold-ink: var(--gold); --danger: #e0786b;
    --menu-shadow: 0 16px 40px -10px rgba(0, 0, 0, .6), 0 2px 6px rgba(0, 0, 0, .3);
    --voice-bg: radial-gradient(120% 90% at 50% 36%, #1a2028, #0b0f13 72%); --voice-ink: #e9e6dd;
    --mic-bg: #171c23; --mic-line: #313a48; --mic-ink: #b9b3a6; }
  .root.dark .tl-new, .root.dark .tr.on { box-shadow: none; }
  .root.dark .tr.on { box-shadow: inset 2px 0 0 var(--gold), 0 0 0 1px var(--rail-line); }
  .root.dark .panel { background: linear-gradient(178deg, #14181e, #0e1217); color: #e9e6dd; }
  .root.dark .watermark { color: #b9c8dd; opacity: .045; }
  .root.dark .msg.assistant .bubble { background: #1b212a; border-color: #2b3442; color: #e9e6dd; box-shadow: none; }
  .root.dark .book, .root.dark .scene { background: linear-gradient(180deg, #1e242d, #1a1f27); border-color: #2b3442; color: #e9e6dd; box-shadow: inset 3px 0 0 color-mix(in srgb, var(--gold) 70%, transparent); }
  .root.dark .scene { box-shadow: none; }
  .root.dark .book .book-title { color: #f1ede3; }
  .root.dark .book-by, .root.dark .scene-line { color: #a59d8c; }
  .root.dark .book-desc { color: #d3cec2; }
  .root.dark .book .book-read { color: color-mix(in srgb, var(--accent) 35%, #cfe1ff); }
  .root.dark .talk { background: radial-gradient(130% 150% at 0% 0%, #26344c 0%, #161f30 55%, #10161f 100%); }
  .root.dark .qcard-cite, .root.dark .qcard .qcard-cite, .root.dark .scene .qcard-cite { color: #a59d8c; }
  .root.dark .qcard-cite em { color: #f1ede3; }
  .root.dark .bubble.lit::first-letter { color: color-mix(in srgb, var(--accent) 45%, #cfe1ff); }
  .root.dark .bubble :global(a) { color: color-mix(in srgb, var(--accent) 30%, #cfe1ff); }
  .root.dark .nextq button { color: #c4cddb; border-color: rgba(196, 205, 219, .3); }   /* subtle, never unreadable (Chad 11-12) */
  .root.dark .act { color: #7d8697; }
  .root.dark .act:hover:not(:disabled) { color: #e6e2d8; }
  .root.dark .toast { background: #e9e4d6; color: #1a1712; box-shadow: 0 10px 28px -8px rgba(0, 0, 0, .6); }
  .root.dark .toast .ic { color: #8a6a22; }
  .root.dark .share-scrim { background: rgba(0, 0, 0, .55); }
  .root.dark .share { background: #14181e; color: #e9e6dd; box-shadow: 0 24px 60px -18px rgba(0, 0, 0, .8), 0 0 0 1px #2b3442; }
  .root.dark .share-title, .root.dark .share-prev, .root.dark .share-link { background: #1b212a; border-color: #2b3442; }
  .root.dark .share-label, .root.dark .share-note, .root.dark .share-sum { color: #a9afb9; }
  .root.dark .sb { border-color: #3a4352; }
  .root.dark .sb.go { background: var(--gold); border-color: var(--gold); color: #14181e; }
  .root.dark .nextq button:hover:not(:disabled) { color: #eef1f6; border-color: rgba(196, 205, 219, .55); }
  .root.dark .wl-h { color: #f1ede3; }
  .root.dark .wl-sub { color: #a9afb9; }
  .root.dark .wl-card { background: #1a2029; border-color: #2b3442; color: #e9e6dd; box-shadow: none; }
  .root.dark .wl-card:hover:not(:disabled) { border-color: color-mix(in srgb, var(--gold) 45%, #2b3442); box-shadow: inset 2.5px 0 0 var(--gold); }
  .root.dark .wl-q { color: #e9e6dd; }
  .root.dark .wl-k, .root.dark .wl-mark { color: var(--gold); }
  .root.dark .sky-glow { background: radial-gradient(42% 36% at 40% 46%, color-mix(in srgb, var(--gold) 10%, transparent), transparent 70%); }
  .root.dark .error { color: #f0a59a; }
  .root.dark .bubble :global(.h) { color: #f1ede3; }
  .root.dark .stage { background-image: linear-gradient(90deg, #6d7789 0%, color-mix(in srgb, var(--accent) 40%, #cfe1ff) 45%, var(--gold-soft) 55%, #6d7789 100%); }
  .root.dark footer { border-top: 1px solid #232a35; }
  .root.dark textarea { background: #171c23; color: #e9e6dd; border-color: #313a48; }
  .root.dark .orb-core { box-shadow: 0 22px 70px -18px color-mix(in srgb, var(--gold) 55%, transparent), inset 0 -12px 30px rgba(0, 0, 0, .3); }
  .root.dark textarea::placeholder { color: #6c7686; }
  .root.dark .body { scrollbar-color: rgba(140,150,170,.35) transparent; }
  .root.dark .body::-webkit-scrollbar-thumb { background: rgba(140,150,170,.3); }

  /* ── fullscreen host (siftersearch.com/anis): the panel is the page at every size ── */
  .root.full .panel { position: fixed; inset: 0; width: 100vw; height: 100dvh; max-width: none; max-height: none; border-radius: 0; }
  /* installed as an app (anis.oceanlibrary.com, viewport-fit=cover): keep the header and the input clear of the notch,
     the rounded corners and the home bar */
  .root.full .panel, .panel { padding: env(safe-area-inset-top, 0) env(safe-area-inset-right, 0) env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0); }

  /* ── maximized in place (an embed off the Anís host): the same panel fills the window, the reading column centred ── */
  .root.max .panel { position: fixed; inset: 0; width: 100vw; height: 100dvh; max-width: none; max-height: none; border-radius: 0; animation: none; }
  @media (min-width: 900px) { .root.max .body > *, .root.max footer { width: 100%; max-width: 960px; margin-inline: auto; } }

  /* ── Small screens: the panel becomes a full sheet. ── */
  @media (max-width: 640px) {
    .root.right, .root.left { right: 12px; left: auto; bottom: 12px; }
    .panel {
      position: fixed; inset: 0; width: 100vw; height: 100dvh; border-radius: 0;
    }
    button.icon.expand { display: none; }   /* already the whole screen: nothing to maximize */
  }

  @media (prefers-reduced-motion: reduce) {
    .voice, .v-a, .mic.on, .voice .orb-core, .voice .orb-halo { animation: none; }
    .orb-core, .orb-halo { transition: none; }
    .bubble-btn, .panel, .msg, .rule, .hist, .tr-menu, .toast, .share-scrim, .root .um.from-rail, .root .um.from-head, .root.full .um.from-rail { animation: none; }
    .acts { transition: none; }
    .root.full .rail { transition: none; }
    .stage, .think .stage { animation: none; color: #7a705f; background: none; }
    .think-dot, .welcome, .wl-card { animation: none; transition: none; }
    .sky { display: none; }
    .sky-glow { transition: none; }
    .sky-glow.on { animation: none; transform: none; }
    .root.dark .stage, .root.dark .think .stage { color: #a9afb9; }
    .caret { animation: none; opacity: .75; }
  }
</style>
