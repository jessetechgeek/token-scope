import type { FastifyPluginAsync } from 'fastify'
import { badRequest } from '../../lib/errors'
import { insertRequests } from '../../lib/ingest'
import { mapApiRequests } from '../../lib/otlp'

const logs: FastifyPluginAsync = async (fastify) => {
  fastify.post('/logs', { bodyLimit: 4 * 1024 * 1024 }, async (request) => {
    const body = request.body as { resourceLogs?: unknown } | null
    if (!body || typeof body !== 'object' || !Array.isArray(body.resourceLogs)) {
      throw badRequest('Expected an OTLP resourceLogs array.')
    }

    const developer = process.env.TOKENSCOPE_DEFAULT_DEVELOPER ?? 'me'
    const rows = mapApiRequests(body, developer)
    await insertRequests(fastify.sql, rows)
    return {}
  })
}

export default logs
