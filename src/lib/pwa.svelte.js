/**
 * PWA Service Worker - Backup update detection
 * Primary version checking is in ChatInterface via /api/search/stats
 * SW manifest hash changes trigger this as a backup mechanism
 */

// Reactive state for PWA updates
let updateAvailable = $state(false);
let updateSW = $state(null);
let refreshing = false;

// Callback to check if user has an active conversation
let hasActiveConversation = () => false;

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
 * Initialize PWA service worker registration
 * Call this once from a top-level component
 */
export async function initPWA() {
  if (typeof window === 'undefined') return;

  // Listen for controller change (new SW took over)
  // With skipWaiting:true, this fires when new SW activates
  // Always reload to get fresh content - save state first
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;

    // Save any important state before reload
    saveState();

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
          // Initial check after 2 seconds
          setTimeout(() => {
            console.log('[PWA] Initial update check...');
            r.update();
          }, 2000);

          // Backup polling (60s) - primary version check is via /api/search/stats (10s)
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
