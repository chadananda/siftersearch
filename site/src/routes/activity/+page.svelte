<script>
  let recentActivity = {
    documents: [
      {
        id: 1,
        title: "Introduction to World Religions",
        type: "article",
        action: "added",
        timestamp: "2025-02-23T10:30:00",
        user: "John Smith",
        site: "bahai-library.com"
      },
      {
        id: 2,
        title: "Letters of Shoghi Effendi",
        type: "letter",
        action: "modified",
        timestamp: "2025-02-23T09:15:00",
        user: "Jane Doe",
        site: "bahai-library.com"
      },
      {
        id: 3,
        title: "History of the Faith",
        type: "book",
        action: "added",
        timestamp: "2025-02-22T16:45:00",
        user: "Robert Brown",
        site: "bahai-library.com"
      },
      {
        id: 4,
        title: "Early Believers in the West",
        type: "article",
        action: "modified",
        timestamp: "2025-02-22T15:30:00",
        user: "John Smith",
        site: "bahai-library.com"
      },
      {
        id: 5,
        title: "Compilation of Writings",
        type: "book",
        action: "added",
        timestamp: "2025-02-22T14:20:00",
        user: "Jane Doe",
        site: "bahai-library.com"
      },
      {
        id: 6,
        title: "The Baha'i Faith and the Environment",
        type: "article",
        action: "modified",
        timestamp: "2025-02-22T13:15:00",
        user: "Robert Brown",
        site: "bahai-library.com"
      },
      {
        id: 7,
        title: "The Importance of Prayer",
        type: "article",
        action: "added",
        timestamp: "2025-02-22T12:10:00",
        user: "John Smith",
        site: "bahai-library.com"
      },
      {
        id: 8,
        title: "The Role of Women in the Baha'i Faith",
        type: "article",
        action: "modified",
        timestamp: "2025-02-22T11:05:00",
        user: "Jane Doe",
        site: "bahai-library.com"
      },
      {
        id: 9,
        title: "The Baha'i Faith and Social Justice",
        type: "article",
        action: "added",
        timestamp: "2025-02-22T10:00:00",
        user: "Robert Brown",
        site: "bahai-library.com"
      },
      {
        id: 10,
        title: "The Importance of Community",
        type: "article",
        action: "modified",
        timestamp: "2025-02-22T09:00:00",
        user: "John Smith",
        site: "bahai-library.com"
      }
    ],
    users: [
      {
        name: "John Smith",
        avatar: "https://placehold.co/100",
        role: "Senior Editor",
        activity: {
          timeSpent: 127, // hours in last 30 days
          additions: 45,
          modifications: 23,
          lastActive: "2025-02-23T15:30:00",
          dailyActivity: [4, 6, 8, 5, 7, 9, 4, 5, 7, 8, 6, 4, 5, 7, 8, 9, 5, 4, 6, 7, 8, 5, 4, 6, 7, 8, 9, 5, 4, 6], // last 30 days
          topSites: [
            { name: "bahai-library.com", count: 45 },
            { name: "bahai.org", count: 23 }
          ]
        }
      },
      {
        name: "Jane Doe",
        avatar: "https://placehold.co/100",
        role: "Content Editor",
        activity: {
          timeSpent: 98,
          additions: 32,
          modifications: 56,
          lastActive: "2025-02-23T17:45:00",
          dailyActivity: [5, 7, 4, 6, 8, 5, 7, 8, 6, 4, 5, 7, 8, 9, 5, 4, 6, 7, 8, 5, 4, 6, 7, 8, 9, 5, 4, 6, 7, 8],
          topSites: [
            { name: "bahai-library.com", count: 58 },
            { name: "bahai.org", count: 30 }
          ]
        }
      },
      {
        name: "Robert Brown",
        avatar: "https://placehold.co/100",
        role: "Research Assistant",
        activity: {
          timeSpent: 76,
          additions: 28,
          modifications: 19,
          lastActive: "2025-02-23T12:20:00",
          dailyActivity: [3, 4, 5, 6, 4, 5, 3, 4, 6, 5, 4, 3, 5, 6, 4, 3, 5, 4, 6, 5, 4, 3, 5, 6, 4, 5, 3, 4, 5, 6],
          topSites: [
            { name: "bahai-library.com", count: 35 },
            { name: "bahai.org", count: 12 }
          ]
        }
      }
    ]
  };

  function getTimeAgo(timestamp) {
    const now = new Date('2025-02-23T19:07:00-07:00');
    const date = new Date(timestamp);
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function formatHours(hours) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }

  function getSparklinePoints(data, width = 100, height = 20) {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min;
    const step = width / (data.length - 1);
    
    return data.map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');
  }

  // Show only last 10 documents
  $: recentDocs = recentActivity.documents.slice(0, 10);
