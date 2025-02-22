<script>
  const year = new Date().getFullYear();
</script>

<footer class="h-full flex items-center">
  <div class="container mx-auto px-4">
    <div class="flex justify-between items-center">
      <div class="text-sm text-text-tertiary">{year} SifterSearch. All rights reserved.</div>
      <div class="flex space-x-6">
        <a href="/privacy" class="text-sm text-text-tertiary hover:text-text-secondary">Privacy Policy</a>
        <a href="/terms" class="text-sm text-text-tertiary hover:text-text-secondary">Terms of Service</a>
        <a href="/contact" class="text-sm text-text-tertiary hover:text-text-secondary">Contact</a>
      </div>
    </div>
  </div>
</footer>

<style>
  a, div {
    color: var(--text-tertiary);
  }

  a:hover {
    color: var(--text-secondary);
    transition: color 0.15s ease-in-out;
  }
</style>
