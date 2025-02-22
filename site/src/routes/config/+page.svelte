<script>
  import PageTitle from '$lib/components/ui/PageTitle.svelte';
  import Card from '$lib/components/ui/Card.svelte';
</script>

<div class="p-6">
  <PageTitle title="Library Configuration" />
  
  <div class="max-w-4xl mx-auto space-y-6">
    <Card>
      <div class="space-y-6">
        <h2 class="text-lg font-semibold">Basic Settings</h2>
        <div class="grid grid-cols-1 gap-4">
          <div class="space-y-2">
            <label for="libraryName" class="block text-sm font-medium">Library Name</label>
            <input type="text" id="libraryName" class="w-full rounded-lg border border-subtle px-4 py-2 bg-surface-1" />
          </div>
          <div class="space-y-2">
            <label for="domain" class="block text-sm font-medium">Domain</label>
            <input type="text" id="domain" class="w-full rounded-lg border border-subtle px-4 py-2 bg-surface-1" />
          </div>
        </div>
      </div>
    </Card>

    <Card>
      <div class="space-y-6">
        <h2 class="text-lg font-semibold">Chat Settings</h2>
        <div class="space-y-4">
          <div class="space-y-2">
            <label for="personality" class="block text-sm font-medium">Chat Personality</label>
            <textarea id="personality" rows="4" class="w-full rounded-lg border border-subtle px-4 py-2 bg-surface-1"></textarea>
          </div>
        </div>
      </div>
    </Card>

    <Card>
      <div class="space-y-6">
        <h2 class="text-lg font-semibold">Advanced Settings</h2>
        <div class="space-y-4">
          <div class="space-y-2">
            <label for="crawlRules" class="block text-sm font-medium">Default Crawling Rules</label>
            <textarea id="crawlRules" rows="4" class="w-full rounded-lg border border-subtle px-4 py-2 bg-surface-1" placeholder="Enter crawling rules..."></textarea>
          </div>
        </div>
      </div>
    </Card>
  </div>
</div>
