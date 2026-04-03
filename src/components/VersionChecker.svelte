<script>
  import { onMount } from 'svelte';
  import pkg from '../../package.json';

  const CLIENT_VERSION = pkg.version;
  const API_BASE = import.meta.env.PUBLIC_API_URL || '';
  const CHECK_INTERVAL = 30000;

  let updateTriggered = false;

  onMount(() => {
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
          const reloadKey = `reload_attempted_${stats.serverVersion}`;
          const lastAttempt = sessionStorage.getItem(reloadKey);
          const cooldownExpired = !lastAttempt || (Date.now() - parseInt(lastAttempt, 10)) > 30000;

          if (cooldownExpired) {
            sessionStorage.setItem(reloadKey, Date.now().toString());
            console.log(`[Update] Server newer (${stats.serverVersion} > ${CLIENT_VERSION}), reloading...`);
            updateTriggered = true;
            window.location.reload();
          }
        }
      }
    } catch {
      // Version check is not critical
    }
  }
</script>
