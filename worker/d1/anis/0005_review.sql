-- Who reviews drafts and receives the daily digest; the cadence unit (1440 = days; set lower to test the sequence fast).
INSERT OR IGNORE INTO mail_settings (key, value, note) VALUES
  ('reviewer_email', 'chadananda@gmail.com', 'drafts for approval + the daily digest'),
  ('cadence_unit_minutes', '1440', 'length of a cadence "day" in minutes; e.g. 10 to test the whole sequence in an hour');
