<script>
  import { onMount } from 'svelte';

  let offlineReady = $state(false);
  let needRefresh = $state(false);
  let updateSW = $state(null);

  onMount(async () => {
    // Only run in browser
    if (typeof window === 'undefined') return;

    try {
      const { registerSW } = await import('virtual:pwa-register');

      updateSW = registerSW({
        immediate: true,
        onRegisteredSW(swUrl, r) {
          console.log(`[PWA] Service worker registered: ${swUrl}`);
          // Check for updates every 60 seconds
          if (r) {
            setInterval(() => {
              console.log('[PWA] Checking for updates...');
              r.update();
            }, 60 * 1000);
          }
        },
        onRegisterError(error) {
          console.error('[PWA] Service worker registration error:', error);
        },
        onOfflineReady() {
          console.log('[PWA] App ready to work offline');
          offlineReady = true;
          // Auto-dismiss after 3 seconds
          setTimeout(() => {
            offlineReady = false;
          }, 3000);
        },
        onNeedRefresh() {
          console.log('[PWA] New content available, refresh needed');
          needRefresh = true;
        }
      });
    } catch (e) {
      console.log('[PWA] Service worker not available:', e.message);
    }
  });

  function close() {
    offlineReady = false;
    needRefresh = false;
  }

  async function refresh() {
    if (updateSW) {
      await updateSW(true);
    }
  }
</script>

{#if offlineReady || needRefresh}
  <div class="pwa-toast" role="alert" aria-labelledby="toast-message">
    <div class="message" id="toast-message">
      {#if offlineReady}
        <span>App ready to work offline</span>
      {/if}
    </div>
    <div class="buttons">
      {#if needRefresh}
        <button class="refresh-btn" onclick={refresh}>UPDATE</button>
      {/if}
      <button class="close-btn" onclick={close} aria-label="Close">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  </div>
{/if}

<style>
  .pwa-toast {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: var(--surface-elevated, #1e293b);
    border: 1px solid var(--border-color, #334155);
    border-radius: 0.5rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .message {
    font-size: 0.875rem;
    color: var(--text-primary, #f1f5f9);
  }

  .buttons {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .refresh-btn {
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: white;
    background: var(--accent-primary, #0ea5e9);
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .refresh-btn:hover {
    background: var(--accent-primary-hover, #0284c7);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    color: var(--text-muted, #94a3b8);
    background: transparent;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: color 0.15s;
  }

  .close-btn:hover {
    color: var(--text-primary, #f1f5f9);
  }
</style>
