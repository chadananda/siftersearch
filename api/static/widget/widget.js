// SifterChat loader — the one-line embed. Usage on any approved host site:
//   <script src="https://siftersearch.com/widget.js" data-key="wgt_…" async></script>
// Optional per-page overrides (tune without editing the DB profile):
//   data-accent="#1a6b5e"   primary/accent color
//   data-name="Anís"        the assistant's display + self-reference name
//   data-mission="…"        a short mission/steering prompt (≤400 chars)
//   data-samples="true"    show the "Try a sample" menu (one showcase question per strategy; site owners, not yet the public)
//   data-opened="1"        start with the panel open
//   data-fullscreen="1"    the panel fills the window at every size (siftersearch.com/anis)
// Reads its own script tag for the profile token, loads the custom-element bundle from the same origin,
// and mounts <sifter-chat>. Hand-written (no build); the element bundle is built via `npm run build:widget`.
(function () {
  var script = document.currentScript || (function (s) { return s[s.length - 1]; })(document.getElementsByTagName('script'));
  if (!script) return;
  var key = script.getAttribute('data-key');
  if (!key) { console.warn('[sifter-chat] missing data-key on the embed script tag'); return; }
  // Included twice (10-14: AdminLayout and Layout both embedded it) the bundle registered <sifter-chat> twice and threw
  // "the name has already been used". Host sites can make the same mistake, so the loader runs once per page.
  if (window.__sifterChatLoader) return;
  window.__sifterChatLoader = true;
  var api = new URL(script.src).origin;
  // Each build registers <sifter-chat-<hash>> (the hash is the ?v= the server stamps on the bundle URL below), so a
  // running widget can load a newer build beside itself and swap in. No hash (unversioned) = plain <sifter-chat>.
  var BUNDLE = api + '/widget/sifter-chat.js';
  var ver = (BUNDLE.match(/[?&]v=([0-9a-f]+)/) || [])[1];
  var tag = ver ? 'sifter-chat-' + ver : 'sifter-chat';
  function mount() {
    if (document.querySelector('[data-sifter-chat], sifter-chat')) return;
    var el = document.createElement(tag);
    el.setAttribute('data-sifter-chat', '');
    el.setAttribute('token', key);
    el.setAttribute('api', api);
    // Pass through optional data-* overrides to the element.
    ['accent', 'name', 'mission', 'samples', 'opened', 'fullscreen', 'version'].forEach(function (a) {
      var v = script.getAttribute('data-' + a);
      if (v) el.setAttribute(a, v);
    });
    document.body.appendChild(el);
  }
  if (window.customElements && customElements.get(tag)) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
    return;
  }
  var bundle = document.createElement('script');
  bundle.src = BUNDLE;
  bundle.async = true;
  bundle.onload = function () {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  };
  bundle.onerror = function () { console.warn('[sifter-chat] failed to load element bundle'); };
  document.head.appendChild(bundle);
})();
