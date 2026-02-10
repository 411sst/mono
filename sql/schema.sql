CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY,
  map_id TEXT NOT NULL,
  rules_id TEXT NOT NULL,
  status TEXT NOT NULL,
  state_version BIGINT NOT NULL,
  state_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES game_sessions(id),
  event_type TEXT NOT NULL,
  actor_player_id UUID,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reconnect_tokens (
  token TEXT PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES game_sessions(id),
  player_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
