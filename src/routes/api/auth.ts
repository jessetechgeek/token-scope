import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import {
  SESSION_MAX_AGE_SECONDS,
  createSession,
  hasValidSession,
  hasValidToken,
  passwordMatches,
  sessionCookie,
} from '../../lib/session'

const FAILED_LOGIN_DELAY_MS = 500

const isSecure = (request: FastifyRequest) =>
  process.env.NODE_ENV === 'production' || request.headers['x-forwarded-proto'] === 'https'

const auth: FastifyPluginAsync = async (fastify) => {
  fastify.get('/session', async (request) => {
    const token = process.env.TOKENSCOPE_API_TOKEN
    if (!token) return { authRequired: false, authenticated: true }
    const authenticated = hasValidSession(request.headers.cookie, token)
      || hasValidToken(request.headers.authorization, token)
    return { authRequired: true, authenticated }
  })

  fastify.post<{ Body: { password: string } }>('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['password'],
        properties: { password: { type: 'string', minLength: 1, maxLength: 512 } },
      },
    },
  }, async (request, reply) => {
    const token = process.env.TOKENSCOPE_API_TOKEN
    if (!token) {
      return reply.code(503).send({ error: 'TOKENSCOPE_API_TOKEN is not configured.' })
    }

    if (!passwordMatches(request.body.password, token)) {
      await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS))
      return reply.code(401).send({ error: 'Incorrect password.' })
    }

    reply.header('Set-Cookie', sessionCookie(createSession(token), {
      secure: isSecure(request),
      maxAge: SESSION_MAX_AGE_SECONDS,
    }))
    return { authenticated: true }
  })

  fastify.post('/logout', async (request, reply) => {
    reply.header('Set-Cookie', sessionCookie('', { secure: isSecure(request), maxAge: 0 }))
    return { authenticated: false }
  })
}

export default auth
