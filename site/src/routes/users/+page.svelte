<script>
  import { onMount } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';

  // Mock data - replace with API call
  let users = [
    { 
      id: 1,
      name: 'John Doe', 
      email: 'john@example.com', 
      role: 'Editor',
      lastActive: '2024-02-23T10:30:00',
      status: 'active'
    },
    { 
      id: 2,
      name: 'Jane Smith', 
      email: 'jane@example.com', 
      role: 'Librarian',
      lastActive: '2024-02-23T15:45:00',
      status: 'active'
    },
    { 
      id: 3,
      name: 'Bob Wilson', 
      email: 'bob@example.com', 
      role: 'Editor',
      lastActive: '2024-02-22T09:15:00',
      status: 'inactive'
    }
  ];

  let searchQuery = '';
  let sortField = 'name';
  let sortDirection = 'asc';
  let selectedRole = 'all';
  let selectedStatus = 'all';

  $: filteredUsers = users
    .filter(user => {
      const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          user.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = selectedRole === 'all' || user.role.toLowerCase() === selectedRole;
      const matchesStatus = selectedStatus === 'all' || user.status === selectedStatus;
      return matchesSearch && matchesRole && matchesStatus;
    })
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const direction = sortDirection === 'asc' ? 1 : -1;
      return aVal > bVal ? direction : -direction;
    });

  function handleSort(field) {
    if (sortField === field) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDirection = 'asc';
    }
  }

  function getSortIcon(field) {
    if (sortField !== field) return '↕️';
    return sortDirection === 'asc' ? '↑' : '↓';
  }
</script>

<div class="p-6">
  <h1 class="text-3xl font-bold mb-6">User Management</h1>
  
  <div class="max-w-6xl mx-auto">
    <Card>
      <div class="space-y-6">
        <!-- Header -->
        <div class="flex flex-wrap gap-4 items-center justify-between">
          <div class="flex-1 min-w-[280px]">
            <div class="relative">
              <input
                type="text"
                bind:value={searchQuery}
                placeholder="Search users..."
                class="w-full h-10 pl-10 pr-4 bg-surface-2 rounded-lg ring-1 ring-white/10 hover:ring-white/20 focus:ring-white/20 focus:outline-none"
              />
              <svg
                class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          <div class="flex gap-4">
            <select
              bind:value={selectedRole}
              class="px-3 py-2 bg-surface-2 rounded-lg ring-1 ring-white/10"
            >
              <option value="all">All Roles</option>
              <option value="editor">Editor</option>
              <option value="librarian">Librarian</option>
            </select>

            <select
              bind:value={selectedStatus}
              class="px-3 py-2 bg-surface-2 rounded-lg ring-1 ring-white/10"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            <button class="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg flex items-center gap-2">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add User
            </button>
          </div>
        </div>

        <!-- Table -->
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-subtle">
                <th class="text-left py-4 px-6">
                  <button
                    class="flex items-center gap-2 hover:text-accent"
                    on:click={() => handleSort('name')}
                  >
                    Name
                    <span class="text-xs">{getSortIcon('name')}</span>
                  </button>
                </th>
                <th class="text-left py-4 px-6">
                  <button
                    class="flex items-center gap-2 hover:text-accent"
                    on:click={() => handleSort('email')}
                  >
                    Email
                    <span class="text-xs">{getSortIcon('email')}</span>
                  </button>
                </th>
                <th class="text-left py-4 px-6">
                  <button
                    class="flex items-center gap-2 hover:text-accent"
                    on:click={() => handleSort('role')}
                  >
                    Role
                    <span class="text-xs">{getSortIcon('role')}</span>
                  </button>
                </th>
                <th class="text-left py-4 px-6">
                  <button
                    class="flex items-center gap-2 hover:text-accent"
                    on:click={() => handleSort('lastActive')}
                  >
                    Last Active
                    <span class="text-xs">{getSortIcon('lastActive')}</span>
                  </button>
                </th>
                <th class="text-left py-4 px-6">Status</th>
                <th class="text-right py-4 px-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredUsers as user}
                <tr class="border-b border-subtle hover:bg-surface-2">
                  <td class="py-4 px-6">{user.name}</td>
                  <td class="py-4 px-6">
                    <a href="mailto:{user.email}" class="text-accent hover:underline">{user.email}</a>
                  </td>
                  <td class="py-4 px-6">
                    <span class="px-2 py-1 text-xs rounded-full bg-surface-3">
                      {user.role}
                    </span>
                  </td>
                  <td class="py-4 px-6 text-text-secondary">
                    {new Date(user.lastActive).toLocaleString()}
                  </td>
                  <td class="py-4 px-6">
                    <span class="px-2 py-1 text-xs rounded-full {user.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}">
                      {user.status}
                    </span>
                  </td>
                  <td class="py-4 px-6">
                    <div class="flex justify-end gap-2">
                      <button
                        class="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-3 rounded-lg"
                        title="Edit user"
                      >
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        class="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg"
                        title="Delete user"
                      >
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  </div>
</div>
