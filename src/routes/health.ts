import type { FastifyPluginAsync } from 'fastify'

const health: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (_request, reply) => {
    try {
      await fastify.sql`SELECT 1`
      return { status: 'healthy' }
    } catch {
      return reply.code(503).send({ status: 'database-unavailable' })
    }
  })
}

export default health
