// Dewey's service worker — exists only so phones offer "Install" for /dewey (Chad 10-17). It caches NOTHING: every
// request goes to the network, so Dewey never shows a stale answer. The rest of the site has no service worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});   // network as usual
