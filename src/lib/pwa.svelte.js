/**
 * PWA Update State Management
 * Provides reactive state for service worker updates
 * v7 - single reload via controllerchange only
 */

// Reactive state for PWA updates
let updateAvailable = $state(false);
let updateSW = $state(null);
let refreshing = false;

// Callback to check if user has an active conversation
let hasActiveConversation = () => false;

/**
 * Initialize PWA service worker registration
 * Call this once from a top-level component
 */
export async function initPWA() {
  if (typeof window === 'undefined') return;

  // Listen for controller change (new SW took over)
  // With skipWaiting:true, this fires when new SW activates
  // This is the ONLY place we trigger reload to avoid double-reload
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (refreshing) return;

    // Check if user has active conversation
    if (hasActiveConversation()) {
      console.log('[PWA] New SW active, but user has conversation - showing update prompt');
      updateAvailable = true;
      return;
    }

    refreshing = true;
    console.log('[PWA] New service worker activated, reloading...');
    window.location.reload();
  });

  try {
    const { registerSW } = await import('virtual:pwa-register');

    updateSW = registerSW({
      immediate: true,
      onRegisteredSW(swUrl, r) {
        console.log(`[PWA] Service worker registered: ${swUrl}`);
        // Check for updates periodically
        if (r) {
          // Initial check after 3 seconds
          setTimeout(() => {
            console.log('[PWA] Initial update check...');
            r.update();
          }, 3000);

          // Then check every 60 seconds (SW update detection)
          setInterval(() => {
            r.update();
          }, 60 * 1000);
        }
      },
      onRegisterError(error) {
        console.error('[PWA] Service worker registration error:', error);
      },
      onOfflineReady() {
        console.log('[PWA] Assets cached for performance');
      },
      onNeedRefresh() {
        // With skipWaiting:true, the new SW will activate immediately
        // and controllerchange will handle the reload
        console.log('[PWA] New version available!');
        updateAvailable = true;
        // Don't call performUpdate() here - let controllerchange handle it
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
 * Set callback to check if user has an active conversation
 * @param {Function} callback - Returns true if conversation is active
 */
export function setConversationChecker(callback) {
  hasActiveConversation = callback;
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
