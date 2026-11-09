CREATE TABLE IF NOT EXISTS api_requests (
    time                  timestamptz NOT NULL,
    source                text        NOT NULL,
    developer             text        NOT NULL,
    session_id            text        NOT NULL,
    model                 text        NOT NULL,
    query_source          text,
    agent_name            text,
    skill_name            text,
    mcp_server            text,
    input_tokens          integer     NOT NULL,
    output_tokens         integer     NOT NULL,
    cache_read_tokens     integer     NOT NULL,
    cache_creation_tokens integer     NOT NULL,
    cost_usd_micros       bigint,
    duration_ms           integer,
    event_key             text,
    cost_source           text        NOT NULL DEFAULT 'reported',
    is_synthetic          boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS ix_api_requests_source_time ON api_requests (source, time DESC);
CREATE INDEX IF NOT EXISTS ix_api_requests_source_session ON api_requests (source, session_id);

CREATE TABLE IF NOT EXISTS request_keys (
    source    text NOT NULL,
    event_key text NOT NULL,
    PRIMARY KEY (source, event_key)
);

CREATE TABLE IF NOT EXISTS spend_1h (
    bucket                timestamptz NOT NULL,
    source                text        NOT NULL,
    developer             text        NOT NULL,
    model                 text        NOT NULL,
    query_source          text,
    agent_name            text,
    skill_name            text,
    mcp_server            text,
    requests              bigint      NOT NULL,
    cost_usd_micros       bigint      NOT NULL,
    input_tokens          bigint      NOT NULL,
    output_tokens         bigint      NOT NULL,
    cache_read_tokens     bigint      NOT NULL,
    cache_creation_tokens bigint      NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_spend_1h ON spend_1h (
    bucket, source, developer, model,
    (coalesce(query_source, '')), (coalesce(agent_name, '')),
    (coalesce(skill_name, '')), (coalesce(mcp_server, ''))
);
