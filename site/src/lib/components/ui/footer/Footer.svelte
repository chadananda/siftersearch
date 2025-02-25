<script>
  import Shadow from '../shared/Shadow.svelte';
  const year = new Date().getFullYear();
</script>

<Shadow direction="top" />
<div class="h-full flex items-center justify-between px-4">
  <p class="text-primary opacity-50">&copy; {year} SifterSearch<span class="hidden sm:inline">. All rights reserved</span>.</p>
  <div class="flex items-center gap-6">
    <a href="/about" class="text-primary opacity-50 hover:opacity-100 transition-opacity">About</a>
    <a href="/terms" class="text-primary opacity-50 hover:opacity-100 transition-opacity">Terms <span class="hidden sm:inline"> & Privacy</span></a>
    <a href="/contact" class="text-primary opacity-50 hover:opacity-100 transition-opacity">Contact</a>
  </div>
</div>
