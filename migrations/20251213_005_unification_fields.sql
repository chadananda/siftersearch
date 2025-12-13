-- Add fields needed for proper user ID unification
-- These enable tracking when conversion happened and linking conversations to authenticated users

-- Add converted_at timestamp to anonymous_users
ALTER TABLE anonymous_users ADD COLUMN converted_at DATETIME;

-- Add user_id to anonymous_conversations for linking to authenticated users
ALTER TABLE anonymous_conversations ADD COLUMN user_id INTEGER REFERENCES users(id);

-- Index for finding conversations by authenticated user
CREATE INDEX IF NOT EXISTS idx_anon_conv_user_id ON anonymous_conversations(user_id);
