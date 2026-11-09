import type { FastifyPluginAsync } from 'fastify'
import { pickSource, pickTier, windowed } from '../../lib/queries'

interface Query {
  source?: string
  range?: string
}

interface Totals {
  costUsdMicros: number
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

const summary: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: Query }>('/summary', async (request) => {
    const tier = pickTier(request.query.range)
    const source = pickSource(request.query.source)
    const end = new Date()
    const start = new Date(end.getTime() - tier.windowMs)
    const sql = fastify.sql

    const started = performance.now()
    const [totals] = await sql<Totals[]>`
      ${windowed(sql, tier, source, start, end)}
      SELECT coalesce(sum(cost_usd_micros), 0)::bigint AS cost_usd_micros,
        coalesce(sum(requests), 0)::bigint AS requests,
        coalesce(sum(input_tokens), 0)::bigint AS input_tokens,
        coalesce(sum(output_tokens), 0)::bigint AS output_tokens,
        coalesce(sum(cache_read_tokens), 0)::bigint AS cache_read_tokens,
        coalesce(sum(cache_creation_tokens), 0)::bigint AS cache_creation_tokens
      FROM windowed`
    const queryMs = performance.now() - started

    const [coverage] = await sql<{ pricedRequests: number, unpricedRequests: number, syntheticRequests: number }[]>`
      SELECT count(cost_usd_micros)::bigint AS priced_requests,
        (count(*) FILTER (WHERE cost_usd_micros IS NULL))::bigint AS unpriced_requests,
        (count(*) FILTER (WHERE is_synthetic OR source = 'demo'))::bigint AS synthetic_requests
      FROM api_requests WHERE source = ${source} AND time >= ${start} AND time < ${end}`

    return {
      servedFrom: tier.servedFrom,
      queryMs,
      totals,
      windowStart: start,
      windowEnd: end,
      pricedRequests: coverage?.pricedRequests ?? 0,
      unpricedRequests: coverage?.unpricedRequests ?? 0,
      syntheticRequests: coverage?.syntheticRequests ?? 0,
    }
  })
}

export default summary
