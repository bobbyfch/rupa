CREATE TABLE IF NOT EXISTS chains (
  id TEXT PRIMARY KEY,
  auth_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chains_updated ON chains(updated_at);
