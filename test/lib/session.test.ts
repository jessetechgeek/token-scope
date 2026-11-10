import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSession,
  hasValidSession,
  hasValidToken,
  passwordMatches,
  readCookie,
  sessionCookie,
  verifySession,
} from '../../src/lib/session'

const TOKEN = 'a-long-random-token'
const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`

test('passwordMatches accepts only the exact value', () => {
  assert.equal(passwordMatches(TOKEN, TOKEN), true)
  assert.equal(passwordMatches(`${TOKEN} `, TOKEN), false)
  assert.equal(passwordMatches('', TOKEN), false)
})

test('a fresh session verifies and expires after the max age', () => {
  const now = Date.now()
  const session = createSession(TOKEN, now)
  assert.equal(verifySession(TOKEN, session, now + 1000), true)
  assert.equal(verifySession(TOKEN, session, now + SESSION_MAX_AGE_SECONDS * 1000), false)
})

test('a session is bound to the token that signed it', () => {
  const session = createSession(TOKEN)
  assert.equal(verifySession('another-token', session), false)
})

test('tampered, malformed and missing sessions are rejected', () => {
  const session = createSession(TOKEN)
  const [payload, signature] = session.split('.') as [string, string]
  const extended = String(Number(payload) + 86_400_000)

  assert.equal(verifySession(TOKEN, `${extended}.${signature}`), false)
  assert.equal(verifySession(TOKEN, `${payload}.${signature.slice(0, -1)}`), false)
  assert.equal(verifySession(TOKEN, `abc.${signature}`), false)
  assert.equal(verifySession(TOKEN, '.nosignature'), false)
  assert.equal(verifySession(TOKEN, 'nodot'), false)
  assert.equal(verifySession(TOKEN, ''), false)
  assert.equal(verifySession(TOKEN, undefined), false)
})

test('readCookie finds a cookie among several and ignores the rest', () => {
  assert.equal(readCookie('a=1; ts_session=xyz; b=2', 'ts_session'), 'xyz')
  assert.equal(readCookie('ts_session=a=b', 'ts_session'), 'a=b')
  assert.equal(readCookie('other=1', 'ts_session'), undefined)
  assert.equal(readCookie('xts_session=1', 'ts_session'), undefined)
  assert.equal(readCookie(undefined, 'ts_session'), undefined)
})

test('sessionCookie is HttpOnly and only Secure when asked', () => {
  const plain = sessionCookie('v', { secure: false, maxAge: 60 })
  assert.match(plain, new RegExp(`^${SESSION_COOKIE}=v; `))
  assert.match(plain, /HttpOnly/)
  assert.match(plain, /SameSite=Lax/)
  assert.match(plain, /Max-Age=60/)
  assert.doesNotMatch(plain, /Secure/)
  assert.match(sessionCookie('v', { secure: true, maxAge: 60 }), /; Secure$/)
})

test('hasValidToken reads Bearer and Basic headers', () => {
  assert.equal(hasValidToken(`Bearer ${TOKEN}`, TOKEN), true)
  assert.equal(hasValidToken(basic('anything', TOKEN), TOKEN), true)
  assert.equal(hasValidToken(`Basic ${Buffer.from(TOKEN).toString('base64')}`, TOKEN), true)
  assert.equal(hasValidToken('Bearer wrong', TOKEN), false)
  assert.equal(hasValidToken(basic('user', 'wrong'), TOKEN), false)
  assert.equal(hasValidToken(`bearer ${TOKEN}`, TOKEN), false)
  assert.equal(hasValidToken(TOKEN, TOKEN), false)
  assert.equal(hasValidToken(undefined, TOKEN), false)
})

test('hasValidSession reads the session from a cookie header', () => {
  const cookie = `x=1; ${SESSION_COOKIE}=${createSession(TOKEN)}`
  assert.equal(hasValidSession(cookie, TOKEN), true)
  assert.equal(hasValidSession(cookie, 'another-token'), false)
  assert.equal(hasValidSession(undefined, TOKEN), false)
})
