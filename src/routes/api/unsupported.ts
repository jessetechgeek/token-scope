import type { FastifyPluginAsync } from 'fastify'

const unsupported: FastifyPluginAsync = async (fastify) => {
  const notPorted = async (_request: unknown, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) =>
    reply.code(501).send({ error: 'Not available in the Node port yet.' })

  fastify.post('/local-usage/sync', notPorted)
  fastify.post('/history/preview', notPorted)
  fastify.post('/history/import', notPorted)
  fastify.post('/demo/seed', notPorted)
  fastify.post('/demo/pulse', notPorted)
  fastify.post('/bench', notPorted)
}

export default unsupported
