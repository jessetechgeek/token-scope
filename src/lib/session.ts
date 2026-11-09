import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'ts_session'
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

const digest = (value: string) => createHash('sha256').update(value).digest()

export function passwordMatches(candidate: string, expected: string): boolean {
  return timingSafeEqual(digest(candidate), digest(expected))
}

const sign = (token: string, payload: string) =>
  createHmac('sha256', createHmac('sha256', token).update('tokenscope-session-v1').digest())
    .update(payload)
    .digest('base64url')

export function createSession(token: string, now = Date.now()): string {
  const payload = String(now + SESSION_MAX_AGE_SECONDS * 1000)
  return `${payload}.${sign(token, payload)}`
}

export function verifySession(token: string, value: string | undefined, now = Date.now()): boolean {
  if (!value) return false
  const separator = value.indexOf('.')
  if (separator < 1) return false
  const payload = value.slice(0, separator)
  const expires = Number(payload)
  if (!Number.isFinite(expires) || expires <= now) return false

  const given = Buffer.from(value.slice(separator + 1))
  const expected = Buffer.from(sign(token, payload))
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator !== -1 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim()
    }
  }
  return undefined
}

export function sessionCookie(value: string, options: { secure: boolean, maxAge: number }): string {
  const attributes = [`${SESSION_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${options.maxAge}`]
  if (options.secure) attributes.push('Secure')
  return attributes.join('; ')
}

function presentedToken(header: string | undefined): string | null {
  if (!header) return null
  if (header.startsWith('Bearer ')) return header.slice(7)
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
    const separator = decoded.indexOf(':')
    return separator === -1 ? decoded : decoded.slice(separator + 1)
  }
  return null
}

export function hasValidToken(authorization: string | undefined, token: string): boolean {
  const presented = presentedToken(authorization)
  return presented !== null && passwordMatches(presented, token)
}

export function hasValidSession(cookieHeader: string | undefined, token: string): boolean {
  return verifySession(token, readCookie(cookieHeader, SESSION_COOKIE))
}
