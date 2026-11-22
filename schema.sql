CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,          -- GroupMe message id
  group_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  sent_at INTEGER NOT NULL,     -- ms since epoch
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_sent_at ON messages (sent_at);
