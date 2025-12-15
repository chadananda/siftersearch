/**
 * PWA Update State Management
 * Provides reactive state for service worker updates
 * v3 - improved update detection with no-cache headers
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
  // This handles the case where SW updates and takes control
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (refreshing) return;
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
        // Check for updates every 30 seconds (faster detection)
        if (r) {
          // Initial check after 5 seconds
          setTimeout(() => {
            console.log('[PWA] Initial update check...');
            r.update();
          }, 5000);

          // Then check every 30 seconds
          setInterval(() => {
            console.log('[PWA] Checking for updates...');
            r.update();
          }, 30 * 1000);
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
        console.log('[PWA] New version available!');
        updateAvailable = true;

        // Auto-update if user is not in an active conversation
        if (!hasActiveConversation()) {
          console.log('[PWA] No active conversation, auto-updating...');
          performUpdate();
        } else {
          console.log('[PWA] Active conversation detected, showing update button');
        }
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
