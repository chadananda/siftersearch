/**
 * Referral Tracking
 *
 * Handles referral codes for user sharing.
 * When a user shares their QR code or link, the referrer ID is captured
 * and stored for attribution when the referred user signs up.
 */

import QRCode from 'qrcode';

const REFERRER_KEY = 'sifter_referrer';

/**
 * Generate a referral code from user ID
 * Uses the full user ID (anonymous user_UUID or numeric ID) for tracking
 * This allows us to trace referrals back to the original referrer
 */
export function generateReferralCode(userId) {
  if (!userId) return null;

  // Use the full user ID as the referral code
  // For anonymous users: "user_abc123-..."
  // For authenticated users: numeric ID like "42"
  return String(userId);
}

/**
 * Get the referral URL with the user's referral code
 */
export function getReferralUrl(userId) {
  const baseUrl = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://siftersearch.com';

  if (!userId) return baseUrl;

  const code = generateReferralCode(userId);
  return `${baseUrl}?ref=${code}`;
}

/**
 * Capture referral code from URL on page load
 * Stores in localStorage and redirects to clean URL
 */
export function captureReferral() {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const refCode = params.get('ref');

  if (refCode) {
    // Store the referral code
    localStorage.setItem(REFERRER_KEY, refCode);

    // Redirect to clean URL (removes ?ref= from address bar completely)
    const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
    window.location.replace(cleanUrl);

    return refCode;
  }

  return null;
}

/**
 * Get stored referral code (for use during signup)
 */
export function getStoredReferral() {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(REFERRER_KEY);
}

/**
 * Clear stored referral (after successful signup)
 */
export function clearStoredReferral() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(REFERRER_KEY);
}

/**
 * Check if current user was referred
 */
export function wasReferred() {
  return !!getStoredReferral();
}

/**
 * Generate QR code as Data URL
 * Returns base64-encoded PNG data URL for display in img src
 */
export async function generateQRCode(userId) {
  const url = getReferralUrl(userId);
  try {
    return await QRCode.toDataURL(url, {
      width: 128,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('Failed to generate QR code:', err);
    return null;
  }
}
