import { createHash, timingSafeEqual } from 'node:crypto'
import fp from 'fastify-plugin'

const digest = (value: string) => createHash('sha256').update(value).digest()

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

export default fp(async (fastify) => {
  const expected = process.env.TOKENSCOPE_API_TOKEN

  fastify.addHook('onRequest', async (request, reply) => {
    const path = request.url
    if (!path.startsWith('/api') && !path.startsWith('/v1')) return

    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        return reply.code(503).send({ error: 'TOKENSCOPE_API_TOKEN is not configured.' })
      }
      return
    }

    const token = presentedToken(request.headers.authorization)
    if (token === null || !timingSafeEqual(digest(token), digest(expected))) {
      return reply
        .code(401)
        .header('WWW-Authenticate', 'Basic realm="TokenScope"')
        .send({ error: 'Unauthorized.' })
    }
  })
}, { name: 'auth' })
