/**
 * Email Verification Service
 *
 * Handles email verification codes and password reset tokens.
 * Uses 6-digit codes for user-friendly verification.
 */

import { query, queryOne } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { sendEmail } from './email.js';
import crypto from 'crypto';

// Code expiration times
const VERIFICATION_CODE_EXPIRES_MINUTES = 15;
const PASSWORD_RESET_EXPIRES_MINUTES = 60;

/**
 * Generate a 6-digit verification code
 */
function generateCode() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Generate a secure token for password reset links
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create and send email verification code
 */
export async function sendVerificationCode(email, userId = null) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRES_MINUTES * 60 * 1000);

  // Invalidate any existing codes for this email
  await query(
    `UPDATE verification_codes
     SET used_at = CURRENT_TIMESTAMP
     WHERE email = ? AND type = 'email_verification' AND used_at IS NULL`,
    [email.toLowerCase()]
  );

  // Create new code
  await query(
    `INSERT INTO verification_codes (user_id, email, code, type, expires_at)
     VALUES (?, ?, ?, 'email_verification', ?)`,
    [userId, email.toLowerCase(), code, expiresAt.toISOString()]
  );

  // Send email
  const subject = 'Verify your SifterSearch account';
  const text = `Your verification code is: ${code}\n\nThis code expires in ${VERIFICATION_CODE_EXPIRES_MINUTES} minutes.\n\nIf you didn't request this, please ignore this email.`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1e40af;">Verify your email</h2>
      <p>Enter this code to verify your SifterSearch account:</p>
      <div style="background: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e40af;">${code}</span>
      </div>
      <p style="color: #6b7280; font-size: 14px;">This code expires in ${VERIFICATION_CODE_EXPIRES_MINUTES} minutes.</p>
      <p style="color: #6b7280; font-size: 14px;">If you didn't request this, please ignore this email.</p>
    </div>
  `;

  try {
    await sendEmail({ to: email, subject, text, html });
    logger.info({ email }, 'Verification code sent');
    return { success: true, expiresIn: VERIFICATION_CODE_EXPIRES_MINUTES };
  } catch (err) {
    logger.error({ email, error: err.message }, 'Failed to send verification code');
    throw err;
  }
}

/**
 * Verify email verification code
 */
export async function verifyCode(email, code) {
  const record = await queryOne(
    `SELECT * FROM verification_codes
     WHERE email = ? AND code = ? AND type = 'email_verification'
     AND used_at IS NULL AND expires_at > datetime('now')
     ORDER BY created_at DESC
     LIMIT 1`,
    [email.toLowerCase(), code]
  );

  if (!record) {
    return { valid: false, error: 'Invalid or expired code' };
  }

  // Mark code as used
  await query(
    `UPDATE verification_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [record.id]
  );

  // Mark user email as verified
  if (record.user_id) {
    await query(
      `UPDATE users SET email_verified = 1 WHERE id = ?`,
      [record.user_id]
    );
  }

  logger.info({ email, userId: record.user_id }, 'Email verified');
  return { valid: true, userId: record.user_id };
}

/**
 * Create and send password reset token
 */
export async function sendPasswordReset(email) {
  // Check if user exists
  const user = await queryOne('SELECT id, email FROM users WHERE email = ?', [email.toLowerCase()]);

  if (!user) {
    // Don't reveal if user exists - just log and return success
    logger.info({ email }, 'Password reset requested for non-existent email');
    return { success: true }; // Don't reveal user doesn't exist
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRES_MINUTES * 60 * 1000);

  // Invalidate any existing reset tokens for this user
  await query(
    `UPDATE verification_codes
     SET used_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND type = 'password_reset' AND used_at IS NULL`,
    [user.id]
  );

  // Create new token
  await query(
    `INSERT INTO verification_codes (user_id, email, code, type, expires_at)
     VALUES (?, ?, ?, 'password_reset', ?)`,
    [user.id, email.toLowerCase(), token, expiresAt.toISOString()]
  );

  // Send email
  const baseUrl = process.env.APP_URL || 'https://siftersearch.com';
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  const subject = 'Reset your SifterSearch password';
  const text = `Click the link below to reset your password:\n\n${resetUrl}\n\nThis link expires in ${PASSWORD_RESET_EXPIRES_MINUTES} minutes.\n\nIf you didn't request this, please ignore this email.`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1e40af;">Reset your password</h2>
      <p>Click the button below to reset your SifterSearch password:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background: #1e40af; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 500;">Reset Password</a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">This link expires in ${PASSWORD_RESET_EXPIRES_MINUTES} minutes.</p>
      <p style="color: #6b7280; font-size: 14px;">If you didn't request this, please ignore this email.</p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 30px;">Or copy this link: ${resetUrl}</p>
    </div>
  `;

  try {
    await sendEmail({ to: email, subject, text, html });
    logger.info({ email, userId: user.id }, 'Password reset email sent');
    return { success: true };
  } catch (err) {
    logger.error({ email, error: err.message }, 'Failed to send password reset email');
    throw err;
  }
}

/**
 * Verify password reset token and return user
 */
export async function verifyResetToken(token) {
  const record = await queryOne(
    `SELECT vc.*, u.email as user_email
     FROM verification_codes vc
     JOIN users u ON vc.user_id = u.id
     WHERE vc.code = ? AND vc.type = 'password_reset'
     AND vc.used_at IS NULL AND vc.expires_at > datetime('now')`,
    [token]
  );

  if (!record) {
    return { valid: false, error: 'Invalid or expired reset link' };
  }

  return { valid: true, userId: record.user_id, email: record.user_email };
}

/**
 * Complete password reset
 */
export async function resetPassword(token, newPasswordHash) {
  const verification = await verifyResetToken(token);

  if (!verification.valid) {
    return verification;
  }

  // Update password
  await query(
    `UPDATE users SET password_hash = ? WHERE id = ?`,
    [newPasswordHash, verification.userId]
  );

  // Mark token as used
  await query(
    `UPDATE verification_codes SET used_at = CURRENT_TIMESTAMP WHERE code = ? AND type = 'password_reset'`,
    [token]
  );

  // Revoke all refresh tokens for this user (force re-login)
  await query(
    `UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?`,
    [verification.userId]
  );

  logger.info({ userId: verification.userId }, 'Password reset completed');
  return { success: true, userId: verification.userId };
}

/**
 * Resend verification code (with rate limiting)
 */
export async function resendVerificationCode(email) {
  // Check rate limiting - max 3 codes per hour
  const recentCodes = await queryOne(
    `SELECT COUNT(*) as count FROM verification_codes
     WHERE email = ? AND type = 'email_verification'
     AND created_at > datetime('now', '-1 hour')`,
    [email.toLowerCase()]
  );

  if (recentCodes.count >= 3) {
    return { success: false, error: 'Too many verification requests. Please try again later.' };
  }

  // Get user ID if they exist
  const user = await queryOne('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);

  return sendVerificationCode(email, user?.id);
}

export default {
  sendVerificationCode,
  verifyCode,
  sendPasswordReset,
  verifyResetToken,
  resetPassword,
  resendVerificationCode
};
