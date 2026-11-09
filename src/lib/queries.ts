import type { Sql } from 'postgres'
import { ceilTime, floorTime } from './buckets'
import { badRequest } from './errors'
import { isActiveSource } from './usage'

export interface Tier {
  servedFrom: string
  windowMs: number
  bucketSeconds: number
  unit: 'minute' | 'hour' | 'day'
  rollup: boolean
}

const HOUR = 3_600_000
const DAY = 86_400_000

export function pickTier(range?: string): Tier {
  switch (range ?? '30d') {
    case '1h':
      return { servedFrom: 'api_requests', windowMs: HOUR, bucketSeconds: 60, unit: 'minute', rollup: false }
    case '24h':
      return { servedFrom: 'spend_1h', windowMs: 24 * HOUR, bucketSeconds: 3600, unit: 'hour', rollup: true }
    case '7d':
      return { servedFrom: 'spend_1h', windowMs: 7 * DAY, bucketSeconds: 3600, unit: 'hour', rollup: true }
    case '30d':
      return { servedFrom: 'spend_1h', windowMs: 30 * DAY, bucketSeconds: 86400, unit: 'day', rollup: true }
    case '90d':
      return { servedFrom: 'spend_1h', windowMs: 90 * DAY, bucketSeconds: 86400, unit: 'day', rollup: true }
    default:
      throw badRequest('Range must be 1h, 24h, 7d, 30d or 90d.')
  }
}

export function pickSource(source?: string): string {
  if (source === undefined) return 'live'
  if (isActiveSource(source)) return source
  throw badRequest('Unknown usage source.')
}

export function hourlyTier(tier: Tier): Tier {
  return tier.rollup ? tier : { ...tier, servedFrom: 'spend_1h', bucketSeconds: 3600, unit: 'hour', rollup: true }
}

export function windowed(sql: Sql, tier: Tier, source: string, start: Date, end: Date) {
  let fullStart = end
  let fullEnd = end
  if (tier.rollup) {
    const ceil = ceilTime(start, tier.bucketSeconds)
    const floor = floorTime(end, tier.bucketSeconds)
    if (ceil < floor) {
      fullStart = ceil
      fullEnd = floor
    }
  }

  return sql`
    WITH windowed AS (
      SELECT date_trunc(${tier.unit}::text, bucket, 'UTC') AS bucket, developer, model, query_source,
        agent_name, skill_name, mcp_server, requests, cost_usd_micros, input_tokens, output_tokens,
        cache_read_tokens, cache_creation_tokens
      FROM spend_1h
      WHERE source = ${source} AND bucket >= ${fullStart} AND bucket < ${fullEnd}
      UNION ALL
      SELECT date_trunc(${tier.unit}::text, time, 'UTC'), developer, model, query_source, agent_name,
        skill_name, mcp_server, 1::bigint, coalesce(cost_usd_micros, 0), input_tokens::bigint,
        output_tokens::bigint, cache_read_tokens::bigint, cache_creation_tokens::bigint
      FROM api_requests
      WHERE source = ${source} AND time >= ${start} AND time < ${end}
        AND (time < ${fullStart} OR time >= ${fullEnd})
    )`
}
