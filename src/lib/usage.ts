import { createHash } from 'node:crypto'

export interface ApiRequestRow {
  time: string
  source: string
  developer: string
  sessionId: string
  model: string
  querySource: string | null
  agentName: string | null
  skillName: string | null
  mcpServer: string | null
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costUsdMicros: number | null
  durationMs: number | null
  eventKey: string | null
  costSource: string
  isSynthetic: boolean
}

export const ACTIVE_SOURCES = ['live'] as const
export type UsageSource = (typeof ACTIVE_SOURCES)[number]

export function isActiveSource(source: string): source is UsageSource {
  return (ACTIVE_SOURCES as readonly string[]).includes(source)
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function requestKey(row: ApiRequestRow): string {
  return row.eventKey ?? sha256(JSON.stringify({ ...row, eventKey: null }))
}
