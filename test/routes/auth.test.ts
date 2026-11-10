import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import authPlugin from '../../src/plugins/auth'
import authRoutes from '../../src/routes/api/auth'
import logsRoute from '../../src/routes/v1/logs'
import healthRoute from '../../src/routes/health'
import type _db from '../../src/plugins/db'
import { fakeSql } from '../helpers/fake-sql'

const TOKEN = 'a-long-random-token'
const original = { ...process.env }

beforeEach(() => {
  process.env.TOKENSCOPE_API_TOKEN = TOKEN
  process.env.NODE_ENV = 'test'
})

afterEach(() => {
  process.env = { ...original }
})

async function build(t: { after: (fn: () => unknown) => void }, sql = fakeSql()) {
  const app = Fastify()
  app.decorate('sql', sql)
  await app.register(authPlugin)
  await app.register(authRoutes, { prefix: '/api' })
  await app.register(logsRoute, { prefix: '/v1' })
  await app.register(healthRoute)
  app.get('/api/summary', async () => ({ ok: true }))
  t.after(() => app.close())
  return app
}

const cookieFrom = (setCookie: string | string[] | undefined) =>
  String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0] as string

const emptyPayload = { resourceLogs: [] }

test('api rejects requests without credentials', async (t) => {
  const app = await build(t)
  const res = await app.inject({ method: 'GET', url: '/api/summary' })
  assert.equal(res.statusCode, 401)
})

test('api accepts a bearer token and rejects a wrong one', async (t) => {
  const app = await build(t)
  const ok = await app.inject({ method: 'GET', url: '/api/summary', headers: { authorization: `Bearer ${TOKEN}` } })
  const bad = await app.inject({ method: 'GET', url: '/api/summary', headers: { authorization: 'Bearer nope' } })
  assert.equal(ok.statusCode, 200)
  assert.equal(bad.statusCode, 401)
})

test('query strings do not bypass auth or the public path list', async (t) => {
  const app = await build(t)
  const res = await app.inject({ method: 'GET', url: '/api/summary?x=/api/login' })
  assert.equal(res.statusCode, 401)
})

test('login sets a session cookie that unlocks the api', async (t) => {
  const app = await build(t)
  const login = await app.inject({ method: 'POST', url: '/api/login', payload: { password: TOKEN } })
  assert.equal(login.statusCode, 200)
  assert.deepEqual(login.json(), { authenticated: true })
  const setCookie = String(login.headers['set-cookie'])
  assert.match(setCookie, /HttpOnly/)
  assert.doesNotMatch(setCookie, /Secure/)

  const res = await app.inject({ method: 'GET', url: '/api/summary', headers: { cookie: cookieFrom(login.headers['set-cookie']) } })
  assert.equal(res.statusCode, 200)
})

test('login marks the cookie Secure behind an https proxy', async (t) => {
  const app = await build(t)
  const login = await app.inject({
    method: 'POST', url: '/api/login', payload: { password: TOKEN }, headers: { 'x-forwarded-proto': 'https' },
  })
  assert.match(String(login.headers['set-cookie']), /Secure/)
})

test('login rejects a wrong password without setting a cookie', async (t) => {
  const app = await build(t)
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'wrong' } })
  assert.equal(res.statusCode, 401)
  assert.equal(res.headers['set-cookie'], undefined)
})

test('login validates the body', async (t) => {
  const app = await build(t)
  const missing = await app.inject({ method: 'POST', url: '/api/login', payload: {} })
  const empty = await app.inject({ method: 'POST', url: '/api/login', payload: { password: '' } })
  const huge = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'x'.repeat(513) } })
  assert.equal(missing.statusCode, 400)
  assert.equal(empty.statusCode, 400)
  assert.equal(huge.statusCode, 400)
})

test('session endpoint reports state without needing auth', async (t) => {
  const app = await build(t)
  const anonymous = await app.inject({ method: 'GET', url: '/api/session' })
  assert.deepEqual(anonymous.json(), { authRequired: true, authenticated: false })

  const login = await app.inject({ method: 'POST', url: '/api/login', payload: { password: TOKEN } })
  const signedIn = await app.inject({ method: 'GET', url: '/api/session', headers: { cookie: cookieFrom(login.headers['set-cookie']) } })
  assert.deepEqual(signedIn.json(), { authRequired: true, authenticated: true })
})

