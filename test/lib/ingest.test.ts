import { test } from 'node:test'
import assert from 'node:assert/strict'
import { insertRequests } from '../../src/lib/ingest'
import { requestKey, type ApiRequestRow } from '../../src/lib/usage'
import { fakeSql } from '../helpers/fake-sql'

function row(overrides: Partial<ApiRequestRow> = {}): ApiRequestRow {
  return {
    time: '2026-11-09T10:00:00.000Z',
    source: 'live',
    developer: 'me',
    sessionId: 's1',
    model: 'claude-sonnet-5-5',
    querySource: null,
    agentName: null,
    skillName: null,
    mcpServer: null,
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsdMicros: 100,
    durationMs: 50,
    eventKey: null,
    costSource: 'reported',
    isSynthetic: false,
    ...overrides,
  }
}

test('inserts nothing and runs no query for an empty list', async () => {
  const sql = fakeSql()
  assert.equal(await insertRequests(sql, []), 0)
  assert.equal(sql.batches.length, 0)
})

test('collapses duplicate events inside one payload', async () => {
  const sql = fakeSql()
  const inserted = await insertRequests(sql, [row({ eventKey: 'a' }), row({ eventKey: 'a' }), row({ eventKey: 'b' })])
  assert.equal(inserted, 2)
  assert.deepEqual(sql.batches[0]?.map((r) => r.event_key), ['a', 'b'])
})

test('derives a stable key for events without an id', () => {
  assert.equal(requestKey(row()), requestKey(row()))
  assert.notEqual(requestKey(row()), requestKey(row({ inputTokens: 11 })))
  assert.equal(requestKey(row({ eventKey: 'given' })), 'given')
})

test('same key from a different source is not a duplicate', async () => {
  const sql = fakeSql()
  const inserted = await insertRequests(sql, [row({ eventKey: 'a', source: 'live' }), row({ eventKey: 'a', source: 'import' })])
  assert.equal(inserted, 2)
})

test('maps camelCase fields to snake_case columns', async () => {
  const sql = fakeSql()
  await insertRequests(sql, [row({ eventKey: 'k', sessionId: 'sess', cacheReadTokens: 7, costUsdMicros: null })])
  const [mapped] = sql.batches[0] ?? []
  assert.equal(mapped?.session_id, 'sess')
  assert.equal(mapped?.cache_read_tokens, 7)
  assert.equal(mapped?.cost_usd_micros, null)
  assert.equal(mapped?.is_synthetic, false)
})

test('splits large payloads into batches of 500', async () => {
  const sql = fakeSql()
  const rows = Array.from({ length: 1200 }, (_, i) => row({ eventKey: `k${i}` }))
  const inserted = await insertRequests(sql, rows)
  assert.equal(inserted, 1200)
  assert.deepEqual(sql.batches.map((b) => b.length), [500, 500, 200])
})

test('propagates database failures', async () => {
  const sql = fakeSql({ failWith: new Error('db down') })
  await assert.rejects(insertRequests(sql, [row({ eventKey: 'a' })]), /db down/)
})
