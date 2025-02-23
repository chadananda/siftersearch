<script>
  const year = new Date().getFullYear();
</script>

<div class="fixed bottom-0 left-0 right-0 h-16 bg-surface-2 z-40 footer-shadow">
  <footer class="h-full flex items-center justify-center text-sm text-text-secondary">
    <p>&copy; {year} SifterSearch. All rights reserved.</p>
  </footer>
</div>

<style>
  a, div {
    color: var(--text-tertiary);
  }

  a:hover {
    color: var(--text-secondary);
    transition: color 0.15s ease-in-out;
  }
</style>
