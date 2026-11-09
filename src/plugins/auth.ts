import fp from 'fastify-plugin'
import { hasValidSession, hasValidToken } from '../lib/session'

const PUBLIC_PATHS = new Set(['/api/login', '/api/logout', '/api/session'])

export default fp(async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? ''
    const isApi = path.startsWith('/api')
    const isIngest = path.startsWith('/v1')
    if ((!isApi && !isIngest) || PUBLIC_PATHS.has(path)) return

    const expected = process.env.TOKENSCOPE_API_TOKEN
    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        return reply.code(503).send({ error: 'TOKENSCOPE_API_TOKEN is not configured.' })
      }
      return
    }

    const bearer = hasValidToken(request.headers.authorization, expected)
    const session = isApi && hasValidSession(request.headers.cookie, expected)
    if (!bearer && !session) {
      return reply.code(401).send({ error: 'Unauthorized.' })
    }
  })
}, { name: 'auth' })
