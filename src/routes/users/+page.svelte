<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import Card from '$lib/components/ui/Card.svelte';
  import { userHasRole } from '$lib/client/auth.js';
  import { authStore } from '$lib/client/auth.js';

  // Get data from page
  export let data;

  // Extract users from data
  let users = data?.users || [];
  let totalUserCount = data?.totalCount || 0;
  const currentUser = data?.user || $authStore?.user || {}; // Ensure currentUser is never undefined
  const roles = data?.roles || [];

  // State variables
  let loading = false;
  let error = null;
  let searchQuery = '';
  let selectedRole = '';
  let showCreateModal = false;
  let showEditModal = false;
  let showDeleteModal = false;
  let editingUser = null;
  let useCardLayout = false;
  let containerRef;

  // Form data for creating/editing users
  let formData = {
    name: '',
    email: '',
    role: 'visitor',
    active: true
  };
  
  // Reset form data to defaults
  function resetFormData() {
    formData = {
      name: '',
      email: '',
      role: 'visitor',
      active: true
    };
  }

  // Debounce function implementation
  function debounce(func, delay) {
    let timeoutId;
    return function() {
      const context = this;
      const args = arguments;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(context, args);
      }, delay);
    };
  }

  // Handle search with debounce
  const debouncedSearch = debounce(() => {
    loadUsers(true);
  }, 300);

  // Handle search
  function handleSearch() {
    debouncedSearch();
  }

  // Function to get profile image URL
  function getProfileImageUrl(user) {
    // Check for Clerk profile image
    if (user?.profileImageUrl) {
      return user.profileImageUrl;
    }

    // Check for Google/OAuth profile image
    if ($authStore?.user?.imageUrl) {
      return $authStore.user.imageUrl;
    }

    // Generate initials for avatar
    const initials = user?.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);

    // Generate a consistent color based on the user's name
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 
      'bg-red-500', 'bg-purple-500', 'bg-pink-500',
      'bg-indigo-500', 'bg-teal-500', 'bg-orange-500'
    ];

    const colorIndex = user?.name
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;

    return { initials, color: colors[colorIndex] };
  }

  // Load users with filtering
  async function loadUsers(forceRefresh = false) {
    loading = true;
    error = null;

    try {
      // If we're just initializing with no filters, use the data from SSR
      // Skip this optimization if forceRefresh is true (after CRUD operations)
      if (!forceRefresh && !searchQuery && !selectedRole && users.length > 0 && !error) {
        loading = false;
        return;
      }
      
      // Build query parameters
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (selectedRole) params.append('role', selectedRole);
      
      // Add a cache-busting parameter when forcing refresh
      if (forceRefresh) {
        params.append('_t', Date.now());
      }
      
      console.log(`Fetching users with params: ${params.toString()}`);
      
      // Fetch users from API
      const response = await fetch(`/api/users?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          // Add cache control headers to prevent caching when forcing refresh
          ...(forceRefresh ? { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' } : {})
        },
        credentials: 'same-origin' // Include cookies for authentication
      });
      
      // Log response status for debugging
      console.log(`API response status: ${response.status}`);
      
      // Handle response
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        
        if (response.status === 401 || response.status === 403) {
          error = "Authentication error. Please try refreshing the page.";
        } else {
          error = `Error loading users: ${response.statusText || 'Unknown error'}`;
        }
        return;
      }
      
      const data = await response.json();
      console.log(`Received ${data.users?.length || 0} users from API`);
      users = data.users || [];
      totalUserCount = data.totalCount || 0; // Update total user count
    } catch (err) {
      console.error('Error loading users:', err);
      error = `Error loading users: ${err.message}`;
      // Don't clear users array if there's an error, keep showing existing data
    } finally {
      loading = false;
    }
  }

  // Handle role filter change
  function handleRoleFilterChange() {
    loadUsers(true);
  }

  // Open edit modal
  function openEditModal(user) {
    // Create a deep copy of the user to prevent reference issues
    editingUser = JSON.parse(JSON.stringify(user));
    formData = {
      id: user?.id, // Explicitly store the ID in the form data
      name: user?.name || '',
      email: user?.email || '',
      role: user?.role || 'visitor',
      active: user?.active || true
    };
    showEditModal = true;
    console.log('Opening edit modal for user:', editingUser);
  }

  // Open create modal
  function openCreateModal() {
    resetFormData();
    showCreateModal = true;
  }

  // Open delete modal
  function openDeleteModal(user) {
    editingUser = user;
    showDeleteModal = true;
  }

  // Create user
  async function createUser() {
    console.log('Creating user with data:', formData);
    
    // Validate required fields
    if (!formData.name || !formData.name.trim() === '') {
      error = "Please enter a name";
      return;
    }
    
    if (!formData.email || !formData.email.trim() === '') {
      error = "Please enter an email address";
      return;
    }
    
    if (!formData.role) {
      error = "Please select a role";
      return;
    }
    
    loading = true;
    error = null;

    try {
      console.log('Sending API request to create user...');
      
      // Create a copy of the form data to ensure we're sending clean data
      const userData = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        role: formData.role,
        active: formData.active
      };
      
      console.log('Sending user data:', userData);
      
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'same-origin', // Include cookies for authentication
        body: JSON.stringify(userData)
      });

      console.log('API response status:', response.status);
      
      // Get response text first to avoid parsing errors
      const responseText = await response.text();
      console.log('Response text:', responseText);
      
      // Only try to parse JSON if there's content
      let data = {};
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          console.error('Error parsing JSON response:', e);
        }
      }
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("You don't have permission to create users. Please contact an administrator.");
        } else {
          console.error('Error response data:', data);
          throw new Error(data.error || `Failed to create user: ${response.statusText}`);
        }
      }

      console.log('User created successfully:', data);

      // Reload users
      await loadUsers(true);
      showCreateModal = false;
      resetFormData();
    } catch (err) {
      console.error('Error creating user:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Update user
  async function updateUser() {
    if (!editingUser || !editingUser.id) {
      error = "User information is missing";
      return;
    }

    // Validate required fields
    if (!formData.name || !formData.name.trim() === '') {
      error = "Please enter a name";
      return;
    }
    
    if (!formData.email || !formData.email.trim() === '') {
      error = "Please enter an email address";
      return;
    }
    
    if (!formData.role) {
      error = "Please select a role";
      return;
    }

    loading = true;
    error = null;

    try {
      console.log('Updating user:', editingUser.id, 'with data:', formData);
      
      // Prevent changing superuser role
      if (editingUser?.role === 'superuser' && formData.role !== 'superuser') {
        throw new Error('Cannot change the superuser role');
      }

      // Create a clean copy of the form data
      const userData = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        role: formData.role,
        active: formData.active
      };

      // Log the request details for debugging
      console.log(`Sending PUT request to /api/users/${editingUser.id}`, userData);

      const response = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'same-origin', // Include cookies for authentication
        body: JSON.stringify(userData)
      });

      console.log('Update response status:', response.status);
      
      // Get response text first to avoid parsing errors
      const responseText = await response.text();
      console.log('Response text:', responseText);
      
      // Only try to parse JSON if there's content
      let data = {};
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          console.error('Error parsing JSON response:', e);
        }
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error("You don't have permission to update users. Please contact an administrator.");
      }
      
      if (!response.ok) {
        console.error('Error response data:', data);
        throw new Error(data.error || `Failed to update user: ${response.statusText}`);
      }

      console.log('User updated successfully:', data);

      // Reload users
      await loadUsers(true);
      showEditModal = false;
      editingUser = null;
    } catch (err) {
      console.error('Error updating user:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Delete user
  async function deleteUser() {
    if (!editingUser) return;

    loading = true;
    error = null;

    try {
      console.log('Deleting user:', editingUser.id);
      
      // Special protection for superuser role
      if (editingUser.role === 'superuser' && currentUser.role !== 'superuser') {
        throw new Error('Only superusers can delete other superusers');
      }
      
      // Prevent self-deletion
      if (editingUser.id === currentUser.id) {
        throw new Error('You cannot delete your own account');
      }

      const response = await fetch(`/api/users/${editingUser.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'same-origin' // Include cookies for authentication
      });

      console.log('Delete response status:', response.status);
      
      // Get response text first to avoid parsing errors
      const responseText = await response.text();
      console.log('Response text:', responseText);
      
      // Only try to parse JSON if there's content
      let data = {};
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          console.error('Error parsing JSON response:', e);
        }
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error("You don't have permission to delete users. Please contact an administrator.");
      }
      
      if (!response.ok) {
        console.error('Error response data:', data);
        throw new Error(data.error || `Failed to delete user: ${response.statusText}`);
      }

      console.log('User deleted successfully');

      // Reload users
      await loadUsers(true);
      showDeleteModal = false;
      editingUser = null;
    } catch (err) {
      console.error('Error deleting user:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Initialize
  onMount(() => {
    // Initial users are loaded from server-side props
    // Only call loadUsers if we need to apply filters
    if (searchQuery || selectedRole) {
      loadUsers();
    }
    
    // Set up resize observer to check container width
    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          // Switch to card layout if container width is below 768px
          useCardLayout = entry.contentRect.width < 768;
        }
      });

      if (containerRef) {
        resizeObserver.observe(containerRef);
      }

      return () => {
        if (containerRef) {
          resizeObserver.unobserve(containerRef);
        }
      };
    } else {
      // Fallback for browsers without ResizeObserver
      const checkWidth = () => {
        if (containerRef) {
          useCardLayout = containerRef.offsetWidth < 768;
        }
      };

      checkWidth();
      window.addEventListener('resize', checkWidth);

      return () => {
        window.removeEventListener('resize', checkWidth);
      };
    }
  });
