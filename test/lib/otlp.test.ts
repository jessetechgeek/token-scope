import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapApiRequests } from '../../src/lib/otlp'
import { ceilTime, floorTime } from '../../src/lib/buckets'

const attr = (key: string, value: Record<string, unknown>) => ({ key, value })

function payload(attributes: ReturnType<typeof attr>[], timeUnixNano = String(BigInt(Date.now() - 1000) * 1_000_000n)) {
  return { resourceLogs: [{ scopeLogs: [{ logRecords: [{ timeUnixNano, attributes }] }] }] }
}

test('maps an api_request event', () => {
  const rows = mapApiRequests(payload([
    attr('event.name', { stringValue: 'api_request' }),
    attr('event.id', { stringValue: 'abc' }),
    attr('model', { stringValue: 'claude-sonnet-5-5' }),
    attr('session.id', { stringValue: 's1' }),
    attr('input_tokens', { intValue: '120' }),
    attr('output_tokens', { intValue: 30 }),
    attr('cost_usd', { doubleValue: 0.0123 }),
  ]), 'me')

  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.developer, 'me')
  assert.equal(rows[0]?.inputTokens, 120)
  assert.equal(rows[0]?.costUsdMicros, 12300)
  assert.equal(rows[0]?.costSource, 'reported')
  assert.equal(rows[0]?.eventKey?.length, 64)
})

test('labels desktop events without a developer after the default developer', () => {
  const timeUnixNano = String(BigInt(Date.now() - 1000) * 1_000_000n)
  const body = (resource: ReturnType<typeof attr>[]) => ({ resourceLogs: [{ resource: { attributes: resource }, scopeLogs: [{ logRecords: [{ timeUnixNano, attributes: [attr('event.name', { stringValue: 'api_request' })] }] }] }] })
  const desktop = attr('service.name', { stringValue: 'claude-code-desktop' })

  assert.equal(mapApiRequests(body([desktop]), 'jesse')[0]?.developer, 'jesse-desktop')
  assert.equal(mapApiRequests(body([desktop, attr('developer', { stringValue: 'sam' })]), 'jesse')[0]?.developer, 'sam')
  assert.equal(mapApiRequests(body([attr('service.name', { stringValue: 'claude-code' })]), 'jesse')[0]?.developer, 'jesse')
})

test('ignores other events and marks missing cost unpriced', () => {
  const other = mapApiRequests(payload([attr('event.name', { stringValue: 'tool_result' })]), 'me')
  assert.equal(other.length, 0)

  const unpriced = mapApiRequests(payload([attr('event.name', { stringValue: 'api_request' })]), 'me')
  assert.equal(unpriced[0]?.costUsdMicros, null)
  assert.equal(unpriced[0]?.costSource, 'unpriced')
})

test('rejects negative costs and future timestamps', () => {
  assert.throws(() => mapApiRequests(payload([
    attr('event.name', { stringValue: 'api_request' }),
    attr('cost_usd_micros', { intValue: '-1' }),
  ]), 'me'))

  const future = String(BigInt(Date.now() + 3_600_000) * 1_000_000n)
  assert.throws(() => mapApiRequests(payload([attr('event.name', { stringValue: 'api_request' })], future), 'me'))
})

test('bucket floor and ceil use UTC boundaries', () => {
  const t = new Date('2026-11-09T10:30:00Z')
  assert.equal(floorTime(t, 3600).toISOString(), '2026-11-09T10:00:00.000Z')
  assert.equal(ceilTime(t, 3600).toISOString(), '2026-11-09T11:00:00.000Z')
  assert.equal(ceilTime(floorTime(t, 86400), 86400).toISOString(), '2026-11-09T00:00:00.000Z')
})
