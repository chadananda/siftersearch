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

  // Check for stale/broken service worker
  if (navigator.serviceWorker) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();

      for (const registration of registrations) {
        // Listen for install failures — if the new SW fails to install
        // (e.g. precache 404s), unregister the broken SW entirely
        registration.addEventListener('updatefound', () => {
          const newSW = registration.installing;
          if (newSW) {
            newSW.addEventListener('statechange', () => {
              if (newSW.state === 'redundant') {
                registration.unregister().then(() => {
                  window.location.reload();
                });
              }
            });
          }
        });

        await registration.update();
      }
    } catch (e) {
      console.warn('[PWA] Could not check for updates:', e);
    }
  }

  // Listen for controller change (new SW took over)
  // With skipWaiting:true, this fires when new SW activates
  // Always reload to get fresh content - save state first
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;

    // Save any important state before reload
    saveState();

    window.location.reload();
  });

  try {
    const { registerSW } = await import('virtual:pwa-register');

    updateSW = registerSW({
      immediate: true,
      onRegisteredSW(swUrl, r) {
        // Check for updates periodically
        if (r) {
          // Immediate update check
          setTimeout(() => {
            r.update();
          }, 100);

          // Frequent polling (every 10s) for the first minute
          let checkCount = 0;
          const earlyInterval = setInterval(() => {
            r.update();
            checkCount++;
            if (checkCount >= 6) { // Stop after 1 minute
              clearInterval(earlyInterval);
            }
          }, 10 * 1000);

          // Then backup polling (60s) after that
          setTimeout(() => {
            setInterval(() => {
              r.update();
            }, 60 * 1000);
          }, 60 * 1000);
        }
      },
      onRegisterError(error) {
        console.error('[PWA] Service worker registration error:', error);
      },
      onNeedRefresh() {
        // With skipWaiting:true, the new SW will activate immediately
        // and controllerchange will handle the reload
        updateAvailable = true;
        // Don't call performUpdate() here - let controllerchange handle it
      }
    });
  } catch (e) {
    // Service worker not available
  }
}

/**
 * Trigger the app update/refresh
 */
export async function performUpdate() {
  if (updateSW) {
    saveState();
    await updateSW(true);
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
