import type { FastifyPluginAsync } from 'fastify'
import { pickSource, pickTier, windowed } from '../../lib/queries'

const live: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { source?: string } }>('/live', async (request) => {
    const source = pickSource(request.query.source)
    const tier = pickTier('1h')
    const end = new Date()
    const start = new Date(end.getTime() - tier.windowMs)
    const dayStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
    const sql = fastify.sql

    const minutes = await sql`
      ${windowed(sql, tier, source, start, end)}
      SELECT bucket, model, coalesce(sum(cost_usd_micros), 0)::bigint AS cost_usd_micros,
        sum(requests)::bigint AS requests
      FROM windowed GROUP BY bucket, model ORDER BY bucket`

    const [today] = await sql`
      SELECT 'today' AS label, coalesce(sum(cost_usd_micros), 0)::bigint AS cost_usd_micros,
        count(*)::bigint AS requests, count(cost_usd_micros)::bigint AS priced_requests,
        (count(*) FILTER (WHERE cost_usd_micros IS NULL))::bigint AS unpriced_requests
      FROM api_requests WHERE source = ${source} AND time >= ${dayStart} AND time < ${end}`

    const [last] = await sql<{ lastEventAt: Date | null }[]>`
      SELECT max(time) AS last_event_at FROM api_requests WHERE source = ${source}`

    return { minutes, today, lastEventAt: last?.lastEventAt ?? null, dayBasis: 'UTC', source }
  })
}

export default live
