-- Invite-only internal alpha (Chad 2026-10-08): letters to invited people (mail_allowlist) send without a draft step.
INSERT OR IGNORE INTO mail_settings (key, value, note) VALUES
  ('auto_send_invited', 'on', 'letters to invited people send at once; anyone else gets a draft for Chad');
