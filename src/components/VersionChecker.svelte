<script>
  import { onMount } from 'svelte';
  import { initPWA } from '../lib/pwa.svelte.js';
  import pkg from '../../package.json';

  const CLIENT_VERSION = pkg.version;
  const API_BASE = import.meta.env.PUBLIC_API_URL || '';
  const CHECK_INTERVAL = 30000; // Check every 30 seconds

  let updateTriggered = false;

  onMount(() => {
    // Initialize PWA service worker
    initPWA();

    // Start version checking
    checkVersion();
    const interval = setInterval(checkVersion, CHECK_INTERVAL);

    return () => clearInterval(interval);
  });

  async function checkVersion() {
    if (updateTriggered) return;

    try {
      const res = await fetch(`${API_BASE}/api/library/stats`);
      if (!res.ok) return;

      const stats = await res.json();

      if (stats.serverVersion && stats.serverVersion !== CLIENT_VERSION) {
        const clientParts = CLIENT_VERSION.split('.').map(Number);
        const serverParts = stats.serverVersion.split('.').map(Number);
        const serverNewer = serverParts[0] > clientParts[0] ||
          (serverParts[0] === clientParts[0] && serverParts[1] > clientParts[1]) ||
          (serverParts[0] === clientParts[0] && serverParts[1] === clientParts[1] && serverParts[2] > clientParts[2]);

        if (serverNewer) {
          // Check cooldown to allow CDN propagation
          const reloadKey = `reload_attempted_${stats.serverVersion}`;
          const lastAttempt = sessionStorage.getItem(reloadKey);
          const cooldownMs = 30 * 1000;
          const cooldownExpired = !lastAttempt || (Date.now() - parseInt(lastAttempt, 10)) > cooldownMs;

          if (cooldownExpired) {
            sessionStorage.setItem(reloadKey, Date.now().toString());
            console.log(`[Update] Server newer (${stats.serverVersion} > ${CLIENT_VERSION}), updating...`);
            updateTriggered = true;

            // Trigger service worker update
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
              const registration = await navigator.serviceWorker.ready;
              await registration.update();
            }

            // Reload to get new version
            window.location.reload();
          }
        }
      }
    } catch (err) {
      // Silently fail - version check is not critical
    }
  }
</script>
