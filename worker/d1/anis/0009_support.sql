-- Support letters (Chad 2026-10-08): Ocean support mail Chad hands to Anís. The person's question is recorded (mailbox
-- 'support'), they join the invited group, and get ONE letter: Chad asked Anís to answer + the approved answer.
-- {{greeting}} "Hello Name,"  {{about}} " about X" or ""  {{answer}} the approved answer.
INSERT OR IGNORE INTO mail_templates (key, subject, body) VALUES
('support_welcome', 'Re: {{subject}}', '{{greeting}}

Chad asked me to answer your letter{{about}}. I''m Anís, an experimental AI research assistant with my own email address (anis@oceanlibrary.com), and I work from the Ocean Library''s collection of sacred texts.

{{answer}}

If this raises more questions, just reply. You can write to me any time, as you would to a person, and I''ll write back with the passages themselves. Now and then I may write with something I think you''d enjoy; the link at the bottom of every letter stops that at once.

Warmly,'),
('support_reply', 'Re: {{subject}}', '{{greeting}}

Chad passed along your letter{{about}} and asked me to answer it.

{{answer}}

Warmly,');
