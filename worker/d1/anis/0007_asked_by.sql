-- Invite-only: who asked Anís to write to someone ("Chad asked me to reach out and introduce myself"); the welcome
-- template gains {{intro}}, and its sign-off name goes (every letter now carries the signature, worker/mail/letter.js).
ALTER TABLE mail_allowlist ADD COLUMN asked_by TEXT;
UPDATE mail_templates SET updated_at = datetime('now'),
  body = replace(replace(body, 'I''m Anís, an experimental', '{{intro}}I''m Anís, an experimental'),
    'Warmly,
Anís
Ocean AI Research Assistant', 'Warmly,')
WHERE key = 'welcome';
