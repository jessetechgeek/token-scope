import type { Sql } from 'postgres'
import { requestKey, type ApiRequestRow } from './usage'

const BATCH_SIZE = 500

export async function insertRequests(sql: Sql, requests: ApiRequestRow[]): Promise<number> {
  const unique = new Map<string, Record<string, unknown>>()
  for (const request of requests) {
    const eventKey = requestKey(request)
    unique.set(`${request.source}:${eventKey}`, {
      time: request.time,
      source: request.source,
      developer: request.developer,
      session_id: request.sessionId,
      model: request.model,
      query_source: request.querySource,
      agent_name: request.agentName,
      skill_name: request.skillName,
      mcp_server: request.mcpServer,
      input_tokens: request.inputTokens,
      output_tokens: request.outputTokens,
      cache_read_tokens: request.cacheReadTokens,
      cache_creation_tokens: request.cacheCreationTokens,
      cost_usd_micros: request.costUsdMicros,
      duration_ms: request.durationMs,
      event_key: eventKey,
      cost_source: request.costSource,
      is_synthetic: request.isSynthetic,
    })
  }

  const rows = [...unique.values()]
  let inserted = 0
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    inserted += await insertBatch(sql, rows.slice(offset, offset + BATCH_SIZE))
  }
  return inserted
}

async function insertBatch(sql: Sql, rows: Record<string, unknown>[]): Promise<number> {
  const payload = JSON.stringify(rows)
  const [result] = await sql<{ inserted: number }[]>`
    WITH input AS (
      SELECT * FROM jsonb_to_recordset(${payload}::text::jsonb) AS t(
        time timestamptz, source text, developer text, session_id text, model text,
        query_source text, agent_name text, skill_name text, mcp_server text,
        input_tokens integer, output_tokens integer, cache_read_tokens integer,
        cache_creation_tokens integer, cost_usd_micros bigint, duration_ms integer,
        event_key text, cost_source text, is_synthetic boolean)
    ),
    claimed AS (
      INSERT INTO request_keys (source, event_key)
      SELECT source, event_key FROM input
      ON CONFLICT DO NOTHING
      RETURNING source, event_key
    ),
    inserted AS (
      INSERT INTO api_requests (
        time, source, developer, session_id, model, query_source, agent_name, skill_name, mcp_server,
        input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
        cost_usd_micros, duration_ms, event_key, cost_source, is_synthetic)
      SELECT i.time, i.source, i.developer, i.session_id, i.model, i.query_source, i.agent_name,
        i.skill_name, i.mcp_server, i.input_tokens, i.output_tokens, i.cache_read_tokens,
        i.cache_creation_tokens, i.cost_usd_micros, i.duration_ms, i.event_key, i.cost_source,
        i.is_synthetic
      FROM input i
      JOIN claimed c ON c.source = i.source AND c.event_key = i.event_key
      RETURNING *
    ),
    rolled AS (
      INSERT INTO spend_1h AS s (
        bucket, source, developer, model, query_source, agent_name, skill_name, mcp_server,
        requests, cost_usd_micros, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens)
      SELECT date_trunc('hour', time, 'UTC'), source, developer, model, query_source, agent_name,
        skill_name, mcp_server, count(*), coalesce(sum(cost_usd_micros), 0),
        sum(input_tokens), sum(output_tokens), sum(cache_read_tokens), sum(cache_creation_tokens)
      FROM inserted
      GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
      ON CONFLICT (
        bucket, source, developer, model,
        (coalesce(query_source, '')), (coalesce(agent_name, '')),
        (coalesce(skill_name, '')), (coalesce(mcp_server, ''))
      ) DO UPDATE SET
        requests = s.requests + EXCLUDED.requests,
        cost_usd_micros = s.cost_usd_micros + EXCLUDED.cost_usd_micros,
        input_tokens = s.input_tokens + EXCLUDED.input_tokens,
        output_tokens = s.output_tokens + EXCLUDED.output_tokens,
        cache_read_tokens = s.cache_read_tokens + EXCLUDED.cache_read_tokens,
        cache_creation_tokens = s.cache_creation_tokens + EXCLUDED.cache_creation_tokens
    )
    SELECT count(*)::int AS inserted FROM inserted
  `
  return result?.inserted ?? 0
}
