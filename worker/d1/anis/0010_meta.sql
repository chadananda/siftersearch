-- What each Anís reply WAS (type · models · usd · latency_ms, from tower's turn meter) — shown in the daily conversation
-- digest (Chad 10-22). out.html now holds the exact HTML handed to SES at send time.
ALTER TABLE mail_messages ADD COLUMN meta_json TEXT;
