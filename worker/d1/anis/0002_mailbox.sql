-- Which address a message came in on (anis | newsletter), so newsletter replies are kept apart from Anís's mail.
-- Inbound status gains: auto (out-of-office, auto-responders) and unsubscribe (asks to be removed from the newsletter).
ALTER TABLE mail_messages ADD COLUMN mailbox TEXT;
UPDATE mail_messages SET mailbox = 'anis';
CREATE INDEX idx_mail_mailbox ON mail_messages(mailbox, status);