</script>

<div class="h-full flex flex-col">
  <!-- Fixed Header -->
  <div class="sticky top-0 z-10 p-6 bg-surface border-b">
    <h1 class="text-3xl font-bold mb-4 text-primary">User Management</h1>
    
    <div class="flex flex-wrap gap-3">
      <div class="relative flex-grow min-w-[200px] max-w-md">
        <input
          type="text"
          placeholder="Search users..."
          class="w-full px-3 py-2 border border-subtle rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-surface text-primary"
          bind:value={searchQuery}
          on:input={handleSearch}
        />
        <button 
          class="absolute inset-y-0 right-0 px-3 text-secondary hover:text-primary cursor-pointer"
          on:click={() => { searchQuery = ''; loadUsers(true); }}
          aria-label="Clear search"
        >
          {#if searchQuery}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
            </svg>
          {/if}
        </button>
      </div>
      
      <div class="w-auto min-w-[150px] relative">
        <select
          class="w-full px-3 py-2 border border-subtle rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-surface text-primary pr-8 appearance-none cursor-pointer"
          bind:value={selectedRole}
          on:change={() => loadUsers(true)}
          style="background-position: right 0.5rem center; background-repeat: no-repeat; background-image: url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 20 20%22%3E%3Cpath stroke=%22%236b7280%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%221.5%22 d=%22m6 8 4 4 4-4%22/%3E%3C/svg%3E');"
        >
          <option value="">All Roles</option>
          {#each roles as role}
            <option value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
          {/each}
        </select>
        {#if selectedRole}
          <button 
            class="absolute inset-y-0 right-8 px-2 text-secondary hover:text-primary cursor-pointer"
            on:click={() => { selectedRole = ''; loadUsers(true); }}
            aria-label="Clear role filter"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
          </button>
        {/if}
      </div>
      
      <button
        class="px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary-hover flex items-center justify-center whitespace-nowrap cursor-pointer"
        on:click={openCreateModal}
        aria-label="Create new user"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
        Create User
      </button>
    </div>
    
    <div class="flex justify-end mt-4">
      <div class="flex items-center">
        {#if searchQuery || selectedRole}
          <div class="bg-surface-2 text-primary rounded-lg px-3 py-1 mr-2 border border-subtle">
            <span class="font-bold">{users.length}</span> <span class="text-secondary">matching filters</span>
            <button 
              class="ml-2 text-secondary hover:text-primary inline-flex items-center"
              on:click={() => { 
                searchQuery = ''; 
                selectedRole = ''; 
                loadUsers(true); 
              }}
              aria-label="Clear all filters"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        {/if}
        <div class="bg-surface-2 text-primary rounded-lg px-3 py-1 border border-subtle">
          <span class="font-bold">{totalUserCount}</span> <span class="text-secondary">total users</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Main Content -->
  <div class="flex-1 overflow-auto p-6">
    {#if error && !showEditModal && !showCreateModal && !showDeleteModal}
      <div style="background-color: var(--error); border: 1px solid var(--error); color: var(--text-accent); padding: 0.75rem 1rem; border-radius: 0.375rem; margin-bottom: 1rem;">
        <p>{error}</p>
      </div>
    {/if}

    <div class="bg-card rounded-lg shadow overflow-hidden" bind:this={containerRef}>
      <div class="overflow-x-auto">
        <!-- Card layout for mobile or narrow containers -->
        {#if useCardLayout}
          <div class="grid grid-cols-1 gap-4 p-4">
            {#if users.length === 0}
              <div class="text-center py-8 text-secondary">
                {#if loading}
                  <div class="flex justify-center">
                    <svg class="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                {:else}
                  <p>No users found</p>
                {/if}
              </div>
            {:else}
              {#each users as user (user.id)}
                <div class="bg-surface p-4 rounded-lg shadow-sm border">
                  <div class="flex items-center space-x-3 mb-3">
                    {#if typeof getProfileImageUrl(user) === 'string'}
                      <img src={getProfileImageUrl(user)} alt="{user?.name || 'User'}" class="h-10 w-10 rounded-full object-cover" />
                    {:else}
                      <div class="h-10 w-10 rounded-full flex items-center justify-center text-white" style="background-color: var(--primary);">
                        {getProfileImageUrl(user)?.initials || '??'}
                      </div>
                    {/if}
                    <div>
                      <div class="font-medium text-primary">{user?.name || 'User'}</div>
                      <div class="text-secondary text-sm">{user?.email || ''}</div>
                    </div>
                  </div>

                  <div class="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div>
                      <span class="text-secondary">Role:</span>
                      <span class="ml-1 font-medium text-primary">{user?.role.charAt(0).toUpperCase() + user?.role.slice(1) || ''}</span>
                    </div>
                    <div>
                      <span class="text-secondary">Status:</span>
                      <span class="ml-1">
                        {#if user?.active}
                          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success text-on-success">
                            Active
                          </span>
                        {:else}
                          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-error text-on-error">
                            Inactive
                          </span>
                        {/if}
                      </span>
                    </div>
                  </div>

                  <div class="flex justify-end space-x-2">
                    <button
                      class="text-primary hover:text-primary-dark cursor-pointer"
                      on:click={() => openEditModal(user)}
                      aria-label="Edit user {user?.name || 'User'}"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      class="text-error hover:bg-error-dark {(user?.id === currentUser?.id || (user?.role === 'superuser' && !userHasRole(currentUser, 'superuser'))) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
                      on:click={() => openDeleteModal(user)}
                      aria-label="Delete user {user?.name || 'User'}"
                      disabled={user?.id === currentUser?.id || (user?.role === 'superuser' && !userHasRole(currentUser, 'superuser'))}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        {:else}
          <!-- Table layout for wider containers -->
          <table class="min-w-full divide-y divide">
            <thead class="bg-surface-secondary">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                  User
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                  Role
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody class="bg-surface divide-y divide">
              {#if users.length === 0}
                <tr>
                  <td colspan="4" class="px-6 py-4 text-center text-secondary">
                    {#if loading}
                      <div class="flex justify-center">
                        <svg class="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      </div>
                    {:else}
                      <p>No users found</p>
                    {/if}
                  </td>
                </tr>
              {:else}
                {#each users as user (user.id)}
                  <tr class="hover:bg-surface-hover">
                    <td class="px-6 py-4 whitespace-nowrap">
                      <div class="flex items-center">
                        <div class="flex-shrink-0 h-10 w-10">
                          {#if typeof getProfileImageUrl(user) === 'string'}
                            <img src={getProfileImageUrl(user)} alt="{user?.name || 'User'}" class="h-10 w-10 rounded-full object-cover" />
                          {:else}
                            <div class="h-10 w-10 rounded-full flex items-center justify-center text-white" style="background-color: var(--primary);">
                              {getProfileImageUrl(user)?.initials || '??'}
                            </div>
                          {/if}
                        </div>
                        <div class="ml-4">
                          <div class="text-sm font-medium text-primary">{user?.name || 'User'}</div>
                          <div class="text-sm text-secondary">{user?.email || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                      <div class="text-sm text-primary">{user?.role.charAt(0).toUpperCase() + user?.role.slice(1) || ''}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                      {#if user?.active}
                        <span class="px-2 inline-flex text-xs leading-5 font-medium bg-success text-on-success">
                          Active
                        </span>
                      {:else}
                        <span class="px-2 inline-flex text-xs leading-5 font-medium bg-error text-on-error">
                          Inactive
                        </span>
                      {/if}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div class="flex justify-end space-x-3">
                        <button
                          class="text-primary hover:text-primary-dark cursor-pointer"
                          on:click={() => openEditModal(user)}
                          aria-label="Edit user {user?.name || 'User'}"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          class="text-error hover:bg-error-dark {(user?.id === currentUser?.id || (user?.role === 'superuser' && !userHasRole(currentUser, 'superuser'))) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
                          on:click={() => openDeleteModal(user)}
                          aria-label="Delete user {user?.name || 'User'}"
                          disabled={user?.id === currentUser?.id || (user?.role === 'superuser' && !userHasRole(currentUser, 'superuser'))}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        {/if}
      </div>
    </div>
  </div>
</div>

<!-- Create User Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 bg-surface-overlay backdrop-blur-sm flex items-center justify-center z-50">
    <div class="bg-surface-2 bg-opacity-95 rounded-lg shadow-app-lg max-w-md w-full p-6 mx-4 border border-subtle">
      <h2 class="text-2xl font-bold mb-4 text-primary">Create User</h2>

      {#if error}
        <div class="bg-error bg-opacity-10 border border-error text-error px-4 py-3 rounded mb-4">
          <p>{error}</p>
        </div>
      {/if}

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1 text-secondary" for="create-name">Name</label>
          <input 
            type="text" 
            id="create-name" 
            class="w-full px-3 py-2 border border-subtle rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-surface text-primary" 
            bind:value={formData.name}
            required
            placeholder="Enter full name"
          />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1 text-secondary" for="create-email">Email</label>
          <input 
            type="email" 
            id="create-email" 
            class="w-full px-3 py-2 border border-subtle rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-surface text-primary" 
            bind:value={formData.email}
            required
            placeholder="Enter email address"
          />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1 text-secondary" for="create-role">Role</label>
          <select 
            id="create-role" 
            class="w-full px-3 py-2 border border-subtle rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-surface text-primary cursor-pointer"
            bind:value={formData.role}
          >
            {#each roles as role}
              <option value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
            {/each}
          </select>
        </div>

        <div class="flex items-center">
          <input 
            type="checkbox" 
            id="create-active" 
            class="mr-2 h-4 w-4 text-primary focus:ring-primary border border-subtle rounded" 
            bind:checked={formData.active}
          />
          <label for="create-active" class="text-secondary font-medium">Active</label>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          <button 
            type="button" 
            class="px-4 py-2 border border-subtle rounded-lg text-secondary hover:bg-surface-2 font-medium cursor-pointer" 
            on:click={() => showCreateModal = false}
            disabled={loading}
            aria-label="Cancel creating user"
          >
            Cancel
          </button>
          <button 
            type="button" 
            class="px-4 py-2 bg-primary text-accent rounded-lg flex items-center hover:bg-primary-dark font-medium cursor-pointer" 
            on:click={createUser}
            disabled={loading || !formData.name || !formData.email}
            aria-label="Create user"
          >
            {#if loading}
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            {/if}
            Create User
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Edit User Modal -->
{#if showEditModal}
  <div class="fixed inset-0 bg-surface-overlay backdrop-blur-sm flex items-center justify-center z-50">
    <div class="bg-surface-2 bg-opacity-95 rounded-lg shadow-app-lg max-w-md w-full p-6 mx-4 border border-subtle">
      <h2 class="text-2xl font-bold mb-4 text-primary">Edit User</h2>

      {#if error}
        <div class="bg-error bg-opacity-10 border border-error text-error px-4 py-3 rounded mb-4">
          <p>{error}</p>
        </div>
      {/if}

      <form on:submit|preventDefault={updateUser} class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1 text-secondary" for="name">Name</label>
          <input 
            type="text" 
            id="name" 
            class="w-full px-3 py-2 border border-subtle rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-surface text-primary" 
            bind:value={formData.name}
            required
            placeholder="Enter full name"
          />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1 text-secondary" for="email">Email</label>
          <input 
            type="email" 
            id="email" 
            class="w-full px-3 py-2 border border-subtle rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-surface text-primary" 
            bind:value={formData.email}
            required
            placeholder="Enter email address"
          />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1 text-secondary" for="role">Role</label>
          <select 
            id="role" 
            class="w-full px-3 py-2 border border-subtle rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-surface text-primary cursor-pointer"
            bind:value={formData.role}
          >
            {#each roles as role}
              <option value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
            {/each}
          </select>
        </div>

        <div class="flex items-center">
          <input 
            type="checkbox" 
            id="active" 
            class="mr-2 h-4 w-4 text-primary focus:ring-primary border border-subtle rounded" 
            bind:checked={formData.active}
          />
          <label for="active" class="text-secondary font-medium">Active</label>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          <button 
            type="button" 
            class="px-4 py-2 border border-subtle rounded-lg text-secondary hover:bg-surface-2 font-medium cursor-pointer" 
            on:click={() => showEditModal = false}
            disabled={loading}
            aria-label="Cancel editing user"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            class="px-4 py-2 bg-primary text-accent rounded-lg flex items-center hover:bg-primary-dark font-medium cursor-pointer" 
            disabled={loading}
            aria-label="Save user changes"
          >
            {#if loading}
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            {/if}
            Save Changes
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Delete User Modal -->
{#if showDeleteModal && editingUser}
  <div class="fixed inset-0 bg-surface-overlay backdrop-blur-sm flex items-center justify-center z-50">
    <div class="bg-surface-2 bg-opacity-95 rounded-lg shadow-app-lg max-w-md w-full p-4 sm:p-6 mx-4 border border-subtle">
      <h2 class="text-2xl font-bold mb-4 text-primary">Delete User</h2>

      <p class="mb-4 text-secondary">Are you sure you want to delete the user <strong>{editingUser?.name || 'User'}</strong>? This action cannot be undone.</p>

      {#if error}
        <div class="bg-error bg-opacity-10 border border-error text-error px-4 py-3 rounded mb-4">
          <p>{error}</p>
        </div>
      {/if}

      <div class="flex justify-end gap-3 mt-6">
        <button 
          type="button" 
          class="px-4 py-2 border border-subtle rounded-lg text-secondary hover:bg-surface-2 font-medium cursor-pointer" 
          on:click={() => showDeleteModal = false}
          disabled={loading}
          aria-label="Cancel deleting user"
        >
          Cancel
        </button>
        <button 
          type="button" 
          class="px-4 py-2 bg-error text-on-error rounded-lg flex items-center hover:bg-error-dark cursor-pointer" 
          on:click={deleteUser}
          disabled={loading}
          aria-label="Confirm delete user"
        >
          {#if loading}
            <svg class="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          {/if}
          Delete
        </button>
      </div>
    </div>
  </div>
{/if}
