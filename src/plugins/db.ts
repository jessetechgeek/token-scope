import fp from 'fastify-plugin'
import postgres, { type Sql } from 'postgres'

declare module 'fastify' {
  interface FastifyInstance {
    sql: Sql
  }
}

export default fp(async (fastify) => {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required.')

  const sql = postgres(url, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
    transform: postgres.camel,
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (value: unknown) => String(value),
        parse: (value: string) => Number(value),
      },
    },
  })

  fastify.decorate('sql', sql)
  fastify.addHook('onClose', async () => {
    await sql.end({ timeout: 5 })
  })
}, { name: 'db' })
