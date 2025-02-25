<script>
  import { page } from '$app/stores';

  let name = '';
  let email = '';
  let message = '';

  function handleSubmit() {
    // TODO: Implement contact form submission
    console.log('Contact form submitted:', { name, email, message });
  }
</script>

<div class="container mx-auto px-4 py-8">
  <h1 class="text-4xl font-bold mb-8">Contact Us</h1>
  
  <div class="max-w-2xl">
    <p class="text-lg text-text-secondary mb-8">
      Have questions about SifterSearch? We're here to help! Fill out the form below and we'll get back to you as soon as possible.
    </p>

    <form on:submit|preventDefault={handleSubmit} class="space-y-6">
      <div>
        <label for="name" class="block text-sm font-medium text-text-primary mb-2">Name</label>
        <input
          type="text"
          id="name"
          bind:value={name}
          class="w-full px-4 py-2 rounded-lg bg-surface-3 border border-subtle text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="Your name"
          required
        />
      </div>

      <div>
        <label for="email" class="block text-sm font-medium text-text-primary mb-2">Email</label>
        <input
          type="email"
          id="email"
          bind:value={email}
          class="w-full px-4 py-2 rounded-lg bg-surface-3 border border-subtle text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="your@email.com"
          required
        />
      </div>

      <div>
        <label for="message" class="block text-sm font-medium text-text-primary mb-2">Message</label>
        <textarea
          id="message"
          bind:value={message}
          class="w-full px-4 py-2 rounded-lg bg-surface-3 border border-subtle text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent min-h-[8rem]"
          placeholder="How can we help?"
          required
        ></textarea>
      </div>

      <button
        type="submit"
        class="px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
      >
        Send Message
      </button>
    </form>
  </div>
</div>