test('logout clears the cookie', async (t) => {
  const app = await build(t)
  const res = await app.inject({ method: 'POST', url: '/api/logout' })
  assert.deepEqual(res.json(), { authenticated: false })
  assert.match(String(res.headers['set-cookie']), /Max-Age=0/)
})

test('a session cookie does not authorise ingest', async (t) => {
  const app = await build(t)
  const login = await app.inject({ method: 'POST', url: '/api/login', payload: { password: TOKEN } })
  const res = await app.inject({
    method: 'POST', url: '/v1/logs', payload: emptyPayload, headers: { cookie: cookieFrom(login.headers['set-cookie']) },
  })
  assert.equal(res.statusCode, 401)
})

test('ingest requires the token and accepts a valid payload', async (t) => {
  const app = await build(t)
  const anonymous = await app.inject({ method: 'POST', url: '/v1/logs', payload: emptyPayload })
  const authed = await app.inject({
    method: 'POST', url: '/v1/logs', payload: emptyPayload, headers: { authorization: `Bearer ${TOKEN}` },
  })
  assert.equal(anonymous.statusCode, 401)
  assert.equal(authed.statusCode, 200)
})

test('ingest rejects a body without resourceLogs', async (t) => {
  const app = await build(t)
  const headers = { authorization: `Bearer ${TOKEN}` }
  const wrongShape = await app.inject({ method: 'POST', url: '/v1/logs', payload: { resourceLogs: 'x' }, headers })
  const missing = await app.inject({ method: 'POST', url: '/v1/logs', payload: {}, headers })
  assert.equal(wrongShape.statusCode, 400)
  assert.equal(missing.statusCode, 400)
})

test('ingest stores mapped events under the default developer', async (t) => {
  process.env.TOKENSCOPE_DEFAULT_DEVELOPER = 'jesse'
  const sql = fakeSql()
  const app = await build(t, sql)
  const timeUnixNano = String(BigInt(Date.now() - 1000) * 1_000_000n)
  const payload = {
    resourceLogs: [{ scopeLogs: [{ logRecords: [{
      timeUnixNano,
      attributes: [
        { key: 'event.name', value: { stringValue: 'api_request' } },
        { key: 'event.id', value: { stringValue: 'e1' } },
      ],
    }] }] }],
  }
  const res = await app.inject({ method: 'POST', url: '/v1/logs', payload, headers: { authorization: `Bearer ${TOKEN}` } })
  assert.equal(res.statusCode, 200)
  assert.equal(sql.batches[0]?.[0]?.developer, 'jesse')
  assert.equal(String(sql.batches[0]?.[0]?.event_key).length, 64)
})

test('without a configured token dev mode is open and production refuses', async (t) => {
  delete process.env.TOKENSCOPE_API_TOKEN
  const app = await build(t)
  const open = await app.inject({ method: 'GET', url: '/api/summary' })
  assert.equal(open.statusCode, 200)
  const session = await app.inject({ method: 'GET', url: '/api/session' })
  assert.deepEqual(session.json(), { authRequired: false, authenticated: true })
  const login = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'x' } })
  assert.equal(login.statusCode, 503)

  process.env.NODE_ENV = 'production'
  const closed = await app.inject({ method: 'GET', url: '/api/summary' })
  assert.equal(closed.statusCode, 503)
  const closedIngest = await app.inject({ method: 'POST', url: '/v1/logs', payload: emptyPayload })
  assert.equal(closedIngest.statusCode, 503)
})

test('health is public and reports database failures', async (t) => {
  const healthy = await build(t)
  assert.deepEqual((await healthy.inject({ method: 'GET', url: '/health' })).json(), { status: 'healthy' })

  const broken = await build(t, fakeSql({ failWith: new Error('down') }))
  const res = await broken.inject({ method: 'GET', url: '/health' })
  assert.equal(res.statusCode, 503)
  assert.deepEqual(res.json(), { status: 'database-unavailable' })
})