</script>

<div class="h-full flex flex-col">
  <!-- Fixed Header -->
  <div class="p-6 bg-surface-1 border-b border-subtle">
    <h1 class="text-3xl font-bold">Recent Activity</h1>
  </div>

  <div class="flex-1 overflow-auto p-6 space-y-6">
    <!-- Recent Documents -->
    <div>
      <h2 class="text-xl font-semibold mb-4">Recent Documents</h2>
      <div class="bg-surface-2 rounded-lg overflow-hidden">
        <table class="w-full border-collapse">
          <thead class="bg-surface-2 border-b border-subtle">
            <tr>
              <th class="px-4 py-2 text-left text-sm font-medium">Document</th>
              <th class="px-4 py-2 text-left text-sm font-medium">Action</th>
              <th class="px-4 py-2 text-left text-sm font-medium">User</th>
              <th class="px-4 py-2 text-left text-sm font-medium">Time</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-subtle">
            {#each recentDocs as doc}
              <tr class="hover:bg-surface-3 transition-colors">
                <td class="px-4 py-2">
                  <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
                      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <div class="font-medium text-sm">{doc.title}</div>
                      <div class="text-xs text-text-tertiary capitalize">{doc.type}</div>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-2">
                  <span class="px-2 py-0.5 text-xs rounded-full {
                    doc.action === 'added' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                  }">
                    {doc.action}
                  </span>
                </td>
                <td class="px-4 py-2 text-sm">{doc.user}</td>
                <td class="px-4 py-2 text-sm text-text-tertiary">{getTimeAgo(doc.timestamp)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- User Activity -->
    <div>
      <h2 class="text-xl font-semibold mb-4">User Activity</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each recentActivity.users as user}
          <div class="bg-surface-2 rounded-lg p-4">
            <div class="flex items-center gap-3">
              <img src={user.avatar} alt={user.name} class="w-10 h-10 rounded-full bg-surface-3" />
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline justify-between">
                  <h3 class="font-medium text-sm truncate">{user.name}</h3>
                  <span class="text-xs text-text-tertiary">{getTimeAgo(user.activity.lastActive)}</span>
                </div>
                <div class="text-xs text-text-tertiary">{user.role}</div>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3 mt-3">
              <div class="bg-surface-3 rounded px-2 py-1.5">
                <div class="text-xs text-text-tertiary">Added</div>
                <div class="text-sm font-medium text-success">+{user.activity.additions}</div>
              </div>
              <div class="bg-surface-3 rounded px-2 py-1.5">
                <div class="text-xs text-text-tertiary">Edited</div>
                <div class="text-sm font-medium text-warning">{user.activity.modifications}</div>
              </div>
              <div class="bg-surface-3 rounded px-2 py-1.5">
                <div class="text-xs text-text-tertiary">Active</div>
                <div class="text-sm font-medium">{formatHours(user.activity.timeSpent)}</div>
              </div>
            </div>

            <div class="mt-3">
              <svg width="100%" height="20" class="text-accent">
                <polyline
                  points={getSparklinePoints(user.activity.dailyActivity, 1000, 15)}
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  class="opacity-75"
                />
              </svg>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  /* Table styles */
  th {
    font-weight: 500;
  }

  tr {
    @apply transition-colors;
  }

  /* Custom scrollbar for Webkit browsers */
  .overflow-auto::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .overflow-auto::-webkit-scrollbar-track {
    background: var(--surface-3);
    border-radius: 3px;
  }

  .overflow-auto::-webkit-scrollbar-thumb {
    background: var(--text-tertiary);
    border-radius: 3px;
  }

  .overflow-auto::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }
</style>
