import type { FastifyPluginAsync } from 'fastify'
import { pickSource, pickTier } from '../../lib/queries'

const sessions: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { source?: string, range?: string, metric?: string, group?: string } }>(
    '/sessions',
    async (request) => {
      const source = pickSource(request.query.source)
      const end = new Date()
      const start = new Date(end.getTime() - pickTier(request.query.range).windowMs)
      const sql = fastify.sql
      const orderBy = request.query.metric === 'requests' ? sql`requests` : sql`cost_usd_micros`

      if (request.query.group === 'developer') {
        return sql`
          SELECT developer, min(time) AS started_at, max(time) AS ended_at,
            count(DISTINCT session_id)::bigint AS sessions,
            count(*)::bigint AS requests, coalesce(sum(cost_usd_micros), 0)::bigint AS cost_usd_micros,
            count(cost_usd_micros)::bigint AS priced_requests,
            (count(*) FILTER (WHERE cost_usd_micros IS NULL))::bigint AS unpriced_requests
          FROM api_requests WHERE source = ${source} AND time >= ${start} AND time < ${end}
          GROUP BY developer ORDER BY ${orderBy} DESC LIMIT 8`
      }

      return sql`
        SELECT session_id, (array_agg(developer ORDER BY time DESC))[1] AS developer,
          min(time) AS started_at, max(time) AS ended_at,
          count(*)::bigint AS requests, coalesce(sum(cost_usd_micros), 0)::bigint AS cost_usd_micros,
          count(cost_usd_micros)::bigint AS priced_requests,
          (count(*) FILTER (WHERE cost_usd_micros IS NULL))::bigint AS unpriced_requests
        FROM api_requests WHERE source = ${source} AND time >= ${start} AND time < ${end}
        GROUP BY session_id ORDER BY ${orderBy} DESC LIMIT 8`
    },
  )
}

export default sessions
