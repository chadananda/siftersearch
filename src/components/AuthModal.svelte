<script>
  import { login, signup, getAuthState } from '../lib/auth.js';

  let { isOpen = $bindable(false), onClose = () => {} } = $props();

  let mode = $state('login'); // 'login' or 'signup'
  let email = $state('');
  let password = $state('');
  let name = $state('');
  let loading = $state(false);
  let error = $state('');

  async function handleSubmit() {
    if (loading) return;

    error = '';
    loading = true;

    try {
      let result;
      if (mode === 'login') {
        result = await login(email, password);
      } else {
        result = await signup(email, password, name);
      }

      if (result.success) {
        // Close modal on success
        isOpen = false;
        onClose();
        // Reset form
        email = '';
        password = '';
        name = '';
      } else {
        error = result.error;
      }
    } catch (err) {
      error = err.message || 'An error occurred';
    } finally {
      loading = false;
    }
  }

  function switchMode() {
    mode = mode === 'login' ? 'signup' : 'login';
    error = '';
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      isOpen = false;
      onClose();
    }
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
      isOpen = false;
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
  >
    <div class="w-full max-w-md bg-slate-800 rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-700/50">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <button
            onclick={() => { isOpen = false; onClose(); }}
            class="text-slate-400 hover:text-white transition-colors"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Form -->
      <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="p-6 space-y-4">
        {#if error}
          <div class="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        {/if}

        {#if mode === 'signup'}
          <div>
            <label for="name" class="block text-sm font-medium text-slate-300 mb-1">Name</label>
            <input
              id="name"
              type="text"
              bind:value={name}
              placeholder="Your name"
              class="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500 placeholder-slate-500"
            />
          </div>
        {/if}

        <div>
          <label for="email" class="block text-sm font-medium text-slate-300 mb-1">Email</label>
          <input
            id="email"
            type="email"
            bind:value={email}
            required
            placeholder="you@example.com"
            class="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500 placeholder-slate-500"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-slate-300 mb-1">Password</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            required
            minlength="8"
            placeholder="••••••••"
            class="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500 placeholder-slate-500"
          />
          {#if mode === 'signup'}
            <p class="mt-1 text-xs text-slate-500">Minimum 8 characters</p>
          {/if}
        </div>

        <button
          type="submit"
          disabled={loading}
          class="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl font-medium transition-colors"
        >
          {#if loading}
            <span class="flex items-center justify-center gap-2">
              <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </span>
          {:else}
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          {/if}
        </button>
      </form>

      <!-- Footer -->
      <div class="px-6 py-4 bg-slate-900/50 border-t border-slate-700/50 text-center">
        <p class="text-sm text-slate-400">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          <button
            onclick={switchMode}
            class="ml-1 text-blue-400 hover:text-blue-300 transition-colors"
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  </div>
{/if}
