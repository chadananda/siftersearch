<script>
  import { SignIn } from 'svelte-clerk';
</script>

<div class="flex min-h-screen items-center justify-center p-4">
  <div class="w-full max-w-md">
    <SignIn routing="path" path="/auth/signin" />
  </div>
</div>
