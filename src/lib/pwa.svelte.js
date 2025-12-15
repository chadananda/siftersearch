/**
 * PWA Update State Management
 * Provides reactive state for service worker updates
 */

// Reactive state for PWA updates
let updateAvailable = $state(false);
let updateSW = $state(null);

/**
 * Initialize PWA service worker registration
 * Call this once from a top-level component
 */
export async function initPWA() {
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
        // Silent - we cache for performance, not offline use
        console.log('[PWA] Assets cached for performance');
      },
      onNeedRefresh() {
        console.log('[PWA] New version available');
        updateAvailable = true;
      }
    });
  } catch (e) {
    console.log('[PWA] Service worker not available:', e.message);
  }
}

/**
 * Save current app state before refresh
 */
function saveState() {
  try {
    // Save any important state to sessionStorage
    const state = {
      timestamp: Date.now()
    };
    sessionStorage.setItem('sifter_update_state', JSON.stringify(state));
  } catch (e) {
    console.warn('[PWA] Could not save state:', e);
  }
}

/**
 * Trigger the app update/refresh
 */
export async function performUpdate() {
  if (updateSW) {
    saveState();
    console.log('[PWA] Triggering update...');
    await updateSW(true);
    // Force reload after service worker updates
    // This ensures the new SW takes control and serves fresh content
    console.log('[PWA] Reloading page...');
    window.location.reload();
  }
}

/**
 * Get reactive update state
 */
export function getPWAState() {
  return {
    get updateAvailable() { return updateAvailable; },
    get canUpdate() { return updateSW !== null; }
  };
}
