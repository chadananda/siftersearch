<!--
  ProfileButton.svelte
  Displays user authentication buttons, including sign-in and user profile options
-->
<script>
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import SignInButton from 'clerk-sveltekit/client/SignInButton.svelte';
  import { authStore, getAllRoles } from '$lib/client/auth.js';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  
  // Get authentication status from auth store with reactivity
  $: isAuthenticated = $authStore.isAuthenticated;
  $: isLoading = $authStore.isLoading;
  
  // Get user information from auth store with reactivity
  $: user = $authStore.user || $page.data.user;
  
  // Development mode detection
  const isDev = browser && import.meta.env.DEV;
  
  // Get all available roles for the dropdown
  const allRoles = getAllRoles();
  
  // State for dropdown menu
  let dropdownOpen = false;
  
  // Toggle dropdown menu
  function toggleDropdown() {
    dropdownOpen = !dropdownOpen;
  }
  
  // Close dropdown when clicking outside
  function handleClickOutside(event) {
    if (dropdownOpen && !event.target.closest('.profile-dropdown')) {
      dropdownOpen = false;
    }
  }
  
  // Add click outside listener when the component mounts
  onMount(() => {
    if (browser) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  });
  
  // Get profile image URL from user object - check all possible properties
  $: profileImageUrl = user?.imageUrl || user?.profileImageUrl || user?.image_url || 
                      (user?.clerk_id && window?.Clerk?.user?.imageUrl) || null;
  
  // Debug profile image URL to console in dev mode
  $: {
    if (isDev && user) {
      console.log('User object:', user);
      console.log('Profile image URL:', profileImageUrl);
      if (window?.Clerk?.user) {
        console.log('Clerk user object:', window.Clerk.user);
        console.log('Clerk user image URL:', window.Clerk.user.imageUrl);
      }
    }
  }
  
  // State for image loading
  let imageLoadError = false;
  
  // Handle image loading error
  function handleImageError() {
    imageLoadError = true;
    if (isDev) console.log('Profile image failed to load');
  }
  
  // Get border color based on user role
  $: roleBorderColor = getRoleBorderColor(user?.role);
  
  // Function to determine border color based on role
  function getRoleBorderColor(role) {
    if (!role) return 'var(--primary)';
    
    switch (role) {
      case 'visitor':
      case 'subscriber':
        return '#3b82f6'; // blue
      case 'editor':
        return '#166534'; // dark green
      case 'librarian':
        return '#22c55e'; // light green
      case 'admin':
        return '#800020'; // maroon
      case 'superuser':
        return '#dc2626'; // red
      default:
        return 'var(--primary)';
    }
  }
  
  // Function to switch roles in development mode
  async function handleRoleChange(e) {
    if (!isDev || !user) return;
    
    const newRole = e.target.value;
    const originalRole = user.role;
    
    if (newRole === originalRole) return;
    
    try {
      console.log(`[DEV] Switching role from ${originalRole} to ${newRole}`);
      
      // Show loading indicator
      const loadingToast = showToast('Switching role...', 'loading');
      
      // Store the role in localStorage for client-side access control
      // This is a fallback in case the JWT update fails
      localStorage.setItem('dev_user_role', newRole);
      
      // Update user role via development-only API
      // This updates the Clerk session claims directly
      const response = await fetch('/api/dev/role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          role: newRole 
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to switch role:', errorText);
        showToast('Failed to switch role', 'error');
        return;
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`[DEV] Role updated to ${newRole}`);
        
        // Now we need to refresh the session to update JWT claims
        if (window.Clerk) {
          try {
            // Force a session refresh to update JWT claims
            await window.Clerk.session.reload();
            console.log('[DEV] Session reloaded with new role');
            
            // Show success message
            showToast(`Role switched to ${newRole}`, 'success');
            
            // Dispatch a custom event to notify other components of the role change
            window.dispatchEvent(new CustomEvent('dev-role-changed', { 
              detail: { role: newRole }
            }));
            
            // Force a page reload to ensure all components reflect the new role
            window.location.reload();
          } catch (error) {
            console.error('Error refreshing session:', error);
            showToast('Error refreshing session', 'error');
          }
        } else {
          // Fallback if Clerk is not available
          console.warn('[DEV] Clerk not available, reloading page');
          showToast(`Role updated, reloading page`, 'success');
          window.location.reload();
        }
      } else {
        console.error('Error switching role:', result.message);
        showToast(`Error: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('Error switching role:', error);
      showToast('An unexpected error occurred', 'error');
    }
  }
  
  // Function to handle sign out manually without redirection
  function handleSignOut() {
    if (!browser || !window.Clerk) return;
    
    // Show loading indicator
    const loadingToast = showToast('Signing out...', 'loading');
    
    // Sign out from Clerk without redirection
    window.Clerk.signOut()
      .then(() => {
        // Update auth store manually
        authStore.update(state => ({
          ...state,
          isAuthenticated: false,
          user: null
        }));
        
        // Show success message
        showToast('Signed out successfully', 'success');
      })
      .catch(error => {
        console.error('Error signing out:', error);
        showToast('Error signing out', 'error');
      });
  }
  
  // Simple toast notification function
  function showToast(message, type = 'info') {
    if (!browser) return null;
    
    // Log to console at minimum
    console.log(`[Toast] ${type}: ${message}`);
    
    // Return a function that could be used to dismiss the toast
    return () => {};
  }
</script>

<div class="flex items-center gap-2">
  {#if isLoading}
    <!-- Loading state - subtle indicator without text -->
    <div class="w-8 h-8 flex items-center justify-center rounded-full bg-surface-3">
      <div class="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
    </div>
  {:else if isAuthenticated}
    <!-- Authenticated user -->
    <div class="flex items-center gap-2">
      {#if user?.role}
        {#if isDev}
          <!-- Role switcher dropdown in dev mode -->
          <div class="relative">
            <select 
              class="text-sm bg-transparent border border-primary/20 rounded px-2 py-1.5 cursor-pointer appearance-none pr-6"
              value={user.role}
              on:change={handleRoleChange}
            >
              {#each allRoles as role}
                <option value={role.name}>{role.label}</option>
              {/each}
            </select>
            <div class="absolute inset-y-0 right-1 flex items-center pointer-events-none">
              <svg class="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </div>
          </div>
        {:else}
          <!-- Just show role label in production -->
          <span class="text-sm text-primary-muted hidden sm:inline-block">{user.role}</span>
        {/if}
      {/if}
      
      <!-- Custom user button with dropdown -->
      <div class="relative profile-dropdown">
        <button 
          class="w-10 h-10 rounded-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary/50 overflow-hidden"
          style="border: 4px solid {roleBorderColor};"
          aria-label="User menu"
          on:click={toggleDropdown}
        >
          {#if profileImageUrl && !imageLoadError}
            <!-- Display user's profile image when available -->
            <img 
              src={profileImageUrl} 
              alt={user?.name || "User"} 
              class="w-full h-full object-cover"
              on:error={handleImageError}
            />
          {:else if user?.name}
            <span class="text-sm font-medium" style="color: {roleBorderColor};">{user.name.substring(0, 1).toUpperCase()}</span>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke={roleBorderColor} class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          {/if}
        </button>
        
        <!-- Dropdown menu -->
        {#if dropdownOpen}
          <div class="absolute right-0 mt-2 w-56 bg-surface-2 rounded-md shadow-lg py-1 z-50 border border-subtle-light">
            {#if user?.email}
              <div class="px-4 py-2 text-sm text-primary-muted border-b border-subtle-light">
                <div class="font-medium text-primary">{user.name || 'User'}</div>
                <div class="truncate">{user.email}</div>
                {#if user?.role}
                  <div class="mt-1 text-xs py-0.5 px-2 rounded-full inline-block" style="background-color: {roleBorderColor}; color: white;">
                    {user.role}
                  </div>
                {/if}
              </div>
            {/if}
            
            <button 
              class="w-full text-left px-4 py-2 text-sm text-primary hover:bg-surface-3 transition-colors cursor-pointer flex items-center gap-2"
              on:click={() => handleSignOut()}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              Sign out
            </button>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <!-- Not authenticated - only show if actually not authenticated -->
    {#if !isAuthenticated && !isLoading}
      <SignInButton mode="modal">
        <button class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary-dark rounded-md transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          Sign In
        </button>
      </SignInButton>
    {/if}
  {/if}
</div>
