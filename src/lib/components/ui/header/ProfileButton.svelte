<script>
  import { page } from '$app/stores';
  import { UserButton, SignInButton } from 'svelte-clerk';
  
  // Use the user from the page store if available
  const user = $derived($page.data.user);
  const isAuthenticated = $derived(!!user);
</script>

{#if isAuthenticated}
  <!-- User is logged in - Use Clerk's UserButton component -->
  <UserButton 
    appearance={{
      elements: {
        userButtonAvatarBox: "w-9 h-9",
        userButtonTrigger: "hover:scale-105 hover:bg-surface-3 p-1.5 rounded-lg text-primary transition-all duration-300 cursor-pointer"
      }
    }}
  />
{:else}
  <!-- User is not logged in - Use Clerk's SignInButton with Google One Tap -->
  <SignInButton mode="modal">
    <div 
      class="hover:scale-105 hover:bg-surface-3 p-1.5 rounded-lg text-primary transition-all duration-300 cursor-pointer flex items-center justify-center"
      aria-label="Sign in"
      role="button"
      tabindex="0"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-7 h-7">
        <path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </div>
  </SignInButton>
{/if}
