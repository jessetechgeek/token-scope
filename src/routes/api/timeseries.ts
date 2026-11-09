import type { FastifyPluginAsync } from 'fastify'
import { pickSource, pickTier, windowed } from '../../lib/queries'

const timeseries: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { source?: string, range?: string } }>('/timeseries', async (request) => {
    const tier = pickTier(request.query.range)
    const source = pickSource(request.query.source)
    const end = new Date()
    const start = new Date(end.getTime() - tier.windowMs)
    const sql = fastify.sql

    const started = performance.now()
    const points = await sql`
      ${windowed(sql, tier, source, start, end)}
      SELECT bucket, model, coalesce(sum(cost_usd_micros), 0)::bigint AS cost_usd_micros,
        sum(requests)::bigint AS requests
      FROM windowed GROUP BY bucket, model ORDER BY bucket`

    return {
      servedFrom: tier.servedFrom,
      bucketSeconds: tier.bucketSeconds,
      queryMs: performance.now() - started,
      windowStart: start,
      windowEnd: end,
      points,
    }
  })
}

export default timeseries
