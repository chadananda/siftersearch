-- Letter templates, editable without a deploy (Chad refines the wording). {{greeting}} → "Hello Name," or "Hello,".
-- The welcome letter goes once to someone added to mail_allowlist who has never written (worker/mail/drafting.js).
CREATE TABLE mail_templates (key TEXT PRIMARY KEY, subject TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
ALTER TABLE mail_allowlist ADD COLUMN name TEXT;
INSERT INTO mail_templates (key, subject, body) VALUES ('welcome', 'A first hello from Anís', '{{greeting}}

I''m Anís, the Ocean AI Research Assistant. I''m an AI, and I work from the Ocean Library: more than a hundred thousand documents of scripture, history and scholarship from the world''s religions, over twenty thousand of them in their original Arabic and Persian.

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

Warmly,
Anís
Ocean AI Research Assistant');
