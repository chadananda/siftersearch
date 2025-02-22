<script>
  import PageTitle from '$lib/components/ui/PageTitle.svelte';
  import Card from '$lib/components/ui/Card.svelte';

  const users = [
    { name: 'John Doe', email: 'john@example.com', role: 'Editor' },
    { name: 'Jane Smith', email: 'jane@example.com', role: 'Librarian' },
    { name: 'Bob Wilson', email: 'bob@example.com', role: 'Editor' }
  ];
</script>

<div class="p-6">
  <PageTitle title="User Management" />
  
  <div class="max-w-4xl mx-auto">
    <Card>
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <h2 class="text-lg font-semibold">Users</h2>
          <button class="btn-primary">Add User</button>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-subtle">
                <th class="text-left py-3 px-4">Name</th>
                <th class="text-left py-3 px-4">Email</th>
                <th class="text-left py-3 px-4">Role</th>
                <th class="text-right py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each users as user}
                <tr class="border-b border-subtle">
                  <td class="py-3 px-4">{user.name}</td>
                  <td class="py-3 px-4">
                    <a href="mailto:{user.email}" class="text-accent hover:underline">{user.email}</a>
                  </td>
                  <td class="py-3 px-4">{user.role}</td>
                  <td class="py-3 px-4 text-right space-x-2">
                    <button class="text-text-secondary hover:text-text-primary">Edit</button>
                    <button class="text-red-500 hover:text-red-600">Remove</button>
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
