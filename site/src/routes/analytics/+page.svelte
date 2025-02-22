<script>
  import Toolbar from '$lib/components/ui/Toolbar.svelte';
  import { Chart, StatCard } from '$lib/components/ui/dashboard';
  import Icon from '$lib/components/ui/Icon.svelte';
  
  const breadcrumbs = [
    { text: 'Home', href: '/' },
    { text: 'Analytics', href: '/analytics' }
  ];

  // Mock data - will be replaced with real data from API
  const stats = {
    totalQueries: 12543,
    averageResponseTime: '1.2s',
    activeUsers: 234,
    documentViews: 5678
  };

  const queryData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    data: [1200, 1900, 3000, 5000, 8000, 12543]
  };

  const responseTimeData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    data: [2.1, 1.8, 1.5, 1.3, 1.2, 1.2]
  };
</script>

<div class="flex flex-col h-full">
  <Toolbar {breadcrumbs} title="Analytics Dashboard" />

  <div class="p-6 space-y-6">
    <!-- Stats Overview -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard
        title="Total Queries"
        value={stats.totalQueries.toLocaleString()}
        change={15}
      >
        <Icon path="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </StatCard>
      <StatCard
        title="Avg Response Time"
        value={stats.averageResponseTime}
        change={-8}
      >
        <Icon path="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </StatCard>
      <StatCard
        title="Active Users"
        value={stats.activeUsers}
        change={5}
      >
        <Icon path="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </StatCard>
      <StatCard
        title="Document Views"
        value={stats.documentViews.toLocaleString()}
        change={12}
      >
        <Icon path="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </StatCard>
    </div>

    <!-- Charts -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card p-6">
        <Chart
          type="line"
          title="Queries Over Time"
          data={queryData.data}
          labels={queryData.labels}
        />
      </div>
      
      <div class="card p-6">
        <Chart
          type="line"
          title="Average Response Time"
          data={responseTimeData.data}
          labels={responseTimeData.labels}
        />
      </div>
    </div>

    <!-- Additional metrics can be added here -->
  </div>
</div>
