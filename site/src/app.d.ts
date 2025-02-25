// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      user: import('@clerk/backend').User | null;
      session: import('@clerk/backend').Session | null;
    }
    // interface PageData {}
    // interface Platform {}
  }

  // Environment variables
  namespace NodeJS {
    interface ProcessEnv {
      CLERK_SECRET_KEY: string;
      PUBLIC_CLERK_PUBLISHABLE_KEY: string;
      CLERK_API_FRONTEND_URL?: string;
      CLERK_API_BACKEND_URL?: string;
    }
  }
}

export {};
