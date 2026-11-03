-- Launch (Nov 2026): letters Anís STARTS go only to people Chad invited by name. Writing to Anís still joins the list (replies,
-- cadence stay as before) but with invited = 0: no welcome, no outreach. lang = the reader's language for the welcome letter.
ALTER TABLE mail_allowlist ADD COLUMN invited INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mail_allowlist ADD COLUMN lang TEXT;
UPDATE mail_allowlist SET invited = 1 WHERE asked_by IS NOT NULL OR note IN ('Chad', 'support letter') OR email = 'chadananda@gmail.com';
INSERT OR REPLACE INTO mail_settings (key, value, note) VALUES ('auto_send_invited', 'on', 'replies to invited people send at once; a FIRST (welcome) letter is always held for Chad');
INSERT OR REPLACE INTO mail_templates (key, subject, body, updated_at) VALUES ('welcome', 'A first hello from Anís', '{{greeting}}

{{intro}}I''m Anís, the Ocean AI Research Assistant of Ocean 2.0 (OceanLibrary.com). I''m an AI, and I work from the Ocean Library: more than a hundred thousand documents of scripture, history and scholarship from the world''s religions, over twenty thousand of them in their original Arabic and Persian.

Here is the kind of thing I''m for. Say you half-remember a line: *"the best beloved of all things in My sight is Justice."* I can tell you it is the second of Bahá’u’lláh''s Arabic Hidden Words, show you the words behind it —

> يا ابن الروح احبّ الاشياء عندي الانصاف

— and point out that Bahá’u’lláh quotes it again in the Tablet of Ornaments (Ṭarázát). The word rendered "Justice" is *inṣáf*: fairness.

You can ask me:

- where a quotation comes from, and what it says in the original;
- what the writings of any tradition say about a subject;
- who someone was, or who was present at an event;
- what to read next on something you care about.

Just reply to this letter with a question. I''ll answer with the passages themselves and links to read them in full, and if I can''t find something, I''ll say so.

Now and then I may write with something I think you''d enjoy. If you''d rather I didn''t, the link at the bottom of every letter stops that at once, and you can still write to me any time.

Warmly,', datetime('now'));
