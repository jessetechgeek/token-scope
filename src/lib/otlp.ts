import { badRequest } from './errors'
import { sha256, type ApiRequestRow } from './usage'

type Json = unknown
type Obj = Record<string, Json>

const isObj = (value: Json): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const arrayOf = (owner: Json, property: string): Json[] => {
  if (!isObj(owner)) return []
  const value = owner[property]
  return Array.isArray(value) ? value : []
}

const objectOf = (owner: Json, property: string): Json =>
  isObj(owner) ? owner[property] : undefined

function readAttributes(owner: Json): Map<string, Json> {
  const attributes = new Map<string, Json>()
  for (const attribute of arrayOf(owner, 'attributes')) {
    if (!isObj(attribute) || !('key' in attribute) || !('value' in attribute)) continue
    const { key, value } = attribute
    if (typeof key !== 'string' || !isObj(value)) throw badRequest('Invalid OTLP attribute.')
    const first = Object.values(value)[0]
    attributes.set(key, first)
  }
  return attributes
}

function text(attributes: Map<string, Json>, key: string): string | null {
  const value = attributes.get(key)
  if (typeof value !== 'string') return null
  if (value.length > 200) throw badRequest('An attribution value is too long.')
  return value.trim() === '' ? null : value
}

function parseInteger(value: Json): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Math.round(Number(value))
  }
  return null
}

function integer(attributes: Map<string, Json>, key: string): number | null {
  return attributes.has(key) ? parseInteger(attributes.get(key)) : null
}

function tokens(attributes: Map<string, Json>, key: string): number {
  const count = integer(attributes, key) ?? 0
  if (count < 0 || count > 2_147_483_647) throw badRequest('Invalid token or duration count.')
  return count
}

function number(attributes: Map<string, Json>, key: string): number | null {
  if (!attributes.has(key)) return null
  const value = attributes.get(key)
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(parsed)) throw badRequest('Invalid OTLP number.')
  return parsed
}

function validTime(date: Date): string {
  if (Number.isNaN(date.getTime()) || date.getTime() < 0 || date.getTime() > Date.now() + 5 * 60_000) {
    throw badRequest('API request timestamp is out of range.')
  }
  return date.toISOString()
}

function readTime(record: Json, attributes: Map<string, Json>): string {
  for (const field of ['timeUnixNano', 'observedTimeUnixNano']) {
    const raw = isObj(record) ? record[field] : undefined
    if (typeof raw === 'string' || typeof raw === 'number') {
      try {
        const nanoseconds = BigInt(raw)
        if (nanoseconds > 0n) return validTime(new Date(Number(nanoseconds / 1_000_000n)))
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode) throw error
      }
    }
  }
  const timestamp = text(attributes, 'event.timestamp')
  if (timestamp) return validTime(new Date(timestamp))
  throw badRequest('API request timestamps are required.')
}

function isApiRequest(record: Json, attributes: Map<string, Json>): boolean {
  if (text(attributes, 'event.name') === 'api_request') return true
  const body = objectOf(record, 'body')
  return isObj(body) && body.stringValue === 'claude_code.api_request'
}

export function mapApiRequests(root: Json, defaultDeveloper: string): ApiRequestRow[] {
  const rows: ApiRequestRow[] = []
  for (const resourceLogs of arrayOf(root, 'resourceLogs')) {
    const resource = readAttributes(objectOf(resourceLogs, 'resource'))
    const surfaceDeveloper = text(resource, 'service.name') === 'claude-code-desktop' ? `${defaultDeveloper}-desktop` : defaultDeveloper
    for (const scopeLogs of arrayOf(resourceLogs, 'scopeLogs')) {
      for (const record of arrayOf(scopeLogs, 'logRecords')) {
        const attributes = readAttributes(record)
        if (!isApiRequest(record, attributes)) continue

        let costMicros = integer(attributes, 'cost_usd_micros')
        if (costMicros === null) {
          const dollars = number(attributes, 'cost_usd')
          costMicros = dollars === null ? null : Math.round(dollars * 1_000_000)
        }
        if (costMicros !== null && costMicros < 0) throw badRequest('Negative costs are not accepted.')

        const eventId = text(attributes, 'event.id')
        rows.push({
          time: readTime(record, attributes),
          source: 'live',
          developer: text(attributes, 'developer') ?? text(resource, 'developer') ?? surfaceDeveloper,
          sessionId: text(attributes, 'session.id') ?? 'unknown',
          model: text(attributes, 'model') ?? 'unknown',
          querySource: text(attributes, 'query_source'),
          agentName: text(attributes, 'agent.name'),
          skillName: text(attributes, 'skill.name'),
          mcpServer: text(attributes, 'mcp_server.name'),
          inputTokens: tokens(attributes, 'input_tokens'),
          outputTokens: tokens(attributes, 'output_tokens'),
          cacheReadTokens: tokens(attributes, 'cache_read_tokens'),
          cacheCreationTokens: tokens(attributes, 'cache_creation_tokens'),
          costUsdMicros: costMicros,
          durationMs: tokens(attributes, 'duration_ms'),
          eventKey: eventId ? sha256(eventId) : null,
          costSource: costMicros === null ? 'unpriced' : 'reported',
          isSynthetic: false,
        })
      }
    }
  }
  return rows
}
