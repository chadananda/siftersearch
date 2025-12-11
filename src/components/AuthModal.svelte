<script>
  import { login, signup, getAuthState } from '../lib/auth.svelte.js';

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
    class="modal-backdrop"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="auth-modal-title"
    aria-describedby="auth-modal-desc"
    tabindex="-1"
  >
    <div class="modal-container" role="document">
      <!-- Header -->
      <div class="modal-header">
        <div class="header-content">
          <h2 id="auth-modal-title" class="modal-title">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <button
            onclick={() => { isOpen = false; onClose(); }}
            aria-label="Close dialog"
            class="close-btn"
          >
            <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Form -->
      <p id="auth-modal-desc" class="sr-only">
        {mode === 'login' ? 'Sign in to your account to access personalized features.' : 'Create a new account to get started.'}
      </p>
      <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="modal-form" aria-label="{mode === 'login' ? 'Sign in' : 'Create account'} form">
        {#if error}
          <div class="error-box" role="alert" aria-live="assertive">
            {error}
          </div>
        {/if}

        {#if mode === 'signup'}
          <div class="form-group">
            <label for="name" class="form-label">Name</label>
            <input
              id="name"
              type="text"
              bind:value={name}
              placeholder="Your name"
              class="form-input"
            />
          </div>
        {/if}

        <div class="form-group">
          <label for="email" class="form-label">Email</label>
          <input
            id="email"
            type="email"
            bind:value={email}
            required
            placeholder="you@example.com"
            class="form-input"
          />
        </div>

        <div class="form-group">
          <label for="password" class="form-label">Password</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            required
            minlength="8"
            placeholder="••••••••"
            class="form-input"
          />
          {#if mode === 'signup'}
            <p class="form-hint">Minimum 8 characters</p>
          {/if}
        </div>

        <button
          type="submit"
          disabled={loading}
          class="submit-btn"
        >
          {#if loading}
            <span class="loading-content">
              <svg class="spinner" fill="none" viewBox="0 0 24 24">
                <circle class="spinner-track" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="spinner-fill" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </span>
          {:else}
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          {/if}
        </button>

        <!-- Live region for form status announcements -->
        <div class="sr-only" aria-live="polite" aria-atomic="true">
          {#if loading}
            Processing your request...
          {/if}
        </div>
      </form>

      <!-- Footer -->
      <div class="modal-footer">
        <p class="footer-text">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          <button
            onclick={switchMode}
            class="switch-btn"
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    padding: 1rem;
  }

  .modal-container {
    width: 100%;
    max-width: 28rem;
    background-color: var(--surface-1);
    border-radius: 1rem;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border-default);
    overflow: hidden;
  }

  .modal-header {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border-default);
  }

  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .modal-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    color: var(--text-secondary);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    display: flex;
    transition: color 0.15s;
  }
  .close-btn:hover {
    color: var(--text-primary);
  }

  .icon {
    width: 1.5rem;
    height: 1.5rem;
  }

  .modal-form {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .error-box {
    padding: 0.75rem;
    background-color: color-mix(in srgb, var(--error) 20%, transparent);
    border: 1px solid color-mix(in srgb, var(--error) 50%, transparent);
    border-radius: 0.5rem;
    color: var(--error);
    font-size: 0.875rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .form-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .form-input {
    width: 100%;
    padding: 0.75rem 1rem;
    background-color: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 0.75rem;
    color: var(--text-primary);
    font-size: 1rem;
    outline: none;
    transition: border-color 0.15s;
  }
  .form-input::placeholder {
    color: var(--input-placeholder);
  }
  .form-input:focus {
    border-color: var(--accent-primary);
  }

  .form-hint {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .submit-btn {
    width: 100%;
    padding: 0.75rem;
    background-color: var(--accent-primary);
    color: var(--accent-primary-text);
    border: none;
    border-radius: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s;
  }
  .submit-btn:hover:not(:disabled) {
    background-color: var(--accent-primary-hover);
  }
  .submit-btn:disabled {
    background-color: var(--surface-3);
    cursor: not-allowed;
  }

  .loading-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .spinner {
    width: 1.25rem;
    height: 1.25rem;
    animation: spin 1s linear infinite;
  }

  .spinner-track {
    opacity: 0.25;
  }

  .spinner-fill {
    opacity: 0.75;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .modal-footer {
    padding: 1rem 1.5rem;
    background-color: var(--surface-2-alpha);
    border-top: 1px solid var(--border-default);
    text-align: center;
  }

  .footer-text {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .switch-btn {
    margin-left: 0.25rem;
    color: var(--accent-primary);
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.15s;
  }
  .switch-btn:hover {
    color: var(--accent-primary-hover);
  }

  /* Visually hidden but screen reader accessible */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
