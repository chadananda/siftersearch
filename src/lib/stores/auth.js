import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Create writable stores for auth state
export const isSignedIn = writable(false);
export const currentUser = writable(null);

// Initialize auth state from localStorage if available
if (browser) {
  const storedUser = localStorage.getItem('auth_user');
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      currentUser.set(user);
      isSignedIn.set(true);
    } catch (e) {
      console.error('Failed to parse stored user data', e);
      localStorage.removeItem('auth_user');
    }
  }
}

// Function to sign in
export function signIn(userData) {
  currentUser.set(userData);
  isSignedIn.set(true);
  
  if (browser) {
    localStorage.setItem('auth_user', JSON.stringify(userData));
  }
}

// Function to sign out
export function signOut() {
  currentUser.set(null);
  isSignedIn.set(false);
  
  if (browser) {
    localStorage.removeItem('auth_user');
  }
}
