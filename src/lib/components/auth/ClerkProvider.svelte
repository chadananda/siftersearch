<script>
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { initializeClerkClient } from 'clerk-sveltekit/client';
  import { authStore, validateSessionWithServer as validateAuthWithServer } from '$lib/client/auth.js';
  import { goto } from '$app/navigation';

  // Get the publishable key from props or page data
  export let publishableKey = undefined;
  $: actualKey = publishableKey || $page.data.env?.PUBLIC_CLERK_PUBLISHABLE_KEY;
  
  // Track initialization and auth status
  let isInitialized = false;
  let authCheckInterval = null;
  let lastSessionState = null;
  let clerk = null;
  let initializationError = null;
  let lastServerValidation = 0;
  let sessionValidationInProgress = false;
  let forceValidationOnNextCheck = false;

  // Debug mode flag - set to false to disable most logging
  const debugMode = false;

  // Synchronize with page data immediately and whenever it changes
  $: if (browser && $page.data) {
    const user = $page.data.user;
    
    // Only log in development mode
    if (import.meta.env.DEV && debugMode) {
      console.log('ClerkProvider: Raw user data from page:', user);
    }
    
    // Consider a user authenticated if they have a valid role other than anonymous
    const isAuthenticated = !!user && user.id && user.role && user.role !== 'anonymous';
    
    if (import.meta.env.DEV && debugMode) {
      console.log('ClerkProvider: Syncing auth store with page data:', 
        user ? `User: ${user.email || 'No email'} (${user.role})` : 'No user', 
        `Auth state: ${isAuthenticated ? 'Authenticated' : 'Not authenticated'}`);
    }
    
    // Update the auth store with the current state
    authStore.set({
      isAuthenticated,
      user: isAuthenticated ? user : null,
      isLoading: false,
      hasChecked: true
    });
    
    if (import.meta.env.DEV && debugMode) {
      console.log('ClerkProvider: Auth store updated with page data');
    }
    
    // If page data indicates user is authenticated but Clerk session is not active,
    // we need to force a session validation to ensure client and server are in sync
    if (isAuthenticated && clerk && clerk.session && clerk.session.status !== 'active') {
      if (import.meta.env.DEV && debugMode) {
        console.log('ClerkProvider: Page data indicates authenticated but Clerk session is not active, forcing validation');
      }
      forceValidationOnNextCheck = true;
      validateSessionWithServer(true);
    }
  }
  
  // Function to validate session with server
  async function validateSessionWithServer(forceReload = false) {
    if (!browser || sessionValidationInProgress) return false;
    
    // Prevent excessive validation requests
    const now = Date.now();
    if (now - lastServerValidation < 2000 && !forceReload) { // 2 second throttle
      if (import.meta.env.DEV && debugMode) {
        console.log('ClerkProvider: Skipping validation, too recent');
      }
      return false;
    }
    
    lastServerValidation = now;
    sessionValidationInProgress = true;
    
    try {
      if (import.meta.env.DEV && debugMode) {
        console.log('ClerkProvider: Validating session with server');
      }
      
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'X-Requested-With': 'XMLHttpRequest',
          'X-Validation-Request': 'true',
          'X-Request-Time': now.toString()
        },
        credentials: 'include' // Important for sending cookies
      });
      
      // Handle unauthorized responses (401) or other non-200 responses
      if (!response.ok) {
        if (response.status === 401) {
          // Handle unauthorized response (user is not authenticated)
          if (import.meta.env.DEV && debugMode) {
            console.log('ClerkProvider: Server returned unauthorized, user is not authenticated');
          }
          
          // Update auth store with unauthenticated state
          authStore.set({
            isAuthenticated: false,
            user: null,
            isLoading: false,
            hasChecked: true
          });
          
          return false;
        } else {
          console.error('ClerkProvider: Server validation failed with status:', response.status);
          return false;
        }
      }
      
      // Only try to parse JSON for successful responses
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('ClerkProvider: Error parsing server response:', parseError);
        return false;
      }
      
      if (import.meta.env.DEV && debugMode) {
        console.log('ClerkProvider: Server validation response:', data);
      }
      
      if (data.authenticated) {
        if (import.meta.env.DEV && debugMode) {
          console.log('ClerkProvider: Server confirms authentication, updating auth store');
        }
        
        // Update auth store with server data
        authStore.set({
          isAuthenticated: true,
          user: data.user,
          isLoading: false,
          hasChecked: true
        });
        
        // If Clerk doesn't have an active session but server says we're authenticated,
        // we need to force a reload to get Clerk in sync
        if (clerk && (!clerk.session || clerk.session.status !== 'active') && forceReload) {
          if (import.meta.env.DEV && debugMode) {
            console.log('ClerkProvider: Server says authenticated but Clerk session not active, forcing reload');
          }
          window.location.reload();
          return true;
        }
        
        return true;
      } else {
        if (import.meta.env.DEV && debugMode) {
          console.log('ClerkProvider: Server says not authenticated, updating auth store');
        }
        
        // Update auth store with unauthenticated state
        authStore.set({
          isAuthenticated: false,
          user: null,
          isLoading: false,
          hasChecked: true
        });
        
        // If Clerk has an active session but server says we're not authenticated,
        // we need to sign out of Clerk to get in sync
        if (clerk && clerk.session && clerk.session.status === 'active' && forceReload) {
          if (import.meta.env.DEV && debugMode) {
            console.log('ClerkProvider: Server says not authenticated but Clerk session is active, signing out of Clerk');
          }
          try {
            await clerk.session.end();
            window.location.reload();
          } catch (error) {
            console.error('ClerkProvider: Error signing out of Clerk:', error);
          }
        }
        
        return false;
      }
    } catch (error) {
      console.error('ClerkProvider: Error validating session with server:', error);
      
      // If there's an error, assume user is not authenticated
      authStore.set({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        hasChecked: true
      });
      
      return false;
    } finally {
      sessionValidationInProgress = false;
    }
  }
  
  // Initialize Clerk when component mounts
  onMount(async () => {
    if (browser && actualKey) {
      if (import.meta.env.DEV && debugMode) {
        console.log('ClerkProvider: Initializing Clerk with publishable key');
      }
      
      try {
        // Initialize Clerk client with the publishable key and enhanced options
        clerk = await initializeClerkClient(actualKey, {
          // Enable long-term session storage
          tokenCache: {
            enabled: true
          },
          // Handle session changes
          async onSessionChange(session) {
            if (import.meta.env.DEV && debugMode) {
              console.log('ClerkProvider: Session change detected:', 
                session ? `Active: ${session.status === 'active'}` : 'No session');
            }
            
            // Track session state to detect changes
            const currentSessionState = session ? session.status : null;
            const sessionChanged = lastSessionState !== currentSessionState;
            lastSessionState = currentSessionState;
            
            if (sessionChanged) {
              if (import.meta.env.DEV && debugMode) {
                console.log('ClerkProvider: Session state changed, validating with server');
              }
              
              // Force validation with server on session change
              await validateSessionWithServer(true);
            }
          },
          // Handle sign-in events
          async onSignIn(session) {
            if (import.meta.env.DEV && debugMode) {
              console.log('ClerkProvider: Sign in detected');
            }
            
            // Force validation with server on sign in
            await validateSessionWithServer(true);
          },
          // Handle sign-out events
          async onSignOut() {
            if (import.meta.env.DEV && debugMode) {
              console.log('ClerkProvider: Sign out detected');
            }
            
            // Update auth store with unauthenticated state
            authStore.set({
              isAuthenticated: false,
              user: null,
              isLoading: false,
              hasChecked: true
            });
            
            // Force validation with server on sign out
            await validateSessionWithServer(true);
          }
        });
        
        if (import.meta.env.DEV && debugMode) {
          console.log('ClerkProvider: Clerk client initialized successfully');
        }
        isInitialized = true;
        
        // Safely check if we have an active session
        try {
          if (clerk && clerk.session) {
            if (import.meta.env.DEV && debugMode) {
              console.log('ClerkProvider: Active session available:', 
                clerk.session.status, 
                clerk.session.user ? clerk.session.user.primaryEmailAddress : 'No user email');
            }
            
            // Force validation with server to ensure we're in sync
            await validateSessionWithServer(true);
          } else {
            if (import.meta.env.DEV && debugMode) {
              console.log('ClerkProvider: No active session available');
            }
            
            // Still validate with server to ensure we're in sync
            // (server might have a session even if Clerk doesn't)
            await validateSessionWithServer(true);
          }
        } catch (error) {
          console.error('ClerkProvider: Error accessing clerk session:', error);
          // Still validate with server even if there was an error accessing the session
          await validateSessionWithServer(true);
        }
        
        // Set up periodic auth state checks
        authCheckInterval = setInterval(checkAuthState, 30000); // Check every 30 seconds
        
        // Also check auth state when window gets focus
        window.addEventListener('focus', () => {
          if (import.meta.env.DEV && debugMode) {
            console.log('ClerkProvider: Window focus detected, checking auth state');
          }
          checkAuthState();
        });
        
      } catch (error) {
        console.error('ClerkProvider: Error initializing Clerk client:', error);
        initializationError = error.message || 'Failed to initialize Clerk';
        
        // Fall back to server-provided data
        const user = $page.data.user;
        const isAuthenticated = !!user && user.id && user.role && user.role !== 'anonymous';
        
        authStore.set({
          isAuthenticated,
          user: isAuthenticated ? user : null,
          isLoading: false,
          hasChecked: true
        });
      }
    } else if (browser) {
      console.error('ClerkProvider: Clerk publishable key not available. Authentication will not work properly.');
      initializationError = 'Missing Clerk publishable key';
    }
  });

  // Function to check auth state
  async function checkAuthState() {
    if (!browser || !isInitialized || !clerk) return;
    
    try {
      // Get current auth state from store
      let currentAuthState;
      authStore.update(state => {
        currentAuthState = state;
        return state;
      });
      
      // Safely check if Clerk has an active session
      let clerkHasSession = false;
      try {
        clerkHasSession = clerk && clerk.session && clerk.session.status === 'active';
      } catch (error) {
        console.error('ClerkProvider: Error checking Clerk session status:', error);
      }
      
      if (import.meta.env.DEV && debugMode) {
        console.log('ClerkProvider: Checking auth state:', 
          `Auth store: ${currentAuthState.isAuthenticated ? 'Authenticated' : 'Not authenticated'}`,
          `Clerk: ${clerkHasSession ? 'Has session' : 'No session'}`);
      }
      
      // Check for mismatches between Clerk and auth store
      const mismatch = currentAuthState.isAuthenticated !== clerkHasSession;
      
      if (mismatch || forceValidationOnNextCheck) {
        if (import.meta.env.DEV && debugMode) {
          console.log('ClerkProvider: Auth state mismatch or force validation requested, validating with server');
        }
        forceValidationOnNextCheck = false;
        await validateSessionWithServer(true);
      } else {
        // Periodically validate with server even if no mismatch
        const now = Date.now();
        const timeSinceLastValidation = now - lastServerValidation;
        
        // Validate every 5 minutes even if no mismatch
        if (timeSinceLastValidation > 5 * 60 * 1000) {
          if (import.meta.env.DEV && debugMode) {
            console.log('ClerkProvider: Periodic validation check');
          }
          await validateSessionWithServer(false);
        }
      }
    } catch (error) {
      console.error('ClerkProvider: Error checking auth state:', error);
    }
  }
  
  // Clean up on component destroy
  onDestroy(() => {
    if (authCheckInterval) {
      clearInterval(authCheckInterval);
    }
    
    // Remove event listeners
    if (browser) {
      window.removeEventListener('focus', checkAuthState);
    }
  });
</script>

{#if initializationError && browser}
  <div class="clerk-error" style="display: none;">
    <!-- Hidden error information for debugging -->
    <p>Error initializing Clerk: {initializationError}</p>
  </div>
{/if}

<slot></slot>
