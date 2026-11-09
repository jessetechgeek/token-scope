import type { FastifyPluginAsync } from 'fastify'
import { ACTIVE_SOURCES } from '../../lib/usage'

const status: FastifyPluginAsync = async (fastify) => {
  fastify.get('/status', async () => {
    const sql = fastify.sql
    let database = { connected: false, postgresVersion: undefined as string | undefined }
    let sources: object[] = []
    let total = 0

    try {
      const [version] = await sql<{ postgresVersion: string }[]>`
        SELECT current_setting('server_version') AS postgres_version`
      database = { connected: true, postgresVersion: version?.postgresVersion }

      sources = [...await sql`
        SELECT source, count(*)::bigint AS requests, count(cost_usd_micros)::bigint AS priced_requests,
          (count(*) FILTER (WHERE cost_usd_micros IS NULL))::bigint AS unpriced_requests,
          max(time) AS last_event_at, count(agent_name)::bigint AS agent_requests,
          count(skill_name)::bigint AS skill_requests, count(mcp_server)::bigint AS mcp_requests,
          (count(*) FILTER (WHERE is_synthetic OR source = 'demo'))::bigint AS synthetic_requests
        FROM api_requests WHERE source = ANY(${[...ACTIVE_SOURCES]}) GROUP BY source ORDER BY source`]
      total = sources.reduce<number>((sum, row) => sum + (row as { requests: number }).requests, 0)
    } catch {
      database = { connected: false, postgresVersion: undefined }
    }

    return {
      database,
      ingestion: { queued: 0, accepted: total, persisted: total, duplicates: 0, rejected: 0 },
      sources,
      limitations: [
        'Costs are API-equivalent estimates or reported values, not subscription bills.',
        'Rollups are plain Postgres tables updated at ingest time.',
        'Events are written to the database in the request; nothing is queued in memory.',
        'No retention policy is installed; data is not automatically deleted. Day boundaries use UTC.',
      ],
    }
  })
}

export default status
