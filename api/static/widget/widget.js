// SifterChat loader — the one-line embed. Usage on any approved host site:
//   <script src="https://siftersearch.com/widget.js" data-key="wgt_…" async></script>
// Optional per-page overrides (tune without editing the DB profile):
//   data-accent="#1a6b5e"   primary/accent color
//   data-name="Anís"        the assistant's display + self-reference name
//   data-mission="…"        a short mission/steering prompt (≤400 chars)
// Reads its own script tag for the profile token, loads the custom-element bundle from the same origin,
// and mounts <sifter-chat>. Hand-written (no build); the element bundle is built via `npm run build:widget`.
(function () {
  var script = document.currentScript || (function (s) { return s[s.length - 1]; })(document.getElementsByTagName('script'));
  if (!script) return;
  var key = script.getAttribute('data-key');
  if (!key) { console.warn('[sifter-chat] missing data-key on the embed script tag'); return; }
  var api = new URL(script.src).origin;
  function mount() {
    if (document.querySelector('sifter-chat')) return;
    var el = document.createElement('sifter-chat');
    el.setAttribute('token', key);
    el.setAttribute('api', api);
    // Pass through optional data-* overrides to the element.
    ['accent', 'name', 'mission'].forEach(function (a) {
      var v = script.getAttribute('data-' + a);
      if (v) el.setAttribute(a, v);
    });
    document.body.appendChild(el);
  }
  var bundle = document.createElement('script');
  bundle.src = api + '/widget/sifter-chat.js';
  bundle.async = true;
  bundle.onload = function () {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  };
  bundle.onerror = function () { console.warn('[sifter-chat] failed to load element bundle'); };
  document.head.appendChild(bundle);
})();
