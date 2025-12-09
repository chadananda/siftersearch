/**
 * Email Notification Service
 *
 * Sends email notifications when jobs complete.
 * Supports multiple email providers (Resend, SendGrid, etc.)
 */

import { query, queryOne, queryAll } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { getJob, markJobNotified, JOB_STATUS } from './jobs.js';

// Email provider - using Resend by default (simple, modern API)
// Can swap for SendGrid, SES, etc.
let emailClient = null;

function getEmailClient() {
  if (!emailClient) {
    // Dynamic import based on config
    const provider = process.env.EMAIL_PROVIDER || 'console';

    if (provider === 'resend' && process.env.RESEND_API_KEY) {
      // Use Resend
      emailClient = {
        send: async (options) => {
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: process.env.EMAIL_FROM || 'SifterSearch <noreply@siftersearch.com>',
              to: options.to,
              subject: options.subject,
              text: options.text,
              html: options.html
            })
          });

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Resend error: ${error}`);
          }

          return response.json();
        }
      };
    } else if (provider === 'sendgrid' && process.env.SENDGRID_API_KEY) {
      // Use SendGrid
      emailClient = {
        send: async (options) => {
          const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: options.to }] }],
              from: { email: process.env.EMAIL_FROM || 'noreply@siftersearch.com' },
              subject: options.subject,
              content: [
                { type: 'text/plain', value: options.text },
                ...(options.html ? [{ type: 'text/html', value: options.html }] : [])
              ]
            })
          });

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`SendGrid error: ${error}`);
          }

          return { success: true };
        }
      };
    } else {
      // Console fallback for development
      emailClient = {
        send: async (options) => {
          logger.info({
            to: options.to,
            subject: options.subject,
            preview: options.text.substring(0, 100)
          }, 'EMAIL (console mode)');
          return { success: true, mode: 'console' };
        }
      };
    }
  }

  return emailClient;
}

/**
 * Queue an email for sending
 */
export async function queueEmail({
  recipient,
  subject,
  bodyText,
  bodyHtml = null,
  jobId = null
}) {
  await query(
    `INSERT INTO email_queue (recipient, subject, body_text, body_html, job_id)
     VALUES (?, ?, ?, ?, ?)`,
    [recipient, subject, bodyText, bodyHtml, jobId]
  );

  logger.info({ recipient, subject, jobId }, 'Email queued');
}

/**
 * Send a single email directly (bypasses queue)
 */
export async function sendEmail({ to, subject, text, html = null }) {
  const client = getEmailClient();

  try {
    const result = await client.send({ to, subject, text, html });
    logger.info({ to, subject }, 'Email sent');
    return { success: true, result };
  } catch (err) {
    logger.error({ to, subject, error: err.message }, 'Email send failed');
    throw err;
  }
}

/**
 * Process pending emails in queue
 */
export async function processEmailQueue(limit = 10) {
  const pendingEmails = await queryAll(
    `SELECT * FROM email_queue
     WHERE status = 'pending' AND attempts < 3
     ORDER BY created_at ASC
     LIMIT ?`,
    [limit]
  );

  let sent = 0;
  let failed = 0;

  for (const email of pendingEmails) {
    try {
      await sendEmail({
        to: email.recipient,
        subject: email.subject,
        text: email.body_text,
        html: email.body_html
      });

      await query(
        `UPDATE email_queue SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [email.id]
      );

      sent++;
    } catch (err) {
      await query(
        `UPDATE email_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
        [err.message, email.id]
      );

      // Mark as failed after 3 attempts
      if (email.attempts >= 2) {
        await query(
          `UPDATE email_queue SET status = 'failed' WHERE id = ?`,
          [email.id]
        );
      }

      failed++;
    }
  }

  return { sent, failed, total: pendingEmails.length };
}

/**
 * Send job completion notification
 */
export async function notifyJobComplete(jobId) {
  const job = await getJob(jobId);

  if (!job) {
    throw new Error('Job not found');
  }

  if (!job.notify_email) {
    logger.info({ jobId }, 'No email to notify');
    return { skipped: true };
  }

  if (job.notified_at) {
    logger.info({ jobId }, 'Already notified');
    return { skipped: true, alreadyNotified: true };
  }

  const baseUrl = process.env.BASE_URL || 'https://siftersearch.com';
  const isSuccess = job.status === JOB_STATUS.COMPLETED;

  let subject;
  let bodyText;
  let bodyHtml;

  if (job.type === 'translation') {
    const params = job.params || {};
    subject = isSuccess
      ? `Your translation is ready - ${params.targetLanguage?.toUpperCase()}`
      : `Translation failed`;

    if (isSuccess) {
      bodyText = `Your document translation to ${params.targetLanguage?.toUpperCase()} is complete!\n\n` +
        `Download your translated document:\n${baseUrl}${job.result_url}\n\n` +
        `This link will expire in 7 days.\n\n` +
        `Thank you for using SifterSearch!`;

      bodyHtml = `
        <h2>Your translation is ready!</h2>
        <p>Your document has been translated to <strong>${params.targetLanguage?.toUpperCase()}</strong>.</p>
        <p><a href="${baseUrl}${job.result_url}" style="background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">Download Translation</a></p>
        <p><small>This link will expire in 7 days.</small></p>
        <p>Thank you for using SifterSearch!</p>
      `;
    } else {
      bodyText = `We're sorry, but your translation request failed.\n\n` +
        `Error: ${job.error_message || 'Unknown error'}\n\n` +
        `Please try again or contact support if the problem persists.`;

      bodyHtml = `
        <h2>Translation Failed</h2>
        <p>We're sorry, but your translation request encountered an error:</p>
        <p style="background: #fef2f2; padding: 12px; border-radius: 4px; color: #b91c1c;">${job.error_message || 'Unknown error'}</p>
        <p>Please try again or contact support if the problem persists.</p>
      `;
    }
  } else if (job.type === 'audio') {
    const params = job.params || {};
    subject = isSuccess
      ? `Your audio is ready - ${params.voice} voice`
      : `Audio conversion failed`;

    if (isSuccess) {
      bodyText = `Your document audio conversion is complete!\n\n` +
        `Download your audio files:\n${baseUrl}${job.result_url}\n\n` +
        `Voice: ${params.voice}\n` +
        `Format: ${params.format}\n\n` +
        `This link will expire in 7 days.\n\n` +
        `Thank you for using SifterSearch!`;

      bodyHtml = `
        <h2>Your audio is ready!</h2>
        <p>Your document has been converted to audio using the <strong>${params.voice}</strong> voice.</p>
        <p><a href="${baseUrl}${job.result_url}" style="background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">Download Audio</a></p>
        <p>
          <small>Voice: ${params.voice}</small><br>
          <small>Format: ${params.format}</small>
        </p>
        <p><small>This link will expire in 7 days.</small></p>
        <p>Thank you for using SifterSearch!</p>
      `;
    } else {
      bodyText = `We're sorry, but your audio conversion request failed.\n\n` +
        `Error: ${job.error_message || 'Unknown error'}\n\n` +
        `Please try again or contact support if the problem persists.`;

      bodyHtml = `
        <h2>Audio Conversion Failed</h2>
        <p>We're sorry, but your audio conversion request encountered an error:</p>
        <p style="background: #fef2f2; padding: 12px; border-radius: 4px; color: #b91c1c;">${job.error_message || 'Unknown error'}</p>
        <p>Please try again or contact support if the problem persists.</p>
      `;
    }
  } else {
    subject = isSuccess ? `Your ${job.type} job is complete` : `${job.type} job failed`;
    bodyText = isSuccess
      ? `Your job is complete. Download: ${baseUrl}${job.result_url}`
      : `Your job failed: ${job.error_message || 'Unknown error'}`;
  }

  // Queue the email
  await queueEmail({
    recipient: job.notify_email,
    subject,
    bodyText,
    bodyHtml,
    jobId
  });

  // Mark job as notified
  await markJobNotified(jobId);

  // Try to send immediately
  await processEmailQueue(1);

  return { success: true, email: job.notify_email };
}

/**
 * Get email queue stats
 */
export async function getEmailStats() {
  return queryOne(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM email_queue
    WHERE created_at > datetime('now', '-7 days')
  `);
}

export const email = {
  queueEmail,
  sendEmail,
  processEmailQueue,
  notifyJobComplete,
  getEmailStats
};

export default email;
