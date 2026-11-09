import type { FastifyPluginAsync } from 'fastify'
import { badRequest } from '../../lib/errors'
import { hourlyTier, pickSource, pickTier, windowed } from '../../lib/queries'

const DIMENSIONS: Record<string, string> = {
  model: 'model',
  agent: 'agent_name',
  skill: 'skill_name',
  mcp: 'mcp_server',
  developer: 'developer',
  query: 'query_source',
}

interface Slice {
  label: string
  costUsdMicros: number
  requests: number
}

interface Coverage {
  label: string
  pricedRequests: number
  unpricedRequests: number
}

const breakdown: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { source?: string, range?: string, by?: string, metric?: string } }>(
    '/breakdown',
    async (request) => {
      const { by = 'agent', metric } = request.query
      const column = DIMENSIONS[by]
      if (!column) throw badRequest('Unknown breakdown dimension.')

      const tier = hourlyTier(pickTier(request.query.range))
      const source = pickSource(request.query.source)
      const end = new Date()
      const start = new Date(end.getTime() - pickTier(request.query.range).windowMs)
      const sql = fastify.sql
      const orderBy = metric === 'requests' ? sql`3` : sql`2`

      const rows = await sql<Slice[]>`
        ${windowed(sql, tier, source, start, end)}
        SELECT coalesce(${sql(column)}, 'unavailable') AS label,
          coalesce(sum(cost_usd_micros), 0)::bigint AS cost_usd_micros,
          sum(requests)::bigint AS requests
        FROM windowed GROUP BY 1 ORDER BY ${orderBy} DESC LIMIT 8`

      const coverage = await sql<Coverage[]>`
        SELECT coalesce(${sql(column)}, 'unavailable') AS label,
          count(cost_usd_micros)::bigint AS priced_requests,
          (count(*) FILTER (WHERE cost_usd_micros IS NULL))::bigint AS unpriced_requests
        FROM api_requests WHERE source = ${source} AND time >= ${start} AND time < ${end}
        GROUP BY 1`
      const byLabel = new Map(coverage.map((row) => [row.label, row]))

      return rows.map((row) => ({
        label: row.label,
        costUsdMicros: row.costUsdMicros,
        requests: row.requests,
        pricedRequests: byLabel.get(row.label)?.pricedRequests ?? 0,
        unpricedRequests: byLabel.get(row.label)?.unpricedRequests ?? 0,
      }))
    },
  )
}

export default breakdown
