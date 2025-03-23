<!-- 
  GoogleOneTapWrapper.svelte
  Wrapper component for Google One Tap authentication
  Only shows the Google One Tap component when user is not signed in
-->
<script>
  import { SignedOut } from 'svelte-clerk';
  import GoogleOneTap from './GoogleOneTap.svelte';
  import { browser } from '$app/environment';
</script>

<SignedOut>
  <GoogleOneTap />
</SignedOut>

{#if browser && import.meta.env.DEV}
  <!-- Debug panel -->
  <div class="fixed bottom-16 left-4 z-50 bg-surface text-xs p-2 rounded opacity-70 hover:opacity-100">
    <details>
      <summary>GoogleOneTapWrapper Debug</summary>
      <p>Using SignedOut component from svelte-clerk</p>
    </details>
  </div>
{/if}
